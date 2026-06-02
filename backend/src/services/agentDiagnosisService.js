const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');

/**
 * 智能体诊断服务 (Agent Diagnosis Service) - v1.0
 *
 * 核心设计：
 * 1. 知识库驱动 —— 从结构化文档中检索相关资料
 * 2. 意图解析 —— 提取品牌、型号、故障类型
 * 3. 决策生成 —— 基于检索结果判断是否有足够资料支持诊断
 *
 * 覆盖范围：全部故障类型（5个决策树 + 129个案例）
 */

// ========== 配置 ==========
const KNOWLEDGE_BASE_PATH = path.join(__dirname, '../../data/knowledge-base.json');

// 品牌/型号关键词映射
const BRAND_MAP = {
  'dji': ['dji', '大疆', 'dj'],
  'autel': ['autel', '道通'],
  'jifei': ['jifei', '极飞', 'xpeng', 'xag'],
};

const MODEL_MAP = {
  'mavic': ['mavic', '御'],
  'air': ['air', 'air 2', 'air2', 'air 3', 'air3'],
  'mini': ['mini', 'mini 2', 'mini2', 'mini 3', 'mini3', 'mini 4', 'mini4'],
  'phantom': ['phantom', '精灵'],
  'inspire': ['inspire', '悟'],
  'agras': ['agras', 't', 't16', 't20', 't30', 't40', 't50', '植保'],
  'matrice': ['matrice', 'm300', 'm350', 'm30'],
};

// 故障类型关键词映射（全量）
const FAULT_TYPE_MAP = {
  // 电源/电池
  'battery': ['电池', '充电', '续航', '电量', '鼓包', '电压', '电源', '充电器', '充电管家'],
  'power_on': ['无法开机', '开不了机', '没反应', '不启动', '按电源', '电源键', '开机'],

  // 云台
  'gimbal': ['云台', '云台抖动', '云台卡住', '云台偏移', '云台不转', '云台异常', '云台自检', '云台歪'],

  // 图传/影像
  'video': ['图传', '图传异常', '图传黑屏', '无画面', '画面卡顿', '图传断', '图像', '视频', '花屏'],
  'camera': ['相机', '拍照', '录像', '摄像头', '镜头', '画面模糊', '拍照失败', '无法录像'],

  // 飞行/动力
  'power_system': ['动力', '电机', '电机不转', '电机异响', '转速异常', '螺旋桨', '桨叶', '起飞', '无法起飞'],
  'flight': ['飞行', '飞行异常', '飞行不稳', '抖动', '晃动', '漂移', '悬停', '定高'],

  // 导航/传感器
  'gps': ['GPS', '导航', '定位', '信号弱', '搜星', '卫星', '定位不准', '指南针', '磁罗盘'],
  'sensor': ['传感器', '避障', '视觉', '红外', '超声波', '雷达', 'TOF', '避障失效'],
  'imu': ['IMU', '姿态', '校准', '水平', '倾斜', '翻滚'],

  // 通信/遥控
  'remote': ['遥控', '遥控器', '信号中断', '失联', '断连', '图传距离', '控制距离'],
  'communication': ['通信', '连接', 'WiFi', '蓝牙', '链路', '图传信号'],

  // 喷洒（植保机）
  'spray': ['喷洒', '喷头', '水泵', '流量', '药箱', '漏药', '堵塞', '雾化'],

  // 其他
  'landing': ['降落', '返航', '迫降', '着陆', '落地'],
  'noise': ['噪音', '异响', '震动', '振动'],
  'overheat': ['过热', '高温', '温度', '散热'],
  'water': ['进水', '涉水', '防水', '潮湿'],
  'crash': ['坠机', '摔机', '碰撞', '炸机', '坠毁'],
};

// ========== 状态 ==========
let knowledgeBase = null;
let knowledgeLoaded = false;

// ========== 知识库加载 ==========

/**
 * 加载知识库
 */
