/**
 * Agent 匿名门禁中间件
 *
 * 给 /api/agent/chat、/api/agent/retrieve 做"先尝后领券"的渐进门禁：
 *   1. 持有效 admin JWT 或 trial_access 兑换券通行证 → 放行（与诊断路径一致）
 *   2. 其余（无 token / 无效 / 过期 / 非管理员 user token）→ 匿名计数：
 *      按 IP 前 LIMIT(=2) 次放行；超出 → 401 TRIAL_ACCESS_REQUIRED，
 *      前端 isFreeLimitError 识别后弹 <CouponModal>（沿用诊断路径现成 UX）。
 *
 * 与 freeUsageLimit.js 的区别：freeUsageLimit 是硬门槛（必须通行证），
 * 这里多了"匿名 N 次"软门槛，让任何人能零摩擦尝鲜 2 次再引导领券。
 */

const couponService = require('../services/couponService');
const userService = require('../services/userService');
const { getIpIdentifier } = require('../services/freeUsageService');
const { LIMIT, getCount, incrementAndGet } = require('../services/agentAnonUsageService');

async function agentGate(req, res, next) {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (token) {
      // (a) 管理员 JWT
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

      // (b) 兑换券 trial_access 通行证
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
      // 无效/过期 token → 落到匿名计数（软门槛，不区别对待）
    }

    // (c) 匿名 / 无有效 token：按 IP 计数
    const identifier = getIpIdentifier(req);
    const used = getCount(identifier);
    if (used < LIMIT) {
      const newCount = incrementAndGet(identifier);
      req.freeUsage = {
        allowed: true,
        isAnon: true,
        used: newCount,
        remaining: Math.max(0, LIMIT - newCount),
        limit: LIMIT,
        identifier,
      };
      return next();
    }

    return res.status(401).json({
      error: 'TRIAL_ACCESS_REQUIRED',
      message: `免费体验已用完（共 ${LIMIT} 次），加微信领兑换券可继续免费使用 3 天`,
    });
  } catch (error) {
    console.error('[AgentGate] error:', error);
    return res.status(503).json({
      error: 'SERVICE_UNAVAILABLE',
      message: '服务暂时不可用，请稍后重试',
    });
  }
}

module.exports = { agentGate };
