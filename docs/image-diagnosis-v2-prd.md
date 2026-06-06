# DroneDoctor 图像诊断 v2.0 产品规格文档（PRD）

> **版本**: v1.1 | **日期**: 2026-06-05 | **负责**: 产品经理  
> **对应 Roadmap**: Phase 2 — 图像诊断接入（Vision API）  
> **状态**: 规格评审中，待开发

---

## 一、Why：我们为什么要做这个功能？

### 1.1 目标

把当前「独立的图片识别玩具」升级为**统一诊断流程的正式输入通道**，让用户可以通过拍照/截图启动诊断，降低文字描述门槛，提升诊断启动率和完成率。

### 1.2 解决的核心问题

| 问题 | 场景 | 用户原话（基于学员访谈推测） |
|------|------|----------------------------|
| 描述不清 | 新手不知道该怎么描述故障，输入「坏了」「飞不起来」 | "我不知道这个专业术语叫什么" |
| 视觉信息浪费 | 用户本来就拍了 damaged 部位照片，还要重新打字 | "我照片都拍了，不能直接传吗？" |
| APP 报错难查 | 错误码复制麻烦，截图里有完整信息却要手动输入 | "错误码一长串，输错一个数字就查不到" |
| 识别结果断层 | 现在的图片识别只返回一段结论，没有下一步维修引导 | "它告诉我是云台坏了，然后呢？" |

### 1.3 业务价值

- **诊断启动率**：预计提升 20-30%（降低输入门槛）
- **单轮诊断完成率**：从当前基线提升 15%（与统一诊断流程打通后提供完整 SOP）
- **付费转化漏斗**：新增一个高价值的免费诊断入口，但次数仍计入每日 3 次配额

---

## 二、What：功能范围与边界

### 2.1 总体方案

用户在首页诊断入口选择「拍照/上传图片」→ 选择识别场景 → 上传图片 → Vision 模型提取关键信息（机型、故障类型、部位、错误码等）→ 作为 `hints` 进入统一诊断 API → 返回与普通文本诊断一致的「三段式结果页」和交互式向导。

```
[首页诊断入口]
     ↓
[选择输入方式：文字描述 / 结构化选择 / 拍照上传]
     ↓
[选择场景：故障照片 / APP报错截图 / 设备外观 / 飞行日志截图]
     ↓
[上传图片 + 可选补充描述]
     ↓
[前端调用 POST /api/image/diagnose]
     ↓
[后端内部流程]
  ├─ 1. Vision 提取 → 生成 intent hints
  ├─ 2. 映射到 DEVICE_TYPES / FAULT_TYPES 枚举
  └─ 3. 调用 unifiedDiagnosisService.diagnose()
     ↓
[快速诊断：三段式结果页]
[交互式诊断：决策树向导]
```

**调用链路说明**：前端只需调用 `/api/image/diagnose`，该接口内部会依次完成 Vision 识别和统一诊断，返回完整的诊断结果。前端无需直接调用 `/api/diagnosis/unified`。

### 2.2 In Scope（本次必做）

1. **首页新增「拍照诊断」入口卡片**
   - 与「输入故障描述」「按机型选择」并列
   - 主 icon：相机/上传，副文案：「拍张照片，AI 自动识别故障」

2. **四场景图片识别**
   - `fault`：故障部位照片 → 提取 `component`, `faultType`, `severity`, `possibleCauses`, `repairSuggestion`
   - `error`：APP 报错截图 → 提取 `errorCode`, `errorMessage`, `errorType`, `solutions`
   - `model`：无人机外观照片 → 提取 `brand`, `model`, `series`, `type`, `confidence`
   - `log`：飞行日志/遥控器报错截图 → 提取 `anomalies`, `possibleCauses`, `recommendations`

3. **Vision 结果 → 统一诊断 hints**
   - 将提取结果映射到现有 `DEVICE_TYPES` / `FAULT_TYPES` 枚举
   - 作为 `deviceType`, `faultType`, `keywords`, `imageHints` 传入 `IntentParserService`
   - 保留用户补充描述文本字段 `symptom`（可选）

4. **图片诊断计数规则**
   - 每次成功调用 `/api/image/diagnose`（含后续 unified 调用）计 1 次免费诊断
   - 复用现有全局次数指示器 `DiagnosisCounter`
   - 失败/参数错误不计数；API 返回明确错误码

