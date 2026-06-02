# DroneDoctor 统一诊断架构设计

> 版本: v2.0
> 目标: 将单轮AI诊断、多轮对话诊断、决策树向导整合为以决策树为核心骨架的统一流程
> 日期: 2026-06-01

---

## 1. 核心设计哲学

**决策树是骨架，AI是肌肉，案例库是血液。**

- **决策树**: 定义所有可能的诊断路径（SOP标准化流程），提供确定性骨架
- **AI**: 负责两件事——(1) 从自然语言中定位到决策树入口；(2) 在每个节点动态增强内容（个性化描述、自然语言分支解析）
- **案例库**: 为每个决策树节点提供真实故障数据支撑，双向绑定

所有诊断（单轮/多轮）都依托同一套决策树数据，区别仅在于**用户交互方式**不同。

---

## 2. 整体架构图

```
┌─────────────────────────────────────────────────────────────────────┐
│                        用户输入层                                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │ 自然语言输入  │  │ 结构化选择    │  │ 图片输入      │              │
│  │ "无法开机"   │  │ 机型→故障类型 │  │ 故障照片      │              │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘              │
└─────────┼─────────────────┼─────────────────┼──────────────────────┘
          │                 │                 │
          └─────────────────┴─────────────────┘
                            │
          ┌─────────────────▼─────────────────┐
          │     [Layer 1] 意图解析引擎          │
          │  ┌──────────────────────────────┐  │
          │  │  规则提取: 品牌/型号/故障类型   │  │
          │  │  AI确认:   故障分类置信度       │  │
          │  │  输出:     Intent {brand,      │  │
          │  │            model, faultType,   │  │
          │  │            keywords,           │  │
          │  │            confidence}         │  │
          │  └──────────────────────────────┘  │
          └─────────────────┬─────────────────┘
                            │
          ┌─────────────────▼─────────────────┐
          │     [Layer 2] 决策树路由层         │
          │  ┌──────────────────────────────┐  │
          │  │  故障类型映射表 → 目标决策树    │  │
          │  │  高置信度 → 直接进入            │  │
          │  │  低置信度 → 推荐交互式诊断       │  │
          │  │  无匹配   → 通用排查流程         │  │
          │  └──────────────────────────────┘  │
          └─────────────────┬─────────────────┘
                            │
          ┌─────────────────┼─────────────────┐
          │                 │                 │
    ┌─────▼─────┐    ┌─────▼─────┐    ┌─────▼─────┐
    │ 快速诊断   │    │ 交互式诊断 │    │ 通用诊断   │
    │ (单轮预览) │    │ (多轮向导) │    │ (无匹配时) │
    └─────┬─────┘    └─────┬─────┘    └─────┬─────┘
          │                 │                 │
          └─────────────────┼─────────────────┘
                            │
          ┌─────────────────▼─────────────────┐
          │     [Layer 3] 决策树执行引擎        │
          │  ┌──────────────────────────────┐  │
          │  │  TreeExecutorService         │  │
          │  │  - 维护当前节点位置           │  │
          │  │  - 解析用户回答→分支选择       │  │
          │  │  - 支持自然语言/按钮两种输入    │  │
          │  │  - 记录完整路径               │  │
          │  └──────────────────────────────┘  │
          └─────────────────┬─────────────────┘
                            │
          ┌─────────────────▼─────────────────┐
          │     [Layer 4] 诊断生成层           │
          │  ┌──────────────────────────────┐  │
          │  │  路径 → 诊断摘要               │  │
          │  │  节点 → 案例关联               │  │
          │  │  置信度 → 基于路径匹配度计算    │  │
          │  └──────────────────────────────┘  │
          └─────────────────┬─────────────────┘
                            │
          ┌─────────────────▼─────────────────┐
          │     [Layer 5] 结果关联与行动引导    │
          │  ┌──────────────────────────────┐  │
          │  │  诊断结果 + 决策树路径         │  │
          │  │  相关案例 (caseId 双向绑定)    │  │
          │  │  下一步行动: 执行决策树/看案例   │  │
          │  └──────────────────────────────┘  │
          └─────────────────────────────────────┘
```

