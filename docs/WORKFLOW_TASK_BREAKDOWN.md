# DroneDoctor 工作流化拆解文档

> 目标：把已有 plan 拆成可执行的工作流节点表、决策树补全任务、知识库补全任务和开发 Issue。  
> 上游文档：`docs/EXISTING_PLAN_EXPORT.md`。

---

## 0. 拆解总览

当前项目要从“AI 能回答”升级为“AI 能按维修师排故流程辅助判断”。核心不是继续堆功能，而是把诊断过程工作流化。

```text
用户输入
↓
结构化信息采集
↓
故障意图识别
↓
故障类型路由
↓
知识库检索
↓
决策树排故
↓
诊断结果生成
↓
用户反馈
↓
知识库反哺
```

---

# 1. 工作流节点表

## 1.1 主诊断工作流

| 节点 ID | 节点名称 | 目标 | 输入 | 处理逻辑 | 输出 | 分支/失败处理 | 当前状态 | 优先级 |
|---|---|---|---|---|---|---|---|---|
| WF-001 | 结构化三步输入 | 收集最低诊断信息 | 机型、故障类型、故障描述 | 前端引导用户选择机型和故障类型，并填写现象 | structuredHints | 信息不足时提示补充 | 已有 | P0 |
| WF-002 | 故障意图识别 | 判断用户描述属于哪类故障 | input、structuredHints | 规则关键词匹配；低置信度时调用 AI 分类 | intent、faultType、confidence | 置信度低于阈值时进入追问 | 已有 | P0 |
| WF-003 | 相似案例检索 | 找历史维修案例作参考 | input embedding | bge-small-zh 生成向量，pgvector 检索 TopK | semanticMatches | 超时或失败时不阻断主流程 | 已有 | P1 |
| WF-004 | 决策树路由 | 选择排故流程 | faultType | 查询 `fault-type-map.json` 中绑定的 tree | treeId、startNode | 无树时 fallback 到通用流程 | 已有但不完整 | P0 |
| WF-005 | quick 初步判断 | 给用户快速方向 | intent、tree、semanticMatches | 只输出可能方向、首要检查、推荐进入交互式流程 | preliminaryDiagnosis | 禁止输出“已确认损坏” | 需重构 | P0 |
| WF-006 | interactive 建立会话 | 开始逐步排故 | input、intent、tree | 创建 session，返回 startNode | sessionId、currentNode | 无树则提示重新描述或查看案例 | 已有 | P0 |
| WF-007 | 节点执行 | 根据用户回答推进流程 | currentNode、userAnswer | action 自动下一步；question 判断 yes/no | nextNode、branchHistory | 回答模糊时追问确认 | 已有但需增强 | P1 |
| WF-008 | 诊断结果生成 | 输出维修建议 | path、branchHistory、cases | 按路径推导结论，补充相似案例 | possibleCauses、steps、tools、uncertainties | 信息不足时输出“不确定项” | 已有但需改可信度表达 | P0 |
| WF-009 | 维修后确认 | 防止误交付 | terminalNode、维修动作 | 输出维修完成检查清单 | postRepairChecklist | 未通过则回到对应流程 | 部分已有 | P1 |
| WF-010 | 用户反馈采集 | 判断结果是否有用 | rating、content、page、diagnosisId | 保存反馈，绑定诊断上下文 | feedbackId | 匿名用户提示留联系方式 | 已有但未完全绑定诊断 | P1 |
| WF-011 | 反馈处理 | 管理员修正知识库 | feedback、adminStatus、publicReply | 管理员标记误判/看不懂/新增需求 | publicStatus、repairTask | 高频问题进入知识库任务 | 已有基础 | P1 |
| WF-012 | 知识库反哺 | 让系统越用越准 | resolved feedback、真实维修结果 | 转成案例、节点、关键词、判断条件 | 新案例/新节点/新规则 | 需人工审核 | 待开发 | P1 |

---

## 1.2 quick 模式工作流