5. **结果页增强**
   - 在诊断摘要中显示「本诊断基于图片识别 + 知识库推理」标签
   - 故障部位/错误码以结构化卡片展示
   - 提供「重新拍照」和「补充文字描述再诊断」两个次级动作

6. **埋点事件**
   - `image_diagnosis_impression`：拍照诊断入口卡片曝光时（用于计算启动率）
   - `image_diagnosis_start`：选择图片诊断入口时（含 source 入口来源）
   - `image_uploaded`：图片上传成功时（含 scenario、fileSize）
   - `image_recognition_complete`：Vision 模型返回结果时（含 latency_ms、parse_success）
   - `image_diagnosis_complete`：unified 诊断返回最终结果时
   - `image_diagnosis_failed`：任意环节失败时（含 stage、error_code）

### 2.3 Out of Scope（明确不做）

- **视频上传与视频诊断**：只支持单张/多张静态图片
- **实时摄像头流识别**：不支持直接调用摄像头持续识别
- **自动零件下单/估价**：只给维修建议，不接入电商或 ERP
- **单独收费**：图片诊断不走单独付费墙，使用统一每日 3 次配额
- **本地 Vision 模型推理**：继续使用云端 Vision API（Kimi/Qwen fallback），不在服务器本地部署视觉大模型
- **AR 标注/圈注**：不在图片上画框标注故障部位（后续 Phase 3 可考虑）

---

## 三、Who：用户故事

### 3.1 主力用户：维修学员

> **作为** 刚接触无人机维修的学员，  
> **我希望** 直接上传一张云台卡住的照片就能开始诊断，  
> **以便** 不用纠结该怎么描述故障，也能得到标准排查步骤。

### 3.2 次要用户：机主 / 飞手

> **作为** 遇到 DJI Fly APP 报错的机主，  
> **我希望** 把报错截图传上去就告诉我是什么意思、怎么处理，  
> **以便** 快速判断是否需要送修、避免炸机风险。

### 3.3 后台/运营视角

> **作为** 平台运营，  
> **我希望** 看到图片诊断的使用数据和识别失败原因分布，  
> **以便** 优化 prompt 和补充案例库。

---

## 四、How：详细功能设计

### 4.1 前端交互流程

#### Step 1：首页入口改造

在现有三步输入卡片下方或并列位置，增加第四选项：

```
┌──────────────────────────────────────────────┐
│  📷 拍照诊断                                  │
│  拍张照片，AI 自动识别故障                     │
│  支持：故障部位 / APP报错 / 设备型号 / 日志截图 │
└──────────────────────────────────────────────┘
```

点击后跳转 `/image-diagnosis`（复用现有页面，但 UI 和流程升级）。

**`source` 入口来源定义**：

| 入口位置 | source 值 | 说明 |
|----------|-----------|------|
| 首页卡片 | `home_card` | 三步输入并列的第四选项 |
| 首页顶部 banner | `home_banner` | 运营推荐位（如有） |
| 诊断结果页「重新拍照」 | `result_retry` | 用户对结果不满意重新诊断 |
| 分享链接直接访问 | `share_link` | 外部分享的直达链接 |
| 默认/其他 | `direct` | 直接访问 /image-diagnosis |

#### Step 2：图片诊断页（升级现有 ImageDiagnosisPage）

保留左侧上传区、右侧结果区布局，调整信息层级：

1. **场景选择**（顶部横向卡片）：fault / error / model / log
2. **图片上传**（支持拖拽 + 点击）
   - 格式限制：jpg、jpeg、png、webp
   - 大小限制：单张 ≤ 5MB（前端预检）
   - 数量限制：单次 1 张（batch 识别本次不做）
3. **补充描述**（选填文本框）
   - placeholder："补充说明，例如：摔落后出现、已尝试重启"
4. **底部常驻次数指示器**：与首页一致

#### Step 3：等待页复用

上传后进入现有等待页 `/diagnosis-wait`：
- 进度条文案针对图片诊断微调：
  - 0-33%："正在分析图片内容..."
  - 34-66%："正在提取故障信息..."
  - 67-99%："正在匹配维修方案..."
- 小知识可展示拍照技巧类文案（新增 5 条）

#### Step 4：结果页复用统一诊断结果页

与文本诊断完全一致的三段式结果页：
- 第 1 段：诊断摘要（新增「基于图片识别」标签）
- 第 2 段：排查步骤（可折叠）
- 第 3 段：行动引导（查看知识库 / 反馈 / 保存）

