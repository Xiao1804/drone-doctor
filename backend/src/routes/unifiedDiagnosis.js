const express = require('express');
const router = express.Router();
const { quickDiagnose, interactiveDiagnose, loadData } = require('../services/unifiedDiagnosisService');
const { freeUsageLimit } = require('../middleware/freeUsageLimit');
const { optionalAuthMiddleware } = require('../middleware/auth');
const freeUsageService = require('../services/freeUsageService');
const historyService = require('../services/historyService');
const { run } = require('../db');

// 确保数据已加载
loadData().catch(err => console.error('[UnifiedDiagnosis] Failed to load data:', err.message));

async function recordMarketEvent(req, event, data = {}) {
  if (!req.trialAccess) return;

  try {
    await run(
      'INSERT INTO events (event, data, user_id, ip) VALUES (?, ?, ?, ?)',
      [
        event,
        JSON.stringify(data),
        `trial:${req.trialAccess.accessId}`,
        req.ip || '',
      ]
    );
  } catch (error) {
    console.warn(`[MarketMetrics] Failed to record ${event}:`, error.message);
  }
}

function hasUsefulQuickDiagnosis(result) {
  return !!(
    result &&
    result.success !== false &&
    result.mode === 'quick' &&
    !result.fallback &&
    result.matchedTree &&
    result.diagnosis &&
    Array.isArray(result.diagnosis.steps) &&
    result.diagnosis.steps.length > 0
  );
}

function hasUsefulInteractiveStart(result) {
  return !!(
    result &&
    result.success !== false &&
    result.mode === 'interactive' &&
    result.status === 'active' &&
    result.sessionId &&
    result.currentNode
  );
}

function hasCompletedInteractiveDiagnosis(result) {
  return !!(
    result &&
    result.success !== false &&
    result.mode === 'interactive' &&
    result.status === 'completed' &&
    result.diagnosis
  );
}

function shouldChargeUsage(mode, sessionId, result) {
  if (mode === 'quick') {
    return hasUsefulQuickDiagnosis(result);
  }

  // 交互式诊断首次启动，如果已经成功进入可执行流程，则算一次有效诊断。
  // 如果没有匹配到流程、没有 currentNode、没有诊断结果，不扣次数。
  if (mode === 'interactive' && !sessionId) {
    return hasUsefulInteractiveStart(result) || hasCompletedInteractiveDiagnosis(result);
  }

  return false;
}

function summarizeDiagnosisResult(result) {
  if (!result) return '无诊断结果';

  if (result.mode === 'quick') {
    const faultLabel = result.intent?.faultTypeLabel || '未知故障';
    const treeName = result.matchedTree?.name || '未匹配排故树';
    const causes = result.diagnosis?.possibleCauses
      ?.map(c => c.cause)
      ?.filter(Boolean)
      ?.slice(0, 3)
      ?.join('；');
    const steps = result.diagnosis?.steps
      ?.slice(0, 3)
      ?.map(s => `${s.step}. ${s.operation}`)
      ?.join('\n');

    return [
      `故障类型：${faultLabel}`,
      `匹配流程：${treeName}`,
      causes ? `可能原因：${causes}` : '',
      steps ? `建议步骤：\n${steps}` : '',
    ].filter(Boolean).join('\n');
  }

  if (result.mode === 'interactive') {
    const conclusion = result.terminalNode?.conclusion || result.currentNode?.title || '交互式诊断';
    const recommendation = result.terminalNode?.recommendation || result.currentNode?.description || '';
    return [
      `诊断结论：${conclusion}`,
      recommendation ? `建议操作：${recommendation}` : '',
    ].filter(Boolean).join('\n');
  }

  return JSON.stringify(result).slice(0, 1000);
}

async function saveDiagnosisHistoryIfPossible(req, { mode, input, result }) {
  if (!req.userId) return;

  const useful = mode === 'quick'
    ? hasUsefulQuickDiagnosis(result)
    : hasCompletedInteractiveDiagnosis(result);

  if (!useful) return;

  try {
    await historyService.saveHistory(req.userId, {
      type: mode === 'interactive' ? 'conversation' : 'text',
      content: input || result?.intent?.raw || '无人机故障诊断',
      result: summarizeDiagnosisResult(result),
    });
  } catch (error) {
    // 历史保存失败不能影响诊断主流程
    console.error('[UnifiedDiagnosis] Save history failed:', error.message);
  }
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
router.post('/', optionalAuthMiddleware, freeUsageLimit, async (req, res) => {
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
      await recordMarketEvent(req, 'trial_diagnosis_start', { mode });
      const result = await quickDiagnose(input, structuredHints);

      if (shouldChargeUsage(mode, sessionId, result) && req.freeUsage?.identifier) {
        await freeUsageService.incrementUsage(req.freeUsage.identifier);
        await recordMarketEvent(req, 'trial_diagnosis_complete', { mode });
      }

      await saveDiagnosisHistoryIfPossible(req, { mode, input, result });
      return res.json(result);
    }

    if (mode === 'interactive') {
      if (!sessionId) {
        await recordMarketEvent(req, 'trial_diagnosis_start', { mode });
      }
      const result = await interactiveDiagnose(sessionId, input, userAnswer, structuredHints);

      if (shouldChargeUsage(mode, sessionId, result) && req.freeUsage?.identifier) {
        await freeUsageService.incrementUsage(req.freeUsage.identifier);
      }
      if (hasCompletedInteractiveDiagnosis(result)) {
        await recordMarketEvent(req, 'trial_diagnosis_complete', { mode });
      }

      await saveDiagnosisHistoryIfPossible(req, { mode, input, result });
      return res.json(result);
    }

    return res.status(400).json({ error: 'mode 参数必须是 quick 或 interactive' });
  } catch (error) {
    console.error('[UnifiedDiagnosis] Error:', error);
    res.status(500).json({ error: '诊断失败，请稍后重试', details: error.message });
  }
});

/**
 * GET /api/diagnosis/unified/intent
 * 意图解析测试接口（用于前端实时提示）
 */
router.get('/intent', freeUsageLimit, async (req, res) => {
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
router.get('/session/:sessionId', freeUsageLimit, async (req, res) => {
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