---

## 3. 数据模型改造

### 3.1 故障类型统一映射表 (fault-type-map.json)

建立前端选项、案例库、决策树之间的统一桥梁：

```json
{
  "version": "2.0",
  "faultTypes": [
    {
      "id": "power-on",
      "label": "无法开机/电源问题",
      "keywords": ["无法开机", "开不了机", "没反应", "不通电", "电源键没反应", "按开关没反应"],
      "trees": ["tree-power-on"],
      "caseTags": ["电源", "开机", "无法开机"],
      "icon": "🔌",
      "urgency": "high"
    },
    {
      "id": "link-test",
      "label": "链路测试报错",
      "keywords": ["链路测试", "ET7KY13", "报错", "NG", "FAIL", "测试失败"],
      "trees": ["tree-link-test"],
      "caseTags": ["链路", "测试", "核心板", "电调板"],
      "icon": "🔧",
      "urgency": "medium"
    },
    {
      "id": "gimbal",
      "label": "云台故障",
      "keywords": ["云台", "相机", "花屏", "条纹", "不清晰", "卡住", "不转", "异响"],
      "trees": ["tree-gimbal"],
      "caseTags": ["云台", "相机", "图像", "轴臂"],
      "icon": "📷",
      "urgency": "medium"
    },
    {
      "id": "battery",
      "label": "电池问题",
      "keywords": ["电池", "充电", "鼓包", "续航", "充不进", "电量", "PF"],
      "trees": ["tree-battery"],
      "caseTags": ["电池", "充电", "续航", "PF"],
      "icon": "🔋",
      "urgency": "high"
    },
    {
      "id": "video",
      "label": "图传异常",
      "keywords": ["图传", "黑屏", "花屏", "延迟", "断图", "无画面", "信号弱"],
      "trees": ["tree-link-test"],
      "caseTags": ["图传", "信号", "画面"],
      "icon": "📺",
      "urgency": "medium"
    },
    {
      "id": "gps",
      "label": "GPS信号异常",
      "keywords": ["GPS", "卫星", "定位", "信号弱", "搜星", "无法定位"],
      "trees": [],
      "caseTags": ["GPS", "导航", "定位"],
      "icon": "📡",
      "urgency": "low"
    },
    {
      "id": "flight",
      "label": "飞行异常",
      "keywords": ["无法起飞", "起飞失败", "漂移", "不稳", "坠落", "失控"],
      "trees": [],
      "caseTags": ["飞行", "起飞", "姿态"],
      "icon": "✈️",
      "urgency": "high"
    }
  ]
}
```

### 3.2 增强决策树节点结构

每个节点增加 `ai` 字段，供AI动态增强：

```json
{
  "id": "po-start",
  "type": "question",
  "title": "按电源键可开机？",
  "description": "按下电源键3秒，观察指示灯和电机自检动作",
  "criteria": "指示灯正常亮起，或有电机自检声音",
  "tools": [],
  "estimatedTime": "1分钟",
  "caseId": "F099",
  "ai": {
    "contextPrompt": "用户报告了电源相关故障，需要确认按下电源键后设备是否有任何反应",
    "expectedAnswers": {
      "yes": ["能开机", "有反应", "灯亮了", "电机响了", "屏幕亮了"],
      "no": ["无法开机", "没反应", "灯不亮", "按了没反应", "完全没动静"]
    },
    "clarificationHint": "请确认：按下电源键后，是否有指示灯亮起或电机自检的声音？",
    "dynamicDescription": "根据用户之前提到的{symptom}，重点观察电源键按下后的反应"
  },
  "yes": {
    "label": "✅ 可以开机",
    "goto": "po-data-analysis",
    "aiMapping": ["能", "可以", "正常", "亮了", "有反应", "开机了"]
  },
  "no": {
    "label": "❌ 无法开机",
    "goto": "po-replace-battery",
    "aiMapping": ["不能", "无法", "没反应", "不亮", "坏了", "没动静"]
  }
}
```

