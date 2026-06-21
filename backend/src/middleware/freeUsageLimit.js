const couponService = require('../services/couponService');
const userService = require('../services/userService');

/**
 * 体验通行证检查中间件
 * 逻辑：
 * 1. 当前数据库中的管理员 → 放行
 * 2. 有效的免注册体验通行证 → 放行
 * 3. 普通历史账号、过期或伪造通行证 → 拒绝
 */
async function freeUsageLimit(req, res, next) {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({
        error: 'TRIAL_ACCESS_REQUIRED',
        message: '请先使用兑换券激活免费体验'
      });
    }

    const decoded = userService.verifyToken(token);
    if (decoded?.userId && decoded?.tokenType !== 'trial_access') {
      const currentUser = await userService.getActiveUser(decoded.userId);
      if (currentUser?.role === 'admin') {
        req.user = currentUser;
        req.userId = currentUser.id;
        req.freeUsage = {
          allowed: true,
          isAdmin: true,
          identifier: { type: 'admin', value: currentUser.id },
        };
        return next();
      }
    }

    const trialAccess = await couponService.validateTrialAccessToken(token);
    if (trialAccess.valid) {
      req.trialAccess = trialAccess;
      req.freeUsage = {
        allowed: true,
        isAdmin: false,
        isTrial: true,
        expiresAt: trialAccess.expiresAt,
        daysLeft: trialAccess.daysLeft,
        identifier: trialAccess.identifier,
      };
      return next();
    }

    return res.status(403).json({
      error: 'TRIAL_ACCESS_REQUIRED',
      message: trialAccess.reason === 'expired'
        ? '免费体验已到期，请联系微信领取新的兑换券'
        : '体验通行证无效，请重新输入兑换券'
    });
  } catch (error) {
    console.error('[TrialAccess] Middleware error:', error);
    return res.status(503).json({
      error: 'SERVICE_UNAVAILABLE',
      message: '服务暂时不可用，请稍后重试'
    });
  }
}

module.exports = { freeUsageLimit };
