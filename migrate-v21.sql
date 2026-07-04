
-- ============================================================
-- v2.1 知识库体系 SQL 迁移脚本
-- ============================================================

-- ============================================================
-- 1. 备份现有数据（以防万一）
-- ============================================================
CREATE TABLE IF NOT EXISTS fault_case_embeddings_backup AS SELECT * FROM fault_case_embeddings;

-- ============================================================
-- 2. 创建 ENUM 类型
-- ============================================================
DO $$ BEGIN
    CREATE TYPE knowledge_layer AS ENUM ('inbox', 'atom', 'case', 'rule', 'skill');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE knowledge_status AS ENUM ('seed', 'draft', 'review', 'verified', 'deprecated');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE confidence_level AS ENUM ('high', 'medium', 'low');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE evidence_type_enum AS ENUM ('fact', 'inference', 'mixed');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE risk_level_enum AS ENUM ('normal', 'high');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE promotion_status AS ENUM ('pending', 'approved', 'rejected', 'withdrawn');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE chunk_strategy_type AS ENUM ('fault_diagnosis', 'knowledge', 'api_doc', 'quiz');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE relation_type_enum AS ENUM ('related', 'prerequisite', 'see_also', 'upgrade_from', 'supersedes', 'superseded_by', 'skill_depends_on');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- 3. 创建知识条目主表 knowledge_articles
