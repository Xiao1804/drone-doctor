# DroneDoctor 现有 Plan 导出稿

> 导出对象：`Xiao1804/drone-doctor` 现有仓库中的 README、工程修复计划、反馈系统设计、故障类型映射、统一诊断服务逻辑、PR 记录。  
> 目的：把之前分散在 plan / 文档 / PR / 代码里的内容，整理成可继续转成“工作流”的项目计划。  
> 维护说明：`当前可用链路/模块检测方式` 已废弃，不再作为当前可用工具、SOP、验收项或决策树节点出现。涉及链路/模块检查时，统一描述为“当前可用的链路/模块检测方式、APP 报错、DA2、飞行日志、人工基础检查”。

---

## 0. 导出结论

当前项目不是没有计划，而是计划分散在几个位置：

1. `README.md`：项目定位、核心功能、技术架构、已完成/待完成事项。
2. `docs/ENGINEERING_FIX_PLAN.md`：工程问题、P0/P1/P2 修复优先级、验收清单。
3. `docs/FEEDBACK_SYSTEM_DESIGN.md`：用户反馈 MVP 的产品设计。
4. `data/fault-type-map.json`：故障类型、关键词、决策树路由关系。
5. `data/decision-trees.json`：维修排故流程节点。
6. `backend/src/services/unifiedDiagnosisService.js`：现有 AI 诊断主流程。
7. PR #1 - #9：阶段性修复和新增功能记录。

补救方向：

```text
已有 plan / PR / 代码逻辑
↓
整理成“功能计划 + 工作流节点 + 验收标准”
↓
把新增功能全部改成工作流驱动
↓
旧功能逐步按工作流重构
```

---

## 1. 项目总 Plan

### 1.1 项目定位

DroneDoctor 是面向国内无人机用户的 AI 故障诊断与维修知识平台。

核心用户输入：

```text
机型 + 故障类型 + 故障现象描述
```

系统目标输出：

```text
精准排查步骤 + 所需工具 + 维修/解决方案
```

### 1.2 商业模式

```text
免费诊断引流：每日 3 次
↓
付费会员转化：39 元/月
```

### 1.3 已规划核心功能

| 模块 | 现状 | 说明 |
|---|---|---|
| AI 故障诊断 | 已有 MVP | 基于结构化案例 + 向量检索 + Kimi 推理 |
| 交互式维修助手 | 已有 MVP | 5 大类故障决策树向导 |
| 维修知识库 | 已有 MVP | 故障案例、文章、资源库 |
| 行为干预系统 | P0 已上线 | 三步输入、等待页、小知识、结果页反馈 |
| 用户反馈系统 | 已上线 MVP | 用户反馈、管理员处理、用户查看处理进度 |
| 图片诊断 | Phase 2 | Vision API 接入 |
| 故障预测模型 | Phase 3 | 后续规划 |

---

## 2. 技术架构 Plan

```text
前端：React + Vite + Tailwind CSS
后端：Node.js + Express
数据库：PostgreSQL + pgvector
AI：Kimi API + 本地 bge-small-zh-v1.5 embedding
部署：腾讯云单服务器 Docker Compose
```

### 2.1 数据流

```text
用户输入故障描述
↓
前端提交到 /api/diagnosis/unified
↓
后端解析机型/故障类型/关键词
↓
向量检索相似案例
↓
匹配故障类型对应的决策树
↓
quick 模式：生成初步诊断
interactive 模式：按节点追问并推进流程
↓
输出诊断结果、排查步骤、建议动作
```

---

## 3. AI 诊断工作流 Plan

### 3.1 快速诊断 quick 模式

```text
输入：用户故障描述 + 前端结构化提示
↓
IntentParser：规则提取品牌、机型、故障类型、关键词
↓
置信度不足时调用 AI 分类
↓
EmbeddingService：生成 query embedding
↓
VectorService：检索相似案例 Top 5
↓
TreeRouter：按 fault-type-map 匹配决策树
↓
输出初步方向、首要检查、关键追问
↓
推荐进入 interactive 模式确认
```

quick 模式不应直接输出最终定损结论。

### 3.2 交互式诊断 interactive 模式

```text
首次进入：
用户输入故障描述
↓
解析 intent
↓
创建诊断 session
↓
匹配决策树
↓
返回 startNode 和追问问题

继续诊断：
用户回答当前问题
↓
TreeExecutor 判断 yes / no / next
↓
推进到下一节点
↓
直到 terminal 节点
↓
生成最终诊断结果
```

### 3.3 当前 AI 诊断的关键风险

