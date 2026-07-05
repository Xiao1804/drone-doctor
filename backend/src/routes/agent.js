/**
 * v2.1 无人机智能体 API
 */

const express = require('express');
const router = express.Router();
const agentService = require('../services/agentService');
const knowledgeRetrievalService = require('../services/knowledgeRetrievalService');
const { agentGate } = require('../middleware/agentGate');

/**
 * POST /api/agent/chat
 * 智能体对话接口
 */
router.post('/chat', agentGate, async (req, res) => {
  try {
    const {
      message,
      conversationHistory = [],
      options = {},
    } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'message 不能为空' });
    }

    const result = await agentService.chat(message, conversationHistory, options);

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('[Agent Route] Chat error:', error);
    res.status(500).json({
      success: false,
      error: '智能体对话失败',
      details: error.message,
    });
  }
});

/**
 * GET /api/agent/status
 * 获取智能体状态
 */
router.get('/status', async (req, res) => {
  try {
    const status = agentService.getStatus();
    
    // 获取知识库统计
    const knowledgeStats = await knowledgeRetrievalService.getStats();

    res.json({
      success: true,
      ...status,
      knowledge: knowledgeStats,
    });
  } catch (error) {
    console.error('[Agent Route] Status error:', error);
    res.status(500).json({
      success: false,
      error: '获取状态失败',
      details: error.message,
    });
  }
});

/**
 * POST /api/agent/retrieve
 * 知识库检索接口
 */
router.post('/retrieve', agentGate, async (req, res) => {
  try {
    const { query, topK = 5, filters = {} } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'query 不能为空' });
    }

    const retrieval = await knowledgeRetrievalService.retrieve(query, topK, filters);

    res.json({
      success: true,
      ...retrieval,
    });
  } catch (error) {
    console.error('[Agent Route] Retrieve error:', error);
    res.status(500).json({
      success: false,
      error: '检索失败',
      details: error.message,
    });
  }
});

module.exports = router;
