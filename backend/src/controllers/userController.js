const userService = require('../services/userService');

/**
 * 用户登录
 */
exports.login = async (req, res) => {
  try {
    const { usernameOrEmail, password } = req.body;

    if (!usernameOrEmail || !password) {
      return res.status(400).json({ error: '用户名/邮箱和密码不能为空' });
    }

    const result = await userService.login(usernameOrEmail, password);

    res.json({
      success: true,
      message: '登录成功',
      user: result.user,
      token: result.token
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(401).json({ error: error.message });
  }
};

/**
 * 获取当前用户信息
 */
exports.getCurrentUser = async (req, res) => {
  try {
    const user = await userService.getUser(req.userId);

    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    res.json({
      success: true,
      user
    });

  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({ error: '获取用户信息失败' });
  }
};

/**
 * 更新用户信息
 */
exports.updateUser = async (req, res) => {
  try {
    const updates = req.body;
    
    const user = await userService.updateUser(req.userId, updates);

    res.json({
      success: true,
      message: '更新成功',
      user
    });

  } catch (error) {
    console.error('Update user error:', error);
    res.status(400).json({ error: error.message });
  }
};

/**
 * 修改密码
 */
exports.changePassword = async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: '旧密码和新密码不能为空' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: '新密码长度至少6个字符' });
    }

    await userService.changePassword(req.userId, oldPassword, newPassword);

    res.json({
      success: true,
      message: '密码修改成功'
    });

  } catch (error) {
    console.error('Change password error:', error);
    res.status(400).json({ error: error.message });
  }
};

/**
 * 验证Token
 */
exports.verifyToken = async (req, res) => {
  try {
    const user = await userService.getUser(req.userId);

    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    res.json({
      success: true,
      valid: true,
      user
    });

  } catch (error) {
    console.error('Verify token error:', error);
    res.status(500).json({ error: '验证失败' });
  }
};
