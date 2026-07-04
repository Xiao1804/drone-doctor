#!/bin/bash
# v2.1 知识库体系直接部署脚本
# 用法: ssh root@81.71.39.150 'bash -s' < deploy-v21-direct.sh

set -e

PROJECT_DIR="/root/drone-doctor"

echo "🚀 v2.1 知识库体系直接部署"
echo "============================"
echo ""

cd "$PROJECT_DIR"

# ============================================================
# 0. 停止服务
# ============================================================
echo "⏹️  停止服务..."
docker compose --env-file .env.tencent -f docker-compose.tencent.yml stop backend || true
echo ""

# ============================================================
# 1. 备份数据库
# ============================================================
echo "📦 备份现有数据库..."
BACKUP_FILE="/tmp/drone_doctor_backup_$(date +%Y%m%d_%H%M%S).sql"
docker compose --env-file .env.tencent -f docker-compose.tencent.yml exec -T postgres pg_dump -U drone_doctor drone_doctor > "$BACKUP_FILE"
echo "✅ 数据库已备份到: $BACKUP_FILE"
echo ""

# ============================================================
# 2. 创建临时目录，写入迁移文件
# ============================================================
echo "📝 写入 v2.1 迁移文件..."

cat > backend/migrations/1782505200000_knowledge_v21_migration.js << 'EOF'
/**
 * 1782505200000_knowledge_v21_migration.js
 *
 * v2.1 知识库迁移：从 fault_case_embeddings 迁移到 knowledge_articles + knowledge_chunks
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
        WHEN 'F002' THEN 'A10-08-001'
        WHEN 'F003' THEN 'A10-04-001'
        WHEN 'F004' THEN 'A10-09-001'
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
        WHEN 'F002' THEN 'A10-08-001'
        WHEN 'F003' THEN 'A10-04-001'
        WHEN 'F004' THEN 'A10-09-001'
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
    ON CONFLICT DO NOTHING;
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
EOF

cat > backend/migrations/1782591600000_transitional_dual_write.js << 'EOF'
/**
 * 1782591600000_transitional_dual_write.js
 *
 * 双写过渡期：创建兼容视图 + 双向同步触发器
 */

