# DroneDoctor 工程问题排查与修复文档

> 面向对象：前端工程师、后端工程师、部署/运维工程师  
> 项目：`Xiao1804/drone-doctor`  
> 文档目的：把当前项目中已发现的高优先级问题整理成可执行的修复任务。  
> 审查方式：基于当前仓库代码进行静态审查，未包含完整本地运行、单元测试、接口压测和真实生产日志验证。

---

## 1. 项目当前状态概述

DroneDoctor 当前已经具备 MVP 雏形，主要模块包括：

- React + Vite 前端
- Node.js + Express 后端
- PostgreSQL + pgvector 生产数据库方案
- SQLite 本地开发 fallback
- Kimi / Qwen / Xiaomi Vision 等 AI 接口
- AI 诊断、交互式维修决策树、飞行日志分析、图片识别、埋点统计、免费次数限制
- 腾讯云 Docker Compose 部署方案

当前主要问题不是功能缺失，而是：

1. 生产部署链路存在阻断风险
2. 认证与权限存在安全隐患
3. 免费次数和登录态逻辑不一致
4. SQLite / PostgreSQL 双数据库兼容性不稳定
5. 快速诊断结果可能给出过度确定的维修结论
6. 前后端故障类型映射存在错位

---

## 2. 修复优先级定义

| 优先级 | 含义 | 处理建议 |
|---|---|---|
| P0 | 可能导致部署失败、安全风险、权限被抢、数据被篡改 | 立即修复 |
| P1 | 影响核心功能准确性、计数逻辑、诊断流程可信度 | 短期修复 |
| P2 | 影响工程质量、维护成本、产品可信度 | 排期修复 |

---

# P0 必须立即修复

## P0-1：后端 Docker 构建可能因 sharp 依赖缺失失败

### 相关文件

- `backend/Dockerfile`
- `backend/package.json`

### 问题描述

`backend/Dockerfile` 中存在 sharp 安装校验：

```dockerfile
RUN node -e "const s = require('sharp'); const vips = s.versions.vips || s.versions.libvips; console.log('[Dockerfile] sharp version:', s.versions.sharp, '| vips version:', vips); if (!vips) { console.error('[Dockerfile] ERROR: vips version not detected.'); process.exit(1); }"
```

但 `backend/package.json` 的 dependencies 中没有 `sharp`。

### 影响

Docker 构建后端镜像时会报错：

```text
Cannot find module 'sharp'
```

导致生产部署失败。

### 建议修复方案

优先采用方案 A。

#### 方案 A：删除 sharp 相关构建校验

当前图片识别逻辑主要是读取图片并转 base64，没有看到 sharp 实际处理链路。建议删除：

- Dockerfile 中 libvips 相关注释和依赖
- `RUN node -e "const s = require('sharp')..."` 校验命令

同时可简化系统依赖安装：

```dockerfile
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update \
    && apt-get install -y --no-install-recommends \
       python3 python3-pip make g++
```

#### 方案 B：如果后续确定需要 sharp，则补依赖

```bash
cd backend
npm install sharp
```

### 验收标准

```bash
docker compose --env-file .env.tencent -f docker-compose.tencent.yml build backend
```

应能正常完成构建。

---

## P0-2：第一个注册用户自动成为管理员，存在管理员账号被抢风险

### 相关文件

- `backend/src/services/userService.js`
- `TENCENT_DEPLOY.md`

### 问题描述

注册逻辑中，第一个注册用户会被设置为管理员：

```js
const userCount = await query('SELECT COUNT(*) as count FROM users');
const role = Number(userCount.rows[0].count) === 0 ? 'admin' : 'user';
```

生产部署文档也说明：

```text
The first registered user becomes admin because the production database starts empty.
```

### 影响

新部署环境数据库为空时，如果站点先被外部访问并注册，攻击者或无关用户会成为管理员。

### 建议修复方案

公开注册永远只创建普通用户：

```js
const role = 'user';
```

