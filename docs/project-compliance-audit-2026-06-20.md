# DroneDoctor 项目规范符合性检查报告

> 检查依据：`C:\Users\xmh\Documents\AI编程\04-项目实战\开发规范\项目开发规范与日志回滚框架.md`
> 检查时间：2026-06-20
> 检查范围：文档、Git、测试、日志、发布回滚方案
> 检查者：WorkBuddy

---

## 一、总体结论

DroneDoctor 已具备基础的项目文档、版本控制、部署和备份能力，但距离规范中的“可验证、可追溯、可回滚”基线仍有明显缺口。主要问题集中在：**缺少 CHANGELOG/CONTRIBUTING、无版本标签、无 Lint/Format 工具、日志非结构化、回滚脚本不可追溯、数据库变更无版本化迁移**。

---

## 二、分项检查

### 1. 项目文档与开发规范基线

| 文档 | 状态 | 说明 |
|------|------|------|
| `README.md` | ✅ 存在 | 目标、技术栈、启动、部署说明较完整；但版本号与 Git 标签未对齐 |
| `AGENTS.md` | ⚠️ 存在但不足 | 仅有项目事实、内容安全、题库交接；缺少开发约束、分支策略、验收标准、回滚要求 |
| `CONTRIBUTING.md` | ❌ 缺失 | 无分支/提交/PR/合并流程说明 |
| `CHANGELOG.md` | ❌ 缺失 | 无版本级变更记录（根目录无；node_modules 内大量无关文件） |
| 发布与回滚说明 | ⚠️ 部分存在 | `TENCENT_DEPLOY.md` 较详细；但 `update-server.sh` 硬编码 commit，未与版本标签关联 |
| 代码审查标准 | ✅ 存在 | `docs/code-review-standards.md`、`docs/code-review-checklist.md` 已建立 |

**关键发现：**

- 审查标准要求提交前运行 `npx eslint .` 和 `npm run lint`，但项目根和前后端均无 ESLint/Prettier 配置，标准无法落地。
- README 写的“后端目录 `db/schema.sql`”实际已不存在，数据库 schema 全部内联在 `backend/src/db.js` 的 `initDatabase()` 中。

---

### 2. Git 状态与版本控制实践

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 分支模型 | ⚠️ 基本可用 | 仅本地 `main`，远程有多个 feature/fix 分支；无分支策略文档 |
| 提交粒度 | ✅ 较好 | 近期提交多为小功能/修复，语义较清晰（feat/fix/chore/docs） |
| 未提交改动 | ⚠️ 存在 | 未跟踪目录 `需求/`，需确认是否应加入 `.gitignore` 或提交 |
| Git 标签 | ❌ 无 | `git tag --list` 为空，发布版本无法对应到具体标签 |
| 密钥泄露 | ✅ 未发现 | 搜索 `backend/src` 和 `frontend/src` 未找到硬编码 API Key/密码/Token |
| `.gitignore` | ✅ 较全 | 已排除 env、node_modules、.workbuddy、日志、SQLite 等 |

**关键发现：**

- 无 Git 标签意味着“回滚到上一稳定版本”只能凭 commit hash 或记忆，风险高。
- 服务器更新脚本 `update-server.sh` 硬编码 `COMMIT_HASH="ad548e0"` 且只下载部分文件，无法完整还原某次发布。

---

### 3. 测试与自动验证现状

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 后端测试框架 | ✅ Jest 已配置 | `backend/package.json` 有 `"test": "jest"` |
| 后端测试覆盖 | ⚠️ 极低 | 仅 `backend/tests/securityRoutes.test.js` 一个文件，24 个测试用例 |
| 前端测试 | ❌ 无 | `frontend/package.json` 无测试脚本，无测试文件 |
| Lint / Format | ❌ 无 | 无 ESLint、Prettier、Biome 等配置 |
| CI/CD | ❌ 无 | 无 GitHub Actions / 其他 CI 配置 |
| 构建验证 | ✅ 通过 | `npm run build`（前端）成功；`npm test`（后端）24/24 通过 |

**关键发现：**

- 审查清单要求 `npm run lint` 无 error，但项目里没有 lint 脚本，标准流于形式。
- 测试主要集中在安全路由，缺少业务核心流程（诊断、决策树、支付/券码、向量检索）的自动化测试。

