-- ========================================
-- v2.1 知识库体系性能测试
-- ========================================

-- 测试计时
\timing on

\echo '========================================'
\echo '🚀 v2.1 Performance Test'
\echo '========================================'
\echo ''

-- ========================================
-- Test 1: 数据库健康检查
-- ========================================
\echo '🧪 Test 1: Database Health'
\echo '----------------------------------------'

SELECT 1;

-- 活跃连接数
SELECT 
  count(*) as active_connections,
  datname as database
FROM pg_stat_activity 
WHERE state = 'active'
GROUP BY datname;

\echo ''

-- ========================================
-- Test 2: v1 表查询
-- ========================================
\echo '🧪 Test 2: v1 Table Queries'
\echo '----------------------------------------'

-- 简单计数
SELECT COUNT(*) as v1_count FROM fault_case_embeddings;

-- 简单查询
SELECT case_id, LEFT(content, 50) as sample_content
FROM fault_case_embeddings 
LIMIT 1;

\echo ''

-- ========================================
-- Test 3: v2 表查询
-- ========================================
\echo '🧪 Test 3: v2 Table Queries'
\echo '----------------------------------------'

-- 知识文章计数
SELECT COUNT(*) as knowledge_articles_count FROM knowledge_articles;

-- 知识分块计数
SELECT COUNT(*) as knowledge_chunks_count FROM knowledge_chunks;

-- 简单知识文章查询
SELECT id, title, category_l1, layer, status
FROM knowledge_articles 
LIMIT 3;

-- JOIN查询
SELECT 
  ka.id,
  ka.title,
  kc.chunk_index,
  LEFT(kc.chunk_text, 30) as chunk_text
FROM knowledge_articles ka
JOIN knowledge_chunks kc ON ka.id = kc.article_id
WHERE ka.status = 'review'
LIMIT 5;

\echo ''

-- ========================================
-- Test 4: 治理字段查询
-- ========================================
\echo '🧪 Test 4: Governance Field Queries'
\echo '----------------------------------------'

-- 状态分布
SELECT 
  status,
  count(*) as count
FROM knowledge_articles
GROUP BY status
ORDER BY status;

-- 层级分布
SELECT 
  layer,
  count(*) as count
FROM knowledge_articles
GROUP BY layer
ORDER BY layer;

-- 置信度分布
SELECT 
  confidence,
  count(*) as count
FROM knowledge_articles
GROUP BY confidence
ORDER BY confidence;

\echo ''

-- ========================================
-- Test 5: 索引使用情况
-- ========================================
\echo '🧪 Test 5: Index Usage'
\echo '----------------------------------------'

SELECT 
  schemaname,
  tablename,
  indexname,
  idx_scan as scans,
  idx_tup_read as tuples_read,
  idx_tup_fetch as tuples_fetched
FROM pg_stat_user_indexes
WHERE tablename LIKE 'knowledge%' OR tablename = 'fault_case_embeddings'
ORDER BY tablename, indexname;

\echo ''

-- ========================================
-- Test 6: 向量检索测试
-- ========================================
\echo '🧪 Test 6: Vector Search'
\echo '----------------------------------------'

-- 注意：实际向量测试需要具体的向量数据
-- 这个测试验证表结构和索引存在
SELECT 
  'Vector column exists' as vector_test,
  'idx_chunks_embedding' as index_name,
  pg_size_pretty(pg_relation_size('idx_chunks_embedding')) as index_size;

\echo ''

-- ========================================
-- Test 7: v1 兼容视图查询
-- ========================================
\echo '🧪 Test 7: v1 Compatibility View'
\echo '----------------------------------------'

SELECT COUNT(*) as v1_view_count FROM v1_fault_case_embeddings;

SELECT id, case_id, LEFT(content, 50) as sample_content
FROM v1_fault_case_embeddings
LIMIT 1;

\echo ''

-- ========================================
-- Test 8: 表大小统计
-- ========================================
\echo '🧪 Test 8: Table Sizes'
\echo '----------------------------------------'

SELECT 
  relname AS table_name,
  pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
  pg_size_pretty(pg_relation_size(relid)) AS table_size,
  pg_size_pretty(pg_indexes_size(relid)) AS index_size,
  n_live_tup AS live_rows
FROM pg_stat_user_tables
WHERE relname LIKE 'knowledge%' OR relname = 'fault_case_embeddings'
ORDER BY pg_total_relation_size(relid) DESC;

\echo ''

-- ========================================
-- Summary
-- ========================================
\echo '========================================'
\echo '✅ TEST COMPLETED!'
\echo '========================================'

\timing off
