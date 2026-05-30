const axios = require('axios');
const fs = require('fs').promises;
const sessionService = require('../services/sessionService');
const { resolveFaultCasesFile } = require('../utils/faultCasesFile');
const { generateEmbedding } = require('../services/embeddingService');
const { searchSimilarCases } = require('../services/vectorService');

const FAULT_CASES_FILE = resolveFaultCasesFile();

// 加载故障案例库
let faultCases = [];
let faultCasesLoading = null;
const loadFaultCases = async () => {
  // 如果正在加载，返回同一个 Promise
  if (faultCasesLoading) return faultCasesLoading;
  
  faultCasesLoading = (async () => {
    try {
      const data = await fs.readFile(
        FAULT_CASES_FILE,
        'utf-8'
      );
      const allCases = JSON.parse(data);
      // 只加载已审核通过的案例
      faultCases = allCases.filter(c => c.reviewStatus === 'approved');
      console.log(`Loaded ${faultCases.length} approved fault cases (total: ${allCases.length})`);
      return faultCases;
    } catch (error) {
      console.error('Error loading fault cases:', error);
      faultCases = [];
      return [];
    } finally {
      faultCasesLoading = null;
    }
  })();
  
  return faultCasesLoading;
};

// 初始化时加载
loadFaultCases();