async function loadKnowledgeBase() {
  if (knowledgeLoaded) return knowledgeBase;

  try {
    const data = await fs.readFile(KNOWLEDGE_BASE_PATH, 'utf-8');
    knowledgeBase = JSON.parse(data);
    knowledgeLoaded = true;
    console.log(`[Agent] Knowledge base loaded: ${knowledgeBase.domain}, ${knowledgeBase.documents.length} documents`);
    return knowledgeBase;
  } catch (err) {
    console.error('[Agent] Failed to load knowledge base:', err.message);
    throw err;
  }
}

/**
 * 获取知识库状态
 */
function getKnowledgeStatus() {
  return {
    loaded: knowledgeLoaded,
    domain: knowledgeBase?.domain || null,
    documentCount: knowledgeBase?.documents?.length || 0,
  };
}

// ========== 检索引擎 (MVP: 关键词匹配) ==========

/**
 * 关键词匹配检索
 * @param {string} query - 用户查询
 * @param {number} topK - 返回数量
 * @returns {Array<{doc: object, score: number, matchReason: string}>}
 */
function retrieveDocuments(query, topK = 5) {
  if (!knowledgeBase || !knowledgeBase.documents) {
    return [];
  }

  const queryLower = query.toLowerCase();
  const queryWords = extractWords(queryLower);

  const scored = knowledgeBase.documents.map(doc => {
    let score = 0;
    const reasons = [];

    // 1. 标题匹配 (权重高)
    const titleWords = extractWords(doc.title.toLowerCase());
    const titleMatches = countMatches(queryWords, titleWords);
    if (titleMatches > 0) {
      score += titleMatches * 3;
      reasons.push(`标题匹配: ${titleMatches}`);
    }

    // 2. 关键词匹配
    if (doc.keywords && doc.keywords.length > 0) {
      const kwMatches = doc.keywords.filter(kw => queryLower.includes(kw.toLowerCase())).length;
      if (kwMatches > 0) {
        score += kwMatches * 2;
        reasons.push(`关键词匹配: ${kwMatches}`);
      }
    }

    // 3. 内容匹配
    const contentWords = extractWords(doc.content.toLowerCase());
    const contentMatches = countMatches(queryWords, contentWords);
    if (contentMatches > 0) {
      score += contentMatches * 0.5;
      reasons.push(`内容匹配: ${contentMatches}`);
    }

    // 4. 故障类型匹配
    if (doc.faultTypes) {
      const ftMatches = doc.faultTypes.filter(ft => queryLower.includes(ft.toLowerCase())).length;
      if (ftMatches > 0) {
        score += ftMatches * 1.5;
        reasons.push(`故障类型匹配: ${ftMatches}`);
      }
    }

    // 5. 类型加权：决策树和终端节点权重更高
    if (doc.type === 'decision_tree') score += 2;
    if (doc.type === 'tree_node') score += 1.5;

    return {
      doc,
      score,
      matchReason: reasons.join('; ') || '无明确匹配',
    };
  });

  // 过滤低分并排序
  const filtered = scored.filter(s => s.score > 0);
  filtered.sort((a, b) => b.score - a.score);

  return filtered.slice(0, topK);
}

/**
 * 提取中文/英文单词
 */
function extractWords(text) {
  // 中文按字分，英文按词分
  const words = [];
  // 提取中文字符
  const chineseChars = text.match(/[\u4e00-\u9fff]/g) || [];
  words.push(...chineseChars);
  // 提取英文单词
  const englishWords = text.match(/[a-z0-9]+/g) || [];
  words.push(...englishWords);
  return words;
}

/**
 * 计算两个词数组的匹配数
 */
function countMatches(queryWords, targetWords) {
  const targetSet = new Set(targetWords);
  let count = 0;
  for (const word of queryWords) {
    if (targetSet.has(word)) count++;
  }
  return count;
}

// ========== 意图解析 ==========

/**
 * 解析用户意图，提取关键信息
 * @param {string} query - 用户原始输入
 * @returns {object} { brand, model, faultType, symptom, confidence }
 */
