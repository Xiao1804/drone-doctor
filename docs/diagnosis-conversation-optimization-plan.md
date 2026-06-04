# DroneDoctor 对话诊断逻辑优化方案

> 面向开发团队的技术方案文档  
> 版本：v1.0  
> 日期：2026-06-04  
> 范围：统一诊断架构 v2.0（`unifiedDiagnosisService.js` + `GuidePage.jsx`）

---

## 一、概述

当前 v2.0 统一诊断架构已完成基础设施搭建（IntentParser → TreeRouter → TreeExecutor → DiagnosisGenerator），但**交互层的智能化尚未落地**。实际走查发现，系统在三个核心环节存在明显断层，导致用户体验与"AI 诊断"的产品定位存在差距。

本文档对三个问题进行逐层拆解，给出可直接落地的代码级修复建议。

---

## 二、问题一：交互逻辑不合理 —— 决策树是"死"的

### 2.1 现状定位

当前 `TreeExecutorService` 本质上是一个**机械式节点推进器**：

```js
// unifiedDiagnosisService.js 第248-293行
class TreeExecutorService {
  async execute(treeId, currentNodeId, userAnswer, sessionContext) {
    // 1. 读取当前节点
    // 2. 如果是 terminal → 结束
    // 3. 如果是 action → 自动跳到 next.goto
    // 4. 如果是 question → 调用 resolveBranch 判断 yes/no → 跳到对应分支
  }
}
```

**核心缺陷**：节点与节点之间没有任何"记忆"和"条件"关系。系统不关心用户在前三步说了什么，第四步该问什么是写在 JSON 里固定死的。

### 2.2 具体表现

| 场景 | 用户期望 | 系统实际行为 |
|------|---------|-------------|
| 用户说"Mavic 3 电池充不进去电，但外观完好" | 系统知道是 Mavic 3，跳过"确认机型"步骤，直接问充电表现 | 走到哪个节点完全由决策树 JSON 决定，机型信息被忽略 |
| 用户回答"不确定是不是充电器的问题" | 系统追问"充电器指示灯什么状态？" | `resolveBranch` 匹配不到关键词，默认走 `no` 分支 |
| 用户连续两个回答都指向"电芯老化" | 系统提前收窄范围，跳过无关检查 | 继续按原路径走完所有节点 |

### 2.3 根因分析

1. **无节点条件系统**：决策树节点不支持 `if (机型 == X && 用户已确认Y)` 的条件表达式。
2. **无追问机制**：`resolveBranch` 只返回 `yes/no`，不返回 `need_clarification`。
3. **预测路径静态化**：`predictPath()` 使用 BFS 最短路径，完全不考虑用户输入语义，只是盲目 optimistic 走 `yes` 分支。
4. **上下文断层**：`sessionContext` 只记录 `path` 和 `branchHistory`，但 `TreeExecutor` 从不基于这些历史重新评估最优下一步。

### 2.4 优化方案：上下文感知的动态路径引擎

#### 2.4.1 决策树数据结构增强

为 `question` 和 `action` 节点新增 `conditions` 和 `dynamicBranches` 字段：

```json
{
  "nodes": {
    "bt-charger-test": {
      "type": "question",
      "title": "使用原装充电器充电",
      "description": "请使用 DJI 官方充电器为电池充电 30 分钟",
      "conditions": {
        "skipIf": "session.context.deviceType == 'mavic' && session.branchHistory.some(b => b.nodeId == 'bt-appearance' && b.branch == 'yes')",
        "priority": 1
      },
      "dynamicBranches": {
        "yes": {
          "goto": "bt-charge-normal",
          "weights": { "charger_fault": -0.3, "battery_cell_aging": +0.2 }
        },
        "no": {
          "goto": "bt-charger-fault",
          "weights": { "charger_fault": +0.4 }
        }
      },
      "yes": { "label": "✅ 充电正常", "goto": "bt-charge-normal" },
      "no": { "label": "❌ 仍充不进", "goto": "bt-charger-fault" }
    }
  }
}
```

