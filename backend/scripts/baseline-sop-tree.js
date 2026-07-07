/**
 * SOP 决策树 RAG 基线测试脚本
 *
 * 用途:把 decision-trees.json 转成的 sop-tree-* 知识文章 ingest 进 knowledge_articles
 * 之前/之后各跑一次,对比同一组固定问题的向量检索召回是否变好。
 *
 * 运行(容器内,WORKDIR=/app):
 *   docker exec drone-doctor-backend-1 node scripts/baseline-sop-tree.js
 *
 * 输出:JSON(标准输出),含每个 query 的 top-K chunks(article_id / 相似度 / 70 字预览)
 * 与命中的文章列表。sources 字段 'v2.1' 表示命中 v2.1 知识库,'v1' 表示回退到旧 fault_case 表。
 *
 * 不烧 LLM token:只调 knowledgeRetrievalService.retrieve(向量检索),不调 agentService.chat。
 */
'use strict';

// 把诊断日志(db/embedding/retrieve 模块加载与调用时的 console.log)重定向到 stderr,
// 保证 stdout 只输出最终 JSON,便于 diff BEFORE/AFTER。必须在所有 require 之前。
console.log = (...args) => console.error('[diag]', ...args);

const retrieval = require('../src/services/knowledgeRetrievalService');

// 5 个固定问题,刻意覆盖 5 棵决策树 + 1 个 how-to(导出飞行日志)
const QUERIES = [
  '怎么导出飞行日志',
  '无人机无法开机怎么排查',
  '云台卡住转不动怎么办',
  '电池鼓包怎么处理',
  '链路测试报错怎么排查',
];

const TOP_K = 5;

(async () => {
  const results = [];
  for (const query of QUERIES) {
    try {
      const r = await retrieval.retrieve(query, TOP_K);
      results.push({
        query,
        source_flag: r.sources, // 'v2.1' | 'v1'
        chunk_count: (r.chunks || []).length,
        chunks: (r.chunks || []).map((c) => ({
          article_id: c.article_id,
          category_l2: c.category_l2,
          similarity: c.similarity != null ? Number(c.similarity).toFixed(3) : null,
          preview: String(c.chunk_text || '')
            .replace(/\s+/g, ' ')
            .slice(0, 70),
        })),
        articles: (r.articles || []).map((a) => ({
          id: a.id,
          title: a.title,
          category_l2: a.category_l2,
        })),
      });
    } catch (e) {
      results.push({ query, error: e.message });
    }
  }

  const payload = {
    ts: new Date().toISOString(),
    top_k: TOP_K,
    query_count: QUERIES.length,
    results,
  };

  process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
  process.exit(0);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
