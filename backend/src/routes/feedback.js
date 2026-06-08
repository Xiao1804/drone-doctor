const express = require('express');
const router = express.Router();
const feedbackService = require('../services/feedbackService');
const { optionalAuthMiddleware, authMiddleware, adminMiddleware } = require('../middleware/auth');

function sendError(res, error) {
  const status = error.statusCode || error.status || 500;
  res.status(status).json({
    success: false,
    error: error.message || '反馈服务错误',
  });
}

/**
 * POST /api/feedback
 * 提交反馈。允许匿名用户和登录用户。
 */
router.post('/', optionalAuthMiddleware, async (req, res) => {
  try {
    const feedback = await feedbackService.createFeedback(req.body, req.user || null);
    res.json({
      success: true,
      feedback: {
        id: feedback.id,
        status: feedback.status,
      },
    });
  } catch (error) {
    console.error('[Feedback] create error:', error);
    sendError(res, error);
  }
});

/**
 * GET /api/feedback/meta
 * 前端表单元数据。
 */
router.get('/meta', async (req, res) => {
  res.json({
    success: true,
    types: feedbackService.FEEDBACK_TYPES,
    ratings: feedbackService.FEEDBACK_RATINGS,
    statuses: feedbackService.FEEDBACK_STATUSES,
  });
});

/**
 * GET /api/feedback/admin
 * 管理员查看反馈列表。
 */
router.get('/admin', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const result = await feedbackService.listFeedback({
      status: req.query.status,
      page: req.query.page,
      pageSize: req.query.pageSize,
    });
    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('[Feedback] list error:', error);
    sendError(res, error);
  }
});

/**
 * PUT /api/feedback/admin/:id
 * 管理员更新反馈状态和备注。
 */
router.put('/admin/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const feedback = await feedbackService.updateFeedback(req.params.id, req.body);
    res.json({
      success: true,
      feedback,
    });
  } catch (error) {
    console.error('[Feedback] update error:', error);
    sendError(res, error);
  }
});

module.exports = router;