### 3.3 案例库增强 (反向关联决策树)

```json
{
  "id": "F099",
  "faultType": "power-on",
  "faultTypeLabel": "无法开机",
  "symptom": "无人机按电源键无反应",
  "keywords": ["无法开机", "开不了机", "电源键没反应", "按开关没反应"],
  "relatedTrees": ["tree-power-on"],
  "relatedNodes": ["po-start", "po-replace-battery"],
  "applicableModels": ["Mavic 3", "Air 3", "Mini 4 Pro"],
  "possibleCauses": [...],
  "troubleshootingSteps": [...],
  "reviewStatus": "approved"
}
```

---

## 4. 服务层设计

### 4.1 统一API入口

```
POST /api/diagnosis/unified
```

**请求体：**

```typescript
interface UnifiedDiagnosisRequest {
  // 诊断模式
  mode: 'quick' | 'interactive';

  // 用户输入（自然语言或结构化）
  input: string;

  // 结构化信息（可选，来自前端三步选择）
  deviceType?: string;  // 'mavic' | 'air' | 'mini' | ...
  faultType?: string;   // 'power-on' | 'gimbal' | 'battery' | ...

  // 交互式模式必填
  sessionId?: string;       // 首次为空，后续传入
  currentNodeId?: string;   // 当前决策树节点ID
  userAnswer?: string;      // 用户对当前节点的回答

  // 上下文
  model?: string;           // 具体型号
  imageUrl?: string;        // 图片诊断（未来扩展）
}
```

**响应体（快速诊断模式）：**

```typescript
interface QuickDiagnosisResponse {
  success: true;
  mode: 'quick';

  // 意图解析结果
  intent: {
    brand: string | null;
    model: string | null;
    faultType: string;
    faultTypeLabel: string;
    confidence: number;  // 0-1
  };

  // 匹配的决策树
  matchedTree: {
    id: string;
    name: string;
    category: string;
  };

  // AI预测的完整路径
  predictedPath: {
    nodes: Array<{
      id: string;
      title: string;
      description: string;
      type: 'question' | 'action' | 'terminal';
    }>;
    terminalNode: {
      id: string;
      conclusion: string;
      recommendation: string;
    };
  };

  // 诊断摘要
  diagnosis: {
    faultType: string;
    possibleCauses: Array<{ cause: string; probability: string; description: string }>;
    steps: Array<{ step: number; operation: string; criteria: string; solution: string; estimatedTime: string }>;
    totalEstimatedTime: string;
    difficulty: string;
    needProfessionalRepair: boolean;
  };

  // 关联资源
  relatedCases: Array<{ id: string; symptom: string; matchScore: number }>;
  relatedTreeId: string;

  // 置信度
  confidence: number;
  confidenceReason: string;

  // 行动引导
  suggestedActions: Array<{
    type: 'start-tree' | 'view-case' | 'interactive';
    label: string;
    targetId: string;
  }>;
}
```

**响应体（交互式模式）：**

```typescript
interface InteractiveDiagnosisResponse {
  success: true;
  mode: 'interactive';
  sessionId: string;

  // 当前状态
  status: 'active' | 'completed';
  currentNode: {
    id: string;
    title: string;
    description: string;
    type: 'question' | 'action' | 'terminal';
    criteria?: string;
    tools?: string[];
    estimatedTime?: string;
    caseId?: string;
  };

  // AI增强的交互提示
  aiPrompt: {
    message: string;           // AI生成的个性化提示
    suggestedAnswers: string[]; // 建议回答（用于按钮展示）
    allowFreeText: boolean;    // 是否允许自由文本输入
  };

  // 进度
  progress: {
    currentStep: number;
    totalSteps: number;  // 基于当前预测路径的动态总步数
    path: string[];      // 已走过的节点ID
  };

  // 如果已完成
  diagnosis?: QuickDiagnosisResponse['diagnosis'];
  terminalNode?: { conclusion: string; recommendation: string };
}
```

