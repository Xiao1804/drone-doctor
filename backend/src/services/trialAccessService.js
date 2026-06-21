const jwt = require('jsonwebtoken');
const { get } = require('../db');
const { JWT_SECRET } = require('../config');

const TRIAL_TOKEN_TYPE = 'trial_access';
const TOKEN_ISSUER = 'drone-doctor';
const TOKEN_AUDIENCE = 'trial-access';

function parseDatabaseTimestamp(value) {
  if (value instanceof Date) return value;
  const text = String(value || '');
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text)
    ? `${text.replace(' ', 'T')}Z`
    : text;
  return new Date(normalized);
}

function issueTrialAccessToken({ couponId, accessId, expiresAt }) {
  const expiresAtMs = new Date(expiresAt).getTime();
  const expiresInSeconds = Math.max(1, Math.floor((expiresAtMs - Date.now()) / 1000));

  return jwt.sign(
    {
      tokenType: TRIAL_TOKEN_TYPE,
      couponId,
      accessId,
    },
    JWT_SECRET,
    {
      expiresIn: expiresInSeconds,
      issuer: TOKEN_ISSUER,
      audience: TOKEN_AUDIENCE,
    }
  );
}

async function validateTrialAccessToken(token) {
  if (!token) {
    return { valid: false, reason: 'missing' };
  }

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET, {
      issuer: TOKEN_ISSUER,
      audience: TOKEN_AUDIENCE,
    });
  } catch (error) {
    return {
      valid: false,
      reason: error.name === 'TokenExpiredError' ? 'expired' : 'invalid',
    };
  }

  if (
    decoded?.tokenType !== TRIAL_TOKEN_TYPE
    || !decoded?.couponId
    || !decoded?.accessId
  ) {
    return { valid: false, reason: 'wrong_token_type' };
  }

  const coupon = await get(
    `SELECT id, status, access_id, expires_at, duration_label
     FROM coupons
     WHERE id = ? AND access_id = ?`,
    [decoded.couponId, decoded.accessId]
  );

  if (!coupon || coupon.status !== 'used') {
    return { valid: false, reason: 'revoked' };
  }

  const expiresAt = coupon.expires_at ? parseDatabaseTimestamp(coupon.expires_at) : null;
  if (!expiresAt || Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date()) {
    return { valid: false, reason: 'expired' };
  }

  return {
    valid: true,
    couponId: coupon.id,
    accessId: coupon.access_id,
    expiresAt: expiresAt.toISOString(),
    durationLabel: coupon.duration_label,
    daysLeft: Math.max(1, Math.ceil((expiresAt - new Date()) / (24 * 60 * 60 * 1000))),
    identifier: { type: 'trial', value: coupon.access_id },
  };
}

module.exports = {
  TRIAL_TOKEN_TYPE,
  issueTrialAccessToken,
  validateTrialAccessToken,
};
