const couponService = require('../services/couponService');
const userService = require('../services/userService');

/**
 * 会员检查中间件（原免费次数限制，改为会员验证）
 * 逻辑：
 * 1. 未登录 → 401
 * 2. 管理员 → 放行
 * 3. 有有效会员 → 放行
 * 4. 无会员 → 403
 */
async function freeUsageLimit(req, res, next) {
  try {
    // 检查是否登录
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({
        error: 'AUTH_REQUIRED',
        message: '请先登录'
      });
    }

    const decoded = userService.verifyToken(token);
    if (!decoded?.userId) {
      return res.status(401).json({
        error: 'AUTH_REQUIRED',
        message: '请先登录'
      });
    }

    const currentUser = await userService.getActiveUser(decoded.userId);
    if (!currentUser) {
      return res.status(401).json({
        error: 'AUTH_REQUIRED',
        message: '用户不存在或已停用'
      });
    }

    // 附加用户信息到 req
    req.user = currentUser;
    req.userId = currentUser.id;

    // 管理员放行
    if (currentUser.role === 'admin') {
      req.freeUsage = { allowed: true, isAdmin: true };
      return next();
    }

    // 检查会员状态
    const membership = await couponService.getUserMembership(currentUser.id);

    if (membership.isMember) {
      req.freeUsage = {
        allowed: true,
        isAdmin: false,
        isMember: true,
        expiresAt: membership.expiresAt,
        daysLeft: membership.daysLeft,
      };
      return next();
    }

    // 无有效会员
    return res.status(403).json({
      error: 'MEMBERSHIP_REQUIRED',
      message: '需要券码激活会员才能使用'
    });
  } catch (error) {
    console.error('[MembershipLimit] Middleware error:', error);
    // 出错时阻止请求，避免安全漏洞
    return res.status(503).json({
      error: 'SERVICE_UNAVAILABLE',
      message: '服务暂时不可用，请稍后重试'
    });
  }
}

module.exports = { freeUsageLimit };
