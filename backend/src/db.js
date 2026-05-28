const fs = require('fs');
const path = require('path');

// 根据环境变量选择数据库
const DATABASE_URL = process.env.DATABASE_URL;
let db;
let isPostgres = false;

if (DATABASE_URL) {
  // 生产环境：PostgreSQL
  const { Pool } = require('pg');
  const pgSslMode = (process.env.PGSSLMODE || '').toLowerCase();
  const usePostgresSsl = !['disable', 'false', '0', 'no'].includes(pgSslMode);
  db = new Pool({
    connectionString: DATABASE_URL,
    ssl: usePostgresSsl ? { rejectUnauthorized: false } : false
  });
  isPostgres = true;
  console.log('Using PostgreSQL database');
} else {
  // 开发环境：SQLite
  const sqlite3 = require('sqlite3').verbose();
  const DB_PATH = process.env.SQLITE_PATH || path.join(__dirname, '../../data/dronedoctor.db');
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
      console.error('SQLite connection failed:', err);
    } else {
      console.log('Connected to SQLite database');
    }
  });
  console.log('Using SQLite database');
}

// SQL 适配层
function query(sql, params = []) {
  if (isPostgres) {
    // PostgreSQL: $1, $2 占位符
    const pgSql = sql.replace(/\?/g, (match, offset, string) => {
      let count = 1;
      for (let i = 0; i < offset; i++) {
        if (string[i] === '?') count++;
      }
      return '$' + count;
    });
    return db.query(pgSql, params).then(result => ({
      rows: result.rows,
      rowCount: result.rowCount
    }));
  } else {
    // SQLite
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
}

function run(sql, params = []) {
  if (isPostgres) {
    const pgSql = sql.replace(/\?/g, (match, offset, string) => {
      let count = 1;
      for (let i = 0; i < offset; i++) {
        if (string[i] === '?') count++;
      }
      return '$' + count;
    });
    return db.query(pgSql, params).then(result => ({
      lastID: result.rows[0]?.id || null,
      changes: result.rowCount
    }));
  } else {
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
}

// 获取当前时间函数
function now() {
  return isPostgres ? 'NOW()' : "datetime('now')";
}

async function initDatabase() {
  if (isPostgres) {
    // PostgreSQL 初始化
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT DEFAULT 'user',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        last_login_at TIMESTAMP,
        diagnosis_count INTEGER DEFAULT 0,
        favorite_count INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS history (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        result TEXT,
        is_favorite INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await db.query(`CREATE INDEX IF NOT EXISTS idx_history_user_id ON history(user_id)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_history_created_at ON history(created_at)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`);

    // 初始化向量表（Phase 1 新增）
    try {
      const { initVectorTables } = require('./services/vectorService');
      await initVectorTables();
    } catch (err) {
      console.warn('[Init] Vector tables init skipped:', err.message);
    }

    console.log('PostgreSQL database initialized successfully');
  } else {
    // SQLite 初始化
    return new Promise((resolve, reject) => {
      db.serialize(() => {
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

        db.run(`CREATE INDEX IF NOT EXISTS idx_history_user_id ON history(user_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_history_created_at ON history(created_at)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`);

        db.run('SELECT 1', (err) => {
          if (err) {
            reject(err);
          } else {
            console.log('SQLite database initialized successfully');
            resolve();
          }
        });
      });
    });
  }
}

module.exports = {
  db,
  query,
  run,
  initDatabase,
  isPostgres
};
