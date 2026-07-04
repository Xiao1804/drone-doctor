const { query } = require('./src/db');
const vectorService = require('./src/services/vectorService');

console.log('🚀 Starting v2.1 Performance Test...');
console.log('====================================');
console.log('');

(async () => {
  try {
    const results = {};
    
    // ========================================
    // Test 1: 数据库健康
    // ========================================
    console.log('🧪 Test 1: Database Health');
    console.log('----------------------------------------');
    const t1 = Date.now();
    await query('SELECT 1');
    const dbPing = Date.now() - t1;
    console.log(`  Ping: ${dbPing}ms`);
    results.dbPing = dbPing;
    
    // 检查连接数
    const pgConns = await query('SELECT count(*) FROM pg_stat_activity WHERE state = \'active\'');
    console.log(`  Active PG connections: ${pgConns.rows[0].count}`);
    console.log('  ✅ OK');
    console.log('');
    
    // ========================================
    // Test 2: v1 表查询
    // ========================================
    console.log('🧪 Test 2: v1 Table Queries');
    console.log('----------------------------------------');
    const t2 = Date.now();
    const v1Count = await query('SELECT COUNT(*) FROM fault_case_embeddings');
    const v1QueryTime = Date.now() - t2;
    console.log(`  COUNT query: ${v1QueryTime}ms`);
    console.log(`  Total records: ${v1Count.rows[0].count}`);
    results.v1QueryTime = v1QueryTime;
    
    const t2b = Date.now();
    const v1Sample = await query('SELECT case_id, content FROM fault_case_embeddings LIMIT 1');
    const v1SelectTime = Date.now() - t2b;
    console.log(`  SELECT LIMIT 1: ${v1SelectTime}ms`);
    results.v1SelectTime = v1SelectTime;
    console.log('  ✅ OK');
    console.log('');
    
    // ========================================
    // Test 3: v2 表查询
    // ========================================
    console.log('🧪 Test 3: v2 Table Queries');
    console.log('----------------------------------------');
    const t3 = Date.now();
    const v2Count = await query('SELECT COUNT(*) FROM knowledge_articles');
    const v2QueryTime = Date.now() - t3;
    console.log(`  COUNT knowledge_articles: ${v2QueryTime}ms`);
    console.log(`  Total records: ${v2Count.rows[0].count}`);
    results.v2QueryTime = v2QueryTime;
    
    const t3b = Date.now();
    const v2Sample = await query('SELECT id, title, layer, status FROM knowledge_articles LIMIT 1');
    const v2SelectTime = Date.now() - t3b;
    console.log(`  SELECT knowledge_articles: ${v2SelectTime}ms`);
    results.v2SelectTime = v2SelectTime;
    
    const t3c = Date.now();
    const v2Chunks = await query('SELECT COUNT(*) FROM knowledge_chunks');
    const v2ChunkTime = Date.now() - t3c;
    console.log(`  COUNT knowledge_chunks: ${v2ChunkTime}ms`);
    results.v2ChunkTime = v2ChunkTime;
    
    const t3d = Date.now();
    const v2Complex = await query(`
      SELECT ka.id, ka.title, kc.chunk_index
      FROM knowledge_articles ka
      JOIN knowledge_chunks kc ON ka.id = kc.article_id
      WHERE ka.status = 'review'
      LIMIT 10
    `);
    const v2JoinTime = Date.now() - t3d;
    console.log(`  JOIN query: ${v2JoinTime}ms`);
    results.v2JoinTime = v2JoinTime;
    console.log('  ✅ OK');
    console.log('');
    
    // ========================================
    // Test 4: 治理字段查询
    // ========================================
    console.log('🧪 Test 4: Governance Field Queries');
    console.log('----------------------------------------');
    const t4 = Date.now();
    const governanceStatus = await query(`
      SELECT status, count(*)
      FROM knowledge_articles
      GROUP BY status
      ORDER BY status
    `);
    const governanceTime = Date.now() - t4;
    console.log(`  Governance status query: ${governanceTime}ms`);
    console.log('  Status breakdown:');
    governanceStatus.rows.forEach(r => console.log(`    - ${r.status}: ${r.count}`));
    results.governanceTime = governanceTime;
    
    const t4b = Date.now();
    const governanceLayer = await query(`
      SELECT layer, count(*)
      FROM knowledge_articles
      GROUP BY layer
      ORDER BY layer
    `);
    const layerTime = Date.now() - t4b;
    console.log(`  Layer query: ${layerTime}ms`);
    console.log('  Layer breakdown:');
    governanceLayer.rows.forEach(r => console.log(`    - ${r.layer}: ${r.count}`));
    results.layerTime = layerTime;
    console.log('  ✅ OK');
    console.log('');
    
    // ========================================
    // Test 5: 向量检索
    // ========================================
    console.log('🧪 Test 5: Vector Search (v1 table)');
    console.log('----------------------------------------');
    const testEmbedding = Array(512).fill(0.5);
    const t5 = Date.now();
    const vectorResults = await vectorService.searchSimilarCases(testEmbedding, 5);
    const vectorTime = Date.now() - t5;
    console.log(`  Vector search (top 5): ${vectorTime}ms`);
    console.log(`  Results found: ${vectorResults.length}`);
    if (vectorResults.length > 0) {
      console.log(`  Top match: ${vectorResults[0].case_id} (${vectorResults[0].similarity.toFixed(4)})`);
    }
    results.vectorTime = vectorTime;
    results.vectorResults = vectorResults.length;
    console.log('  ✅ OK');
    console.log('');
    
    // ========================================
    // Test 6: 索引使用情况
    // ========================================
    console.log('🧪 Test 6: Index Usage');
    console.log('----------------------------------------');
    const idxUsage = await query(`
      SELECT 
        schemaname,
        tablename,
        indexname,
        idx_scan
      FROM pg_stat_user_indexes
      WHERE tablename LIKE 'knowledge%'
      ORDER BY tablename, indexname
    `);
    console.log('  Knowledge indexes (scans):');
    idxUsage.rows.forEach(r => {
      console.log(`    - ${r.indexname}: ${r.idx_scan} scans`);
    });
    console.log('  ✅ OK');
    console.log('');
    
    // ========================================
    // Test 7: v1 兼容视图查询
    // ========================================
    console.log('🧪 Test 7: v1 Compatibility View');
    console.log('----------------------------------------');
    const t7 = Date.now();
    const v1ViewCount = await query('SELECT COUNT(*) FROM v1_fault_case_embeddings');
    const v1ViewTime = Date.now() - t7;
    console.log(`  COUNT from v1 view: ${v1ViewTime}ms`);
    console.log(`  View records: ${v1ViewCount.rows[0].count}`);
    results.v1ViewTime = v1ViewTime;
    
    const t7b = Date.now();
    const v1ViewSample = await query('SELECT id, case_id FROM v1_fault_case_embeddings LIMIT 1');
    const v1ViewSelectTime = Date.now() - t7b;
    console.log(`  SELECT from v1 view: ${v1ViewSelectTime}ms`);
    results.v1ViewSelectTime = v1ViewSelectTime;
    console.log('  ✅ OK');
    console.log('');
    
    // ========================================
    // Test 8: 表大小统计
    // ========================================
    console.log('🧪 Test 8: Table Sizes');
    console.log('----------------------------------------');
    const tableSizes = await query(`
      SELECT 
        relname AS table_name,
        pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
        pg_size_pretty(pg_relation_size(relid)) AS table_size,
        pg_size_pretty(pg_indexes_size(relid)) AS index_size
      FROM pg_stat_user_tables
      WHERE relname LIKE 'knowledge%' OR relname = 'fault_case_embeddings'
      ORDER BY pg_total_relation_size(relid) DESC
    `);
    console.log('  Table sizes:');
    tableSizes.rows.forEach(r => {
      console.log(`    - ${r.table_name}: ${r.total_size} (table: ${r.table_size}, indexes: ${r.index_size})`);
    });
    console.log('  ✅ OK');
    console.log('');
    
    // ========================================
    // Summary
    // ========================================
    console.log('');
    console.log('🎉 PERFORMANCE TEST SUMMARY');
    console.log('========================================');
    console.log('');
    console.log('🏆 Key Metrics:');
    console.log(`  DB Ping:              ${results.dbPing}ms`);
    console.log(`  v1 COUNT Query:       ${results.v1QueryTime}ms`);
    console.log(`  v2 COUNT Query:       ${results.v2QueryTime}ms`);
    console.log(`  v2 JOIN Query:        ${results.v2JoinTime}ms`);
    console.log(`  Vector Search (top5): ${results.vectorTime}ms`);
    console.log(`  v1 View COUNT Query:  ${results.v1ViewTime}ms`);
    console.log('');
    console.log('📊 Data Distribution:');
    console.log(`  knowledge_articles:  ${v2Count.rows[0].count} records`);
    console.log(`  knowledge_chunks:    ${v2Chunks.rows[0].count} records`);
    console.log('');
    console.log('✅ ALL TESTS PASSED!');
    console.log('');
    console.log('========================================');
    console.log('Test completed at:', new Date().toISOString());
    
  } catch (error) {
    console.error('❌ Performance test failed:', error);
    process.exit(1);
  }
})();