### 4.2 核心服务

#### IntentParserService（意图解析引擎）

```javascript
class IntentParserService {
  /**
   * 解析用户输入，提取结构化意图
   * @param {string} input - 用户原始输入
   * @param {Object} structuredHints - 前端已知的结构化信息（如 deviceType, faultType）
   * @returns {Intent} { brand, model, faultType, faultTypeLabel, keywords, confidence, raw }
   */
  async parse(input, structuredHints = {}) {
    // Step 1: 规则提取（快速、确定性强）
    const ruleResult = this.extractByRules(input, structuredHints);

    // Step 2: 如果规则提取的 faultType 置信度不够高，用AI确认
    let faultType = ruleResult.faultType;
    let confidence = ruleResult.confidence;

    if (confidence < 0.8 || !faultType) {
      const aiResult = await this.classifyWithAI(input, ruleResult);
      faultType = aiResult.faultType;
      confidence = aiResult.confidence;
    }

    // Step 3: 补全信息
    const faultTypeConfig = FAULT_TYPE_MAP.find(f => f.id === faultType);

    return {
      brand: ruleResult.brand,
      model: ruleResult.model || structuredHints.model,
      faultType,
      faultTypeLabel: faultTypeConfig?.label || '未知故障',
      keywords: ruleResult.keywords,
      confidence,
      raw: input
    };
  }

  extractByRules(input, hints) {
    const text = input.toLowerCase();
    const result = { brand: null, model: null, faultType: null, keywords: [], confidence: 0 };

    // 品牌提取（同义词表）
    for (const [brand, keywords] of Object.entries(BRAND_PATTERNS)) {
      if (keywords.some(k => text.includes(k.toLowerCase()))) {
        result.brand = brand;
        break;
      }
    }

    // 故障类型提取（基于映射表关键词）
    let bestMatch = { faultType: null, score: 0 };
    for (const ft of FAULT_TYPE_MAP) {
      const matchedKeywords = ft.keywords.filter(k => text.includes(k.toLowerCase()));
      const score = matchedKeywords.length / ft.keywords.length;
      if (score > bestMatch.score) {
        bestMatch = { faultType: ft.id, score };
      }
    }

    result.faultType = hints.faultType || bestMatch.faultType;
    result.confidence = hints.faultType ? 0.95 : bestMatch.score;  // 前端给了faultType则置信度很高
    result.keywords = [...new Set([...bestMatch.matchedKeywords || []])];

    return result;
  }

  async classifyWithAI(input, ruleResult) {
    const prompt = `分析以下无人机故障描述，判断最可能的故障类型：

用户输入: "${input}"
规则提取结果: ${JSON.stringify(ruleResult)}

可选故障类型:
${FAULT_TYPE_MAP.map(f => `- ${f.id}: ${f.label} (关键词: ${f.keywords.join(', ')})`).join('\n')}

请输出JSON格式:
{
  "faultType": "最匹配的故障类型ID",
  "confidence": 0-1之间的数字,
  "reason": "简要说明判断理由"
}`;

    const response = await callAI(prompt);
    return JSON.parse(response);
  }
}
```

#### TreeRouterService（决策树路由）

