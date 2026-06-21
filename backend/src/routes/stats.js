const express = require('express');
const router = express.Router();
const { query } = require('../db');
const couponService = require('../services/couponService');
const userService = require('../services/userService');

// GET /api/stats/free-usage - 当前管理员或体验通行证状态
router.get('/free-usage', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.json({
        allowed: false,
        isTrial: false,
        expiresAt: null,
        daysLeft: 0,
        isAdmin: false,
      });
    }

    const decoded = userService.verifyToken(token);
    if (decoded?.userId && decoded?.tokenType !== 'trial_access') {
      const currentUser = await userService.getActiveUser(decoded.userId);
      if (currentUser?.role === 'admin') {
        return res.json({
          allowed: true,
          isTrial: false,
          expiresAt: null,
          daysLeft: 0,
          isAdmin: true,
        });
      }
    }

    res.json(await couponService.getAccessStatus(token));
  } catch (error) {
    console.error('Trial access stats error:', error);
    res.status(500).json({ error: '获取体验状态失败' });
  }
});

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

// GET /api/stats/overview - 平台概况统计（真实数据）
router.get('/overview', async (req, res) => {
  try {
    // 诊断次数：从 events 表统计
    let totalDiagnoses = 0;
    try {
      const diagResult = await query(
        "SELECT COUNT(*) as total FROM events WHERE event IN ('diagnosis_complete', 'diagnosis_start')"
      );
      totalDiagnoses = parseInt(diagResult.rows[0]?.total || '0', 10);
    } catch (e) {
      console.warn('[Stats] Failed to query diagnoses count:', e.message);
    }

    // 已激活体验数：用于需求验证，不再展示账号用户数
    let totalTrials = 0;
    try {
      const trialResult = await query("SELECT COUNT(*) as total FROM coupons WHERE status = 'used'");
      totalTrials = parseInt(trialResult.rows[0]?.total || '0', 10);
    } catch (e) {
      console.warn('[Stats] Failed to query activated trials:', e.message);
    }

    // 案例数：从 JSON 文件读取
    let totalCases = 129; // 默认值
    try {
      const fs = require('fs');
      const path = require('path');
      const casesPath = path.join(__dirname, '../../data/fault-cases-enhanced.json');
      const casesData = JSON.parse(fs.readFileSync(casesPath, 'utf-8'));
      totalCases = casesData.filter(c => c.reviewStatus === 'approved').length || casesData.length;
    } catch (e) {
      console.warn('[Stats] Failed to read cases count:', e.message);
    }

    res.json({
      totalDiagnoses,
      totalTrials,
      totalCases,
    });
  } catch (error) {
    console.error('Stats overview error:', error);
    res.json({ totalDiagnoses: 0, totalTrials: 0, totalCases: 129 });
  }
});

module.exports = router;