管理员账号采用以下方式之一创建：

#### 方案 A：管理员初始化脚本

新增脚本：

```text
backend/scripts/create-admin.js
```

通过命令行手动创建管理员：

```bash
node scripts/create-admin.js --email admin@example.com --username admin
```

#### 方案 B：通过环境变量指定管理员邮箱

`.env.tencent`：

```env
ADMIN_EMAIL=admin@example.com
```

注册时仅当 email 匹配 `ADMIN_EMAIL` 且当前无管理员时才赋予 admin。

### 推荐实现

优先使用方案 A，避免公网注册链路自动授予管理员权限。

### 验收标准

1. 空数据库启动后，任意用户注册均为 `user`
2. 管理员只能通过脚本或受控流程创建
3. `/api/user/all` 普通用户访问返回 403

---

## P0-3：JWT 存在默认密钥，生产环境不应允许启动

### 相关文件

- `backend/src/services/userService.js`
- `backend/src/services/freeUsageService.js`

### 问题描述

当前 JWT secret 有默认值：

```js
const JWT_SECRET = process.env.JWT_SECRET || 'drone-doctor-secret-key-2024';
```

`freeUsageService` 中也存在类似逻辑。

### 影响

如果生产环境忘记配置 `JWT_SECRET`，系统会使用代码中公开的默认密钥，存在 token 伪造风险。

### 建议修复方案

新增统一配置模块：

```text
backend/src/config.js
```

示例：

```js
function requireEnv(name) {
  const value = process.env[name];
  if (!value && process.env.NODE_ENV === 'production') {
    throw new Error(`${name} is required in production`);
  }
  return value;
}

const JWT_SECRET = requireEnv('JWT_SECRET') || 'dev-only-jwt-secret';

if (process.env.NODE_ENV === 'production' && JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters in production');
}

module.exports = {
  JWT_SECRET,
};
```

然后替换所有直接读取：

```js
const { JWT_SECRET } = require('../config');
```

### 验收标准

1. `NODE_ENV=production` 且未设置 `JWT_SECRET` 时，后端启动失败
2. `JWT_SECRET` 少于 32 位时，后端启动失败
3. 开发环境可使用 dev-only secret，但必须明显标注仅开发可用

---

## P0-4：用户资料更新接口字段名未做白名单校验

### 相关文件

- `backend/src/controllers/userController.js`
- `backend/src/services/userService.js`

### 问题描述

`updateUser` 直接遍历 `req.body`，将字段名转换后拼入 SQL：

```js
for (const [key, value] of Object.entries(updates)) {
  if (protectedFields.includes(key)) continue;
  const dbField = this.toSnakeCase(key);
  fields.push(`${dbField} = ?`);
  values.push(value);
}
```

虽然 value 使用了参数化查询，但字段名本身没有白名单。

### 影响

可能引入 SQL 注入风险或非预期字段写入风险。

### 建议修复方案

只允许更新固定字段。

示例：

```js
async updateUser(userId, updates) {
  const allowedFields = {
    username: 'username',
    email: 'email',
  };

  const fields = [];
  const values = [];

  for (const [key, value] of Object.entries(updates)) {
    const dbField = allowedFields[key];
    if (!dbField) continue;
    fields.push(`${dbField} = ?`);
    values.push(value);
  }

  if (fields.length === 0) {
    throw new Error('没有可更新的字段');
  }

  fields.push('updated_at = CURRENT_TIMESTAMP');
  values.push(userId);

  await run(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values);

  const result = await query('SELECT * FROM users WHERE id = ?', [userId]);
  if (result.rows.length === 0) throw new Error('用户不存在');
  return this.sanitizeUser(this.formatUser(result.rows[0]));
}
```

同时需要在 controller 层校验：

- email 格式
- username 长度
- username 允许字符

### 验收标准

1. 提交 `role: 'admin'` 不会改变用户角色
2. 提交未知字段不会进入 SQL
3. 提交恶意字段名不会导致 SQL 报错或执行异常 SQL