function parseIntent(query) {
  const lower = query.toLowerCase();
  const result = {
    brand: null,
    model: null,
    faultType: null,
    symptom: query,
    confidence: 0,
  };

  let matchCount = 0;

  // 解析品牌
  for (const [brand, aliases] of Object.entries(BRAND_MAP)) {
    if (aliases.some(a => lower.includes(a))) {
      result.brand = brand;
      matchCount++;
      break;
    }
  }

  // 解析型号
  for (const [model, aliases] of Object.entries(MODEL_MAP)) {
    if (aliases.some(a => lower.includes(a))) {
      result.model = model;
      matchCount++;
      break;
    }
  }

  // 解析故障类型（电池域）
  for (const [ftype, aliases] of Object.entries(FAULT_TYPE_MAP)) {
    if (aliases.some(a => lower.includes(a))) {
      result.faultType = ftype;
      matchCount++;
      break;
    }
  }

  // 置信度计算
  result.confidence = Math.min(0.9, 0.3 + matchCount * 0.2);

  return result;
}

// ========== 决策生成 ==========

/**
 * 生成诊断结果
 * @param {string} query - 用户查询
 * @param {object} intent - 解析后的意图
 * @param {Array} retrievedDocs - 检索到的文档
 * @returns {object} 诊断结果
 */
function generateDiagnosis(query, intent, retrievedDocs) {
  // 分类检索结果
  const treeDoc = retrievedDocs.find(r => r.doc.type === 'decision_tree');
  const caseDocs = retrievedDocs.filter(r => r.doc.type === 'case');
  const nodeDocs = retrievedDocs.filter(r => r.doc.type === 'tree_node');

  const topScore = retrievedDocs.length > 0 ? retrievedDocs[0].score : 0;

  // 判断资料充分性
  const hasTree = !!treeDoc;
  const hasCases = caseDocs.length > 0;
  const hasNodes = nodeDocs.length > 0;

  // 决策模式
  if (hasTree && topScore >= 3) {
    // 模式A：有决策树 + 匹配度高 → 推荐执行决策树
    return generateTreeModeResult(query, intent, treeDoc, caseDocs, nodeDocs, retrievedDocs);
  } else if (hasCases && topScore >= 2) {
    // 模式B：有案例但无决策树（或匹配度中等）→ 基于案例给建议
    return generateCaseModeResult(query, intent, caseDocs);
  } else {
    // 模式C：资料不足 → 建议提供更多信息
    return generateInsufficientResult(query, intent);
  }
}

/**
 * 模式A：决策树模式 —— 推荐执行决策树排查
 */
function generateTreeModeResult(query, intent, treeDoc, caseDocs, nodeDocs, retrievedDocs) {
  const tree = treeDoc.doc;

  // 构建预测路径（基于匹配的终端节点）
  const predictedNodes = nodeDocs.slice(0, 3).map(n => ({
    id: n.doc.nodeId,
    title: n.doc.title,
    reason: n.matchReason,
  }));

  // 生成可能原因列表
  const possibleCauses = [];
  caseDocs.slice(0, 3).forEach(c => {
    if (c.doc.content) {
      const causeMatch = c.doc.content.match(/可能原因[：:](.+?)(?=排查步骤|$)/s);
      if (causeMatch) {
        possibleCauses.push({
          caseId: c.doc.caseId,
          title: c.doc.title,
          summary: causeMatch[1].trim().substring(0, 200),
        });
      }
    }
  });

  // 生成回答文本
  let answer = `根据您的描述，这属于**${tree.title}**范围。\n\n`;
  answer += `📋 **建议排查流程**：\n${tree.summary}\n\n`;

  if (predictedNodes.length > 0) {
    answer += `🔍 **最可能的故障方向**：\n`;
    predictedNodes.forEach((n, i) => {
      answer += `${i + 1}. ${n.title}\n`;
    });
    answer += '\n';
  }

  if (possibleCauses.length > 0) {
    answer += `⚠️ **可能原因参考**：\n`;
    possibleCauses.forEach(c => {
      answer += `- ${c.title}：${c.summary}\n`;
    });
    answer += '\n';
  }

  answer += `💡 **建议**：点击下方按钮进入**交互式排查向导**，按步骤确认故障原因。`;

  return {
    mode: 'tree_recommendation',
    canDiagnose: true,
    confidence: Math.min(0.95, 0.5 + treeDoc.score * 0.05),
    answer,
    treeId: tree.id,
    treeName: tree.name,
    predictedPath: predictedNodes,
    relatedCases: caseDocs.slice(0, 5).map(c => ({
      caseId: c.doc.caseId,
      title: c.doc.title,
      score: c.score,
    })),
    intent,
    sources: retrievedDocs.map(r => ({
      id: r.doc.id,
      type: r.doc.type,
      title: r.doc.title,
      score: r.score,
    })),
  };
}

