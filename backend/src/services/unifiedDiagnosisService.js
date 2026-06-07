const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const crypto = require('crypto');
const {
  mapFrontendFaultToBackend,
  mapFrontendDeviceToBackend,
} = require('../shared/enums');
const vectorService = require('./vectorService');
const embeddingService = require('./embeddingService');
const {
  createSession: createSessionDB,
  getSession: getSessionDB,
  updateSession: updateSessionDB,
  deleteSession: deleteSessionDB,
  cleanupExpiredSessions,
} = require('../db');

// ========== 数据加载 ==========

const DATA_DIR = path.join(__dirname, '../../data');

let faultTypeMap = null;
let decisionTrees = null;
let faultCases = null;
let dataLoaded = false;

async function loadData() {
  if (dataLoaded) return;
  const [ftm, dt, fc] = await Promise.all([
    fs.readFile(path.join(DATA_DIR, 'fault-type-map.json'), 'utf-8').catch(() => '{}'),
    fs.readFile(path.join(DATA_DIR, 'decision-trees.json'), 'utf-8').catch(() => '{}'),
    fs.readFile(path.join(DATA_DIR, 'fault-cases-enhanced.json'), 'utf-8').catch(() => '[]'),
  ]);
  faultTypeMap = JSON.parse(ftm);
  decisionTrees = JSON.parse(dt);
  faultCases = JSON.parse(fc).filter(c => c.reviewStatus === 'approved');
  dataLoaded = true;
}

function getFaultTypeConfig(id) {
  return (faultTypeMap.faultTypes || []).find(f => f.id === id);
}

function getTree(treeId) {
  return (decisionTrees.trees || []).find(t => t.id === treeId);
}

function getCase(caseId) {
  return faultCases.find(c => c.id === caseId);
}

// ========== AI 配置 ==========

function getAIConfig() {
  const kimiModel = process.env.KIMI_MODEL || 'moonshot-v1-8k';
  return {
    apiKey: process.env.KIMI_API_KEY,
    apiBase: process.env.KIMI_API_BASE || 'https://api.moonshot.cn/v1',
    model: kimiModel === 'kimi-for-coding' ? 'moonshot-v1-8k' : kimiModel,
  };
}

async function callAI(prompt, temperature = 0.2, maxTokens = 500) {
  const config = getAIConfig();
  if (!config.apiKey) return null;

  try {
    const response = await axios.post(
      `${config.apiBase}/chat/completions`,
      {
        model: config.model,
        messages: [
          { role: 'system', content: '你是一个专业的无人机维修意图解析助手。请严格按要求的格式输出。' },
          { role: 'user', content: prompt },
        ],
        temperature,
        max_tokens: maxTokens,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        timeout: 15000,
      }
    );
    return response.data.choices[0].message.content;
  } catch (err) {
    console.error('[UnifiedDiagnosis] AI call failed:', err.message);
    return null;
  }
}

// ========== IntentParserService ==========

class IntentParserService {
  /**
   * 解析用户输入，提取结构化意图
   */
  async parse(input, structuredHints = {}) {
    const text = input.toLowerCase();
    const result = {
      brand: null,
      model: null,
      faultType: null,
      faultTypeLabel: '未知故障',
      keywords: [],
      confidence: 0,
      raw: input,
    };

    // Step 1: 规则提取
    const ruleResult = this.extractByRules(text, structuredHints);

    // Step 2: 如果规则提取的 faultType 置信度不够高，用AI确认
    let faultType = ruleResult.faultType;
    let confidence = ruleResult.confidence;

    if (confidence < 0.8 || !faultType) {
      const aiResult = await this.classifyWithAI(input, ruleResult);
      if (aiResult && aiResult.faultType) {
        faultType = aiResult.faultType;
        confidence = aiResult.confidence;
      }
    }

    // Step 3: 补全信息
    const faultTypeConfig = getFaultTypeConfig(faultType);

    return {
      brand: ruleResult.brand,
      model: ruleResult.model || structuredHints.model || structuredHints.deviceType,
      deviceType: ruleResult.deviceType || mapFrontendDeviceToBackend(structuredHints.deviceType),
      faultType,
      faultTypeLabel: faultTypeConfig?.label || '未知故障',
      keywords: ruleResult.keywords,
      confidence,
      raw: input,
    };
  }

