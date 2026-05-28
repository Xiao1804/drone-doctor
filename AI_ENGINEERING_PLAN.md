# DroneDoctor AI 工程方案 v1.0

> **硬件约束**：腾讯云轻量 2核CPU / 4GB内存 / 60GB系统盘
> **核心原则**：推理走 API，本地只跑 embedding + 向量检索 + 业务编排
> **目标**：让 AI 诊断从"关键词匹配"进化到"语义理解+多模态感知"

---

## 一、现状诊断：为什么现在"不AI"

| 问题 | 根因 | 用户体感 |
|------|------|---------|
| 像搜索引擎 | 关键词匹配 + 同义词扩展 → 本质是检索 | "我问一句它搜一下" |
| 没有推理过程 | LLM 只负责"包装"检索结果，不参与推理 | "它怎么知道是这个故障？" |
| 不会看图片 | 有 `imageRecognitionService` 但没接入前端诊断流 | "上传了照片它不看" |
| 不会预测 | 只有事后诊断，没有事前预警 | "坏了才知道修" |
| 多轮像审问 | `infoChecklist` 是硬编码清单，不是自然对话 | "跟填表一样" |

**核心矛盾**：现在的系统 = `检索引擎 + LLM润色`，不是真正的 `AI推理引擎`。

---

## 二、三阶段实施路线

### Phase 1：诊断"AI化"（2周）——让现有诊断真正智能

**目标**：替换关键词匹配为语义检索 + 推理链可视化 + 不确定性表达

#### 1.1 向量语义检索（替换关键词匹配）

```
用户输入："M300 图传画面一卡一卡的"

旧方案：
  关键词提取 → "M300" + "图传" + "卡顿" 
  → 同义词扩展 "卡顿"→["延迟","掉帧"] 
  → 编辑距离模糊匹配 
  → 返回 4 个案例

新方案：
  用户query → embedding → pgvector 语义检索 
  → "图传延迟严重"(score:0.91) 
  → "信号干扰导致图传不稳定"(score:0.87)
  → 返回 5 个案例 + 语义相似度分数
```

**技术实现**：
- **Embedding 模型**：`bge-small-zh-v1.5`（~50MB，CPU推理 <100ms，2核4G可跑）
- **向量库**：已有的 PostgreSQL + pgvector（扩展 `vector(512)` 维度）
- **索引**：IVFFlat（4G内存够建）
- **召回策略**：混合检索 = 向量语义检索(权重0.7) + BM25关键词(权重0.3)

#### 1.2 推理链可视化（Chain of Thought）

LLM 不直接给答案，先展示思考过程：

```json
{
  "thinking": [
    "用户提到'M300'和'图传卡顿'",
    "案例库中找到3个高度相似的图传故障案例",
    "其中2个与2.4G频段干扰相关，1个与天线角度相关",
    "用户未提及距离因素，排除距离过远",
    "综合判断：最可能是频段干扰（置信度72%）"
  ],
  "diagnosis": { ... },
  "confidence": 0.72,
  "uncertainty": "如果切换频段无效，请检查天线连接"
}
```

前端渲染 `thinking` 为可折叠的"AI思考过程"，增加可信度。

#### 1.3 不确定性校准

不要给"100%确定"，要给概率区间：
- `confidence >= 0.8` → "高度可能：XX故障"
- `0.5 <= confidence < 0.8` → "较可能：XX故障，建议先检查A再检查B"
- `confidence < 0.5` → "信息不足，需要补充：1) 使用环境 2) 故障频率"

**Prompt 设计原则**：让 LLM 扮演"谨慎的维修顾问"，不是"全能先知"。

---

### Phase 2：图像诊断上线（2周）——让 AI "看得见"

**目标**：把已有的 `imageRecognitionService` 接入前端诊断流程

#### 2.1 前端诊断流改造

