const express = require('express');
const router = express.Router();
const diagnosisController = require('../controllers/diagnosisController');

// AI诊断接口（单轮）
router.post('/', diagnosisController.diagnose);

// 多轮对话接口
router.post('/conversation/start', diagnosisController.startConversation);
router.post('/conversation/continue', diagnosisController.continueConversation);
router.get('/conversation/:sessionId', diagnosisController.getConversation);

// 测试接口
router.get('/test', diagnosisController.testMatch);

// 获取故障案例
router.get('/cases/:id', diagnosisController.getCase);

// 搜索故障案例
router.get('/cases', diagnosisController.searchCases);

module.exports = router;