---

### 4. 日志与监控方案

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 结构化日志 | ❌ 无 | 未使用 Winston/Pino/Bunyan 等结构化日志库 |
| 日志级别 | ⚠️ 部分有 | 代码中使用 `console.log/warn/error`，但无统一级别控制 |
| 请求追踪 ID | ✅ 已支持 | `errorHandler` 生成 `requestId` 并返回给客户端 |
| 敏感信息过滤 | ⚠️ 部分有 | 错误响应中 5xx 隐藏详情；但日志中仍可能打印完整 `err` 对象或请求体 |
| 日志轮转 | ✅ Docker 层已配 | `docker-compose.tencent.yml` 限制每个容器 3 个 10MB 日志文件 |
| 指标与告警 | ❌ 无 | 无 Prometheus/Cloud Monitor/Sentry 等监控告警 |
| 前端日志 | ⚠️ 有 console | 多个页面/组件有 `console.log`，生产环境会暴露调试信息 |

**关键发现：**

- 后端大量依赖 `console.*`，无法按环境控制级别，也难以集中收集和检索。
- 事件埋点写入 `events` 表，属于业务埋点而非系统日志，不能替代错误追踪。

---

### 5. 发布、备份与回滚方案

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 部署文档 | ✅ 较详细 | `TENCENT_DEPLOY.md` 覆盖服务器准备、配置、启动、更新、备份、SSH 加固 |
| Docker 构建 | ✅ 可用 | 前后端 Dockerfile 和 docker-compose 配置完整 |
| 健康检查 | ✅ 已配 | 后端 `/health`、Docker healthcheck、Caddy 代理 |
| 数据库备份 | ✅ 已配脚本 | `ops/backup/backup-db.sh` 使用 `pg_dump` + `pg_restore --list` 校验 |
| 备份保留策略 | ✅ 已配 | 默认保留 7 天 |
| 数据库迁移 | ❌ 无版本化 | `initDatabase()` 使用 `CREATE TABLE IF NOT EXISTS` 和 `ADD COLUMN IF NOT EXISTS`，无迁移文件/版本记录 |
| 回滚预案 | ⚠️ 不完整 | `TENCENT_DEPLOY.md` 有恢复示例，但无明确的触发条件、负责人、验证步骤 |
| 版本化发布 | ❌ 无 | 无 Git 标签、无发布产物保留、无版本号与 commit 的对应关系 |
| 恢复演练 | ⚠️ 文档有 | `TENCENT_DEPLOY.md` 提供临时数据库恢复演练命令，但未记录是否实际执行 |
| SSH 加固 | ✅ 已配 | `ops/ssh/00-drone-doctor-hardening.conf` 禁用密码登录 |

**关键发现：**

- 数据库变更采用“幂等 CREATE/ALTER”方式，长期维护会产生隐性依赖顺序问题，且无法回滚到某个历史 schema 状态。
- 回滚操作依赖手动执行 Docker 命令和 pg_restore，没有一键回滚脚本，也没有定义“什么情况下必须回滚”。

---

## 三、问题清单（按优先级排列）

### 🔴 P0 — 必须在下次发布前解决

1. **无版本标签与发布记录**
   - 风险：无法确定线上运行的是哪个代码版本，回滚无锚点。
   - 动作：为当前线上稳定版本打 `v1.x.x` 标签；后续每次发布打标签并写 `CHANGELOG.md`。

2. **数据库变更无版本化迁移**
   - 风险：`db.js` 中幂等 DDL 长期累积，新环境/回滚/schema 冲突风险高。
   - 动作：引入 `node-pg-migrate` / `umzug` / 手写迁移文件，按序号管理 schema 变更；新建表/字段走迁移文件，不再在 `initDatabase()` 中追加。

3. **服务器更新脚本硬编码且不完整**
   - 风险：`update-server.sh` 只下载部分文件，commit hash 过期后会导致发布不一致。
   - 动作：改为基于 Git 标签/完整仓库更新；或至少改为读取参数传入 commit/tag，并校验所有变更文件清单。

### 🟡 P1 — 应尽快补齐