```javascript
class TreeRouterService {
  /**
   * 根据意图选择最合适的决策树
   */
  route(intent) {
    const faultConfig = FAULT_TYPE_MAP.find(f => f.id === intent.faultType);

    if (!faultConfig || !faultConfig.trees || faultConfig.trees.length === 0) {
      return {
        treeId: null,
        entryNodeId: null,
        confidence: 0,
        reason: '暂无匹配的决策树，将使用通用排查流程',
        fallback: true
      };
    }

    // 如果有多个树，选最匹配的（目前先取第一个，未来可按症状细化）
    const treeId = faultConfig.trees[0];
    const tree = loadTree(treeId);

    return {
      treeId,
      entryNodeId: tree.startNode,
      confidence: intent.confidence,
      reason: `根据故障类型"${faultConfig.label}"匹配到决策树"${tree.name}"`,
      fallback: false
    };
  }
}
```

#### TreeExecutorService（决策树执行引擎）

```javascript
class TreeExecutorService {
  /**
   * 执行决策树：根据当前节点和用户回答，推进到下一节点
   */
  async execute(treeId, currentNodeId, userAnswer, sessionContext = {}) {
    const tree = loadTree(treeId);
    const node = tree.nodes[currentNodeId];

    if (!node) {
      throw new Error(`Node ${currentNodeId} not found in tree ${treeId}`);
    }

    // Terminal节点：诊断完成
    if (node.type === 'terminal') {
      return {
        nextNodeId: null,
        branchTaken: null,
        isComplete: true,
        terminalNode: node,
        path: [...sessionContext.path, currentNodeId]
      };
    }

    // Action节点：只有一个"继续"分支
    if (node.type === 'action') {
      return {
        nextNodeId: node.next.goto,
        branchTaken: 'next',
        isComplete: false,
        nextNode: tree.nodes[node.next.goto],
        path: [...sessionContext.path, currentNodeId]
      };
    }

    // Question节点：需要解析用户回答确定分支
    if (node.type === 'question') {
      const branch = await this.resolveBranch(node, userAnswer, sessionContext);

      const targetNodeId = branch === 'yes' ? node.yes.goto : node.no.goto;

      return {
        nextNodeId: targetNodeId,
        branchTaken: branch,
        isComplete: false,
        nextNode: tree.nodes[targetNodeId],
        path: [...sessionContext.path, currentNodeId]
      };
    }
  }

  /**
   * 解析用户回答到决策分支
   */
  async resolveBranch(node, userAnswer, context) {
    const answer = userAnswer.toLowerCase().trim();

    // Step 1: 规则匹配（基于 aiMapping）
    const yesPatterns = (node.yes.aiMapping || []).map(p => p.toLowerCase());
    const noPatterns = (node.no.aiMapping || []).map(p => p.toLowerCase());

    for (const pattern of yesPatterns) {
      if (answer.includes(pattern)) return 'yes';
    }
    for (const pattern of noPatterns) {
      if (answer.includes(pattern)) return 'no';
    }

    // Step 2: 如果规则匹配失败，用AI判断
    const aiResult = await this.aiClassifyBranch(node, userAnswer, context);
    return aiResult;
  }

  async aiClassifyBranch(node, userAnswer, context) {
    const prompt = `你在指导用户进行无人机故障排查。当前步骤是：

"${node.title}"
判定标准: ${node.criteria}

用户的回答是: "${userAnswer}"

请判断这个回答对应"符合标准"还是"不符合标准"：
- "符合标准"意味着用户确认了这个条件（例如: 能开机、测试通过、正常）
- "不符合标准"意味着用户否定或报告异常（例如: 不能开机、测试失败、异常）

请只输出 "yes" 或 "no"`;

    const response = await callAI(prompt);
    const result = response.toLowerCase().trim();

    if (result.includes('yes')) return 'yes';
    if (result.includes('no')) return 'no';

    // 如果AI也无法判断，默认走"异常"分支（更安全的做法）
    return 'no';
  }
}
```

#### DiagnosisGeneratorService（诊断生成器）

