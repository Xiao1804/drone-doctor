const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const baseDir = process.env.UPLOAD_DIR
      ? path.resolve(process.env.UPLOAD_DIR)
      : path.join(__dirname, '../../../uploads');
    const uploadDir = path.join(baseDir, 'flight-logs');

    fs.mkdir(uploadDir, { recursive: true })
      .then(() => cb(null, uploadDir))
      .catch(error => cb(error));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `flight-log-${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (ext === '.ulg') {
    cb(null, true);
    return;
  }
  cb(new Error('当前仅支持上传 .ulg 飞行日志原文件'), false);
};

module.exports = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 120 * 1024 * 1024,
  },
});
