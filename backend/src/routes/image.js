const express = require('express');
const router = express.Router();
const imageController = require('../controllers/imageController');
const upload = require('../middleware/upload');

// 单张图片识别
router.post('/recognize', upload.single('image'), imageController.recognizeImage);

// 批量图片识别
router.post('/recognize/batch', upload.array('images', 5), imageController.recognizeBatch);

module.exports = router;