> **新增字段说明**：
> - `conditions.skipIf`：当条件满足时，该节点自动跳过（由 `DynamicPathService` 评估）。
> - `dynamicBranches.*.weights`：走该分支时，对各个可能原因的置信度权重调整（供 `DiagnosisGenerator` 动态计算概率用）。

#### 2.4.2 引入 DynamicPathService

新建服务，负责在每一步决定"最优下一个节点"：

```js
// backend/src/services/dynamicPathService.js
class DynamicPathService {
  /**
   * 根据会话上下文，计算最优下一步节点
   * @param {Object} tree - 当前决策树
   * @param {Object} session - 会话状态
   * @param {string} lastAnswer - 用户最新回答（可能为null，如首次进入）
   * @returns {Object} { nextNodeId, skippedNodes[], reason }
   */
  computeNextNode(tree, session, lastAnswer) {
    const exec = session.treeExecution;
    const candidates = this.getCandidateNodes(tree, exec.currentNodeId);

    // 1. 过滤被 conditions.skipIf 排除的节点
    const available = candidates.filter(nodeId => {
      const node = tree.nodes[nodeId];
      if (!node.conditions?.skipIf) return true;
      return !this.evaluateCondition(node.conditions.skipIf, session);
    });

    // 2. 如果有多个候选（未来支持并行排查），按 priority 排序
    available.sort((a, b) => {
      const pa = tree.nodes[a].conditions?.priority || 0;
      const pb = tree.nodes[b].conditions?.priority || 0;
      return pb - pa;
    });

    // 3. 返回最优节点 + 被跳过节点列表（用于前端展示"已自动跳过X项"）
    return {
      nextNodeId: available[0],
      skippedNodes: candidates.filter(id => !available.includes(id)),
      reason: this.buildReason(tree, available[0], session),
    };
  }

  evaluateCondition(expr, session) {
    // 安全沙箱：只允许访问 session 上下文
    const sandbox = {
      session,
      deviceType: session.intent?.deviceType,
      model: session.intent?.model,
      branchHistory: session.treeExecution?.branchHistory || [],
    };
    // 使用 vm2 或简单的表达式解析器
    return safeEval(expr, sandbox);
  }
}
```

#### 2.4.3 resolveBranch 引入追问状态

修改 `TreeExecutorService.resolveBranch()` 的返回值语义：

```js
// 当前返回值: 'yes' | 'no'
// 优化后返回值: { decision: 'yes' | 'no' | 'clarify', clarification?: string }

async resolveBranch(node, userAnswer, sessionContext) {
  const answer = (userAnswer || '').toLowerCase().trim();
  if (!answer) return { decision: 'no' };

  // Step 1: 规则匹配（保留现有 aiMapping 逻辑）
  const ruleResult = this.matchByRules(node, answer);
  if (ruleResult.confidence > 0.8) {
    return { decision: ruleResult.branch };
  }

  // Step 2: 模糊回答检测（新增）
  const ambiguousPatterns = ['不确定', '不知道', '好像', '可能', '不太', '记不清', '没注意'];
  if (ambiguousPatterns.some(p => answer.includes(p))) {
    return {
      decision: 'clarify',
      clarification: `关于"${node.title}"，你似乎不太确定。${node.ai?.clarificationHint || '能否再确认一下？'}`,
      suggestedAnswers: node.ai?.expectedAnswers?.yes?.slice(0, 2) || [],
    };
  }

  // Step 3: AI 分类（现有逻辑增强）
  const aiResult = await this.aiClassifyBranch(node, userAnswer, sessionContext);
  return { decision: aiResult };
}
```

**前端适配**：`GuidePage.jsx` 的 interactive 模式需要处理 `decision === 'clarify'` 的状态——不推进节点，只更新 AI 提示语。

#### 2.4.4 预测路径改为意图驱动加权路径

替换现有 `predictPath()` 的 BFS 乐观路径逻辑：