| 节点 ID | 节点名称 | 输入 | 输出 | 规则 |
|---|---|---|---|---|
| QK-001 | 识别故障方向 | 用户描述、机型、故障类型 | faultType、confidence | 只做分类，不做定损 |
| QK-002 | 查找相似案例 | 用户描述 | similarCases | 只作为参考证据 |
| QK-003 | 匹配排故入口 | faultType | treeId、startNode | 若无专用树，提示“暂无完整流程” |
| QK-004 | 输出初步判断 | faultType、tree、cases | possibleDirections、firstChecks、keyQuestions | 不输出 terminalConclusion |
| QK-005 | 推荐下一步 | firstChecks | startInteractive、viewCases、submitFeedback | 强制推荐进入交互式诊断 |

### quick 模式禁止输出

```text
已确认损坏
直接更换某部件
故障一定是 xxx
维修结论：xxx 损坏
```

### quick 模式允许输出

```text
初步方向
可能故障模块
需要先确认的问题
建议先做的检查
是否建议进入交互式排查
```

---

## 1.3 interactive 模式工作流

| 节点 ID | 节点名称 | 输入 | 输出 | 分支 |
|---|---|---|---|---|
| INT-001 | 创建会话 | input、intent | sessionId | 失败则重新描述 |
| INT-002 | 返回当前节点 | tree.startNode | currentNode | action/question/terminal |
| INT-003 | 用户执行检查 | currentNode.description | userAnswer | 完成/无法完成/看不懂 |
| INT-004 | 判断分支 | userAnswer、aiMapping | yes/no/clarify | 模糊则追问 |
| INT-005 | 推进节点 | branchResult | nextNode | 无 nextNode 则报错 |
| INT-006 | 到达终端 | terminalNode | confirmedConclusion | 输出结论和建议 |
| INT-007 | 输出维修后检查 | terminalConclusion | checklist | 未通过则返回相关节点 |
| INT-008 | 收集反馈 | diagnosisId、treeId、nodeId | feedback | 绑定上下文 |

---

# 2. 决策树补全任务

## 2.1 决策树补全优先级

| 优先级 | 决策树 | 原因 | 当前问题 |
|---|---|---|---|
| P0 | `tree-flight-abnormal` 无法起飞/飞行异常 | 首页“无法起飞”是核心场景 | 当前映射到 `tree-link-test`，不够准确 |
| P0 | quick 模式的“初步判断树” | 防止 AI 直接定损 | 当前 quick 可能预测 terminal 结论 |
| P1 | `tree-video-signal` 图传/信号异常 | 图传是高频用户问题 | 当前映射到链路测试，颗粒度不够 |
| P1 | `tree-gps-navigation` GPS/指南针/IMU | 起飞失败常涉及传感器 | 当前映射到链路测试，需独立流程 |
| P1 | `tree-app-error-code` APP 报错码流程 | 用户经常只知道 APP 报错 | 需要错误码到检查项的映射 |
| P2 | `tree-repair-postcheck-by-part` 按更换部件验收 | 维修后交付需要标准 | 当前只有通用 checklist |

---

## 2.2 P0：新增 `tree-flight-abnormal`

### 目标

把“无法起飞 / 起飞失败 / 飞行异常”从 `tree-link-test` 中拆出来，形成专用排故树。

### 推荐节点结构

```text
tree-flight-abnormal
├── fl-start：是否能正常开机？
│   ├── 否 → 跳转 tree-power-on
│   └── 是 → fl-app-error
├── fl-app-error：APP 是否有明确报错？
│   ├── 是 → fl-record-error-code
│   └── 否 → fl-propeller-motor
├── fl-record-error-code：记录 APP 报错码/报错文案
│   └── fl-error-route
├── fl-error-route：报错类型属于哪一类？
│   ├── GPS/指南针/IMU → fl-sensor-check
│   ├── 电池/供电 → tree-battery
│   ├── 遥控/图传 → tree-video-signal
│   └── 未知 → fl-basic-check
├── fl-propeller-motor：桨叶和电机是否异常？
│   ├── 是 → fl-motor-prop-repair
│   └── 否 → fl-sensor-check
├── fl-sensor-check：GPS/指南针/IMU 是否正常？
│   ├── 否 → fl-calibration-or-sensor
│   └── 是 → fl-restriction-check
├── fl-restriction-check：是否处于禁飞区/限高区/室内弱 GPS 环境？
│   ├── 是 → fl-environment-cause
│   └── 否 → fl-link-test
├── fl-link-test：运行链路测试是否有 NG？
│   ├── 是 → tree-link-test
│   └── 否 → fl-log-analysis
├── fl-log-analysis：是否需要飞行日志分析？
│   ├── 是 → flight-log-analysis
│   └── 否 → fl-unknown
└── terminal 节点：环境限制 / 电机桨叶异常 / 传感器异常 / 链路异常 / 待确认
```

