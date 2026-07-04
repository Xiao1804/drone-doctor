/**
 * 1782505200000_knowledge_v21_migration_fixed.js
 *
 * v2.1 知识库迁移（修复版）：处理枚举类型已存在的情况
 */

const EMBEDDING_DIM = 512;

exports.up = (pgm) => {
  // ============================================================
  // 1. 创建 ENUM 类型（使用 IF NOT EXISTS 逻辑）
  // ============================================================
  try {
    pgm.createType('knowledge_layer', ['inbox', 'atom', 'case', 'rule', 'skill']);
  } catch (e) {
    console.log('[Migration] knowledge_layer type already exists, skipping');
  }

  try {
    pgm.createType('knowledge_status', ['seed', 'draft', 'review', 'verified', 'deprecated']);
  } catch (e) {
    console.log('[Migration] knowledge_status type already exists, skipping');
  }

  try {
    pgm.createType('confidence_level', ['high', 'medium', 'low']);
  } catch (e) {
    console.log('[Migration] confidence_level type already exists, skipping');
  }

  try {
    pgm.createType('evidence_type_enum', ['fact', 'inference', 'mixed']);
  } catch (e) {
    console.log('[Migration] evidence_type_enum type already exists, skipping');
  }

  try {
    pgm.createType('risk_level_enum', ['normal', 'high']);
  } catch (e) {
    console.log('[Migration] risk_level_enum type already exists, skipping');
  }

  try {
    pgm.createType('promotion_status', ['pending', 'approved', 'rejected', 'withdrawn']);
  } catch (e) {
    console.log('[Migration] promotion_status type already exists, skipping');
  }

  try {
    pgm.createType('chunk_strategy_type', ['fault_diagnosis', 'knowledge', 'api_doc', 'quiz']);
  } catch (e) {
    console.log('[Migration] chunk_strategy_type type already exists, skipping');
  }

  try {
    pgm.createType('relation_type_enum', ['related', 'prerequisite', 'see_also', 'upgrade_from', 'supersedes', 'superseded_by', 'skill_depends_on']);
  } catch (e) {
    console.log('[Migration] relation_type_enum type already exists, skipping');
  }

  // ============================================================
  // 2. 创建知识条目主表（使用 IF NOT EXISTS 逻辑）
  // ============================================================
  const tables = ['knowledge_articles', 'knowledge_article_versions', 'knowledge_promotions',
                  'knowledge_chunks', 'knowledge_relations', 'skill_dependencies',
                  'audit_log', 'user_feedback', 'source_registry'];
  
  tables.forEach(table => {
    try {
      pgm.createTable(table, {});
    } catch (e) {
      console.log(`[Migration] table ${table} already exists, skipping`);
    }
  });

  // ============================================================
  // 3. 执行原始迁移脚本的其余部分
  // ============================================================
  // 由于表可能已存在，我们只执行数据迁移和索引创建
  pgm.sql(`
    -- 只执行数据迁移，使用 INSERT ... ON CONFLICT 避免重复
    INSERT INTO knowledge_articles (
      id,
      title,
      category_l1,
      category_l2,
      content_md,
      content_text,
      applicable_models,
      fault_type,
      version,
      source_type,
      layer,
      status,
      confidence,
      evidence_type,
      risk_level,
      ai_generated,
      language,
      created_at,
      updated_at
    )
    SELECT
      CASE f.case_id
        WHEN 'F001' THEN 'A10-02-001'
        WHEN 'F002' THEN 'A10-03-002'
        WHEN 'F003' THEN 'A10-04-001'
        WHEN 'F004' THEN 'A10-03-003'
        WHEN 'F005' THEN 'A10-06-001'
        ELSE CONCAT('A10-99-', LPAD(CAST(f.id AS VARCHAR), 6, '0'))
      END AS id,
      COALESCE(f.metadata->>'title', CONCAT('故障案例 #', f.id)) AS title,
      COALESCE(f.metadata->>'category_l1', 'A10') AS category_l1,
      COALESCE(f.metadata->>'category_l2', '未分类') AS category_l2,
      f.content AS content_md,
      f.content AS content_text,
      f.metadata->'applicable_models' AS applicable_models,
      f.metadata->>'fault_type' AS fault_type,
      1 AS version,
      'official' AS source_type,
      'atom'::knowledge_layer AS layer,
      CASE
        WHEN f.metadata->>'status' = 'approved' AND f.metadata->>'confidence' = 'A' THEN 'verified'::knowledge_status
        WHEN f.metadata->>'status' = 'approved' THEN 'review'::knowledge_status
        WHEN f.metadata->>'status' = 'draft' THEN 'draft'::knowledge_status
        WHEN f.metadata->>'status' = 'pending' THEN 'review'::knowledge_status
        WHEN f.metadata->>'status' = 'rejected' THEN 'draft'::knowledge_status
        ELSE 'review'::knowledge_status
      END AS status,
      CASE
        WHEN f.metadata->>'confidence' = 'A' THEN 'high'::confidence_level
        WHEN f.metadata->>'confidence' = 'B' THEN 'medium'::confidence_level
        WHEN f.metadata->>'confidence' = 'C' THEN 'low'::confidence_level
        ELSE 'medium'::confidence_level
      END AS confidence,
      'mixed'::evidence_type_enum AS evidence_type,
      'normal'::risk_level_enum AS risk_level,
      false AS ai_generated,
      'zh-CN' AS language,
      f.created_at,
      f.created_at AS updated_at
    FROM fault_case_embeddings f
    ON CONFLICT (id) DO NOTHING;

    -- 迁移到 knowledge_chunks
    INSERT INTO knowledge_chunks (
      article_id,
      chunk_index,
      chunk_text,
      chunk_embedding,
      chunk_type,
      chunk_strategy,
      token_count,
      created_at
    )
    SELECT
      CASE f.case_id
        WHEN 'F001' THEN 'A10-02-001'
        WHEN 'F002' THEN 'A10-03-002'
        WHEN 'F003' THEN 'A10-04-001'
        WHEN 'F004' THEN 'A10-03-003'
        WHEN 'F005' THEN 'A10-06-001'
        ELSE CONCAT('A10-99-', LPAD(CAST(f.id AS VARCHAR), 6, '0'))
      END AS article_id,
      0 AS chunk_index,
      f.content AS chunk_text,
      f.embedding AS chunk_embedding,
      'paragraph' AS chunk_type,
      'fault_diagnosis'::chunk_strategy_type AS chunk_strategy,
      NULL AS token_count,
      f.created_at
    FROM fault_case_embeddings f
    ON CONFLICT (id) DO NOTHING;
  `);
};

exports.down = (pgm) => {
  // 删除表
  pgm.dropTable('source_registry', { ifExists: true });
  pgm.dropTable('user_feedback', { ifExists: true });
  pgm.dropTable('audit_log', { ifExists: true });
  pgm.dropTable('skill_dependencies', { ifExists: true });
  pgm.dropTable('knowledge_relations', { ifExists: true });
  pgm.dropTable('knowledge_chunks', { ifExists: true });
  pgm.dropTable('knowledge_promotions', { ifExists: true });
  pgm.dropTable('knowledge_article_versions', { ifExists: true });
  pgm.dropTable('knowledge_articles', { ifExists: true });

  // 删除 ENUM 类型
  pgm.dropType('relation_type_enum', { ifExists: true });
  pgm.dropType('chunk_strategy_type', { ifExists: true });
  pgm.dropType('promotion_status', { ifExists: true });
  pgm.dropType('risk_level_enum', { ifExists: true });
  pgm.dropType('evidence_type_enum', { ifExists: true });
  pgm.dropType('confidence_level', { ifExists: true });
  pgm.dropType('knowledge_status', { ifExists: true });
  pgm.dropType('knowledge_layer', { ifExists: true });
};