```
用户输入故障描述
    ↓
[可选] 上传照片/截图/飞行日志
    ↓
┌─────────────────────────────────────┐
│  并行处理                             │
│  ├── 文本 → 语义检索 → 匹配案例         │
│  └── 图片 → Vision API → 损伤识别      │
└─────────────────────────────────────┘
    ↓
LLM 融合推理（文本+图像）
    ↓
输出：综合诊断报告（含图片标注说明）
```

#### 2.2 图像识别 Prompt 优化

现有 Prompt 太通用，要针对维修场景优化：

```
你是一位大疆无人机认证维修工程师（DJI Certified Repair Technician）。
请分析这张无人机照片，重点关注：
1. 【可见损伤】裂痕、变形、烧蚀、进水痕迹、螺丝脱落
2. 【隐蔽风险】散热孔堵塞、接口氧化、排线弯折
3. 【维修优先级】哪些损伤必须先修，哪些可以延后
4. 【所需配件】预估需要更换的部件型号

注意：如果你无法确定某个细节，请明确说"无法从图片确认"，不要猜测。
```

#### 2.3 数据飞轮（冷启动策略）

没有标注图片怎么办？**用 LLM 自举**：

1. **Phase 2.0**：工程师上传图片 → Vision API 诊断 → 工程师点"对/错"
2. **Phase 2.1**：积累 100 张带反馈的图片后，用 LLM 生成结构化标注数据
3. **Phase 2.2**：用标注数据微调轻量检测模型（YOLOv8-nano，~4MB，CPU可跑）
4. **Phase 2.3**：简单损伤本地检测（快速），复杂损伤走 API（精确）

---

### Phase 3：故障预测（4周，依赖数据积累）——从"坏了修"到"提前防"

**前提**：需要积累维修记录数据（结构化为：机型、部件、故障类型、维修时间、使用时长、使用环境）

#### 3.1 数据收集（现在就可以开始做）

在每次维修完成后，让工程师填写：
- 机型、SN码、购入时间
- 故障部件、故障类型
- 使用场景（户外/室内、高温/低温、高湿/干燥）
- 累计飞行时长、循环次数
- 维修方案（更换/修复/清洁）

#### 3.2 轻量预测模型（2核4G可跑）

不需要深度学习，用统计+规则就够了：

```python
# 部件寿命预测（Weibull分布）
# 输入：同机型同部件的历史维修记录
# 输出：当前部件的剩余寿命估计

def predict_remaining_life(model, component, flight_hours, flight_cycles, environment):
    # 1. 查询历史同类部件的平均寿命
    historical = query_db(model=model, component=component)
    mean_life = np.mean([h.total_flight_hours for h in historical])
    
    # 2. 环境修正系数
    env_factor = {
        '高温高湿': 0.7,
        '正常': 1.0,
        '低温干燥': 1.2
    }.get(environment, 1.0)
    
    # 3. 计算剩余寿命
    adjusted_life = mean_life * env_factor
    remaining = adjusted_life - flight_hours
    
    # 4. 风险分级
    if remaining < 50:
        return {"risk": "高风险", "建议": "建议下次保养时更换", "confidence": 0.6}
    elif remaining < 100:
        return {"risk": "中风险", "建议": "密切关注，出现性能下降立即更换", "confidence": 0.5}
    else:
        return {"risk": "低风险", "建议": "正常使用", "confidence": 0.4}
```

#### 3.3 LLM 增强预测

用 LLM 做"经验推理"，弥补数据不足：

```
已知：
- M300 的图传模块在湿热环境下平均寿命 300 小时
- 该设备已使用 280 小时，环境为深圳（高温高湿）
- 近期出现偶发性图传卡顿

请给出维护建议：
1. 是否需要预防性更换？
2. 如果不更换，如何延长寿命？
3. 更换时推荐的新件型号？
```

---

## 三、技术选型

### 3.1 Embedding & 向量检索

