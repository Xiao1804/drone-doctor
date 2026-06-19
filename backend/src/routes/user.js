const express = require('express');
const userController = require('../controllers/userController');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

/**
 * @param {import('express').RequestHandler[]} authLimiters - 登录速率限制
 */
module.exports = function (authLimiters) {
  const router = express.Router();

  // 公开注册已下线。保留明确响应，避免旧客户端误以为请求异常。
  router.post('/register', (req, res) => {
    res.status(403).json({
      error: '公开账号申请暂未开放',
      code: 'REGISTRATION_DISABLED',
    });
  });
  router.post('/login', ...authLimiters, userController.login);

  // 需要登录的路由
  router.get('/me', authMiddleware, userController.getCurrentUser);
  router.put('/me', authMiddleware, userController.updateUser);
  router.post('/change-password', authMiddleware, userController.changePassword);
  router.get('/verify', authMiddleware, userController.verifyToken);

  // 管理员路由
  router.get('/all', authMiddleware, adminMiddleware, userController.getAllUsers);
  router.delete('/:userId', authMiddleware, adminMiddleware, userController.deleteUser);
  router.get('/stats', authMiddleware, adminMiddleware, userController.getStats);

  return router;
};
