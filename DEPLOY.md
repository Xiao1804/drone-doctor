# DroneDoctor 部署指南

## 架构

```
外网用户 → Vercel（前端） → Railway（后端 + 数据库）
```

---

## 方案一：Railway PostgreSQL（推荐）

Railway 免费计划提供 500MB PostgreSQL，数据持久化有保障。

### 1. 后端部署到 Railway

#### 1.1 准备工作

确保代码已提交到 GitHub（Railway 从 GitHub 部署）。

#### 1.2 创建 Railway 项目

1. 访问 https://railway.app/
2. 用 GitHub 登录
3. 点击 "New Project" → "Deploy from GitHub repo"
4. 选择你的 DroneDoctor 仓库

#### 1.3 添加 PostgreSQL 数据库

1. 在项目里点击 "New" → "Database" → "Add PostgreSQL"
2. 等待数据库创建完成
3. 点击 PostgreSQL 服务 → "Connect" 标签
4. 复制 `DATABASE_URL`（格式：`postgresql://...`）

#### 1.4 配置环境变量

在后端服务（不是 PostgreSQL）里添加环境变量：

```
DATABASE_URL=postgresql://...  （从上面复制的）
JWT_SECRET=你的随机字符串（至少32位）
KIMI_API_KEY=sk-...
QWEN_API_KEY=sk-...
NODE_ENV=production
PORT=3000
```

**注意**：`DATABASE_URL` 用 Railway 提供的，不要用本地的。

#### 1.5 修改后端适配 PostgreSQL

当前代码是 SQLite 版本，需要改回 PostgreSQL 语法：

1. 把 `backend/src/db.js` 改回 `pg` 版本（之前备份过）
2. 把 `backend/src/services/userService.js` 中的 `?` 占位符改为 `$1, $2...`
3. 把 `backend/src/services/historyService.js` 同样修改

或者更简单：直接切换分支 / 回滚到 PostgreSQL 版本。

#### 1.6 部署

1. Railway 会自动检测 `railway.toml` 并部署
2. 等待部署完成，获得公网 URL（如 `https://drone-doctor-api.up.railway.app`）

---

### 2. 前端部署到 Vercel

#### 2.1 准备环境变量文件

在前端目录创建 `.env.production`：

```env
VITE_API_BASE_URL=https://你的-railway-后端地址.up.railway.app
```

**注意**：不要把这个文件提交到 Git！添加到 `.gitignore`：

```
.env.production
```

#### 2.2 Vercel 部署

1. 访问 https://vercel.com/
2. 用 GitHub 登录
3. 点击 "Add New Project"
4. 选择 DroneDoctor 仓库
5. **Root Directory** 填 `frontend`
6. **Framework Preset** 选 `Vite`
7. **Build Command** 保持默认 `vite build`
8. **Output Directory** 保持默认 `dist`
9. **Environment Variables** 添加：`VITE_API_BASE_URL=https://你的-railway-地址.up.railway.app`
10. 点击 Deploy

#### 2.3 验证

部署完成后获得 Vercel 域名（如 `https://drone-doctor.vercel.app`），打开测试功能。

---

## 方案二：Railway + SQLite（简单但不持久）

如果嫌 PostgreSQL 麻烦，可以继续用 SQLite，但要接受**数据在容器重启后会丢失**。

适合：演示、测试、个人使用（用户不多）

### 部署步骤

1. 按上面的步骤部署后端到 Railway
2. 环境变量里**不要**设 `DATABASE_URL`，让 SQLite 用默认路径
3. 前端部署步骤相同
4. **风险**：每次重新部署 / 容器重启，用户数据清零

### 缓解方案

- 定期导出数据库备份
- 重要数据及时迁移到 PostgreSQL

---

## 方案三：Render（免费 PostgreSQL + 持久化）

Render 提供免费的 PostgreSQL（90天有效期，可续期），且文件系统有持久化。

1. 访问 https://render.com/
2. 创建 Web Service（后端）
3. 创建 PostgreSQL 数据库
4. 配置环境变量
5. 前端仍部署到 Vercel

---

## 环境变量清单

### 后端（Railway / Render）

| 变量名 | 说明 | 示例 |
|--------|------|------|
| `DATABASE_URL` | PostgreSQL 连接字符串 | `postgresql://user:pass@host:5432/db` |
| `JWT_SECRET` | JWT 签名密钥 | `your-secret-key-at-least-32-chars` |
| `KIMI_API_KEY` | Kimi AI API Key | `sk-kimi-...` |
| `QWEN_API_KEY` | 通义千问 API Key | `sk-sp-...` |
| `NODE_ENV` | 环境标识 | `production` |
| `PORT` | 服务端口 | `3000` |

### 前端（Vercel）

| 变量名 | 说明 | 示例 |
|--------|------|------|
| `VITE_API_BASE_URL` | 后端 API 地址 | `https://api.example.com` |

---

## 部署验证清单

- [ ] 后端健康检查 `/health` 返回 `{"status":"ok"}`
- [ ] 用户注册正常
- [ ] 用户登录正常
- [ ] AI 诊断正常
- [ ] 历史记录保存正常
- [ ] 前端页面加载正常
- [ ] 跨域请求无报错（浏览器 Network 面板）

---

## 回滚方案

如果部署失败，本地代码随时可以跑：

```bash
cd backend && npm run dev
cd frontend && npm run dev
```

---

## 费用预估

| 平台 | 服务 | 免费额度 | 超出后 |
|------|------|----------|--------|
| Vercel | 前端托管 | 100GB 带宽/月 | $0.40/GB |
| Railway | 后端 + PostgreSQL | $5/月 免费额度 | 按用量 |
| Render | Web Service | 750 小时/月 | $7/月起 |

**MVP 阶段**：Vercel + Railway 免费额度足够用。