---

## P0-5：飞行日志上传限制前后不一致

### 相关文件

- `backend/src/middleware/flightLogUpload.js`
- `frontend/nginx.tencent.conf`

### 问题描述

后端允许上传 `.ulg` 文件最大 120MB：

```js
limits: {
  fileSize: 120 * 1024 * 1024,
}
```

但 Nginx 配置为：

```nginx
client_max_body_size 20m;
```

### 影响

大于 20MB 的飞行日志会被 Nginx 直接拒绝，无法到达后端。

### 建议修复方案

修改 `frontend/nginx.tencent.conf`：

```nginx
client_max_body_size 120m;
```

或留冗余：

```nginx
client_max_body_size 150m;
```

### 验收标准

1. 20MB 以上 `.ulg` 文件可以正常上传到后端
2. 超过 120MB 或 150MB 的文件仍被拒绝
3. 前端有明确错误提示

---

# P1 短期修复

## P1-1：诊断请求未统一携带 Authorization，导致登录态和次数逻辑不一致

### 相关文件

- `frontend/src/pages/HomePage.jsx`
- `frontend/src/utils/freeUsage.js`
- `backend/src/services/freeUsageService.js`

### 问题描述

前端获取免费次数时会携带 token：

```js
const headers = token ? { Authorization: `Bearer ${token}` } : {};
```

但提交诊断请求时：

```js
axios.post(apiUrl('/api/diagnosis/unified'), {...})
```

没有带 Authorization。

后端识别用户身份依赖 Authorization，如果没有 token，会 fallback 到 IP。

### 影响

可能出现：

- 前端显示登录用户剩余次数
- 后端按匿名 IP 扣次数
- 管理员无限次不生效
- 多用户共用出口 IP 时次数互相影响

### 建议修复方案

新增统一 API client：

```text
frontend/src/utils/apiClient.js
```

示例：

```js
import axios from 'axios';
import { apiUrl } from '../config/api';

export function getAuthHeaders() {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export const apiClient = {
  get(path, config = {}) {
    return axios.get(apiUrl(path), {
      ...config,
      headers: {
        ...getAuthHeaders(),
        ...(config.headers || {}),
      },
    });
  },

  post(path, data, config = {}) {
    return axios.post(apiUrl(path), data, {
      ...config,
      headers: {
        ...getAuthHeaders(),
        ...(config.headers || {}),
      },
    });
  },
};
```

替换诊断请求：

```js
const response = await apiClient.post('/api/diagnosis/unified', {
  mode: 'quick',
  input: symptom,
  deviceType: selectedDevice?.id,
  faultType: selectedFault?.id,
});
```

### 验收标准

1. 登录用户诊断按 userId 计数
2. 管理员诊断不消耗次数
3. 匿名用户仍按 IP 计数

---

## P1-2：免费次数检查与扣减不是原子操作，并发下可能绕过限制

### 相关文件

- `backend/src/middleware/freeUsageLimit.js`
- `backend/src/services/freeUsageService.js`
- `backend/src/routes/unifiedDiagnosis.js`
- `backend/src/routes/diagnosisAgent.js`

### 问题描述

当前流程是：

1. 中间件 `checkLimit`
2. 业务执行成功
3. `incrementUsage`

检查和扣减分离。

### 影响

并发请求可能同时通过检查，导致免费次数超用。

### 建议修复方案

新增原子方法：

```js
async function consumeFreeUsage(req) {
  const identifier = getIdentifier(req);
  const today = getToday();

  // PostgreSQL 推荐逻辑：
  // 1. insert if not exists
  // 2. update only when count < MAX_FREE_DAILY
  // 3. returning count
}
```

PostgreSQL 示例逻辑：

```sql
INSERT INTO free_usage (identifier, identifier_type, usage_date, count, created_at, updated_at)
VALUES ($1, $2, $3, 0, NOW(), NOW())
ON CONFLICT (identifier, usage_date) DO NOTHING;

UPDATE free_usage
SET count = count + 1, updated_at = NOW()
WHERE identifier = $1
  AND identifier_type = $2
  AND usage_date = $3
  AND count < $4
RETURNING count;
```

