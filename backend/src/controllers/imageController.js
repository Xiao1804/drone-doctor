const imageRecognitionService = require('../services/imageRecognitionService');

/**
 * 上传并识别图片
 */
exports.recognizeImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请上传图片文件' });
    }

    const { scenario } = req.body; // fault/error/model/log
    
    if (!['fault', 'error', 'model', 'log'].includes(scenario)) {
      return res.status(400).json({ error: '无效的识别场景，支持：fault（故障部位）、error（APP报错）、model（设备型号）、log（飞行日志）' });
    }

    const imagePath = req.file.path;
    
    console.log(`Processing image: ${imagePath}, scenario: ${scenario}`);

    // 调用图片识别服务
    const result = await imageRecognitionService.recognizeImage(imagePath, scenario);
    
    // 删除临时文件
    await imageRecognitionService.deleteFile(imagePath);

    res.json({
      success: true,
      scenario: scenario,
      result: result,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Image recognition controller error:', error);
    
    // 删除临时文件
    if (req.file && req.file.path) {
      await imageRecognitionService.deleteFile(req.file.path);
    }
    
    res.status(500).json({ error: error.message || '图片识别失败' });
  }
};

/**
 * 批量识别图片
 */
exports.recognizeBatch = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: '请上传图片文件' });
    }

    const { scenario } = req.body;
    
    if (!['fault', 'error', 'model', 'log'].includes(scenario)) {
      return res.status(400).json({ error: '无效的识别场景' });
    }

    const results = [];

    for (const file of req.files) {
      try {
        const imagePath = file.path;
        const result = await imageRecognitionService.recognizeImage(imagePath, scenario);
        
        results.push({
          filename: file.originalname,
          success: true,
          result: result
        });

        // 删除临时文件
        await imageRecognitionService.deleteFile(imagePath);

      } catch (error) {
        results.push({
          filename: file.originalname,
          success: false,
          error: error.message
        });

        // 删除临时文件
        if (file.path) {
          await imageRecognitionService.deleteFile(file.path);
        }
      }
    }

    res.json({
      success: true,
      scenario: scenario,
      total: req.files.length,
      results: results,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Batch recognition error:', error);
    
    // 删除所有临时文件
    if (req.files) {
      for (const file of req.files) {
        if (file.path) {
          await imageRecognitionService.deleteFile(file.path);
        }
      }
    }
    
    res.status(500).json({ error: '批量识别失败' });
  }
};
