process.env.JWT_SECRET = 'test-secret-at-least-32-characters-long';

jest.mock('../src/db', () => ({
  query: jest.fn(),
  run: jest.fn(),
}));

jest.mock('bcryptjs', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

const db = require('../src/db');
const bcrypt = require('bcryptjs');
const userService = require('../src/services/userService');

function userRow(role) {
  return {
    id: `${role}-1`,
    username: role,
    email: `${role}@example.com`,
    password: 'stored-password-hash',
    role,
    is_active: 1,
    diagnosis_count: 0,
    favorite_count: 0,
  };
}

describe('retired public accounts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    bcrypt.compare.mockResolvedValue(true);
    db.run.mockResolvedValue({ changes: 1 });
  });

  test('a historical ordinary user can no longer log in', async () => {
    db.query.mockResolvedValue({ rows: [userRow('user')] });

    await expect(userService.login('user', 'correct-password'))
      .rejects.toThrow('管理员账号或密码错误');
    expect(db.run).not.toHaveBeenCalled();
  });

  test('an active administrator can still log in', async () => {
    db.query.mockResolvedValue({ rows: [userRow('admin')] });

    const result = await userService.login('admin', 'correct-password');

    expect(result.user.role).toBe('admin');
    expect(typeof result.token).toBe('string');
    expect(db.run).toHaveBeenCalledWith(
      expect.stringContaining('last_login_at'),
      ['admin-1']
    );
  });
});
