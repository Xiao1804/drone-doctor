jest.mock('dotenv', () => ({
  config: jest.fn(),
}));

jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('new-password-hash'),
}));

jest.mock('../src/db', () => ({
  initDatabase: jest.fn().mockResolvedValue(),
  query: jest.fn(),
  run: jest.fn().mockResolvedValue({ changes: 1 }),
  db: null,
  isPostgres: false,
}));

const bcrypt = require('bcryptjs');
const { query, run } = require('../src/db');
const { main } = require('../scripts/create-admin');

describe('create-admin script', () => {
  const originalArgv = process.argv;
  const originalExitCode = process.exitCode;

  afterEach(() => {
    process.argv = originalArgv;
    process.exitCode = originalExitCode;
    jest.clearAllMocks();
  });

  test('rotates the password when the administrator already exists', async () => {
    process.argv = [
      'node',
      'create-admin.js',
      '--username=admin',
      '--email=admin@example.com',
      '--password=a-new-strong-password',
    ];
    query.mockResolvedValueOnce({
      rows: [{ id: 'admin-1', role: 'admin' }],
    });

    await main();

    expect(bcrypt.hash).toHaveBeenCalledWith('a-new-strong-password', 10);
    expect(run).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE users SET password = ?'),
      ['new-password-hash', 'admin', 'admin-1']
    );
  });
});
