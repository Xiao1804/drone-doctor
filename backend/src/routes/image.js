const express = require('express');
const router = express.Router();
const imageController = require('../controllers/imageController');
const upload = require('../middleware/upload');
const { freeUsageLimit } = require('../middleware/freeUsageLimit');

// 单张图片识别 —— 消耗免费次数
router.post('/recognize', freeUsageLimit, upload.single('image'), imageController.recognizeImage);

// 批量图片识别 —— 每次批量请求消耗一次免费次数
router.post('/recognize/batch', freeUsageLimit, upload.array('images', 5), imageController.recognizeBatch);

module.exports = router;
