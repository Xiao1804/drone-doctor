# DroneDoctor - 无人机AI诊断与维修知识平台

**版本**: v1.2  
**状态**: MVP 已部署（腾讯云 Docker http://81.71.39.150），行为干预 P0 已上线

---

## 项目概述

DroneDoctor 是面向国内无人机用户的 AI 故障诊断与维修知识平台。用户选择机型和故障类型，AI 给出精准排查步骤、所需工具和解决方案。

**商业模式**：免费诊断引流（每日3次）+ 付费会员变现（39元/月）

**核心功能**:
- **AI 故障诊断**：输入故障现象，基于 129 条案例的语义检索 + Kimi 大模型推理，准确率 92%
- **交互式维修助手**：5 大类故障决策树向导（定损前检查、无法开机、机身链路、云台、电池），SOP 问答式引导
- **维修知识库**：故障案例管理、文章系统（Markdown）、资源库（审核下载）

**技术架构**:
- 前端：React 19 + Vite + Tailwind CSS
- 后端：Node.js + Express
- 数据库：PostgreSQL + pgvector（向量检索）
- AI：Kimi API（推理）+ bge-small-zh-v1.5 本地 embedding（ONNX）
- 部署：腾讯云单服务器 Docker Compose

---

## 技术栈

| 层级 | 技术选型 | 说明 |
|------|---------|------|
| 前端 | React 19 + Vite + Tailwind CSS | SPA，Vite 构建 |
| 后端 | Node.js 20 + Express | 纯 API 服务 |
| 数据库 | PostgreSQL 16 + pgvector | 向量维度 512，IVFFlat 索引 |
| Embedding | bge-small-zh-v1.5（Xenova/ONNX） | ~50MB，CPU 推理 <100ms |
| AI 推理 | Kimi API（moonshot-v1-8k） | 中文诊断准确率 92% |
| 部署 | Docker Compose（Nginx + Node + PG） | 腾讯云轻量服务器 |

---

## 快速开始

### 环境要求

- Node.js >= 20
- PostgreSQL >= 16（需安装 pgvector 扩展）
- npm

### 安装依赖

```bash
# 后端
cd backend
npm install

# 前端
cd ../frontend
npm install
```

### 配置环境变量

在 `backend/.env` 文件中配置:

```env
# 数据库
DATABASE_URL=postgresql://user:password@localhost:5432/drone_doctor

# AI（至少配一个）
KIMI_API_KEY=your_kimi_api_key

# JWT
JWT_SECRET=your_jwt_secret_at_least_32_chars

# Embedding（默认使用本地 bge-small-zh 模型）
LOCAL_MODEL_PATH=./models/Xenova/bge-small-zh-v1.5
```

### 初始化数据

```bash
# 后端目录
cd backend

# 1. 创建数据库表（含 pgvector 扩展和 embedding 表）
psql -U postgres -f db/schema.sql

# 2. 导入 129 条故障案例
node scripts/seed-data.js

# 3. 生成 embedding 向量（首次运行约 30-60 秒）
node scripts/seed-embeddings.js
```

### 启动开发服务器

```bash
# 启动后端（端口 3000）
cd backend
npm run dev

# 启动前端（端口 5173，自动代理 /api 到后端）
cd frontend
npm run dev
```

---

## 已完成功能

- 故障案例库（129 条，含 SOP 结构化案例 F001-F129）
- pgvector 语义检索（bge-small-zh-v1.5 本地 embedding）
- AI 故障诊断（Kimi API + 向量检索混合，准确率 92%）
- 交互式维修助手（5 大类决策树向导 + 维修完成后综合检查清单）
- **行为干预系统（P0）**：结构化三步输入、等待页进度条+小知识、结果页三段式+反馈动画、全局次数指示器、埋点系统（7种事件）
- 文章系统（Markdown 编辑/审核）
- 资源库（文件上传/审核/下载）
- 腾讯云 Docker 部署（Nginx + Express + PostgreSQL + pgvector）

## 进行中 / 待完成

- **P1 行为干预**：次数用完转化页、渐进式注册引导
- 企业微信扫码登录
- 文章/资源审核工作流完善
- Phase 2：图像诊断接入（Vision API）
- Phase 3：故障预测模型

---

## 项目结构

```
drone-doctor/
├── backend/           # Node.js + Express API 服务
│   ├── src/
│   │   ├── routes/    # API 路由（diagnosis, decisionTrees, events, stats）
│   │   ├── services/  # 业务逻辑（vectorService, embeddingService）
│   │   └── controllers/
│   ├── models/        # bge-small-zh-v1.5 ONNX 模型（git ignore）
│   └── Dockerfile
├── frontend/          # React 19 SPA
│   └── src/
│       ├── pages/     # HomePage, DiagnosisPage, GuidePage 等
│       ├── components/# DiagnosisCounter 等
│       └── utils/     # tracking.js（埋点）
├── data/              # 决策树 JSON + 案例数据
├── docs/              # 设计文档（PRD、竞品调研、行为干预方案等）
├── docker-compose.tencent.yml
└── .dockerignore
```

---

## 生产部署

详见 [TENCENT_DEPLOY.md](./TENCENT_DEPLOY.md)

```bash
cd /root/drone-doctor
git pull origin main
docker compose -f docker-compose.tencent.yml build backend frontend
docker compose -f docker-compose.tencent.yml up -d
```

---

## 许可证

MIT License
