# v2.1 知识库迁移指南

## 迁移总览

从 `fault_case_embeddings` 迁移到 `knowledge_articles` + `knowledge_chunks` 体系。

## 迁移步骤

### 1. 备份（执行前必须）

```bash
# 备份关键表
pg_dump -t fault_case_embeddings -F c -f backup_fault_case_embeddings_$(date +%Y%m%d).dump
pg_dump -t feedback -F c -f backup_feedback_$(date +%Y%m%d).dump
pg_dump -t diagnosis_sessions -F c -f backup_diagnosis_sessions_$(date +%Y%m%d).dump

# 记录迁移前数据量
psql -c "
SELECT 'fault_case_embeddings' AS table_name, COUNT(*) AS row_count FROM fault_case_embeddings
UNION ALL
SELECT 'feedback', COUNT(*) FROM feedback
UNION ALL
SELECT 'diagnosis_sessions', COUNT(*) FROM diagnosis_sessions;
" > migration_precheck_$(date +%Y%m%d).txt
```

### 2. 执行迁移

```bash
# 运行新迁移
npm run migrate
```

迁移包含两个新迁移文件：
- `1782505200000_knowledge_v21_migration.js`：创建新表并迁移数据
- `1782591600000_transitional_dual_write.js`：双写过渡期支持

### 3. 验证迁移结果

```sql
-- 检查迁移后数据量
SELECT 'knowledge_articles' AS table_name, COUNT(*) AS row_count FROM knowledge_articles
UNION ALL
SELECT 'knowledge_chunks', COUNT(*) FROM knowledge_chunks
UNION ALL
SELECT 'user_feedback', COUNT(*) FROM user_feedback;

-- 检查向量数据完整性
SELECT
  k.id,
  k.title,
  c.chunk_index,
  c.chunk_embedding IS NOT NULL AS has_embedding
FROM knowledge_articles k
LEFT JOIN knowledge_chunks c ON k.id = c.article_id
ORDER BY k.id;
```

### 4. 双写过渡期

迁移后进入双写过渡期，确保新旧系统兼容：
- 写入新表 `knowledge_articles` / `knowledge_chunks` 时自动同步到旧表 `fault_case_embeddings`
- 写入旧表时也自动同步到新表
- 提供兼容视图 `v1_fault_case_embeddings`，旧查询无需修改

### 5. 验证诊断功能

确保 `diagnosis_sessions` 继续正常工作。

### 6. 完全切换（可选，过渡期后）

确认新系统稳定后，可以：
- 移除双写触发器
- 废弃旧表

## 回滚预案

如果迁移出现问题，按以下步骤回滚：

### 1. 恢复备份

```bash
# 从备份恢复
pg_restore -d your_db -t fault_case_embeddings backup_fault_case_embeddings_YYYYMMDD.dump
pg_restore -d your_db -t feedback backup_feedback_YYYYMMDD.dump
pg_restore -d your_db -t diagnosis_sessions backup_diagnosis_sessions_YYYYMMDD.dump
```

### 2. 回滚迁移

```bash
# 回滚迁移（按相反顺序）
npm run migrate:down
```

## ID 映射表

| 旧 ID (case_id) | 新 ID | 说明 |
|----------------|-------|------|
| F001 | A10-02-001 | 无法起飞 |
| F002 | A10-03-002 | 飞行中异常 |
| F003 | A10-04-001 | 电机故障维修 |
| F004 | A10-03-003 | 飞行中异常 |
| F005 | A10-06-001 | 云台维修 |
| 其他 | A10-99-000001 | 自动编号 |

## 状态映射

| 旧状态 (v1.0) | 新状态 (v2.1) | 说明 |
|--------------|--------------|------|
| approved | review | 需重新确认（除非置信度 A） |
| approved + confidence A | verified | 直接确认 |
| draft | draft | 保持草稿 |
| pending | review | 待审核 |
| rejected | draft | [C-02] rejected 是动作 |

## 置信度映射

| 旧置信度 | 新置信度 |
|---------|---------|
| A | high |
| B | medium |
| C | low |

## embeddingService 更新

`embeddingService.js` 新增方法：

- `chunkContent(content, strategy)`：分块内容
- `embedArticleChunks(articleId, content, strategy, db)`：生成文章所有 chunk 的 embeddings

支持 v2.1 分块策略：
- `fault_diagnosis`：故障诊断文章
- `knowledge`：知识科普文章
- `api_doc`：API 文档
- `quiz`：题库

## 向量索引

v2.1 使用 IVFFlat 索引，lists = 100（适合 P0/P1 数据量）：

```sql
-- 当前索引
CREATE INDEX idx_chunks_embedding ON knowledge_chunks
  USING IVFFlat (chunk_embedding vector_cosine_ops) WITH (lists = 100);

-- P2/P3 后如果数据量 > 50k，可考虑切换 HNSW
CREATE INDEX idx_chunks_embedding_hnsw ON knowledge_chunks
  USING HNSW (chunk_embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
```

## 常见问题

### Q: 向量数据是否重新生成？
A: 不会。v2.1 迁移直接复用旧向量数据（维度兼容，都是 512），只有内容修改时才重算。

### Q: 旧查询是否需要修改？
A: 不需要。提供 `v1_fault_case_embeddings` 视图，双写过渡期自动兼容。

### Q: 如何验证迁移成功？
A: 检查数据量、验证诊断功能、抽查向量数据完整性。
