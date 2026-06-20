# 数据库迁移工具使用指南

> 工具：[node-pg-migrate](https://github.com/salsita/node-pg-migrate)
> 迁移目录：`backend/migrations/`
> 适用范围：PostgreSQL（生产环境）
> SQLite（本地开发）仍使用 `initDatabase()` 中的内联 DDL，不走迁移系统。

---

## 快速参考

```bash
cd backend

# 查看待执行迁移
npm run migrate:status

# 执行迁移（线上环境）
npm run migrate

# 执行迁移（本地开发，需设置 DATABASE_URL）
npm run migrate:dev

# 创建新迁移文件
npm run migrate:make -- add_new_table

# 回滚上一次迁移
npm run migrate:undo

# 标记基线已应用（仅用于已有数据库的首次接入）
npm run migrate:mark-baseline
```

---

## 首次接入（已有线上数据库）

如果数据库已经通过 `initDatabase()` 创建了所有表，按以下步骤接入迁移系统：

```bash
# 1. 在服务器上执行（标记基线迁移为已应用，不实际执行 DDL）
cd /root/drone-doctor/backend
node migrations/mark-baseline-applied.js

# 2. 验证状态
npm run migrate:status
# 应显示 001_initial_schema.js 为已应用

# 3. 后续新增的迁移会正常执行
npm run migrate
```

---

## 首次部署（全新数据库）

```bash
# 直接运行迁移，会创建所有表
cd backend
npm run migrate
```

---

## 新增数据库变更的标准流程

### 1. 创建迁移文件

```bash
cd backend
npm run migrate:make -- add_feedback_table
```

这会在 `migrations/` 目录下生成类似 `002_add_feedback_table.js` 的文件。

### 2. 编写迁移内容

```javascript
exports.up = (pgm) => {
  pgm.createTable('feedback', {
    id: { type: 'SERIAL', primaryKey: true },
    user_id: { type: 'TEXT', notNull: true },
    content: { type: 'TEXT', notNull: true },
    created_at: { type: 'TIMESTAMP', default: pgm.func('NOW()') },
  });
};

exports.down = (pgm) => {
  pgm.dropTable('feedback');
};
```

### 3. 本地测试

```bash
# 设置本地 PostgreSQL 的 DATABASE_URL
export DATABASE_URL="postgresql://user:pass@localhost:5432/dronedoctor"

# 执行迁移
npm run migrate:dev

# 回滚测试
node-pg-migrate --migrations-dir migrations down
```

### 4. 提交并部署

```bash
git add backend/migrations/002_add_feedback_table.js
git commit -m "feat(db): add feedback table migration"
git push origin main

# 在服务器上执行
cd /root/drone-doctor/backend
npm run migrate
```

---

## 迁移文件命名规则

```
001_initial_schema.js          # 基线（v1.2.0 时的完整 schema）
002_add_xxx.js                 # 按序号递增
003_modify_yyy_column.js
004_add_zzz_index.js
```

---

## 与 db.js 的关系

`db.js` 的 `initDatabase()` 函数在 PostgreSQL 环境下会检查 `pgmigrations` 表：

- **存在** → 迁移系统已激活，`initDatabase()` 不再执行 DDL，只初始化向量表
- **不存在** → 回退到 `_legacyPostgresInit()`（幂等 DDL），并在控制台输出警告

一旦执行了 `npm run migrate:mark-baseline`，`pgmigrations` 表就会创建，后续所有 schema 变更都通过迁移文件管理。

---

## 注意事项

1. **迁移文件一旦提交并应用到生产环境，不要修改**——只能新增迁移来修正
2. **破坏性操作（DROP COLUMN、DROP TABLE）必须分多步**：先发布兼容旧 schema 的代码 → 确认无回滚需求 → 再执行破坏性迁移
3. **数据迁移（UPDATE/INSERT）和 schema 迁移分开**，避免单次迁移太大
4. **每次迁移都要写 `down` 函数**，确保可回滚
5. **pgvector 扩展和向量表由 `vectorService.js` 管理**，不纳入迁移系统（因为 SQLite 不支持）
6. **SQLite 路径不变**——本地开发继续用 `initDatabase()` 的 SQLite 分支