  extractByRules(text, hints) {
    const result = { brand: null, model: null, faultType: null, keywords: [], confidence: 0 };

    // 品牌提取
    const brandPatterns = {
      dji: ['dji', '大疆', 'dj'],
      autel: ['autel', '道通'],
      xag: ['xag', '极飞'],
    };
    for (const [brand, kws] of Object.entries(brandPatterns)) {
      if (kws.some(k => text.includes(k))) {
        result.brand = brand;
        break;
      }
    }

    // 型号提取
    const modelPatterns = {
      mavic: ['mavic', '御'],
      air: ['air 3', 'air3', 'air 2', 'air2'],
      mini: ['mini 4', 'mini4', 'mini 3', 'mini3', 'mini 2', 'mini2'],
      phantom: ['phantom', '精灵'],
      inspire: ['inspire', '悟'],
      t30: ['t30', 't40', 't50', '极飞'],
    };
    for (const [model, kws] of Object.entries(modelPatterns)) {
      if (kws.some(k => text.includes(k))) {
        result.model = model;
        break;
      }
    }

    // 故障类型提取（基于映射表关键词）
    let bestMatch = { faultType: null, score: 0, matchedKeywords: [] };
    for (const ft of faultTypeMap.faultTypes || []) {
      const matched = ft.keywords.filter(k => text.includes(k.toLowerCase()));
      const score = matched.length / ft.keywords.length;
      if (score > bestMatch.score) {
        bestMatch = { faultType: ft.id, score, matchedKeywords: matched };
      }
    }

    result.faultType = hints.faultType ? mapFrontendFaultToBackend(hints.faultType) || hints.faultType : bestMatch.faultType;
    result.confidence = hints.faultType ? 0.95 : bestMatch.score;
    result.keywords = [...new Set(bestMatch.matchedKeywords)];
    // 保存前端传入的 deviceType 到结果中，供后续会话使用
    result.deviceType = hints.deviceType ? mapFrontendDeviceToBackend(hints.deviceType) || hints.deviceType : null;

    return result;
  }

  async classifyWithAI(input, ruleResult) {
    const ftList = (faultTypeMap.faultTypes || [])
      .map(f => `- ${f.id}: ${f.label}（关键词：${f.keywords.join('、')}）`)
      .join('\n');

    const prompt = `分析以下无人机故障描述，判断最可能的故障类型：

用户输入: "${input}"
规则提取结果: ${JSON.stringify(ruleResult)}

可选故障类型:\n${ftList}

请输出JSON格式（不要包含任何其他内容）:
{"faultType": "最匹配的故障类型ID", "confidence": 0-1之间的数字, "reason": "简要说明"}`;

    const response = await callAI(prompt, 0.1, 300);
    if (!response) return null;

    try {
      const jsonMatch = response.match(/\{[\s\S]*?\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return { faultType: parsed.faultType, confidence: parsed.confidence };
      }
    } catch (e) {
      console.warn('[IntentParser] AI response parse failed:', e.message);
    }
    return null;
  }
}

// ========== TreeRouterService ==========

class TreeRouterService {
  route(intent) {
    const faultConfig = getFaultTypeConfig(intent.faultType);

    if (!faultConfig || !faultConfig.trees || faultConfig.trees.length === 0) {
      return {
        treeId: null,
        entryNodeId: null,
        confidence: 0,
        reason: '暂无匹配的决策树，将使用通用排查流程',
        fallback: true,
      };
    }

    const treeId = faultConfig.trees[0];
    const tree = getTree(treeId);
    if (!tree) {
      return {
        treeId: null,
        entryNodeId: null,
        confidence: 0,
        reason: '决策树数据缺失',
        fallback: true,
      };
    }

    return {
      treeId,
      entryNodeId: tree.startNode,
      confidence: intent.confidence,
      reason: `根据故障类型"${faultConfig.label}"匹配到决策树"${tree.name}"`,
      fallback: false,
    };
  }
}

// ========== TreeExecutorService ==========

class TreeExecutorService {
  async execute(treeId, currentNodeId, userAnswer, sessionContext = {}) {
    const tree = getTree(treeId);
    if (!tree) throw new Error(`Tree ${treeId} not found`);

    const node = tree.nodes[currentNodeId];
    if (!node) throw new Error(`Node ${currentNodeId} not found in tree ${treeId}`);

    // Terminal: complete
    if (node.type === 'terminal') {
      return {
        nextNodeId: null,
        branchTaken: null,
        isComplete: true,
        terminalNode: node,
        path: [...(sessionContext.path || []), currentNodeId],
      };
    }

    // Action: auto next
    if (node.type === 'action') {
      return {
        nextNodeId: node.next?.goto,
        branchTaken: 'next',
        isComplete: false,
        nextNode: tree.nodes[node.next?.goto],
        path: [...(sessionContext.path || []), currentNodeId],
      };
    }

    // Question: resolve branch
    if (node.type === 'question') {
      const branch = await this.resolveBranch(node, userAnswer, sessionContext);
      const targetNodeId = branch === 'yes' ? node.yes?.goto : node.no?.goto;

      return {
        nextNodeId: targetNodeId,
        branchTaken: branch,
        isComplete: false,
        nextNode: tree.nodes[targetNodeId],
        path: [...(sessionContext.path || []), currentNodeId],
      };
    }

    throw new Error(`Unknown node type: ${node.type}`);
  }

