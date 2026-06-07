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

// 获取单行记录（PostgreSQL 用 query.get / SQLite 用 db.get）
function get(sql, params = []) {
  if (isPostgres) {
    const pgSql = sql.replace(/\?/g, (match, offset, string) => {
      let count = 1;
      for (let i = 0; i < offset; i++) {
        if (string[i] === '?') count++;
      }
      return '$' + count;
    });
    return db.query(pgSql, params).then(result => (result.rows && result.rows.length > 0) ? result.rows[0] : null);
  } else {
    return new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) {
          console.error('Get error:', err, 'SQL:', sql);
          reject(err);
        } else {
          resolve(row || null);
        }
      });
    });
  }
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
      changes: result.rowCount,
      rows: result.rows // RETURNING 返回的行
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

    // 埋点事件表（行为干预）
    await db.query(`
      CREATE TABLE IF NOT EXISTS events (
        id SERIAL PRIMARY KEY,
        event TEXT NOT NULL,
        data JSONB DEFAULT '{}',
        user_id TEXT,
        ip TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_events_event ON events(event)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at)`);

    // 决策树变更请求表（审批管控）
    await db.query(`
      CREATE TABLE IF NOT EXISTS tree_change_requests (
        id SERIAL PRIMARY KEY,
        tree_id TEXT NOT NULL,
        proposed_by TEXT NOT NULL,
        changes JSONB NOT NULL DEFAULT '{}',
        status TEXT DEFAULT 'pending',
        reviewed_by TEXT,
        reviewed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_tcr_tree_id ON tree_change_requests(tree_id)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_tcr_status ON tree_change_requests(status)`);

    // 免费使用次数记录表（匿名用户 + 登录用户每日诊断次数限制）
    await db.query(`
      CREATE TABLE IF NOT EXISTS free_usage (
        id SERIAL PRIMARY KEY,
        identifier TEXT NOT NULL,
        identifier_type TEXT NOT NULL,
        usage_date TEXT NOT NULL,
        count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(identifier, usage_date)
      )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_free_usage_identifier ON free_usage(identifier, identifier_type, usage_date)`);

    // 交互式诊断会话表（持久化存储）
    await db.query(`
      CREATE TABLE IF NOT EXISTS diagnosis_sessions (
        id TEXT PRIMARY KEY,
        status TEXT DEFAULT 'active',
        intent JSONB DEFAULT '{}',
        context JSONB DEFAULT '{}',
        tree_execution JSONB DEFAULT '{}',
        diagnosis JSONB DEFAULT '{}',
        messages JSONB DEFAULT '[]',
        created_at TIMESTAMP DEFAULT NOW(),
        last_activity_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_diagnosis_sessions_status ON diagnosis_sessions(status)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_diagnosis_sessions_last_activity ON diagnosis_sessions(last_activity_at)`);

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

        // 埋点事件表（行为干预）
        db.run(`
          CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event TEXT NOT NULL,
            data TEXT DEFAULT '{}',
            user_id TEXT,
            ip TEXT,
            created_at TEXT DEFAULT (datetime('now'))
          )
        `);
        db.run(`CREATE INDEX IF NOT EXISTS idx_events_event ON events(event)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at)`);

        // 决策树变更请求表（审批管控）
        db.run(`
          CREATE TABLE IF NOT EXISTS tree_change_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tree_id TEXT NOT NULL,
            proposed_by TEXT NOT NULL,
            changes TEXT DEFAULT '{}',
            status TEXT DEFAULT 'pending',
            reviewed_by TEXT,
            reviewed_at TEXT,
            created_at TEXT DEFAULT (datetime('now'))
          )
        `);
        db.run(`CREATE INDEX IF NOT EXISTS idx_tcr_tree_id ON tree_change_requests(tree_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_tcr_status ON tree_change_requests(status)`);

        // 免费使用次数记录表（匿名用户 + 登录用户每日诊断次数限制）
        db.run(`
          CREATE TABLE IF NOT EXISTS free_usage (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            identifier TEXT NOT NULL,
            identifier_type TEXT NOT NULL,
            usage_date TEXT NOT NULL,
            count INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now')),
            UNIQUE(identifier, usage_date)
          )
        `);
        db.run(`CREATE INDEX IF NOT EXISTS idx_free_usage_identifier ON free_usage(identifier, identifier_type, usage_date)`);

        // 交互式诊断会话表（持久化存储）
        db.run(`
          CREATE TABLE IF NOT EXISTS diagnosis_sessions (
            id TEXT PRIMARY KEY,
            status TEXT DEFAULT 'active',
            intent TEXT DEFAULT '{}',
            context TEXT DEFAULT '{}',
            tree_execution TEXT DEFAULT '{}',
            diagnosis TEXT DEFAULT '{}',
            messages TEXT DEFAULT '[]',
            created_at TEXT DEFAULT (datetime('now')),
            last_activity_at TEXT DEFAULT (datetime('now'))
          )
        `);
        db.run(`CREATE INDEX IF NOT EXISTS idx_diagnosis_sessions_status ON diagnosis_sessions(status)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_diagnosis_sessions_last_activity ON diagnosis_sessions(last_activity_at)`);

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

