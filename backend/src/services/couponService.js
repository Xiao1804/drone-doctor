const crypto = require('crypto');
const { query, run, get, isPostgres } = require('../db');
const {
  issueTrialAccessToken,
  validateTrialAccessToken,
} = require('./trialAccessService');

// 去掉易混淆字符 O/0/I/1
const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;
const TRIAL_DURATION_DAYS = 3;
const TRIAL_DURATION_LABEL = '3天体验';

function parseDatabaseTimestamp(value) {
  if (value instanceof Date) return value;
  const text = String(value || '');
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text)
    ? `${text.replace(' ', 'T')}Z`
    : text;
  return new Date(normalized);
}

/**
 * 生成随机券码（8位，格式 XXXX-XXXX）
 */
function generateCode() {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CHARSET[Math.floor(Math.random() * CHARSET.length)];
  }
  return code.slice(0, 4) + '-' + code.slice(4);
}

/**
 * 批量生成券码
 */
async function generateCoupons(count, adminId, note) {
  const codes = [];
  const batchId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

  for (let i = 0; i < count; i++) {
    let code;
    let attempts = 0;
    // 碰撞检查
    do {
      code = generateCode();
      const existing = await get('SELECT id FROM coupons WHERE code = ?', [code]);
      if (!existing) break;
      attempts++;
    } while (attempts < 10);

    const cleanCode = code.replace('-', '');
    const formattedCode = code; // XXXX-XXXX 格式

    if (isPostgres) {
      await run(
        `INSERT INTO coupons (code, duration_days, duration_label, status, created_by, batch_id, note, created_at)
         VALUES ($1, $2, $3, 'unused', $4, $5, $6, NOW())`,
        [formattedCode, TRIAL_DURATION_DAYS, TRIAL_DURATION_LABEL, adminId, batchId, note || null]
      );
    } else {
      await run(
        `INSERT INTO coupons (code, duration_days, duration_label, status, created_by, batch_id, note, created_at)
         VALUES (?, ?, ?, 'unused', ?, ?, ?, datetime('now'))`,
        [formattedCode, TRIAL_DURATION_DAYS, TRIAL_DURATION_LABEL, adminId, batchId, note || null]
      );
    }

    codes.push(formattedCode);
  }

  return { codes, batchId };
}

/**
 * 验证券码是否有效
 */
async function validateCoupon(code) {
  // 统一标准化：去空格、转大写、去掉所有 -
  const normalizedCode = code.trim().toUpperCase().replace(/[\s-]/g, '');

  const coupon = await get(
    'SELECT * FROM coupons WHERE REPLACE(code, \'-\', \'\') = ?',
    [normalizedCode]
  );

  if (!coupon) {
    return { valid: false, message: '券码不存在' };
  }

  if (coupon.status === 'used') {
    return { valid: false, message: '券码已被使用' };
  }

  if (coupon.status === 'disabled') {
    return { valid: false, message: '券码已被禁用' };
  }

  return { valid: true, coupon };
}

/**
 * 激活券码
 */
async function activateCoupon(code) {
  const normalizedCode = String(code || '').trim().toUpperCase().replace(/[\s-]/g, '');
  if (normalizedCode.length !== CODE_LENGTH) {
    throw new Error('券码格式不正确');
  }

  const accessId = crypto.randomUUID();
  let coupon;

  if (isPostgres) {
    const result = await query(
      `UPDATE coupons
       SET status = 'used',
           activated_by = ?,
           activated_at = NOW(),
           access_id = ?,
           expires_at = NOW() + duration_days * INTERVAL '1 day',
           issued_at = COALESCE(issued_at, NOW())
       WHERE id = (
         SELECT id
         FROM coupons
         WHERE REPLACE(code, '-', '') = ? AND status = 'unused'
         LIMIT 1
       )
       AND status = 'unused'
       RETURNING id, duration_days, duration_label, access_id, expires_at`,
      [`trial:${accessId}`, accessId, normalizedCode]
    );
    coupon = result.rows[0] || null;
  } else {
    const existing = await get(
      `SELECT id FROM coupons
       WHERE REPLACE(code, '-', '') = ? AND status = 'unused'`,
      [normalizedCode]
    );

    if (existing) {
      const update = await run(
        `UPDATE coupons
         SET status = 'used',
             activated_by = ?,
             activated_at = datetime('now'),
             access_id = ?,
             expires_at = datetime('now', '+' || duration_days || ' days'),
             issued_at = COALESCE(issued_at, datetime('now'))
         WHERE id = ? AND status = 'unused'`,
        [`trial:${accessId}`, accessId, existing.id]
      );

      if (update.changes > 0) {
        coupon = await get(
          `SELECT id, duration_days, duration_label, access_id, expires_at
           FROM coupons WHERE id = ? AND access_id = ?`,
          [existing.id, accessId]
        );
      }
    }
  }

  if (!coupon) {
    const validation = await validateCoupon(code);
    throw new Error(validation.valid ? '券码兑换失败，请重试' : validation.message);
  }

  const expiresAt = parseDatabaseTimestamp(coupon.expires_at).toISOString();
  const accessToken = issueTrialAccessToken({
    couponId: coupon.id,
    accessId: coupon.access_id,
    expiresAt,
  });

  return {
    accessToken,
    expiresAt,
    durationLabel: coupon.duration_label,
    durationDays: coupon.duration_days,
  };
}

/**
 * 查询匿名体验通行证状态
 */