如果无返回行，表示次数已用完。

### 验收标准

1. 并发发起 10 个诊断请求，最多只有 3 个成功消耗
2. 超限请求返回 429
3. 管理员仍不消耗次数

---

## P1-3：统计接口混用 PostgreSQL 专属语法，本地 SQLite 会失败

### 相关文件

- `backend/src/routes/stats.js`
- `backend/src/db.js`

### 问题描述

项目默认：

- 有 `DATABASE_URL` 使用 PostgreSQL
- 无 `DATABASE_URL` 使用 SQLite

但 `stats.js` 中使用了 PostgreSQL 专属语法：

```sql
date_trunc('month', CURRENT_DATE)
data::text
```

SQLite 不支持这些语法。

### 影响

本地开发时统计接口失败，并返回 fallback 的 0，导致数据不可信。

### 建议修复方案

推荐方案：本地开发也统一使用 PostgreSQL。

新增：

```text
docker-compose.dev.yml
```

用于本地启动 PostgreSQL + pgvector。

如果继续保留 SQLite，则 `stats.js` 必须按 `isPostgres` 分支写两套 SQL。

示例：

```js
const { query, isPostgres } = require('../db');

const monthCondition = isPostgres
  ? "created_at >= date_trunc('month', CURRENT_DATE)"
  : "created_at >= date('now', 'start of month')";
```

JSON 查询也需要分支处理。

### 验收标准

1. 本地 SQLite 下 `/api/stats/similar-diagnoses` 不报错
2. PostgreSQL 下统计结果正常
3. catch 不再静默吞掉真实 SQL 错误，至少开发环境应输出明确错误

---

## P1-4：前端“无法起飞”映射到 flight，但后端 flight 没有决策树

### 相关文件

- `shared/enums.json`
- `data/fault-type-map.json`
- `data/decision-trees.json`

### 问题描述

前端：

```json
{ "id": "power", "label": "无法起飞", "backendId": "flight" }
```

后端 `flight` 类型：

```json
{
  "id": "flight",
  "label": "飞行异常",
  "trees": []
}
```

### 影响

用户选择“无法起飞”后，后端匹配到 `flight`，但没有对应决策树，导致 fallback。

这是核心场景，应优先修复。

### 建议修复方案

短期：

```json
"trees": ["tree-power-on"]
```

中期：新增专门决策树：

```text
tree-flight-abnormal
```

建议结构：

```text
无法起飞 / 飞行异常
├── 是否能正常开机？
│   ├── 否：进入电源问题流程
│   └── 是：继续
├── APP 是否有明确报错？
│   ├── 是：记录错误码，进入软件/传感器流程
│   └── 否：继续
├── GPS / 指南针 / IMU 是否正常？
├── 桨叶和电机是否正常？
├── 是否处于禁飞区或限高区？
└── 是否存在遥控/链路异常？
```

### 验收标准

1. 首页选择“无法起飞”后，不再直接 fallback
2. 至少进入一个可执行排故流程
3. 结果中包含下一步检查，而不是直接给最终原因

---

## P1-5：快速诊断使用预测路径，可能生成过度确定结论

### 相关文件

- `backend/src/services/unifiedDiagnosisService.js`

### 问题描述

快速诊断中，系统用 `predictPath` 自动找一条到 terminal 的路径，并生成诊断结果。

其中 question 节点预测逻辑倾向 yes 分支：

```js
// Prefer "yes" branch for prediction (optimistic path)
if (node.yes?.goto) queue.push({ nodeId: node.yes.goto, path: newPath });
```

### 影响

快速诊断没有真实用户检查反馈，却可能给出类似“已确认”的结论，维修可信度不足。

### 建议修复方案

快速诊断只输出：

