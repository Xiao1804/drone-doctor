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
   * 注册用户
   */
  async register(username, email, password) {
    username = String(username || '').trim();
    email = String(email || '').trim().toLowerCase();

    if (!USERNAME_REGEX.test(username)) {
      throw new Error('用户名只能包含中文、字母、数字、下划线或短横线，长度为3-20个字符');
    }
    if (!EMAIL_REGEX.test(email)) {
      throw new Error('邮箱格式不正确');
    }

    const existingUser = await query('SELECT id FROM users WHERE username = ?', [username]);
    if (existingUser.rows.length > 0) {
      throw new Error('用户名已存在');
    }

    const existingEmail = await query('SELECT id FROM users WHERE email = ?', [email]);
    if (existingEmail.rows.length > 0) {
      throw new Error('邮箱已被注册');
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // 安全策略：公开注册永远创建普通用户。管理员应通过受控脚本或数据库后台创建。
    const role = 'user';

    await run(
      `INSERT INTO users (id, username, email, password, role, created_at, updated_at, diagnosis_count, favorite_count, is_active)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, 0, 1)`,
      [userId, username, email, hashedPassword, role]
    );

    const result = await query('SELECT * FROM users WHERE id = ?', [userId]);
    const user = this.formatUser(result.rows[0]);
    const token = this.generateToken(user);

    return { user: this.sanitizeUser(user), token };
  }

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
   * 通过Token获取用户
   */
  async getUserByToken(token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const result = await query(
        'SELECT * FROM users WHERE id = ? AND is_active = 1',
        [decoded.userId]
      );
      if (result.rows.length === 0) return null;
      return this.sanitizeUser(this.formatUser(result.rows[0]));
    } catch (error) {
      return null;
    }
  }

  /**
   * 生成Token
   */
  generateToken(user) {
    return jwt.sign(
      { userId: user.id, username: user.username, role: user.role },
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
   * 删除用户
   */
  async deleteUser(userId) {
    const result = await run('DELETE FROM users WHERE id = ?', [userId]);
    if (result.changes === 0) {
      throw new Error('用户不存在');
    }
    return true;
  }

  /**
   * 增加诊断次数
   */
  async incrementDiagnosisCount(userId) {
    await run(
      'UPDATE users SET diagnosis_count = diagnosis_count + 1 WHERE id = ?',
      [userId]
    );
  }

  /**
   * 增加收藏次数
   */
  async incrementFavoriteCount(userId) {
    await run(
      'UPDATE users SET favorite_count = favorite_count + 1 WHERE id = ?',
      [userId]
    );
  }

  /**
   * 减少收藏次数
   */
  async decrementFavoriteCount(userId) {
    await run(
      'UPDATE users SET favorite_count = CASE WHEN favorite_count > 0 THEN favorite_count - 1 ELSE 0 END WHERE id = ?',
      [userId]
    );
  }

  /**
   * 获取所有用户（管理员）
   */
  async getAllUsers() {
    const result = await query('SELECT * FROM users ORDER BY created_at DESC');
    return result.rows.map(user => this.sanitizeUser(this.formatUser(user)));
  }

  /**
   * 获取统计信息
   */
  async getStats() {
    const totalResult = await query('SELECT COUNT(*) as count FROM users');
    const activeResult = await query('SELECT COUNT(*) as count FROM users WHERE is_active = 1');
    const adminResult = await query('SELECT COUNT(*) as count FROM users WHERE role = ?', ['admin']);
    const diagnosisResult = await query('SELECT COALESCE(SUM(diagnosis_count), 0) as count FROM users');

    return {
      total: parseInt(totalResult.rows[0].count),
      active: parseInt(activeResult.rows[0].count),
      admins: parseInt(adminResult.rows[0].count),
      totalDiagnoses: parseInt(diagnosisResult.rows[0].count)
    };
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
