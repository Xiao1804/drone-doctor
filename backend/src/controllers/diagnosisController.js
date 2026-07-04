const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const sessionService = require('../services/sessionService');
const freeUsageService = require('../services/freeUsageService');
const deepSeekService = require('../services/deepSeekService');
const { run } = require('../db');

// ========== 内联诊断服务（原 DiagnosisService.js 核心逻辑，已内联避免维护负担）==========

const FAULT_CASES_FILE = path.join(__dirname, '../../data/fault-cases-enhanced.json');
let faultCases = [];
let faultCasesLoading = null;

async function loadFaultCases() {
  if (faultCasesLoading) return faultCasesLoading;
  faultCasesLoading = (async () => {
    try {
      const data = await fs.readFile(FAULT_CASES_FILE, 'utf-8');
      const allCases = JSON.parse(data);
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
}

function getFaultCases() {
  return faultCases;
}

const SYNONYM_MAP = {
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

function similarity(a, b) {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshteinDistance(a, b) / maxLen;
}

function expandKeywords(keywords) {
  const expanded = new Set(keywords);
  for (const keyword of keywords) {
    for (const [canonical, synonyms] of Object.entries(SYNONYM_MAP)) {
      if (canonical === keyword || synonyms.includes(keyword)) {
        expanded.add(canonical);
        synonyms.forEach(s => expanded.add(s));
      }
    }
  }
  return Array.from(expanded);
}

function matchCasesSmart(symptom, cases) {
  const results = [];
  for (const c of cases) {
    let maxScore = 0;
    let matchReason = '';
    for (const keyword of c.keywords) {
      if (symptom.includes(keyword)) {
        maxScore = Math.max(maxScore, 1.0);
        matchReason = `精确匹配: "${keyword}"`;
      }
      const expanded = expandKeywords([keyword]);
      for (const syn of expanded) {
        if (syn !== keyword && symptom.includes(syn)) {
          maxScore = Math.max(maxScore, 0.9);
          matchReason = `同义词匹配: "${keyword}"→"${syn}"`;
        }
      }
    }
    if (maxScore < 0.7) {
      for (const keyword of c.keywords) {
        const symptomWords = symptom.split(/[\s,，.。!！?？]+/);
        for (const word of symptomWords) {
          if (word.length >= 2 && keyword.length >= 2) {
            const sim = similarity(word, keyword);
            if (sim >= 0.75) {
              maxScore = Math.max(maxScore, sim * 0.8);
              matchReason = `模糊匹配: "${word}"≈"${keyword}" (相似度${(sim * 100).toFixed(0)}%)`;
            }
          }
        }
      }
    }
    if (maxScore > 0) {
      results.push({ case: c, score: maxScore, reason: matchReason });
    }
  }
  results.sort((a, b) => b.score - a.score);
  return results;
}

function getModelConfig() {
  return deepSeekService.getConfig();
}

async function callAIWithRetry(apiCallFn, maxRetries = 2) {
  let lastError;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await apiCallFn();
    } catch (error) {
      lastError = error;
      console.error(`[AI Retry ${i + 1}/${maxRetries + 1}]`, error.response?.data?.error?.message || error.message);
      if (i < maxRetries) await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw lastError;
}

function identifyBrand(symptom, model) {
  const brands = {
    '大疆(DJI)': { keywords: ['Mavic', 'Air', 'Mini', 'Phantom', 'T30', 'T40', 'Matrice', 'Inspire', 'DJI', '大疆'] },
    '道通(Autel)': { keywords: ['EVO', 'Nano', 'Lite', 'Autel', '道通'] },
    '极飞(XAG)': { keywords: ['XAG', '极飞', 'P100', 'P80', 'V40'] },
    '哈博森(Hubsan)': { keywords: ['Hubsan', 'Zino', '哈博森'] },
  };
  const text = `${symptom} ${model || ''}`;
  for (const [brand, info] of Object.entries(brands)) {
    if (info.keywords.some(kw => text.includes(kw))) return { brand, description: info.description || '' };
  }
  return null;
}

function buildPromptV2(symptom, model, context, matchedCases) {
  const brandInfo = identifyBrand(symptom, model);
  let casesText = '';
  if (matchedCases.length > 0) {
    casesText = matchedCases.slice(0, 3).map((item, index) => {
      const c = item.case || item;
      const score = item.score ? `（匹配度${(item.score * 100).toFixed(0)}%）` : '';
      return `案例${index + 1}${score}:\n- 症状: ${c.symptom}\n- 适用机型: ${Array.isArray(c.applicableModels) ? c.applicableModels.join('、') : c.applicableModels}\n- 故障类型: ${c.faultType}\n- 常见原因: ${Array.isArray(c.possibleCauses) ? c.possibleCauses.map(ca => ca.cause || ca).join('、') : c.possibleCauses}`;
    }).join('\n');
  }
  const systemPrompt = `你是一位拥有10年经验的资深无人机维修工程师。请输出JSON格式诊断结果。概率用百分比，estimatedTime用"X分钟"，difficulty用1-5，needProfessionalRepair用布尔值。thinking字段必须包含推理过程。`;
  const userPrompt = `请对以下无人机故障进行专业诊断。\n\n故障现象: ${symptom}\n型号: ${model || '未指定'}\n补充信息: ${context || '无'}\n${brandInfo ? `品牌识别: ${brandInfo.brand}` : ''}\n\n${casesText ? `【参考案例】\n${casesText}\n` : ''}\n请输出JSON格式诊断结果，包含 thinking, brand, model, faultType, analysis, possibleCauses, steps, requiredTools, totalEstimatedTime, difficulty, needProfessionalRepair, safetyNotes 字段。`;
  return { systemPrompt, userPrompt };
}

function createDefaultResponse(rawResponse) {
  return {
    thinking: ['无法解析AI返回内容，使用默认响应'],
    brand: '未知', model: '未知', faultType: '未知',
    analysis: 'AI返回格式不正确，无法解析诊断结果',
    possibleCauses: [{ cause: '解析失败', probability: '100%', description: 'AI输出格式不符合预期，请重试' }],
    steps: [{ step: 1, operation: '请重新描述故障现象', criteria: '获得有效诊断', solution: '重新提交问题', tools: [], estimatedTime: '-' }],
    requiredTools: [], totalEstimatedTime: '-', difficulty: '1',
    needProfessionalRepair: true, safetyNotes: '',
    rawResponse: (rawResponse || '').substring(0, 1000)
  };
}

function normalizeDiagnosisResponse(parsed, rawResponse) {
  const defaults = createDefaultResponse(rawResponse);
  const normalized = {
    thinking: Array.isArray(parsed.thinking) ? parsed.thinking : (parsed.thinking ? [parsed.thinking] : defaults.thinking),
    brand: parsed.brand || defaults.brand,
    model: parsed.model || defaults.model,
    faultType: parsed.faultType || parsed.fault_type || defaults.faultType,
    analysis: parsed.analysis || defaults.analysis,
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
    safetyNotes: parsed.safetyNotes || parsed.safety_notes || ''
  };
  return { ...parsed, ...normalized };
}

function parseAIResponse(aiResult) {
  let parsed = null;
  const errors = [];
  try {
    const codeBlockMatch = aiResult.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) parsed = JSON.parse(codeBlockMatch[1].trim());
  } catch (e) { errors.push('codeBlock:' + e.message); }
  if (!parsed) {
    try {
      const firstBrace = aiResult.indexOf('{');
      const lastBrace = aiResult.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        parsed = JSON.parse(aiResult.slice(firstBrace, lastBrace + 1));
      }
    } catch (e) { errors.push('braceExtract:' + e.message); }
  }
  if (!parsed) {
    try { parsed = JSON.parse(aiResult.trim()); } catch (e) { errors.push('directParse:' + e.message); }
  }
  if (!parsed) {
    try {
      let fixed = aiResult.replace(/```json\s*/g, '').replace(/```\s*$/g, '');
      const jsonStart = fixed.indexOf('{');
      const jsonEnd = fixed.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1) {
        fixed = fixed.slice(jsonStart, jsonEnd + 1).replace(/,\s*([}\]])/g, '$1').replace(/'/g, '"');
        parsed = JSON.parse(fixed);
      }
    } catch (e) { errors.push('fixAndParse:' + e.message); }
  }
  if (!parsed) {
    console.error('[parseAIResponse] All parsing strategies failed:', errors.join('; '));
    return createDefaultResponse(aiResult);
  }
  return normalizeDiagnosisResponse(parsed, aiResult);
}

