const express = require('express');
const userController = require('../controllers/userController');
const { authMiddleware } = require('../middleware/auth');

/**
 * @param {import('express').RequestHandler[]} authLimiters - 登录速率限制
 */
module.exports = function (authLimiters) {
  const router = express.Router();

  // 普通用户账号体系已下线。仅保留管理员登录。
  router.post('/register', (req, res) => {
    res.status(410).json({
      error: '普通账号功能已下线，请使用兑换券激活免费体验',
      code: 'PUBLIC_ACCOUNTS_RETIRED',
    });
  });
  router.post('/login', ...authLimiters, userController.login);

  // 管理员自助安全设置
  router.get('/me', authMiddleware, userController.getCurrentUser);
  router.put('/me', authMiddleware, userController.updateUser);
  router.post('/change-password', authMiddleware, userController.changePassword);
  router.get('/verify', authMiddleware, userController.verifyToken);

  return router;
};