```javascript
class DiagnosisGeneratorService {
  /**
   * 基于决策树路径生成诊断报告
   */
  async generate(path, tree, intent, cases) {
    const terminalNode = tree.nodes[path[path.length - 1]];

    // 收集路径上的所有action/question节点作为排查步骤
    const steps = [];
    let stepNum = 1;
    for (const nodeId of path) {
      const node = tree.nodes[nodeId];
      if (node.type === 'action' || node.type === 'question') {
        steps.push({
          step: stepNum++,
          operation: node.title,
          criteria: node.criteria || '按步骤执行',
          solution: node.description,
          tools: node.tools || [],
          estimatedTime: node.estimatedTime || '2分钟',
          caseId: node.caseId
        });
      }
    }

    // 从案例库中提取可能原因
    const relatedCases = cases.filter(c =>
      c.relatedTrees?.includes(tree.id) ||
      path.some(nid => c.relatedNodes?.includes(nid))
    );

    const possibleCauses = relatedCases.slice(0, 5).map((c, i) => ({
      cause: c.possibleCauses?.[0]?.cause || c.symptom,
      probability: ['45%', '25%', '15%', '10%', '5%'][i] || '5%',
      description: c.possibleCauses?.[0]?.description || ''
    }));

    // 计算置信度（基于路径完整度和意图匹配度）
    const confidence = this.calculateConfidence(path, tree, intent, relatedCases);

    return {
      faultType: tree.category,
      possibleCauses,
      steps,
      totalEstimatedTime: this.estimateTotalTime(steps),
      difficulty: steps.length > 10 ? '⭐⭐⭐' : steps.length > 5 ? '⭐⭐' : '⭐',
      needProfessionalRepair: terminalNode.conclusion?.includes('待确认') || false,
      terminalConclusion: terminalNode.conclusion,
      terminalRecommendation: terminalNode.recommendation,
      confidence,
      relatedCases: relatedCases.map(c => ({ id: c.id, symptom: c.symptom })),
      relatedTreeId: tree.id
    };
  }

  calculateConfidence(path, tree, intent, cases) {
    let score = 0.5;

    // 路径是否走到terminal节点
    const terminalNode = tree.nodes[path[path.length - 1]];
    if (terminalNode?.type === 'terminal') score += 0.2;

    // 意图置信度
    score += intent.confidence * 0.15;

    // 是否有相关案例支撑
    if (cases.length > 0) {
      score += Math.min(cases.length * 0.05, 0.1);
    }

    // 路径长度（步骤越多通常越具体）
    if (path.length >= 3) score += 0.05;

    return Math.min(score, 0.98);
  }
}
```

---

## 5. 前端统一流程

### 5.1 用户旅程

```
                    ┌─────────────────┐
                    │    首页入口      │
                    └────────┬────────┘
                             │
         ┌───────────────────┼───────────────────┐
         │                   │                   │
         ▼                   ▼                   ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│  自然语言输入框  │ │ 结构化三步选择   │ │   图片上传入口   │
│  "无法开机"     │ │ 机型→故障→描述   │ │   📷 拍照诊断    │
└────────┬────────┘ └────────┬────────┘ └────────┬────────┘
         │                   │                   │
         └───────────────────┼───────────────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │  [后端] 意图解析  │
                    │  + 决策树路由     │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
    confidence >= 0.8       0.5-0.8      < 0.5
              │              │              │
              ▼              ▼              ▼
    ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
    │   快速诊断结果页  │ │   快速诊断结果页  │ │   交互式诊断入口  │
    │  (显示完整路径)   │ │  (提示"不确定")   │ │  (引导用户对话)   │
    │  + "开始执行"按钮 │ │  + "详细排查"按钮 │ │                 │
    └────────┬────────┘ └────────┬────────┘ └────────┬────────┘
             │                   │                   │
             └───────────────────┼───────────────────┘
                                 │
                                 ▼
                        ┌─────────────────┐
                        │  交互式诊断页面   │
                        │  /guide/:treeId  │
                        │  (统一使用Guide页)│
                        └─────────────────┘
                                 │
                    ┌────────────┼────────────┐
                    │            │            │
                    ▼            ▼            ▼
            ┌──────────┐ ┌──────────┐ ┌──────────┐
            │ 逐步执行  │ │ 查看案例  │ │ 保存结果  │
            │ 决策树节点│ │  (caseId) │ │  (登录后) │
            └──────────┘ └──────────┘ └──────────┘
```