### 需要修改的文件

```text
data/decision-trees.json
data/fault-type-map.json
shared/enums.json
backend/src/services/unifiedDiagnosisService.js
frontend/src/pages/GuidePage.jsx 或相关决策树入口页面
```

### 验收标准

```text
1. 首页选择“无法起飞”后进入 tree-flight-abnormal，而不是 tree-link-test。
2. 用户输入“能开机但无法起飞，APP 提示指南针异常”，能进入传感器/指南针分支。
3. 用户输入“电机不转，无法起飞”，能进入桨叶/电机检查分支。
4. quick 模式只输出初步方向，不直接判定某个大部件损坏。
5. interactive 模式可以逐节点推进到 terminal。
```

---

## 2.3 P1：新增 `tree-video-signal`

### 目标

把图传、黑屏、花屏、断图、遥控连接异常从链路测试中拆出。

### 推荐节点

```text
图传/信号异常
├── APP 是否能连接飞机？
├── 遥控器是否正常连接？
├── 是否有图像但花屏/卡顿？
├── 是否完全黑屏/无画面？
├── 是否摔机/进水后出现？
├── 相机排线/云台排线是否异常？
├── 链路测试是否有相机/图传相关 NG？
└── terminal：APP/遥控问题、相机链路问题、云台相机硬件问题、待确认
```

---

## 2.4 P1：新增 `tree-gps-navigation`

### 目标

把 GPS、指南针、IMU、定位、搜星、姿态异常形成独立流程。

### 推荐节点

```text
GPS/导航异常
├── 是否室外开阔环境？
├── APP 是否提示 GPS/指南针/IMU 错误？
├── 是否可以完成指南针/IMU 校准？
├── 是否近期炸机/进水/拆修？
├── GPS 板/指南针相关排线是否异常？
├── 链路测试是否有 GPS/指南针 NG？
└── terminal：环境问题、校准问题、传感器/排线问题、模块故障、待确认
```

---

# 3. 知识库补全任务

## 3.1 知识库补全总表

| 任务 ID | 任务名称 | 目标 | 需要补的数据 | 产物 | 优先级 |
|---|---|---|---|---|---|
| KB-001 | 建立故障案例标准字段 | 让案例能被检索和推理 | 现象、触发条件、检查步骤、判断分支、工具、结论 | `docs/KNOWLEDGE_CASE_SCHEMA.md` | P0 |
| KB-002 | 补“无法起飞”案例 | 支撑 `tree-flight-abnormal` | 10-20 条真实/手册案例 | 新增 fault cases | P0 |
| KB-003 | 补 APP 报错码映射 | 把用户报错转成检查路径 | 报错文案、错误码、对应模块、检查步骤 | `data/app-error-map.json` | P1 |
| KB-004 | 补工具使用 SOP | 用户不会操作工具时可引导 | 万用表、DA2、ET7KY13、电池助手 | Markdown SOP | P0 |
| KB-005 | 补维修后验收矩阵 | 判断修好没 | 更换部件、必测项目、通过标准 | `data/post-repair-test-matrix.json` | P1 |
| KB-006 | 反馈反哺知识库 | 把用户反馈转成知识任务 | feedback 类型、诊断 ID、节点 ID、实际结果 | 管理端任务流 | P1 |
| KB-007 | 补误判案例库 | 降低 AI 乱判 | 错误诊断、正确结论、原因 | `data/misdiagnosis-cases.json` | P2 |

---

## 3.2 故障案例标准字段

每条维修案例建议统一成以下结构：