| 组件 | 选型 | 理由 |
|------|------|------|
| Embedding 模型 | `bge-small-zh-v1.5` | 50MB，CPU推理<100ms，中文SOTA级别 |
| 向量库 | PostgreSQL + pgvector | 已有，无需新服务 |
| 检索算法 | IVFFlat | 4GB内存足够，查询快 |
| 混合检索 | pgvector + pg_trgm | 语义+关键词双保险 |

**部署方式**：
- `bge-small-zh` 用 `transformers.js`（Node.js 版本）或 ONNX Runtime 在本地跑
- 也可以用 API（text-embedding-3-small 或 moonshot embedding），但会增加延迟和成本

### 3.2 LLM API（推理层）

| 场景 | 推荐模型 | 理由 |
|------|---------|------|
| 文本诊断 | moonshot-v1-8k | 已有，中文好，便宜 |
| 图像诊断 | moonshot-v1-32k-vision-preview | 已有配置，多模态 |
| 复杂推理 | deepseek-chat / qwen-max | 推理能力强，适合 CoT |
| Embedding | text-embedding-3-small | 便宜，512维度 |

### 3.3 本地服务（2核4G可跑）

| 服务 | 资源占用 | 说明 |
|------|---------|------|
| Node.js API | ~200MB | 已有 |
| PostgreSQL + pgvector | ~500MB | 已有 |
| bge-small-zh ONNX | ~200MB | 新增，embedding推理 |
| YOLOv8-nano（远期） | ~100MB | 远期本地图像检测 |
| **总计** | **~1GB** | **4GB 内存完全够用** |

---

## 四、数据库Schema扩展

### 4.1 向量表（已有 pgvector，扩展即可）

```sql
-- 故障案例向量表
CREATE TABLE fault_case_embeddings (
    id SERIAL PRIMARY KEY,
    case_id INTEGER REFERENCES fault_cases(id),
    content TEXT NOT NULL,           -- 用于embedding的文本（症状+原因+方案拼接）
    embedding VECTOR(512),           -- bge-small-zh 输出512维
    created_at TIMESTAMP DEFAULT NOW()
);

-- 创建向量索引（IVFFlat，适合4GB内存）
CREATE INDEX ON fault_case_embeddings 
USING ivfflat (embedding vector_cosine_ops) 
WITH (lists = 50);

-- 维修手册向量表（Phase 1新增）
CREATE TABLE manual_embeddings (
    id SERIAL PRIMARY KEY,
    section TEXT NOT NULL,           -- 手册章节
    content TEXT NOT NULL,           -- 分块内容
    embedding VECTOR(512),
    metadata JSONB,                  -- 机型、部件等标签
    created_at TIMESTAMP DEFAULT NOW()
);
```

### 4.2 维修记录表（Phase 3数据积累）

```sql
CREATE TABLE repair_records (
    id SERIAL PRIMARY KEY,
    device_sn VARCHAR(100),          -- 设备SN码
    model VARCHAR(50),               -- 机型
    component VARCHAR(50),           -- 故障部件
    fault_type VARCHAR(50),          -- 故障类型
    flight_hours DECIMAL(10,2),      -- 累计飞行时长
    flight_cycles INTEGER,           -- 循环次数
    environment VARCHAR(50),         -- 使用环境
    repair_type VARCHAR(20),         -- 维修类型（更换/修复/清洁）
    repair_date DATE,                -- 维修日期
    cost DECIMAL(10,2),              -- 维修成本
    engineer_id INTEGER,             -- 维修工程师
    created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 五、API 设计（新增/修改）

### 5.1 语义诊断接口（替换现有 /api/diagnosis）

```
POST /api/diagnosis/v2
{
  "symptom": "M300 图传卡顿",
  "model": "kimi",
  "images": ["base64..."],        // 可选
  "context": {                     // 可选，上下文
    "brand": "DJI",
    "model": "M300 RTK",
    "flightHours": 250
  }
}

