const { query, run, get, isPostgres } = require('../db');

// 去掉易混淆字符 O/0/I/1
const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;

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
async function generateCoupons(durationDays, durationLabel, count, adminId, note) {
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
        [formattedCode, durationDays, durationLabel, adminId, batchId, note || null]
      );
    } else {
      await run(
        `INSERT INTO coupons (code, duration_days, duration_label, status, created_by, batch_id, note, created_at)
         VALUES (?, ?, ?, 'unused', ?, ?, ?, datetime('now'))`,
        [formattedCode, durationDays, durationLabel, adminId, batchId, note || null]
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
async function activateCoupon(code, userId) {
  const result = await validateCoupon(code);
  if (!result.valid) {
    throw new Error(result.message);
  }

  const coupon = result.coupon;

  // 查询用户当前会员状态
  const user = await get('SELECT membership_expires_at FROM users WHERE id = ?', [userId]);
  if (!user) {
    throw new Error('用户不存在');
  }

  // 计算新的到期时间
  const now = new Date();
  let baseTime = now;

  // 如果用户已有会员且未过期，在现有到期时间基础上追加
  if (user.membership_expires_at) {
    const currentExpiry = new Date(user.membership_expires_at);
    if (currentExpiry > now) {
      baseTime = currentExpiry;
    }
  }

  const newExpiry = new Date(baseTime);
  newExpiry.setDate(newExpiry.getDate() + coupon.duration_days);
  const newExpiryStr = newExpiry.toISOString();

  // 更新用户会员到期时间
  await run(
    'UPDATE users SET membership_expires_at = ? WHERE id = ?',
    [newExpiryStr, userId]
  );

  // 更新券码状态
  if (isPostgres) {
    await run(
      `UPDATE coupons SET status = 'used', activated_by = $1, activated_at = NOW() WHERE id = $2`,
      [userId, coupon.id]
    );
  } else {
    await run(
      `UPDATE coupons SET status = 'used', activated_by = ?, activated_at = datetime('now') WHERE id = ?`,
      [userId, coupon.id]
    );
  }

  return {
    expiresAt: newExpiryStr,
    durationLabel: coupon.duration_label,
    durationDays: coupon.duration_days,
  };
}

/**
 * 查询用户会员状态
 */
async function getUserMembership(userId) {
  const user = await get(
    'SELECT id, role, membership_expires_at FROM users WHERE id = ? AND is_active = 1',
    [userId]
  );

  if (!user) {
    return { isMember: false, expiresAt: null, daysLeft: 0, isAdmin: false };
  }

  if (user.role === 'admin') {
    return { isMember: true, expiresAt: null, daysLeft: Infinity, isAdmin: true };
  }

  if (!user.membership_expires_at) {
    return { isMember: false, expiresAt: null, daysLeft: 0, isAdmin: false };
  }

  const expiry = new Date(user.membership_expires_at);
  const now = new Date();

  if (expiry <= now) {
    return { isMember: false, expiresAt: user.membership_expires_at, daysLeft: 0, isAdmin: false };
  }

  const daysLeft = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));

  return {
    isMember: true,
    expiresAt: user.membership_expires_at,
    daysLeft,
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
     u.username as activated_by_username
     FROM coupons c
     LEFT JOIN users u ON c.activated_by = u.id
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

/**
 * 禁用未使用的券码
 */
async function disableCoupon(couponId) {
  const coupon = await get('SELECT * FROM coupons WHERE id = ?', [couponId]);
  if (!coupon) {
    throw new Error('券码不存在');
  }
  if (coupon.status !== 'unused') {
    throw new Error('只能禁用未使用的券码');
  }

  await run(
    `UPDATE coupons SET status = 'disabled' WHERE id = ?`,
    [couponId]
  );

  return { success: true };
}

module.exports = {
  generateCoupons,
  validateCoupon,
  activateCoupon,
  getUserMembership,
  listCoupons,
  disableCoupon,
};