```js
function predictWeightedPath(tree, intent, faultCases) {
  // 1. 根据 intent 中的关键词，为每个可能分支赋予初始权重
  const initialWeights = computeInitialWeights(intent, tree);

  // 2. 使用加权最短路径（Dijkstra），优先走权重高的分支
  const path = weightedDijkstra(tree, tree.startNode, initialWeights);

  // 3. 路径上的每个节点标注"为什么走这里"
  const annotatedPath = path.map(nodeId => ({
    id: nodeId,
    title: tree.nodes[nodeId].title,
    reason: initialWeights[nodeId]?.reason || '默认路径',
  }));

  return { path: annotatedPath.nodes, nodes: annotatedPath };
}
```

### 2.5 输入/输出规范

**DynamicPathService.computeNextNode()**

| 字段 | 类型 | 说明 |
|------|------|------|
| `tree` | Object | 完整决策树 |
| `session` | Object | 含 `intent`, `treeExecution`, `context` |
| `lastAnswer` | string \| null | 用户最新回答 |
| **返回.nextNodeId** | string | 下一个要展示的节点 ID |
| **返回.skippedNodes** | string[] | 因条件被自动跳过的节点（供前端展示） |
| **返回.reason** | string | 走到该节点的原因（如"根据你之前确认的机型，跳过通用检查"） |

### 2.6 修复清单（可直接落地）

- [ ] `data/decision-trees.json`：为关键节点增加 `conditions.skipIf` 和 `dynamicBranches.*.weights` 字段。
- [ ] 新建 `backend/src/services/dynamicPathService.js`，实现 `DynamicPathService`。
- [ ] 修改 `TreeExecutorService.execute()`：在 `question` 节点处理中，调用 `DynamicPathService` 获取下一步，而非直接读取 `node.yes/no.goto`。
- [ ] 修改 `TreeExecutorService.resolveBranch()`：支持返回 `clarify` 状态。
- [ ] 修改 `formatInteractiveResponse()`：当 `nextNodeId` 为 `null` 且 `clarification` 存在时，保持当前节点不动，只更新 `aiPrompt`。
- [ ] `frontend/src/pages/GuidePage.jsx`：interactive 模式下，当后端返回 `decision: 'clarify'` 时，不推进进度条，只更新提示文案。

---

## 三、问题二：机型输入节点缺失 —— 关键信息"进来就丢了"

### 3.1 现状定位

用户在首页（`HomePage.jsx`）通过三步选择（机型 → 故障类型 → 补充描述）输入了结构化信息。然而：

1. **前端拼接丢失结构**：
   ```js
   // HomePage.jsx 第160行
   const symptom = `${selectedDevice?.label || ''} ${faultText} ${extraDescription}`.trim();
   ```
   机型（如 "Mavic 系列"）被当作文本拼进 `symptom`，**作为独立字段的 `deviceType` 和 `faultType` 虽然在 API 请求体中传递，但后端并未有效消费**。

2. **后端意图解析忽略结构化提示**：
   ```js
   // unifiedDiagnosisService.js 第129-158行
   extractByRules(text, hints) {
     // ... 品牌提取、型号提取 ...
     // ❌ 完全没有读取 hints.deviceType 或 hints.model
     result.faultType = hints.faultType || bestMatch.faultType;
     result.model = null; // 永远为 null，除非从文本中猜出来
   }
   ```

3. **决策树中没有"输入"型节点**：
   决策树节点只有 `question/action/terminal/checklist` 四种类型。即使用户没在前端选机型，系统也没有在诊断流程中补问机型的能力。

4. **会话上下文不携带机型**：
   ```js
   // unifiedDiagnosisService.js 第560-565行
   session.treeExecution = {
     treeId: tree.id,
     currentNodeId: tree.startNode,
     path: [],
     branchHistory: [],
     // ❌ 没有 deviceType / model
   };
   ```

### 3.2 根因分析

