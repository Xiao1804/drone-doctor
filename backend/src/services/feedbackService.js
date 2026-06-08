const { db, query, run, isPostgres } = require('../db');

const FEEDBACK_TYPES = new Set([
  '诊断不准确',
  '看不懂步骤',
  '不会操作',
  '页面/功能出错',
  '想要新增功能',
  '其他',
]);

const FEEDBACK_RATINGS = new Set([
  'helpful',
  'not_helpful',
  'unclear',
  'none',
]);

const FEEDBACK_STATUSES = new Set([
  'new',
  'reviewing',
  'resolved',
  'ignored',
]);

let tableReady = false;

async function ensureFeedbackTable() {
  if (tableReady) return;

  if (isPostgres) {
    await db.query(`
      CREATE TABLE IF NOT EXISTS feedback (
        id SERIAL PRIMARY KEY,
        user_id TEXT,
        username TEXT,
        type TEXT NOT NULL,
        rating TEXT DEFAULT 'none',
        page TEXT,
        content TEXT NOT NULL,
        contact TEXT,
        diagnosis_id TEXT,
        tree_id TEXT,
        node_id TEXT,
        status TEXT DEFAULT 'new',
        admin_note TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON feedback(created_at)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_feedback_user_id ON feedback(user_id)`);
  } else {
    await run(`
      CREATE TABLE IF NOT EXISTS feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT,
        username TEXT,
        type TEXT NOT NULL,
        rating TEXT DEFAULT 'none',
        page TEXT,
        content TEXT NOT NULL,
        contact TEXT,
        diagnosis_id TEXT,
        tree_id TEXT,
        node_id TEXT,
        status TEXT DEFAULT 'new',
        admin_note TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `);
    await run(`CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON feedback(created_at)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_feedback_user_id ON feedback(user_id)`);
  }

  tableReady = true;
}

function normalizeText(value, maxLength) {
  const text = String(value || '').trim();
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function validateFeedbackInput(input) {
  const type = normalizeText(input.type, 40) || '其他';
  const rating = normalizeText(input.rating, 40) || 'none';
  const content = normalizeText(input.content, 3000);

  if (!FEEDBACK_TYPES.has(type)) {
    const err = new Error('无效的反馈类型');
    err.statusCode = 400;
    throw err;
  }

  if (!FEEDBACK_RATINGS.has(rating)) {
    const err = new Error('无效的反馈评价');
    err.statusCode = 400;
    throw err;
  }

  if (!content || content.length < 2) {
    const err = new Error('反馈内容不能为空');
    err.statusCode = 400;
    throw err;
  }

  return {
    type,
    rating,
    content,
    page: normalizeText(input.page, 300),
    contact: normalizeText(input.contact, 200),
    diagnosisId: normalizeText(input.diagnosisId, 120),
    treeId: normalizeText(input.treeId, 120),
    nodeId: normalizeText(input.nodeId, 120),
  };
}

function formatFeedback(row) {
  return {
    id: row.id,
    userId: row.user_id || null,
    username: row.username || null,
    type: row.type,
    rating: row.rating || 'none',
    page: row.page || '',
    content: row.content,
    contact: row.contact || '',
    diagnosisId: row.diagnosis_id || '',
    treeId: row.tree_id || '',
    nodeId: row.node_id || '',
    status: row.status || 'new',
    adminNote: row.admin_note || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function createFeedback(input, user = null) {
  await ensureFeedbackTable();
  const data = validateFeedbackInput(input);

  const userId = user?.userId || user?.id || null;
  const username = user?.username || null;

  const result = await run(
    `INSERT INTO feedback (
      user_id, username, type, rating, page, content, contact,
      diagnosis_id, tree_id, node_id, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ${isPostgres ? 'NOW()' : "datetime('now')"}, ${isPostgres ? 'NOW()' : "datetime('now')"})
    ${isPostgres ? 'RETURNING *' : ''}`,
    [
      userId,
      username,
      data.type,
      data.rating,
      data.page,
      data.content,
      data.contact,
      data.diagnosisId,
      data.treeId,
      data.nodeId,
    ]
  );

  if (isPostgres && result.rows?.[0]) {
    return formatFeedback(result.rows[0]);
  }

  return {
    id: result.lastID,
    status: 'new',
  };
}

async function listFeedback({ status, page = 1, pageSize = 20 }) {
  await ensureFeedbackTable();
  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safePageSize = Math.min(100, Math.max(1, parseInt(pageSize, 10) || 20));
  const offset = (safePage - 1) * safePageSize;

  const conditions = [];
  const params = [];
  if (status && FEEDBACK_STATUSES.has(status)) {
    conditions.push('status = ?');
    params.push(status);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const totalResult = await query(
    `SELECT COUNT(*) as total FROM feedback ${whereClause}`,
    params
  );
  const total = parseInt(totalResult.rows?.[0]?.total || '0', 10);

  const listResult = await query(
    `SELECT * FROM feedback ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...params, safePageSize, offset]
  );

  return {
    items: listResult.rows.map(formatFeedback),
    page: safePage,
    pageSize: safePageSize,
    total,
  };
}

async function updateFeedback(id, updates) {
  await ensureFeedbackTable();
  const feedbackId = parseInt(id, 10);
  if (!feedbackId) {
    const err = new Error('反馈 ID 无效');
    err.statusCode = 400;
    throw err;
  }

  const fields = [];
  const values = [];

  if (updates.status !== undefined) {
    const status = normalizeText(updates.status, 40);
    if (!FEEDBACK_STATUSES.has(status)) {
      const err = new Error('无效的反馈状态');
      err.statusCode = 400;
      throw err;
    }
    fields.push('status = ?');
    values.push(status);
  }

  if (updates.adminNote !== undefined) {
    fields.push('admin_note = ?');
    values.push(normalizeText(updates.adminNote, 3000));
  }

  if (fields.length === 0) {
    const err = new Error('没有可更新的字段');
    err.statusCode = 400;
    throw err;
  }

  fields.push(`updated_at = ${isPostgres ? 'NOW()' : "datetime('now')"}`);
  values.push(feedbackId);

  const result = await run(
    `UPDATE feedback SET ${fields.join(', ')} WHERE id = ? ${isPostgres ? 'RETURNING *' : ''}`,
    values
  );

  if (isPostgres && result.rows?.[0]) {
    return formatFeedback(result.rows[0]);
  }

  const rowResult = await query('SELECT * FROM feedback WHERE id = ?', [feedbackId]);
  if (!rowResult.rows?.[0]) {
    const err = new Error('反馈不存在');
    err.statusCode = 404;
    throw err;
  }
  return formatFeedback(rowResult.rows[0]);
}

module.exports = {
  ensureFeedbackTable,
  createFeedback,
  listFeedback,
  updateFeedback,
  FEEDBACK_TYPES: Array.from(FEEDBACK_TYPES),
  FEEDBACK_RATINGS: Array.from(FEEDBACK_RATINGS),
  FEEDBACK_STATUSES: Array.from(FEEDBACK_STATUSES),
};