| 风险 | 说明 | 补救建议 |
|---|---|---|
| quick 模式可能过度确定 | quick 会预测 terminal 路径，容易像“已确认”结论 | quick 只输出初步方向，不输出最终定损 |
| “无法起飞”实际映射到 flight | flight 当前走 `tree-link-test`，不是专门无法起飞树 | 新增 `tree-flight-abnormal` |
| 诊断结论可信度依赖案例与流程质量 | 129 条案例只是起点 | 继续补真实维修案例、失败反馈、定损结果 |
| 废弃工具引用 | 旧文档或旧流程可能保留已废弃工具名 | 全部替换为当前可用检查方式 |

---

## 4. 故障类型与决策树 Plan

### 4.1 当前故障类型路由

| 故障类型 ID | 中文标签 | 当前绑定决策树 | 优先级 |
|---|---|---|---|
| power-on | 无法开机/电源问题 | tree-power-on | high |
| link-test | 链路测试报错/机身故障 | tree-link-test | medium |
| gimbal | 云台/相机故障 | tree-gimbal | medium |
| battery | 电池问题 | tree-battery | high |
| video | 图传/信号异常 | tree-link-test | medium |
| gps | GPS/导航异常 | tree-link-test | low |
| flight | 飞行异常/无法起飞 | tree-link-test | high |
| damage-assessment | 外观检查/定损 | tree-damage-assessment | medium |
| firmware | 固件/软件问题 | tree-power-on | low |

### 4.2 当前核心决策树

```text
定损前通用检查：tree-damage-assessment
无法开机排查：tree-power-on
机身链路/模块检查故障排查：tree-link-test
云台/相机故障：tree-gimbal
电池问题：tree-battery
```

### 4.3 需要补的关键决策树

#### tree-flight-abnormal：无法起飞 / 飞行异常

```text
无法起飞 / 飞行异常
├── 是否能正常开机？
│   ├── 否：进入电源问题流程 tree-power-on
│   └── 是：继续
├── APP 是否有明确报错？
│   ├── 是：记录错误码，进入软件/传感器流程
│   └── 否：继续
├── GPS / 指南针 / IMU 是否正常？
├── 桨叶和电机是否正常？
├── 是否处于禁飞区或限高区？
└── 是否存在遥控/链路异常？
```

---

## 5. 知识库 Plan

### 5.1 当前知识库资产

| 资产 | 当前作用 |
|---|---|
| `fault-cases-enhanced.json` | 结构化故障案例 |
| `fault-type-map.json` | 故障关键词、类型、决策树绑定 |
| `decision-trees.json` | 排故流程节点 |
| pgvector embedding 表 | 语义检索相似案例 |
| Markdown 文章系统 | 知识内容展示 |
| 资源库 | 文件上传、审核、下载 |

### 5.2 真正辅助维修判断还缺什么

| 缺口 | 需要补的知识 |
|---|---|
| 现象到故障的证据链 | 现象、检查点、判断条件、排除项 |
| 定损依据 | 更换前提、测试标准、可修/不可修判断 |
| 工具使用流程 | 万用表、DA2、电池助手，以及当前仍可用的检测工具 |
| 维修后验证 | 功能测试、APP 测试、链路/模块检查、飞行前检查 |
| 真实案例闭环 | 用户反馈、实际维修结果、误判案例 |

---

## 6. 工程修复 Plan

### 6.1 P0：立即修复项

| 编号 | 问题 | 状态/建议 |
|---|---|---|
| P0-1 | 后端 Docker 构建可能因 sharp 缺失失败 | 已在 PR #1 第一批修复中处理 |
| P0-2 | 第一个注册用户自动成为管理员 | 已在 PR #1 第一批修复中处理 |
| P0-3 | JWT 默认密钥存在生产风险 | 已在 PR #1 第一批修复中处理 |
| P0-4 | 用户资料更新字段缺少白名单 | 已在 PR #1 第一批修复中处理 |
| P0-5 | Nginx 上传限制与后端飞行日志限制不一致 | 已在 PR #1 第一批修复中处理 |

### 6.2 P1：核心业务链路修复项

| 编号 | 问题 | 状态/建议 |
|---|---|---|
| P1-1 | 诊断请求未统一携带 Authorization | PR #2 已继续修复 |
| P1-2 | 免费次数检查与扣减不是原子操作 | 仍建议重点检查 |
| P1-3 | 统计接口混用 PostgreSQL 语法，SQLite 失败 | 待确认 |
| P1-4 | “无法起飞”映射 flight 但无专门决策树 | 短期已路由到 tree-link-test；仍需新增 tree-flight-abnormal |
| P1-5 | quick 模式可能生成过度确定结论 | 待重构为“初步判断” |
| P1-6 | 图片识别接口公开，可能产生 API 成本风险 | PR #1 有加限制动作，仍需核验 |
| P1-7 | 废弃工具引用可能误导排故 | 已明确禁止继续引用废弃工具，实际文件需同步清理 |

---

