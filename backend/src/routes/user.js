const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

// 公开路由（无需登录）
router.post('/register', userController.register);
router.post('/login', userController.login);

// 需要登录的路由
router.get('/me', authMiddleware, userController.getCurrentUser);
router.put('/me', authMiddleware, userController.updateUser);
router.post('/change-password', authMiddleware, userController.changePassword);
router.get('/verify', authMiddleware, userController.verifyToken);

// 管理员路由
router.get('/all', authMiddleware, adminMiddleware, userController.getAllUsers);
router.delete('/:userId', authMiddleware, adminMiddleware, userController.deleteUser);
router.get('/stats', authMiddleware, adminMiddleware, userController.getStats);

module.exports = router;
