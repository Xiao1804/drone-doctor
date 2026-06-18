const express = require('express');
const router = express.Router();
const caseController = require('../controllers/caseController');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

// 公开读取路由（无需登录）
router.get('/', caseController.getAllCases);
router.get('/search', caseController.searchCases);
router.get('/stats', caseController.getStats);
router.get('/:id', caseController.getCase);

// 写操作需要管理员权限
router.post('/', authMiddleware, adminMiddleware, caseController.addCase);
router.put('/:id', authMiddleware, adminMiddleware, caseController.updateCase);
router.post('/:id/review', authMiddleware, adminMiddleware, caseController.reviewCase);
router.delete('/:id', authMiddleware, adminMiddleware, caseController.deleteCase);

module.exports = router;
