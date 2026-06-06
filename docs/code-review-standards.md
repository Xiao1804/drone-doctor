# DroneDoctor 代码审查标准与流程

> 版本：v1.0  
> 适用范围：DroneDoctor 全栈项目（React 前端 + Node.js 后端）  
> 目标：建立可执行的代码质量守门机制，减少线上 Bug，提升团队协作效率

---

## 目录

1. [代码审查流程](#1-代码审查流程)
2. [审查优先级定义](#2-审查优先级定义)
3. [后端审查清单（Node.js / Express）](#3-后端审查清单)
4. [前端审查清单（React / Vite）](#4-前端审查清单)
5. [安全专项审查](#5-安全专项审查)
6. [数据库与 SQL 审查](#6-数据库与-sql-审查)
7. [性能审查要点](#7-性能审查要点)
8. [审查工具与自动化](#8-审查工具与自动化)
9. [审查记录模板](#9-审查记录模板)

---

## 1. 代码审查流程

### 1.1 提交前自检（作者责任）

每位开发者在提交 PR 前必须完成以下自检：

| 检查项 | 工具/命令 | 通过标准 |
|--------|----------|----------|
| 代码可运行 | `npm run dev` / `npm start` | 无启动报错 |
| 核心功能验证 | 手动测试主要流程 | 主流程通顺 |
| Lint 检查 | `npx eslint .` | 0 errors，warnings 需说明 |
| 无明显安全漏洞 | 自查输入点 | 所有用户输入有校验/转义 |
| 无敏感信息提交 | `git diff` 复查 | 无密钥、密码、私钥 |
| 前端构建通过 | `npm run build` | 构建成功，无报错 |

### 1.2 PR 提交规范

```markdown
## 变更摘要
- 修复/新增/重构：简述改动目的
- 关联 Issue：#123（如有）

## 影响范围
- [ ] 前端页面
- [ ] API 接口
- [ ] 数据库结构
- [ ] 部署配置

## 自检清单
- [ ] 本地测试通过
- [ ] Lint 无错误
- [ ] 敏感信息已清理
- [ ] 变更文档已更新（如需要）

## 截图/录屏（前端变更必填）
```

### 1.3 审查流程

```
作者提交 PR → 分配审查者 → 审查者 24h 内反馈 →
作者修复 → 审查者确认 → 合并到 main
```

**规则：**
- 每个 PR 至少 **1 名审查者** Approval 才能合并
- 🔴 Blocker 必须全部修复后才能合并
- 🟡 Suggestion 原则上需修复，有重大分歧可讨论后决定
- 💭 Nit 由作者自行决定是否采纳
- 审查者应在 24 小时内给出首轮反馈

### 1.4 紧急情况快速通道

线上热修复允许先合并后补审查，但需在 24 小时内补充：
1. 事后审查记录
2. 回归测试验证
3. 问题根因分析

---

## 2. 审查优先级定义

### 🔴 Blocker（必须修复，阻塞合并）

- 安全漏洞（SQL 注入、XSS、认证绕过、敏感信息泄露）
- 数据丢失或损坏风险
- 核心功能回归（原有功能被破坏）
- 竞态条件、死锁
- 未处理的 Promise 异常导致进程崩溃

### 🟡 Suggestion（应当修复，不阻塞但需讨论）

- 缺少输入校验
- 命名不清晰、逻辑难以理解
- 缺少关键路径的测试覆盖
- 明显性能问题（N+1 查询、不必要的大对象创建）
- 代码重复可提取复用
- 错误处理不完整

### 💭 Nit（建议采纳，作者决定）

- 风格不一致（已有 linter 的除外）
- 轻微命名优化
- 注释补全
- 可替代方案参考

---

## 3. 后端审查清单（Node.js / Express）

### 3.1 路由与控制器

| 检查点 | 优先级 | 说明 |
|--------|--------|------|
| 路由参数校验 | 🔴 | 所有 `req.params` / `req.query` / `req.body` 需校验类型和范围 |
| 认证中间件正确使用 | 🔴 | 敏感接口必须使用 `authMiddleware`，公开接口用 `optionalAuthMiddleware` |
| 权限检查 | 🔴 | 管理员接口必须有 `adminMiddleware` |
| 错误统一处理 | 🟡 | 使用 `AppError` + `errorHandler`，禁止裸 `res.status(500).send()` |
| 路由挂载顺序 | 🟡 | 具体路由在前，通配路由在后；`/api/diagnosis/agent` 应在 `/api/diagnosis` 前 |

### 3.2 数据访问层

| 检查点 | 优先级 | 说明 |
|--------|--------|------|
| SQL 参数化 | 🔴 | 禁止字符串拼接 SQL，`?` / `$1` 占位符必须正确使用 |
| 向量查询安全 | 🔴 | pgvector 向量字面量需验证为数字数组，防止注入 |
| 数据库连接释放 | 🟡 | 查询后确保连接返回连接池（pg Pool 自动处理） |
| 事务使用 | 🟡 | 多步写操作必须包裹事务 |
| 查询结果校验 | 🟡 | 空结果需明确处理，禁止 `rows[0].xxx` 直接访问 |

### 3.3 异步与错误处理

| 检查点 | 优先级 | 说明 |
|--------|--------|------|
| Async/Await 一致性 | 🟡 | 优先 `async/await`，避免混用 `.then().catch()` 和 `try/catch` |
| 未捕获异常 | 🔴 | 所有 `async` 路由必须用 `try/catch` 或 `express-async-handler` |
| Promise 链 | 🟡 | 有 `.then()` 必须有 `.catch()` |
| 超时处理 | 🟡 | 外部 API 调用（Kimi、图片识别）必须设置 timeout |

### 3.4 日志与监控

| 检查点 | 优先级 | 说明 |
|--------|--------|------|
| 错误日志含上下文 | 🟡 | 日志需包含 `requestId`、用户 ID、关键参数 |
| 禁止日志敏感信息 | 🔴 | 密码、Token、密钥禁止出现在日志中 |
| 性能日志 | 💭 | 关键接口（诊断、向量检索）建议记录耗时 |

---

## 4. 前端审查清单（React / Vite）

### 4.1 组件与 JSX

| 检查点 | 优先级 | 说明 |
|--------|--------|------|
| 状态管理合理性 | 🟡 | 避免 props drilling 过深，考虑 Context 或状态提升 |
| 副作用清理 | 🟡 | `useEffect` 返回清理函数（事件监听、定时器、订阅） |
| 条件渲染空状态 | 🟡 | 列表/异步数据需处理 `loading`、`empty`、`error` 三态 |
| key 属性 | 🟡 | 列表渲染必须有稳定唯一的 `key`，禁止用 `index` |
| 内联函数优化 | 💭 | 事件处理函数建议抽离或使用 `useCallback`（大型列表） |

### 4.2 网络请求

| 检查点 | 优先级 | 说明 |
|--------|--------|------|
| 请求取消 | 🟡 | 组件卸载时取消未完成的请求（AbortController） |
| 错误处理 | 🟡 | 每个 API 调用需处理网络错误、超时、服务端错误 |
| 重复提交防护 | 🟡 | 表单提交需加 `loading` 状态或防抖 |
| 环境配置 | 🟡 | API 基础地址使用 `api.js` 配置，禁止硬编码 |

### 4.3 安全

| 检查点 | 优先级 | 说明 |
|--------|--------|------|
| XSS 防护 | 🔴 | `dangerouslySetInnerHTML` 必须配合 DOMPurify |
| 本地存储安全 | 🟡 | `localStorage` 不存敏感信息（Token 存 httpOnly cookie） |
| 外链安全 | 🟡 | `<a target="_blank">` 必须加 `rel="noopener noreferrer"` |

### 4.4 样式与响应式

| 检查点 | 优先级 | 说明 |
|--------|--------|------|
| Tailwind 类名组织 | 💭 | 按布局 → 尺寸 → 间距 → 颜色 → 状态顺序排列 |
| 响应式断点 | 🟡 | 移动端优先，`md:` `lg:` 断点需测试 |
| 暗色模式 | 💭 | 新增组件考虑 `dark:` 前缀（如项目后续支持） |

---

## 5. 安全专项审查

### 5.1 认证与授权

- [ ] JWT Token 有合理过期时间（建议 access 15min，refresh 7d）
- [ ] Token 刷新机制正确，旧 refresh token 应失效
- [ ] 密码使用 bcrypt 哈希（salt rounds >= 10）
- [ ] 敏感接口有双重校验（认证 + 权限）
- [ ] CORS `origin` 不能为 `*`，必须白名单控制

### 5.2 输入安全

- [ ] 所有用户输入经过校验（Joi / zod / express-validator）
- [ ] 文件上传限制类型和大小
- [ ] 文件名使用随机 ID 重命名，禁止原文件名直接存储
- [ ] 文件内容类型通过 `file-type` 等库二次校验（不只靠扩展名）

### 5.3 输出安全

- [ ] API 响应不暴露内部错误详情（堆栈、SQL、路径）
- [ ] 前端不渲染不可信 HTML
- [ ] 日志不记录敏感字段

---

## 6. 数据库与 SQL 审查

### 6.1 Schema 变更

| 检查点 | 优先级 |
|--------|--------|
| 新增表必须带索引 | 🟡 |
| 外键关联考虑 ON DELETE 行为 | 🟡 |
| 大表加索引使用 `CONCURRENTLY` | 🟡 |
| 字段类型选择合理（TEXT vs VARCHAR vs JSONB） | 💭 |

### 6.2 SQL 质量

| 反例 | 正例 | 优先级 |
|------|------|--------|
| `WHERE id = '${userId}'` | `WHERE id = $1` | 🔴 |
| `SELECT *` | 明确列出所需字段 | 💭 |
| 无 `LIMIT` 的查询 | 始终加 `LIMIT` + 分页 | 🟡 |
| N+1 循环查询 | JOIN + 批量查询 | 🟡 |

### 6.3 向量检索特殊注意

```javascript
// 🔴 危险：向量直接拼接
const sql = `SELECT * FROM embeddings WHERE embedding <=> '${vecStr}'::vector`;

// 🟡 可接受：向量内容经过正则校验确保纯数字
const vecStr = vectorToSql(embedding); // 内部校验 /^\[([\d.-]+,?)*\]$/
```

---

## 7. 性能审查要点

### 7.1 后端

- [ ] 数据库查询有 `EXPLAIN` 验证索引命中
- [ ] 外部 API 调用有缓存或降级方案
- [ ] 大文件处理使用流式（stream）而非全量读取
- [ ] Embedding 计算有并发控制，避免内存溢出

### 7.2 前端

- [ ] 图片使用懒加载（`loading="lazy"`）
- [ ] 大列表使用虚拟滚动（react-window）
- [ ] 路由级代码分割（React.lazy + Suspense）
- [ ] 第三方库按需引入（避免全量 lodash）

---

## 8. 审查工具与自动化

### 8.1 推荐配置（需项目初始化）

**后端 `.eslintrc.js`：**

```javascript
module.exports = {
  env: { node: true, es2022: true, jest: true },
  extends: ['eslint:recommended'],
  parserOptions: { ecmaVersion: 2022 },
  rules: {
    'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'no-console': ['warn', { allow: ['error', 'warn', 'info'] }],
    'eqeqeq': ['error', 'always'],
    'curly': ['error', 'all'],
    'no-throw-literal': 'error',
    'prefer-promise-reject-errors': 'error',
  },
};
```

**前端 `.eslintrc.js`：**

```javascript
module.exports = {
  env: { browser: true, es2022: true },
  extends: ['eslint:recommended', 'plugin:react/recommended', 'plugin:react-hooks/recommended'],
  parserOptions: { ecmaVersion: 2022, sourceType: 'module', ecmaFeatures: { jsx: true } },
  settings: { react: { version: 'detect' } },
  rules: {
    'react/prop-types': 'off',
    'react/react-in-jsx-scope': 'off',
    'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
  },
};
```

**Prettier 配置（前后端共用）：**

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "es5",
  "tabWidth": 2,
  "printWidth": 100
}
```

### 8.2 Git Hooks（husky + lint-staged）

```json
{
  "husky": {
    "hooks": {
      "pre-commit": "lint-staged"
    }
  },
  "lint-staged": {
    "*.{js,jsx}": ["eslint --fix", "prettier --write"]
  }
}
```

### 8.3 CI 流水线检查项

- [ ] `npm ci` 安装成功
- [ ] `npm run lint` 无错误
- [ ] `npm run build`（前端）成功
- [ ] `npm test` 全部通过
- [ ] 敏感信息扫描（git-secrets / truffleHog）

---

## 9. 审查记录模板

### 审查意见示例

```markdown
### PR #45：新增图片诊断功能

**总体评价**：功能完整，架构清晰，有 2 个安全点需要修复。

---

🔴 **Blocker: 文件类型校验不足**
`backend/src/middleware/upload.js:15`

当前仅通过 `multer` 的 `fileFilter` 校验扩展名，恶意用户可修改扩展名绕过。

**建议：**
- 上传后使用 `file-type` 库二次校验实际文件头
- 拒绝非图片 MIME 类型的文件

---

🔴 **Blocker: 图片路径拼接存在目录遍历风险**
`backend/src/controllers/imageController.js:42`

```javascript
const filePath = path.join(UPLOAD_DIR, req.params.filename);
```

`filename` 可能包含 `../`，导致访问任意文件。

**建议：**
```javascript
const safeName = path.basename(req.params.filename);
const filePath = path.join(UPLOAD_DIR, safeName);
```

---

🟡 **Suggestion: 缺少上传失败时的错误处理**
`backend/src/routes/image.js`

上传接口未处理磁盘满、文件过大等异常场景。

**建议：**
为 `multer` 配置 `limits`，并添加错误处理中间件。

---

💭 **Nit: 变量命名可更清晰**
`frontend/src/pages/ImageDiagnosisPage.jsx:23`

`const [data, setData] = useState(null)` 建议改为 `const [diagnosisResult, setDiagnosisResult]`。

---

**审查者**：@reviewer-name  
**日期**：2026-06-05  
**状态**：需修复后重新审查
```

---

## 附录：DroneDoctor 已知技术债务

| 问题 | 位置 | 优先级 | 建议修复方案 |
|------|------|--------|-------------|
| 无 ESLint/Prettier 配置 | 项目根目录 | 🟡 | 按第 8 节配置 |
| 无测试文件 | backend/ | 🟡 | 为诊断、认证、向量检索补单元测试 |
| pgvector 向量字面量直接拼接 | `vectorService.js` | 🔴 | 增加 `vectorToSql` 输入校验正则 |
| SQLite/PostgreSQL 双兼容增加复杂度 | `db.js` | 💭 | 考虑迁移工具（如 drizzle-orm） |
| 前端路由跳转缺少错误边界 | `App.jsx` | 🟡 | 添加 `ErrorBoundary` 组件 |
| 埋点失败静默吞错 | `tracking.js` | 💭 | 开发环境可加 `console.warn` |

---

*本文档由 Code Reviewer 专家制定，随项目演进定期更新。*