额外增加图片诊断专属操作栏：
- 「重新拍照」→ 清空结果，回到 /image-diagnosis
- 「补充描述再诊断」→ 保留图片和原结果，展开补充描述输入框，重新发起 unified 调用

### 4.2 后端 API 设计

#### 接口架构说明

**前端只需调用一个接口**：`POST /api/image/diagnose`

后端内部流程：
1. 接收图片并校验
2. 调用 Vision API 识别（内部复用 `ImageRecognitionService`）
3. 将识别结果映射为标准 intent hints
4. 调用 `unifiedDiagnosisService.diagnose()` 获取诊断结果
5. 组装响应返回前端

**内部服务（不对前端暴露）**：
- `POST /api/image/recognize`：仅内部使用，不开放给前端
- `POST /api/diagnosis/unified`：仅内部使用，不开放给前端

#### 新增业务接口

```
POST /api/image/diagnose
Content-Type: multipart/form-data
```

Body 字段：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `image` | File | 是 | 图片文件（jpg/jpeg/png/webp，≤5MB） |
| `scenario` | string | 是 | fault / error / model / log |
| `symptom` | string | 否 | 用户补充描述 |
| `source` | string | 否 | 入口来源，用于埋点（见 4.1 节定义） |

Response（200 OK）：

```json
{
  "success": true,
  "sessionId": "img_2a8f...",
  "source": "home_card",
  "mode": "quick",
  "imageAnalysis": {
    "scenario": "fault",
    "component": "云台",
    "faultType": "gimbal",
    "deviceType": "mavic",
    "severity": "中等",
    "possibleCauses": ["异物卡滞", "轴臂变形"],
    "repairSuggestion": "先进行外观检查...",
    "needProfessionalRepair": false,
    "confidence": "高",
    "userFriendlySummary": "您的云台可能存在异物卡滞或轴臂变形问题"
  },
  "diagnosis": {
    "summary": { ... },
    "possibleCauses": [ ... ],
    "steps": [ ... ],
    "relatedCases": [ ... ]
  },
  "remainingFree": 2
}
```

错误 Response：

```json
{
  "success": false,
  "errorCode": "IMAGE_TOO_LARGE",
  "message": "单张图片大小不能超过 5MB"
}
```

#### 关键错误码

| 错误码 | 场景 | HTTP 状态 |
|--------|------|-----------|
| `IMAGE_TOO_LARGE` | >5MB | 413 |
| `INVALID_IMAGE_FORMAT` | 非 jpg/png/webp | 415 |
| `VISION_API_UNAVAILABLE` | 所有 Vision provider 失败 | 503 |
| `VISION_PARSE_FAILED` | 返回结果无法解析为 JSON | 422 |
| `UNRECOGNIZED_CONTENT` | Vision 无法识别图中内容 | 422 |
| `DIAGNOSIS_FAILED` | Unified 诊断失败 | 500 |

### 4.3 服务端流程

```
[接收图片]
    ↓
[上传中间件 multer]
    - 文件命名：UUID + 扩展名（如 550e8400-e29b-41d4-a716-446655440000.jpg）
    - 保存到 /tmp/image-uploads/（需提前创建目录）
    - 校验格式/大小
    - 校验文件头魔数（magic bytes），防止伪造扩展名
    ↓
[图片内容基础校验]
    - 检查文件头是否为真实图片（JPEG: FF D8 FF, PNG: 89 50 4E 47, WebP: 52 49 46 46）
    - 可选：调用内容安全 API 检测违规图片（P1 阶段实现）
    ↓
[ImageRecognitionService.recognizeImage]
    - 读取图片 → base64
    - 按 scenario 选择 prompt
    - Fallback 链：Qwen-VL → Kimi Vision → Xiaomi
    - 解析 JSON 结果
    ↓
[ImageDiagnosisController / Service]
    - 将 vision 输出映射为标准 intent hints
    - 调用 unifiedDiagnosisService.diagnose({
        mode: 'quick',
        deviceType: mappedDeviceType,
        faultType: mappedFaultType,
        symptom: userText || visionSummary,
        imageHints: { component, severity, possibleCauses, ... }
      })
    ↓
[Unified Diagnosis 返回标准 diagnosis 结构]
    ↓
[组装响应：imageAnalysis + diagnosis + remainingFree]
    ↓
[删除临时图片]
```

#### 超时与重试策略