async function getAccessStatus(token) {
  const access = await validateTrialAccessToken(token);
  if (!access.valid) {
    return {
      allowed: false,
      isTrial: false,
      expiresAt: null,
      daysLeft: 0,
      isAdmin: false,
      reason: access.reason,
    };
  }

  return {
    allowed: true,
    isTrial: true,
    expiresAt: access.expiresAt,
    daysLeft: access.daysLeft,
    durationLabel: access.durationLabel,
    isAdmin: false,
  };
}

/**
 * 管理员查询券码列表
 */
async function listCoupons(filters = {}) {
  const { status, durationDays, batchId, page = 1, limit = 20 } = filters;
  const offset = (page - 1) * limit;

  let whereClause = 'WHERE 1=1';
  const params = [];

  if (status) {
    whereClause += ` AND status = ?`;
    params.push(status);
  }

  if (durationDays) {
    whereClause += ` AND duration_days = ?`;
    params.push(parseInt(durationDays, 10));
  }

  if (batchId) {
    whereClause += ` AND batch_id = ?`;
    params.push(batchId);
  }

  // 查询总数
  const countResult = await query(
    `SELECT COUNT(*) as total FROM coupons ${whereClause}`,
    params
  );
  const total = parseInt(countResult.rows[0]?.total || '0', 10);

  // 查询分页数据
  const listResult = await query(
    `SELECT c.*,
     CASE
       WHEN c.access_id IS NOT NULL THEN '免注册体验用户'
       ELSE NULL
     END AS activated_by_username
     FROM coupons c
     ${whereClause}
     ORDER BY c.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return {
    list: listResult.rows,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

async function getMarketMetrics() {
  const couponResult = await query(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'used' THEN 1 ELSE 0 END) AS activated,
      SUM(CASE WHEN issued_at IS NOT NULL THEN 1 ELSE 0 END) AS issued,
      SUM(CASE WHEN status = 'unused' THEN 1 ELSE 0 END) AS unused,
      SUM(CASE WHEN status = 'disabled' THEN 1 ELSE 0 END) AS disabled
    FROM coupons
  `);
  const couponCounts = couponResult.rows[0] || {};

  const diagnosisResult = await query(`
    SELECT
      SUM(CASE WHEN event = 'trial_diagnosis_start' THEN 1 ELSE 0 END) AS starts,
      SUM(CASE WHEN event = 'trial_diagnosis_complete' THEN 1 ELSE 0 END) AS completions,
      COUNT(DISTINCT CASE
        WHEN event IN ('trial_diagnosis_start', 'trial_diagnosis_complete')
        THEN COALESCE(NULLIF(user_id, ''), NULLIF(ip, ''))
        ELSE NULL
      END) AS unique_users
    FROM events
  `);
  const diagnosisCounts = diagnosisResult.rows[0] || {};

  let feedbackResult = { rows: [] };
  try {
    feedbackResult = await query(`
      SELECT rating, COUNT(*) AS count
      FROM feedback
      GROUP BY rating
    `);
  } catch (error) {
    if (isPostgres) throw error;
  }
  const feedbackByRating = Object.fromEntries(
    feedbackResult.rows.map(row => [row.rating, Number(row.count || 0)])
  );

  const totalCoupons = Number(couponCounts.total || 0);
  const activatedCoupons = Number(couponCounts.activated || 0);
  const issuedCoupons = Number(couponCounts.issued || 0);
  const starts = Number(diagnosisCounts.starts || 0);
  const completions = Number(diagnosisCounts.completions || 0);

  return {
    coupons: {
      total: totalCoupons,
      issued: issuedCoupons,
      activated: activatedCoupons,
      unused: Number(couponCounts.unused || 0),
      disabled: Number(couponCounts.disabled || 0),
      activationRate: issuedCoupons > 0 ? activatedCoupons / issuedCoupons : 0,
    },
    diagnosis: {
      starts,
      completions,
      completionRate: starts > 0 ? completions / starts : 0,
      uniqueUsers: Number(diagnosisCounts.unique_users || 0),
    },
    feedback: {
      total: Object.values(feedbackByRating).reduce((sum, count) => sum + count, 0),
      helpful: feedbackByRating.helpful || 0,
      notHelpful: feedbackByRating.not_helpful || 0,
      unclear: feedbackByRating.unclear || 0,
      unclassified: feedbackByRating.none || 0,
    },
  };
}

/**
 * 禁用未兑换券码或撤销已兑换通行证。
 */
async function disableCoupon(couponId) {
  const coupon = await get('SELECT * FROM coupons WHERE id = ?', [couponId]);
  if (!coupon) {
    throw new Error('券码不存在');
  }
  if (!['unused', 'used'].includes(coupon.status)) {
    throw new Error('券码已经禁用');
  }

  await run(
    `UPDATE coupons SET status = 'disabled' WHERE id = ?`,
    [couponId]
  );

  return { success: true };
}

async function markCouponIssued(couponId) {
  const issuedAtExpression = isPostgres ? 'NOW()' : "datetime('now')";
  const result = await run(
    `UPDATE coupons
     SET issued_at = COALESCE(issued_at, ${issuedAtExpression})
     WHERE id = ? AND status = 'unused'`,
    [couponId]
  );

  if (result.changes === 0) {
    throw new Error('只能发放尚未兑换的券码');
  }

  return { success: true };
}

module.exports = {
  generateCoupons,
  validateCoupon,
  activateCoupon,
  getAccessStatus,
  validateTrialAccessToken,
  listCoupons,
  disableCoupon,
  markCouponIssued,
  getMarketMetrics,
};