// ========== 诊断会话 CRUD 辅助函数 ==========

/**
 * 创建诊断会话
 * @param {Object} sessionData - { id, status, intent, context, treeExecution, diagnosis, messages }
 * @returns {Object} 创建的会话对象
 */
async function createSession(sessionData) {
  const {
    id,
    status = 'active',
    intent = {},
    context = {},
    treeExecution = {},
    diagnosis = {},
    messages = [],
  } = sessionData;

  const intentJson = JSON.stringify(intent);
  const contextJson = JSON.stringify(context);
  const treeExecJson = JSON.stringify(treeExecution);
  const diagnosisJson = JSON.stringify(diagnosis);
  const messagesJson = JSON.stringify(messages);

  if (isPostgres) {
    const result = await db.query(
      `INSERT INTO diagnosis_sessions (id, status, intent, context, tree_execution, diagnosis, messages, created_at, last_activity_at)
       VALUES ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb, NOW(), NOW())
       RETURNING *`,
      [id, status, intentJson, contextJson, treeExecJson, diagnosisJson, messagesJson]
    );
    return result.rows && result.rows.length > 0 ? parseSessionRow(result.rows[0]) : null;
  } else {
    await run(
      `INSERT INTO diagnosis_sessions (id, status, intent, context, tree_execution, diagnosis, messages)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, status, intentJson, contextJson, treeExecJson, diagnosisJson, messagesJson]
    );
    const row = await get(`SELECT * FROM diagnosis_sessions WHERE id = ?`, [id]);
    return row ? parseSessionRow(row) : null;
  }
}

/**
 * 获取诊断会话（自动检查过期）
 * @param {string} id - 会话 ID
 * @param {number} ttlMs - 过期时间（毫秒），默认 30 分钟
 * @returns {Object|null} 会话对象，不存在或过期时返回 null
 */
async function getSession(id, ttlMs = 30 * 60 * 1000) {
  let row;
  if (isPostgres) {
    row = await db.query(
      `SELECT * FROM diagnosis_sessions WHERE id = $1 AND status = 'active'`,
      [id]
    ).then(r => r.rows && r.rows.length > 0 ? r.rows[0] : null);
  } else {
    row = await get(`SELECT * FROM diagnosis_sessions WHERE id = ? AND status = 'active'`, [id]);
  }

  if (!row) return null;

  // 检查过期
  const lastActivity = new Date(row.last_activity_at).getTime();
  const now = Date.now();
  if (now - lastActivity > ttlMs) {
    // 过期，删除
    await deleteSession(id);
    return null;
  }

  // 更新 last_activity_at
  if (isPostgres) {
    await db.query(`UPDATE diagnosis_sessions SET last_activity_at = NOW() WHERE id = $1`, [id]);
  } else {
    await run(`UPDATE diagnosis_sessions SET last_activity_at = datetime('now') WHERE id = ?`, [id]);
  }

  return parseSessionRow(row);
}

/**
 * 更新诊断会话
 * @param {string} id - 会话 ID
 * @param {Object} updates - 要更新的字段 { status?, intent?, context?, treeExecution?, diagnosis?, messages? }
 * @returns {Object|null} 更新后的会话对象
 */
async function updateSession(id, updates) {
  const fields = [];
  const values = [];
  let paramIndex = 1;

  if (updates.status !== undefined) {
    fields.push(isPostgres ? `status = $${paramIndex++}` : `status = ?`);
    values.push(updates.status);
  }
  if (updates.intent !== undefined) {
    const json = JSON.stringify(updates.intent);
    fields.push(isPostgres ? `intent = $${paramIndex++}::jsonb` : `intent = ?`);
    values.push(json);
  }
  if (updates.context !== undefined) {
    const json = JSON.stringify(updates.context);
    fields.push(isPostgres ? `context = $${paramIndex++}::jsonb` : `context = ?`);
    values.push(json);
  }
  if (updates.treeExecution !== undefined) {
    const json = JSON.stringify(updates.treeExecution);
    fields.push(isPostgres ? `tree_execution = $${paramIndex++}::jsonb` : `tree_execution = ?`);
    values.push(json);
  }
  if (updates.diagnosis !== undefined) {
    const json = JSON.stringify(updates.diagnosis);
    fields.push(isPostgres ? `diagnosis = $${paramIndex++}::jsonb` : `diagnosis = ?`);
    values.push(json);
  }
  if (updates.messages !== undefined) {
    const json = JSON.stringify(updates.messages);
    fields.push(isPostgres ? `messages = $${paramIndex++}::jsonb` : `messages = ?`);
    values.push(json);
  }

  if (fields.length === 0) {
    return getSession(id);
  }

  // 始终更新 last_activity_at
  fields.push(isPostgres ? `last_activity_at = NOW()` : `last_activity_at = datetime('now')`);

  values.push(id);
  const whereClause = isPostgres ? `WHERE id = $${paramIndex}` : `WHERE id = ?`;

  const sql = `UPDATE diagnosis_sessions SET ${fields.join(', ')} ${whereClause}`;

  if (isPostgres) {
    await db.query(sql, values);
  } else {
    await run(sql, values);
  }

  return getSession(id);
}

/**
 * 删除诊断会话
 * @param {string} id - 会话 ID
 */
async function deleteSession(id) {
  if (isPostgres) {
    await db.query(`DELETE FROM diagnosis_sessions WHERE id = $1`, [id]);
  } else {
    await run(`DELETE FROM diagnosis_sessions WHERE id = ?`, [id]);
  }
}

/**
 * 清理过期会话
 * @param {number} ttlMs - 过期时间（毫秒），默认 30 分钟
 * @returns {number} 清理的会话数量
 */
async function cleanupExpiredSessions(ttlMs = 30 * 60 * 1000) {
  const cutoff = new Date(Date.now() - ttlMs).toISOString();

  if (isPostgres) {
    const result = await db.query(
      `DELETE FROM diagnosis_sessions WHERE last_activity_at < $1::timestamp RETURNING id`,
      [cutoff]
    );
    return result.rowCount || 0;
  } else {
    // SQLite: 先查询要删除的 ID，再删除（避免子查询兼容问题）
    const result = await query(
      `SELECT id FROM diagnosis_sessions WHERE last_activity_at < ?`,
      [cutoff]
    );
    if (result.rows && result.rows.length > 0) {
      for (const row of result.rows) {
        await deleteSession(row.id);
      }
    }
    return result.rows ? result.rows.length : 0;
  }
}

/**
 * 解析数据库行 -> 会话对象
 */
function parseSessionRow(row) {
  return {
    id: row.id,
    status: row.status,
    intent: parseJsonField(row.intent, {}),
    context: parseJsonField(row.context, {}),
    treeExecution: parseJsonField(row.tree_execution, {}),
    diagnosis: parseJsonField(row.diagnosis, {}),
    messages: parseJsonField(row.messages, []),
    createdAt: new Date(row.created_at).getTime(),
    lastActivityAt: new Date(row.last_activity_at).getTime(),
  };
}

/**
 * 安全解析 JSON 字段
 */
function parseJsonField(value, defaultValue) {
  if (value === null || value === undefined) return defaultValue;
  if (typeof value === 'object') return value; // pg 的 JSONB 会自动解析
  try {
    return JSON.parse(value);
  } catch {
    return defaultValue;
  }
}

module.exports = {
  db,
  query,
  run,
  get,
  initDatabase,
  isPostgres,
  now,
  // 会话 CRUD
  createSession,
  getSession,
  updateSession,
  deleteSession,
  cleanupExpiredSessions,
};
