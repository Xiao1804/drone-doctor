# Changelog

All notable changes to DroneDoctor are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Compliance
- 全局页脚展示 `粤ICP备2026085133号` 并链接至工信部备案查询平台
- 合规说明新增第三方 AI 服务来源、本地检索模型边界和数据处理提示
- 未获得公安联网备案号前不展示占位或虚假备案信息

### Fixed
- Docker 后端镜像在 Debian Bookworm 中从源码重建 `sqlite3`，避免预编译模块要求 GLIBC 2.38 导致容器启动失败
- Docker 后端镜像包含生产启动和管理员维护脚本
- PostgreSQL 迁移改用 node-pg-migrate v8 支持的 13 位时间戳名称，并修正基线外键定义

### Security
- 2026-06-22 已重写并强制更新 GitHub 全部分支和 `v1.2.0` 标签，移除历史运行账号与诊断历史文件
- 2026-07-03 已确认 GitHub Support 删除 PR 1—9 内部引用，旧敏感提交和对象均已不可达

---

## [1.3.0] - 2026-06-21

### Added
- 免注册兑换券通行证：用户无需账号即可激活 3 天免费体验
- 券码“已发放”记录和需求验证指标：发放数、激活率、体验人数、诊断完成率、反馈分布
- 数据库迁移 `1782000000000_trial_access_and_feedback`
- 数据库依赖健康检查和应用版本输出
- 结构化 HTTP 请求与错误日志
- GitHub Actions 自动执行后端测试、语法检查、前端构建和 Compose 校验
- `CONTRIBUTING.md`、`SECURITY.md` 和 MIT `LICENSE`

### Changed
- 普通账号、个人中心、云端历史和付费会员路径下线；账号登录仅供管理员
- 首页定位改为免费需求验证，不再展示付费和会员叙事
- PostgreSQL 生产容器启动前自动执行迁移
- 备份新增 SHA-256 校验、可选镜像目录和失败告警命令
- README、技术栈、部署和迁移说明与实际代码对齐

### Security
- 从当前版本树删除运行时用户和历史数据，并阻止再次提交
- 管理员 JWT 与体验通行证采用不同 token 类型，不能互相冒充
- 普通历史账号即使仍在数据库中也无法登录或访问管理接口
- 券码使用条件更新，避免并发重复兑换
- 基线迁移禁用破坏性自动回滚

### Removed
- 运行时 `data/users.json`、`data/history.json`
- 逐文件 CDN 覆盖式部署建议
- Render 任意来源 CORS 默认值

---

## [1.2.0] - 2026-06-20

### Added
- 3 天体验券码系统：取消免费 3 次/日，改为券码激活会员模式
- 个人学习合规模式（`VITE_PERSONAL_LEARNING_EDITION`）
- 标准化 3 天体验券码（统一历史未使用券码为 3 天体验）

### Changed
- 关闭公开注册（`ENABLE_PUBLIC_REGISTRATION` 默认 false）

### Fixed
- 安全加固：案例接口认证、事件接口认证+限速、登录限速、www 重定向
- 券码系统安全修复
- 前端构建工具漏洞修复
- JWT 密钥与上传大小不一致问题（P0-3、P0-5）
- 管理员豁免数据库角色诊断次数限制
- 反馈可见性、历史保存、使用次数扣减问题
- 交互式诊断默认 treeId 修复 + 空 input 兜底
- 交互式诊断超时保护 + 无匹配提示 + trust proxy 修复
- 向量检索 8 秒超时保护 + embedding 模型启动预热
- Docker 构建：COPY shared 目录、apt 源兼容 deb822

### Security
- SSH 加固配置（`ops/ssh/00-drone-doctor-hardening.conf`）
- 移除废弃 version 属性

---

## [1.1.0] - 2026-06-10

### Added
- 用户反馈 MVP：提交反馈、管理员公开回复、反馈状态追踪
- 管理员无限次诊断权限
- 反馈页面与路由

### Fixed
- 部署认证与诊断路由加固
- 管理员已认证请求次数扣减修复

---

## [1.0.0] - 2026-06-06

### Added
- 统一诊断架构 v2.0：决策树骨架 + AI 肌肉 + 案例库血液
- 诊断意图识别 v2：规则优先级 + 故障类型映射 + 三层匹配
- 交互式诊断会话持久化（30 分钟 TTL）
- 共享枚举 `shared/enums.js`（前后端统一设备/故障类型）
- 决策树变更审批管控（propose/approve/reject）
- 排查逻辑重构：纯决策树驱动，移除硬编码概率
- 数据一致性：前后端枚举双向映射

### Changed
- `DiagnosisService.js` 内联到 `diagnosisController.js`
- 移除 `DiagnosisCacheService.js`（冗余）

### Fixed
- Docker 构建路径修复（shared/enums.json 位置）

---

## [0.9.0] - 2026-06-04

### Added
- 行为干预 P0：结构化三步输入、等待页假进度条+小知识、结果页三段式+反馈动画
- 全局诊断次数指示器（`DiagnosisCounter`）
- 埋点系统：7 种事件类型，前端计数+后端 events 表双写
- 每日免费诊断次数限制（localStorage + 后端 DB 持久化）
- 付费引导 paywall UI

### Fixed
- 免费次数限制后端 DB 持久化
- 管理员诊断次数显示修复

---

## [0.8.0] - 2026-06-03

### Added
- 华科尔 FCS-F8 / FCS-F8 SE 飞行日志解析（ULog .ulg 原文件）
- Python + pyulog 后端解析，Node.js spawn 调用
- 电机映射（M1-M6 六轴 Hex X）、GPS/GNSS、电池、姿态、异常线索
- Dockerfile 安装 python3 + pyulog
- 文件大小限制 120MB

---

## [0.7.0] - 2026-06-02

### Added
- 向量语义检索接入（pgvector + bge-small-zh-v1.5 本地 embedding）
- 故障案例向量表 `fault_case_embeddings`（512 维，IVFFlat 索引）
- Toast 通知系统

### Fixed
- 向量检索参数索引 bug 修复

---

## [0.6.0] - 2026-05-30

### Added
- 5 个 SOP 决策树 + 综合检修检查清单
- 交互式维修向导（`/guide/:treeId`）
- 33 个 SOP 案例（F097-F129）

### Fixed
- 预检终端节点显示故障诊断树而非检查清单

---

## [0.5.0] - 2026-05-28

### Added
- 多 AI 提供商图片诊断（小米 mimo + Kimi fallback）
- AI 诊断 Prompt 工程优化：同义词匹配 + 结构化对话
- 多轮对话智能上下文管理

---

## [0.4.0] - 2026-05-27

### Added
- pgvector 迁移：从纯 JSON 检索升级到向量语义搜索
- 语义搜索 + CoT 推理 + 置信度评分（Phase 1）

### Fixed
- 确保 faultCases 加载完成后再使用

---

## [0.3.0] - 2026-05-26

### Added
- 双数据库支持（SQLite 本地 / PostgreSQL 生产）
- Render Blueprint 部署配置
- Render 部署指南

### Changed
- JSON 文件存储迁移到 SQLite

---

## [0.2.0] - 2026-05-26

### Added
- 腾讯云 Docker 部署方案（`docker-compose.tencent.yml`）
- Railway 部署配置

---

## [0.1.0] - 2026-05-25

### Added
- 项目初始化：React 19 + Vite + Tailwind CSS 前端
- Node.js + Express 后端 API
- PostgreSQL 16 + pgvector 数据库
- Kimi API AI 诊断推理
- 故障案例库（129 条）
- 基础诊断、历史、用户认证功能
