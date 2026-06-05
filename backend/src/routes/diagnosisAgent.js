const express = require('express');
const router = express.Router();
const agentService = require('../services/agentDiagnosisService');
const { freeUsageLimit } = require('../middleware/freeUsageLimit');
const freeUsageService = require('../services/freeUsageService');

/**
 * 智能体诊断路由
 * POST /api/diagnosis/agent
 *
 * 请求体：
 * {
 *   query: string,        // 用户输入（必填）
 *   history?: Array,      // 历史消息 [{role, content}]
 *   context?: object,     // 已收集的上下文信息 {brand, model, faultType, symptom}
 *   mode?: string         // 'single' | 'chat'，默认 'single'
 * }
 *
 * 响应：
 * {
 *   success: true,
 *   data: {
 *     answer: string,           // 智能体回答文本
 *     mode: string,             // 诊断模式
 *     canDiagnose: boolean,     // 是否有足够资料诊断
 *     confidence: number,       // 置信度 0-1
 *     treeId?: string,          // 推荐决策树ID
 *     treeName?: string,        // 决策树名称
 *     relatedCases?: Array,     // 相关案例
 *     suggestedActions?: Array, // 建议操作按钮
 *     collectedInfo?: object,   // 已收集的信息
 *     shouldContinue?: boolean, // 是否需要继续对话
 *     sources?: Array,          // 资料来源
 *     intent?: object,          // 解析出的意图
 *     pilot?: boolean           // MVP标记
 *   }
 * }
 */

router.post('/', freeUsageLimit, async (req, res) => {
  try {
    const { query, history = [], context = {}, mode = 'single' } = req.body;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({
        success: false,
        error: '缺少 query 参数或格式错误',
      });
    }

    // 确保知识库已加载
    const kbStatus = agentService.getKnowledgeStatus();
    if (!kbStatus.loaded) {
      await agentService.loadKnowledgeBase();
    }

    let result;

    if (mode === 'chat') {
      // 多轮对话模式
      result = await agentService.chat(query, history, context);
    } else {
      // 单轮诊断模式
      const diagnosis = await agentService.diagnose(query, context);
      result = {
        answer: diagnosis.answer,
        mode: diagnosis.mode,
        canDiagnose: diagnosis.canDiagnose,
        confidence: diagnosis.confidence,
        treeId: diagnosis.treeId,
        treeName: diagnosis.treeName,
        relatedCases: diagnosis.relatedCases,
        suggestedActions: diagnosis.suggestedActions,
        sources: diagnosis.sources,
        intent: diagnosis.intent,
        pilot: diagnosis.pilot,
      };
    }

    // 消耗免费次数
    if (req.freeUsage?.identifier) {
      await freeUsageService.incrementUsage(req.freeUsage.identifier);
    }

    res.json({
      success: true,
      data: result,
    });

  } catch (error) {
    console.error('[Agent API] Error:', error);
    res.status(500).json({
      success: false,
      error: '智能体诊断服务内部错误',
      message: error.message,
    });
  }
});

/**
 * 智能体状态检查
 * GET /api/diagnosis/agent/status
 */
router.get('/status', async (req, res) => {
  try {
    const kbStatus = agentService.getKnowledgeStatus();
    res.json({
      success: true,
      data: {
        status: 'ok',
        knowledgeBase: kbStatus,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * 意图解析测试接口（调试用）
 * POST /api/diagnosis/agent/parse-intent
 */
router.post('/parse-intent', async (req, res) => {
  try {
    const { query } = req.body;
    if (!query) {
      return res.status(400).json({ success: false, error: '缺少 query 参数' });
    }

    const intent = agentService.parseIntent(query);
    res.json({ success: true, data: intent });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 知识检索测试接口（调试用）
 * POST /api/diagnosis/agent/retrieve
 */
router.post('/retrieve', async (req, res) => {
  try {
    const { query, topK = 5 } = req.body;
    if (!query) {
      return res.status(400).json({ success: false, error: '缺少 query 参数' });
    }

    await agentService.loadKnowledgeBase();
    const docs = agentService.retrieveDocuments(query, topK);
    res.json({
      success: true,
      data: docs.map(d => ({
        id: d.doc.id,
        type: d.doc.type,
        title: d.doc.title,
        score: d.score,
        matchReason: d.matchReason,
      })),
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