  async resolveBranch(node, userAnswer) {
    const answer = (userAnswer || '').toLowerCase().trim();
    if (!answer) return 'no';

    // Step 1: Rule matching via aiMapping
    const yesPatterns = (node.yes?.aiMapping || []).map(p => p.toLowerCase());
    const noPatterns = (node.no?.aiMapping || []).map(p => p.toLowerCase());

    for (const pattern of yesPatterns) {
      if (answer.includes(pattern)) return 'yes';
    }
    for (const pattern of noPatterns) {
      if (answer.includes(pattern)) return 'no';
    }

    // Step 2: AI fallback
    const aiResult = await this.aiClassifyBranch(node, userAnswer);
    return aiResult;
  }

  async aiClassifyBranch(node, userAnswer) {
    const prompt = `你在指导用户进行无人机故障排查。当前步骤是：
"${node.title}"
判定标准: ${node.criteria || '按步骤执行'}

用户的回答是: "${userAnswer}"

请判断这个回答对应"符合标准"还是"不符合标准"：
- "符合标准"意味着用户确认了这个条件
- "不符合标准"意味着用户否定或报告异常

请只输出 "yes" 或 "no"（不要其他内容）：`;

    const response = await callAI(prompt, 0.1, 50);
    if (!response) return 'no';

    const result = response.toLowerCase().trim();
    if (result.includes('yes')) return 'yes';
    if (result.includes('no')) return 'no';
    return 'no';
  }
}

// ========== DiagnosisGeneratorService ==========

class DiagnosisGeneratorService {
  async generate(path, tree, intent, cases, branchHistory = [], semanticMatches = []) {
    const terminalNode = tree.nodes[path[path.length - 1]];

    // Collect steps from path
    const steps = [];
    let stepNum = 1;
    for (const nodeId of path) {
      const node = tree.nodes[nodeId];
      if (node.type === 'action' || node.type === 'question') {
        steps.push({
          step: stepNum++,
          operation: node.title,
          criteria: node.criteria || '按步骤执行',
          solution: node.description,
          tools: node.tools || [],
          estimatedTime: node.estimatedTime || '2分钟',
          caseId: node.caseId,
        });
      }
    }

    // 基于路径和分支历史的确定性结论推导（替代硬编码概率）
    const possibleCauses = this.inferCausesFromPath(path, tree, branchHistory, cases);

    // 将语义检索的高相似度案例补充到可能原因中
    if (semanticMatches && semanticMatches.length > 0) {
      const seenCauses = new Set(possibleCauses.map(c => c.cause));
      for (const match of semanticMatches.filter(m => m.similarity > 0.7).slice(0, 2)) {
        const caseData = cases.find(c => String(c.id) === String(match.caseId));
        if (caseData) {
          const causeText = caseData.possibleCauses?.[0]?.cause || caseData.symptom || match.content?.slice(0, 50);
          if (causeText && !seenCauses.has(causeText)) {
            possibleCauses.push({
              cause: causeText,
              probability: `语义匹配 ${(match.similarity * 100).toFixed(0)}%`,
              description: caseData.possibleCauses?.[0]?.description || '',
              source: 'semantic',
            });
            seenCauses.add(causeText);
          }
        }
      }
    }

    const confidence = this.calculateConfidence(path, tree, branchHistory, semanticMatches);

    return {
      faultType: tree.category,
      possibleCauses,
      steps,
      totalEstimatedTime: this.estimateTotalTime(steps),
      difficulty: steps.length > 10 ? '⭐⭐⭐' : steps.length > 5 ? '⭐⭐' : '⭐',
      needProfessionalRepair: terminalNode?.conclusion?.includes('待确认') || false,
      terminalConclusion: terminalNode?.conclusion,
      terminalRecommendation: terminalNode?.recommendation,
      confidence,
      relatedCases: cases.filter(
        c => c.relatedTrees?.includes(tree.id) || path.some(nid => c.relatedNodes?.includes(nid))
      ).map(c => ({ id: c.id, symptom: c.symptom })),
      relatedTreeId: tree.id,
    };
  }