async function callDeepSeekAPI(symptom, model, context, matchedCases, config) {
  const { systemPrompt, userPrompt } = buildPromptV2(symptom, model, context, matchedCases);
  const content = await deepSeekService.chatCompletion({
    config,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.2,
    maxTokens: 2500,
    responseFormat: { type: 'json_object' },
  });
  return parseAIResponse(content);
}

async function callTextDiagnosisAI(symptom, model, context, matchedCases) {
  const config = getModelConfig();
  if (config.apiKey) {
    try {
      return await callAIWithRetry(() => callDeepSeekAPI(symptom, model, context, matchedCases, config));
    } catch (error) {
      console.error('[DeepSeek] Text diagnosis failed:', error.message);
    }
  }
  console.warn('[AI] DeepSeek unavailable, falling back to case-based diagnosis');
  return generateResultFromCases(symptom, matchedCases);
}

function calculateConfidence(symptom, matchedResults, aiResponse) {
  let score = 0.5;
  if (matchedResults.length > 0) {
    const topScore = matchedResults[0].score;
    if (topScore >= 0.9) score += 0.3;
    else if (topScore >= 0.7) score += 0.2;
    else if (topScore >= 0.5) score += 0.1;
  }
  if (aiResponse.possibleCauses && aiResponse.possibleCauses.length >= 3) score += 0.05;
  if (aiResponse.steps && aiResponse.steps.length >= 3) score += 0.05;
  const symptomLen = symptom.length;
  if (symptomLen >= 20) score += 0.1;
  else if (symptomLen >= 10) score += 0.05;
  return Math.min(score, 1.0);
}

