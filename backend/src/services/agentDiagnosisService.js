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

// ========== 故障意图识别规则 ==========

/**
 * 目的：
 * 1. 避免"无法起飞"误判成"无法开机"
 * 2. 明确报错优先，例如：指南针异常 > 无法起飞
 * 3. 将 faultType 映射到正确的决策树
 */

const INTENT_RULES = [
  {
    faultType: 'compass_abnormal',
    label: '指南针异常',
    priority: 100,
    keywords: [
      '指南针异常',
      '指南针错误',
      '指南针校准',
      '指南针校准失败',
      '磁场干扰',
      '磁干扰',
      '罗盘异常',
      'compass'
    ]
  },
  {
    faultType: 'imu_abnormal',
    label: 'IMU异常',
    priority: 95,
    keywords: [
      'IMU异常',
      'IMU错误',
      'IMU未校准',
      'IMU校准失败',
      '姿态异常',
      '姿态传感器异常'
    ]
  },
  {
    faultType: 'gps_abnormal',
    label: 'GPS异常',
    priority: 90,
    keywords: [
      'GPS异常',
      'GPS信号弱',
      'GPS信号差',
      '搜星失败',
      '卫星少',
      '定位异常',
      '定位失败'
    ]
  },
  {
    faultType: 'takeoff_failure',
    label: '无法起飞',
    priority: 80,
    keywords: [
      '无法起飞',
      '不能起飞',
      '起飞失败',
      '无法解锁',
      '不能解锁',
      '解锁失败',
      '电机无法启动',
      '电机不转',
      '无法启动电机'
    ]
  },
  {
    faultType: 'power_on_failure',
    label: '无法开机',
    priority: 70,
    keywords: [
      '无法开机',
      '不能开机',
      '不开机',
      '开不了机',
      '按电源键无反应',
      '电源键没反应',
      '无法通电',
      '不通电',
      '黑屏',
      '没反应'
    ]
  },
  {
    faultType: 'battery_abnormal',
    label: '电池异常',
    priority: 60,
    keywords: [
      '电池异常',
      '电池报错',
      '电池故障',
      '电池无法充电',
      '电池鼓包',
      '电池损坏',
      '电池通信异常'
    ]
  }
];

const FAULT_TYPE_TO_TREE = {
  compass_abnormal: {
    treeId: 'tree-compass-abnormal',
    treeName: '指南针异常排查'
  },
  imu_abnormal: {
    treeId: 'tree-imu-abnormal',
    treeName: 'IMU异常排查'
  },
  gps_abnormal: {
    treeId: 'tree-gps-abnormal',
    treeName: 'GPS异常排查'
  },
  takeoff_failure: {
    treeId: 'tree-takeoff-failure',
    treeName: '无法起飞排查'
  },
  power_on_failure: {
    treeId: 'tree-power-on',
    treeName: '无法开机排查'
  },
  battery_abnormal: {
    treeId: 'tree-battery-abnormal',
    treeName: '电池异常排查'
  }
};

const POWER_ON_INCLUDE = [
  '无法开机',
  '不能开机',
  '不开机',
  '开不了机',
  '按电源键无反应',
  '电源键没反应',
  '无法通电',
  '不通电',
  '黑屏'
];

const POWER_ON_EXCLUDE = [
  '无法起飞',
  '不能起飞',
  '起飞失败',
  '无法解锁',
  '不能解锁',
  '解锁失败',
  '指南针异常',
  '指南针错误',
  '磁场干扰',
  '磁干扰',
  'GPS异常',
  'GPS信号弱',
  'IMU异常',
  'IMU错误',
  '禁飞区',
  '限飞区'
];

function normalizeQuery(query) {
  return String(query || '').trim();
}

function includesKeyword(query, keyword) {
  if (!query || !keyword) return false;
  const lowerQuery = query.toLowerCase();
  const lowerKeyword = keyword.toLowerCase();
  return lowerQuery.includes(lowerKeyword);
}

