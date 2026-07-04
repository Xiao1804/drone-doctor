/**
 * 1782591600000_transitional_dual_write.js
 *
 * 双写过渡期迁移：
 * - 创建视图兼容旧查询
 * - 创建触发器实现双写（新表变更同步到旧表）
 * - 确保 diagnosis_sessions 兼容性
 */

exports.up = (pgm) => {
  // ============================================================
  // 1. 创建兼容视图：v1_fault_case_embeddings（模拟旧表结构）
  // ============================================================
  pgm.sql(`
    CREATE OR REPLACE VIEW v1_fault_case_embeddings AS
    SELECT
      k.id::INTEGER AS id,
      k.id AS case_id,
      k.content_text AS content,
      c.chunk_embedding AS embedding,
      jsonb_build_object(
        'title', k.title,
        'category_l1', k.category_l1,
        'category_l2', k.category_l2,
        'applicable_models', k.applicable_models,
        'fault_type', k.fault_type,
        'status', CASE k.status WHEN 'verified' THEN 'approved' ELSE k.status::TEXT END,
        'confidence', CASE k.confidence WHEN 'high' THEN 'A' WHEN 'medium' THEN 'B' ELSE 'C' END
      ) AS metadata,
      k.created_at
    FROM knowledge_articles k
    LEFT JOIN knowledge_chunks c ON k.id = c.article_id AND c.chunk_index = 0;
  `);

  // ============================================================
  // 2. 创建触发器函数：同步 knowledge_chunks 变更到 fault_case_embeddings（双写）
  // ============================================================
  pgm.sql(`
    CREATE OR REPLACE FUNCTION sync_knowledge_to_fault_case()
    RETURNS TRIGGER AS $$
    DECLARE
      v_article RECORD;
      v_old_case_id VARCHAR;
    BEGIN
      -- 获取关联的文章信息
      SELECT * INTO v_article FROM knowledge_articles WHERE id = NEW.article_id;

      IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        -- 插入或更新到旧表
        INSERT INTO fault_case_embeddings (
          case_id,
          content,
          embedding,
          metadata,
          created_at
        ) VALUES (
          v_article.id,
          v_article.content_text,
          NEW.chunk_embedding,
          jsonb_build_object(
            'title', v_article.title,
            'category_l1', v_article.category_l1,
            'category_l2', v_article.category_l2,
            'applicable_models', v_article.applicable_models,
            'fault_type', v_article.fault_type,
            'status', CASE v_article.status WHEN 'verified' THEN 'approved' ELSE v_article.status::TEXT END,
            'confidence', CASE v_article.confidence WHEN 'high' THEN 'A' WHEN 'medium' THEN 'B' ELSE 'C' END
          ),
          COALESCE(NEW.created_at, NOW())
        )
        ON CONFLICT (case_id) DO UPDATE SET
          content = EXCLUDED.content,
          embedding = EXCLUDED.embedding,
          metadata = EXCLUDED.metadata,
          created_at = EXCLUDED.created_at;
      ELSIF TG_OP = 'DELETE' THEN
        -- 从旧表删除（先获取 article_id）
        SELECT id INTO v_old_case_id FROM knowledge_articles WHERE id = OLD.article_id;
        DELETE FROM fault_case_embeddings WHERE case_id = v_old_case_id;
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  // ============================================================
  // 3. 创建触发器：在 knowledge_chunks 变更时触发双写
  // ============================================================
  pgm.sql(`
    CREATE TRIGGER trigger_sync_to_fault_case
    AFTER INSERT OR UPDATE OR DELETE ON knowledge_chunks
    FOR EACH ROW
    WHEN (NEW.chunk_index = 0 OR OLD.chunk_index = 0)
    EXECUTE FUNCTION sync_knowledge_to_fault_case();
  `);

  // ============================================================
  // 4. 创建反向同步函数：旧表变更同步到新表（过渡期保护）
  // ============================================================
  pgm.sql(`
    CREATE OR REPLACE FUNCTION sync_fault_case_to_knowledge()
    RETURNS TRIGGER AS $$
    DECLARE
      v_new_id VARCHAR(30);
    BEGIN
      -- 映射 ID
      CASE NEW.case_id
        WHEN 'F001' THEN v_new_id := 'A10-02-001';
        WHEN 'F002' THEN v_new_id := 'A10-03-002';
        WHEN 'F003' THEN v_new_id := 'A10-04-001';
        WHEN 'F004' THEN v_new_id := 'A10-03-003';
        WHEN 'F005' THEN v_new_id := 'A10-06-001';
        ELSE v_new_id := CONCAT('A10-99-', LPAD(CAST(NEW.id AS VARCHAR), 6, '0'));
      END CASE;

      IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
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
        ) VALUES (
          v_new_id,
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
          NOW()
        )
        ON CONFLICT (id) DO UPDATE SET
          title = EXCLUDED.title,
          content_md = EXCLUDED.content_md,
          content_text = EXCLUDED.content_text,
          applicable_models = EXCLUDED.applicable_models,
          fault_type = EXCLUDED.fault_type,
          updated_at = NOW();

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
        ) VALUES (
          v_new_id,
          0,
          NEW.content,
          NEW.embedding,
          'paragraph',
          'fault_diagnosis'::chunk_strategy_type,
          NULL,
          NEW.created_at
        )
        ON CONFLICT DO NOTHING;

      ELSIF TG_OP = 'DELETE' THEN
        -- 从新表删除
        DELETE FROM knowledge_chunks WHERE article_id = v_new_id;
        DELETE FROM knowledge_articles WHERE id = v_new_id;
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  // ============================================================
  // 5. 创建反向触发器
  // ============================================================
  pgm.sql(`
    CREATE TRIGGER trigger_sync_to_knowledge
    AFTER INSERT OR UPDATE OR DELETE ON fault_case_embeddings
    FOR EACH ROW
    EXECUTE FUNCTION sync_fault_case_to_knowledge();
  `);
};

exports.down = (pgm) => {
  pgm.sql('DROP TRIGGER IF EXISTS trigger_sync_to_knowledge ON fault_case_embeddings');
  pgm.sql('DROP FUNCTION IF EXISTS sync_fault_case_to_knowledge');
  pgm.sql('DROP TRIGGER IF EXISTS trigger_sync_to_fault_case ON knowledge_chunks');
  pgm.sql('DROP FUNCTION IF EXISTS sync_knowledge_to_fault_case');
  pgm.sql('DROP VIEW IF EXISTS v1_fault_case_embeddings');
};
