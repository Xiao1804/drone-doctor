const express = require('express');
const router = express.Router();
const historyController = require('../controllers/historyController');
const { authMiddleware } = require('../middleware/auth');

// 所有历史记录路由都需要登录
router.get('/', authMiddleware, historyController.getHistory);
router.post('/', authMiddleware, historyController.saveHistory);
router.delete('/:id', authMiddleware, historyController.deleteHistory);
router.put('/:id/favorite', authMiddleware, historyController.toggleFavorite);

module.exports = router;
