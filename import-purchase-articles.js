const fs = require('fs');
const path = require('path');

/**
 * 导入选购知识库文章（category_l1='purchase'）
 * 复用 import-v21-articles.js 的逻辑，指向 data/knowledge-articles/purchase/ 目录
 */
async function importPurchaseArticles() {
  console.log('🛒 导入选购知识库文章');
  console.log('================================');
  console.log('');

  const projectRoot = __dirname;
  const dataDir = path.resolve(projectRoot, 'data', 'knowledge-articles', 'purchase');

  // 路径边界校验：确保 dataDir 在项目根目录下
  if (!dataDir.startsWith(projectRoot + path.sep) && dataDir !== projectRoot) {
    console.error('❌ 错误: 解析出的目录越出项目根目录:', dataDir);
    process.exit(1);
  }

  if (!fs.existsSync(dataDir)) {
    console.error('❌ 错误: 选购文章目录不存在:', dataDir);
    process.exit(1);
  }

  // 只接受 .md 文件，用 basename 防止路径穿越
  const files = fs.readdirSync(dataDir)
    .filter(f => f.endsWith('.md'))
    .filter(f => path.basename(f) === f);

  console.log(`📂 发现 ${files.length} 篇选购文章`);
  console.log('');

  const db = require('./backend/src/db');

  let successCount = 0;
  let failCount = 0;

  for (const file of files) {
    const filePath = path.resolve(dataDir, path.basename(file));

    // 校验拼接后的路径仍在 dataDir 内
    if (!filePath.startsWith(dataDir + path.sep) && filePath !== dataDir) {
      console.error(`   ❌ 路径越界，跳过: ${file}`);
      failCount++;
      continue;
    }

    const content = fs.readFileSync(filePath, 'utf-8');

    try {
      const { frontmatter, content: body } = parseFrontmatter(content);
      const articleId = frontmatter.id || file.replace('.md', '');

      console.log(`📄 导入: ${articleId} - ${frontmatter.title || file}`);

      const existing = await db.query(
        'SELECT id FROM knowledge_articles WHERE id = $1',
        [articleId]
      );

      if (existing.rows.length > 0) {
        console.log(`   ⏭️  已存在，跳过`);
        continue;
      }

      await db.query(
        `INSERT INTO knowledge_articles (
          id, title, category_l1, category_l2, content_md, content_text,
          applicable_models, fault_type, difficulty, need_professional, tags,
          version, source_type, layer, status, confidence, evidence_type,
          risk_level, ai_generated, language, published_at, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $5, $6, $7, $8, $9, $10, 1, 'manual',
          $11, $12, $13, $14, $15, false, 'zh-CN', NOW(), NOW(), NOW())`,
        [
          articleId,
          frontmatter.title || articleId,
          frontmatter.category_l1 || 'purchase',
          frontmatter.category_l2 || '选购',
          body,
          JSON.stringify(frontmatter.applicable_models || []),
          frontmatter.fault_type || null,
          frontmatter.difficulty || 3,
          frontmatter.need_professional || false,
          JSON.stringify(frontmatter.tags || []),
          frontmatter.layer || 'verified',
          frontmatter.status || 'verified',
          frontmatter.confidence || 'high',
          frontmatter.evidence_type || 'mixed',
          frontmatter.risk_level || 'normal',
        ]
      );

      // 生成 chunks 和 embeddings
      const { chunkContent, generateEmbedding } = require('./backend/src/services/embeddingService');
      const chunks = chunkContent(body, 'knowledge');

      if (chunks.length > 0) {
        const chunkTexts = chunks.map(c => c.text);
        const embeddings = await generateEmbedding(chunkTexts);

        for (let i = 0; i < chunks.length; i++) {
          await db.query(
            `INSERT INTO knowledge_chunks (
              article_id, chunk_index, chunk_text, chunk_embedding, chunk_type,
              chunk_strategy, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
            [
              articleId,
              chunks[i].index,
              chunks[i].text,
              vectorToSql(embeddings[i]),
              chunks[i].type,
              chunks[i].strategy,
            ]
          );
        }

        console.log(`   ✅ 成功 (${chunks.length} chunks)`);
      }

      successCount++;
    } catch (err) {
      console.error(`   ❌ 失败: ${err.message}`);
      failCount++;
    }
  }

  console.log('');
  console.log('================================');
  console.log(`✅ 导入完成: ${successCount} 成功, ${failCount} 失败`);

  // 统计选购知识库
  const purchaseCount = await db.query("SELECT COUNT(*) FROM knowledge_articles WHERE category_l1 = 'purchase'");
  const purchaseChunks = await db.query(`
    SELECT COUNT(*) FROM knowledge_chunks kc
    JOIN knowledge_articles ka ON kc.article_id = ka.id
    WHERE ka.category_l1 = 'purchase'
  `);
  console.log(`📊 选购知识库: ${purchaseCount.rows[0].count} 篇文章, ${purchaseChunks.rows[0].count} chunks`);

  process.exit(0);
}

function parseFrontmatter(content) {
  const frontmatter = {};
  let body = content;

  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);

  if (match) {
    const yaml = match[1];
    body = match[2].trim();

    yaml.split('\n').forEach(line => {
      const colonIndex = line.indexOf(':');
      if (colonIndex > 0) {
        const key = line.slice(0, colonIndex).trim();
        let value = line.slice(colonIndex + 1).trim();

        if (value === 'true') value = true;
        else if (value === 'false') value = false;
        else if (value.match(/^\d+$/)) value = parseInt(value);
        else if (value.match(/^\[.*\]$/)) {
          try { value = JSON.parse(value); } catch (e) {}
        }

        frontmatter[key] = value;
      }
    });
  }

  return { frontmatter, body };
}

function vectorToSql(vector) {
  return '[' + vector.map(v => Number(v).toFixed(6)).join(',') + ']';
}

importPurchaseArticles().catch(err => {
  console.error('❌ 导入失败:', err);
  process.exit(1);
});
