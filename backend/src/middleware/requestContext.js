const crypto = require('crypto');
const logger = require('../utils/logger');

function requestContext(req, res, next) {
  const requestId = String(req.headers['x-request-id'] || crypto.randomUUID()).slice(0, 128);
  const startedAt = Date.now();

  req.requestId = requestId;
  res.setHeader('x-request-id', requestId);

  res.on('finish', () => {
    logger.info('http_request', {
      requestId,
      method: req.method,
      path: req.originalUrl?.split('?')[0] || req.path,
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt,
    });
  });

  next();
}

module.exports = { requestContext };
