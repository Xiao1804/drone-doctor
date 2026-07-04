# DroneDoctor 服务器迁移接入完成概述

## 做了什么
通过本地 SSH agent 登录服务器，完成代码更新、数据库迁移系统接入、后端重建与重启。

## 执行步骤与结果

### 1. 代码更新
- `git pull origin main` 成功拉取最新代码

### 2. 标记迁移基线
- 使用 `node:20-bookworm-slim` 临时容器加入 docker 网络 `drone-doctor_drone-doctor`
- 运行 `node migrations/mark-baseline-applied.js`
- ✅ 基线 `001_initial_schema.js` 已标记为已应用

### 3. 验证迁移状态
- 使用 `pgvector/pgvector:pg16` 容器连接 PostgreSQL
- 查询 `pgmigrations` 表确认记录存在：
  ```
  id |         name          |           run_on
  ---+-----------------------+----------------------------
   1 | 001_initial_schema.js | 2026-06-20 02:30:11.738542
  ```

### 4. 后端重建与重启
- `docker compose build backend` 成功
- `docker compose up -d backend` 成功重启
- 容器状态：`healthy`
- 后端日志确认：
  ```
  [DB] Migration system active. Baseline applied.
  [DB] Run `npm run migrate` to apply pending migrations.
  PostgreSQL database initialized successfully
  DroneDoctor API running on 0.0.0.0:3000
  ```

### 5. 文档修正
- 发现 `node-pg-migrate` 没有 `status` action
- 修正 `docs/database-migration-guide.md` 和 `backend/package.json`
- 推送到 main 并同步到服务器

## 后续
- 新数据库变更：使用 `npm run migrate:make -- <描述>` 创建迁移文件
- 部署时：先执行 `npm run migrate` 再重启服务
- 当前线上服务运行正常
