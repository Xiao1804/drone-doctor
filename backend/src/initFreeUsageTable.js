const { db, isPostgres, run } = require('./db');

async function initFreeUsageTable() {
  console.log('[Init] Creating free_usage table if not exists...');

  if (isPostgres) {
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
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_free_usage_identifier
      ON free_usage(identifier, identifier_type, usage_date)
    `);
  } else {
    await run(`
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
    await run(`
      CREATE INDEX IF NOT EXISTS idx_free_usage_identifier
      ON free_usage(identifier, identifier_type, usage_date)
    `);
  }

  console.log('[Init] free_usage table ready');
}

initFreeUsageTable()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('[Init] Failed:', error);
    process.exit(1);
  });
