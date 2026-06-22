/**
 * mark-baseline-applied.js
 *
 * Marks migration 1781913600000_initial_schema as already applied without executing it.
 * Use this for existing databases where tables were created by initDatabase().
 *
 * Usage: node scripts/mark-baseline-applied.js
 *
 * After running this, future `npm run migrate` will only apply new migrations.
 */

const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL is not set.');
  console.error('Set it in your .env or .env.tencent file.');
  process.exit(1);
}

async function markBaselineApplied() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: false,
  });

  try {
    // Create pgmigrations table if not exists (node-pg-migrate's schema)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS pgmigrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        run_on TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await pool.query(`
      UPDATE pgmigrations
      SET name = '1781913600000_initial_schema'
      WHERE name IN ('001_initial_schema', '001_initial_schema.js')
    `);

    // Check if baseline already marked
    const existing = await pool.query(
      'SELECT id FROM pgmigrations WHERE name = $1',
      ['1781913600000_initial_schema']
    );

    if (existing.rows.length > 0) {
      console.log('Baseline migration 1781913600000_initial_schema is already marked as applied.');
      console.log('Nothing to do.');
      return;
    }

    // Mark baseline as applied
    await pool.query(
      'INSERT INTO pgmigrations (name, run_on) VALUES ($1, NOW())',
      ['1781913600000_initial_schema']
    );

    console.log('✅ Baseline migration 1781913600000_initial_schema marked as applied.');
    console.log('Future `npm run migrate` will only apply new migrations.');
  } catch (err) {
    console.error('❌ Failed to mark baseline:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

markBaselineApplied();
