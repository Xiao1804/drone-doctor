const express = require('express');
const router = express.Router();
const couponService = require('../services/couponService');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const { createCouponActivationLimiter } = require('../middleware/rateLimiters');

// 所有新券码统一为 3 天体验。
const DURATIONS = [
  { days: 3, label: '3天体验' },
];
const activationLimiter = createCouponActivationLimiter();

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

// POST /api/coupon/activate — 无需注册，兑换限时体验通行证
router.post('/activate', activationLimiter, async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ error: '请输入券码' });
    }

    const result = await couponService.activateCoupon(code);
    res.json({
      success: true,
      message: '激活成功',
      accessToken: result.accessToken,
      expiresAt: result.expiresAt,
      durationLabel: result.durationLabel,
    });
  } catch (error) {
    console.error('Activate coupon error:', error);
    res.status(400).json({ error: error.message || '激活失败' });
  }
});

// GET /api/coupon/access — 查询当前匿名体验通行证状态
router.get('/access', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const status = await couponService.getAccessStatus(token);
    res.json(status);
  } catch (error) {
    console.error('Get trial access status error:', error);
    res.status(500).json({ error: '查询体验状态失败' });
  }
});

// 旧会员接口已下线，避免旧客户端把免费体验误认为付费会员。
router.get('/membership', (req, res) => {
  res.status(410).json({
    success: false,
    error: '会员功能已下线，请刷新页面后使用免费体验通行证',
    code: 'MEMBERSHIP_RETIRED',
  });
});

// GET /api/coupon/metrics — 管理员查看市场验证指标
router.get('/metrics', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    res.json(await couponService.getMarketMetrics());
  } catch (error) {
    console.error('Get coupon metrics error:', error);
    res.status(500).json({ error: '查询市场验证指标失败' });
  }
});

// PUT /api/coupon/:id/issue — 发给微信用户时标记为已发放
router.put('/:id/issue', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    res.json(await couponService.markCouponIssued(req.params.id));
  } catch (error) {
    console.error('Mark coupon issued error:', error);
    res.status(400).json({ error: error.message || '标记发放失败' });
  }
});

// PUT /api/coupon/:id/disable — 禁用券码或撤销体验通行证（管理员）
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
