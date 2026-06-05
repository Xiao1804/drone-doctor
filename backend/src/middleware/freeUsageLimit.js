const freeUsageService = require('../services/freeUsageService');

/**
 * 免费诊断次数限制中间件
 * 在诊断路由前使用，拦截已用完免费次数的请求
 */
async function freeUsageLimit(req, res, next) {
  try {
    const result = await freeUsageService.checkLimit(req);

    // 将使用信息附加到 req 上，供后续控制器读取和增加次数
    req.freeUsage = result;

    if (!result.allowed) {
      return res.status(429).json({
        error: '免费次数已用完',
        message: '今日免费诊断次数已用完（3次/天），请明日再来或升级会员享受无限次诊断',
        code: 'FREE_LIMIT_EXCEEDED',
        remaining: 0,
        used: result.used,
        limit: result.limit
      });
    }

    next();
  } catch (error) {
    console.error('[FreeUsageLimit] Middleware error:', error);
    // 校验出错时不阻止请求，避免服务中断
    next();
  }
}

module.exports = { freeUsageLimit };
