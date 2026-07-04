/**
 * v2.1 知识库检索服务
 * 基于 pgvector 向量检索 + v2.1 knowledge_articles 表
 */

const { query } = require('../db');
const vectorService = require('./vectorService');
const embeddingService = require('./embeddingService');

class KnowledgeRetrievalService {
  constructor() {
    this.EMBEDDING_DIM = 512;
  }

  /**
   * 检索相关知识
   * @param {string} query - 用户查询
   * @param {number} topK - 返回结果数
   * @param {object} filters - 过滤条件
   */
  async retrieve(query, topK = 5, filters = {}) {
    try {
      // 1. 生成查询向量
      const queryEmbedding = await embeddingService.generateEmbedding(query);

      // 2. 检索 v2.1 knowledge_chunks
      let chunks;
      try {
        chunks = await this._retrieveFromV2(queryEmbedding, topK, filters);
        console.log(`[KnowledgeRetrieval] Retrieved ${chunks.length} chunks from v2`);
      } catch (v2Error) {
        console.warn('[KnowledgeRetrieval] v2 retrieve failed, falling back to v1:', v2Error.message);
        chunks = await this._retrieveFromV1(queryEmbedding, topK);
      }

      // 3. 获取关联的文章信息
      const articles = await this._getArticlesForChunks(chunks);

      // 4. 合并结果
      const results = {
        query,
        chunks,
        articles,
        sources: chunks.length > 0 ? 'v2.1' : 'v1',
      };

      return results;
    } catch (error) {
      console.error('[KnowledgeRetrieval] Error:', error);
      return { query, chunks: [], articles: [], error: error.message };
    }
  }

  /**
   * 从 v2.1 knowledge_chunks 检索
   */
  async _retrieveFromV2(queryEmbedding, topK, filters = {}) {
    const vecStr = embeddingService.vectorToSql(queryEmbedding);

    let whereClause = '';
    const params = [];

    if (filters.category_l1) {
      whereClause += ' AND ka.category_l1 = $1';
      params.push(filters.category_l1);
    }
    if (filters.layer) {
      whereClause += ' AND ka.layer = $2';
      params.push(filters.layer);
    }
    if (filters.status) {
      whereClause += ' AND ka.status = $3';
      params.push(filters.status);
    }
    if (filters.confidence) {
      whereClause += ' AND ka.confidence = $4';
      params.push(filters.confidence);
    }

    const sql = `
      SELECT 
        kc.id,
        kc.article_id,
        kc.chunk_index,
        kc.chunk_text,
        kc.chunk_type,
        kc.chunk_strategy,
        1 - (kc.chunk_embedding <=> '${vecStr}'::vector) AS similarity,
        ka.title,
        ka.category_l1,
        ka.category_l2,
        ka.layer,
        ka.status,
        ka.confidence
      FROM knowledge_chunks kc
      JOIN knowledge_articles ka ON kc.article_id = ka.id
      WHERE true
        ${whereClause}
      ORDER BY kc.chunk_embedding <=> '${vecStr}'::vector
      LIMIT $${params.length + 1}
    `;

    params.push(topK);

    const result = await query(sql, params);
    return result.rows;
  }

  /**
   * 从 v1 fault_case_embeddings 检索（fallback）
   */
  async _retrieveFromV1(queryEmbedding, topK) {
    return await vectorService.searchSimilarCases(queryEmbedding, topK);
  }

  /**
   * 获取 chunk 对应的完整文章
   */
  async _getArticlesForChunks(chunks) {
    if (chunks.length === 0) return [];

    const articleIds = [...new Set(chunks.map(c => c.article_id || c.case_id))];

    if (articleIds.length === 0) return [];

    const placeholders = articleIds.map((_, i) => `$${i + 1}`).join(',');

    const result = await query(
      `SELECT * FROM knowledge_articles WHERE id IN (${placeholders})`,
      articleIds
    );

    return result.rows;
  }

  /**
   * 按知识文章检索（非向量）
   */
  async getArticlesByIds(ids) {
    if (!ids || ids.length === 0) return [];

    const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');

    const result = await query(
      `SELECT * FROM knowledge_articles WHERE id IN (${placeholders})`,
      ids
    );

    return result.rows;
  }

  /**
   * 按分类获取文章列表
   */
  async getArticlesByCategory(categoryL1, categoryL2 = null, limit = 20) {
    let sql = `
      SELECT * FROM knowledge_articles
      WHERE category_l1 = $1
    `;
    const params = [categoryL1];

    if (categoryL2) {
      sql += ` AND category_l2 = $2`;
      params.push(categoryL2);
      sql += ` LIMIT $3`;
      params.push(limit);
    } else {
      sql += ` LIMIT $2`;
      params.push(limit);
    }

    const result = await query(sql, params);
    return result.rows;
  }

  /**
   * 获取统计信息
   */
  async getStats() {
    const [articlesCount, chunksCount, categories] = await Promise.all([
      query('SELECT COUNT(*) FROM knowledge_articles'),
      query('SELECT COUNT(*) FROM knowledge_chunks'),
      query(`
        SELECT category_l1, COUNT(*) 
        FROM knowledge_articles 
        GROUP BY category_l1 
        ORDER BY COUNT(*) DESC
      `),
    ]);

    return {
      articlesCount: articlesCount.rows[0].count,
      chunksCount: chunksCount.rows[0].count,
      categories: categories.rows,
    };
  }
}

module.exports = new KnowledgeRetrievalService();