| 环节 | 超时时间 | 重试策略 | 降级方案 |
|------|----------|----------|----------|
| 单个 Vision Provider | 10s | 不重试 | 自动切换到下一个 provider |
| 整个 Fallback 链 | 30s | 无 | 返回 `VISION_API_UNAVAILABLE` 错误 |
| Unified Diagnosis | 15s | 1 次（仅网络超时） | 返回 `DIAGNOSIS_FAILED` 错误 |
| 整个请求 | 45s | 无 | 返回超时错误，图片不计数 |

**重试原则**：
- 仅网络超时（ECONNRESET、ETIMEDOUT）触发重试
- 业务错误（4xx/5xx）不重试，直接降级或报错
- 重试时使用指数退避（1s → 2s → 4s）

#### 文件命名安全规范

```javascript
// ✅ 正确：使用 UUID，防止路径遍历和文件名冲突
const filename = `${uuid.v4()}${path.extname(originalname)}`;
const filepath = path.join('/tmp/image-uploads', filename);

// ❌ 错误：直接使用用户上传的文件名
const filepath = path.join('/tmp', originalname); // 危险！
```

### 4.4 Vision Prompt 改造点

当前 prompt 已能输出 JSON，但需要增加**向后端枚举对齐**的字段。要求在 prompt 中显式指定：

```
... 请输出JSON格式，字段必须包含：
{
  "component": "中文部件名",
  "faultType": "从以下选项选择最接近的一个：power-on|link-test|gimbal|battery|video|compass|takeoff|remote|spray|motor|other",
  "deviceType": "从以下选项选择：mavic|air|mini|phantom|t30|t40|other",
  "severity": "轻微|中等|严重",
  "possibleCauses": ["原因1", "原因2"],
  "repairSuggestion": "维修建议（100字以内）",
  "needProfessionalRepair": true/false,
  "confidence": "高|中|低",
  "userFriendlySummary": "用一句话向用户解释图中看到的问题"
}
```

`faultType` / `deviceType` 必须来自 `shared/enums.js` 中的枚举，便于 `IntentParserService` 直接消费。

#### 枚举同步机制

**问题**：prompt 中的枚举值是硬编码的，如果 `shared/enums.js` 更新了，prompt 不会自动同步。

**解决方案**：在 `imageRecognitionService.js` 中动态生成 prompt，从 enums.js 读取最新枚举值：

```javascript
// backend/src/services/imageRecognitionService.js

const { DEVICE_TYPES, FAULT_TYPES } = require('../shared/enums');

function buildVisionPrompt(scenario) {
  // 动态生成枚举列表
  const faultTypeOptions = Object.keys(FAULT_TYPES).join('|');
  const deviceTypeOptions = Object.keys(DEVICE_TYPES).join('|');
  
  return `
请分析图片并输出JSON格式，字段必须包含：
{
  "component": "中文部件名",
  "faultType": "从以下选项选择最接近的一个：${faultTypeOptions}",
  "deviceType": "从以下选项选择：${deviceTypeOptions}",
  ...
}
`;
}
```

**维护规范**：
- `shared/enums.js` 是枚举的单一数据源（Single Source of Truth）
- 修改枚举后，prompt 自动生成，无需手动更新
- 单元测试需验证 prompt 中的枚举值与 enums.js 一致

---

## 五、数据模型与存储

### 5.1 新增 `image_diagnoses` 表

用于运营分析和故障样本积累：

```sql
CREATE TABLE image_diagnoses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  user_id UUID REFERENCES users(id),
  scenario TEXT NOT NULL CHECK (scenario IN ('fault','error','model','log')),
  image_thumbnail_url TEXT,          -- MVP 不保留原图，此字段留空；P1 阶段可存缩略图
  original_filename TEXT,
  file_size_bytes INT,
  vision_result JSONB,               -- Vision API 原始输出
  parsed_hints JSONB,                -- 映射后的 deviceType/faultType 等
  unified_diagnosis_id UUID REFERENCES diagnoses(id),
  parse_success BOOLEAN DEFAULT true,
  latency_ms INT,
  source TEXT DEFAULT 'direct',      -- 入口来源
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 索引设计
CREATE INDEX idx_image_diagnoses_session_id ON image_diagnoses(session_id);
CREATE INDEX idx_image_diagnoses_user_id ON image_diagnoses(user_id);
CREATE INDEX idx_image_diagnoses_created_at ON image_diagnoses(created_at DESC);
CREATE INDEX idx_image_diagnoses_scenario ON image_diagnoses(scenario);

-- 复合索引：运营统计常用
CREATE INDEX idx_image_diagnoses_user_scenario ON image_diagnoses(user_id, scenario, created_at DESC);
```