## 7. 用户反馈系统 Plan

### 7.1 反馈系统目标

```text
用户使用后能反馈是否有帮助、哪里不准、哪里看不懂、想增加什么；管理员能查看并记录处理结果。
```

### 7.2 用户侧入口

```text
页面右下角：反馈
诊断结果页：这次诊断有帮助吗？
排故节点页：这一步你能完成吗？
飞行日志页：日志分析结果是否准确？
```

### 7.3 管理员侧

```text
/admin/feedback
```

管理员可以查看反馈、筛选、修改状态、填写内部备注和用户可见回复。

### 7.4 反馈闭环后续计划

```text
诊断结果绑定反馈
排故节点绑定反馈
高频反馈统计
反馈导出
邮件通知
客服工单
```

---

## 8. PR 阶段性 Plan 导出

| PR | 主题 | 计划/变更意义 |
|---|---|---|
| #1 | harden deployment, auth and core diagnosis routing | 第一批工程加固：部署、安全、权限、图片接口、flight 路由 |
| #2 | admin unlimited usage and authenticated requests | 修复管理员次数、统一认证请求、登录后清除旧计数 |
| #3 | user feedback MVP | 建立用户反馈 MVP |
| #4 | visible diagnosis feedback entry | 在诊断场景增加显眼反馈入口 |
| #5 | user-visible feedback status | 用户可查看反馈处理进度 |
| #6 | feedback visibility, history saving, usage charging | 修复反馈入口、诊断历史、无效诊断不扣次数 |
| #7 | stabilize my feedback loading | 修复 `/my-feedback` 重复加载失败 |
| #8 | clarify public feedback replies | 区分用户可见回复与内部备注 |
| #9 | admin usage exemption from database role | 管理员无限次数以数据库 role 为准 |

---

## 9. 现在最适合转成工作流的内容

### 9.1 AI 诊断主工作流

```text
用户输入
↓
结构化三步输入
↓
意图识别：机型 / 故障类型 / 关键词
↓
故障类型路由
↓
知识库检索
↓
进入 quick 或 interactive
↓
输出初步判断 / 排故节点
↓
用户反馈
↓
管理员处理
↓
反哺知识库
```

### 9.2 维修排故工作流

```text
接机
↓
定损前通用检查
↓
确认故障类型
↓
选择对应决策树
↓
按节点逐项检查
↓
记录判断结果
↓
输出可能原因 / 已确认故障 / 待确认项
↓
执行维修或建议专业维修
↓
维修后综合检查
↓
记录案例
```

---

## 10. 下一步补救建议

```text
1. 清理所有废弃工具引用，避免后续决策树继续误用。
2. 把 quick 模式改成“初步判断”，不要直接给最终定损结论。
3. 新增 tree-flight-abnormal，专门解决“无法起飞/飞行异常”。
4. 把 5 大决策树整理成可视化工作流节点表。
5. 把用户反馈绑定到 diagnosisId / treeId / nodeId。
6. 用真实维修案例反向修正知识库。
7. 补自动化测试和验收脚本。
```

### 工作流节点表模板

| 节点 | 作用 | 输入 | 处理逻辑 | 输出 | 失败/分支 |
|---|---|---|---|---|---|
| 故障识别 | 判断用户说的是什么问题 | 用户描述、机型、故障类型 | 规则 + AI 分类 | faultType、confidence | 低置信度则追问 |
| 知识库检索 | 找相似案例 | 用户描述 embedding | pgvector TopK | semanticMatches | 超时则跳过 |
| 决策树路由 | 选择排故流程 | faultType | fault-type-map | treeId、startNode | 无树则 fallback |
| 交互追问 | 推进排故节点 | 用户回答 | aiMapping + AI branch | nextNode | 模糊则追问 |
| 诊断生成 | 输出结果 | path、branchHistory、cases | 路径推导 + 案例补充 | 可能原因、步骤、工具 | 不足则输出不确定项 |
| 反馈闭环 | 收集真实效果 | rating、content、page | 存 feedback | 管理员处理任务 | 高频问题进入知识库 |

---

## 11. 给开发协作者看的说明

```text
这个项目之前不是没有 plan，而是 plan 分散在 README、工程修复文档、反馈设计文档、PR 说明和代码实现里。

我已经把现有 plan 导出成：
- 项目总计划
- 技术架构计划
- AI 诊断工作流
- 故障类型与决策树计划
- 知识库计划
- 工程修复计划
- 用户反馈系统计划
- PR 阶段性计划

下一步不是推倒重来，而是把这些内容转成统一的工作流节点表。新增功能全部按工作流开发，旧功能逐步重构。

注意：当前可用链路/模块检测方式 已废弃，不要再新增任何依赖该工具的 SOP、决策树节点、验收项或案例字段。
```
