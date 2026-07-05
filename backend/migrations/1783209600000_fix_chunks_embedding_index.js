/**
 * 1783209600000_fix_chunks_embedding_index.js
 *
 * 修复 knowledge_chunks.chunk_embedding 向量索引（2026-07-05 排查定位）。
 *
 * 问题：
 * - 原迁移 1782505200000 在【数据灌入之前】以 IVFFlat(lists=100) 建索引，
 *   且 lists=100 远大于当前行数（129 行），大量 list 为空。
 * - IVFFlat 查询默认 probes=1，只搜最近的 1 个 list；当 query 落到空 list
 *   时返回 0 行（不是抛错），表现为此类 query（如“云台抖动”“电池保养”）
 *   检索为空，进而 /api/agent/chat 拿不到 sources、退化为无知识库接地的
 *   LLM 回答。能命中的 query（如“电机不转”）也只拿到 list 内最近、而非
 *   全局最近，相似度偏低。
 *
 * 修复：
 * - 删除退化的 IVFFlat 索引 idx_chunks_embedding。
 * - 改建 HNSW 索引：基于图，无空 list 问题，数据规模自适应；当前 129 行
 *   下 HNSW 与 seq scan 均可正确返回全局 top-K，未来知识库扩张也能承载。
 * - HNSW 需 pgvector ≥ 0.5.0（项目为 PostgreSQL 16 + pgvector，满足）。
 *
 * 回滚（down）：恢复原 IVFFlat 配置。注意原配置在当前数据规模下本身存在
 * 覆盖问题，回滚仅为应急退回，不建议长期保留。
 */

exports.up = (pgm) => {
  // 1. 删除退化的 IVFFlat 索引
  pgm.sql(`DROP INDEX IF EXISTS idx_chunks_embedding`);

  // 2. 改建 HNSW 索引（m / ef_construction 用 pgvector 默认推荐值）
  pgm.sql(`
    CREATE INDEX idx_chunks_embedding
    ON knowledge_chunks
    USING hnsw (chunk_embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64)
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP INDEX IF EXISTS idx_chunks_embedding`);

  // 恢复原 IVFFlat 配置（原配置本身在小数据集下有覆盖问题，仅供回滚）
  pgm.sql(`
    CREATE INDEX idx_chunks_embedding
    ON knowledge_chunks
    USING ivfflat (chunk_embedding vector_cosine_ops)
    WITH (lists = 100)
  `);
};
