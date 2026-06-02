const flightLogService = require('../services/flightLogService');

exports.analyzeFlightLog = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请上传 .ulg 飞行日志原文件' });
    }

    const result = await flightLogService.analyzeFlightLog(req.file);
    await flightLogService.removeUploadedFile(req.file.path);

    res.json({
      success: true,
      result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Flight log analysis error:', error);

    if (req.file && req.file.path) {
      await flightLogService.removeUploadedFile(req.file.path);
    }

    res.status(500).json({
      error: error.message || '飞行日志解析失败',
    });
  }
};

exports.getCapabilities = (req, res) => {
  res.json({
    success: true,
    supportedFormats: ['.ulg'],
    supportedControllers: ['Walkera FCS-F8', 'Walkera FCS-F8 SE'],
    output: [
      '飞行时长、topic 列表、日志文本',
      '解锁/锁定、模式切换、failsafe 时间线',
      '遥控通道、电机输出、GPS/GNSS、电池、姿态概要',
      '确认事实、推断结论和未知字段分层说明',
    ],
  });
};