- 可能故障方向
- 推荐排查入口
- 需要用户确认的关键问题
- 风险提示

不要输出 terminal conclusion。

示例返回结构：

```json
{
  "success": true,
  "mode": "quick",
  "intent": {},
  "matchedTree": {},
  "diagnosis": {
    "type": "preliminary",
    "possibleDirections": [],
    "firstChecks": [],
    "shouldStartInteractive": true,
    "confidence": 0.5
  }
}
```

交互式诊断完成后，再允许输出：

- 已确认结论
- 高可能原因
- 维修步骤
- 是否建议专业维修

### 验收标准

1. quick 模式不再返回 terminalNode 作为最终结论
2. quick 模式文案中明确“初步判断”
3. interactive 完成后才输出“已确认”类结论

---

## P1-6：图片识别接口公开，可能产生 API 成本风险

### 相关文件

- `backend/src/routes/image.js`
- `backend/src/controllers/imageController.js`
- `backend/src/services/imageRecognitionService.js`

### 问题描述

图片识别接口当前是公开接口：

```js
router.post('/recognize', upload.single('image'), imageController.recognizeImage);
router.post('/recognize/batch', upload.array('images', 5), imageController.recognizeBatch);
```

图片识别会调用外部模型 API。

### 影响

外部用户可以大量上传图片，消耗视觉模型 API 额度。

### 建议修复方案

至少加免费次数限制：

```js
const { freeUsageLimit } = require('../middleware/freeUsageLimit');

router.post('/recognize', freeUsageLimit, upload.single('image'), imageController.recognizeImage);
router.post('/recognize/batch', freeUsageLimit, upload.array('images', 5), imageController.recognizeBatch);
```

更稳妥：图片识别先只对登录用户或管理员开放。

### 验收标准

1. 匿名用户图片识别受次数限制
2. 超限返回 429
3. 未配置视觉 API key 时，接口返回明确错误，不影响其他服务

---

# P2 工程质量与产品可信度

## P2-1：README 技术版本与实际依赖不一致

### 相关文件

- `README.md`
- `frontend/package.json`

### 问题描述

README 写 React 19，但 `frontend/package.json` 实际为 React 18.2.0。

### 建议修复方案

README 改成：

```text
React 18 + Vite + Tailwind CSS
```

### 验收标准

README 技术栈与 package.json 一致。

---

## P2-2：“准确率 92%”缺乏评估依据，建议降低绝对表述

### 相关文件

- `README.md`

### 问题描述

README 中写有准确率 92%。如果没有公开测试集、评估脚本、样本数量和人工标注标准，这个数字不适合用于项目介绍。

### 建议修复方案

替换为：

```text
基于 129 条结构化故障案例进行语义检索 + 大模型辅助推理，已完成 MVP 验证，仍需真实维修案例持续校准。
```

### 验收标准

README 不再出现无评估依据的绝对准确率。

---

## P2-3：旧诊断接口要求模型输出 thinking 字段，不适合产品化

### 相关文件

- `backend/src/controllers/diagnosisController.js`

### 问题描述

旧诊断 prompt 要求模型返回 `thinking` 字段。产品中更需要的是证据链，而不是思维过程。

### 建议修复方案

将输出结构改为：

```json
{
  "evidence": [],
  "reasoningSummary": "",
  "uncertainties": [],
  "nextChecks": []
}
```

诊断结果页面展示：

- 已知信息
- 判断依据
- 不确定项
- 下一步检查

### 验收标准

1. API 不再要求 `thinking`
2. 前端展示证据链和不确定性
3. 用户能明确知道哪些是事实，哪些是推断

---

## P2-4：缺少自动化测试

### 相关文件

- `backend/package.json`
- `frontend/package.json`

### 问题描述

后端 package 中有 `test: jest`，但当前未看到测试用例。

### 建议补充测试

优先补以下单元测试：

```text
backend/tests/freeUsageService.test.js
backend/tests/userService.test.js
backend/tests/unifiedDiagnosisService.test.js
backend/tests/vectorService.test.js
```

