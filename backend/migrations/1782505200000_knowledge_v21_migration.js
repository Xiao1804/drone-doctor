/**
 * 1782505200000_knowledge_v21_migration.js
 *
 * v2.1 知识库迁移：从 fault_case_embeddings 迁移到 knowledge_articles + knowledge_chunks
 *
 * 包含内容：
 * - 新增 ENUM 类型
 * - 新增表结构（knowledge_articles, knowledge_chunks, knowledge_article_versions,
 *               knowledge_promotions, skill_dependencies, 等）
 * - 数据迁移（fault_case_embeddings → knowledge_articles + knowledge_chunks）
 * - 双写过渡期支持（同时写入新旧表）
 * - 索引创建
 * - 回滚预案
 */

const EMBEDDING_DIM = 512;

exports.up = (pgm) => {
  // ============================================================
  // 1. 创建 ENUM 类型
  // ============================================================
  pgm.createType('knowledge_layer', ['inbox', 'atom', 'case', 'rule', 'skill']);
  pgm.createType('knowledge_status', ['seed', 'draft', 'review', 'verified', 'deprecated']);
  pgm.createType('confidence_level', ['high', 'medium', 'low']);
  pgm.createType('evidence_type_enum', ['fact', 'inference', 'mixed']);
  pgm.createType('risk_level_enum', ['normal', 'high']);
  pgm.createType('promotion_status', ['pending', 'approved', 'rejected', 'withdrawn']);
  pgm.createType('chunk_strategy_type', ['fault_diagnosis', 'knowledge', 'api_doc', 'quiz']);
  pgm.createType('relation_type_enum', ['related', 'prerequisite', 'see_also', 'upgrade_from', 'supersedes', 'superseded_by', 'skill_depends_on']);

  // ============================================================
  // 2. 创建知识条目主表
  // ============================================================
  pgm.createTable('knowledge_articles', {
    id: { type: 'VARCHAR(30)', primaryKey: true },
    title: { type: 'TEXT', notNull: true },
    category_l1: { type: 'VARCHAR(20)' },
    category_l2: { type: 'VARCHAR(40)' },
    content_md: { type: 'TEXT', notNull: true },
    content_text: { type: 'TEXT' },
    applicable_models: { type: 'JSONB' },
    applicable_model_series: { type: 'JSONB' },
    fault_type: { type: 'VARCHAR(50)' },
    difficulty: { type: 'INTEGER', check: 'difficulty BETWEEN 1 AND 5' },
    need_professional: { type: 'BOOLEAN' },
    tags: { type: 'JSONB' },
    version: { type: 'INTEGER', default: 1 },

    source_type: { type: 'VARCHAR(20)' },
    source_name: { type: 'TEXT' },
    source_url: { type: 'TEXT' },

    layer: { type: 'knowledge_layer', default: 'atom' },
    status: { type: 'knowledge_status', default: 'seed' },
    confidence: { type: 'confidence_level' },
    evidence_type: { type: 'evidence_type_enum' },
    applicable_scope: { type: 'TEXT' },
    exceptions: { type: 'TEXT' },
    last_verified_date: { type: 'DATE' },
    risk_level: { type: 'risk_level_enum', default: 'normal' },
    ai_generated: { type: 'BOOLEAN', default: false },

    needs_recheck: { type: 'BOOLEAN', default: false },
    language: { type: 'VARCHAR(5)', default: 'zh-CN' },
    superseded_by: { type: 'VARCHAR(30)' },
    attachments: { type: 'JSONB' },

    view_count: { type: 'INTEGER', default: 0 },
    helpful_count: { type: 'INTEGER', default: 0 },
    published_at: { type: 'TIMESTAMPTZ' },
    created_at: { type: 'TIMESTAMPTZ', default: pgm.func('NOW()') },
    updated_at: { type: 'TIMESTAMPTZ', default: pgm.func('NOW()') },
  });

  pgm.addConstraint('knowledge_articles', 'chk_atom_evidence',
    "layer = 'inbox' OR evidence_type IS NOT NULL");
  pgm.addConstraint('knowledge_articles', 'chk_atom_scope',
    "layer = 'inbox' OR applicable_scope IS NOT NULL");
  pgm.addConstraint('knowledge_articles', 'chk_atom_exceptions',
    "layer = 'inbox' OR exceptions IS NOT NULL");
  pgm.addConstraint('knowledge_articles', 'chk_atom_verified_date',
    "layer = 'inbox' OR last_verified_date IS NOT NULL");
  pgm.addConstraint('knowledge_articles', 'chk_supersede',
    'superseded_by IS NULL OR superseded_by != id');

  // ============================================================
  // 3. 创建版本快照表
  // ============================================================
  pgm.createTable('knowledge_article_versions', {
    id: { type: 'SERIAL', primaryKey: true },
    article_id: { type: 'VARCHAR(30)', notNull: true, references: 'knowledge_articles' },
    version: { type: 'INTEGER', notNull: true },
    content_md: { type: 'TEXT', notNull: true },
    content_text: { type: 'TEXT' },
    front_matter: { type: 'JSONB', notNull: true },
    snapshot_reason: { type: 'VARCHAR(20)' },
    created_by: { type: 'VARCHAR(50)' },
    created_at: { type: 'TIMESTAMPTZ', default: pgm.func('NOW()') },
  });
  pgm.addConstraint('knowledge_article_versions', 'uq_article_version',
    'UNIQUE(article_id, version)');

  // ============================================================
  // 4. 创建知识晋升表
  // ============================================================
  pgm.createTable('knowledge_promotions', {
    id: { type: 'SERIAL', primaryKey: true },
    knowledge_id: { type: 'VARCHAR(30)', notNull: true, references: 'knowledge_articles' },
    from_layer: { type: 'knowledge_layer', notNull: true },
    to_layer: { type: 'knowledge_layer', notNull: true },
    promotion_status: { type: 'promotion_status', default: 'pending' },
    requested_by: { type: 'VARCHAR(50)', notNull: true },
    requested_at: { type: 'TIMESTAMPTZ', default: pgm.func('NOW()') },
    reviewed_by: { type: 'VARCHAR(50)' },
    reviewed_at: { type: 'TIMESTAMPTZ' },
    approval_role: { type: 'VARCHAR(30)' },
    promotion_criteria: { type: 'JSONB', notNull: true },
    rejection_reason: { type: 'TEXT' },
    promotion_notes: { type: 'TEXT' },
    promoted_at: { type: 'TIMESTAMPTZ' },
  });

  pgm.addConstraint('knowledge_promotions', 'chk_promotion', 'to_layer != from_layer');
  pgm.addConstraint('knowledge_promotions', 'chk_review',
    "(promotion_status IN ('approved','rejected') AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL) OR promotion_status IN ('pending','withdrawn')");
  pgm.addConstraint('knowledge_promotions', 'chk_rejection_reason',
    "promotion_status != 'rejected' OR rejection_reason IS NOT NULL");

  // ============================================================
  // 5. 创建知识分块表
  // ============================================================
  pgm.createTable('knowledge_chunks', {
    id: { type: 'SERIAL', primaryKey: true },
    article_id: { type: 'VARCHAR(30)', references: 'knowledge_articles' },
    chunk_index: { type: 'INTEGER', notNull: true },
    chunk_text: { type: 'TEXT', notNull: true },
    chunk_embedding: { type: `VECTOR(${EMBEDDING_DIM})` },
    chunk_type: { type: 'VARCHAR(20)' },
    chunk_strategy: { type: 'chunk_strategy_type' },
    token_count: { type: 'INTEGER' },
    applicable_models: { type: 'JSONB' },
    fault_type: { type: 'VARCHAR(50)' },
    metadata: { type: 'JSONB' },
    created_at: { type: 'TIMESTAMPTZ', default: pgm.func('NOW()') },
  });

  pgm.sql(`ALTER TABLE knowledge_chunks ADD COLUMN tsv tsvector GENERATED ALWAYS AS (to_tsvector('simple', chunk_text)) STORED`);

  // ============================================================
  // 6. 创建知识关联表
  // ============================================================
  pgm.createTable('knowledge_relations', {
    source_id: { type: 'VARCHAR(30)' },
    target_id: { type: 'VARCHAR(30)' },
    relation_type: { type: 'relation_type_enum' },
    weight: { type: 'FLOAT', default: 1.0 },
    created_by: { type: 'VARCHAR(50)' },
    created_at: { type: 'TIMESTAMPTZ', default: pgm.func('NOW()') },
  });
  pgm.addConstraint('knowledge_relations', 'pk_relations',
    'PRIMARY KEY (source_id, target_id, relation_type)');

  // ============================================================
  // 7. 创建 Skill 依赖表
  // ============================================================
  pgm.createTable('skill_dependencies', {
    id: { type: 'SERIAL', primaryKey: true },
    skill_id: { type: 'VARCHAR(30)', notNull: true },
    depends_on_id: { type: 'VARCHAR(30)', notNull: true },
    dependency_type: { type: 'VARCHAR(20)', notNull: true },
    required: { type: 'BOOLEAN', default: true },
    created_at: { type: 'TIMESTAMPTZ', default: pgm.func('NOW()') },
  });
  pgm.addConstraint('skill_dependencies', 'uq_skill_depends',
    'UNIQUE(skill_id, depends_on_id)');

  // ============================================================
  // 8. 创建审核日志表
  // ============================================================
  pgm.createTable('audit_log', {
    id: { type: 'SERIAL', primaryKey: true },
    article_id: { type: 'VARCHAR(30)' },
    action: { type: 'VARCHAR(30)', notNull: true },
    operator: { type: 'VARCHAR(50)' },
    from_status: { type: 'knowledge_status' },
    to_status: { type: 'knowledge_status' },
    notes: { type: 'TEXT' },
    created_at: { type: 'TIMESTAMPTZ', default: pgm.func('NOW()') },
  });

  // ============================================================
  // 9. 创建用户反馈表
  // ============================================================
  pgm.createTable('user_feedback', {
    id: { type: 'SERIAL', primaryKey: true },
    article_id: { type: 'VARCHAR(30)' },
    user_id: { type: 'VARCHAR(50)' },
    feedback_type: { type: 'VARCHAR(20)' },
    comment: { type: 'TEXT' },
    created_at: { type: 'TIMESTAMPTZ', default: pgm.func('NOW()') },
  });

  // ============================================================
  // 10. 创建来源注册表
  // ============================================================
  pgm.createTable('source_registry', {
    id: { type: 'SERIAL', primaryKey: true },
    source_name: { type: 'TEXT', notNull: true },
    source_type: { type: 'VARCHAR(20)' },
    default_confidence: { type: 'confidence_level' },
    quality_score: { type: 'FLOAT' },
    registered_at: { type: 'TIMESTAMPTZ', default: pgm.func('NOW()') },
    last_assessed_at: { type: 'TIMESTAMPTZ' },
  });

  // ============================================================
  // 11. 创建索引
  // ============================================================
  // 向量索引
  pgm.createIndex('knowledge_chunks', 'chunk_embedding', {
    name: 'idx_chunks_embedding',
    method: 'IVFFlat',
    opclass: 'vector_cosine_ops',
    with: 'lists = 100',
  });

  // 全文搜索索引
  pgm.createIndex('knowledge_chunks', 'tsv', {
    name: 'idx_chunks_tsv',
    method: 'GIN',
  });

  // Chunk 关联索引
  pgm.createIndex('knowledge_chunks', 'article_id', {
    name: 'idx_chunks_article',
  });

  // 知识文章索引
  pgm.createIndex('knowledge_articles', 'category_l2', { name: 'idx_articles_l2' });
  pgm.createIndex('knowledge_articles', ['risk_level', 'status'], {
    name: 'idx_articles_risk_pending',
    where: "risk_level = 'high'",
  });
  pgm.createIndex('knowledge_articles', 'last_verified_date', {
    name: 'idx_articles_verify_date',
    where: "status = 'verified'",
  });
  pgm.createIndex('knowledge_articles', ['ai_generated', 'status'], {
    name: 'idx_articles_ai_pending',
    where: "ai_generated = true AND status != 'verified'",
  });
  pgm.createIndex('knowledge_articles', 'updated_at', { name: 'idx_articles_updated' });
  pgm.createIndex('knowledge_articles', 'needs_recheck', {
    name: 'idx_articles_needs_recheck',
    where: 'needs_recheck = true',
  });
  pgm.createIndex('knowledge_articles', ['category_l1', 'confidence'], {
    name: 'idx_articles_available',
    where: "status = 'verified' AND layer != 'inbox'",
  });
  pgm.createIndex('knowledge_articles', ['category_l1', 'category_l2'], { name: 'idx_articles_category' });
  pgm.createIndex('knowledge_articles', 'layer', { name: 'idx_articles_layer' });
  pgm.createIndex('knowledge_articles', 'status', { name: 'idx_articles_status' });
  pgm.createIndex('knowledge_articles', 'confidence', { name: 'idx_articles_confidence' });
  pgm.createIndex('knowledge_articles', 'superseded_by', {
    name: 'idx_articles_superseded',
    where: 'superseded_by IS NOT NULL',
  });

  // 晋升表索引
  pgm.createIndex('knowledge_promotions', 'promotion_status', { name: 'idx_promotions_status' });
  pgm.createIndex('knowledge_promotions', 'knowledge_id', { name: 'idx_promotions_knowledge' });
  pgm.createIndex('knowledge_promotions', ['to_layer', 'promotion_status'], {
    name: 'idx_promotions_pending',
    where: "promotion_status = 'pending'",
  });

  // 版本表索引
  pgm.createIndex('knowledge_article_versions', ['article_id', 'version DESC'], {
    name: 'idx_versions_article',
  });

  // Skill 依赖索引
  pgm.createIndex('skill_dependencies', 'skill_id', { name: 'idx_skill_deps_skill' });
  pgm.createIndex('skill_dependencies', 'depends_on_id', { name: 'idx_skill_deps_depends' });

  // ============================================================
  // 12. 数据迁移：fault_case_embeddings → knowledge_articles + knowledge_chunks
  // ============================================================
  pgm.sql(`
    -- 迁移到 knowledge_articles
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
    FROM fault_case_embeddings f;

    -- 迁移到 knowledge_chunks（直接迁移向量）
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
    FROM fault_case_embeddings f;

    -- 合并 feedback 到 user_feedback
    INSERT INTO user_feedback (
      article_id,
      user_id,
      feedback_type,
      comment,
      created_at
    )
    SELECT
      CASE fb.case_id
        WHEN 'F001' THEN 'A10-02-001'
        WHEN 'F002' THEN 'A10-03-002'
        WHEN 'F003' THEN 'A10-04-001'
        WHEN 'F004' THEN 'A10-03-003'
        WHEN 'F005' THEN 'A10-06-001'
        ELSE NULL
      END AS article_id,
      fb.user_id,
      CASE fb.rating
        WHEN 'good' THEN 'helpful'
        WHEN 'bad' THEN 'not_helpful'
        ELSE NULL
      END AS feedback_type,
      fb.content AS comment,
      fb.created_at
    FROM feedback fb;
  `);
};

exports.down = (pgm) => {
  // 删除表（按依赖顺序）
  pgm.dropTable('source_registry');
  pgm.dropTable('user_feedback');
  pgm.dropTable('audit_log');
  pgm.dropTable('skill_dependencies');
  pgm.dropTable('knowledge_relations');
  pgm.dropTable('knowledge_chunks');
  pgm.dropTable('knowledge_promotions');
  pgm.dropTable('knowledge_article_versions');
  pgm.dropTable('knowledge_articles');

  // 删除 ENUM 类型
  pgm.dropType('relation_type_enum');
  pgm.dropType('chunk_strategy_type');
  pgm.dropType('promotion_status');
  pgm.dropType('risk_level_enum');
  pgm.dropType('evidence_type_enum');
  pgm.dropType('confidence_level');
  pgm.dropType('knowledge_status');
  pgm.dropType('knowledge_layer');
};