// AI诊断（Phase 1: 语义检索增强版）
exports.diagnose = async (req, res) => {
  try {
    const { symptom, model, context } = req.body;

    if (!symptom) {
      return res.status(400).json({ error: '请输入故障现象' });
    }

    // 确保案例库已加载
    if (faultCases.length === 0) {
      await loadFaultCases();
    }

    console.log('Input symptom:', symptom);

    // ========== 1. 语义检索（Phase 1 新增）==========
    let semanticMatches = [];
    let matchedResults = [];
    let useSemanticSearch = false;

    try {
      // 生成用户输入的 embedding
      const queryEmbedding = await generateEmbedding(symptom);
      // 语义检索
      semanticMatches = await searchSimilarCases(queryEmbedding, 5);

      if (semanticMatches.length > 0) {
        useSemanticSearch = true;
        console.log(`[Semantic] Found ${semanticMatches.length} matches:`);
        semanticMatches.forEach(m => {
          console.log(`  [${(m.similarity * 100).toFixed(0)}%] ${m.case_id}: ${m.content.substring(0, 50)}...`);
        });

        // 将语义检索结果转为 matchedResults 格式（兼容原有逻辑）
        matchedResults = semanticMatches.map(m => {
          const caseData = faultCases.find(c => c.id === m.case_id);
          return {
            case: caseData || { id: m.case_id, symptom: m.content, faultType: m.metadata?.faultType || '未知' },
            score: m.similarity,
            reason: `语义相似度: ${(m.similarity * 100).toFixed(0)}%`
          };
        }).filter(r => r.case); // 过滤掉找不到的案例
      }
    } catch (semanticErr) {
      console.warn('[Semantic] Semantic search failed, falling back to keyword:', semanticErr.message);
    }

    // ========== 2. 关键词匹配 Fallback ==========
    if (matchedResults.length === 0) {
      matchedResults = matchCasesSmart(symptom, faultCases);
      console.log(`[Keyword] Smart matched ${matchedResults.length} cases`);
    }

    if (matchedResults.length > 0) {
      matchedResults.slice(0, 5).forEach(r => {
        console.log(`  [${(r.score * 100).toFixed(0)}%] ${r.case.id}: ${r.case.symptom} (${r.reason})`);
      });
    } else {
      console.log('No cases matched');
    }

    // ========== 3. 调用AI API（带推理链 CoT）==========
    const aiResponse = await callBaiduAI(symptom, model, context, matchedResults);

    // ========== 4. 计算置信度 ==========
    const confidence = calculateConfidence(symptom, matchedResults, aiResponse);

    // ========== 5. 返回诊断结果 ==========
    const diagnosisId = `diag_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // 自动埋点：诊断完成事件
    try {
      const { run } = require('../db');
      await run(
        "INSERT INTO events (event, data, ip) VALUES (?, ?, ?)",
        [
          'diagnosis_complete',
          JSON.stringify({
            diagnosis_id: diagnosisId,
            device_type: req.body.deviceType || '',
            fault_type: req.body.faultType || '',
            steps_count: aiResponse.steps?.length || 0,
            difficulty: aiResponse.difficulty || '1',
            search_method: useSemanticSearch ? 'semantic' : 'keyword',
            confidence: Math.round(confidence * 100) / 100
          }),
          req.ip || ''
        ]
      );
    } catch (trackErr) {
      console.warn('[Track] diagnosis_complete event failed:', trackErr.message);
    }

    res.json({
      success: true,
      diagnosisId,
      diagnosis: aiResponse,
      matchedCasesCount: matchedResults.length,
      topMatchScore: matchedResults[0]?.score || 0,
      semanticMatches: semanticMatches.map(m => ({
        caseId: m.case_id,
        content: m.content.substring(0, 100),
        similarity: Math.round(m.similarity * 100) / 100,
        metadata: m.metadata
      })),
      confidence: Math.round(confidence * 100) / 100,
      searchMethod: useSemanticSearch ? 'semantic' : 'keyword',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Diagnosis error:', error);
    res.status(500).json({ error: '诊断失败，请稍后重试' });
  }
};

/**
 * 计算诊断置信度
 * 基于：案例匹配质量 + AI输出完整性 + 症状描述丰富度
 */
function calculateConfidence(symptom, matchedResults, aiResponse) {
  let score = 0.5; // 基础分

  // 1. 案例匹配质量（最高+0.3）
  if (matchedResults.length > 0) {
    const topScore = matchedResults[0].score;
    if (topScore >= 0.9) score += 0.3;
    else if (topScore >= 0.7) score += 0.2;
    else if (topScore >= 0.5) score += 0.1;
  }

  // 2. AI输出完整性（最高+0.1）
  if (aiResponse.possibleCauses && aiResponse.possibleCauses.length >= 3) {
    score += 0.05;
  }
  if (aiResponse.steps && aiResponse.steps.length >= 3) {
    score += 0.05;
  }

  // 3. 症状描述丰富度（最高+0.1）
  const symptomLen = symptom.length;
  if (symptomLen >= 20) score += 0.1;
  else if (symptomLen >= 10) score += 0.05;

  return Math.min(score, 1.0);
}

// ========== 同义词映射表 ==========
const SYNONYM_MAP = {
  // 故障现象同义词
  '无法起飞': ['飞不起来', '不能起飞', '起飞失败', '启动不了', '不能启动'],
  'GPS信号弱': ['定位不准', '搜星少', 'GPS丢失', '无GPS', '卫星信号差'],
  '电机不转': ['马达不转', '螺旋桨不动', '电机卡住', '电机故障'],
  '图传黑屏': ['画面黑屏', '无画面', '屏幕黑', '显示黑屏', '图传没画面'],
  '云台卡住': ['云台不动', '云台卡顿', '云台异常', '云台抖动'],
  '电机异响': ['电机有声音', '马达异响', '电机噪音', '转动异响'],
  '飞行不稳': ['飞行晃动', '抖动严重', '飞行飘逸', '姿态不稳'],
  '图传延迟': ['画面延迟', '图传卡顿', '画面卡顿', '传输延迟'],
  '返航失败': ['不能返航', '返航异常', '自动返航失败'],
  '电池鼓包': ['电池膨胀', '电池变形', '电池胀气'],
  '续航短': ['电量消耗快', '飞不久', '电池不耐用'],
  '避障异常': ['避障失效', '障碍物检测失败', '避障不工作'],
  '信号中断': ['断连', '失联', '连接断开', '遥控失联'],
  '掉高': ['高度下降', '自动降落', '掉高度'],
  '无法充电': ['充不进电', '充电失败', '电池充不上'],
  '遥控器': ['遥控', '手柄', '控'],
  '指南针': ['磁罗盘', '罗盘'],
  'IMU': ['惯性测量单元'],
};

// 计算编辑距离（Levenshtein Distance）
function levenshteinDistance(a, b) {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      matrix[i][j] = b[i - 1] === a[j - 1]
        ? matrix[i - 1][j - 1]
        : Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
    }
  }
  return matrix[b.length][a.length];
}

// 计算相似度（0-1，1为完全匹配）
function similarity(a, b) {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  const distance = levenshteinDistance(a, b);
  return 1 - distance / maxLen;
}

// 扩展关键词（包含同义词）
function expandKeywords(keywords) {
  const expanded = new Set(keywords);
  for (const keyword of keywords) {
    // 查找该关键词的同义词
    for (const [canonical, synonyms] of Object.entries(SYNONYM_MAP)) {
      if (canonical === keyword || synonyms.includes(keyword)) {
        expanded.add(canonical);
        synonyms.forEach(s => expanded.add(s));
      }
    }
  }
  return Array.from(expanded);
}

// 智能匹配案例（含模糊匹配和同义词扩展）
function matchCasesSmart(symptom, cases) {
  const results = [];
  
  for (const c of cases) {
    let maxScore = 0;
    let matchReason = '';
    
    // 1. 精确包含匹配（最高分）
    for (const keyword of c.keywords) {
      if (symptom.includes(keyword)) {
        maxScore = Math.max(maxScore, 1.0);
        matchReason = `精确匹配: "${keyword}"`;
      }
      
      // 2. 同义词扩展匹配
      const expanded = expandKeywords([keyword]);
      for (const syn of expanded) {
        if (syn !== keyword && symptom.includes(syn)) {
          maxScore = Math.max(maxScore, 0.9);
          matchReason = `同义词匹配: "${keyword}"→"${syn}"`;
        }
      }
    }
    
    // 3. 模糊匹配（编辑距离，用于处理错别字/近似表达）
    if (maxScore < 0.7) {
      for (const keyword of c.keywords) {
        // 检查 symptom 中每个词与 keyword 的相似度
        const symptomWords = symptom.split(/[\s,，.。!！?？]+/);
        for (const word of symptomWords) {
          if (word.length >= 2 && keyword.length >= 2) {
            const sim = similarity(word, keyword);
            if (sim >= 0.75) {
              maxScore = Math.max(maxScore, sim * 0.8);
              matchReason = `模糊匹配: "${word}"≈"${keyword}" (相似度${(sim*100).toFixed(0)}%)`;
            }
          }
        }
      }
    }
    
    if (maxScore > 0) {
      results.push({ case: c, score: maxScore, reason: matchReason });
    }
  }
  
  // 按匹配分数降序排序
  results.sort((a, b) => b.score - a.score);
  
  return results;
}

// ========== 模型配置（从环境变量读取，不再硬编码） ==========
function getModelConfig() {
  const kimiModel = process.env.KIMI_MODEL || 'moonshot-v1-8k';
  // kimi-for-coding 是代码专用模型，不适合故障诊断对话，回退到通用模型
  const effectiveKimiModel = kimiModel === 'kimi-for-coding' ? 'moonshot-v1-8k' : kimiModel;
  
  return {
    kimi: {
      apiKey: process.env.KIMI_API_KEY,
      apiBase: process.env.KIMI_API_BASE || 'https://api.moonshot.cn/v1',
      model: effectiveKimiModel,
      visionModel: process.env.KIMI_VISION_MODEL || 'moonshot-v1-8k'
    },
    qwen: {
      apiKey: process.env.QWEN_API_KEY,
      apiBase: process.env.QWEN_API_BASE || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      model: process.env.QWEN_MODEL || 'qwen-plus',
      visionModel: process.env.QWEN_VISION_MODEL || 'qwen-vl-plus'
    },
    baidu: {
      apiKey: process.env.BAIDU_API_KEY,
      secretKey: process.env.BAIDU_SECRET_KEY
    }
  };
}

// 提取关键词
function extractKeywords(text) {
  const keywords = [];
  const patterns = [
    // 故障现象
    '无法起飞', 'GPS信号弱', '电机不转', '图传黑屏', '云台卡住',
    '电池鼓包', '续航短', '避障异常', '喷头电机异常', '管路堵塞',
    '电机异响', '飞行不稳', '图传延迟', '返航失败', '指南针异常',
    'IMU异常', '电池无法充电', '飞行姿态异常', '掉高', '信号中断',
    // 大疆品牌
    'Mavic', 'Air', 'Mini', 'Phantom', 'T30', 'T40', 'Matrice', 'Inspire',
    // 道通品牌
    'EVO', 'Nano', 'Lite', 'Autel', '道通',
    // 极飞品牌
    'XAG', '极飞', 'P100', 'P80', 'V40', 'P系列',
    // 零零科技
    'Hover', 'Camera', '零零', 'ZeroTech',
    // 普宙
    'GDU', 'Byrd', '普宙',
    // 哈博森
    'Hubsan', 'Zino', '哈博森',
    // 亿航
    'EHang', '亿航', '载人'
  ];
  
  patterns.forEach(pattern => {
    if (text.includes(pattern)) {
      keywords.push(pattern);
    }
  });
  
  return keywords;
}

// 调用AI API（支持重试机制）
async function callAIWithRetry(apiCallFn, maxRetries = 2) {
  let lastError;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await apiCallFn();
    } catch (error) {
      lastError = error;
      console.error(`[AI Retry ${i + 1}/${maxRetries + 1}]`, error.response?.data?.error?.message || error.message);
      if (i < maxRetries) {
        await new Promise(r => setTimeout(r, 1000 * (i + 1))); // 指数退避
      }
    }
  }
  throw lastError;
}

// 调用AI API（优先Kimi，其次Qwen，最后百度）
async function callBaiduAI(symptom, model, context, matchedCases) {
  const config = getModelConfig();

  // 1. 优先使用 Kimi API
  if (config.kimi.apiKey) {
    try {
      return await callAIWithRetry(() => callKimiAPI(symptom, model, context, matchedCases, config.kimi));
    } catch (error) {
      console.error('Kimi API failed after retries:', error.message);
    }
  }

  // 2. 尝试 Qwen API
  if (config.qwen.apiKey) {
    try {
      return await callAIWithRetry(() => callQwenAPI(symptom, model, context, matchedCases, config.qwen));
    } catch (error) {
      console.error('Qwen API failed after retries:', error.message);
    }
  }

  // 3. 尝试百度API
  if (config.baidu.apiKey && config.baidu.secretKey) {
    try {
      return await callAIWithRetry(() => callBaiduAIV2(symptom, model, context, matchedCases, config.baidu));
    } catch (error) {
      console.error('Baidu API failed after retries:', error.message);
    }
  }

  // 4. 所有API失败，降级到案例库
  console.warn('[AI] All APIs failed, falling back to case-based diagnosis');
  return generateResultFromCases(symptom, matchedCases);
}

// 调用通义千问API（使用配置对象）
async function callQwenAPI(symptom, model, context, matchedCases, config) {
  const { systemPrompt, userPrompt } = buildPromptV2(symptom, model, context, matchedCases);

  const response = await axios.post(
    `${config.apiBase}/chat/completions`,
    {
      model: config.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.2,
      max_tokens: 2500,
      response_format: { type: 'json_object' }
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
      timeout: 30000
    }
  );

  const aiResult = response.data.choices[0].message.content;
  return parseAIResponse(aiResult);
}

// 调用Kimi API（使用配置对象）
async function callKimiAPI(symptom, model, context, matchedCases, config) {
  const { systemPrompt, userPrompt } = buildPromptV2(symptom, model, context, matchedCases);

  const response = await axios.post(
    `${config.apiBase}/chat/completions`,
    {
      model: config.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.2,
      max_tokens: 2500
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
      timeout: 30000
    }
  );

  const aiResult = response.data.choices[0].message.content;
  return parseAIResponse(aiResult);
}

// 调用百度API V2
async function callBaiduAIV2(symptom, model, context, matchedCases, config) {
  // 获取access_token
  const tokenResponse = await axios.post(
    `https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=${config.apiKey}&client_secret=${config.secretKey}`
  );
  const accessToken = tokenResponse.data.access_token;

  const { systemPrompt, userPrompt } = buildPromptV2(symptom, model, context, matchedCases);

  const response = await axios.post(
    `https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop/chat/completions?access_token=${accessToken}`,
    {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.2,
      max_tokens: 2500
    }
  );

  return parseAIResponse(response.data.result);
}

// 构建prompt
function buildPrompt(symptom, model, context, matchedCases) {
  // 识别品牌
  const brandInfo = identifyBrand(symptom, model);
  
  let prompt = `你是一位专业的无人机故障诊断专家，拥有10年维修经验，熟悉多个品牌的无人机维修。

用户输入:
- 故障现象: ${symptom}
- 无人机型号: ${model || '未指定'}
- 补充信息: ${context || '无'}
${brandInfo ? `- 品牌识别: ${brandInfo.brand}（${brandInfo.description}）` : ''}

请按照以下步骤进行诊断:

1. 品牌与型号识别
   - 识别无人机品牌（大疆/道通/极飞/零零科技/普宙/哈博森/亿航等）
   - 识别具体型号
   - 考虑品牌特有的故障特点和维修方法

2. 故障现象分析
   - 提取关键故障现象
   - 判断故障类型(动力系统/导航系统/图传系统/云台系统/电源系统/传感器系统/喷洒系统/雷达系统/遥控器系统/其他)

3. 可能原因列举
   - 列出3-5个最可能的原因
   - 按概率从高到低排序
   - 每个原因包含概率和描述
   - 考虑品牌特有的故障原因

4. 排查步骤生成
   - 生成5步以内的排查步骤
   - 每步包含:步骤编号、操作、判断标准、解决方案、所需工具、预计时间
   - 针对品牌特点提供具体建议

5. 所需工具与时间
   - 列出所需工具
   - 预估维修总时间

6. 难度评估
   - 评估维修难度(1-5星)
   - 判断是否需要专业维修
`;

  if (matchedCases.length > 0) {
    prompt += `\n参考案例:\n`;
    matchedCases.slice(0, 3).forEach((c, index) => {
      prompt += `\n案例${index + 1}: ${c.symptom}\n`;
      prompt += `适用机型: ${c.applicableModels.join('、')}\n`;
      prompt += `故障类型: ${c.faultType}\n`;
      prompt += `可能原因: ${c.possibleCauses.map(cause => cause.cause).join('、')}\n`;
      if (c.tags && c.tags.length > 0) {
        prompt += `标签: ${c.tags.join('、')}\n`;
      }
    });
  }

  prompt += `\n请输出结构化的诊断结果，格式如下:
{
  "brand": "品牌名称",
  "model": "具体型号",
  "faultType": "故障类型",
  "possibleCauses": [
    {"cause": "原因", "probability": "概率", "description": "描述"}
  ],
  "steps": [
    {"step": 1, "operation": "操作", "criteria": "判断标准", "solution": "解决方案", "tools": [], "estimatedTime": "预计时间"}
  ],
  "requiredTools": ["工具列表"],
  "totalEstimatedTime": "总预计时间",
  "difficulty": "难度等级",
  "needProfessionalRepair": true/false
}`;

  return prompt;
}

// 构建Prompt V2（Phase 1增强版：分离system/user，添加CoT推理链，结构化参考案例）
function buildPromptV2(symptom, model, context, matchedCases) {
  const brandInfo = identifyBrand(symptom, model);
  
  // 构建参考案例文本（带匹配分数排序）
  let casesText = '';
  if (matchedCases.length > 0) {
    const topCases = matchedCases.slice(0, 3);
    casesText = topCases.map((item, index) => {
      const c = item.case || item;
      const score = item.score ? `（匹配度${(item.score * 100).toFixed(0)}%）` : '';
      return `
案例${index + 1}${score}:
- 症状: ${c.symptom}
- 适用机型: ${Array.isArray(c.applicableModels) ? c.applicableModels.join('、') : c.applicableModels}
- 故障类型: ${c.faultType}
- 常见原因: ${Array.isArray(c.possibleCauses) ? c.possibleCauses.map(ca => ca.cause || ca).join('、') : c.possibleCauses}
- 排查要点: ${Array.isArray(c.troubleshootingSteps) ? c.troubleshootingSteps.slice(0, 2).map(s => s.operation || s).join('；') : ''}`;
    }).join('\n');
  }

  const systemPrompt = `你是一位拥有10年经验的资深无人机维修工程师，擅长各类消费级和行业级无人机的故障诊断与维修。

【诊断原则】
1. 先分析品牌和型号特点，不同品牌故障模式差异很大
2. 按概率排序可能原因，最可能的原因排第一
3. 排查步骤要具体可操作，避免泛泛而谈
4. 考虑用户动手能力，太难的操作建议送修
5. 安全第一，涉及电池、电机等高危部件要谨慎

【输出要求】
- 必须输出有效的JSON格式
- 概率用百分比表示（如"80%"）
- 排查步骤中的estimatedTime用"X分钟"格式
- difficulty用数字1-5表示
- needProfessionalRepair用布尔值true/false
- thinking字段必须包含你的推理过程（3-5句话）`;

  const userPrompt = `请对以下无人机故障进行专业诊断。

【用户输入】
- 故障现象: ${symptom}
- 无人机型号: ${model || '未指定'}
- 补充信息: ${context || '无'}
${brandInfo ? `- 品牌识别: ${brandInfo.brand}（${brandInfo.description}）` : ''}

${casesText ? `【参考案例库】\n${casesText}\n` : ''}

【诊断流程】
请先在心里分析（这些分析要写在 thinking 字段中）：
1. 这是什么品牌/型号的无人机？该品牌有什么常见故障模式？
2. 这个故障现象最可能涉及哪个系统？
3. 参考案例中的故障与用户描述是否相似？相似度如何？
4. 如果参考案例和用户描述有差异，差异点是什么？
5. 综合判断：最可能的故障原因是什么？置信度如何？

然后输出以下JSON格式的诊断结果：
{
  "thinking": [
    "推理步骤1：...",
    "推理步骤2：...",
    "推理步骤3：..."
  ],
  "brand": "识别出的品牌（如不确定填\"未知\"）",
  "model": "识别出的型号（如不确定填\"未知\"）",
  "faultType": "故障类型（动力系统/导航系统/图传系统/云台系统/电源系统/传感器系统/遥控器系统/其他）",
  "analysis": "简要分析（2-3句话说明最可能的故障原因）",
  "possibleCauses": [
    {"cause": "原因描述", "probability": "概率如80%", "description": "为什么是这个原因的简要解释"}
  ],
  "steps": [
    {"step": 1, "operation": "具体操作", "criteria": "判断这一步是否解决的标准", "solution": "如果这一步确认问题，如何解决", "tools": ["所需工具"], "estimatedTime": "预计时间如5分钟"}
  ],
  "requiredTools": ["工具列表"],
  "totalEstimatedTime": "总预计时间如30分钟",
  "difficulty": "数字1-5",
  "needProfessionalRepair": true/false,
  "safetyNotes": "安全注意事项（如有）"
}`;

  return { systemPrompt, userPrompt };
}
function identifyBrand(symptom, model) {
  const brands = {
    '大疆': {
      keywords: ['Mavic', 'Air', 'Mini', 'Phantom', 'T30', 'T40', 'Matrice', 'Inspire', 'DJI', '大疆'],
      description: '全球领先的民用无人机品牌，产品线覆盖消费级和行业级'
    },
    '道通': {
      keywords: ['EVO', 'Nano', 'Lite', 'Autel', '道通'],
      description: '美国品牌，主打EVO系列，图传系统独特'
    },
    '极飞': {
      keywords: ['XAG', '极飞', 'P100', 'P80', 'V40', 'P系列'],
      description: '农业无人机领导者，专注植保领域'
    },
    '零零科技': {
      keywords: ['Hover', 'Camera', '零零', 'ZeroTech'],
      description: '主打便携式自拍无人机，折叠设计独特'
    },
    '普宙': {
      keywords: ['GDU', 'Byrd', '普宙'],
      description: '可折叠机臂设计，主打便携性'
    },
    '哈博森': {
      keywords: ['Hubsan', 'Zino', '哈博森'],
      description: '性价比品牌，主打入门级市场'
    },
    '亿航': {
      keywords: ['EHang', '亿航', '载人'],
      description: '载人无人机先驱，专注空中交通'
    }
  };
  
  const text = `${symptom} ${model || ''}`;
  
  for (const [brand, info] of Object.entries(brands)) {
    for (const keyword of info.keywords) {
      if (text.includes(keyword)) {
        return {
          brand: brand,
          description: info.description
        };
      }
    }
  }
  
  return null;
}

// 解析AI响应（优化版：支持markdown代码块、多重容错、字段补全）
function parseAIResponse(aiResult) {
  let parsed = null;
  const errors = [];

  // 策略1: 尝试提取 markdown JSON 代码块
  try {
    const codeBlockMatch = aiResult.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      parsed = JSON.parse(codeBlockMatch[1].trim());
    }
  } catch (e) { errors.push('codeBlock:' + e.message); }

  // 策略2: 尝试提取最外层的大括号（找匹配的括号对）
  if (!parsed) {
    try {
      const firstBrace = aiResult.indexOf('{');
      const lastBrace = aiResult.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        parsed = JSON.parse(aiResult.slice(firstBrace, lastBrace + 1));
      }
    } catch (e) { errors.push('braceExtract:' + e.message); }
  }

  // 策略3: 尝试整个字符串作为JSON
  if (!parsed) {
    try {
      parsed = JSON.parse(aiResult.trim());
    } catch (e) { errors.push('directParse:' + e.message); }
  }

  // 策略4: 尝试修复常见JSON错误后再解析
  if (!parsed) {
    try {
      let fixed = aiResult;
      // 去除markdown标记
      fixed = fixed.replace(/```json\s*/g, '').replace(/```\s*$/g, '');
      // 去除首尾的非JSON字符
      const jsonStart = fixed.indexOf('{');
      const jsonEnd = fixed.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1) {
        fixed = fixed.slice(jsonStart, jsonEnd + 1);
        // 修复尾随逗号
        fixed = fixed.replace(/,\s*([}\]])/g, '$1');
        // 修复单引号
        fixed = fixed.replace(/'/g, '"');
        parsed = JSON.parse(fixed);
      }
    } catch (e) { errors.push('fixAndParse:' + e.message); }
  }

  if (!parsed) {
    console.error('[parseAIResponse] All parsing strategies failed:', errors.join('; '));
    console.error('[parseAIResponse] Raw response preview:', aiResult.substring(0, 500));
    return createDefaultResponse(aiResult);
  }

  // 字段补全：确保返回结构包含所有必要字段
  return normalizeDiagnosisResponse(parsed, aiResult);
}

// 创建默认响应结构
function createDefaultResponse(rawResponse) {
  return {
    thinking: ['无法解析AI返回内容，使用默认响应'],
    brand: '未知',
    model: '未知',
    faultType: '未知',
    analysis: 'AI返回的格式不正确，无法解析诊断结果',
    possibleCauses: [
      { cause: '解析失败', probability: '100%', description: 'AI输出格式不符合预期，请重试' }
    ],
    steps: [
      { step: 1, operation: '请重新描述故障现象', criteria: '获得有效诊断', solution: '重新提交问题', tools: [], estimatedTime: '-' }
    ],
    requiredTools: [],
    totalEstimatedTime: '-',
    difficulty: '1',
    needProfessionalRepair: true,
    safetyNotes: '',
    rawResponse: rawResponse.substring(0, 1000)
  };
}

// 规范化诊断响应（补全缺失字段，保留thinking）
function normalizeDiagnosisResponse(parsed, rawResponse) {
  const defaults = createDefaultResponse(rawResponse);
  
  const normalized = {
    thinking: Array.isArray(parsed.thinking) ? parsed.thinking : (parsed.thinking ? [parsed.thinking] : ['根据案例库和用户描述进行分析']),
    brand: parsed.brand || parsed.品牌 || defaults.brand,
    model: parsed.model || parsed.型号 || defaults.model,
    faultType: parsed.faultType || parsed.fault_type || parsed.故障类型 || defaults.faultType,
    analysis: parsed.analysis || parsed.分析 || defaults.analysis,
    possibleCauses: Array.isArray(parsed.possibleCauses) ? parsed.possibleCauses.map(c => ({
      cause: c.cause || c.原因 || '未知原因',
      probability: c.probability || c.概率 || '未知',
      description: c.description || c.描述 || ''
    })) : defaults.possibleCauses,
    steps: Array.isArray(parsed.steps) ? parsed.steps.map(s => ({
      step: s.step || s.步骤 || 1,
      operation: s.operation || s.操作 || '检查设备',
      criteria: s.criteria || s.判断标准 || '问题解决',
      solution: s.solution || s.解决方案 || '联系专业维修',
      tools: Array.isArray(s.tools) ? s.tools : [],
      estimatedTime: s.estimatedTime || s.预计时间 || '-'
    })) : defaults.steps,
    requiredTools: Array.isArray(parsed.requiredTools) ? parsed.requiredTools : defaults.requiredTools,
    totalEstimatedTime: parsed.totalEstimatedTime || parsed.total_estimated_time || defaults.totalEstimatedTime,
    difficulty: String(parsed.difficulty || parsed.难度 || defaults.difficulty),
    needProfessionalRepair: !!parsed.needProfessionalRepair || parsed.need_professional_repair || defaults.needProfessionalRepair,
    safetyNotes: parsed.safetyNotes || parsed.safety_notes || parsed.安全注意事项 || ''
  };

  // 如果原始解析有额外字段，保留它们
  return { ...parsed, ...normalized };
}

// 基于案例库生成结果（兼容新旧格式）
function generateResultFromCases(symptom, matchedCases) {
  console.log('generateResultFromCases called with:');
  console.log('  symptom:', symptom);
  console.log('  matchedCases.length:', matchedCases.length);
  
  if (matchedCases.length === 0) {
    console.log('  No matched cases, returning default');
    return {
      brand: '未知',
      model: '未知',
      faultType: '未知',
      analysis: '案例库中未找到匹配案例，请提供更详细的故障描述',
      possibleCauses: [
        { cause: '案例库中未找到匹配案例', probability: '100%', description: '请提供更详细的故障描述，包括品牌、型号和具体现象' }
      ],
      steps: [
        {
          step: 1,
          operation: '联系专业维修人员',
          criteria: '无法自行解决',
          solution: '建议联系大疆官方售后或专业维修店',
          tools: [],
          estimatedTime: '-'
        }
      ],
      requiredTools: [],
      totalEstimatedTime: '-',
      difficulty: '1',
      needProfessionalRepair: true,
      safetyNotes: ''
    };
  }

  // 兼容 matchCasesSmart 返回的格式 {case, score, reason}
  const bestMatchRaw = matchedCases[0];
  const bestMatch = bestMatchRaw.case || bestMatchRaw;
  console.log('  Returning best match:', bestMatch.id, bestMatch.symptom);
  
  return {
    brand: bestMatch.brand || '未知',
    model: bestMatch.model || '未知',
    faultType: bestMatch.faultType || '未知',
    analysis: `根据案例库匹配，最可能的故障是：${bestMatch.symptom}`,
    possibleCauses: Array.isArray(bestMatch.possibleCauses) ? bestMatch.possibleCauses : [{ cause: '未知', probability: '100%', description: '' }],
    steps: Array.isArray(bestMatch.troubleshootingSteps) ? bestMatch.troubleshootingSteps : [
      { step: 1, operation: '参考案例排查', criteria: '问题解决', solution: '按参考案例步骤操作', tools: [], estimatedTime: '-' }
    ],
    requiredTools: Array.isArray(bestMatch.requiredTools) ? bestMatch.requiredTools : [],
    totalEstimatedTime: bestMatch.totalEstimatedTime || '-',
    difficulty: String(bestMatch.difficulty || '1'),
    needProfessionalRepair: !!bestMatch.needProfessionalRepair,
    safetyNotes: bestMatch.safetyNotes || ''
  };
}

// 获取故障案例
exports.getCase = async (req, res) => {
  try {
    const { id } = req.params;
    const caseData = faultCases.find(c => c.id === id);
    
    if (!caseData) {
      return res.status(404).json({ error: '案例不存在' });
    }

    res.json({
      success: true,
      case: caseData
    });
  } catch (error) {
    console.error('Get case error:', error);
    res.status(500).json({ error: '获取案例失败' });
  }
};

// 搜索故障案例
exports.searchCases = async (req, res) => {
  try {
    const { keyword, faultType } = req.query;
    
    let results = faultCases;
    
    if (keyword) {
      results = results.filter(c => 
        c.symptom.includes(keyword) || 
        c.keywords.some(k => k.includes(keyword))
      );
    }
    
    if (faultType) {
      results = results.filter(c => c.faultType === faultType);
    }

    res.json({
      success: true,
      count: results.length,
      cases: results
    });
  } catch (error) {
    console.error('Search cases error:', error);
    res.status(500).json({ error: '搜索失败' });
  }
};

// 导出案例库（用于调试）
exports.getFaultCases = () => faultCases;

// 测试案例匹配（优化版：使用 matchCasesSmart）
exports.testMatch = async (req, res) => {
  try {
    const { symptom } = req.query;
    
    // 确保案例库已加载
    if (faultCases.length === 0) {
      await loadFaultCases();
    }
    
    if (!symptom) {
      return res.json({
        faultCasesCount: faultCases.length,
        faultCases: faultCases.map(c => ({ id: c.id, symptom: c.symptom, keywords: c.keywords }))
      });
    }
    
    const matchedResults = matchCasesSmart(symptom, faultCases);
    
    res.json({
      symptom,
      faultCasesCount: faultCases.length,
      matchedCasesCount: matchedResults.length,
      matchedCases: matchedResults.map(r => ({
        id: r.case.id,
        symptom: r.case.symptom,
        score: Math.round(r.score * 100) + '%',
        reason: r.reason
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ========== 多轮对话相关接口 ==========

/**
 * 开始对话（优化版：结构化信息收集）
 */
exports.startConversation = async (req, res) => {
  try {
    const { symptom, model } = req.body;

    if (!symptom) {
      return res.status(400).json({ error: '请输入故障现象' });
    }

    // 确保案例库已加载
    if (faultCases.length === 0) {
      await loadFaultCases();
    }

    // 创建会话
    const sessionId = sessionService.createSession();
    
    // 添加用户初始症状到对话历史
    sessionService.addMessage(sessionId, {
      role: 'user',
      content: symptom,
      type: 'symptom'
    });

    // 智能案例匹配
    const matchedResults = matchCasesSmart(symptom, faultCases);
    console.log(`[Conversation] Smart matched ${matchedResults.length} cases for: ${symptom}`);

    // 判断用户意图
    const intent = analyzeUserIntent(symptom);
    console.log('[Intent Analysis] Message:', symptom, '->', intent.type);

    // 如果是咨询类问题，先回答
    if (intent.type === 'inquiry') {
      const inquiryResponse = await answerInquiry(symptom, matchedResults);
      
      sessionService.addMessage(sessionId, {
        role: 'assistant',
        content: inquiryResponse.answer,
        type: 'answer'
      });

      sessionService.addMessage(sessionId, {
        role: 'assistant',
        content: inquiryResponse.followUp.question,
        type: 'question',
        options: inquiryResponse.followUp.options
      });

      res.json({
        success: true,
        sessionId,
        answer: inquiryResponse.answer,
        question: inquiryResponse.followUp.question,
        options: inquiryResponse.followUp.options,
        currentRound: 1,
        maxRounds: 10,
        intent: 'inquiry'
      });
      return;
    }

    // 故障诊断：先尝试从症状中自动提取信息
    const extractedInfo = extractInfoFromSymptom(symptom, model);
    if (extractedInfo.brand) {
      sessionService.updateInfoChecklist(sessionId, 'brand', extractedInfo.brand);
    }
    if (extractedInfo.model) {
      sessionService.updateInfoChecklist(sessionId, 'model', extractedInfo.model);
    }
    // 症状已收集
    sessionService.updateInfoChecklist(sessionId, 'symptom', symptom);

    // 检查下一个需要收集的信息
    const nextMissing = sessionService.getNextMissingInfo(sessionId);

    if (nextMissing) {
      // 继续收集信息
      sessionService.addMessage(sessionId, {
        role: 'assistant',
        content: nextMissing.question,
        type: 'question',
        options: nextMissing.options
      });

      res.json({
        success: true,
        sessionId,
        question: nextMissing.question,
        options: nextMissing.options,
        currentRound: 1,
        maxRounds: 10,
        intent: 'diagnosis',
        collectedInfo: sessionService.getCollectedInfo(sessionId)
      });
    } else {
      // 信息已完整，直接出诊断
      const diagnosis = await generateFinalDiagnosis(sessionId, model, matchedResults);

      sessionService.addMessage(sessionId, {
        role: 'assistant',
        content: JSON.stringify(diagnosis),
        type: 'diagnosis'
      });

      sessionService.setDiagnosisResult(sessionId, diagnosis);

      res.json({
        success: true,
        sessionId,
        diagnosis,
        currentRound: 1,
        maxRounds: 10,
        status: 'completed',
        intent: 'diagnosis'
      });
    }

  } catch (error) {
    console.error('Start conversation error:', error);
    res.status(500).json({ error: '启动对话失败' });
  }
};

/**
 * 从症状描述中自动提取信息
 */
function extractInfoFromSymptom(symptom, model) {
  const info = { brand: null, model: model || null };
  
  const brandPatterns = {
    '大疆(DJI)': ['大疆', 'DJI', 'Mavic', 'Air', 'Mini', 'Phantom', 'Inspire', 'Matrice', 'T30', 'T40'],
    '道通(Autel)': ['道通', 'Autel', 'EVO'],
    '极飞(XAG)': ['极飞', 'XAG', 'P100', 'P80', 'V40'],
    '哈博森(Hubsan)': ['哈博森', 'Hubsan', 'Zino']
  };
  
  const text = `${symptom} ${model || ''}`;
  for (const [brand, keywords] of Object.entries(brandPatterns)) {
    if (keywords.some(kw => text.includes(kw))) {
      info.brand = brand;
      break;
    }
  }
  
  return info;
}

/**
 * 继续对话（优化版：基于结构化信息收集清单）
 */
exports.continueConversation = async (req, res) => {
  try {
    const { sessionId, answer, model } = req.body;

    if (!sessionId || !answer) {
      return res.status(400).json({ error: '缺少必要参数' });
    }

    const session = sessionService.getSession(sessionId);
    if (!session) {
      return res.status(404).json({ error: '会话不存在或已过期' });
    }

    // 添加用户回答到对话历史
    sessionService.addMessage(sessionId, {
      role: 'user',
      content: answer,
      type: 'answer'
    });

    // 确定当前在收集哪个字段
    const nextMissingBefore = sessionService.getNextMissingInfo(sessionId);
    const fieldToFill = nextMissingBefore ? nextMissingBefore.field : null;
    
    // 更新信息收集清单
    if (fieldToFill) {
      sessionService.updateInfoChecklist(sessionId, fieldToFill, answer);
      console.log(`[Conversation] Updated ${fieldToFill} = ${answer}`);
    }

    // 检查信息是否收集完毕
    const isComplete = sessionService.isInfoComplete(sessionId);
    const canAskMore = sessionService.canAskMore(sessionId);

    if (isComplete || !canAskMore) {
      // 信息收集完毕，生成诊断
      console.log('[Conversation] Info complete, generating diagnosis...');
      const collectedInfo = sessionService.getCollectedInfo(sessionId);
      const fullSymptom = `${collectedInfo.brand || ''} ${collectedInfo.model || ''} ${collectedInfo.symptom || ''}`;
      const matchedResults = matchCasesSmart(fullSymptom, faultCases);
      
      const diagnosis = await generateFinalDiagnosis(sessionId, model, matchedResults);

      sessionService.addMessage(sessionId, {
        role: 'assistant',
        content: JSON.stringify(diagnosis),
        type: 'diagnosis'
      });

      sessionService.setDiagnosisResult(sessionId, diagnosis);

      res.json({
        success: true,
        sessionId,
        diagnosis,
        currentRound: session.currentRound,
        maxRounds: 10,
        status: 'completed',
        collectedInfo
      });
    } else {
      // 继续追问下一个缺失的信息
      const nextMissing = sessionService.getNextMissingInfo(sessionId);
      
      if (nextMissing) {
        sessionService.addMessage(sessionId, {
          role: 'assistant',
          content: nextMissing.question,
          type: 'question',
          options: nextMissing.options
        });

        res.json({
          success: true,
          sessionId,
          question: nextMissing.question,
          options: nextMissing.options,
          currentRound: session.currentRound + 1,
          maxRounds: 10,
          status: 'continue',
          collectedInfo: sessionService.getCollectedInfo(sessionId)
        });
      }
    }

  } catch (error) {
    console.error('Continue conversation error:', error);
    res.status(500).json({ 
      error: '继续对话失败', 
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

/**
 * 获取对话历史
 */
exports.getConversation = async (req, res) => {
  try {
    const { sessionId } = req.params;

    const session = sessionService.getSession(sessionId);
    if (!session) {
      return res.status(404).json({ error: '会话不存在或已过期' });
    }

    res.json({
      success: true,
      sessionId,
      conversationHistory: session.conversationHistory,
      currentRound: session.currentRound,
      status: session.status
    });

  } catch (error) {
    console.error('Get conversation error:', error);
    res.status(500).json({ error: '获取对话历史失败' });
  }
};

/**
 * 判断用户意图
 * @returns {Object} { type: 'inquiry' | 'diagnosis', topic?: string }
 */
function analyzeUserIntent(message) {
  const lowerMessage = message.toLowerCase();
  
  // 咨询类关键词
  const inquiryKeywords = [
    '是什么', '什么是', '怎么样', '如何', '为什么', '介绍', '区别', '对比',
    '哪个好', '推荐', '选择', '特点', '功能', '参数', '价格', '评测'
  ];
  
  // 故障类关键词
  const faultKeywords = [
    '无法', '不能', '不转', '黑屏', '卡住', '异常', '故障', '问题', '坏了',
    '没反应', '失灵', '掉高', '中断', '延迟', '鼓包', '异响', '不稳'
  ];
  
  // 判断是否为咨询
  const isInquiry = inquiryKeywords.some(kw => lowerMessage.includes(kw));
  const isFault = faultKeywords.some(kw => lowerMessage.includes(kw));
  
  console.log(`[Intent Analysis] Message: "${message}"`);
  console.log(`[Intent Analysis] isInquiry: ${isInquiry}, isFault: ${isFault}`);
  
  if (isInquiry && !isFault) {
    console.log('[Intent Analysis] Result: inquiry');
    return { type: 'inquiry', topic: message };
  } else if (isFault) {
    console.log('[Intent Analysis] Result: diagnosis (fault detected)');
    return { type: 'diagnosis', topic: message };
  } else {
    // 默认为诊断
    console.log('[Intent Analysis] Result: diagnosis (default)');
    return { type: 'diagnosis', topic: message };
  }
}

/**
 * 本地知识库 - 常见问题回答
 */
const localKnowledgeBase = {
  // 品牌介绍
  'NEO': {
    keywords: ['neo', 'NEO'],
    answer: 'NEO是大疆（DJI）推出的首款第一人称视角（FPV）无人机，专为沉浸式飞行体验设计。它结合了FPV无人机的速度和敏捷性，以及消费级无人机的易用性和安全性。NEO支持手动操控和自动飞行模式，配备4K摄像头，适合航拍爱好者和FPV玩家。'
  },
  'Mavic 3': {
    keywords: ['mavic 3', 'Mavic 3'],
    answer: '大疆Mavic 3系列是旗舰级航拍无人机，配备哈苏相机和4/3 CMOS传感器，支持5.1K视频拍摄。主要特点包括：46分钟续航、全向避障、15公里图传距离、高级辅助飞行功能。适合专业航拍师和对画质要求极高的用户。'
  },
  'Air 3': {
    keywords: ['air 3', 'Air 3'],
    answer: '大疆Air 3是中高端航拍无人机，采用双摄系统（广角+3倍长焦），支持4K/60fps HDR视频。主要特点包括：46分钟续航、全向避障、20公里图传距离、智能跟随功能。性价比高，适合航拍爱好者和半专业用户。'
  },
  'Mini 4 Pro': {
    keywords: ['mini 4', 'mini4', 'Mini 4'],
    answer: '大疆Mini 4 Pro是轻量级航拍无人机，重量仅249克（无需注册）。主要特点包括：4K/60fps视频、全向避障、20公里图传、34分钟续航。体积小巧便于携带，适合旅行拍摄和入门用户。'
  },
  '道通': {
    keywords: ['道通', 'autel', 'EVO'],
    answer: '道通（Autel）是美国无人机品牌，主打EVO系列。主要产品包括EVO II系列（8K航拍）、EVO Nano系列（轻量级）、EVO Lite系列（中端）。特点是图传系统独特，画质优秀，部分机型支持热成像。'
  },
  '极飞': {
    keywords: ['极飞', 'xag', 'P100', 'P80'],
    answer: '极飞（XAG）是中国农业无人机领导者，专注植保领域。主要产品包括P系列植保机（P100、P80等）、V系列测绘无人机。特点是精准喷洒、智能航线规划、农业大数据分析，适合农业从业者。'
  },
  
  // 对比类问题
  '对比': {
    keywords: ['对比', '区别', '哪个好'],
    answer: '选择无人机需要考虑以下因素：\n1. 用途：航拍、FPV、农业、测绘等\n2. 预算：Mini系列（3000-5000元）、Air系列（7000-10000元）、Mavic系列（10000元以上）\n3. 便携性：Mini最轻便，Mavic性能最强\n4. 续航：主流机型30-46分钟\n5. 避障：高端机型全向避障\n建议根据实际需求选择。'
  },
  
  // 推荐类问题
  '推荐': {
    keywords: ['推荐', '选择'],
    answer: '根据不同需求推荐：\n• 入门旅行：Mini 4 Pro（轻便、无需注册）\n• 航拍爱好：Air 3（双摄、性价比高）\n• 专业航拍：Mavic 3 Pro（哈苏相机、顶级画质）\n• FPV体验：DJI FPV或Avata（沉浸式飞行）\n• 农业植保：极飞P系列\n建议先明确用途和预算。'
  }
};

/**
 * 从本地知识库查找答案
 */
function findLocalAnswer(question) {
  const lowerQuestion = question.toLowerCase();
  
  for (const [key, data] of Object.entries(localKnowledgeBase)) {
    if (data.keywords.some(kw => lowerQuestion.includes(kw.toLowerCase()))) {
      return data.answer;
    }
  }
  
  return null;
}

/**
 * 回答咨询问题
 */
async function answerInquiry(question, matchedCases) {
  // 1. 先尝试本地知识库
  const localAnswer = findLocalAnswer(question);
  if (localAnswer) {
    console.log('[INFO] Found answer in local knowledge base');
    return {
      answer: localAnswer,
      followUp: {
        question: '请问您是否遇到了无人机故障问题？',
        options: ['是的，有故障', '只是咨询一下', '其他问题']
      }
    };
  }
  
  // 2. 尝试使用 API
  const kimiApiKey = process.env.KIMI_API_KEY;
  const qwenApiKey = process.env.QWEN_API_KEY;
  
  if (!kimiApiKey && !qwenApiKey) {
    // 3. API 不可用，返回通用回答
    return {
      answer: '您好！我是无人机诊断助手，可以帮您解答无人机相关问题。请问您想了解哪方面的信息？比如：\n• 品牌介绍（大疆、道通、极飞等）\n• 产品对比\n• 故障诊断\n• 使用技巧',
      followUp: {
        question: '请问您是否遇到了无人机故障问题？',
        options: ['是的，有故障', '只是咨询一下', '其他问题']
      }
    };
  }

  // 选择 API
  const useKimi = !!kimiApiKey;
  const apiKey = useKimi ? kimiApiKey : qwenApiKey;
  const apiBase = useKimi 
    ? (process.env.KIMI_API_BASE || 'https://api.kimi.com/coding/v1')
    : (process.env.QWEN_API_BASE || 'https://coding.dashscope.aliyuncs.com/v1');
  const model = useKimi 
    ? (process.env.KIMI_MODEL || 'kimi-for-coding')
    : (process.env.QWEN_MODEL || 'qwen-plus');

  console.log(`[API] Using ${useKimi ? 'Kimi' : 'Qwen'} API for inquiry`);

  try {
    const prompt = `你是无人机专家，用户问了一个关于无人机的问题。请给出专业、准确的回答。

用户问题：${question}

请按照以下格式回答：
1. 先直接回答问题（简洁明了）
2. 然后询问用户是否需要进一步帮助

输出JSON格式：
{
  "answer": "你的回答",
  "followUp": {
    "question": "是否遇到了故障问题？",
    "options": ["是的，有故障", "只是咨询一下", "其他问题"]
  }
}`;

    const response = await axios.post(
      `${apiBase}/chat/completions`,
      {
        model: model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 500
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        }
      }
    );

    const aiResult = response.data.choices[0].message.content;
    const jsonMatch = aiResult.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    
    return {
      answer: aiResult,
      followUp: {
        question: '请问您是否遇到了无人机故障问题？',
        options: ['是的，有故障', '只是咨询一下', '其他问题']
      }
    };

  } catch (error) {
    console.error('Answer inquiry error:', error.response?.data || error.message);
    
    // 如果 Kimi 失败，尝试 Qwen
    if (useKimi && qwenApiKey) {
      console.log('[API] Kimi failed, trying Qwen...');
      return await answerInquiryWithQwen(question);
    }
    
    return {
      answer: '抱歉，回答问题时出现了错误。请稍后再试。',
      followUp: {
        question: '请问您是否遇到了无人机故障问题？',
        options: ['是的，有故障', '只是咨询一下', '其他问题']
      }
    };
  }
}

/**
 * 使用 Qwen API 回答咨询问题（降级方案）
 */
async function answerInquiryWithQwen(question) {
  const qwenApiKey = process.env.QWEN_API_KEY;
  
  if (!qwenApiKey) {
    return {
      answer: '抱歉，回答问题时出现了错误。请稍后再试。',
      followUp: {
        question: '请问您是否遇到了无人机故障问题？',
        options: ['是的，有故障', '只是咨询一下', '其他问题']
      }
    };
  }

  try {
    const apiBase = process.env.QWEN_API_BASE || 'https://coding.dashscope.aliyuncs.com/v1';
    const qwenModel = process.env.QWEN_MODEL || 'qwen-plus';

    const prompt = `你是无人机专家，用户问了一个关于无人机的问题。请给出专业、准确的回答。

用户问题：${question}

请按照以下格式回答：
1. 先直接回答问题（简洁明了）
2. 然后询问用户是否需要进一步帮助

输出JSON格式：
{
  "answer": "你的回答",
  "followUp": {
    "question": "是否遇到了故障问题？",
    "options": ["是的，有故障", "只是咨询一下", "其他问题"]
  }
}`;

    const response = await axios.post(
      `${apiBase}/chat/completions`,
      {
        model: qwenModel,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 500
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${qwenApiKey}`
        }
      }
    );

    const aiResult = response.data.choices[0].message.content;
    const jsonMatch = aiResult.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    
    return {
      answer: aiResult,
      followUp: {
        question: '请问您是否遇到了无人机故障问题？',
        options: ['是的，有故障', '只是咨询一下', '其他问题']
      }
    };

  } catch (error) {
    console.error('Qwen fallback error:', error.response?.data || error.message);
    return {
      answer: '抱歉，回答问题时出现了错误。请稍后再试。',
      followUp: {
        question: '请问您是否遇到了无人机故障问题？',
        options: ['是的，有故障', '只是咨询一下', '其他问题']
      }
    };
  }
}

