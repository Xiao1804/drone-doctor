const crypto = require('crypto');
const logger = require('../utils/logger');

/**
 * 统一错误处理中间件
 * 捕获所有未处理的错误，返回标准 JSON 错误响应
 */
function errorHandler(err, req, res, next) {
  const isDev = process.env.NODE_ENV !== 'production';

  // 确定状态码
  const statusCode = err.statusCode || err.status || 500;
  const isClientError = statusCode >= 400 && statusCode < 500;

  // 生成请求追踪 ID
  const requestId = req.requestId || req.headers['x-request-id'] || crypto.randomUUID();

  // 构建标准错误响应
  const errorResponse = {
    errorCode: statusCode,
    message: isClientError
      ? (err.message || '请求参数错误')
      : (isDev ? (err.message || '服务器内部错误') : '服务器内部错误，请稍后重试'),
    details: isClientError ? (err.details || null) : null,
    timestamp: new Date().toISOString(),
    requestId,
  };

  // 开发环境下，5xx 错误也展示堆栈便于调试
  if (isDev && statusCode >= 500) {
    errorResponse.stack = err.stack || null;
  }

  // 4xx 错误在开发环境下也展示堆栈（通常是业务逻辑验证错误）
  if (isDev && isClientError) {
    errorResponse.stack = err.stack || null;
  }

  logger.error('request_error', {
    requestId,
    method: req.method,
    path: req.path,
    statusCode,
    message: err.message || 'Unknown error',
    ...(isDev && err.stack ? { stack: err.stack } : {}),
  });

  // 确保响应头已发送时不会重复响应
  if (res.headersSent) {
    return next(err);
  }

  res.status(statusCode).json(errorResponse);
}

/**
 * 自定义业务错误类
 * 用于在中间件中统一处理 4xx 类客户端错误
 */
class AppError extends Error {
  constructor(message, statusCode = 400, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = {
  errorHandler,
  AppError,
};
