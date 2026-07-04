const fs = require('fs');
const path = require('path');

/**
 * 导入首批20篇v2.1知识文章
 */
async function importV21Articles() {
  console.log('📚 导入首批20篇v2.1知识文章');
  console.log('================================');
  console.log('');

  // 检查目录
  const dataDir = path.join(__dirname, 'data', 'knowledge-articles', 'v2.1');
  if (!fs.existsSync(dataDir)) {
    console.error('❌ 错误: v2.1 文章目录不存在:', dataDir);
    process.exit(1);
  }

  // 读取所有文章文件
  const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.md'));
  console.log(`📂 发现 ${files.length} 篇文章`);
  console.log('');

  // 加载数据库模块
  const db = require('./backend/src/db');

  // 逐个导入文章
  let successCount = 0;
  let failCount = 0;

  for (const file of files) {
    const filePath = path.join(dataDir, file);
    const content = fs.readFileSync(filePath, 'utf-8');

    try {
      // 解析 frontmatter
      const { frontmatter, content: body } = parseFrontmatter(content);

      // 生成文章ID
      const articleId = frontmatter.id || file.replace('.md', '');

      console.log(`📄 导入: ${articleId} - ${frontmatter.title || file}`);

      // 检查文章是否已存在
      const existing = await db.query(
        'SELECT id FROM knowledge_articles WHERE id = $1',
        [articleId]
      );

      if (existing.rows.length > 0) {
        console.log(`   ⏭️  已存在，跳过`);
        continue;
      }

      // 插入文章
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
          frontmatter.category_l1 || 'A10',
          frontmatter.category_l2 || '未分类',
          body,
          JSON.stringify(frontmatter.applicable_models || []),
          frontmatter.fault_type || null,
          frontmatter.difficulty || 3,
          frontmatter.need_professional || false,
          JSON.stringify(frontmatter.tags || []),
          frontmatter.layer || 'atom',
          frontmatter.status || 'review',
          frontmatter.confidence || 'medium',
          frontmatter.evidence_type || 'mixed',
          frontmatter.risk_level || 'normal',
        ]
      );

      // 生成chunks和embeddings
      const { chunkContent, generateEmbedding, EMBEDDING_DIM } = require('./backend/src/services/embeddingService');
      const chunks = chunkContent(body, frontmatter.fault_type ? 'fault_diagnosis' : 'knowledge');

      if (chunks.length > 0) {
        const chunkTexts = chunks.map(c => c.text);
        const embeddings = await generateEmbedding(chunkTexts);

        // 插入chunks
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

  // 统计结果
  const result = await db.query('SELECT COUNT(*) FROM knowledge_articles');
  console.log(`📊 总文章数: ${result.rows[0].count}`);

  process.exit(0);
}

/**
 * 简单的 frontmatter 解析器
 */
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

        // 简单类型解析
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

/**
 * 向量转SQL格式
 */
function vectorToSql(vector) {
  return '[' + vector.map(v => Number(v).toFixed(6)).join(',') + ']';
}

importV21Articles().catch(err => {
  console.error('❌ 导入失败:', err);
  process.exit(1);
});
