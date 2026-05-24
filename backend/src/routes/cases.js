const express = require('express');
const router = express.Router();
const caseController = require('../controllers/caseController');

// 获取所有案例
router.get('/', caseController.getAllCases);

// 搜索案例
router.get('/search', caseController.searchCases);

// 获取统计信息
router.get('/stats', caseController.getStats);

// 获取单个案例
router.get('/:id', caseController.getCase);

// 添加新案例
router.post('/', caseController.addCase);

// 更新案例
router.put('/:id', caseController.updateCase);

// 审核案例
router.post('/:id/review', caseController.reviewCase);

// 删除案例
router.delete('/:id', caseController.deleteCase);

module.exports = router;