**隐私合规**：
- MVP 阶段：图片不落盘，识别完成后立即删除临时文件
- P1 阶段：可选保留缩略图（需用户授权），保留 7 天后自动清理
- 原图永不持久化存储

### 5.2 复用现有表

- `diagnoses`：unified 诊断会话记录
- `events`：埋点事件
- 图片文件不落持久库，识别完成后删除临时文件

---

## 六、指标体系

### 6.1 北极星指标

**图片诊断周活跃用户占比（WAU_Img / WAU_Total）**
- 定义：当周至少完成 1 次图片诊断的独立用户数 / 当周总活跃用户数
- 基线：0%（新功能）
- 30 天目标：≥ 15%
- 90 天目标：≥ 25%

### 6.2 驱动指标

| 指标 | 定义 | 基线 | 目标（30天） | 测量方式 |
|------|------|------|------------|---------|
| 图片诊断启动率 | 看到首页入口后点击「拍照诊断」的比例 | 0% | ≥ 20% | 埋点：impression → click |
| 图片上传完成率 | 选择图片后成功完成上传的比例 | 0% | ≥ 85% | 埋点：start → uploaded |
| Vision 识别成功率 | API 返回并成功解析 JSON 的比例 | 0% | ≥ 80% | image_recognition_complete / start |
| 图片→统一诊断转化率 | Vision 成功后进入 unified 并返回结果的比例 | 0% | ≥ 90% | image_diagnosis_complete / recognition_complete |
| 诊断完成率 | 图片诊断用户到达结果页的比例 | 0% | ≥ 75% | image_diagnosis_complete / start |
| 单用户平均诊断次数 | 图片诊断用户的周人均完成次数 | 0 | ≥ 1.3 | 去重用户计数 |

### 6.3 健康指标

| 指标 | 说明 | 阈值 |
|------|------|------|
| Vision API 平均响应时间 | 从上传到返回识别结果 | P95 < 8s |
| 图片诊断 API 错误率 | 5xx / 4xx 占比 | < 5% |
| 识别结果无法解析率 | parseSuccess=false 占比 | < 10% |
| 用户反馈「没解决」率 | 结果页点击「还没解决」 | < 30% |

---

## 七、验收标准

### 7.1 P0 — MVP 上线前必须完成

- [ ] 首页出现「拍照诊断」入口，点击后进入 /image-diagnosis
- [ ] 支持 4 种场景选择和单张图片上传（≤5MB）
- [ ] 上传成功后调用 `/api/image/diagnose` 并正确返回 imageAnalysis + diagnosis
- [ ] Vision 提取的 `faultType`/`deviceType` 能命中至少 3 棵现有决策树（power-on / battery / gimbal / video / link-test）
- [ ] 结果页复用统一诊断三段式结构，并显示「基于图片识别」标签
- [ ] 图片诊断成功调用 1 次后，全局次数指示器正确减 1
- [ ] 所有新埋点事件正确上报到 `/api/events`
- [ ] 临时图片文件在识别完成后被删除

### 7.2 P1 — 上线后 2 周内优化

- [ ] 支持「补充描述再诊断」：保留图片，追加 symptom，重新发起 unified 诊断
- [ ] 运营后台（或 SQL 查询）能查看 image_diagnoses 统计看板
- [ ] 识别失败时给用户明确文案（"图片太模糊 / 无法识别无人机 / 服务繁忙"）
- [ ] Prompt A/B：测试含枚举约束 vs 不含枚举约束的识别准确率

### 7.3 P2 — 后续迭代

- [ ] 批量上传（最多 3 张）并融合多图信息
- [ ] 在结果页展示缩略图
- [ ] 基于图片识别结果推荐相关维修视频/图文案例

---

## 八、技术实现要点

### 8.1 新增/改造文件