exports.up = (pgm) => {
  // ============================================================
  // 1. 创建兼容视图 v1_fault_case_embeddings
  // ============================================================
  pgm.sql(`
    CREATE OR REPLACE VIEW v1_fault_case_embeddings AS
    SELECT
      ka.id AS id,
      ka.id AS case_id,
      ka.content_md AS content,
      kc.chunk_embedding AS embedding,
      jsonb_build_object(
        'title', ka.title,
        'category_l1', ka.category_l1,
        'category_l2', ka.category_l2,
        'applicable_models', ka.applicable_models,
        'fault_type', ka.fault_type,
        'status', CASE ka.status
          WHEN 'verified' THEN 'approved'
          WHEN 'review' THEN 'pending'
          ELSE ka.status::text
        END,
        'confidence', CASE ka.confidence
          WHEN 'high' THEN 'A'
          WHEN 'medium' THEN 'B'
          WHEN 'low' THEN 'C'
          ELSE 'B'
        END
      ) AS metadata,
      ka.created_at,
      ka.updated_at
    FROM knowledge_articles ka
    LEFT JOIN knowledge_chunks kc ON ka.id = kc.article_id AND kc.chunk_index = 0
    WHERE ka.category_l1 = 'A10' OR ka.id LIKE 'A10-%';
  `);

  // ============================================================
  // 2. 创建函数和触发器：新表 → 旧表同步
  // ============================================================
  pgm.sql(`
    -- 同步函数：knowledge_articles → fault_case_embeddings
    CREATE OR REPLACE FUNCTION sync_knowledge_to_fault_case()
    RETURNS TRIGGER AS $$
    DECLARE
      v_embedding VECTOR(512);
      v_metadata JSONB;
    BEGIN
      -- 只处理 A10 分类的文章
      IF NEW.category_l1 != 'A10' AND NEW.id NOT LIKE 'A10-%' THEN
        RETURN NEW;
      END IF;

      -- 获取向量
      SELECT chunk_embedding INTO v_embedding
      FROM knowledge_chunks
      WHERE article_id = NEW.id AND chunk_index = 0
      LIMIT 1;

      -- 构造 metadata
      v_metadata := jsonb_build_object(
        'title', NEW.title,
        'category_l1', NEW.category_l1,
        'category_l2', NEW.category_l2,
        'applicable_models', NEW.applicable_models,
        'fault_type', NEW.fault_type,
        'status', CASE NEW.status
          WHEN 'verified' THEN 'approved'
          WHEN 'review' THEN 'pending'
          ELSE NEW.status::text
        END,
        'confidence', CASE NEW.confidence
          WHEN 'high' THEN 'A'
          WHEN 'medium' THEN 'B'
          WHEN 'low' THEN 'C'
          ELSE 'B'
        END
      );

      -- 插入或更新 fault_case_embeddings
      INSERT INTO fault_case_embeddings (id, case_id, content, embedding, metadata, created_at, updated_at)
      VALUES (
        COALESCE((SELECT id FROM fault_case_embeddings WHERE case_id = NEW.id LIMIT 1), NEW.id),
        NEW.id,
        NEW.content_md,
        v_embedding,
        v_metadata,
        NEW.created_at,
        NEW.updated_at
      )
      ON CONFLICT (id) DO UPDATE SET
        content = EXCLUDED.content,
        embedding = EXCLUDED.embedding,
        metadata = EXCLUDED.metadata,
        updated_at = EXCLUDED.updated_at;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    -- 创建触发器
    CREATE TRIGGER trigger_knowledge_to_fault_case
      AFTER INSERT OR UPDATE ON knowledge_articles
      FOR EACH ROW EXECUTE FUNCTION sync_knowledge_to_fault_case();
  `);

  // ============================================================
  // 3. 创建函数和触发器：旧表 → 新表同步（反向）
  // ============================================================
  pgm.sql(`
    -- 同步函数：fault_case_embeddings → knowledge_articles
    CREATE OR REPLACE FUNCTION sync_fault_case_to_knowledge()
    RETURNS TRIGGER AS $$
    DECLARE
      v_article_id VARCHAR(30);
    BEGIN
      -- 生成 v2.1 文章 ID
      v_article_id := CASE NEW.case_id
        WHEN 'F001' THEN 'A10-02-001'
        WHEN 'F002' THEN 'A10-08-001'
        WHEN 'F003' THEN 'A10-04-001'
        WHEN 'F004' THEN 'A10-09-001'
        WHEN 'F005' THEN 'A10-06-001'
        ELSE NEW.case_id
      END;

      -- 插入或更新 knowledge_articles
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
      VALUES (
        v_article_id,
        COALESCE(NEW.metadata->>'title', CONCAT('故障案例 #', NEW.id)),
        COALESCE(NEW.metadata->>'category_l1', 'A10'),
        COALESCE(NEW.metadata->>'category_l2', '未分类'),
        NEW.content,
        NEW.content,
        NEW.metadata->'applicable_models',
        NEW.metadata->>'fault_type',
        1,
        'official',
        'atom'::knowledge_layer,
        CASE
          WHEN NEW.metadata->>'status' = 'approved' AND NEW.metadata->>'confidence' = 'A' THEN 'verified'::knowledge_status
          WHEN NEW.metadata->>'status' = 'approved' THEN 'review'::knowledge_status
          WHEN NEW.metadata->>'status' = 'draft' THEN 'draft'::knowledge_status
          ELSE 'review'::knowledge_status
        END,
        CASE
          WHEN NEW.metadata->>'confidence' = 'A' THEN 'high'::confidence_level
          WHEN NEW.metadata->>'confidence' = 'B' THEN 'medium'::confidence_level
          WHEN NEW.metadata->>'confidence' = 'C' THEN 'low'::confidence_level
          ELSE 'medium'::confidence_level
        END,
        'mixed'::evidence_type_enum,
        'normal'::risk_level_enum,
        false,
        'zh-CN',
        NEW.created_at,
        NEW.updated_at
      )
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        content_md = EXCLUDED.content_md,
        content_text = EXCLUDED.content_text,
        updated_at = EXCLUDED.updated_at;

      -- 插入或更新 knowledge_chunks
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
      VALUES (
        v_article_id,
        0,
        NEW.content,
        NEW.embedding,
        'paragraph',
        'fault_diagnosis'::chunk_strategy_type,
        NULL,
        NEW.created_at
      )
      ON CONFLICT DO NOTHING;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    -- 创建触发器
    CREATE TRIGGER trigger_fault_case_to_knowledge
      AFTER INSERT OR UPDATE ON fault_case_embeddings
      FOR EACH ROW EXECUTE FUNCTION sync_fault_case_to_knowledge();
  `);
};

