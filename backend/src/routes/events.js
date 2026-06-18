const express = require('express');
const router = express.Router();
const { run } = require('../db');
const { optionalAuthMiddleware } = require('../middleware/auth');
const { createEventLimiter } = require('../middleware/rateLimiters');
const { TRACKING_EVENT_SET } = require('../constants/trackingEvents');

// 事件上报速率限制：每分钟最多 30 条
const eventLimiter = createEventLimiter();
const MAX_EVENT_DATA_BYTES = 16 * 1024;

// POST /api/events - 埋点事件上报（可选认证，限制速率）
router.post('/', eventLimiter, optionalAuthMiddleware, async (req, res) => {
  try {
    const { event, data } = req.body;
    const normalizedEvent = typeof event === 'string' ? event.trim() : '';

    if (!TRACKING_EVENT_SET.has(normalizedEvent)) {
      return res.status(400).json({ error: '不支持的事件类型' });
    }

    const normalizedData = data === undefined ? {} : data;
    if (normalizedData === null || Array.isArray(normalizedData) || typeof normalizedData !== 'object') {
      return res.status(400).json({ error: 'data 必须是 JSON 对象' });
    }

    const eventData = JSON.stringify(normalizedData);
    if (Buffer.byteLength(eventData, 'utf8') > MAX_EVENT_DATA_BYTES) {
      return res.status(413).json({ error: '事件数据过大' });
    }

    const ip = req.ip || '';
    // 使用可选认证获取的 userId，不再信任客户端 header
    const userId = req.userId || null;

    await run(
      'INSERT INTO events (event, data, user_id, ip) VALUES (?, ?, ?, ?)',
      [normalizedEvent, eventData, userId, ip]
    );

    res.json({ ok: true });
  } catch (error) {
    console.error('Event tracking error:', error);
    res.status(500).json({ error: '事件记录失败' });
  }
});

module.exports = router;
