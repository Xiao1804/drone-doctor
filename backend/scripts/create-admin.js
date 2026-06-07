#!/usr/bin/env node

require('dotenv').config();

const bcrypt = require('bcryptjs');
const { initDatabase, query, run, db, isPostgres } = require('../src/db');

function getArg(name) {
  const prefix = `--${name}=`;
  const match = process.argv.find(arg => arg.startsWith(prefix));
  return match ? match.slice(prefix.length).trim() : '';
}

async function closeDatabase() {
  try {
    if (isPostgres && db?.end) {
      await db.end();
    } else if (db?.close) {
      await new Promise(resolve => db.close(resolve));
    }
  } catch (_) {
    // ignore close errors in CLI script
  }
}

async function main() {
  const username = getArg('username') || process.env.ADMIN_USERNAME;
  const email = (getArg('email') || process.env.ADMIN_EMAIL || '').toLowerCase();
  const password = getArg('password') || process.env.ADMIN_PASSWORD;

  if (!username || !email || !password) {
    console.error('Usage: node scripts/create-admin.js --username=admin --email=admin@example.com --password=strong-password');
    console.error('Or set ADMIN_USERNAME, ADMIN_EMAIL and ADMIN_PASSWORD environment variables.');
    process.exitCode = 1;
    return;
  }

  if (password.length < 12) {
    console.error('Admin password must be at least 12 characters.');
    process.exitCode = 1;
    return;
  }

  await initDatabase();

  const existing = await query('SELECT id, role FROM users WHERE username = ? OR email = ?', [username, email]);
  if (existing.rows.length > 0) {
    const user = existing.rows[0];
    await run('UPDATE users SET role = ?, is_active = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?', ['admin', user.id]);
    console.log(`Existing user promoted to admin: ${user.id}`);
    return;
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const userId = `admin_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

  await run(
    `INSERT INTO users (id, username, email, password, role, created_at, updated_at, diagnosis_count, favorite_count, is_active)
     VALUES (?, ?, ?, ?, 'admin', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, 0, 1)`,
    [userId, username, email, hashedPassword]
  );

  console.log(`Admin user created: ${userId}`);
}

main()
  .catch(error => {
    console.error('Failed to create admin:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