function generateResultFromCases(symptom, matchedCases) {
  if (matchedCases.length === 0) {
    return createDefaultResponse('');
  }
  const bestMatchRaw = matchedCases[0];
  const bestMatch = bestMatchRaw.case || bestMatchRaw;
  return {
    brand: bestMatch.brand || '未知', model: bestMatch.model || '未知', faultType: bestMatch.faultType || '未知',
    analysis: `根据案例库匹配，最可能的故障是：${bestMatch.symptom}`,
    possibleCauses: Array.isArray(bestMatch.possibleCauses) ? bestMatch.possibleCauses : [{ cause: '未知', probability: '100%', description: '' }],
    steps: Array.isArray(bestMatch.troubleshootingSteps) ? bestMatch.troubleshootingSteps : [{ step: 1, operation: '参考案例排查', criteria: '问题解决', solution: '按参考案例步骤操作', tools: [], estimatedTime: '-' }],
    requiredTools: Array.isArray(bestMatch.requiredTools) ? bestMatch.requiredTools : [],
    totalEstimatedTime: bestMatch.totalEstimatedTime || '-',
    difficulty: String(bestMatch.difficulty || '1'),
    needProfessionalRepair: !!bestMatch.needProfessionalRepair,
    safetyNotes: bestMatch.safetyNotes || ''
  };
}

/**
 * 单轮快速诊断（已内联原 DiagnosisService.diagnose）
 */
async function diagnoseLegacy(symptom, model, context, deviceType) {
  if (!symptom) throw new Error('请输入故障现象');
  if (faultCases.length === 0) await loadFaultCases();

  let matchedResults = matchCasesSmart(symptom, faultCases);
  console.log(`[Keyword] Smart matched ${matchedResults.length} cases`);
  if (matchedResults.length > 0) {
    matchedResults.slice(0, 5).forEach(r => console.log(`  [${(r.score * 100).toFixed(0)}%] ${r.case.id}: ${r.case.symptom} (${r.reason})`));
  }

  const aiResponse = await callTextDiagnosisAI(symptom, model, context, matchedResults);
  const confidence = calculateConfidence(symptom, matchedResults, aiResponse);

  return {
    aiResponse,
    matchedResults,
    semanticMatches: [],
    confidence: Math.round(confidence * 100) / 100,
    searchMethod: 'keyword',
    fromCache: false,
  };
}

/**
 * 多轮对话最终诊断（已内联原 DiagnosisService.generateFinalDiagnosis）
 */
async function generateFinalDiagnosisLegacy(symptom, model, fullContext, matchedResults, conversationContext = '') {
  const config = getModelConfig();
  if (!config.apiKey) {
    console.warn('[Final Diagnosis] No AI API configured, using case-based fallback');
    return generateResultFromCases(symptom, matchedResults);
  }
  try {
    const { systemPrompt, userPrompt } = buildPromptV2(symptom, model, fullContext, matchedResults);
    const enhancedUserPrompt = conversationContext ? `${userPrompt}\n\n【完整对话记录】\n${conversationContext}\n\n请根据以上所有信息，给出最终诊断结果。` : userPrompt;
    const aiResult = await callAIWithRetry(() => deepSeekService.chatCompletion({
      config,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: enhancedUserPrompt },
      ],
      temperature: 0.2,
      maxTokens: 2500,
      responseFormat: { type: 'json_object' },
    }));
    return parseAIResponse(aiResult);
  } catch (error) {
    console.error('Generate final diagnosis error:', error.response?.data || error.message);
    return generateResultFromCases(symptom, matchedResults);
  }
}

// 初始化加载案例库
loadFaultCases();