function matchKeywords(query, keywords = []) {
  return keywords.filter(keyword => includesKeyword(query, keyword));
}

/**
 * 判断是否允许使用无法开机树
 * 防止"无法起飞 / 指南针异常"误触发 tree-power-on
 */
function shouldUsePowerOnTree(query) {
  const text = normalizeQuery(query);
  const include = POWER_ON_INCLUDE.some(keyword => includesKeyword(text, keyword));
  const exclude = POWER_ON_EXCLUDE.some(keyword => includesKeyword(text, keyword));
  return include && !exclude;
}

/**
 * 识别用户故障意图
 * 明确报错优先级高于行为现象
 */
function detectFaultIntent(query) {
  const text = normalizeQuery(query);

  if (!text) {
    return {
      faultType: 'unknown',
      secondaryFaultType: null,
      label: '未知故障',
      matchedKeywords: [],
      confidence: 0
    };
  }

  const matches = [];

  for (const rule of INTENT_RULES) {
    const matchedKeywords = matchKeywords(text, rule.keywords);
    if (matchedKeywords.length > 0) {
      matches.push({
        faultType: rule.faultType,
        label: rule.label,
        priority: rule.priority,
        matchedKeywords,
        score: rule.priority + matchedKeywords.length * 5
      });
    }
  }

  if (matches.length === 0) {
    return {
      faultType: 'unknown',
      secondaryFaultType: null,
      label: '未知故障',
      matchedKeywords: [],
      confidence: 0.3
    };
  }

  matches.sort((a, b) => b.score - a.score);

  const primary = matches[0];
  const secondary = matches[1] || null;

  return {
    faultType: primary.faultType,
    secondaryFaultType: secondary ? secondary.faultType : null,
    label: primary.label,
    matchedKeywords: primary.matchedKeywords,
    allMatches: matches,
    confidence: Math.min(0.95, 0.65 + primary.matchedKeywords.length * 0.1)
  };
}

/**
 * 根据故障意图选择决策树
 */
function getTreeByIntent(intent, query) {
  if (!intent || !intent.faultType) return null;

  // tree-power-on 必须严格限制，避免误触发
  if (intent.faultType === 'power_on_failure') {
    if (!shouldUsePowerOnTree(query)) {
      return null;
    }
  }

  return FAULT_TYPE_TO_TREE[intent.faultType] || null;
}

/**
 * 判断一个决策树文档是否和意图匹配
 */
function isTreeMatchedWithIntent(treeDoc, intent) {
  if (!treeDoc || !intent) return false;
  const doc = treeDoc.doc || treeDoc;
  const docId = doc.id || doc.treeId;
  const expectedTree = FAULT_TYPE_TO_TREE[intent.faultType];
  if (!expectedTree) return false;
  return docId === expectedTree.treeId;
}

/**
 * 从召回结果中选择最合适的决策树
 * 优先级：
 * 1. faultType 对应的树
 * 2. 召回结果中和 intent 匹配的树
 * 3. 明确禁止误用 tree-power-on
 */