| 层级 | 问题 |
|------|------|
| **数据层** | 决策树节点类型缺少 `input`（自由文本/单选/下拉）。 |
| **服务层** | `IntentParserService` 不把 `structuredHints.model` 写入 `result.model`；`interactiveDiagnose` 不把机型带入 `treeExecution`。 |
| **表现层** | 用户选了机型，但诊断过程中没有任何节点利用这个信息；如果用户自然语言里没提机型，系统也不会追问。 |

### 3.3 优化方案：机型全链路贯通

#### 3.3.1 新增 `input` 节点类型

在 `decision-trees.json` 中支持第五种节点类型 `input`：

```json
{
  "nodes": {
    "po-device-model": {
      "type": "input",
      "inputType": "select",
      "title": "确认设备型号",
      "description": "不同型号的电源管理逻辑不同，请确认你的机型",
      "required": true,
      "options": [
        { "value": "mavic3", "label": "Mavic 3 系列", "skipNodes": ["po-mavic3-specific"] },
        { "value": "mini4", "label": "Mini 4 Pro", "skipNodes": ["po-mini-specific"] },
        { "value": "other", "label": "其他机型", "goto": "po-generic-check" }
      ],
      "default": "other",
      "storeAs": "deviceModel",
      "ai": {
        "contextPrompt": "用户未明确提供机型，需要确认",
        "autoFillFromIntent": true
      }
    }
  }
}
```

> **字段说明**：
> - `inputType`: `select` / `text` / `number` / `confirm`（确认型，类似 question 但用于信息收集而非分支判定）。
> - `storeAs`: 输入值存入 `session.context[deviceModel]`，供后续节点条件引用。
> - `options.*.skipNodes`: 选择该选项后，后续路径中自动跳过这些节点（由 DynamicPathService 处理）。
> - `ai.autoFillFromIntent`: 如果 `session.intent.model` 已存在，自动填充并跳过此节点。

#### 3.3.2 修改 IntentParserService 消费 structuredHints

```js
// unifiedDiagnosisService.js 第129行起
extractByRules(text, hints) {
  const result = { brand: null, model: null, faultType: null, keywords: [], confidence: 0 };

  // 1. 优先使用前端传入的结构化信息（新增）
  if (hints.deviceType) {
    result.model = hints.deviceType; // 'mavic' / 'mini' / 'air' 等
    result.brand = 'dji'; // 目前全是 DJI，可扩展
  }
  if (hints.model) {
    result.model = hints.model;
  }

  // 2. 从文本中补充/验证（保留现有逻辑，但优先级低于 hints）
  // ... 品牌提取、型号提取 ...

  // 3. 故障类型：hints.faultType 优先级最高
  result.faultType = hints.faultType || bestMatch.faultType;
  result.confidence = hints.faultType ? 0.95 : bestMatch.score;

  return result;
}
```

#### 3.3.3 会话上下文携带机型信息

```js
// unifiedDiagnosisService.js 第560行起
session.treeExecution = {
  treeId: tree.id,
  currentNodeId: tree.startNode,
  path: [],
  branchHistory: [],
  context: {
    deviceType: intent.deviceType || intent.model || null,
    model: intent.model || null,
    brand: intent.brand || null,
    userAnswers: {}, // 用于存储 input 节点收集的信息
  },
};
```

#### 3.3.4 前端 input 节点渲染

`GuidePage.jsx` 的 interactive/wizard 模式需要新增 `input` 节点的渲染逻辑：

```jsx
// GuidePage.jsx 新增分支
if (currentNode.type === 'input') {
  if (currentNode.inputType === 'select') {
    return (
      <div className="space-y-3">
        {currentNode.options.map(opt => (
          <button
            key={opt.value}
            onClick={() => handleInputSubmit(currentNode.storeAs, opt.value, opt.goto)}
            className="w-full py-4 bg-black text-white rounded-xl ..."
          >
            {opt.label}
          </button>
        ))}
      </div>
    );
  }
  if (currentNode.inputType === 'text') {
    return (
      <div className="flex gap-2">
        <input
          type="text"
          placeholder={currentNode.placeholder || '请输入...'}
          onKeyDown={e => e.key === 'Enter' && handleInputSubmit(currentNode.storeAs, e.target.value, currentNode.options?.[0]?.goto)}
        />
        <button onClick={...}>确认</button>
      </div>
    );
  }
}
```

