const fs = require('fs').promises;
const path = require('path');
const { initDatabase, run, query, db } = require('./db');

async function migrateUsers() {
  try {
    const usersFile = path.join(__dirname, '../../data/users.json');
    const data = await fs.readFile(usersFile, 'utf-8');
    const users = JSON.parse(data);

    if (users.length === 0) {
      console.log('No users to migrate');
      return;
    }

    console.log(`Migrating ${users.length} users...`);

    for (const user of users) {
      await run(
        `INSERT OR IGNORE INTO users (id, username, email, password, role, created_at, updated_at, last_login_at, diagnosis_count, favorite_count, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          user.id,
          user.username,
          user.email,
          user.password,
          user.role,
          user.createdAt,
          user.updatedAt,
          user.lastLoginAt,
          user.diagnosisCount || 0,
          user.favoriteCount || 0,
          user.isActive !== false ? 1 : 0
        ]
      );
    }

    console.log('Users migrated successfully');
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log('No users.json file found, skipping user migration');
      return;
    }
    throw error;
  }
}

async function migrateHistory() {
  try {
    const historyFile = path.join(__dirname, '../../data/history.json');
    const data = await fs.readFile(historyFile, 'utf-8');
    const records = JSON.parse(data);

    if (records.length === 0) {
      console.log('No history to migrate');
      return;
    }

    console.log(`Migrating ${records.length} history records...`);

    for (const record of records) {
      await run(
        `INSERT OR IGNORE INTO history (id, user_id, type, content, result, is_favorite, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          record.id,
          record.userId,
          record.type,
          record.content,
          JSON.stringify(record.result),
          record.isFavorite ? 1 : 0,
          record.createdAt
        ]
      );
    }

    console.log('History migrated successfully');
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log('No history.json file found, skipping history migration');
      return;
    }
    throw error;
  }
}

async function runMigration() {
  try {
    console.log('Starting migration...');
    await initDatabase();
    await migrateUsers();
    await migrateHistory();
    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    db.close();
  }
}

runMigration();
