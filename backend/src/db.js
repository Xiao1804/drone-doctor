const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = process.env.SQLITE_PATH || path.join(__dirname, '../../data/dronedoctor.db');

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('Database connection failed:', err);
  } else {
    console.log('Connected to SQLite database');
  }
});

function query(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        console.error('Query error:', err, 'SQL:', sql);
        reject(err);
      } else {
        resolve({ rows, rowCount: rows ? rows.length : 0 });
      }
    });
  });
}

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) {
        console.error('Run error:', err, 'SQL:', sql);
        reject(err);
      } else {
        resolve({ lastID: this.lastID, changes: this.changes });
      }
    });
  });
}

async function initDatabase() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // 创建 users 表
      db.run(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          username TEXT UNIQUE NOT NULL,
          email TEXT UNIQUE NOT NULL,
          password TEXT NOT NULL,
          role TEXT DEFAULT 'user',
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now')),
          last_login_at TEXT,
          diagnosis_count INTEGER DEFAULT 0,
          favorite_count INTEGER DEFAULT 0,
          is_active INTEGER DEFAULT 1
        )
      `);

      // 创建 history 表
      db.run(`
        CREATE TABLE IF NOT EXISTS history (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          type TEXT NOT NULL,
          content TEXT NOT NULL,
          result TEXT,
          is_favorite INTEGER DEFAULT 0,
          created_at TEXT DEFAULT (datetime('now')),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `);

      // 创建索引
      db.run(`CREATE INDEX IF NOT EXISTS idx_history_user_id ON history(user_id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_history_created_at ON history(created_at)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`);

      db.run('SELECT 1', (err) => {
        if (err) {
          reject(err);
        } else {
          console.log('Database initialized successfully');
          resolve();
        }
      });
    });
  });
}

module.exports = {
  db,
  query,
  run,
  initDatabase
};