### 3.4 输入/输出规范

**Input 节点数据结构**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `type` | string | 是 | 固定值 `"input"` |
| `inputType` | string | 是 | `"select"` / `"text"` / `"number"` / `"confirm"` |
| `title` | string | 是 | 节点标题 |
| `description` | string | 否 | 补充说明 |
| `required` | boolean | 否 | 是否必须回答（默认 true） |
| `options` | Array | 条件必填 | `inputType === 'select'` 时必填 |
| `options[].value` | string | 是 | 选项值 |
| `options[].label` | string | 是 | 展示文案 |
| `options[].goto` | string | 条件必填 | 选择后跳转节点 |
| `options[].skipNodes` | string[] | 否 | 选择后自动跳过的节点 |
| `storeAs` | string | 是 | 存入 `session.context` 的键名 |
| `default` | any | 否 | 默认值 |
| `ai.autoFillFromIntent` | boolean | 否 | 是否自动从 intent 填充 |

**handleInputSubmit 前端函数签名**

```ts
function handleInputSubmit(storeAs: string, value: string | number, goto?: string): void
```

向后端发送：
```json
{
  "mode": "interactive",
  "sessionId": "...",
  "userAnswer": "{\"storeAs\":\"deviceModel\",\"value\":\"mavic3\"}"
}
```

### 3.5 修复清单

- [ ] `data/decision-trees.json`：在需要机型的树（如 `tree-power-on`, `tree-battery`）起始位置插入 `input` 节点（或放在条件跳过后）。
- [ ] `backend/src/services/unifiedDiagnosisService.js`：修改 `extractByRules()` 消费 `hints.deviceType/hints.model`。
- [ ] 同上：修改 `createSession()` 时的 `treeExecution.context`，携带机型信息。
- [ ] `TreeExecutorService`：新增对 `input` 节点类型的处理——存储值到 `session.context`，然后跳转到 `options.find(o => o.value === answer)?.goto`。
- [ ] `frontend/src/pages/GuidePage.jsx`：新增 `input` 节点的渲染逻辑（select/text 两种）。
- [ ] `frontend/src/pages/GuidePage.jsx`：wizard 模式下同样支持 `input` 节点（当前 wizard 和 interactive 共享节点渲染逻辑，应统一提取）。

---

## 四、问题三：整体诊断智能化不足 —— 结论像"抽盲盒"

### 4.1 现状定位

当前诊断结论的生成逻辑在 `DiagnosisGeneratorService.generate()` 中：

```js
// unifiedDiagnosisService.js 第340-410行
class DiagnosisGeneratorService {
  async generate(path, tree, intent, cases) {
    // 1. 从 path 收集步骤
    // 2. relatedCases = 根据 tree.id 或 path 中节点匹配的案例
    // 3. possibleCauses = 硬编码概率 [45%, 25%, 15%, 10%, 5%]
    // 4. confidence = 0.5 + terminal(0.2) + intent(0.15) + cases(0.1) + pathLength(0.05)
  }
}
```

**核心缺陷**：诊断结论与用户实际交互内容几乎无关。无论用户回答了什么，只要走到了同一个 terminal 节点，`possibleCauses` 的概率分布完全一致。

### 4.2 根因分析

1. **概率硬编码**：`['45%', '25%', '15%', '10%', '5%']` 与用户的 branchHistory 无关。
2. **置信度计算粗糙**：只考虑"有没有走到 terminal"和"路径长度"，不考虑用户回答的内容。
3. **AI 未被用于综合推理**：AI 只在"意图分类"和"分支解析"两个单点被调用，从未基于用户的完整交互历史做综合诊断。
4. **证据未被收集**：用户在第 3 步说"电池鼓包了"是一个强证据，但系统没有记录"这个证据支持原因 X、反对原因 Y"。