function selectBestDecisionTree(query, retrievedDocs = []) {
  const intent = detectFaultIntent(query);
  const mappedTree = getTreeByIntent(intent, query);

  // 先找召回结果里是否有完全匹配的树
  if (mappedTree && Array.isArray(retrievedDocs)) {
    const matchedRetrievedTree = retrievedDocs.find(item => {
      const doc = item.doc || item;
      return doc && doc.type === 'decision_tree' && (doc.id === mappedTree.treeId || doc.treeId === mappedTree.treeId);
    });

    if (matchedRetrievedTree) {
      const doc = matchedRetrievedTree.doc || matchedRetrievedTree;
      return {
        id: doc.id || doc.treeId || mappedTree.treeId,
        title: doc.title || doc.treeName || mappedTree.treeName,
        source: 'retrieved_intent_matched',
        intent
      };
    }
  }

  // 如果知识库暂时没有这个树，也直接返回映射树，让前端可以跳转或提示
  if (mappedTree) {
    return {
      id: mappedTree.treeId,
      title: mappedTree.treeName,
      source: 'intent_mapping',
      intent
    };
  }

  // 禁止在有"无法起飞/指南针异常"等排除词时 fallback 到 tree-power-on
  const hasPowerOnExclude = POWER_ON_EXCLUDE.some(keyword => includesKeyword(query, keyword));

  if (hasPowerOnExclude) {
    const safeTreeDoc = retrievedDocs.find(item => {
      const doc = item.doc || item;
      return doc && doc.type === 'decision_tree' && doc.id !== 'tree-power-on';
    });

    if (safeTreeDoc) {
      const doc = safeTreeDoc.doc || safeTreeDoc;
      return {
        id: doc.id || doc.treeId,
        title: doc.title || doc.treeName,
        source: 'safe_fallback',
        intent
      };
    }

    return null;
  }

  // 最后才允许普通 fallback
  const treeDoc = retrievedDocs.find(item => {
    const doc = item.doc || item;
    return doc && doc.type === 'decision_tree';
  });

  if (treeDoc) {
    const doc = treeDoc.doc || treeDoc;
    return {
      id: doc.id || doc.treeId,
      title: doc.title || doc.treeName,
      source: 'fallback_retrieved_tree',
      intent
    };
  }

  return null;
}

// ========== 故障类型关键词映射（全量，兼容旧版 parseIntent 和其他模块） ==========