/**
 * 模式B：案例模式 —— 基于相似案例给建议
 */
function generateCaseModeResult(query, intent, caseDocs) {
  const topCase = caseDocs[0].doc;

  let answer = `根据您的描述，找到了相似的故障案例：\n\n`;
  answer += `📌 **${topCase.title}**（案例${topCase.caseId}）\n`;
  answer += `${topCase.content}\n\n`;

  if (caseDocs.length > 1) {
    answer += `📚 **其他相关案例**：\n`;
    caseDocs.slice(1, 4).forEach(c => {
      answer += `- ${c.doc.title}（${c.doc.caseId}）\n`;
    });
    answer += '\n';
  }

  answer += `💡 **建议**：如果您能确认品牌型号，我可以推荐更精确的排查流程。`;

  return {
    mode: 'case_reference',
    canDiagnose: true,
    confidence: Math.min(0.8, 0.4 + caseDocs[0].score * 0.05),
    answer,
    relatedCases: caseDocs.slice(0, 5).map(c => ({
      caseId: c.doc.caseId,
      title: c.doc.title,
      score: c.score,
    })),
    intent,
    sources: caseDocs.map(r => ({
      id: r.doc.id,
      type: r.doc.type,
      title: r.doc.title,
      score: r.score,
    })),
  };
}

/**
 * 模式C：资料不足 —— 需要更多信息
 */
function generateInsufficientResult(query, intent) {
  let answer = `感谢您的描述。为了给出准确的诊断，我还需要了解一些信息：\n\n`;

  const missing = [];
  if (!intent.brand) missing.push('无人机品牌（如大疆、道通）');
  if (!intent.model) missing.push('具体型号（如Mavic 3、Air 2S）');
  if (!intent.faultType) missing.push('故障表现的具体细节');

  if (missing.length > 0) {
    answer += `❓ **请补充以下信息**：\n`;
    missing.forEach((m, i) => {
      answer += `${i + 1}. ${m}\n`;
    });
  } else {
    answer += `您提供的信息比较完整，但当前知识库中暂无完全匹配的故障记录。\n`;
    answer += `这可能是较少见的故障类型，建议联系专业维修人员进一步检测。\n`;
  }

  return {
    mode: 'insufficient_info',
    canDiagnose: false,
    confidence: 0.2,
    answer,
    missingInfo: missing,
    intent,
    sources: [],
  };
}

// ========== 统一诊断入口 ==========

/**
 * 智能体诊断主入口
 * @param {string} query - 用户输入
 * @param {object} context - 上下文（历史对话、已收集信息等）
 * @returns {object} 诊断结果
 */
async function diagnose(query, context = {}) {
  // 确保知识库已加载
  await loadKnowledgeBase();

  // 1. 意图解析
  const intent = parseIntent(query);

  // 2. 检索相关知识
  const retrievedDocs = retrieveDocuments(query, 8);

  // 3. 生成诊断
  const result = generateDiagnosis(query, intent, retrievedDocs);

  // 4. 添加元数据
  result.query = query;
  result.timestamp = new Date().toISOString();
  result.pilot = true; // MVP标记

  return result;
}

