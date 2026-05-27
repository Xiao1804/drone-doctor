const axios = require('axios');
const fs = require('fs').promises;
const sessionService = require('../services/sessionService');
const { resolveFaultCasesFile } = require('../utils/faultCasesFile');

const FAULT_CASES_FILE = resolveFaultCasesFile();

// 加载故障案例库
let faultCases = [];
const loadFaultCases = async () => {
  try {
    const data = await fs.readFile(
      FAULT_CASES_FILE,
      'utf-8'
    );
    const allCases = JSON.parse(data);
    // 只加载已审核通过的案例
    faultCases = allCases.filter(c => c.reviewStatus === 'approved');
    console.log(`Loaded ${faultCases.length} approved fault cases (total: ${allCases.length})`);
  } catch (error) {
    console.error('Error loading fault cases:', error);
    faultCases = [];
  }
};

// 初始化时加载
loadFaultCases();

// AI诊断
exports.diagnose = async (req, res) => {
  try {
    const { symptom, model, context } = req.body;

    if (!symptom) {
      return res.status(400).json({ error: '请输入故障现象' });
    }

    // 1. 关键词匹配
    const keywords = extractKeywords(symptom);
    console.log('Input symptom:', symptom);
    console.log('Extracted keywords:', keywords);
    
    const matchedCases = faultCases.filter(c => {
      // 检查案例的关键词是否在症状描述中
      const hasMatch = c.keywords.some(keyword => symptom.includes(keyword));
      if (hasMatch) {
        console.log(`✓ Matched case ${c.id}: ${c.symptom}`);
      }
      return hasMatch;
    });
    
    console.log('Matched cases count:', matchedCases.length);

    // 2. 调用百度文心一言API
    const aiResponse = await callBaiduAI(symptom, model, context, matchedCases);

    // 3. 返回诊断结果
    res.json({
      success: true,
      diagnosis: aiResponse,
      matchedCasesCount: matchedCases.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Diagnosis error:', error);
    res.status(500).json({ error: '诊断失败，请稍后重试' });
  }
};

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

// 调用AI API（优先通义千问，其次Kimi，最后百度）
async function callBaiduAI(symptom, model, context, matchedCases) {
  // 优先使用通义千问API
  const qwenApiKey = process.env.QWEN_API_KEY;
  if (qwenApiKey) {
    try {
      return await callQwenAPI(symptom, model, context, matchedCases, qwenApiKey);
    } catch (error) {
      console.error('Qwen API error:', error.response?.data || error.message);
      // 继续尝试Kimi API
    }
  }

  // 尝试Kimi API
  const kimiApiKey = process.env.KIMI_API_KEY;
  if (kimiApiKey) {
    try {
      return await callKimiAPI(symptom, model, context, matchedCases, kimiApiKey);
    } catch (error) {
      console.error('Kimi API error:', error.response?.data || error.message);
      // 继续尝试百度API
    }
  }

  // 尝试百度API
  const apiKey = process.env.BAIDU_API_KEY;
  const secretKey = process.env.BAIDU_SECRET_KEY;

  if (!apiKey || !secretKey) {
    // 如果没有配置任何API，返回基于案例库的结果
    return generateResultFromCases(symptom, matchedCases);
  }

  try {
    // 获取access_token
    const tokenResponse = await axios.post(
      `https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=${apiKey}&client_secret=${secretKey}`
    );
    const accessToken = tokenResponse.data.access_token;

    // 构建prompt
    const prompt = buildPrompt(symptom, model, context, matchedCases);

    // 调用文心一言API
    const response = await axios.post(
      `https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop/chat/completions?access_token=${accessToken}`,
      {
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      }
    );

    return parseAIResponse(response.data.result);

  } catch (error) {
    console.error('Baidu AI error:', error.response?.data || error.message);
    // 降级到基于案例库的结果
    return generateResultFromCases(symptom, matchedCases);
  }
}

// 调用通义千问API
async function callQwenAPI(symptom, model, context, matchedCases, apiKey) {
  const prompt = buildPrompt(symptom, model, context, matchedCases);
  const apiBase = process.env.QWEN_API_BASE || 'https://coding.dashscope.aliyuncs.com/v1';
  const qwenModel = process.env.QWEN_MODEL || 'qwen3.5-plus';

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
      max_tokens: 2000
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      }
    }
  );

  const aiResult = response.data.choices[0].message.content;
  return parseAIResponse(aiResult);
}