### 5.2 前端页面整合

**删除的页面：**
- `/diagnosis` → 结果展示整合到 `/guide/:treeId?result=true`
- `/conversation` → 功能整合到 `/guide/:treeId?mode=interactive`

**保留的页面：**
- `/` 首页（保留三步选择和快速入口，但底层调用统一API）
- `/guide` 维修助手菜单
- `/guide/:treeId` 统一诊断执行页（支持快速预览+交互式两种模式）
- `/image-diagnosis` 图片诊断（未来接入统一架构）

**新增的API：**
- `POST /api/diagnosis/unified` 统一诊断入口
- `GET /api/diagnosis/intent?input=xxx` 意图解析（用于前端实时提示）

### 5.3 快速诊断结果页改造

快速诊断结果不再是一个独立页面，而是**决策树执行页的一个特殊状态**——显示"预览模式"：

```jsx
// GuidePage 中增加 preview 模式
if (mode === 'preview') {
  return (
    <div>
      {/* 顶部：AI预测的结论 */}
      <AIConclusionCard
        conclusion={previewData.terminalConclusion}
        confidence={previewData.confidence}
      />

      {/* 中部：预测路径可视化 */}
      <PredictedPathTimeline
        nodes={previewData.predictedPath.nodes}
        currentStep={0}
      />

      {/* 底部：行动引导 */}
      <ActionButtons>
        <Button onClick={() => startInteractiveMode()}>
          🔧 开始逐步排查（推荐）
        </Button>
        <Button variant="secondary" onClick={() => viewCases()}>
          📋 查看相关案例
        </Button>
        <Button variant="ghost" onClick={() => restartWithDifferentInput()}>
          描述不准确？重新输入
        </Button>
      </ActionButtons>
    </div>
  );
}
```

---

## 6. 会话状态管理

### 6.1 会话数据结构

```javascript
interface DiagnosisSession {
  id: string;
  createdAt: number;
  lastActivityAt: number;
  status: 'active' | 'completed' | 'expired';

  // 意图信息（解析后不变）
  intent: {
    brand: string | null;
    model: string | null;
    faultType: string;
    rawInput: string;
  };

  // 决策树执行状态
  treeExecution: {
    treeId: string;
    currentNodeId: string;
    path: string[];           // 已走过的节点ID
    branchHistory: Array<{    // 每个question节点的分支选择
      nodeId: string;
      branch: 'yes' | 'no' | 'next';
      userAnswer: string;
    }>;
  };

  // 诊断结果（完成后填充）
  diagnosis: DiagnosisResult | null;

  // 用户交互记录
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
    type: 'input' | 'node-prompt' | 'branch-confirmation' | 'diagnosis';
    timestamp: number;
  }>;
}
```

### 6.2 会话生命周期

```
用户输入 → 创建会话 → 意图解析 → 决策树路由 → [快速诊断返回结果 / 交互式诊断持续推进]
                                    ↓
                              交互式诊断中:
                              - 每步用户回答 → TreeExecutor → 推进到下一节点
                              - 支持"上一步"：从 path 中弹出，回退到上一节点
                              - 支持"重新开始"：重置 path，回到 startNode
                              - 到达 terminal → 生成诊断报告 → 状态变为 completed
```

---

## 7. 迁移计划

### Phase 1: 数据层改造（1-2天）

1. **创建 `fault-type-map.json`**：统一故障类型映射表
2. **增强决策树数据**：给每个节点添加 `ai` 字段和 `aiMapping`
3. **增强案例库**：添加 `relatedTrees` 和 `relatedNodes` 字段
4. **创建统一路由表**：前端故障选项ID → 后端 faultType 映射