/**
 * 生成智能体回答（支持多轮对话上下文）
 * @param {string} query - 当前用户消息
 * @param {Array} history - 历史消息 [{role, content}]
 * @param {object} context - 已收集的信息
 * @returns {object} { answer, collectedInfo, shouldContinue, ... }
 */
async function chat(query, history = [], context = {}) {
  await loadKnowledgeBase();

  // 合并上下文信息
  const mergedQuery = buildContextualQuery(query, history, context);

  // 诊断
  const diagnosis = await diagnose(mergedQuery, context);

  // 判断是否需要继续收集信息
  const shouldContinue = !diagnosis.canDiagnose || diagnosis.confidence < 0.6;

  // 提取本轮收集到的信息
  const newIntent = parseIntent(query);
  const collectedInfo = {
    brand: context.brand || newIntent.brand,
    model: context.model || newIntent.model,
    faultType: context.faultType || newIntent.faultType,
    symptom: context.symptom || query,
  };

  return {
    answer: diagnosis.answer,
    collectedInfo,
    shouldContinue,
    diagnosis,
    suggestedActions: buildSuggestedActions(diagnosis),
  };
}

/**
 * 构建带上下文的查询
 */
function buildContextualQuery(query, history, context) {
  let parts = [];

  // 已有的上下文信息
  if (context.brand) parts.push(`品牌：${context.brand}`);
  if (context.model) parts.push(`型号：${context.model}`);
  if (context.faultType) parts.push(`故障类型：${context.faultType}`);

  // 历史对话中的用户消息（最近3轮）
  const recentUserMsgs = history
    .filter(h => h.role === 'user')
    .slice(-3)
    .map(h => h.content);

  if (recentUserMsgs.length > 0) {
    parts.push(`历史描述：${recentUserMsgs.join('；')}`);
  }

  // 当前消息
  parts.push(`当前描述：${query}`);

  return parts.join('\n');
}

/**
 * 构建建议操作
 */
function buildSuggestedActions(diagnosis) {
  const actions = [];

  if (diagnosis.mode === 'tree_recommendation' && diagnosis.treeId) {
    actions.push({
      type: 'start_tree',
      label: '开始交互式排查',
      payload: { treeId: diagnosis.treeId },
    });
  }

  if (diagnosis.relatedCases && diagnosis.relatedCases.length > 0) {
    actions.push({
      type: 'view_cases',
      label: '查看相关案例',
      payload: { caseIds: diagnosis.relatedCases.map(c => c.caseId) },
    });
  }

  if (diagnosis.mode === 'insufficient_info') {
    actions.push({
      type: 'provide_info',
      label: '补充信息',
      payload: { missingFields: diagnosis.missingInfo },
    });
  }

  return actions;
}

// ========== 调用外部AI增强（可选） ==========

/**
 * 调用KIMI API做意图解析增强（MVP中暂不使用，预留接口）
 */
async function callKimiIntentParse(query, config) {
  const systemPrompt = `你是无人机维修领域的意图解析专家。请从用户输入中提取以下信息，以JSON格式返回：
{
  "brand": "品牌（dji/autel/jifei/null）",
  "model": "型号（mavic/air/mini/phantom/inspire/agras/matrice/null）",
  "faultType": "故障类型（battery/power_on/charge/flight_time/null）",
  "symptom": "用户描述的核心症状",
  "confidence": 0.0-1.0
}
只返回JSON，不要其他内容。`;

  try {
    const response = await axios.post(
      `${config.apiBase}/chat/completions`,
      {
        model: config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: query },
        ],
        temperature: 0.1,
        max_tokens: 200,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
        },
        timeout: 10000,
      }
    );

    const content = response.data.choices[0].message.content;
    return JSON.parse(content);
  } catch (err) {
    console.error('[Agent] Kimi intent parse failed:', err.message);
    return null;
  }
}

// ========== 导出 ==========

module.exports = {
  // 核心接口
  diagnose,
  chat,

  // 内部方法（测试用）
  loadKnowledgeBase,
  parseIntent,
  retrieveDocuments,
  generateDiagnosis,

  // 状态
  getKnowledgeStatus,
};
