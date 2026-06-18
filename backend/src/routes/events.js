const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const { run } = require('../db');
const { optionalAuthMiddleware } = require('../middleware/auth');

// 事件上报速率限制：每分钟最多 30 条
const eventLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

// POST /api/events - 埋点事件上报（可选认证，限制速率）
router.post('/', eventLimiter, optionalAuthMiddleware, async (req, res) => {
  try {
    const { event, data } = req.body;

    if (!event || typeof event !== 'string' || event.length > 100) {
      return res.status(400).json({ error: '缺少 event 字段或格式错误' });
    }

    const ip = req.ip || '';
    // 使用可选认证获取的 userId，不再信任客户端 header
    const userId = req.userId || null;
    const eventData = typeof data === 'object' ? JSON.stringify(data) : '{}';

    await run(
      'INSERT INTO events (event, data, user_id, ip) VALUES (?, ?, ?, ?)',
      [event, eventData, userId, ip]
    );

    res.json({ ok: true });
  } catch (error) {
    console.error('Event tracking error:', error);
    res.status(500).json({ error: '事件记录失败' });
  }
});

module.exports = router;
