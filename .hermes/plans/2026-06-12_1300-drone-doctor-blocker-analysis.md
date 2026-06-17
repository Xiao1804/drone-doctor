# DroneDoctor 当前阻塞分析与推进计划

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** 修复当前剩余 P1 阻塞项，部署一个功能更完整的可验证版本。

**Architecture:** React + Vite 前端通过统一 API 调用 Node.js + Express 后端，后端连接 PostgreSQL + pgvector 数据库和 Kimi API。

**Tech Stack:** React 19, Vite, Tailwind CSS, Node.js 20, Express, PostgreSQL 16 + pgvector, Kimi API, Docker Compose

---

## 现状分析

### ✅ 已完成项（从 git log 和代码验证确认）

| 项目 | 状态 | 证据 |
|------|------|------|
| P0-1: Docker sharp 校验 | ✅ 已修复 | Dockerfile 无 sharp，package.json 无 sharp 依赖 |
| P0-2: 首个注册用户自动 admin | ✅ 已修复 | userService.js 中无 userCount → admin 逻辑 |
| P0-3: JWT 默认密钥 | ✅ 已修复 | config.js 有 requireProductionEnv 强制检查 |
| P0-4: updateUser 字段白名单 | ✅ 已修复 | userService.js 有 allowedFields |
| P0-5: Nginx 上传大小限制 | ✅ 已修复 | nginx.tencent.conf 已调整到 120m+ |
| P1-1: 前端统一 apiClient | ✅ 已修复 | apiClient.js 存在且带 getAuthHeaders |
| P1-6: 图片识别加权限 | ✅ 已修复 | image.js 路由已加 freeUsageLimit |
| 反馈系统 MVP | ✅ 已部署 | AdminFeedbackPage, MyFeedbackPage, FeedbackWidget 均有路由 |
| 统一诊断 v2.0 | ✅ 已部署 | unifiedDiagnosisService + IntentParserService 已上线 |
| 服务器健康检查 | ✅ 在线 | http://81.71.39.150/health 返回 ok |

### ⚠️ 当前阻塞项

| 优先级 | 项目 | 状态 | 影响 |
|--------|------|------|------|
| P1-4 | flight 故障类型决策树缺失 | ⚠️ 阻塞 | 用户选"无法起飞"只匹配到 tree-link-test（链路测试），非真实排故流程 |
| P1-5 | quick 模式可能输出过度确定结论 | ⚠️ 中等 | 快速诊断可能直接给 terminal conclusion，维修可信度不足 |
| P1-2 | 免费次数非原子扣减 | ⚠️ 低 | 并发请求可能绕过 3 次限制 |
| P1-3 | stats 接口 PostgreSQL 专属语法 | ⚠️ 低 | 本地 SQLite 开发时统计失败 |
| P2-4 | 无自动化测试 | ⚠️ 低 | 回归风险 |

### ❌ 缺失功能（从记忆确认）

| 功能 | 优先级 | 说明 |
|------|--------|------|
| 知识库页面 | P2 | 产品完整性 |
| CAAC 考试题 | P2 | 已有题库数据但未集成到前端 |
| 反馈箱/反馈入口 | ✅ 已有 | FeedbackWidget 全局组件已存在 |
| 图像诊断 v2.0 | P2 | 规范就绪但未实现 |

---

## 推荐推进方案：下一个可验证版本

**核心目标：让"无法起飞"这个最高频场景能真正引导用户完成排故流程**

这是用户最核心的痛点 —— 选择"无法起飞"后目前只得到一个不相关的 tree-link-test，用户会直接流失。

### Phase 1：修复 flight 决策树（P1-4，最高优先级）

**Task 1: 创建 tree-flight-abnormal 决策树**
- 在 data/decision-trees.json 中新增完整的"无法起飞/飞行异常"决策树
- 覆盖：无法开机 → APP 报错 → GPS/IMU → 桨叶电机 → 禁飞区 → 遥控链路
- 将 fault-type-map.json 中 flight 的 trees 从 `['tree-link-test']` 改为 `['tree-flight-abnormal', 'tree-link-test']`

**Task 2: 验证"无法起飞"完整流程**
- 通过 API 测试"无法起飞"关键词是否正确匹配到 tree-flight-abnormal
- 确认交互式诊断能引导用户走完至少一条排故路径

### Phase 2：修复 quick 模式过度确定问题（P1-5）

**Task 3: 修改 quick 模式返回结构**
- unifiedDiagnosisService.js 中 quick 模式不再返回 terminalNode 作为结论
- 改为返回：可能故障方向 + 推荐排查入口 + 应开启交互式诊断的标记
- 前端 HomePage 对应更新展示逻辑

### Phase 3：部署验证

**Task 4: 构建并部署到腾讯云服务器**
- 按照已知的 CDN 更新 + Docker 重建流程
- 验证服务器上"无法起飞"完整流程可用

---

## 文件变更预期

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `data/decision-trees.json` | 修改 | 新增 tree-flight-abnormal 决策树 |
| `data/fault-type-map.json` | 修改 | flight 的 trees 数组更新 |
| `backend/src/services/unifiedDiagnosisService.js` | 修改 | quick 模式返回结构调整 |
| `frontend/src/pages/HomePage.jsx` | 可能修改 | quick 模式结果展示更新 |

## 验证步骤

1. 本地：`node -e "const trees = require('./data/decision-trees.json'); console.log(trees.trees.find(t=>t.id==='tree-flight-abnormal'))"`
2. API 测试：`curl -X POST http://81.71.39.150/api/diagnosis/unified -H "Content-Type: application/json" -d '{"mode":"quick","input":"无人机无法起飞"}'`
3. 前端：浏览器访问 http://81.71.39.150，选择"无法起飞"验证流程

## 风险

- CDN 更新和 Docker 重建需要时间（国内网络）
- 决策树内容需要专业准确性（不能给出错误维修建议）
- quick 模式改动可能影响现有用户预期
