const { query } = require('./src/db');
const vectorService = require('./src/services/vectorService');

(async () => {
  try {
    console.log('Testing v1 compatibility...');
    
    // 测试v1表访问
    const v1Count = await query('SELECT COUNT(*) FROM fault_case_embeddings');
    console.log('OK - v1 fault_case_embeddings:', v1Count.rows[0].count);
    
    // 测试v1视图访问
    const v1ViewCount = await query('SELECT COUNT(*) FROM v1_fault_case_embeddings');
    console.log('OK - v1_fault_case_embeddings view:', v1ViewCount.rows[0].count);
    
    // 测试向量检索（v1表）
    console.log('Testing vector search...');
    const sampleEmbedding = Array(512).fill(0.5);
    const results = await vectorService.searchSimilarCases(sampleEmbedding, 3);
    console.log('OK - Vector search:', results.length, 'results');
    if (results.length > 0) {
      console.log('  Sample:', results[0].case_id, results[0].similarity);
    }
    
    // 测试v2表直接访问
    const v2Sample = await query('SELECT id, title, category_l1 FROM knowledge_articles LIMIT 2');
    console.log('OK - v2 knowledge_articles');
    v2Sample.rows.forEach(r => console.log('  -', r.id, r.title));
    
    // 测试v2分块表访问
    const v2ChunkSample = await query('SELECT id, article_id, chunk_index FROM knowledge_chunks LIMIT 2');
    console.log('OK - v2 knowledge_chunks');
    v2ChunkSample.rows.forEach(r => console.log('  -', r.id, r.article_id, r.chunk_index));
    
    // 测试v2新功能（分块）
    const { chunkContent, embedArticleChunks } = require('./src/services/embeddingService');
    console.log('OK - v2 embedding functions loaded');
    
    const testContent = '无人机无法起飞，电池电量充足，GPS信号正常。';
    const chunks = chunkContent(testContent, 'fault_diagnosis');
    console.log('OK - chunkContent works:', chunks.length, 'chunks');
    
    console.log('\n=== All tests passed! ===');
    
  } catch (e) {
    console.error('Error:', e.message);
    console.error(e.stack);
  }
})();
