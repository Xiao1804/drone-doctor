# Render 全栈部署指南（历史参考，当前未验证）

> 当前生产环境使用腾讯云 Docker Compose。本文件没有经过 v1.3.0
> 免注册体验和自动迁移流程的线上验证。若重新启用 Render，必须先按
> `DEPLOY.md` 重新完成安全、迁移、健康检查和备份验收。

> 本指南用于在 Render 上部署 drone-doctor 作为 Railway 的长期免费替代方案。

---

## 前置条件

- 已注册 Render 账号：https://dashboard.render.com
- 已用 GitHub 登录 Render
- GitHub 仓库 `Xiao1804/drone-doctor` 代码已是最新版（含 `render.yaml`）

---

## 步骤 1：创建 PostgreSQL 数据库

1. 打开 [dashboard.render.com](https://dashboard.render.com)
2. 点击 **New +** → **PostgreSQL**
3. 填写：
   - **Name**: `drone-doctor-db`
   - **Region**: `Singapore`（离你最近）
   - **Plan**: `Free`
4. 点击 **Create Database**
5. 等待创建完成（约 30 秒）
6. 创建完成后，进入数据库详情页，复制 **Internal Database URL**（以 `postgresql://` 开头）

---

## 步骤 2：创建后端 Web Service（Task 19）

1. 在 Dashboard 点击 **New +** → **Web Service**
2. **Connect a GitHub repository** → 搜索并选择 `Xiao1804/drone-doctor`
3. 填写配置：

| 字段 | 值 |
|------|-----|
| **Name** | `drone-doctor-api` |
| **Region** | `Singapore` |
| **Branch** | `main` |
| **Runtime** | `Node` |
| **Build Command** | `cd backend && npm install` |
| **Start Command** | `cd backend && npm start` |
| **Plan** | `Free` |

4. 点击 **Advanced** 展开环境变量，添加以下变量：

| 变量名 | 值 | 说明 |
|--------|-----|------|
| `NODE_ENV` | `production` | 生产环境 |
| `DATABASE_URL` | `[粘贴步骤1复制的Internal Database URL]` | 数据库连接串 |
| `JWT_SECRET` | `drone-doctor-secret-2026-render` | JWT 签名密钥（可自己改） |
| `DEEPSEEK_API_KEY` | `[你的 DeepSeek API Key]` | 文字诊断必备 |
| `VISION_API_KEY` | `[你的 DashScope/Qwen API Key]` | 图片诊断必备 |
| `ALLOWED_ORIGINS` | `*` | 允许所有前端域名跨域 |

5. 点击 **Create Web Service**
6. 等待构建完成（约 2-3 分钟），看到 **🟢 Live** 即成功
7. 复制服务分配的域名：`https://drone-doctor-api-xxx.onrender.com`

---

## 步骤 3：创建前端 Static Site（Task 20）

1. 在 Dashboard 点击 **New +** → **Static Site**
2. 选择同一个仓库 `Xiao1804/drone-doctor`
3. 填写配置：

| 字段 | 值 |
|------|-----|
| **Name** | `drone-doctor-web` |
| **Region** | `Singapore` |
| **Branch** | `main` |
| **Build Command** | `cd frontend && npm install && npm run build` |
| **Publish Directory** | `frontend/dist` |
| **Plan** | `Free` |

4. 点击 **Advanced** 添加环境变量：

| 变量名 | 值 |
|--------|-----|
| `VITE_API_BASE_URL` | `https://drone-doctor-api-xxx.onrender.com`（替换为你的后端真实域名） |

5. 点击 **Create Static Site**
6. 等待构建完成，看到 **🟢 Live** 即成功
7. 复制前端域名：`https://drone-doctor-web-xxx.onrender.com`

---

## 步骤 4：验证部署（Task 21）

1. 浏览器访问 `https://drone-doctor-api-xxx.onrender.com/health`
   - 预期返回：`{"status":"ok"}`
2. 浏览器访问前端域名
   - 预期：正常打开首页，能注册/登录
3. 测试 AI 诊断对话
   - 预期：多轮追问，AI 自行判断何时给出诊断
4. 测试图片诊断
   - 预期：上传图片后能返回识别结果

---

## 常见问题

### Q1: 构建失败，提示找不到 `pg` 模块？
A: `package.json` 已包含 `pg`，确保 Build Command 是 `cd backend && npm install`（不是 `npm install`）。

### Q2: 前端请求后端报 CORS 错误？
A: 确保后端环境变量 `ALLOWED_ORIGINS=*`。代码已支持 `*.onrender.com` 正则匹配。

### Q3: 数据库连接失败？
A: Render 的 PostgreSQL 使用 SSL，代码已配置 `rejectUnauthorized: false`。检查 `DATABASE_URL` 是否复制正确。

### Q4: 图片诊断不可用？
A: 文字诊断需要 `DEEPSEEK_API_KEY`，图片诊断需要 `VISION_API_KEY`（DashScope/Qwen）。两者均未配置时，对应云端能力不可用，本地规则仍可继续提供有限降级结果。

---

## 部署完成后

把前端域名发给团队使用即可。Render 的 Free 计划：
- Web Service：部署后 15 分钟无请求会休眠，首次访问唤醒需 30 秒
- PostgreSQL：免费 90 天，之后需手动续期或升级
- Static Site：永久免费，无休眠

> 如需避免后端休眠，可配置 UptimeRobot 等免费服务每 10 分钟 ping 一次 `/health`。
