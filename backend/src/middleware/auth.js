const userService = require('../services/userService');

/**
 * 认证中间件
 */
const authMiddleware = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: '未登录' });
    }

    const decoded = userService.verifyToken(token);
    
    if (!decoded?.userId || decoded?.tokenType === 'trial_access') {
      return res.status(401).json({ error: 'Token无效或已过期' });
    }

    const user = await userService.getActiveUser(decoded.userId);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ error: '仅管理员可访问' });
    }

    req.user = user;
    req.userId = user.id;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(401).json({ error: '认证失败' });
  }
};

/**
 * 管理员权限中间件
 */
const adminMiddleware = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: '需要管理员权限' });
  }
  next();
};

/**
 * 可选认证中间件（不强制要求登录）
 */
const optionalAuthMiddleware = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (token) {
      const decoded = userService.verifyToken(token);
      const user = decoded?.userId && decoded?.tokenType !== 'trial_access'
        ? await userService.getActiveUser(decoded.userId)
        : null;
      if (user?.role === 'admin') {
        req.user = user;
        req.userId = user.id;
      }
    }
    
    next();
  } catch (error) {
    next();
  }
};

module.exports = {
  authMiddleware,
  adminMiddleware,
  optionalAuthMiddleware
};