重点测试：

- JWT 缺失时生产环境启动失败
- 普通用户不能访问 admin 接口
- 免费次数最多 3 次
- `flight` 故障能匹配到对应决策树
- quick 模式不输出最终维修结论

### 验收标准

```bash
cd backend
npm test
```

至少覆盖 P0/P1 修复项。

---

# 3. 建议的修复顺序

## 第一阶段：先保证安全和部署可用

1. 删除或修复 Dockerfile 中 sharp 校验
2. 禁止第一个注册用户自动成为 admin
3. 移除 JWT 默认生产密钥
4. 修复 updateUser 字段白名单
5. 修复 Nginx 飞行日志上传大小限制

## 第二阶段：修复核心业务链路

1. 前端统一 API client，所有请求自动携带 Authorization
2. 免费次数检查与扣减改为原子操作
3. `flight` 故障类型补充决策树
4. quick 模式改为初步判断，不直接输出最终结论
5. 图片识别接口加权限或次数限制

## 第三阶段：提高工程质量

1. 统一本地和生产数据库，建议全部使用 PostgreSQL
2. 修复 README 技术栈和准确率表述
3. 移除旧 prompt 中的 thinking 字段
4. 补充后端测试
5. 增加 CI：lint、test、docker build

---

# 4. 推荐任务拆分

## Issue 1：修复 Docker 构建失败风险

- 删除 sharp 校验或补充 sharp 依赖
- 本地验证 backend 镜像构建
- 更新部署文档

## Issue 2：收紧认证与管理员权限

- 禁止首个注册用户自动 admin
- 新增管理员创建脚本
- 生产环境强制 JWT_SECRET
- 普通用户访问 admin 接口测试

## Issue 3：修复用户资料更新接口

- updateUser 增加字段白名单
- controller 层增加 username/email 校验
- 添加恶意字段测试

## Issue 4：修复免费次数和登录态不一致

- 新增前端 apiClient
- 诊断、智能体、图片识别请求统一带 token
- 免费次数改成原子扣减

## Issue 5：修复无法起飞诊断流程

- `flight` 绑定决策树
- 新增或完善 `tree-flight-abnormal`
- quick 模式只输出初步判断
- 交互式完成后再输出结论

## Issue 6：修复统计接口数据库兼容问题

- 选择统一 PostgreSQL 或补 SQLite 分支
- 修复 `date_trunc` 和 `data::text`
- 增加统计接口测试

---

# 5. 工程验收清单

## 部署验收

```bash
docker compose --env-file .env.tencent -f docker-compose.tencent.yml build backend frontend
docker compose --env-file .env.tencent -f docker-compose.tencent.yml up -d
curl http://127.0.0.1/health
```

预期：

```json
{ "status": "ok" }
```

## 安全验收

- 生产环境不设置 JWT_SECRET 时，后端启动失败
- 首个公开注册用户不是 admin
- 普通用户不能访问 `/api/user/all`
- `PUT /api/user/me` 不能修改 role、id、password

## 免费次数验收

- 匿名用户每日最多 3 次
- 登录用户每日最多 3 次
- 管理员无限次
- 并发请求不能突破 3 次限制

## 诊断验收

- “无法起飞”不再 fallback
- quick 模式只给初步方向
- interactive 模式根据用户回答推进
- 最终结论区分：已确认事实 / 推断 / 不确定项 / 下一步检查

## 上传验收

- 20MB 以上 `.ulg` 能通过 Nginx 到达后端
- 超过限制时前端有明确提示
- 非 `.ulg` 文件被拒绝

---

# 6. 备注

当前项目已经有 MVP 基础，不建议继续堆新功能。下一步应优先完成：

```text
部署稳定性 → 权限安全 → 次数计费一致性 → 诊断可信度 → 测试覆盖
```

完成以上修复后，DroneDoctor 才适合作为作品集、试点产品或真实维修培训辅助工具展示。
