const fs = require('fs').promises;
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const USERS_FILE = path.join(__dirname, '../../../data/users.json');
const JWT_SECRET = process.env.JWT_SECRET || 'drone-doctor-secret-key-2024';
const JWT_EXPIRES_IN = '7d';

/**
 * 用户服务
 */
class UserService {
  constructor() {
    this.users = [];
    this.loadUsers();
  }

  /**
   * 加载用户数据
   */
  async loadUsers() {
    try {
      const data = await fs.readFile(USERS_FILE, 'utf-8');
      this.users = JSON.parse(data);
      console.log(`Loaded ${this.users.length} users`);
    } catch (error) {
      console.log('No users file found, creating new one');
      this.users = [];
      await this.saveUsers();
    }
  }

  /**
   * 保存用户数据
   */
  async saveUsers() {
    try {
      await fs.writeFile(USERS_FILE, JSON.stringify(this.users, null, 2), 'utf-8');
    } catch (error) {
      console.error('Save users error:', error);
      throw error;
    }
  }

  /**
   * 注册用户
   */
  async register(username, email, password) {
    // 检查用户名是否已存在
    if (this.users.find(u => u.username === username)) {
      throw new Error('用户名已存在');
    }

    // 检查邮箱是否已存在
    if (this.users.find(u => u.email === email)) {
      throw new Error('邮箱已被注册');
    }

    // 加密密码
    const hashedPassword = await bcrypt.hash(password, 10);

    // 创建用户
    const user = {
      id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      username,
      email,
      password: hashedPassword,
      role: this.users.length === 0 ? 'admin' : 'user', // 第一个用户为管理员
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastLoginAt: null,
      diagnosisCount: 0,
      favoriteCount: 0,
      isActive: true
    };

    this.users.push(user);
    await this.saveUsers();

    // 生成token
    const token = this.generateToken(user);

    return {
      user: this.sanitizeUser(user),
      token
    };
  }

  /**
   * 登录
   */
  async login(usernameOrEmail, password) {
    // 查找用户
    const user = this.users.find(
      u => u.username === usernameOrEmail || u.email === usernameOrEmail
    );

    if (!user) {
      throw new Error('用户名或密码错误');
    }

    if (!user.isActive) {
      throw new Error('账号已被禁用');
    }

    // 验证密码
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      throw new Error('用户名或密码错误');
    }

    // 更新最后登录时间
    user.lastLoginAt = new Date().toISOString();
    await this.saveUsers();

    // 生成token
    const token = this.generateToken(user);

    return {
      user: this.sanitizeUser(user),
      token
    };
  }

  /**
   * 验证Token
   */
  verifyToken(token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const user = this.users.find(u => u.id === decoded.userId);
      
      if (!user || !user.isActive) {
        return null;
      }

      return this.sanitizeUser(user);
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
        userId: user.id,
        username: user.username,
        role: user.role
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
  }

  /**
   * 获取用户信息
   */
  getUser(userId) {
    const user = this.users.find(u => u.id === userId);
    return user ? this.sanitizeUser(user) : null;
  }

  /**
   * 更新用户信息
   */
  async updateUser(userId, updates) {
    const index = this.users.findIndex(u => u.id === userId);
    
    if (index === -1) {
      throw new Error('用户不存在');
    }

    // 不允许更新的字段
    const protectedFields = ['id', 'password', 'role', 'createdAt'];
    protectedFields.forEach(field => {
      delete updates[field];
    });

    this.users[index] = {
      ...this.users[index],
      ...updates,
      updatedAt: new Date().toISOString()
    };

    await this.saveUsers();

    return this.sanitizeUser(this.users[index]);
  }

  /**
   * 修改密码
   */
  async changePassword(userId, oldPassword, newPassword) {
    const user = this.users.find(u => u.id === userId);
    
    if (!user) {
      throw new Error('用户不存在');
    }

    // 验证旧密码
    const isValid = await bcrypt.compare(oldPassword, user.password);
    if (!isValid) {
      throw new Error('旧密码错误');
    }

    // 加密新密码
    user.password = await bcrypt.hash(newPassword, 10);
    user.updatedAt = new Date().toISOString();

    await this.saveUsers();

    return true;
  }

  /**
   * 删除用户
   */
  async deleteUser(userId) {
    const index = this.users.findIndex(u => u.id === userId);
    
    if (index === -1) {
      throw new Error('用户不存在');
    }

    this.users.splice(index, 1);
    await this.saveUsers();

    return true;
  }

  /**
   * 增加诊断次数
   */
  async incrementDiagnosisCount(userId) {
    const user = this.users.find(u => u.id === userId);
    if (user) {
      user.diagnosisCount++;
      await this.saveUsers();
    }
  }

  /**
   * 增加收藏次数
   */
  async incrementFavoriteCount(userId) {
    const user = this.users.find(u => u.id === userId);
    if (user) {
      user.favoriteCount++;
      await this.saveUsers();
    }
  }

  /**
   * 减少收藏次数
   */
  async decrementFavoriteCount(userId) {
    const user = this.users.find(u => u.id === userId);
    if (user && user.favoriteCount > 0) {
      user.favoriteCount--;
      await this.saveUsers();
    }
  }

  /**
   * 获取所有用户（管理员）
   */
  getAllUsers() {
    return this.users.map(u => this.sanitizeUser(u));
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      total: this.users.length,
      active: this.users.filter(u => u.isActive).length,
      admins: this.users.filter(u => u.role === 'admin').length,
      totalDiagnoses: this.users.reduce((sum, u) => sum + u.diagnosisCount, 0)
    };
  }

  /**
   * 清理用户数据（移除敏感信息）
   */
  sanitizeUser(user) {
    const { password, ...sanitized } = user;
    return sanitized;
  }
}

// 单例模式
const userService = new UserService();

module.exports = userService;
