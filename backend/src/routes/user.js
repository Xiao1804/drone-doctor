const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

/**
 * @param {import('express').RequestHandler} authLimiter - 登录/注册速率限制
 */
module.exports = function (authLimiter) {
  // 公开路由（无需登录，但有速率限制）
  router.post('/register', authLimiter, userController.register);
  router.post('/login', authLimiter, userController.login);

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