Response:
{
  "success": true,
  "diagnosis": {
    "thinking": ["...", "..."],   // AI推理过程（Phase 1新增）
    "brand": "DJI",
    "model": "M300 RTK",
    "faultType": "图传系统",
    "analysis": "...",
    "possibleCauses": [...],
    "steps": [...],
    "confidence": 0.72,             // 置信度（Phase 1新增）
    "uncertainty": "..."            // 不确定性说明（Phase 1新增）
  },
  "semanticMatches": [              // 语义检索结果（Phase 1新增）
    {"caseId": 12, "title": "...", "similarity": 0.91},
    {"caseId": 34, "title": "...", "similarity": 0.87}
  ],
  "imageAnalysis": {                // 图像诊断结果（Phase 2新增）
    "component": "图传天线",
    "faultType": "天线折叠损伤",
    "severity": "中等"
  },
  "matchedCasesCount": 5,
  "timestamp": "..."
}
```

### 5.2 图像诊断接口（已有，需接入前端）

```
POST /api/image/recognize
Content-Type: multipart/form-data

image: <file>
scenario: fault | error | model | log
```

### 5.3 故障预测接口（Phase 3）

```
POST /api/prediction/remaining-life
{
  "model": "M300 RTK",
  "component": "图传模块",
  "flightHours": 280,
  "flightCycles": 120,
  "environment": "高温高湿",
  "symptoms": ["偶发性图传卡顿"]
}

Response:
{
  "riskLevel": "中高风险",
  "remainingLifeHours": 45,
  "confidence": 0.55,
  "recommendation": "建议预防性更换图传模块",
  "similarCases": [...]
}
```

---

## 六、实施排期

| 周次 | Phase | 任务 | 产出 |
|------|-------|------|------|
| W1 | Phase 1 | 部署 bge-small-zh ONNX，案例向量化入库 | 语义检索可用 |
| W2 | Phase 1 | 改造 diagnose 接口，增加 CoT + 置信度 | 诊断 V2 上线 |
| W3 | Phase 2 | 前端接入图片上传，接入 imageRecognitionService | 图像诊断可用 |
| W4 | Phase 2 | 图像诊断 Prompt 优化，工程师反馈闭环 | 图像诊断准确率提升 |
| W5 | Phase 3 | 设计维修记录表，前端增加维修记录录入 | 数据开始积累 |
| W6 | Phase 3 | 统计模型 + LLM 预测接口开发 | 故障预测 MVP |
| W7-8 | 迭代 | 根据反馈优化，A/B测试新旧诊断效果 | 正式切换 V2 |

---

## 七、预期效果

| 指标 | 现状 | Phase 1后 | Phase 2后 | Phase 3后 |
|------|------|-----------|-----------|-----------|
| 诊断准确率 | ~60%（关键词匹配） | ~75%（语义检索+CoT） | ~80%（+图像融合） | ~85%（+预测） |
| 平均响应时间 | 3-5s | 2-3s | 3-5s（含图片） | <1s（预测） |
| 用户满意度 | "不AI" | "像有逻辑的顾问" | "能看到问题" | "提前知道风险" |
| 数据资产 | 96个案例 | +向量库 | +反馈图片 | +维修记录 |

---

## 八、风险与应对

| 风险 | 概率 | 应对 |
|------|------|------|
| bge-small-zh 在 2核4G 上推理慢 | 中 | 用 batch embedding + 缓存，或切到 API embedding |
| Vision API 成本高 | 中 | 图片压缩到 512px，控制 token 数；简单损伤后期转本地模型 |
| 维修记录录入率低 | 高 | 简化表单（3个必填项），奖励机制（积分/排名） |
| LLM 幻觉 | 中 | 强制引用案例库来源，置信度<0.5时拒绝给结论 |

---

**下一步**：你确认一下 Phase 1 的优先级和资源投入，我立刻开始写代码实现语义检索模块。
