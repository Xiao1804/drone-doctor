/**
 * 无人机选购参谋 API
 * 克隆自 agent.js，独立路由前缀 /api/advisor
 */

const express = require('express');
const router = express.Router();
const advisorService = require('../services/advisorService');
const knowledgeRetrievalService = require('../services/knowledgeRetrievalService');
const { freeUsageLimit } = require('../middleware/freeUsageLimit');

/**
 * POST /api/advisor/chat
 * 选购参谋对话接口
 */
router.post('/chat', freeUsageLimit, async (req, res) => {
  try {
    const {
      message,
      conversationHistory = [],
      options = {},
    } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'message 不能为空' });
    }

    const result = await advisorService.chat(message, conversationHistory, options);

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('[Advisor Route] Chat error:', error);
    res.status(500).json({
      success: false,
      error: '选购参谋对话失败',
      details: error.message,
    });
  }
});

/**
 * GET /api/advisor/status
 * 获取选购参谋状态
 */
router.get('/status', async (req, res) => {
  try {
    const status = advisorService.getStatus();

    // 获取选购知识库统计（只统计 purchase 分类）
    const knowledgeStats = await knowledgeRetrievalService.getStats();

    res.json({
      success: true,
      ...status,
      knowledge: knowledgeStats,
    });
  } catch (error) {
    console.error('[Advisor Route] Status error:', error);
    res.status(500).json({
      success: false,
      error: '获取状态失败',
      details: error.message,
    });
  }
});

/**
 * POST /api/advisor/retrieve
 * 选购知识库检索接口（默认只检索 purchase 分类）
 */
router.post('/retrieve', freeUsageLimit, async (req, res) => {
  try {
    const { query, topK = 5, filters = {} } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'query 不能为空' });
    }

    // 强制隔离：只检索选购知识库
    const mergedFilters = { ...filters, category_l1: 'purchase' };

    const retrieval = await knowledgeRetrievalService.retrieve(query, topK, mergedFilters);

    res.json({
      success: true,
      ...retrieval,
    });
  } catch (error) {
    console.error('[Advisor Route] Retrieve error:', error);
    res.status(500).json({
      success: false,
      error: '检索失败',
      details: error.message,
    });
  }
});

module.exports = router;