const FAULT_TYPE_MAP = {
  // === 明确报错（高优先级）===
  'compass_abnormal': ['指南针异常', '指南针错误', '磁场干扰', '磁罗盘', 'compass'],
  'imu_abnormal': ['IMU异常', 'IMU未校准', '姿态异常', 'IMU', 'imu'],
  'gps_abnormal': ['GPS信号弱', 'GPS异常', '定位不准', '搜星', '卫星不足', 'GNSS'],
  'motor_abnormal': ['电机不转', '电机异响', '转速异常', '电机故障'],
  'battery_abnormal': ['电池异常', '电池故障', '电压过低', '电芯损坏'],
  'failsafe': ['失控保护', '失控返航', '信号丢失返航'],
  'nofly_zone': ['禁飞区', '禁飞'],

  // === 电源/开机 ===
  'power_on': ['无法开机', '开不了机', '不开机', '按电源键无反应', '电源键没反应', '无法通电', '不通电'],
  'battery': ['电池', '充电', '续航', '电量', '鼓包', '电压', '充电器', '充电管家', '电芯'],

  // === 起飞/动力 ===
  'takeoff_failure': ['无法起飞', '不能起飞', '起飞失败', '无法解锁', '解锁失败', '电机无法启动', '起飞'],
  'motor': ['电机', '螺旋桨', '桨叶', '转速', '动力', '推力'],
  'flight': ['飞行异常', '飞行不稳', '抖动', '晃动', '漂移', '悬停不稳', '定高异常'],

  // === 云台/影像 ===
  'gimbal': ['云台', '云台抖动', '云台卡住', '云台偏移', '云台不转', '云台异常', '云台自检', '云台歪'],
  'video': ['图传', '图传异常', '图传黑屏', '无画面', '画面卡顿', '图传断', '花屏'],
  'camera': ['相机', '拍照', '录像', '摄像头', '镜头', '画面模糊', '拍照失败', '无法录像'],

  // === 导航/传感器 ===
  'sensor': ['传感器', '避障', '视觉', '红外', '超声波', '雷达', 'TOF', '避障失效'],

  // === 通信/遥控 ===
  'remote': ['遥控', '遥控器', '信号中断', '失联', '断连', '图传距离', '控制距离'],
  'communication': ['通信', '连接', 'WiFi', '蓝牙', '链路'],

  // === 其他 ===
  'landing': ['降落', '返航', '迫降', '着陆', '落地'],
  'noise': ['噪音', '异响', '震动', '振动'],
  'overheat': ['过热', '高温', '温度', '散热'],
  'water': ['进水', '涉水', '防水', '潮湿'],
  'crash': ['坠机', '摔机', '碰撞', '炸机', '坠毁'],
  'spray': ['喷洒', '喷头', '水泵', '流量', '药箱', '漏药', '堵塞', '雾化'],
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
 * 整合品牌/型号识别 + detectFaultIntent 故障意图识别
 * @param {string} query - 用户原始输入
 * @returns {object} { brand, model, faultType, secondaryFaultType, label, symptom, confidence }
 */
function parseIntent(query) {
  const lower = query.toLowerCase();

  // 用 detectFaultIntent 做故障类型识别（优先级 + 分数机制）
  const faultIntent = detectFaultIntent(query);

  const result = {
    brand: null,
    model: null,
    faultType: faultIntent.faultType,
    secondaryFaultType: faultIntent.secondaryFaultType,
    label: faultIntent.label,
    symptom: query,
    confidence: faultIntent.confidence,
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

  // 品牌和型号匹配提升置信度
  if (matchCount > 0) {
    result.confidence = Math.min(0.98, result.confidence + matchCount * 0.05);
  }

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
  const caseDocs = retrievedDocs.filter(r => r.doc.type === 'case');
  const nodeDocs = retrievedDocs.filter(r => r.doc.type === 'tree_node');

  const topScore = retrievedDocs.length > 0 ? retrievedDocs[0].score : 0;

  // 使用 selectBestDecisionTree 选择最合适的决策树
  const selectedTree = selectBestDecisionTree(query, retrievedDocs);

  // 判断资料充分性
  const hasTree = !!selectedTree;
  const hasCases = caseDocs.length > 0;

  // 决策模式
  if (hasTree) {
    // 模式A：有决策树 → 推荐执行决策树
    return generateTreeModeResult(query, intent, selectedTree, caseDocs, nodeDocs, retrievedDocs);
  } else if (hasCases && topScore >= 1) {
    // 模式B：有案例但无决策树 → 基于案例给建议
    return generateCaseModeResult(query, intent, caseDocs);
  } else {
    // 模式C：资料不足 → 建议提供更多信息
    return generateInsufficientResult(query, intent);
  }
}

/**
 * 模式A：决策树模式 —— 推荐执行决策树排查
 */
function generateTreeModeResult(query, intent, selectedTree, caseDocs, nodeDocs, retrievedDocs) {
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
          caseId: c.doc.id,
          title: c.doc.title,
          summary: causeMatch[1].trim().substring(0, 200),
        });
      }
    }
  });

  // 生成回答文本
  const labelText = selectedTree.intent && selectedTree.intent.label
    ? `这更符合"${selectedTree.intent.label}"问题。`
    : '';

  let answer = `根据您的描述，${labelText}建议进入"${selectedTree.title}"流程继续排查。\n\n`;

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
    confidence: selectedTree.intent ? selectedTree.intent.confidence : 0.85,
    faultType: selectedTree.intent ? selectedTree.intent.faultType : undefined,
    secondaryFaultType: selectedTree.intent ? selectedTree.intent.secondaryFaultType : undefined,
    answer,
    treeId: selectedTree.id,
    treeName: selectedTree.title,
    source: selectedTree.source,
    suggestions: [
      `进入"${selectedTree.title}"`,
      '按照步骤逐项排查',
      '如果提示信息发生变化，请重新输入最新报错'
    ],
    predictedPath: predictedNodes,
    relatedCases: caseDocs.slice(0, 5).map(c => ({
      caseId: c.doc.id,
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
  answer += `📌 **${topCase.title}**（案例${topCase.id}）\n`;
  answer += `${topCase.content}\n\n`;

  if (caseDocs.length > 1) {
    answer += `📚 **其他相关案例**：\n`;
    caseDocs.slice(1, 4).forEach(c => {
      answer += `- ${c.doc.title}（${c.doc.id}）\n`;
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
      caseId: c.doc.id,
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
