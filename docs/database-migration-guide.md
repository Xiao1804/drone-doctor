# PostgreSQL 数据库迁移指南

工具：`node-pg-migrate`

目录：`backend/migrations/`

生产策略：向前迁移，不执行自动 destructive down

SQLite 仅用于本地开发，仍由 `backend/src/db.js` 初始化。

## 常用命令

```bash
cd backend

# 执行全部待应用迁移
npm run migrate

# 创建新迁移
npm run migrate:make -- add_feature_name

# 查看已应用记录
psql "$DATABASE_URL" -c "SELECT * FROM pgmigrations ORDER BY id;"
```

生产容器通过 `npm run start:production` 先执行 `npm run migrate`，成功后才启动 API。

## 已有数据库首次接入

只对已经由旧版 `initDatabase()` 建好 schema、但还没有 `pgmigrations` 表的数据库执行一次：

```bash
cd backend
npm run migrate:mark-baseline
npm run migrate
```

验证：

```bash
psql "$DATABASE_URL" -c "SELECT name, run_on FROM pgmigrations ORDER BY id;"
```

至少应包含：

```text
001_initial_schema
002_trial_access_and_feedback
```

## 全新数据库

```bash
cd backend
npm run migrate
```

迁移会按顺序创建核心表、反馈表、向量表和免注册体验字段。

## 新增变更

1. 创建新的迁移文件。
2. 编写向后兼容的 `up`。
3. 在测试 PostgreSQL 上执行。
4. 验证新代码可同时兼容迁移前后的短暂发布窗口。
5. 备份生产数据库。
6. 发布完整版本包；容器启动时自动迁移。
7. 检查 `/health`、迁移记录和核心业务。

## 安全规则

- 已应用到任何共享环境的迁移禁止修改。
- 不允许继续在 PostgreSQL 运行时代码中添加 `CREATE TABLE` 或 `ALTER TABLE`。
- 删除表、删除字段和不可逆数据改写必须分阶段执行。
- `001` 基线迁移禁止自动回滚，因为它会删除全部核心数据。
- `002` 包含反馈与已兑换通行证数据，同样采用 forward-only。
- 迁移失败时停止启动，不得绕过迁移直接运行新代码。
- 回退应用版本前必须确认旧代码能读取当前 schema。
- 数据问题优先使用经过审查的向前修复；需要恢复时使用已验证备份。

## 发布验证

```bash
curl https://wurenjiyisheng.com/health
```

响应必须同时满足：

- HTTP 200
- `status` 为 `ok`
- `database` 为 `ok`
- `version` 与本次发布一致