exports.down = (pgm) => {
  pgm.sql('DROP VIEW IF EXISTS v1_fault_case_embeddings');
  pgm.sql('DROP TRIGGER IF EXISTS trigger_knowledge_to_fault_case ON knowledge_articles');
  pgm.sql('DROP FUNCTION IF EXISTS sync_knowledge_to_fault_case');
  pgm.sql('DROP TRIGGER IF EXISTS trigger_fault_case_to_knowledge ON fault_case_embeddings');
  pgm.sql('DROP FUNCTION IF EXISTS sync_fault_case_to_knowledge');
};
EOF

# 更新 embeddingService.js
cat > backend/src/services/embeddingService.js << 'EOF'
const { pipeline, env } = require('@xenova/transformers');

// 配置 transformers.js 使用本地模型（避免运行时下载）
env.localModelPath = process.env.LOCAL_MODEL_PATH || './models';
env.allowRemoteModels = false;
env.allowLocalModels = true;

let embedder = null;
let isLoading = false;
let loadPromise = null;

// 模型配置
const MODEL_NAME = 'Xenova/bge-small-zh-v1.5';
const EMBEDDING_DIM = 512;

/**
 * 初始化 embedding 模型（单例，延迟加载）
 */
async function initEmbedder() {
  if (embedder) return embedder;
  if (loadPromise) return loadPromise;

  isLoading = true;
  console.log(`[Embedding] Loading local model ${MODEL_NAME} from ${env.localModelPath}...`);

  loadPromise = pipeline('feature-extraction', MODEL_NAME, {
    quantized: true, // 使用量化模型，更小更快
  }).then(model => {
    embedder = model;
    isLoading = false;
    console.log('[Embedding] Model loaded successfully');
    return model;
  }).catch(err => {
    isLoading = false;
    loadPromise = null;
    console.error('[Embedding] Failed to load model:', err.message);
    throw err;
  });

  return loadPromise;
}

/**
 * 生成文本的 embedding 向量
 * @param {string|string[]} texts - 输入文本（支持批量）
 * @returns {number[][]} 向量数组，每个向量 512 维
 */
async function generateEmbedding(texts) {
  const model = await initEmbedder();

  const inputTexts = Array.isArray(texts) ? texts : [texts];

  // 清洗文本
  const cleanedTexts = inputTexts.map(t =>
    String(t)
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 512)
  );

  // 逐个处理（避免 batch 处理时的维度问题）
  const embeddings = [];
  for (const text of cleanedTexts) {
    const result = await model(text, {
      pooling: 'mean',
      normalize: true,
    });
    embeddings.push(Array.from(result.data));
  }

  return Array.isArray(texts) ? embeddings : embeddings[0];
}

/**
 * 将向量数组转为 PostgreSQL vector 字符串格式
 * @param {number[]} vector
 * @returns {string} '[0.1,0.2,...]'
 */
function vectorToSql(vector) {
  if (!Array.isArray(vector)) {
    throw new Error(`vectorToSql: expected array, got ${typeof vector}`);
  }

  if (vector.length !== EMBEDDING_DIM) {
    throw new Error(
      `vectorToSql: expected dimension ${EMBEDDING_DIM}, got ${vector.length}`
    );
  }

  const formatted = vector.map((v, i) => {
    const num = Number(v);
    if (!Number.isFinite(num)) {
      throw new Error(
        `vectorToSql: element at index ${i} is not a finite number (got ${v})`
      );
    }
    return num.toFixed(6);
  });

  return '[' + formatted.join(',') + ']';
}

/**
 * 计算两个向量的余弦相似度
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number} 0-1
 */
function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * 分块策略：将文章内容切分为多个 chunk
 * @param {string} content - 文章内容
 * @param {string} strategy - 分块策略 ('fault_diagnosis', 'knowledge', 'api_doc', 'quiz')
 * @returns {Array<{index: number, text: string, type: string, strategy: string}>}
 */
function chunkContent(content, strategy = 'fault_diagnosis') {
  if (!content) return [];

  const chunks = [];
  const maxChunkSize = strategy === 'api_doc' ? 500 : strategy === 'quiz' ? 1000 : 800;

  // 简单分块策略（v2.1 基础实现）
  const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim());

  let currentChunk = '';
  let chunkIndex = 0;

  for (const para of paragraphs) {
    const trimmedPara = para.trim();
    if (!trimmedPara) continue;

    // 检测标题
    const isHeading = trimmedPara.match(/^#{1,6}\s+/) || trimmedPara.match(/^[一二三四五六七八九十]+、/);
    const chunkType = isHeading ? 'heading' : 'paragraph';

    // 如果当前 chunk 加上新段落超过限制，则保存当前 chunk
    if (currentChunk.length + trimmedPara.length > maxChunkSize && currentChunk.length > 0) {
      chunks.push({
        index: chunkIndex++,
        text: currentChunk.trim(),
        type: 'paragraph',
        strategy,
      });
      currentChunk = '';
    }

    // 如果是大标题且当前 chunk 有内容，则先保存
    if (isHeading && currentChunk.length > 0) {
      chunks.push({
        index: chunkIndex++,
        text: currentChunk.trim(),
        type: 'paragraph',
        strategy,
      });
      currentChunk = '';
    }

    // 添加到当前 chunk
    currentChunk += (currentChunk ? '\n\n' : '') + trimmedPara;
  }

  // 添加最后一个 chunk
  if (currentChunk.length > 0) {
    chunks.push({
      index: chunkIndex++,
      text: currentChunk.trim(),
      type: 'paragraph',
      strategy,
    });
  }

  return chunks;
}