// 调用Kimi API
async function callKimiAPI(symptom, model, context, matchedCases, apiKey) {
  const prompt = buildPrompt(symptom, model, context, matchedCases);

  const response = await axios.post(
    'https://api.moonshot.cn/v1/chat/completions',
    {
      model: 'moonshot-v1-8k',
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 2000
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      }
    }
  );

  const aiResult = response.data.choices[0].message.content;
  return parseAIResponse(aiResult);
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

// 识别品牌
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

// 解析AI响应
function parseAIResponse(aiResult) {
  try {
    // 尝试提取JSON
    const jsonMatch = aiResult.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    
    // 如果无法解析，返回默认结构
    return {
      faultType: '未知',
      possibleCauses: [],
      steps: [],
      requiredTools: [],
      totalEstimatedTime: '未知',
      difficulty: '未知',
      needProfessionalRepair: false,
      rawResponse: aiResult
    };
  } catch (error) {
    console.error('Parse AI response error:', error);
    return {
      faultType: '未知',
      possibleCauses: [],
      steps: [],
      requiredTools: [],
      totalEstimatedTime: '未知',
      difficulty: '未知',
      needProfessionalRepair: false,
      rawResponse: aiResult
    };
  }
}

// 基于案例库生成结果
function generateResultFromCases(symptom, matchedCases) {
  console.log('generateResultFromCases called with:');
  console.log('  symptom:', symptom);
  console.log('  matchedCases.length:', matchedCases.length);
  
  if (matchedCases.length === 0) {
    console.log('  No matched cases, returning default');
    return {
      faultType: '未知',
      possibleCauses: [
        { cause: '案例库中未找到匹配案例', probability: '100%', description: '请提供更详细的故障描述' }
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
      difficulty: '未知',
      needProfessionalRepair: true
    };
  }

  // 返回最匹配的案例
  const bestMatch = matchedCases[0];
  console.log('  Returning best match:', bestMatch.id, bestMatch.symptom);
  return {
    faultType: bestMatch.faultType,
    possibleCauses: bestMatch.possibleCauses,
    steps: bestMatch.troubleshootingSteps,
    requiredTools: bestMatch.requiredTools,
    totalEstimatedTime: bestMatch.totalEstimatedTime,
    difficulty: bestMatch.difficulty,
    needProfessionalRepair: bestMatch.needProfessionalRepair
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

// 测试案例匹配
exports.testMatch = async (req, res) => {
  try {
    const { symptom } = req.query;
    
    if (!symptom) {
      return res.json({
        faultCasesCount: faultCases.length,
        faultCases: faultCases.map(c => ({ id: c.id, symptom: c.symptom, keywords: c.keywords }))
      });
    }
    
    const matchedCases = faultCases.filter(c => {
      return c.keywords.some(keyword => symptom.includes(keyword));
    });
    
    res.json({
      symptom,
      faultCasesCount: faultCases.length,
      matchedCasesCount: matchedCases.length,
      matchedCases: matchedCases.map(c => ({ id: c.id, symptom: c.symptom }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ========== 多轮对话相关接口 ==========

/**
 * 开始对话
 * 创建新的诊断会话，用户输入初始症状
 */
exports.startConversation = async (req, res) => {
  try {
    const { symptom, model } = req.body;

    if (!symptom) {
      return res.status(400).json({ error: '请输入故障现象' });
    }

    // 创建会话
    const sessionId = sessionService.createSession();
    
    // 添加用户初始症状到对话历史
    sessionService.addMessage(sessionId, {
      role: 'user',
      content: symptom,
      type: 'symptom'
    });

    // 关键词匹配
    const matchedCases = faultCases.filter(c => {
      return c.keywords.some(keyword => symptom.includes(keyword));
    });

    // 判断用户意图
    const intent = analyzeUserIntent(symptom);
    console.log('='.repeat(50));
    console.log('[Intent Analysis] Message:', symptom);
    console.log('[Intent Analysis] Result:', intent);
    console.log('='.repeat(50));

    // 如果是咨询类问题，先回答
    if (intent.type === 'inquiry') {
      console.log('[INFO] Handling as inquiry...');
      const inquiryResponse = await answerInquiry(symptom, matchedCases);
      
      // 添加AI回答到对话历史
      sessionService.addMessage(sessionId, {
        role: 'assistant',
        content: inquiryResponse.answer,
        type: 'answer'
      });

      // 添加追问到对话历史
      sessionService.addMessage(sessionId, {
        role: 'assistant',
        content: inquiryResponse.followUp.question,
        type: 'question',
        options: inquiryResponse.followUp.options
      });

      res.json({
        success: true,
        sessionId,
        answer: inquiryResponse.answer, // 先回答问题
        question: inquiryResponse.followUp.question, // 再追问
        options: inquiryResponse.followUp.options,
        currentRound: 1,
        maxRounds: 15,
        intent: 'inquiry' // 标记意图类型
      });

    } else {
      // 如果是故障类问题，直接开始诊断
      const question = await generateFollowUpQuestion(sessionId, symptom, model, matchedCases);

      // 添加AI追问到对话历史
      sessionService.addMessage(sessionId, {
        role: 'assistant',
        content: question.question,
        type: 'question',
        options: question.options
      });

      res.json({
        success: true,
        sessionId,
        question: question.question,
        options: question.options,
        currentRound: 1,
        maxRounds: 15,
        intent: 'diagnosis' // 标记意图类型
      });
    }

  } catch (error) {
    console.error('Start conversation error:', error);
    res.status(500).json({ error: '启动对话失败' });
  }
};

/**
 * 继续对话
 * 用户回答追问，AI继续追问或给出诊断
 */
exports.continueConversation = async (req, res) => {
  try {
    const { sessionId, answer, model } = req.body;

    if (!sessionId || !answer) {
      return res.status(400).json({ error: '缺少必要参数' });
    }

    // 获取会话
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

    // 检查是否可以继续追问
    const canAskMore = sessionService.canAskMore(sessionId);

    if (canAskMore) {
      // 继续追问
      const question = await generateFollowUpQuestion(
        sessionId, 
        null, 
        model, 
        [],
        session.conversationHistory
      );

      // AI 判断信息足够，直接给出诊断
      if (question.shouldDiagnose && question.diagnosis) {
        const diagnosis = question.diagnosis;

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
          currentRound: session.currentRound + 1,
          maxRounds: 15,
          status: 'completed'
        });
        return;
      }

      sessionService.addMessage(sessionId, {
        role: 'assistant',
        content: question.question,
        type: 'question',
        options: question.options
      });

      res.json({
        success: true,
        sessionId,
        question: question.question,
        options: question.options,
        currentRound: session.currentRound + 1,
        maxRounds: 15,
        status: 'continue'
      });

    } else {
      // 给出最终诊断
      const diagnosis = await generateFinalDiagnosis(sessionId, model);

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
        maxRounds: 15,
        status: 'completed'
      });
    }

  } catch (error) {
    console.error('Continue conversation error:', error);
    console.error('Error stack:', error.stack);
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
 * 生成最终诊断
 */
async function generateFinalDiagnosis(sessionId, model) {
  const session = sessionService.getSession(sessionId);
  if (!session) {
    throw new Error('Session not found');
  }

  const qwenApiKey = process.env.QWEN_API_KEY;
  
  if (!qwenApiKey) {
    // 如果没有API，返回基于案例库的诊断
    return generateResultFromCases(session.conversationHistory[0]?.content || '', []);
  }

  try {
    const apiBase = process.env.QWEN_API_BASE || 'https://coding.dashscope.aliyuncs.com/v1';
    const qwenModel = process.env.QWEN_MODEL || 'qwen3.5-plus';

    // 构建完整的诊断prompt
    const conversationContext = session.conversationHistory
      .map(msg => `${msg.role === 'user' ? '用户' : 'AI'}: ${msg.content}`)
      .join('\n');

    let prompt = `你是一位专业的无人机故障诊断专家，拥有10年维修经验。

对话历史:
${conversationContext}

根据以上对话历史，请给出最终诊断结果。

请按照以下步骤进行诊断:

1. 故障现象分析
   - 提取关键故障现象
   - 判断故障类型(动力系统/导航系统/图传系统/云台系统/电源系统/传感器系统/喷洒系统/雷达系统)

2. 可能原因列举
   - 列出3-5个最可能的原因
   - 按概率从高到低排序
   - 每个原因包含概率和描述

3. 排查步骤生成
   - 生成5步以内的排查步骤
   - 每步包含:步骤编号、操作、判断标准、解决方案、所需工具、预计时间

4. 所需工具与时间
   - 列出所需工具
   - 预估维修总时间

5. 难度评估
   - 评估维修难度(1-5星)
   - 判断是否需要专业维修

请输出结构化的诊断结果，格式如下:
{
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
        max_tokens: 2000
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${qwenApiKey}`
        }
      }
    );

    const aiResult = response.data.choices[0].message.content;
    return parseAIResponse(aiResult);

  } catch (error) {
    console.error('Generate final diagnosis error:', error.response?.data || error.message);
    return generateResultFromCases(session.conversationHistory[0]?.content || '', []);
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
