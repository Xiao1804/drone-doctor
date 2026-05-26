# DroneDoctor 上线指南：Vercel + Railway

本项目采用前后端分离部署：

- 前端：Vercel，Root Directory 选择 `frontend`
- 后端：Railway，Root Directory 选择 `backend`
- 数据库：Railway PostgreSQL

## 1. 部署后端到 Railway

1. 将代码推送到 GitHub。
2. 在 Railway 新建项目，选择 `Deploy from GitHub repo`。
3. 服务设置里把 `Root Directory` 设为 `backend`。
4. 添加一个 PostgreSQL 数据库。
5. 在后端服务里配置环境变量：

```env
NODE_ENV=production
JWT_SECRET=replace-with-a-random-string-at-least-32-chars
DATABASE_URL=${{Postgres.DATABASE_URL}}
ALLOWED_ORIGINS=https://your-vercel-app.vercel.app
QWEN_API_KEY=your_qwen_api_key
KIMI_API_KEY=your_kimi_api_key
```

可选变量：

```env
QWEN_API_BASE=https://dashscope.aliyuncs.com/compatible-mode/v1
QWEN_MODEL=qwen-plus
QWEN_VISION_MODEL=qwen-vl-plus
KIMI_API_BASE=https://api.moonshot.cn/v1
KIMI_MODEL=moonshot-v1-8k
BAIDU_API_KEY=your_baidu_api_key
BAIDU_SECRET_KEY=your_baidu_secret_key
```

说明：

- 不需要手动设置 `PORT`，Railway 会自动注入，后端会读取 `process.env.PORT`。
- `backend/railway.toml` 已配置 `npm start` 和 `/health` 健康检查。
- 部署成功后，先访问 `https://your-railway-domain/health`，看到 `status: ok` 再继续前端部署。

## 2. 部署前端到 Vercel

1. 在 Vercel 导入同一个 GitHub 仓库。
2. `Root Directory` 选择 `frontend`。
3. Framework Preset 选择 `Vite`。
4. Build Command 使用 `npm run build`。
5. Output Directory 使用 `dist`。
6. 配置环境变量：

```env
VITE_API_BASE_URL=https://your-railway-domain.up.railway.app
```

说明：

- `VITE_API_BASE_URL` 不要以 `/` 结尾，代码也会自动去掉尾部 `/`。
- `frontend/vercel.json` 已配置 SPA 回退，刷新 `/history`、`/profile` 等页面不会 404。

## 3. 上线验收

按顺序检查：

- Railway 后端 `/health` 返回 `status: ok`
- Vercel 首页可以打开
- 直接访问或刷新 `/auth`、`/history`、`/profile` 不返回 404
- 注册第一个用户后，该用户成为管理员
- 登录成功后能进入个人资料页
- AI 诊断接口可以返回结果
- 历史记录可以保存和读取
- 浏览器 Network 面板没有 CORS 报错

## 4. 本地开发

后端本地默认使用 SQLite，不需要配置 `DATABASE_URL`：

```bash
cd backend
npm install
npm run dev
```

前端本地通过 Vite proxy 请求后端：

```bash
cd frontend
npm install
npm run dev
```

本地访问：

- 前端：`http://localhost:5173`
- 后端健康检查：`http://localhost:3000/health`