/**
 * 生成知识文章的所有 chunk 及其 embeddings
 * @param {string} articleId - 文章 ID
 * @param {string} content - 文章内容
 * @param {string} strategy - 分块策略
 * @param {Object} db - 数据库连接
 * @returns {Promise<Array>}
 */
async function embedArticleChunks(articleId, content, strategy = 'fault_diagnosis', db = null) {
  const chunks = chunkContent(content, strategy);

  if (chunks.length === 0) {
    return [];
  }

  // 生成所有 chunk 的 embeddings
  const chunkTexts = chunks.map(c => c.text);
  const embeddings = await generateEmbedding(chunkTexts);

  // 组合结果
  const embeddedChunks = chunks.map((chunk, index) => ({
    article_id: articleId,
    chunk_index: chunk.index,
    chunk_text: chunk.text,
    chunk_embedding: embeddings[index],
    chunk_type: chunk.type,
    chunk_strategy: chunk.strategy,
    token_count: null,
  }));

  return embeddedChunks;
}

/**
 * 获取模型状态
 */
function getStatus() {
  return {
    model: MODEL_NAME,
    dim: EMBEDDING_DIM,
    loaded: !!embedder,
    loading: isLoading,
  };
}

module.exports = {
  initEmbedder,
  generateEmbedding,
  vectorToSql,
  cosineSimilarity,
  getStatus,
  chunkContent,
  embedArticleChunks,
  EMBEDDING_DIM,
};
EOF

echo "✅ 迁移文件写入完成"
echo ""

# ============================================================
# 3. 运行 v2.1 数据库迁移
# ============================================================
echo "🔄 运行 v2.1 知识库迁移..."
docker compose --env-file .env.tencent -f docker-compose.tencent.yml up -d postgres
sleep 5
docker compose --env-file .env.tencent -f docker-compose.tencent.yml exec -T backend npm run migrate
echo "✅ 迁移完成"
echo ""

# ============================================================
# 4. 验证迁移结果
# ============================================================
echo "🔍 验证迁移结果..."
docker compose --env-file .env.tencent -f docker-compose.tencent.yml exec -T postgres psql -U drone_doctor drone_doctor -c "\dt" 2>/dev/null | grep -E "(knowledge_|pgmigrations)" || true
echo ""

# ============================================================
# 5. 构建并重启服务
# ============================================================
echo "🔄 构建服务..."
docker compose --env-file .env.tencent -f docker-compose.tencent.yml build backend
echo "✅ 构建完成"
echo ""

echo "🔄 启动服务..."
docker compose --env-file .env.tencent -f docker-compose.tencent.yml up -d
echo "✅ 服务已启动"
echo ""

# ============================================================
# 6. 等待服务健康
# ============================================================
echo "⏳ 等待服务健康..."
sleep 20
echo ""

# ============================================================
# 7. 健康检查
# ============================================================
echo "🧪 健康检查..."
if curl -s http://127.0.0.1/health > /dev/null 2>&1; then
  echo "✅ 服务健康检查通过"
else
  echo "⚠️ 健康检查失败，查看日志:"
  docker compose --env-file .env.tencent -f docker-compose.tencent.yml logs --tail=30 backend
fi
echo ""

echo "🎉 v2.1 知识库体系部署完成!"
echo "================================="
echo "访问: http://81.71.39.150"
echo ""
echo "部署内容:"
echo "  ✅ 新增 ENUM 类型 (knowledge_layer, confidence_level 等)"
echo "  ✅ 新增 9 个数据表 (knowledge_articles, knowledge_chunks 等)"
echo "  ✅ 数据迁移 (fault_case_embeddings → 新表)"
echo "  ✅ 创建索引 (向量索引 + 治理索引)"
echo "  ✅ 双写过渡期 (兼容旧表查询)"
echo "  ✅ embedding服务升级 (v2.1 chunk功能)"
echo ""