-- ============================================================
CREATE TABLE IF NOT EXISTS knowledge_articles (
    id VARCHAR(30) PRIMARY KEY,
    title TEXT NOT NULL,
    category_l1 VARCHAR(20),
    category_l2 VARCHAR(40),
    content_md TEXT NOT NULL,
    content_text TEXT,
    applicable_models JSONB,
    applicable_model_series JSONB,
    fault_type VARCHAR(50),
    difficulty INTEGER CHECK (difficulty BETWEEN 1 AND 5),
    need_professional BOOLEAN,
    tags JSONB,
    version INTEGER DEFAULT 1,

    source_type VARCHAR(20),
    source_name TEXT,
    source_url TEXT,

    layer knowledge_layer DEFAULT 'atom',
    status knowledge_status DEFAULT 'seed',
    confidence confidence_level,
    evidence_type evidence_type_enum,
    applicable_scope TEXT,
    exceptions TEXT,
    last_verified_date DATE,
    risk_level risk_level_enum DEFAULT 'normal',
    ai_generated BOOLEAN DEFAULT false,

    needs_recheck BOOLEAN DEFAULT false,
    language VARCHAR(5) DEFAULT 'zh-CN',
    superseded_by VARCHAR(30),
    attachments JSONB,

    view_count INTEGER DEFAULT 0,
    helpful_count INTEGER DEFAULT 0,
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 4. 创建版本快照表 knowledge_article_versions
-- ============================================================
CREATE TABLE IF NOT EXISTS knowledge_article_versions (
    id SERIAL PRIMARY KEY,
    article_id VARCHAR(30) NOT NULL REFERENCES knowledge_articles(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    content_md TEXT NOT NULL,
    content_text TEXT,
    front_matter JSONB NOT NULL,
    snapshot_reason VARCHAR(20),
    created_by VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(article_id, version)
);

-- ============================================================
-- 5. 创建知识晋升表 knowledge_promotions
-- ============================================================
CREATE TABLE IF NOT EXISTS knowledge_promotions (
    id SERIAL PRIMARY KEY,
    knowledge_id VARCHAR(30) NOT NULL REFERENCES knowledge_articles(id) ON DELETE CASCADE,
    from_layer knowledge_layer NOT NULL,
    to_layer knowledge_layer NOT NULL,
    promotion_status promotion_status DEFAULT 'pending',
    requested_by VARCHAR(50) NOT NULL,
    requested_at TIMESTAMPTZ DEFAULT NOW(),
    reviewed_by VARCHAR(50),
    reviewed_at TIMESTAMPTZ,
    approval_role VARCHAR(30),
    promotion_criteria JSONB NOT NULL,
    rejection_reason TEXT,
    promotion_notes TEXT,
    promoted_at TIMESTAMPTZ,
    CHECK (to_layer != from_layer)
);

-- ============================================================
-- 6. 创建知识分块表 knowledge_chunks
-- ============================================================
CREATE TABLE IF NOT EXISTS knowledge_chunks (
    id SERIAL PRIMARY KEY,
    article_id VARCHAR(30) REFERENCES knowledge_articles(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    chunk_text TEXT NOT NULL,
    chunk_embedding VECTOR(512),
    chunk_type VARCHAR(20),
    chunk_strategy chunk_strategy_type,
    token_count INTEGER,
    applicable_models JSONB,
    fault_type VARCHAR(50),
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 添加 tsvector 列（如果不存在）
ALTER TABLE knowledge_chunks ADD COLUMN IF NOT EXISTS tsv tsvector GENERATED ALWAYS AS (to_tsvector('simple', chunk_text)) STORED;

-- ============================================================
-- 7. 创建知识关联表 knowledge_relations
-- ============================================================
CREATE TABLE IF NOT EXISTS knowledge_relations (
    source_id VARCHAR(30),
    target_id VARCHAR(30),
    relation_type relation_type_enum,
    weight FLOAT DEFAULT 1.0,
    created_by VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (source_id, target_id, relation_type)
);

-- ============================================================
-- 8. 创建 Skill 依赖表 skill_dependencies
-- ============================================================
CREATE TABLE IF NOT EXISTS skill_dependencies (
    id SERIAL PRIMARY KEY,
    skill_id VARCHAR(30) NOT NULL,
    depends_on_id VARCHAR(30) NOT NULL,
    dependency_type VARCHAR(20) NOT NULL,
    required BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(skill_id, depends_on_id)
);

-- ============================================================
-- 9. 创建审核日志表 audit_log
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_log (
    id SERIAL PRIMARY KEY,
    article_id VARCHAR(30),
    action VARCHAR(30) NOT NULL,
    operator VARCHAR(50),
    from_status knowledge_status,
    to_status knowledge_status,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 10. 创建用户反馈表 user_feedback
-- ============================================================
CREATE TABLE IF NOT EXISTS user_feedback (
    id SERIAL PRIMARY KEY,
    article_id VARCHAR(30),
    user_id VARCHAR(50),
    feedback_type VARCHAR(20),
    comment TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 11. 创建来源注册表 source_registry
-- ============================================================
CREATE TABLE IF NOT EXISTS source_registry (
    id SERIAL PRIMARY KEY,
    source_name TEXT NOT NULL,
    source_type VARCHAR(20),
    default_confidence confidence_level,
    quality_score FLOAT,
    registered_at TIMESTAMPTZ DEFAULT NOW(),
    last_assessed_at TIMESTAMPTZ
);

-- ============================================================
-- 12. 创建索引（如果不存在）
-- ============================================================

-- 向量索引
DO $$ BEGIN
    CREATE INDEX IF NOT EXISTS idx_chunks_embedding ON knowledge_chunks USING ivfflat (chunk_embedding vector_cosine_ops) WITH (lists = 100);
EXCEPTION
    WHEN undefined_object OR invalid_object_definition THEN
        CREATE INDEX IF NOT EXISTS idx_chunks_embedding ON knowledge_chunks(chunk_embedding);
END $$;

-- 全文搜索索引
CREATE INDEX IF NOT EXISTS idx_chunks_tsv ON knowledge_chunks USING GIN(tsv);

-- Chunk 关联索引
CREATE INDEX IF NOT EXISTS idx_chunks_article ON knowledge_chunks(article_id);

-- 知识文章索引
CREATE INDEX IF NOT EXISTS idx_articles_l2 ON knowledge_articles(category_l2);
CREATE INDEX IF NOT EXISTS idx_articles_updated ON knowledge_articles(updated_at);
CREATE INDEX IF NOT EXISTS idx_articles_layer ON knowledge_articles(layer);
CREATE INDEX IF NOT EXISTS idx_articles_status ON knowledge_articles(status);
CREATE INDEX IF NOT EXISTS idx_articles_confidence ON knowledge_articles(confidence);

-- 晋升表索引
CREATE INDEX IF NOT EXISTS idx_promotions_status ON knowledge_promotions(promotion_status);
CREATE INDEX IF NOT EXISTS idx_promotions_knowledge ON knowledge_promotions(knowledge_id);

-- 版本表索引
CREATE INDEX IF NOT EXISTS idx_versions_article ON knowledge_article_versions(article_id, version DESC);

-- ============================================================
-- 13. 数据迁移：fault_case_embeddings → knowledge_articles + knowledge_chunks
-- ============================================================
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

-- ============================================================
-- 14. 创建兼容视图 v1_fault_case_embeddings
-- ============================================================
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

-- ============================================================
-- 15. 完成
-- ============================================================
SELECT '✅ v2.1 知识库体系迁移完成!' AS status;
SELECT COUNT(*) AS knowledge_articles_count FROM knowledge_articles;
SELECT COUNT(*) AS knowledge_chunks_count FROM knowledge_chunks;