```
frontend/src/
  pages/
    ImageDiagnosisPage.jsx          # 升级 UI 与流程
    HomePage.jsx                    # 新增入口卡片
  components/
    ImageUploadZone.jsx             # 拖拽上传组件（复用现有 input）
    ImageDiagnosisResultCard.jsx    # 图片分析摘要卡片
  utils/
    tracking.js                     # 新增 image_* 事件

backend/src/
  routes/
    image.js                        # 新增 POST /diagnose
  controllers/
    imageDiagnosisController.js     # 处理图片诊断业务
  services/
    imageRecognitionService.js      # 改造 prompt，增加枚举映射
    imageDiagnosisService.js        #  orchestrate：识别 → unified
    imageHintMapper.js              # Vision JSON → 后端枚举映射
  models/ 或 migrations/
    006_add_image_diagnoses.sql     # 新增表
  shared/
    enums.js                        # 已存在，复用 DEVICE_TYPES / FAULT_TYPES
```

### 8.2 依赖与配置

- 复用现有 Vision provider 环境变量：`QWEN_API_KEY`, `KIMI_API_KEY`, `XIAOMI_API_KEY`
- 新增可选环境变量：
  - `IMAGE_MAX_SIZE_MB=5`
  - `IMAGE_DIAGNOSIS_ENABLED=true`（用于功能开关）
  - `IMAGE_RETENTION_DAYS=0`（MVP 不保留原图）

### 8.3 测试策略

- **单元测试**：
  - `imageHintMapper.test.js`：验证 Vision JSON 到枚举的映射规则
  - `imageDiagnosisService.test.js`：mock Vision 和 unified 服务，验证 orchestration
- **集成测试**：
  - 使用 10 张真实测试图片（fault/error/model/log 各 3 张 + 异常 case）调用 `/api/image/diagnose`，断言返回结构
- **前端 E2E**（如后续引入 Playwright）：
  - 用户从首页进入图片诊断 → 上传图片 → 到达结果页 → 次数减 1
- **测试数据集**：新增 `backend/tests/fixtures/images/`

#### 测试数据准备规范

**图片来源**：
1. **团队自拍**：使用团队成员的无人机拍摄真实故障照片（已脱敏）
2. **学员授权**：从培训学员处获取，需签署授权同意书
3. **公开素材**：DJI 官方论坛、维修社区的公开图片（注明来源）
4. **模拟场景**：故意制造的故障场景（如云台卡滞、桨叶破损）

**图片要求**：
- 每种场景（fault/error/model/log）至少 3 张典型图片
- 包含 1-2 张边界 case（模糊、光线差、角度刁钻）
- 图片命名规范：`{scenario}_{描述}_{序号}.jpg`，如 `fault_gimbal_stuck_01.jpg`
- 所有测试图片放入 `backend/tests/fixtures/images/` 目录

**测试环境**：
- 单元测试：使用 mock Vision 服务，不调用真实 API
- 集成测试：使用真实 API，但限制调用次数（每日 50 次）
- E2E 测试：使用 mock API，验证前端交互流程

---

## 九、风险与缓解措施

| 风险 | 影响 | 可能性 | 缓解措施 |
|------|------|--------|---------|
| Vision API 成本高 / 不稳定 | 中 | 中 | 保留 Qwen/Kimi/Xiaomi fallback 链；设置超时 30s；失败时返回明确错误 |
| 识别结果 JSON 解析失败率高 | 高 | 中 | Prompt 增加严格 JSON schema 示例；后端增加 retry + 原始文本兜底 |
| 图片涉及用户隐私 / 合规风险 | 中 | 低 | MVP 不持久化原图；必要的话在页面增加「上传即表示授权分析」提示 |
| 与现有统一诊断架构耦合引入回归 | 中 | 中 | 复用已有 unified API，不改动核心服务边界；增加回归测试用例 |
| 用户体验断层（识别完没有后续） | 高 | 低 | 必须接入 unified 流程，禁止只返回 raw Vision 结果 |

---

## 十、灰度发布与监控

### 10.1 灰度发布策略

**MVP 上线方案**：全量上线 + 功能开关

| 阶段 | 时间 | 范围 | 验证目标 |
|------|------|------|----------|
| 内测 | 第 1-3 天 | 团队内部 + 10 名种子用户 | 核心流程跑通，无阻塞性 bug |
| 小范围灰度 | 第 4-7 天 | 10% 用户 | 识别成功率 ≥ 70%，错误率 < 10% |
| 全量上线 | 第 8 天起 | 100% 用户 | 所有 P0 验收标准通过 |

**功能开关**：
- 环境变量 `IMAGE_DIAGNOSIS_ENABLED=true/false`
- 支持按用户 ID 白名单灰度（可选）
- 关闭时：隐藏首页入口，直接访问 /image-diagnosis 返回 404

