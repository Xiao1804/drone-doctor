#!/usr/bin/env node

const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  process.exit(0);
}

const pgSslMode = String(process.env.PGSSLMODE || '').toLowerCase();
const useSsl = !['disable', 'false', '0', 'no'].includes(pgSslMode);
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: useSsl ? { rejectUnauthorized: false } : false,
});

async function main() {
  const tableResult = await pool.query(`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = current_schema()
        AND table_name = 'pgmigrations'
    ) AS exists
  `);

  if (!tableResult.rows[0]?.exists) return;

  await pool.query(`
    UPDATE pgmigrations
    SET name = CASE name
      WHEN '001_initial_schema.js' THEN '001_initial_schema'
      WHEN '002_trial_access_and_feedback.js' THEN '002_trial_access_and_feedback'
      ELSE name
    END
    WHERE name IN (
      '001_initial_schema.js',
      '002_trial_access_and_feedback.js'
    )
  `);
}

main()
  .catch(error => {
    console.error(`Failed to normalize migration names: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
