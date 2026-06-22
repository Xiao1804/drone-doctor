/**
 * Adds anonymous trial access support and moves the feedback schema under
 * versioned PostgreSQL migrations.
 */

exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE coupons ADD COLUMN IF NOT EXISTS access_id TEXT;
    ALTER TABLE coupons ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP;
    ALTER TABLE coupons ADD COLUMN IF NOT EXISTS issued_at TIMESTAMP;

    CREATE UNIQUE INDEX IF NOT EXISTS idx_coupons_access_id_unique
      ON coupons(access_id)
      WHERE access_id IS NOT NULL;

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
      public_reply TEXT,
      resolved_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    ALTER TABLE feedback ADD COLUMN IF NOT EXISTS public_reply TEXT;
    ALTER TABLE feedback ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP;

    CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status);
    CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON feedback(created_at);
    CREATE INDEX IF NOT EXISTS idx_feedback_user_id ON feedback(user_id);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_fault_case_embeddings_case_id_unique
      ON fault_case_embeddings(case_id);
  `);
};

exports.down = () => {
  throw new Error(
    'Migration 002 is forward-only because feedback and redeemed trial access are business data.'
  );
};
