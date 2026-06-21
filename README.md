# DroneDoctor - 无人机维修诊断需求验证版

**版本**：v1.3.0

**阶段**：需求验证

**线上入口**：https://wurenjiyisheng.com

DroneDoctor 当前用于验证一个问题：无人机维修学习者、维修人员和机主，是否需要一个能根据故障描述提供排查步骤的 AI 辅助工具。

## 当前用户路径

1. 用户添加维护者微信并说明实际问题。
2. 维护者免费发放一张 3 天兑换券。
3. 用户无需注册账号，直接在网页输入兑换券。
4. 浏览器获得限时体验通行证，可使用诊断功能。
5. 用户提交“有帮助 / 没帮助 / 看不懂”和实际故障结果。

普通账号、付费会员、个人中心和云端历史记录均不属于当前需求验证范围。账号登录仅用于管理员生成兑换券和查看反馈。

## 核心功能

- 结构化故障描述与快速诊断
- 交互式维修排查向导
- 故障案例和知识资料
- 图片辅助识别
- FCS-F8 ULog 飞行日志分析
- 匿名用户反馈
- 兑换券发放、激活和市场验证指标

维修建议只用于学习和排查辅助，不能替代专业检验、维修资质判断或放行飞行。

## 技术栈

| 层级 | 技术 |
|---|---|
| 前端 | React 18 + Vite 8 + Tailwind CSS |
| 后端 | Node.js 20 + Express |
| 数据库 | PostgreSQL 16 + pgvector；本地可回退 SQLite |
| AI | Kimi / Qwen 等兼容接口 + bge-small-zh-v1.5 本地向量模型 |
| 部署 | 腾讯云单服务器 + Docker Compose + Caddy |

仓库内曾记录过 50 个案例的内部评估结果，但目前没有可重复运行的公开评测集和评测脚本，因此不得把该结果当作已验证的对外准确率承诺。

## 本地运行

要求：

- Node.js 20.19 或更高兼容版本
- npm

后端：

```bash
cd backend
npm ci
cp .env.example .env
npm run dev
```

未设置 `DATABASE_URL` 时使用本地 SQLite。使用 PostgreSQL 时先执行：

```bash
cd backend
npm run migrate
npm run dev
```

前端：

```bash
cd frontend
npm ci
npm run dev
```

本地入口：

- 前端：http://localhost:5173
- 健康检查：http://localhost:3000/health
- 管理员登录：http://localhost:5173/admin/login

管理员通过受控脚本创建：

```bash
cd backend
node scripts/create-admin.js --username=admin --email=admin@example.com --password=replace-with-a-strong-password
```

## 验证

```bash
cd backend
npm run check:syntax
npm test -- --runInBand

cd ../frontend
npm run build
```

GitHub Actions 会在 `main` 和 Pull Request 上重复执行语法检查、后端测试、前端构建和 Docker Compose 配置检查。

## 数据库迁移

- PostgreSQL schema 由 `backend/migrations/` 管理。
- 生产容器启动时先执行迁移，再启动 API。
- 已应用迁移只能通过新增迁移向前修复，不允许修改历史迁移。
- 基线迁移禁止自动 `down`，避免误删全部业务数据。

详见 [数据库迁移指南](./docs/database-migration-guide.md)。

## 部署与恢复

生产部署、版本包、备份和恢复步骤见 [腾讯云部署指南](./TENCENT_DEPLOY.md)。

数据库每日备份会：

- 使用 PostgreSQL custom dump；
- 用 `pg_restore --list` 校验；
- 生成 SHA-256 校验文件；
- 默认保留 7 天；
- 可通过 `BACKUP_MIRROR_DIR` 写入另一个挂载盘或同步目录；
- 可通过 `BACKUP_FAILURE_COMMAND` 接入失败告警。

## 当前需求验证指标

管理员后台重点观察：

- 实际发放兑换券数
- 券码激活率
- 实际诊断人数
- 诊断开始与完成率
- 有帮助、没帮助、看不懂的反馈数量

这些数据用于决定是否继续投入，而不是证明产品已经找到市场。

执行方法见 [7 天需求验证计划](./docs/market-validation-plan-2026-06-21.md)，本次改造与验证结果见 [项目现状审计](./docs/project-compliance-audit-2026-06-21.md)。

## 当前不做

- 公开注册和普通用户账号
- 付费、订阅和复杂会员体系
- 维修预约、交易市场和社区
- 新增大功能

在获得足够真实维修案例和用户反馈前，优先改进诊断质量与使用流程。