**回滚方案**：
- 设置 `IMAGE_DIAGNOSIS_ENABLED=false` 即可秒级回滚
- 数据库表保留，不影响已有数据
- 前端代码无需回滚，仅隐藏入口

### 10.2 监控报警配置

#### 健康指标监控

| 指标 | 监控方式 | 报警阈值 | 报警渠道 |
|------|----------|----------|----------|
| Vision API 响应时间 | Prometheus + Grafana | P95 > 10s | 企业微信群 |
| Vision API 错误率 | Prometheus + Grafana | > 10%（持续 5 分钟） | 企业微信群 + 短信 |
| 图片诊断 API 错误率 | Prometheus + Grafana | > 5%（持续 5 分钟） | 企业微信群 + 短信 |
| 识别结果解析失败率 | 数据库定时查询 | > 15%（每日统计） | 邮件日报 |
| 用户「没解决」点击率 | 埋点数据分析 | > 40%（每日统计） | 邮件日报 |

#### 日志规范

```javascript
// 请求日志
logger.info('image_diagnosis_request', {
  sessionId,
  userId,
  scenario,
  source,
  fileSize,
  timestamp: new Date().toISOString()
});

// Vision 识别日志
logger.info('vision_recognition', {
  sessionId,
  provider: 'qwen',  // 实际使用的 provider
  latencyMs,
  parseSuccess,
  confidence,
  timestamp: new Date().toISOString()
});

// 错误日志
logger.error('image_diagnosis_error', {
  sessionId,
  stage: 'vision',  // vision / mapping / unified
  errorCode,
  errorMessage,
  timestamp: new Date().toISOString()
});
```

#### 报警响应流程

1. **Vision API 不可用**：检查 API Key 余额 → 检查服务状态 → 临时切换到其他 provider
2. **错误率飙升**：检查最近部署 → 检查 Vision API 返回内容 → 必要时关闭功能开关
3. **解析失败率高**：检查 prompt 变更 → 检查 Vision API 版本 → 回滚 prompt

---

## 十一、Assumptions & Open Questions

### 11.1 我在做这份规格时的假设

1. **用户输入以中文为主**，Vision prompt 保持中文输出。
2. **图片诊断走与文本诊断同样的计费/次数体系**，不单独定价。
3. **MVP 只支持单张图片**，不支持批量融合（后续 P2）。
4. **不新增本地视觉模型**，继续使用现有 Qwen/Kimi/Xiaomi 云端 API key。
5. **临时图片文件不持久化**，识别后立即删除，合规风险最低。
6. **首页入口样式与现有三步输入卡片风格一致**，不单独重新设计视觉。

> 如果以上任何一条与你的想法不一致，请现在纠正，否则我将按这些假设推进。

### 11.2 待确认问题

1. **Qwen API Key 当前是否可用？** 现有 `imageRecognitionService` 配置了 Qwen，但不确定账户余额或接口稳定性。
2. **是否保留历史图片？** 如果不保留，运营同学就无法做 badcase 复盘；如果保留，需要明确存储位置和保留周期。
3. **首页入口优先级：** 「拍照诊断」放在三步输入的上方、下方，还是并列标签页？
4. **错误场景兜底文案：** 当 Vision 识别不出故障时，是引导用户转文字描述，还是直接推荐「联系人工客服」？
5. **是否需要在图片诊断中加入企业微信登录引导？** P1 的渐进式注册是否覆盖图片诊断流程？

---

## 十二、相关文档

- `docs/unified-diagnosis-architecture.md` — 统一诊断架构 v2.0
- `docs/diagnosis-conversation-optimization-prd.md` — 对话诊断优化 PRD
- `docs/开发需求-行为干预P0P1.md` — 行为干预与次数体系
- `backend/src/services/imageRecognitionService.js` — 现有 Vision 服务
- `frontend/src/pages/ImageDiagnosisPage.jsx` — 现有图片诊断页面
- `backend/src/shared/enums.js` — 前后端统一枚举

---

## 十三、变更日志

| 版本 | 日期 | 变更人 | 说明 |
|------|------|--------|------|
| v1.1 | 2026-06-05 | 高级开发工程师 | 技术评审修改：澄清 API 调用链路、补充安全规范、超时重试策略、数据库索引、埋点事件、枚举同步机制、灰度发布、监控报警 |
| v1.0 | 2026-06-05 | 产品经理 | 初稿，待评审 |