4. **缺少 CONTRIBUTING.md 和分支策略**
   - 动作：补写 `CONTRIBUTING.md`，明确分支命名、PR 模板、合并前检查、代码审查人要求。

5. **无 Lint / Format 工具**
   - 动作：前后端分别配置 ESLint + Prettier（或 Biome），并在 `package.json` 添加 `lint` / `lint:fix` / `format` 脚本；与 `code-review-standards.md` 对齐。

6. **测试覆盖严重不足**
   - 动作：为核心流程补充单元/集成测试（诊断服务、券码激活、决策树执行、向量检索）；前端至少配置 Vitest 并覆盖关键工具函数。

7. **日志非结构化**
   - 动作：后端引入 Pino/Winston，输出 JSON 格式日志，包含时间、级别、版本、requestId；生产环境关闭 `console.log`；前端生产构建移除或降级 console。

### 💭 P2 — 持续改进

8. **AGENTS.md 内容单薄**
   - 动作：扩展为项目开发规范，包含禁止事项、验收标准、密钥管理、数据库变更流程、回滚触发条件。

9. **无 CI/CD 与自动化检查**
   - 动作：配置 GitHub Actions，在 PR 时运行 lint、test、build。

10. **缺少监控告警**
    - 动作：接入腾讯云监控或 Sentry，对 5xx 错误率、API 延迟、磁盘/内存/备份失败设置告警。

---

## 四、治理建议

| 优先级 | 建议 | 预期收益 | 负责人建议 |
|--------|------|----------|------------|
| P0 | 建立版本标签 + CHANGELOG | 发布可追溯、回滚有锚点 | 维护者 |
| P0 | 引入数据库迁移工具 | schema 变更有序、可回滚 | 后端 |
| P0 | 重写 `update-server.sh` 为基于 tag 的完整更新 | 发布一致、可重复 | 运维 |
| P1 | 配置 ESLint + Prettier 并接入 CI | 代码风格一致、减少低级错误 | 全栈 |
| P1 | 补充核心流程测试 | 降低回归风险 | 后端/前端 |
| P1 | 引入结构化日志 | 排查效率提升、支持集中化监控 | 后端 |
| P2 | 完善 AGENTS.md 为开发规范 | 新人/Agent 开发有章可循 | 维护者 |
| P2 | 接入监控告警 | 故障早发现、早止血 | 运维 |

---

## 五、可立即执行的基线动作

1. **清理未跟踪文件**
   ```bash
   git status
   # 确认 需求/ 目录是否需要加入 .gitignore 或提交
   ```

2. **为当前稳定版本打标签**
   ```bash
   git tag -a v1.2.0 -m "Release v1.2.0 - 行为干预 P0 + 券码会员系统"
   git push origin v1.2.0
   ```

3. **创建 CHANGELOG.md 模板**
   ```markdown
   # Changelog

   ## [Unreleased]

   ## [1.2.0] - 2026-06-20
   ### Added
   - 3 天体验券码系统
   - 行为干预 P0 全局诊断次数指示器
   ### Security
   - 案例/事件接口认证与限速
   - 登录接口限流
   ```

4. **添加 lint 脚本（后端示例）**
   ```bash
   cd backend
   npm install -D eslint prettier eslint-config-prettier
   npx eslint --init
   # 在 package.json 中添加 "lint": "eslint src tests"
   ```

5. **评估数据库迁移方案**
   - 推荐：`node-pg-migrate`（PostgreSQL）或 `umzug`（跨 SQLite/Postgres）。
   - 第一步：将当前 `initDatabase()` 中的 DDL 导出为 `migrations/001_initial_schema.sql`。

---

## 六、剩余风险

- **回滚能力未经验证**：虽然有备份脚本和恢复命令，但没有记录最近一次恢复演练时间；建议每季度执行一次。
- **单点部署**：当前为单服务器 Docker Compose，无多可用区/多实例容灾；对 MVP 阶段可接受，但需在用户量增长前规划。
- **密钥管理依赖 `.env.tencent`**：文件未入仓，但服务器上多人操作时存在泄露风险；长期应考虑腾讯云 Secrets Manager 或类似方案。

---

*报告生成时间：2026-06-20 10:xx*  
*下次复查建议：完成 P0 项后进行一次复查。*