  /**
   * 基于决策树路径和分支历史推断可能原因
   * 纯流程驱动，无权重依赖
   */
  inferCausesFromPath(path, tree, branchHistory, cases) {
    const causes = [];
    const terminalNode = tree.nodes[path[path.length - 1]];

    // 优先级1：终端节点结论（已确认）
    if (terminalNode?.type === 'terminal' && terminalNode.conclusion) {
      causes.push({
        cause: terminalNode.conclusion,
        probability: '已确认',
        description: terminalNode.recommendation || '',
        source: 'terminal',
      });
    }

    // 优先级2：从分支历史中推导高可能性原因
    const seenCauses = new Set(causes.map(c => c.cause));
    for (const bh of branchHistory) {
      const node = tree.nodes[bh.nodeId];
      if (!node || node.type !== 'question') continue;

      // 根据分支方向提取线索（使用 label 文本，去除 emoji 前缀）
      const branchInfo = bh.branch === 'yes' ? node.yes : node.no;
      if (branchInfo?.label) {
        const cleanLabel = branchInfo.label.replace(/^[✅❌🔄🖼️]+\s*/, '').trim();
        if (cleanLabel && !seenCauses.has(cleanLabel)) {
          causes.push({
            cause: cleanLabel,
            probability: '高可能性',
            description: node.title,
            source: 'branch',
          });
          seenCauses.add(cleanLabel);
        }
      }

      // 从节点 criteria 中提取线索
      if (node.criteria && !seenCauses.has(node.criteria)) {
        causes.push({
          cause: node.criteria,
          probability: '排查方向',
          description: node.title,
          source: 'criteria',
        });
        seenCauses.add(node.criteria);
      }

      if (causes.length >= 3) break;
    }

    // 优先级3：路径过短时的 fallback（仅当无法从路径推导时）
    if (causes.length === 0 && path.length < 3) {
      const relatedCases = cases.filter(
        c => c.relatedTrees?.includes(tree.id) || path.some(nid => c.relatedNodes?.includes(nid))
      );
      for (const c of relatedCases.slice(0, 3)) {
        const causeText = c.possibleCauses?.[0]?.cause || c.symptom;
        if (!seenCauses.has(causeText)) {
          causes.push({
            cause: causeText,
            probability: '待确认',
            description: c.possibleCauses?.[0]?.description || '',
            source: 'case',
          });
          seenCauses.add(causeText);
        }
        if (causes.length >= 3) break;
      }
    }

    return causes.slice(0, 3);
  }