### 4.3 优化方案：证据驱动的动态诊断引擎

#### 4.3.1 引入证据板（Evidence Board）

在 `session` 中新增 `evidenceBoard`：

```js
// session 结构扩展
const session = {
  id,
  intent,
  treeExecution: { ... },
  evidenceBoard: {
    // 每个可能原因一张"卡片"
    causes: {
      'battery_cell_aging': {
        score: 0.3,           // 当前置信度 (0-1)
        supporting: [],       // 支持证据 [{nodeId, branch, weight, reason}]
        opposing: [],         // 反对证据
        lastUpdated: timestamp,
      },
      'charger_fault': {
        score: 0.1,
        supporting: [],
        opposing: [],
        lastUpdated: timestamp,
      },
    },
    // 全局状态
    topHypothesis: 'battery_cell_aging', // 当前最可能原因
    certainty: 0.45, // 整体确定性
  },
};
```

#### 4.3.2 分支权重自动更新证据板

在 `TreeExecutorService.execute()` 中，每次走到一个分支后，自动更新 evidenceBoard：

```js
// unifiedDiagnosisService.js 第584-591行附近增强
if (result.branchTaken) {
  exec.branchHistory.push({ nodeId: exec.currentNodeId, branch: result.branchTaken, userAnswer });

  // 新增：根据分支权重更新证据板
  const node = tree.nodes[exec.currentNodeId];
  const weights = node.dynamicBranches?.[result.branchTaken]?.weights;
  if (weights) {
    updateEvidenceBoard(session.evidenceBoard, weights, {
      nodeId: exec.currentNodeId,
      branch: result.branchTaken,
      userAnswer,
    });
  }
}
```

`updateEvidenceBoard` 逻辑：

```js
function updateEvidenceBoard(board, weights, evidence) {
  for (const [cause, delta] of Object.entries(weights)) {
    if (!board.causes[cause]) {
      board.causes[cause] = { score: 0.1, supporting: [], opposing: [] };
    }
    const card = board.causes[cause];
    const oldScore = card.score;
    card.score = clamp(card.score + delta, 0, 1);

    if (delta > 0) {
      card.supporting.push({ ...evidence, weight: delta, reason: `在"${evidence.nodeId}"节点回答支持该原因` });
    } else {
      card.opposing.push({ ...evidence, weight: Math.abs(delta), reason: `在"${evidence.nodeId}"节点回答反对该原因` });
    }
    card.lastUpdated = Date.now();
  }

  // 重新计算 topHypothesis
  const sorted = Object.entries(board.causes).sort((a, b) => b[1].score - a[1].score);
  board.topHypothesis = sorted[0]?.[0] || null;
  board.certainty = sorted[0]?.[1].score || 0;
}
```

#### 4.3.3 动态概率计算替代硬编码

修改 `DiagnosisGeneratorService.generate()`：

```js
async generate(path, tree, intent, cases, session) {
  const board = session?.evidenceBoard;

  // 1. 基础可能原因（来自案例库）
  const baseCauses = cases
    .filter(c => c.relatedTrees?.includes(tree.id))
    .map(c => ({
      id: c.id,
      cause: c.possibleCauses?.[0]?.cause || c.symptom,
      description: c.possibleCauses?.[0]?.description || '',
      baseScore: 0.2, // 基础分
    }));

  // 2. 叠加证据板分数
  const scoredCauses = baseCauses.map(c => {
    const evidence = board?.causes[c.cause] || { score: 0.1 };
    const finalScore = Math.min(c.baseScore + evidence.score, 1.0);
    return { ...c, score: finalScore, evidence };
  }).sort((a, b) => b.score - a.score);

  // 3. 转换为概率百分比（softmax）
  const probabilities = softmax(scoredCauses.map(c => c.score));
  const possibleCauses = scoredCauses.map((c, i) => ({
    cause: c.cause,
    probability: `${Math.round(probabilities[i] * 100)}%`,
    description: c.description,
    supportingEvidence: c.evidence?.supporting?.length || 0,
    opposingEvidence: c.evidence?.opposing?.length || 0,
  }));

  // 4. 动态置信度
  const confidence = this.calculateDynamicConfidence(path, tree, intent, board);

  return { possibleCauses, confidence, /* ... */ };
}
```

