/**
 * SOP 决策树知识文章 ingestion(自包含)
 *
 * 把 data/knowledge-articles/v2.1/sop-tree-*.md 导入 knowledge_articles + knowledge_chunks,
 * 为 /agent 的 RAG 检索提供 SOP 流程知识。
 *
 * 为什么不用项目根的 import-v21-articles.js:
 *   - 它不在 backend 镜像里(只在 git 根);
 *   - 它 require('./backend/src/db'),在容器内(WORKDIR=/app)路径会错(/app 下没有 backend/)。
 *   本脚本 require('../src/db') 与 '../src/services/embeddingService',容器内 /app/scripts → /app/src 正确。
 *
 * 容器内运行(WORKDIR=/app):
 *   docker exec drone-doctor-backend-1 node scripts/ingest-sop-trees.js
 *
 * 特性:
 *   - 只处理 sop-tree-*.md(前缀过滤),不动原 129 篇。
 *   - 幂等:已存在的文章按 id 查重跳过。
 *   - 复用 embeddingService.chunkContent(800 字 fault_diagnosis 策略)+ generateEmbedding(512 维 bge-small-zh)。
 *   - stdout 输出 summary JSON,诊断日志进 stderr。
 *
 * 回滚(硅翼硬要求,必须可逆):
 *   DELETE FROM knowledge_chunks  WHERE article_id LIKE 'sop-tree-%';
 *   DELETE FROM knowledge_articles WHERE id       LIKE 'sop-tree-%';
 */
'use strict';

// 诊断日志(db 加载、embedding 模型加载)进 stderr,stdout 只留 summary JSON
console.log = (...args) => console.error('[log]', ...args);

const fs = require('fs');
const path = require('path');
const db = require('../src/db');
const {
  chunkContent,
  generateEmbedding,
  vectorToSql,
} = require('../src/services/embeddingService');

const ARTICLES_DIR = path.join(__dirname, '..', 'data', 'knowledge-articles', 'v2.1');
const ID_PREFIX = 'sop-tree-';

// 与 import-v21-articles.js 一致的简单 frontmatter 解析器
function parseFrontmatter(content) {
  const frontmatter = {};
  let body = content;
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (match) {
    body = match[2].trim();
    match[1].split('\n').forEach((line) => {
      const colonIndex = line.indexOf(':');
      if (colonIndex > 0) {
        const key = line.slice(0, colonIndex).trim();
        let value = line.slice(colonIndex + 1).trim();
        if (value === 'true') value = true;
        else if (value === 'false') value = false;
        else if (value.match(/^\d+$/)) value = parseInt(value);
        else if (value.match(/^\[.*\]$/)) {
          try {
            value = JSON.parse(value);
          } catch (e) {
            /* 保持字符串 */
          }
        }
        frontmatter[key] = value;
      }
    });
  }
  return { frontmatter, body };
}

async function ingestOne(file) {
  const filePath = path.join(ARTICLES_DIR, file);
  const content = fs.readFileSync(filePath, 'utf-8');
  const { frontmatter, body } = parseFrontmatter(content);
  const articleId = frontmatter.id || file.replace(/\.md$/, '');

  if (!articleId.startsWith(ID_PREFIX)) {
    return { id: articleId, skipped: 'non-sop-tree' };
  }

  const existing = await db.query('SELECT id FROM knowledge_articles WHERE id = $1', [articleId]);
  if (existing.rows.length > 0) {
    return { id: articleId, existed: true };
  }

  await db.query(
    `INSERT INTO knowledge_articles (
      id, title, category_l1, category_l2, content_md, content_text,
      applicable_models, fault_type, difficulty, need_professional, tags,
      version, source_type, layer, status, confidence, evidence_type,
      risk_level, ai_generated, language, published_at, created_at, updated_at
    ) VALUES ($1,$2,$3,$4,$5,$5,$6,$7,$8,$9,$10,1,'manual',
      $11,$12,$13,$14,$15,false,'zh-CN',NOW(),NOW(),NOW())`,
    [
      articleId,
      frontmatter.title || articleId,
      frontmatter.category_l1 || 'A10',
      frontmatter.category_l2 || '未分类',
      body,
      JSON.stringify(frontmatter.applicable_models || []),
      frontmatter.fault_type || null,
      frontmatter.difficulty != null ? frontmatter.difficulty : 3,
      frontmatter.need_professional || false,
      JSON.stringify(frontmatter.tags || []),
      frontmatter.layer || 'atom',
      frontmatter.status || 'review',
      frontmatter.confidence || 'medium',
      frontmatter.evidence_type || 'mixed',
      frontmatter.risk_level || 'normal',
    ]
  );

  const strategy = frontmatter.fault_type ? 'fault_diagnosis' : 'knowledge';
  const chunks = chunkContent(body, strategy);
  if (chunks.length > 0) {
    const chunkTexts = chunks.map((c) => c.text);
    const embeddings = await generateEmbedding(chunkTexts); // 逐个生成,返回 512 维数组
    for (let i = 0; i < chunks.length; i++) {
      await db.query(
        `INSERT INTO knowledge_chunks (
          article_id, chunk_index, chunk_text, chunk_embedding, chunk_type,
          chunk_strategy, created_at
        ) VALUES ($1,$2,$3,$4,$5,$6,NOW())`,
        [
          articleId,
          chunks[i].index,
          chunks[i].text,
          vectorToSql(embeddings[i]), // 带维度校验的 pgvector 字面量
          chunks[i].type,
          chunks[i].strategy,
        ]
      );
    }
  }
  return { id: articleId, chunks: chunks.length };
}

async function main() {
  if (!fs.existsSync(ARTICLES_DIR)) {
    console.error('目录不存在:', ARTICLES_DIR);
    process.exit(1);
  }
  const files = fs
    .readdirSync(ARTICLES_DIR)
    .filter((f) => f.startsWith(ID_PREFIX) && f.endsWith('.md'));
  console.error(`发现 ${files.length} 篇 ${ID_PREFIX}*.md`);

  const processed = [];
  for (const f of files) {
    try {
      processed.push(await ingestOne(f));
    } catch (e) {
      console.error(`❌ ${f}: ${e.message}`);
      processed.push({ file: f, error: e.message });
    }
  }

  const sopStat = await db.query(
    'SELECT COUNT(*) AS n FROM knowledge_articles WHERE id LIKE $1',
    [ID_PREFIX + '%']
  );
  const totalStat = await db.query('SELECT COUNT(*) AS n FROM knowledge_articles');

  process.stdout.write(
    JSON.stringify(
      {
        ts: new Date().toISOString(),
        processed,
        sop_tree_articles: sopStat.rows[0].n,
        total_articles: totalStat.rows[0].n,
      },
      null,
      2
    ) + '\n'
  );
  process.exit(0);
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
