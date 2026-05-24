# DroneDoctor - 无人机AI诊断平台

**版本**: v1.0-MVP  
**开发周期**: 8周  
**状态**: MVP开发完成，待测试

---

## 项目概述

DroneDoctor是一个面向国内无人机用户的AI故障诊断与维修知识平台。

**核心功能**:
- AI故障诊断：用户输入故障现象，AI给出排查步骤、所需工具、操作方法
- 维修知识库：故障分类、维修教程、配件信息、案例库
- CAAC考证指南：考证流程、考试大纲、题库、模拟考试

**商业模式**:
- 免费版：每日3次诊断，部分知识库，基础题库
- 月度会员：39元/月，无限诊断，完整知识库，完整题库
- 年度会员：299元/年，月度会员全部权益 + 飞行日志解析(后续) + 专属社群

---

## 技术栈

**前端**:
- React 18
- Tailwind CSS
- Vite

**后端**:
- Node.js
- Express
- PostgreSQL + pgvector

**AI**:
- 百度文心一言/千帆

**部署**:
- Vercel (前端)
- Railway (后端)

---

## 快速开始

### 环境要求

- Node.js >= 18
- PostgreSQL >= 14
- npm 或 yarn

### 安装依赖

```bash
# 安装后端依赖
cd backend
npm install

# 安装前端依赖
cd ../frontend
npm install
```

### 配置环境变量

在 `backend/.env` 文件中配置:

```env
# Kimi API配置（推荐，有免费额度）
KIMI_API_KEY=your_kimi_api_key

# 或百度AI配置（可选）
BAIDU_API_KEY=your_api_key
BAIDU_SECRET_KEY=your_secret_key

# JWT密钥
JWT_SECRET=your_jwt_secret
```

**获取Kimi API Key**:
1. 访问 https://platform.moonshot.cn/
2. 微信扫码登录
3. 进入"API Key管理"
4. 创建新的API Key
5. 新用户赠送15元免费额度

**注意**: 系统会优先使用Kimi API，如果未配置则尝试百度AI，都没有配置则使用本地案例库匹配。

### 启动开发服务器

```bash
# 启动后端
cd backend
npm run dev

# 启动前端（新终端）
cd frontend
npm run dev
```

访问 http://localhost:5173 查看前端页面

---

## 已完成功能

✅ 故障案例库构建（10个典型案例）
✅ 后端API开发 + AI集成
✅ 前端页面开发（首页、诊断页）
✅ 项目基础架构搭建

---

## 待完成功能

⏳ 测试与优化
⏳ 部署上线
⏳ 域名注册与配置

---

## 许可证

MIT License