```json
{
  "id": "Fxxx",
  "title": "无法起飞，APP 提示指南针异常",
  "deviceModels": ["DJI Mini 2", "DJI Air 2S"],
  "faultType": "flight",
  "symptoms": ["无法起飞", "APP 提示指南针异常"],
  "triggerConditions": ["炸机后", "更换外壳后", "室外开阔环境仍异常"],
  "firstQuestions": [
    "是否能正常开机？",
    "APP 是否有明确报错？",
    "是否摔过或进水？"
  ],
  "checkSteps": [
    {
      "step": 1,
      "operation": "确认 APP 报错文案",
      "passCriteria": "记录完整错误码或提示语",
      "tools": ["DJI Fly"]
    }
  ],
  "decisionBranches": [
    {
      "if": "APP 提示指南针异常",
      "then": "进入指南针/IMU/GPS 检查流程"
    }
  ],
  "possibleCauses": [
    {
      "cause": "指南针模块异常",
      "evidence": ["校准失败", "链路测试指南针 NG"],
      "confidenceRule": "需要至少 2 个证据支持"
    }
  ],
  "repairActions": ["重新校准", "检查排线", "更换对应模块"],
  "postRepairChecks": ["APP 无报错", "可正常起飞", "链路测试 PASS"],
  "riskWarnings": ["未确认前不要直接建议更换核心板"],
  "source": "manual / real_case / feedback",
  "reviewStatus": "draft"
}
```

---

## 3.3 工具 SOP 补全

### P0 工具

| 工具 | 用户问题 | 应补 SOP |
|---|---|---|
| 万用表 | 不会通断档、电压档 | 通断档测线、测供电、电池端电压、安全注意 |
| DA2 | 不会导日志/查大包 | 连接、识别设备、导日志、升级、注意事项 |
| ET7KY13 | 不会看链路测试结果 | 测试入口、PASS/NG 含义、NG 到模块映射 |
| 电池助手 | 不会判断电池 | SN、循环次数、电芯压差、PF、充电异常 |

### SOP 模板

```text
工具名称：
适用场景：
准备条件：
操作步骤：
正常结果：
异常结果：
下一步判断：
注意事项：
常见错误：
```

---

# 4. 开发 Issue

下面是建议直接转成 GitHub Issues 的开发任务。

---

## Issue 1：重构 quick 模式为“初步判断”，禁止直接输出最终定损

### 背景

当前 quick 模式会预测一条到 terminal 的路径，可能在用户没有完成检查前输出过度确定结论。

### 范围

- 修改 `backend/src/services/unifiedDiagnosisService.js`
- quick 模式输出 `preliminaryDiagnosis`
- 不再返回 terminalConclusion 作为最终结论
- 前端文案改为“初步判断”

### 验收标准

```text
1. quick 模式不输出“已确认损坏”。
2. quick 模式输出 possibleDirections、firstChecks、keyQuestions。
3. quick 结果明显提示“需要进入交互式排查确认”。
4. interactive 完成后才允许输出 confirmedConclusion。
```

---

## Issue 2：新增 `tree-flight-abnormal` 无法起飞专用决策树

### 背景

当前“无法起飞”映射到 `flight`，但 `flight` 暂时走 `tree-link-test`，不能覆盖起飞失败的真实排查路径。

### 范围

- 修改 `data/decision-trees.json`
- 修改 `data/fault-type-map.json`
- 必要时调整前端决策树入口
- 补充最少 8 个节点和 4 个 terminal 结论

### 验收标准

```text
1. 选择“无法起飞”进入 tree-flight-abnormal。
2. 能区分：无法开机、APP 报错、桨叶/电机、GPS/指南针/IMU、禁飞区/环境、链路异常。
3. 每个 terminal 都有 recommendation 和 postRepairCheck。
```

---

## Issue 3：建立故障案例标准 Schema，并迁移已有案例字段

### 背景

当前知识库案例能检索，但用于排故推理的字段还不够标准。

### 范围

- 新增 `docs/KNOWLEDGE_CASE_SCHEMA.md`
- 定义案例字段：现象、触发条件、检查步骤、判断分支、证据、结论、工具、风险提示、验收标准
- 选取 10 条现有案例做示范迁移

### 验收标准

```text
1. 文档中有完整 JSON 示例。
2. 至少 10 条案例符合新字段结构。
3. 后续新增案例可以按模板填写。
```

---

## Issue 4：补充“无法起飞”知识库案例 10-20 条

### 背景

`tree-flight-abnormal` 需要真实案例支撑，否则决策树只能做粗略排查。

### 范围

补充案例类型：

```text
无法起飞但能开机
APP 提示指南针异常
APP 提示 IMU 异常
GPS 信号弱导致无法起飞
电机不转/堵转
桨叶安装错误
禁飞区/限高区
炸机后起飞失败
电池通信异常导致无法起飞
链路测试 NG 导致无法起飞
```