  calculateConfidence(path, tree, branchHistory = [], semanticMatches = []) {
    const terminalNode = tree.nodes[path[path.length - 1]];
    let score = 0.5;

    // 基于路径完整性评分
    if (terminalNode?.type === 'terminal') {
      score = 0.95;
    } else if (path.length >= 3) {
      score = 0.7;
    } else {
      score = 0.5;
    }

    // 基于分支确定性加分（每个 question 分支 +0.05，最多 +0.15）
    const questionBranches = branchHistory.filter(bh => {
      const node = tree.nodes[bh.nodeId];
      return node && node.type === 'question';
    });
    score += Math.min(questionBranches.length * 0.05, 0.15);

    // 语义检索高相似度案例加分（最高 +0.1）
    if (semanticMatches && semanticMatches.length > 0) {
      const bestSimilarity = Math.max(...semanticMatches.map(m => m.similarity || 0));
      if (bestSimilarity > 0.85) {
        score += 0.1;
      } else if (bestSimilarity > 0.7) {
        score += 0.05;
      }
    }

    return Math.min(Math.round(score * 100) / 100, 0.98);
  }

  estimateTotalTime(steps) {
    let totalMinutes = 0;
    for (const s of steps) {
      const match = (s.estimatedTime || '').match(/(\d+)/);
      if (match) totalMinutes += parseInt(match[1], 10);
    }
    if (totalMinutes === 0) return '10分钟';
    if (totalMinutes >= 60) return `${Math.floor(totalMinutes / 60)}小时${totalMinutes % 60}分钟`;
    return `${totalMinutes}分钟`;
  }
}

// ========== 会话存储（数据库持久化） ==========

const SESSION_TTL_MS = 30 * 60 * 1000; // 30分钟

/**
 * 创建诊断会话（持久化到数据库）
 */
async function createSession(intent) {
  const id = crypto.randomUUID();
  const sessionData = {
    id,
    status: 'active',
    intent,
    context: {
      deviceType: intent.deviceType || null,
      model: intent.model || null,
    },
    treeExecution: {},
    diagnosis: {},
    messages: [],
  };
  const session = await createSessionDB(sessionData);
  return session;
}

/**
 * 获取诊断会话（从数据库读取，自动检查过期）
 */
async function getSession(id) {
  return getSessionDB(id, SESSION_TTL_MS);
}

/**
 * 更新会话状态（持久化到数据库）
 */
async function updateSession(id, updates) {
  return updateSessionDB(id, updates);
}

/**
 * 清理过期会话
 */
async function cleanupSessions() {
  const count = await cleanupExpiredSessions(SESSION_TTL_MS);
  if (count > 0) {
    console.log(`[UnifiedDiagnosis] Cleaned up ${count} expired sessions`);
  }
}

// 每10分钟清理一次过期会话
setInterval(cleanupSessions, 10 * 60 * 1000);

// ========== 统一诊断入口 ==========

const intentParser = new IntentParserService();
const treeRouter = new TreeRouterService();
const treeExecutor = new TreeExecutorService();
const diagnosisGenerator = new DiagnosisGeneratorService();

/**
 * 快速诊断（单轮）
 */
async function quickDiagnose(input, structuredHints = {}) {
  await loadData();

  // 1. Intent parse
  const intent = await intentParser.parse(input, structuredHints);

  // 1.5 语义检索（向量搜索最相似案例）
  let semanticMatches = [];
  try {
    const queryEmbedding = await embeddingService.generateEmbedding(input);
    if (queryEmbedding && queryEmbedding.length > 0) {
      const rawMatches = await vectorService.searchSimilarCases(queryEmbedding, 5);
      semanticMatches = (rawMatches || []).map(m => ({
        caseId: m.case_id,
        content: m.content,
        similarity: m.similarity,
        metadata: m.metadata,
      }));
    }
  } catch (err) {
    console.warn('[QuickDiagnose] Vector search failed, falling back to keyword:', err.message);
  }

  // 2. Tree route
  const route = treeRouter.route(intent);

  if (route.fallback || !route.treeId) {
    return {
      success: true,
      mode: 'quick',
      intent,
      matchedTree: null,
      predictedPath: null,
      diagnosis: null,
      semanticMatches,
      confidence: intent.confidence,
      confidenceReason: route.reason,
      suggestedActions: [
        { type: 'interactive', label: '尝试交互式诊断', targetId: 'general' },
        { type: 'view-case', label: '查看相关案例', targetId: '' },
      ],
      fallback: true,
    };
  }

  const tree = getTree(route.treeId);

  // 3. Predict path (simple: shortest path from startNode to terminal)
  const predictedPath = predictPath(tree, tree.startNode);

  // 4. Generate diagnosis（传入语义匹配案例以增强诊断质量）
  const diagnosis = await diagnosisGenerator.generate(
    predictedPath.path,
    tree,
    intent,
    faultCases,
    [], // quick 模式无分支历史
    semanticMatches // 语义检索结果
  );

  return {
    success: true,
    mode: 'quick',
    intent,
    matchedTree: {
      id: tree.id,
      name: tree.name,
      category: tree.category,
    },
    predictedPath: {
      nodes: predictedPath.nodes,
      terminalNode: predictedPath.terminalNode,
    },
    diagnosis,
    semanticMatches,
    confidence: diagnosis.confidence,
    confidenceReason: route.reason,
    suggestedActions: buildSuggestedActions(diagnosis, tree),
    fallback: false,
  };
}

/**
 * 交互式诊断（多轮）
 */
async function interactiveDiagnose(sessionId, input, userAnswer, structuredHints = {}) {
  await loadData();

  let session;
  if (!sessionId) {
    // First call: create session + intent parse + route
    const intent = await intentParser.parse(input, structuredHints);
    session = await createSession(intent);
    const route = treeRouter.route(intent);

    if (route.fallback || !route.treeId) {
      session.status = 'completed';
      await updateSession(session.id, { status: 'completed' });
      return {
        success: true,
        mode: 'interactive',
        sessionId: session.id,
        status: 'completed',
        currentNode: null,
        aiPrompt: {
          message: '抱歉，当前暂无匹配的决策树。请尝试重新描述故障，或查看相关案例。',
          suggestedAnswers: [],
          allowFreeText: true,
        },
        progress: { currentStep: 0, totalSteps: 0, path: [] },
        diagnosis: null,
      };
    }

    const tree = getTree(route.treeId);
    const treeExecution = {
      treeId: tree.id,
      currentNodeId: tree.startNode,
      path: [],
      branchHistory: [],
    };
    session.treeExecution = treeExecution;
    await updateSession(session.id, { treeExecution });

    const startNode = tree.nodes[tree.startNode];
    return formatInteractiveResponse(session, startNode, tree, false);
  }

  // Continue session
  session = await getSession(sessionId);
  if (!session) {
    throw new Error('Session not found or expired');
  }

  const exec = session.treeExecution;
  const tree = getTree(exec.treeId);

  // Execute current node with user answer
  const result = await treeExecutor.execute(tree.id, exec.currentNodeId, userAnswer, exec);

  // Update session
  exec.path = result.path;
  if (result.branchTaken) {
    exec.branchHistory.push({
      nodeId: exec.currentNodeId,
      branch: result.branchTaken,
      userAnswer,
    });
  }

  if (result.isComplete) {
    exec.currentNodeId = result.terminalNode.id;
    session.status = 'completed';

    // Generate diagnosis
    const diagnosis = await diagnosisGenerator.generate(exec.path, tree, session.intent, faultCases, exec.branchHistory);
    session.diagnosis = diagnosis;

    await updateSession(session.id, {
      status: 'completed',
      treeExecution: exec,
      diagnosis,
    });

    return formatInteractiveResponse(session, result.terminalNode, tree, true, diagnosis);
  }

  exec.currentNodeId = result.nextNodeId;
  await updateSession(session.id, { treeExecution: exec });

  return formatInteractiveResponse(session, result.nextNode, tree, false);
}

// ========== 辅助函数 ==========

function predictPath(tree, startNodeId) {
  // BFS to find a path to any terminal node
  const visited = new Set();
  const queue = [{ nodeId: startNodeId, path: [] }];

  while (queue.length > 0) {
    const { nodeId, path } = queue.shift();
    if (visited.has(nodeId)) continue;
    visited.add(nodeId);

    const node = tree.nodes[nodeId];
    if (!node) continue;

    const newPath = [...path, nodeId];

    if (node.type === 'terminal') {
      const nodes = newPath.map(id => {
        const n = tree.nodes[id];
        return {
          id: n.id,
          title: n.title,
          description: n.description,
          type: n.type,
        };
      });
      return {
        path: newPath,
        nodes,
        terminalNode: {
          id: node.id,
          conclusion: node.conclusion,
          recommendation: node.recommendation,
        },
      };
    }

    if (node.type === 'action' && node.next?.goto) {
      queue.push({ nodeId: node.next.goto, path: newPath });
    }

    if (node.type === 'question') {
      // Prefer "yes" branch for prediction (optimistic path)
      if (node.yes?.goto) queue.push({ nodeId: node.yes.goto, path: newPath });
      else if (node.no?.goto) queue.push({ nodeId: node.no.goto, path: newPath });
    }
  }

  return { path: [startNodeId], nodes: [], terminalNode: null };
}

function buildSuggestedActions(diagnosis, tree) {
  const actions = [];
  if (tree) {
    actions.push({ type: 'start-tree', label: '开始逐步排查（推荐）', targetId: tree.id });
  }
  if (diagnosis.relatedCases?.length > 0) {
    actions.push({ type: 'view-case', label: '查看相关案例', targetId: diagnosis.relatedCases[0].id });
  }
  actions.push({ type: 'interactive', label: '详细交互式诊断', targetId: tree?.id || 'general' });
  return actions;
}

function formatInteractiveResponse(session, currentNode, tree, isComplete, diagnosis = null) {
  const exec = session.treeExecution || {};
  const progress = {
    currentStep: (exec.path || []).length + 1,
    totalSteps: Object.keys(tree.nodes).length,
    path: exec.path || [],
  };

  const suggestedAnswers = [];
  let allowFreeText = true;

  if (currentNode.type === 'question') {
    if (currentNode.yes?.label) suggestedAnswers.push(currentNode.yes.label);
    if (currentNode.no?.label) suggestedAnswers.push(currentNode.no.label);
    allowFreeText = true;
  } else if (currentNode.type === 'action') {
    if (currentNode.next?.label) suggestedAnswers.push(currentNode.next.label);
    allowFreeText = false;
  }

  const aiMessage = currentNode.ai?.clarificationHint || currentNode.description;

  return {
    success: true,
    mode: 'interactive',
    sessionId: session.id,
    status: isComplete ? 'completed' : 'active',
    currentNode: {
      id: currentNode.id,
      title: currentNode.title,
      description: currentNode.description,
      type: currentNode.type,
      criteria: currentNode.criteria,
      tools: currentNode.tools,
      estimatedTime: currentNode.estimatedTime,
      caseId: currentNode.caseId,
    },
    aiPrompt: {
      message: aiMessage,
      suggestedAnswers,
      allowFreeText,
    },
    progress,
    diagnosis: isComplete ? diagnosis : null,
    terminalNode: isComplete
      ? { conclusion: currentNode.conclusion, recommendation: currentNode.recommendation }
      : null,
  };
}

// ========== 导出 ==========

module.exports = {
  quickDiagnose,
  interactiveDiagnose,
  getSession,
  loadData,
  // 导出各服务供测试
  IntentParserService,
  TreeRouterService,
  TreeExecutorService,
  DiagnosisGeneratorService,
};
