/**
 * 001_initial_schema.js
 *
 * Baseline migration: captures the full PostgreSQL schema as of v1.2.0.
 *
 * IMPORTANT: For existing databases that already have these tables (created by
 * initDatabase() in db.js), run `npm run migrate:mark-baseline` to mark this
 * migration as already applied without executing it.
 *
 * For new databases, run `npm run migrate` to apply from scratch.
 */

const EMBEDDING_DIM = 512;

exports.up = (pgm) => {
  // ──────────────────────────────────────────────
  // Users
  // ──────────────────────────────────────────────
  pgm.createTable('users', {
    id: { type: 'TEXT', primaryKey: true },
    username: { type: 'TEXT', notNull: true, unique: true },
    email: { type: 'TEXT', notNull: true, unique: true },
    password: { type: 'TEXT', notNull: true },
    role: { type: 'TEXT', default: 'user' },
    created_at: { type: 'TIMESTAMP', default: pgm.func('NOW()') },
    updated_at: { type: 'TIMESTAMP', default: pgm.func('NOW()') },
    last_login_at: { type: 'TIMESTAMP' },
    diagnosis_count: { type: 'INTEGER', default: 0 },
    favorite_count: { type: 'INTEGER', default: 0 },
    is_active: { type: 'INTEGER', default: 1 },
    membership_expires_at: { type: 'TEXT' },
  });
  pgm.createIndex('users', 'username', { name: 'idx_users_username' });
  pgm.createIndex('users', 'email', { name: 'idx_users_email' });

  // ──────────────────────────────────────────────
  // History
  // ──────────────────────────────────────────────
  pgm.createTable('history', {
    id: { type: 'TEXT', primaryKey: true },
    user_id: { type: 'TEXT', notNull: true, references: 'users(id) ON DELETE CASCADE' },
    type: { type: 'TEXT', notNull: true },
    content: { type: 'TEXT', notNull: true },
    result: { type: 'TEXT' },
    is_favorite: { type: 'INTEGER', default: 0 },
    created_at: { type: 'TIMESTAMP', default: pgm.func('NOW()') },
  });
  pgm.createIndex('history', 'user_id', { name: 'idx_history_user_id' });
  pgm.createIndex('history', 'created_at', { name: 'idx_history_created_at' });

  // ──────────────────────────────────────────────
  // Events (behavior tracking)
  // ──────────────────────────────────────────────
  pgm.createTable('events', {
    id: { type: 'SERIAL', primaryKey: true },
    event: { type: 'TEXT', notNull: true },
    data: { type: 'JSONB', default: '{}' },
    user_id: { type: 'TEXT' },
    ip: { type: 'TEXT' },
    created_at: { type: 'TIMESTAMP', default: pgm.func('NOW()') },
  });
  pgm.createIndex('events', 'event', { name: 'idx_events_event' });
  pgm.createIndex('events', 'created_at', { name: 'idx_events_created_at' });

  // ──────────────────────────────────────────────
  // Tree change requests (approval workflow)
  // ──────────────────────────────────────────────
  pgm.createTable('tree_change_requests', {
    id: { type: 'SERIAL', primaryKey: true },
    tree_id: { type: 'TEXT', notNull: true },
    proposed_by: { type: 'TEXT', notNull: true },
    changes: { type: 'JSONB', notNull: true, default: '{}' },
    status: { type: 'TEXT', default: 'pending' },
    reviewed_by: { type: 'TEXT' },
    reviewed_at: { type: 'TIMESTAMP' },
    created_at: { type: 'TIMESTAMP', default: pgm.func('NOW()') },
  });
  pgm.createIndex('tree_change_requests', 'tree_id', { name: 'idx_tcr_tree_id' });
  pgm.createIndex('tree_change_requests', 'status', { name: 'idx_tcr_status' });

  // ──────────────────────────────────────────────
  // Free usage tracking
  // ──────────────────────────────────────────────
  pgm.createTable('free_usage', {
    id: { type: 'SERIAL', primaryKey: true },
    identifier: { type: 'TEXT', notNull: true },
    identifier_type: { type: 'TEXT', notNull: true },
    usage_date: { type: 'TEXT', notNull: true },
    count: { type: 'INTEGER', default: 0 },
    created_at: { type: 'TIMESTAMP', default: pgm.func('NOW()') },
    updated_at: { type: 'TIMESTAMP', default: pgm.func('NOW()') },
  });
  // Unique constraint on (identifier, usage_date)
  pgm.addConstraint('free_usage', 'uq_free_usage_identifier_date', {
    unique: ['identifier', 'usage_date'],
  });
  pgm.createIndex('free_usage', ['identifier', 'identifier_type', 'usage_date'], {
    name: 'idx_free_usage_identifier',
  });

  // ──────────────────────────────────────────────
  // Diagnosis sessions
  // ──────────────────────────────────────────────
  pgm.createTable('diagnosis_sessions', {
    id: { type: 'TEXT', primaryKey: true },
    status: { type: 'TEXT', default: 'active' },
    intent: { type: 'JSONB', default: '{}' },
    context: { type: 'JSONB', default: '{}' },
    tree_execution: { type: 'JSONB', default: '{}' },
    diagnosis: { type: 'JSONB', default: '{}' },
    messages: { type: 'JSONB', default: '[]' },
    created_at: { type: 'TIMESTAMP', default: pgm.func('NOW()') },
    last_activity_at: { type: 'TIMESTAMP', default: pgm.func('NOW()') },
  });
  pgm.createIndex('diagnosis_sessions', 'status', { name: 'idx_diagnosis_sessions_status' });
  pgm.createIndex('diagnosis_sessions', 'last_activity_at', { name: 'idx_diagnosis_sessions_last_activity' });

  // ──────────────────────────────────────────────
  // Coupons
  // ──────────────────────────────────────────────
  pgm.createTable('coupons', {
    id: { type: 'SERIAL', primaryKey: true },
    code: { type: 'TEXT', notNull: true, unique: true },
    duration_days: { type: 'INTEGER', notNull: true },
    duration_label: { type: 'TEXT', notNull: true },
    status: { type: 'TEXT', default: 'unused' },
    created_by: { type: 'TEXT' },
    activated_by: { type: 'TEXT' },
    activated_at: { type: 'TIMESTAMP' },
    created_at: { type: 'TIMESTAMP', default: pgm.func('NOW()') },
    batch_id: { type: 'TEXT' },
    note: { type: 'TEXT' },
  });
  pgm.createIndex('coupons', 'code', { name: 'idx_coupons_code' });
  pgm.createIndex('coupons', 'status', { name: 'idx_coupons_status' });
  pgm.createIndex('coupons', 'batch_id', { name: 'idx_coupons_batch_id' });

  // ──────────────────────────────────────────────
  // pgvector extension + fault case embeddings
  // ──────────────────────────────────────────────
  pgm.createExtension('vector');
  pgm.createTable('fault_case_embeddings', {
    id: { type: 'SERIAL', primaryKey: true },
    case_id: { type: 'TEXT', notNull: true },
    content: { type: 'TEXT', notNull: true },
    embedding: { type: `VECTOR(${EMBEDDING_DIM})` },
    metadata: { type: 'JSONB', default: '{}' },
    created_at: { type: 'TIMESTAMP', default: pgm.func('NOW()') },
  });
  pgm.createIndex('fault_case_embeddings', 'embedding', {
    name: 'idx_fault_case_embedding',
    method: 'IVFFlat',
    opclass: 'vector_cosine_ops',
    with: 'lists = 10',
  });
};

exports.down = () => {
  throw new Error(
    'Baseline migration rollback is disabled because it would delete all production business data.'
  );
};
