const express = require('express');
const router = express.Router();
const { query } = require('../db');

// GET /api/stats/total-diagnoses - 总诊断次数
router.get('/total-diagnoses', async (req, res) => {
  try {
    const result = await query(
      "SELECT COUNT(*) as total FROM events WHERE event = 'diagnosis_complete'"
    );
    const total = parseInt(result.rows[0]?.total || '0', 10);
    res.json({ total });
  } catch (error) {
    console.error('Total diagnoses error:', error);
    res.json({ total: 0 });
  }
});

// GET /api/stats/similar-diagnoses - 相似诊断次数（本月）
router.get('/similar-diagnoses', async (req, res) => {
  try {
    const { deviceType, faultType } = req.query;

    if (!deviceType && !faultType) {
      return res.json({ total: 0, period: '本月' });
    }

    // 在 events 表中查找 diagnosis_complete 事件，data 里有 deviceType/faultType
    const result = await query(
      `SELECT COUNT(*) as total FROM events 
       WHERE event = 'diagnosis_complete' 
       AND created_at >= date_trunc('month', CURRENT_DATE)`,
      []
    );

    let total = parseInt(result.rows[0]?.total || '0', 10);

    // 如果有筛选条件，在 data JSON 中进一步过滤
    if (deviceType || faultType) {
      const conditions = ["event = 'diagnosis_complete'"];
      const params = [];

      if (deviceType) {
        conditions.push(`data::text LIKE ?`);
        params.push(`%${deviceType}%`);
      }
      if (faultType) {
        conditions.push(`data::text LIKE ?`);
        params.push(`%${faultType}%`);
      }

      const filterResult = await query(
        `SELECT COUNT(*) as total FROM events WHERE ${conditions.join(' AND ')}`,
        params
      );
      total = parseInt(filterResult.rows[0]?.total || '0', 10);
    }

    res.json({ total, period: '本月' });
  } catch (error) {
    console.error('Similar diagnoses error:', error);
    res.json({ total: 0, period: '本月' });
  }
});

module.exports = router;
