const express = require('express');
const router = express.Router();
const { run } = require('../db');

// POST /api/events - 埋点事件上报
router.post('/', async (req, res) => {
  try {
    const { event, data, timestamp } = req.body;

    if (!event) {
      return res.status(400).json({ error: '缺少 event 字段' });
    }

    const ip = req.ip || req.connection?.remoteAddress || '';
    const userId = req.headers['x-user-id'] || null;
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
