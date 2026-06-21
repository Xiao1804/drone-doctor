const express = require('express');
const router = express.Router();
const diagnosisController = require('../controllers/diagnosisController');
const { freeUsageLimit } = require('../middleware/freeUsageLimit');

// AI诊断接口（单轮）—— 消耗免费次数
router.post('/', freeUsageLimit, diagnosisController.diagnose);

// 多轮对话接口 —— 同一次诊断只在 start 记录使用，但全程都要求有效通行证
router.post('/conversation/start', freeUsageLimit, diagnosisController.startConversation);
router.post('/conversation/continue', freeUsageLimit, diagnosisController.continueConversation);
router.get('/conversation/:sessionId', freeUsageLimit, diagnosisController.getConversation);

// 测试接口
router.get('/test', diagnosisController.testMatch);

// 获取故障案例
router.get('/cases/:id', diagnosisController.getCase);

// 搜索故障案例
router.get('/cases', diagnosisController.searchCases);

module.exports = router;
