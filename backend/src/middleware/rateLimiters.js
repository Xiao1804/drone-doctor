const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

function normalizeLoginIdentifier(req) {
  const rawIdentifier = req.body?.usernameOrEmail
    || req.body?.email
    || req.body?.username
    || '';

  return String(rawIdentifier).trim().toLowerCase().slice(0, 254) || 'unknown-account';
}

function normalizedIpKey(req) {
  return ipKeyGenerator(req.ip || 'unknown', 64);
}

function createLimiter({ windowMs, max, message, keyGenerator }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message,
    ...(keyGenerator ? { keyGenerator } : { ipv6Subnet: 64 }),
  });
}

function createGlobalApiLimiter() {
  return createLimiter({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { error: '请求过于频繁，请稍后再试' },
  });
}

function createAuthIpLimiter() {
  return createLimiter({
    windowMs: 60 * 1000,
    max: 5,
    message: { error: '登录或注册请求过于频繁，请稍后再试' },
    keyGenerator: normalizedIpKey,
  });
}

function createAuthAccountLimiter() {
  return createLimiter({
    windowMs: 60 * 1000,
    max: 5,
    message: { error: '该账号登录或注册尝试过于频繁，请稍后再试' },
    keyGenerator: normalizeLoginIdentifier,
  });
}

function createAuthLimiters() {
  return [createAuthIpLimiter(), createAuthAccountLimiter()];
}

function createEventLimiter() {
  return createLimiter({
    windowMs: 60 * 1000,
    max: 30,
    message: { error: '事件上报过于频繁，请稍后再试' },
  });
}

module.exports = {
  createGlobalApiLimiter,
  createAuthLimiters,
  createEventLimiter,
  normalizedIpKey,
};
