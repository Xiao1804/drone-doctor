const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query, run } = require('../db');
const { JWT_SECRET } = require('../config');

const JWT_EXPIRES_IN = '7d';
const USERNAME_REGEX = /^[a-zA-Z0-9_\-\u4e00-\u9fa5]{3,20}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * 用户服务
 */
class UserService {
  /**
   * 登录
   */
  async login(usernameOrEmail, password) {
    const login = String(usernameOrEmail || '').trim();
    const result = await query(
      'SELECT * FROM users WHERE (username = ? OR email = ?) AND is_active = 1',
      [login, login.toLowerCase()]
    );

    if (result.rows.length === 0) {
      throw new Error('用户名或密码错误');
    }

    const user = this.formatUser(result.rows[0]);
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      throw new Error('用户名或密码错误');
    }
    if (user.role !== 'admin') {
      throw new Error('管理员账号或密码错误');
    }

    await run(
      'UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?',
      [user.id]
    );

    const token = this.generateToken(user);
    return { user: this.sanitizeUser(user), token };
  }

  /**
   * 验证Token
   */
  verifyToken(token) {
    try {
      return jwt.verify(token, JWT_SECRET);
    } catch (error) {
      return null;
    }
  }

  /**
   * 生成Token
   */
  generateToken(user) {
    return jwt.sign(
      {
        tokenType: 'admin',
        userId: user.id,
        username: user.username,
        role: user.role,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
  }

  /**
   * 获取用户信息
   */
  async getUser(userId) {
    const result = await query('SELECT * FROM users WHERE id = ?', [userId]);
    if (result.rows.length === 0) return null;
    return this.sanitizeUser(this.formatUser(result.rows[0]));
  }

  /**
   * 获取当前仍有效的用户。权限中间件以数据库实时状态为准，
   * 避免已停用、删除或降权用户继续使用旧 JWT。
   */
  async getActiveUser(userId) {
    const result = await query(
      'SELECT * FROM users WHERE id = ? AND is_active = 1',
      [userId]
    );
    if (result.rows.length === 0) return null;
    return this.sanitizeUser(this.formatUser(result.rows[0]));
  }

  /**
   * 更新用户信息
   */
  async updateUser(userId, updates) {
    const allowedFields = {
      username: 'username',
      email: 'email',
    };
    const fields = [];
    const values = [];

    for (const [key, rawValue] of Object.entries(updates || {})) {
      const dbField = allowedFields[key];
      if (!dbField) continue;

      let value = String(rawValue || '').trim();
      if (key === 'email') {
        value = value.toLowerCase();
        if (!EMAIL_REGEX.test(value)) {
          throw new Error('邮箱格式不正确');
        }
      }
      if (key === 'username' && !USERNAME_REGEX.test(value)) {
        throw new Error('用户名只能包含中文、字母、数字、下划线或短横线，长度为3-20个字符');
      }

      fields.push(`${dbField} = ?`);
      values.push(value);
    }

    if (fields.length === 0) {
      throw new Error('没有可更新的字段');
    }

    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(userId);

    await run(
      `UPDATE users SET ${fields.join(', ')} WHERE id = ?`,
      values
    );

    const result = await query('SELECT * FROM users WHERE id = ?', [userId]);
    if (result.rows.length === 0) {
      throw new Error('用户不存在');
    }

    return this.sanitizeUser(this.formatUser(result.rows[0]));
  }

  /**
   * 修改密码
   */
  async changePassword(userId, oldPassword, newPassword) {
    const result = await query('SELECT * FROM users WHERE id = ?', [userId]);
    if (result.rows.length === 0) {
      throw new Error('用户不存在');
    }

    const user = this.formatUser(result.rows[0]);
    const isValid = await bcrypt.compare(oldPassword, user.password);
    if (!isValid) {
      throw new Error('旧密码错误');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await run(
      'UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [hashedPassword, userId]
    );

    return true;
  }

  /**
   * 清理用户数据（移除敏感信息）
   */
  sanitizeUser(user) {
    const { password, ...sanitized } = user;
    return sanitized;
  }

  /**
   * 格式化用户数据
   */
  formatUser(row) {
    return {
      id: row.id,
      username: row.username,
      email: row.email,
      password: row.password,
      role: row.role,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastLoginAt: row.last_login_at,
      diagnosisCount: row.diagnosis_count,
      favoriteCount: row.favorite_count,
      isActive: row.is_active === 1 || row.is_active === true
    };
  }
}

module.exports = new UserService();