#### 4.3.4 AI 阶段性综合诊断（关键节点触发）

在交互式诊断中，每走完 3 个 question 节点，或到达 certainty > 0.7 时，触发 AI 综合诊断：

```js
// unifiedDiagnosisService.js 第593-605行增强
if (result.isComplete || shouldTriggerMidDiagnosis(session)) {
  const midDiagnosis = await generateAIDiagnosis(session);
  session.midDiagnosis = midDiagnosis; // 存入 session，前端可展示
}

function shouldTriggerMidDiagnosis(session) {
  const qCount = session.treeExecution.branchHistory.length;
  const certainty = session.evidenceBoard?.certainty || 0;
  return qCount >= 3 && qCount % 3 === 0 && certainty > 0.5;
}

async function generateAIDiagnosis(session) {
  const history = session.treeExecution.branchHistory
    .map(b => `- ${b.nodeId}: 用户回答"${b.userAnswer}"，走了${b.branch}分支`)
    .join('\n');

  const prompt = `你是一位资深无人机维修工程师。根据以下用户的交互记录，给出阶段性诊断结论：

用户初始描述：${session.intent.raw}
已走步骤：
${history}

当前证据板：
${JSON.stringify(session.evidenceBoard?.causes, null, 2)}

请输出：
1. 当前最可能的故障原因（附带置信度）
2. 建议下一步排查方向
3. 是否需要专业维修（是/否/待确认）

输出 JSON 格式。`;

  const response = await callAI(prompt, 0.3, 800);
  return parseJSON(response);
}
```

### 4.4 输入/输出规范

**Evidence Board 数据结构**

| 字段 | 类型 | 说明 |
|------|------|------|
| `causes` | Object | 键为原因名称，值为 EvidenceCard |
| `causes[].score` | number | 当前置信度 0-1 |
| `causes[].supporting` | Evidence[] | 支持证据列表 |
| `causes[].opposing` | Evidence[] | 反对证据列表 |
| `topHypothesis` | string | 当前最可能原因 |
| `certainty` | number | 整体确定性 0-1 |

**Evidence 结构**

| 字段 | 类型 | 说明 |
|------|------|------|
| `nodeId` | string | 产生该证据的节点 |
| `branch` | string | 用户走的分支 |
| `userAnswer` | string | 用户原始回答 |
| `weight` | number | 权重值 |
| `reason` | string | 人类可读的原因说明 |

**前端展示增强（GuidePage.jsx）**

在 interactive 模式的 Step Card 下方，新增"实时诊断洞察"区域：

```jsx
{session.evidenceBoard && (
  <div className="bg-blue-50 rounded-lg p-4 mb-6">
    <div className="text-sm text-blue-600 font-medium mb-2">
      当前最可能：{evidenceBoard.topHypothesis}（置信度 {Math.round(evidenceBoard.certainty * 100)}%）
    </div>
    {evidenceBoard.causes[evidenceBoard.topHypothesis]?.supporting.slice(0, 2).map((e, i) => (
      <div key={i} className="text-xs text-blue-500">• {e.reason}</div>
    ))}
  </div>
)}
```

### 4.5 修复清单

