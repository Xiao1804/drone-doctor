const express = require('express');
const router = express.Router();
const couponService = require('../services/couponService');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

// 所有新券码统一为 3 天体验。
const DURATIONS = [
  { days: 3, label: '3天体验' },
];

// GET /api/coupon/durations — 返回可选时长列表（公开接口）
router.get('/durations', (req, res) => {
  res.json({ durations: DURATIONS });
});

// POST /api/coupon/generate — 生成券码（管理员）
router.post('/generate', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { count, note } = req.body;

    const numCount = Math.min(Math.max(parseInt(count, 10) || 1, 1), 100);

    const result = await couponService.generateCoupons(
      numCount,
      req.userId,
      note
    );

    res.json({
      success: true,
      codes: result.codes,
      batchId: result.batchId,
      count: result.codes.length,
    });
  } catch (error) {
    console.error('Generate coupon error:', error);
    res.status(500).json({ error: error.message || '生成券码失败' });
  }
});

// GET /api/coupon/list — 查询券码列表（管理员）
router.get('/list', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { status, durationDays, batchId, page, limit } = req.query;
    const result = await couponService.listCoupons({
      status,
      durationDays,
      batchId,
      page: parseInt(page, 10) || 1,
      limit: parseInt(limit, 10) || 20,
    });
    res.json(result);
  } catch (error) {
    console.error('List coupons error:', error);
    res.status(500).json({ error: '查询券码列表失败' });
  }
});

// POST /api/coupon/activate — 激活券码（登录用户）
router.post('/activate', authMiddleware, async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ error: '请输入券码' });
    }

    const result = await couponService.activateCoupon(code, req.userId);
    res.json({
      success: true,
      message: '激活成功',
      expiresAt: result.expiresAt,
      durationLabel: result.durationLabel,
    });
  } catch (error) {
    console.error('Activate coupon error:', error);
    res.status(400).json({ error: error.message || '激活失败' });
  }
});

// GET /api/coupon/membership — 查询当前会员状态（登录用户）
router.get('/membership', authMiddleware, async (req, res) => {
  try {
    const membership = await couponService.getUserMembership(req.userId);
    res.json(membership);
  } catch (error) {
    console.error('Get membership error:', error);
    res.status(500).json({ error: '查询会员状态失败' });
  }
});

// PUT /api/coupon/:id/disable — 禁用券码（管理员）
router.put('/:id/disable', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const result = await couponService.disableCoupon(req.params.id);
    res.json(result);
  } catch (error) {
    console.error('Disable coupon error:', error);
    res.status(400).json({ error: error.message || '禁用失败' });
  }
});

module.exports = router;