### Phase 2: 后端服务层（2-3天）

1. **实现 IntentParserService**
2. **实现 TreeRouterService**
3. **实现 TreeExecutorService**
4. **实现 DiagnosisGeneratorService**
5. **创建 `POST /api/diagnosis/unified` API**
6. **保持旧API兼容**（`POST /api/diagnosis`、`/api/diagnosis/conversation/*` 保留但标记deprecated）

### Phase 3: 前端改造（2-3天）

1. **HomePage**：底层调用 unified API，保留UI不变
2. **GuidePage**：增强为支持 preview + interactive 两种模式
3. **删除 DiagnosisPage 和 ConversationPage**，或改为重定向到 GuidePage
4. **DiagnosisCounter**：适配新API的次数统计

### Phase 4: 数据验证与优化（1-2天）

1. 用真实故障描述测试意图解析准确率
2. 测试决策树分支解析的准确率
3. 调整 `aiMapping` 和故障类型关键词覆盖度
4. 优化置信度计算权重

---

## 8. 关键设计决策说明

### 为什么用决策树做骨架，而不是AI直接诊断？

| 维度 | AI直接诊断 | 决策树骨架+AI增强 |
|------|-----------|------------------|
| 确定性 | 低，每次回答可能不同 | 高，同一路径结果一致 |
| 可解释性 | 差，黑盒推理 | 好，每一步可追溯 |
| 维修专业性 | 依赖训练数据质量 | 依赖SOP流程设计，更可控 |
| 用户体验 | 像聊天，但可能跑偏 | 像向导，有明确进度感 |
| 维护成本 | 需要持续微调模型prompt | 只需维护决策树数据和映射规则 |
| 适合场景 | 开放式问题 | 标准化维修流程 |

无人机维修是**高度标准化的SOP流程**，决策树天然适合。AI的价值在于**降低用户使用决策树的门槛**（自然语言入口、智能分支解析），而不是替代决策树。

### 为什么保留快速诊断（单轮）模式？

快速诊断不是"不走决策树"，而是"AI模拟走一遍决策树，提前告诉用户最可能的结果"。它的价值在于：
- 给用户即时反馈（3秒内看到结论）
- 让用户判断"这个方向对不对"，再决定是否投入时间逐步排查
- 低置信度时引导进入交互式模式

### 自然语言回答如何映射到 yes/no？

两级解析：
1. **规则匹配**：基于 `aiMapping` 的同义词匹配（快速、零成本）
2. **AI分类**：规则失败时调用AI判断（准确、有成本）

实际使用中，80%以上的用户回答可以被规则覆盖（"能/不能"/"有/没有"/"正常/异常"）。

---

## 9. 待讨论点

1. **图片诊断如何接入统一架构？**
   - 方案A：图片 → AI识别故障类型 → 进入统一流程
   - 方案B：图片作为交互式诊断中的一个节点（"请上传故障部位照片"）

2. **通用排查流程（无匹配决策树时）怎么做？**
   - 方案A：走一个"通用故障排查"决策树（定损前检查 → 分类推荐）
   - 方案B：fallback到纯AI诊断（保留现有AI诊断作为兜底）

3. **是否需要支持用户在交互式诊断中"跳步"？**
   - 例如用户说"我已经确认电池没问题了，直接看电调板"
   - 这需要在 TreeExecutor 中支持非相邻节点的跳转

4. **决策树的进度计算优化**
   - 当前 `totalSteps = Object.keys(tree.nodes).length` 包含terminal节点
   - 建议改为基于"从当前节点到terminal的最短路径"动态计算

---

*本设计文档基于对现有代码的深度审计，针对发现的三轨并行、数据降级、意图误判、置信度失真等核心问题提出统一化改造方案。*