- [ ] `backend/src/services/unifiedDiagnosisService.js`：在 `session` 结构中新增 `evidenceBoard` 初始化。
- [ ] 同上：修改 `TreeExecutorService.execute()`，在分支记录后调用 `updateEvidenceBoard()`。
- [ ] 同上：修改 `DiagnosisGeneratorService.generate()`，消费 `session.evidenceBoard` 动态计算概率。
- [ ] 同上：新增 `shouldTriggerMidDiagnosis()` 和 `generateAIDiagnosis()` 函数。
- [ ] `frontend/src/pages/GuidePage.jsx`：interactive 模式下展示 evidenceBoard 实时洞察。
- [ ] `data/decision-trees.json`：为关键 question 节点的 `dynamicBranches` 补充 `weights` 字段（需要维修专家知识）。

---

## 五、优化后的交互流程总览

```
用户输入症状
    │
    ▼
┌─────────────────┐
│ IntentParser    │ ──→ 提取品牌、机型、故障类型（优先使用前端结构化 hints）
└─────────────────┘
    │
    ▼
┌─────────────────┐
│ TreeRouter      │ ──→ 匹配决策树
└─────────────────┘
    │
    ▼
┌─────────────────┐
│ DynamicPath     │ ──→ 评估节点条件，自动跳过不适用的步骤
│ Service         │     （如：已知机型 → 跳过机型输入节点）
└─────────────────┘
    │
    ▼
┌─────────────────┐
│ 节点类型判断     │
└─────────────────┘
    │
    ├── input 节点 ──→ 收集信息 → 存入 session.context
    │                     │
    │                     ▼
    │              DynamicPath 重新计算下一步
    │
    ├── question 节点 ──→ 用户回答
    │                         │
    │                         ▼
    │              resolveBranch（规则 → 追问检测 → AI）
    │                         │
    │                         ▼
    │              更新 Evidence Board（分支权重）
    │                         │
    │                         ▼
    │              DynamicPath 计算下一步
    │
    └── terminal 节点 ──→ DiagnosisGenerator
                              │
                              ▼
                    动态概率（Evidence Board + Softmax）
                              │
                              ▼
                    AI 综合诊断（关键节点已触发 mid-diagnosis）
                              │
                              ▼
                         返回结构化诊断报告
```

---

## 六、实施优先级与里程碑

### Phase 1（1-2 天）：机型贯通（问题二）
- 风险最低，用户感知最明显。
- 前端选了机型后，诊断流程立刻"认识"用户。
- 涉及文件：`HomePage.jsx`, `unifiedDiagnosisService.js`, `decision-trees.json`。

### Phase 2（2-3 天）：动态路径（问题一）
- 引入 `DynamicPathService` 和 `input` 节点类型。
- 需要修改决策树数据结构，建议先在一棵树（如 `tree-battery`）上试点。
- 涉及文件：`dynamicPathService.js`（新增）, `unifiedDiagnosisService.js`, `GuidePage.jsx`, `decision-trees.json`。

### Phase 3（3-4 天）：智能结论（问题三）
- 引入 Evidence Board 和 AI 阶段性诊断。
- 需要维修专家为每个分支填写 `weights`（可与开发并行）。
- 涉及文件：`unifiedDiagnosisService.js`, `GuidePage.jsx`。

### Phase 4（1 天）：端到端验证
- 设计 10 个真实故障场景，验证动态路径、机型跳过、概率变化是否符合预期。

---

## 七、附录：关键接口变更汇总

| 接口 | 变更 | 影响面 |
|------|------|--------|
| `POST /api/diagnosis/unified` | 返回体新增 `midDiagnosis`（阶段性诊断） | 前端 interactive 模式 |
| `POST /api/diagnosis/unified` | `userAnswer` 支持 JSON 字符串（input 节点） | 前端 input 节点提交 |
| `GET /api/diagnosis/unified/session/:id` | 返回体新增 `evidenceBoard` 和 `context` | 前端实时洞察展示 |
| 决策树 JSON Schema | 新增 `input` 类型、`conditions`、`dynamicBranches.weights` | 数据维护者 |

---

*本文档基于 v2.0 统一诊断架构现状编写，所有代码示例可直接作为实现参考。*