### 验收标准

```text
1. 至少 10 条案例 reviewStatus=approved。
2. 每条案例都包含 firstQuestions、checkSteps、decisionBranches、postRepairChecks。
3. 向量检索能搜到相关案例。
```

---

## Issue 5：把反馈绑定到 diagnosisId / treeId / nodeId

### 背景

当前反馈系统已能提交和处理，但还没有充分绑定诊断上下文，无法准确知道哪个诊断结果或哪个排故节点有问题。

### 范围

- 前端反馈弹窗传入 diagnosisId、treeId、nodeId
- 后端保存绑定字段
- 管理端显示关联诊断上下文
- 支持从反馈跳转到对应诊断记录/节点信息

### 验收标准

```text
1. 在排故节点页提交反馈时能保存 treeId 和 nodeId。
2. 在诊断结果页提交反馈时能保存 diagnosisId。
3. 管理员能看到反馈对应的节点标题、诊断结果摘要。
4. 高频节点问题可导出为知识库补全任务。
```

---

## Issue 6：新增工具 SOP 文档：万用表、DA2、ET7KY13、电池助手

### 背景

系统要辅助初学者排故，不能只告诉用户“测一下”，还要告诉用户怎么测。

### 范围

新增文档：

```text
docs/sop/MULTIMETER_BASIC.md
docs/sop/DA2_BASIC.md
docs/sop/ET7KY13_LINK_TEST.md
docs/sop/BATTERY_ASSISTANT.md
```

### 验收标准

```text
1. 每个 SOP 包含适用场景、准备条件、操作步骤、正常结果、异常结果、下一步判断、注意事项。
2. 决策树节点可以引用 SOP 文件路径。
3. 用户遇到“不会操作”时可以跳转到对应 SOP。
```

---

## Issue 7：新增 APP 报错码/报错文案映射表

### 背景

用户经常只知道 APP 提示，不知道故障模块。需要把报错文案转成排查入口。

### 范围

- 新增 `data/app-error-map.json`
- 字段包括：errorText、errorCode、faultType、treeId、firstChecks、riskWarnings
- 在 intent 识别阶段优先匹配 APP 报错

### 验收标准

```text
1. 输入 APP 报错文案时能匹配到 faultType。
2. 匹配结果能进入正确决策树。
3. 未识别报错时提示用户上传截图或输入完整文案。
```

---

## Issue 8：新增维修后按部件验收矩阵

### 背景

维修建议必须有“修好怎么确认”的标准。

### 范围

- 新增 `data/post-repair-test-matrix.json`
- 按部件定义测试项：电池、电调板、核心板、GPS、云台、相机、排线、电机
- 诊断结果中根据 terminalConclusion 推荐对应验收项

### 验收标准

```text
1. 更换电池后显示电池相关验收项。
2. 更换云台后显示云台/相机验收项。
3. 更换核心板/电调板后显示链路测试和 APP 测试项。
```

---

# 5. 建议执行顺序

```text
第一步：Issue 1
先把 quick 模式从“直接判断”改成“初步判断”，降低误导风险。

第二步：Issue 2 + Issue 4
补无法起飞决策树和案例，因为这是首页核心场景。

第三步：Issue 3 + Issue 6
标准化知识库和工具 SOP，让后续案例能持续补充。

第四步：Issue 5
把反馈绑定到诊断和节点，形成真实闭环。

第五步：Issue 7 + Issue 8
补 APP 报错映射和维修后验收矩阵，提高专业度。
```

---

# 6. 给协作者/AI 编程工具的执行提示词

```text
请不要直接新增大功能。先阅读：

1. docs/EXISTING_PLAN_EXPORT.md
2. docs/WORKFLOW_TASK_BREAKDOWN.md
3. backend/src/services/unifiedDiagnosisService.js
4. data/fault-type-map.json
5. data/decision-trees.json

当前目标是把 DroneDoctor 从“AI 直接回答故障”改造成“按维修工作流逐步排查”。

优先处理：
- quick 模式只能输出初步判断；
- 新增 tree-flight-abnormal；
- 补无法起飞案例；
- 反馈绑定 diagnosisId/treeId/nodeId；
- 知识库案例按标准 schema 补全。

所有 PR 必须包含：
- 修改范围
- 验收标准
- 至少 2 个测试输入样例
- 不确定项说明
```
