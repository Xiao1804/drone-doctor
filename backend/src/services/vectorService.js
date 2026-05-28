const { query, run, isPostgres } = require('../db');
const { vectorToSql, EMBEDDING_DIM } = require('./embeddingService');

/**
 * 向量数据库服务
 * 基于 PostgreSQL + pgvector 的语义检索
 */

/**
 * 初始化向量相关表和索引
 */
async function initVectorTables() {
  if (!isPostgres) {
    console.log('[Vector] SQLite does not support vector search, skipping vector table init');
    return;
  }

  try {
    // 启用 pgvector 扩展
    await query('CREATE EXTENSION IF NOT EXISTS vector');

    // 故障案例向量表
    await query(`
      CREATE TABLE IF NOT EXISTS fault_case_embeddings (
        id SERIAL PRIMARY KEY,
        case_id TEXT NOT NULL,
        content TEXT NOT NULL,
        embedding VECTOR(${EMBEDDING_DIM}),
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // 向量索引（IVFFlat，适合中等数据量）
    await query(`
      CREATE INDEX IF NOT EXISTS idx_fault_case_embedding
      ON fault_case_embeddings
      USING ivfflat (embedding vector_cosine_ops)
      WITH (lists = 10)
    `);

    // 普通索引
    await query(`CREATE INDEX IF NOT EXISTS idx_fault_case_case_id ON fault_case_embeddings(case_id)`);

    console.log('[Vector] Vector tables initialized');
  } catch (err) {
    console.error('[Vector] Failed to init vector tables:', err.message);
    throw err;
  }
}

/**
 * 批量插入案例向量
 * @param {Array<{caseId:string, content:string, embedding:number[], metadata?:object}>} items
 */
async function batchInsertEmbeddings(items) {
  if (!isPostgres) return;
  if (!items || items.length === 0) return;

  const values = [];
  const params = [];
  let paramIndex = 1;

  for (const item of items) {
    values.push(`($${paramIndex++}, $${paramIndex++}, $${paramIndex++}::vector, $${paramIndex++})`);
    params.push(
      item.caseId,
      item.content,
      vectorToSql(item.embedding),
      JSON.stringify(item.metadata || {})
    );
  }

  const sql = `
    INSERT INTO fault_case_embeddings (case_id, content, embedding, metadata)
    VALUES ${values.join(', ')}
    ON CONFLICT (case_id) DO UPDATE SET
      content = EXCLUDED.content,
      embedding = EXCLUDED.embedding,
      metadata = EXCLUDED.metadata,
      created_at = NOW()
  `;

  // 注意：pgvector 的向量字面量需要在 SQL 中直接写，不能作为参数
  // 所以我们需要拼接 SQL，但要小心 SQL 注入
  // 更安全的做法是用 to_sql 转换

  // 重新构造，使用字符串拼接向量
  const safeValues = items.map((item, i) => {
    const vecStr = vectorToSql(item.embedding);
    return `($${paramIndex++}, $${paramIndex++}, '${vecStr}'::vector, $${paramIndex++})`;
  });

  const safeParams = [];
  for (const item of items) {
    safeParams.push(item.caseId, item.content, JSON.stringify(item.metadata || {}));
  }

  const safeSql = `
    INSERT INTO fault_case_embeddings (case_id, content, embedding, metadata)
    VALUES ${safeValues.join(', ')}
    ON CONFLICT (case_id) DO UPDATE SET
      content = EXCLUDED.content,
      embedding = EXCLUDED.embedding,
      metadata = EXCLUDED.metadata,
      created_at = NOW()
  `;

  await query(safeSql, safeParams);
}

/**
 * 语义检索：查找最相似的案例
 * @param {number[]} queryEmbedding - 查询向量
 * @param {number} topK - 返回数量
 * @returns {Array<{caseId:string, content:string, similarity:number, metadata:object}>}
 */
async function searchSimilarCases(queryEmbedding, topK = 5) {
  if (!isPostgres) {
    console.warn('[Vector] SQLite does not support vector search');
    return [];
  }

  const vecStr = vectorToSql(queryEmbedding);

  const sql = `
    SELECT
      case_id,
      content,
      1 - (embedding <=> '${vecStr}'::vector) AS similarity,
      metadata
    FROM fault_case_embeddings
    ORDER BY embedding <=> '${vecStr}'::vector
    LIMIT $1
  `;

  const result = await query(sql, [topK]);
  return result.rows;
}

/**
 * 清空向量表
 */
async function clearEmbeddings() {
  if (!isPostgres) return;
  await query('DELETE FROM fault_case_embeddings');
}

/**
 * 获取向量表统计
 */
async function getEmbeddingStats() {
  if (!isPostgres) return { count: 0 };
  const result = await query('SELECT COUNT(*) as count FROM fault_case_embeddings');
  return { count: parseInt(result.rows[0].count, 10) };
}

module.exports = {
  initVectorTables,
  batchInsertEmbeddings,
  searchSimilarCases,
  clearEmbeddings,
  getEmbeddingStats,
};
