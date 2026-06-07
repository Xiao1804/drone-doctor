const express = require('express');
const router = express.Router();
const { quickDiagnose, interactiveDiagnose, loadData } = require('../services/unifiedDiagnosisService');
const { freeUsageLimit } = require('../middleware/freeUsageLimit');
const freeUsageService = require('../services/freeUsageService');

// 确保数据已加载
loadData().catch(err => console.error('[UnifiedDiagnosis] Failed to load data:', err.message));

function consumesFreeUsage(req) {
  const mode = req.body?.mode || 'quick';
  return mode === 'quick' || (mode === 'interactive' && !req.body?.sessionId);
}

async function freeUsageLimitOnStart(req, res, next) {
  if (!consumesFreeUsage(req)) {
    return next();
  }
  return freeUsageLimit(req, res, next);
}

/**
 * POST /api/diagnosis/unified
 * 统一诊断入口
 *
 * 请求体:
 * {
 *   mode: 'quick' | 'interactive',
 *   input: string,           // 用户输入（自然语言或结构化）
 *   deviceType?: string,     // 前端已知的机型
 *   faultType?: string,      // 前端已知的故障类型
 *   sessionId?: string,      // 交互式模式必填（首次为空）
 *   currentNodeId?: string,  // 当前节点ID
 *   userAnswer?: string,     // 用户对当前节点的回答
 *   model?: string           // 具体型号
 * }
 */
router.post('/', freeUsageLimitOnStart, async (req, res) => {
  try {
    const {
      mode = 'quick',
      input,
      deviceType,
      faultType,
      sessionId,
      userAnswer,
      model: droneModel,
    } = req.body;

    if (!input && !sessionId) {
      return res.status(400).json({ error: '缺少 input 或 sessionId 参数' });
    }

    const structuredHints = {
      deviceType,
      faultType,
      model: droneModel,
    };

    if (mode === 'quick') {
      const result = await quickDiagnose(input, structuredHints);
      // quick 模式消耗免费次数
      if (req.freeUsage?.identifier) {
        await freeUsageService.incrementUsage(req.freeUsage.identifier);
      }
      res.json(result);
    } else if (mode === 'interactive') {
      const result = await interactiveDiagnose(sessionId, input, userAnswer, structuredHints);
      // interactive 模式仅首次启动（无 sessionId）消耗次数，继续对话不消耗
      if (!sessionId && req.freeUsage?.identifier) {
        await freeUsageService.incrementUsage(req.freeUsage.identifier);
      }
      res.json(result);
    } else {
      res.status(400).json({ error: 'mode 参数必须是 quick 或 interactive' });
    }
  } catch (error) {
    console.error('[UnifiedDiagnosis] Error:', error);
    res.status(500).json({ error: '诊断失败，请稍后重试', details: error.message });
  }
});

/**
 * GET /api/diagnosis/unified/intent
 * 意图解析测试接口（用于前端实时提示）
 */
router.get('/intent', async (req, res) => {
  try {
    const { input } = req.query;
    if (!input) {
      return res.status(400).json({ error: '缺少 input 参数' });
    }

    const { IntentParserService } = require('../services/unifiedDiagnosisService');
    const parser = new IntentParserService();
    const intent = await parser.parse(input);

    res.json({
      success: true,
      intent,
    });
  } catch (error) {
    console.error('[UnifiedDiagnosis] Intent parse error:', error);
    res.status(500).json({ error: '意图解析失败' });
  }
});

/**
 * GET /api/diagnosis/unified/session/:sessionId
 * 获取会话状态
 */
router.get('/session/:sessionId', async (req, res) => {
  try {
    const { getSession } = require('../services/unifiedDiagnosisService');
    const session = await getSession(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ error: '会话不存在或已过期' });
    }
    res.json({
      success: true,
      session: {
        id: session.id,
        status: session.status,
        intent: session.intent,
        treeExecution: session.treeExecution,
        diagnosis: session.diagnosis,
        createdAt: session.createdAt,
      },
    });
  } catch (error) {
    res.status(500).json({ error: '获取会话失败' });
  }
});

module.exports = router;
