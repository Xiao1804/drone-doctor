const { query, run, isPostgres } = require('../db');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config');

const MAX_FREE_DAILY = 3;

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

function hashIp(ip) {
  return crypto.createHash('sha256').update(ip || 'unknown').digest('hex').slice(0, 32);
}

function decodeAuthUser(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.slice(7);
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return null;
  }
}

function getIdentifier(req) {
  const decoded = decodeAuthUser(req);
  if (decoded && decoded.userId) {
    return { type: 'user', value: decoded.userId };
  }

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.ip
    || req.connection?.remoteAddress
    || 'unknown';
  return { type: 'ip', value: hashIp(ip) };
}

async function getTodayUsage(identifier) {
  const today = getToday();
  try {
    const result = await query(
      'SELECT count FROM free_usage WHERE identifier = ? AND identifier_type = ? AND usage_date = ?',
      [identifier.value, identifier.type, today]
    );
    if (result.rows.length === 0) {
      return 0;
    }
    return parseInt(result.rows[0].count, 10) || 0;
  } catch (error) {
    console.error('[FreeUsage] getTodayUsage error:', error.message);
    return 0;
  }
}

async function incrementUsage(identifier) {
  // 管理员不记录使用次数
  if (identifier.type === 'admin') {
    return;
  }

  const today = getToday();

  try {
    if (isPostgres) {
      await run(
        `INSERT INTO free_usage (identifier, identifier_type, usage_date, count, created_at, updated_at)
         VALUES ($1, $2, $3, 1, NOW(), NOW())
         ON CONFLICT (identifier, usage_date)
         DO UPDATE SET count = free_usage.count + 1, updated_at = NOW()`,
        [identifier.value, identifier.type, today]
      );
    } else {
      const existing = await query(
        'SELECT count FROM free_usage WHERE identifier = ? AND identifier_type = ? AND usage_date = ?',
        [identifier.value, identifier.type, today]
      );

      if (existing.rows.length === 0) {
        await run(
          `INSERT INTO free_usage (identifier, identifier_type, usage_date, count, created_at, updated_at)
           VALUES (?, ?, ?, 1, datetime('now'), datetime('now'))`,
          [identifier.value, identifier.type, today]
        );
      } else {
        await run(
          `UPDATE free_usage SET count = count + 1, updated_at = datetime('now')
           WHERE identifier = ? AND identifier_type = ? AND usage_date = ?`,
          [identifier.value, identifier.type, today]
        );
      }
    }
  } catch (error) {
    console.error('[FreeUsage] incrementUsage error:', error.message);
  }
}

async function checkLimit(req) {
  // 管理员豁免免费次数限制
  const decoded = decodeAuthUser(req);
  if (decoded && decoded.role === 'admin') {
    return {
      allowed: true,
      used: 0,
      remaining: Infinity,
      limit: MAX_FREE_DAILY,
      identifier: { type: 'admin', value: decoded.userId },
      isAdmin: true
    };
  }

  const identifier = getIdentifier(req);
  const used = await getTodayUsage(identifier);
  const remaining = Math.max(0, MAX_FREE_DAILY - used);

  return {
    allowed: used < MAX_FREE_DAILY,
    used,
    remaining,
    limit: MAX_FREE_DAILY,
    identifier
  };
}

module.exports = {
  getIdentifier,
  getTodayUsage,
  incrementUsage,
  checkLimit,
  MAX_FREE_DAILY,
  getToday
};
