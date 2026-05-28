/**
 * 故障案例向量化入库脚本
 * 运行方式：node src/scripts/seed-embeddings.js
 */

const fs = require('fs').promises;
const path = require('path');
const { initEmbedder, generateEmbedding } = require('../services/embeddingService');
const { initVectorTables, batchInsertEmbeddings, clearEmbeddings, getEmbeddingStats } = require('../services/vectorService');
const { initDatabase } = require('../db');

const FAULT_CASES_FILE = path.join(__dirname, '../../data/fault-cases-enhanced.json');

/**
 * 从故障案例构建用于 embedding 的文本
 */
function buildEmbeddingText(faultCase) {
  const parts = [];

  // 故障类型和症状
  parts.push(`故障类型：${faultCase.faultType || ''}`);
  parts.push(`症状：${faultCase.symptom || ''}`);

  // 适用机型
  if (faultCase.applicableModels && faultCase.applicableModels.length > 0) {
    parts.push(`适用机型：${faultCase.applicableModels.join('、')}`);
  }

  // 可能原因
  if (faultCase.possibleCauses && faultCase.possibleCauses.length > 0) {
    const causes = faultCase.possibleCauses.map(c =>
      `${c.cause}（${c.probability || ''}）${c.description ? '：' + c.description : ''}`
    );
    parts.push(`可能原因：${causes.join('；')}`);
  }

  // 排查步骤（简化）
  if (faultCase.troubleshootingSteps && faultCase.troubleshootingSteps.length > 0) {
    const steps = faultCase.troubleshootingSteps.map(s => s.operation);
    parts.push(`排查步骤：${steps.join('、')}`);
  }

  // 关键词
  if (faultCase.keywords && faultCase.keywords.length > 0) {
    parts.push(`关键词：${faultCase.keywords.join('、')}`);
  }

  return parts.join('\n');
}

/**
 * 主函数
 */
async function main() {
  try {
    console.log('=== 故障案例向量化入库 ===');

    // 1. 初始化数据库
    await initDatabase();
    console.log('Database initialized');

    // 2. 初始化向量表
    await initVectorTables();
    console.log('Vector tables initialized');

    // 3. 加载 embedding 模型
    await initEmbedder();
    console.log('Embedding model loaded');

    // 4. 读取故障案例
    const data = await fs.readFile(FAULT_CASES_FILE, 'utf-8');
    const cases = JSON.parse(data);
    const approvedCases = cases.filter(c => c.reviewStatus === 'approved');
    console.log(`Loaded ${approvedCases.length} approved cases`);

    // 5. 构建文本
    const caseTexts = approvedCases.map(c => ({
      caseId: c.id,
      text: buildEmbeddingText(c),
      metadata: {
        faultType: c.faultType,
        symptom: c.symptom,
        keywords: c.keywords,
        applicableModels: c.applicableModels,
      }
    }));

    // 6. 批量生成 embedding（分批，每批 10 个，避免内存爆炸）
    const BATCH_SIZE = 10;
    const allEmbeddings = [];

    for (let i = 0; i < caseTexts.length; i += BATCH_SIZE) {
      const batch = caseTexts.slice(i, i + BATCH_SIZE);
      console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(caseTexts.length / BATCH_SIZE)}...`);

      const texts = batch.map(b => b.text);
      const embeddings = await generateEmbedding(texts);

      for (let j = 0; j < batch.length; j++) {
        allEmbeddings.push({
          caseId: batch[j].caseId,
          content: batch[j].text,
          embedding: embeddings[j],
          metadata: batch[j].metadata,
        });
      }
    }

    // 7. 清空旧数据并插入新数据
    await clearEmbeddings();
    console.log('Cleared old embeddings');

    // 分批插入（每批 20 条）
    const INSERT_BATCH = 20;
    for (let i = 0; i < allEmbeddings.length; i += INSERT_BATCH) {
      const batch = allEmbeddings.slice(i, i + INSERT_BATCH);
      await batchInsertEmbeddings(batch);
      console.log(`Inserted ${Math.min(i + INSERT_BATCH, allEmbeddings.length)}/${allEmbeddings.length}`);
    }

    // 8. 统计
    const stats = await getEmbeddingStats();
    console.log(`\nDone! Total embeddings in DB: ${stats.count}`);

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();