/**
 * 生成追问
 */
async function generateFollowUpQuestion(sessionId, symptom, model, matchedCases, conversationHistory = []) {
  const qwenApiKey = process.env.QWEN_API_KEY;
  
  if (!qwenApiKey) {
    // 如果没有API，返回默认追问
    return getDefaultQuestion(sessionId, symptom);
  }

  try {
    const apiBase = process.env.QWEN_API_BASE || 'https://coding.dashscope.aliyuncs.com/v1';
    const qwenModel = process.env.QWEN_MODEL || 'qwen3.5-plus';

    // 构建prompt
    let prompt = `你是一位专业的无人机故障诊断专家。用户描述了故障现象，请根据对话历史判断：

对话历史:
${conversationHistory.length > 0 ? conversationHistory.map(msg => `${msg.role === 'user' ? '用户' : 'AI'}: ${msg.content}`).join('\n') : `用户: ${symptom}`}

判断规则：
1. 如果对话历史已经包含足够信息来做确诊（已了解品牌型号、故障现象、发生环境、用户已尝试的排查步骤等），请直接给出诊断结果，不要再追问。
2. 如果信息还不够，请生成一个精准的追问问题，帮助排除或确认故障原因。

追问问题要求：
- 针对性强，每个问题能帮助排除或确认某些故障原因
- 简洁明了，用户容易回答
- 提供2-4个预设选项，方便用户快速选择
- 避免重复提问已经问过的问题

输出JSON格式:
{
  "shouldDiagnose": false, // true表示信息足够，直接给出诊断；false表示继续追问
  "question": "追问问题（shouldDiagnose为false时必填）",
  "options": ["选项1", "选项2", "选项3"],
  "diagnosis": { // shouldDiagnose为true时必填，诊断结果格式
    "faultType": "故障类型",
    "possibleCauses": [{"cause": "原因", "probability": "概率", "description": "描述"}],
    "steps": [{"step": 1, "operation": "操作", "criteria": "判断标准", "solution": "解决方案", "tools": [], "estimatedTime": "预计时间"}],
    "requiredTools": ["工具列表"],
    "totalEstimatedTime": "总预计时间",
    "difficulty": "难度等级",
    "needProfessionalRepair": true/false
  }
}`;

    const response = await axios.post(
      `${apiBase}/chat/completions`,
      {
        model: qwenModel,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 500
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${qwenApiKey}`
        }
      }
    );

    const aiResult = response.data.choices[0].message.content;
    const jsonMatch = aiResult.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    
    return getDefaultQuestion(sessionId, symptom);

  } catch (error) {
    console.error('Generate question error:', error.response?.data || error.message);
    return getDefaultQuestion(sessionId, symptom);
  }
}

/**
 * 生成最终诊断（优化版：使用结构化信息 + buildPromptV2）
 */
async function generateFinalDiagnosis(sessionId, model, matchedResults = []) {
  const session = sessionService.getSession(sessionId);
  if (!session) {
    throw new Error('Session not found');
  }

  const config = getModelConfig();
  
  // 构建完整的上下文
  const collectedInfo = sessionService.getCollectedInfo(sessionId);
  const fullContext = Object.entries(collectedInfo)
    .map(([k, v]) => {
      const labels = { brand: '品牌', model: '型号', symptom: '故障现象', environment: '发生环境', attempted: '已尝试排查' };
      return `${labels[k] || k}: ${v}`;
    })
    .join('\n');

  // 构建症状描述
  const symptom = collectedInfo.symptom || session.conversationHistory[0]?.content || '';
  const droneModel = model || collectedInfo.model || '';

  if (!config.kimi.apiKey && !config.qwen.apiKey) {
    console.warn('[Final Diagnosis] No AI API configured, using case-based fallback');
    return generateResultFromCases(symptom, matchedResults);
  }

  try {
    const { systemPrompt, userPrompt } = buildPromptV2(symptom, droneModel, fullContext, matchedResults);
    
    // 添加多轮对话上下文到 user prompt
    const conversationContext = sessionService.getConversationContext(sessionId);
    const enhancedUserPrompt = `${userPrompt}\n\n【完整对话记录】\n${conversationContext}\n\n请根据以上所有信息，给出最终诊断结果。`;

    let response;
    
    // 优先使用 Kimi
    if (config.kimi.apiKey) {
      response = await callAIWithRetry(() => axios.post(
        `${config.kimi.apiBase}/chat/completions`,
        {
          model: config.kimi.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: enhancedUserPrompt }
          ],
          temperature: 0.2,
          max_tokens: 2500
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.kimi.apiKey}`
          },
          timeout: 30000
        }
      ));
    } else {
      // 使用 Qwen
      response = await callAIWithRetry(() => axios.post(
        `${config.qwen.apiBase}/chat/completions`,
        {
          model: config.qwen.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: enhancedUserPrompt }
          ],
          temperature: 0.2,
          max_tokens: 2500,
          response_format: { type: 'json_object' }
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.qwen.apiKey}`
          },
          timeout: 30000
        }
      ));
    }

    const aiResult = response.data.choices[0].message.content;
    return parseAIResponse(aiResult);

  } catch (error) {
    console.error('Generate final diagnosis error:', error.response?.data || error.message);
    return generateResultFromCases(symptom, matchedResults);
  }
}

/**
 * 获取默认追问
 */
function getDefaultQuestion(sessionId, symptom) {
  // 如果没有症状描述，返回通用问题
  if (!symptom) {
    return {
      question: '请问您遇到的具体故障现象是什么？',
      options: ['无法起飞', 'GPS信号弱', '图传异常', '其他问题']
    };
  }
  
  // 根据症状返回预设问题
  if (symptom.includes('无法起飞')) {
    return {
      question: '请问您的无人机型号是什么？',
      options: ['Mavic 3', 'Air 3', 'Mini 4 Pro', '其他型号']
    };
  } else if (symptom.includes('GPS')) {
    return {
      question: 'GPS信号弱是在什么环境下出现的？',
      options: ['室内', '高楼密集区', '空旷户外', '其他环境']
    };
  } else if (symptom.includes('图传')) {
    return {
      question: '图传问题具体表现是什么？',
      options: ['完全黑屏', '画面卡顿', '画面延迟', '信号中断']
    };
  } else {
    return {
      question: '请问您的无人机型号是什么？',
      options: ['Mavic系列', 'Air系列', 'Mini系列', '其他型号']
    };
  }
}