// AI诊断（Phase 1: 语义检索增强版）
exports.diagnose = async (req, res, next) => {
  try {
    const { symptom, model, context, deviceType } = req.body;

    if (!symptom) {
      return res.status(400).json({ error: '请输入故障现象' });
    }

    // 调用诊断服务（已内联）
    const result = await diagnoseLegacy(symptom, model, context, deviceType);
    const { aiResponse, matchedResults, semanticMatches, confidence, searchMethod, fromCache } = result;

    const diagnosisId = `diag_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // 自动埋点：诊断完成事件
    try {
      await run(
        "INSERT INTO events (event, data, ip) VALUES (?, ?, ?)",
        [
          'diagnosis_complete',
          JSON.stringify({
            diagnosis_id: diagnosisId,
            device_type: deviceType || '',
            fault_type: req.body.faultType || '',
            steps_count: aiResponse.steps?.length || 0,
            difficulty: aiResponse.difficulty || '1',
            search_method: searchMethod,
            confidence: confidence,
            from_cache: !!fromCache
          }),
          req.ip || ''
        ]
      );
    } catch (trackErr) {
      console.warn('[Track] diagnosis_complete event failed:', trackErr.message);
    }

    // 消耗免费诊断次数
    if (req.freeUsage?.identifier) {
      await freeUsageService.incrementUsage(req.freeUsage.identifier);
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
      confidence: confidence,
      searchMethod: searchMethod,
      fromCache: !!fromCache,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Diagnosis error:', error);
    res.status(500).json({ error: '诊断失败，请稍后重试' });
  }
};


// 获取故障案例
exports.getCase = async (req, res) => {
  try {
    const { id } = req.params;
    const faultCases = getFaultCases();
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
    
    const faultCases = getFaultCases();
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
exports.getFaultCases = () => getFaultCases();

// 测试案例匹配（优化版：使用 matchCasesSmart）
exports.testMatch = async (req, res) => {
  try {
    const { symptom } = req.query;
    
    const faultCases = getFaultCases();
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

    const faultCases = getFaultCases();
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

      // 消耗免费诊断次数
      if (req.freeUsage?.identifier) {
        await freeUsageService.incrementUsage(req.freeUsage.identifier);
      }

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

      // 消耗免费诊断次数
      if (req.freeUsage?.identifier) {
        await freeUsageService.incrementUsage(req.freeUsage.identifier);
      }

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

      // 消耗免费诊断次数
      if (req.freeUsage?.identifier) {
        await freeUsageService.incrementUsage(req.freeUsage.identifier);
      }

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
      const matchedResults = matchCasesSmart(fullSymptom, getFaultCases());
      
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
  
  // 2. 尝试使用 DeepSeek API
  const deepSeekConfig = getModelConfig();
  
  if (!deepSeekConfig.apiKey) {
    // 3. API 不可用，返回通用回答
    return {
      answer: '您好！我是无人机诊断助手，可以帮您解答无人机相关问题。请问您想了解哪方面的信息？比如：\n• 品牌介绍（大疆、道通、极飞等）\n• 产品对比\n• 故障诊断\n• 使用技巧',
      followUp: {
        question: '请问您是否遇到了无人机故障问题？',
        options: ['是的，有故障', '只是咨询一下', '其他问题']
      }
    };
  }

  console.log('[API] Using DeepSeek API for inquiry');

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

    const aiResult = await deepSeekService.chatCompletion({
      config: deepSeekConfig,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      maxTokens: 500,
      responseFormat: { type: 'json_object' },
    });
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
  const deepSeekConfig = getModelConfig();
  
  if (!deepSeekConfig.apiKey) {
    // 如果没有API，返回默认追问
    return getDefaultQuestion(sessionId, symptom);
  }

  try {
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

    const aiResult = await deepSeekService.chatCompletion({
      config: deepSeekConfig,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      maxTokens: 500,
      responseFormat: { type: 'json_object' },
    });
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
 * 生成最终诊断（调用 DiagnosisService）
 */
async function generateFinalDiagnosis(sessionId, model, matchedResults = []) {
  const session = sessionService.getSession(sessionId);
  if (!session) {
    throw new Error('Session not found');
  }

  const collectedInfo = sessionService.getCollectedInfo(sessionId);
  const fullContext = Object.entries(collectedInfo)
    .map(([k, v]) => {
      const labels = { brand: '品牌', model: '型号', symptom: '故障现象', environment: '发生环境', attempted: '已尝试排查' };
      return `${labels[k] || k}: ${v}`;
    })
    .join('\n');

  const symptom = collectedInfo.symptom || session.conversationHistory[0]?.content || '';
  const droneModel = model || collectedInfo.model || '';
  const conversationContext = sessionService.getConversationContext(sessionId);

  return generateFinalDiagnosisLegacy(symptom, droneModel, fullContext, matchedResults, conversationContext);
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
