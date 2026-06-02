# 意见箱 + 知识库 + CAAC考证 开发需求说明

> 直接发给开发同学，按优先级做就行。有问题随时沟通。

---

## 一、背景

本次新增三个功能模块：**意见箱**、**知识库**、**CAAC考证**。

现状：
- 知识库：后端有骨架路由 `knowledge.js`（示例数据），前端无页面
- CAAC考证：后端有骨架路由 `caac.js`（示例数据），前端无页面
- 意见箱：完全未开始

目标：补齐这三个模块，提升产品留存率和用户参与度。

---

## 二、P0：意见箱（1天）

### 任务1：全局悬浮按钮

**需求**：页面右下角固定一个"意见反馈"按钮，所有页面可见。

```
位置：右下角，position: fixed，bottom: 80px，right: 24px
样式：圆角按钮，蓝色背景，带💬图标
文字：鼠标悬停显示"意见反馈"
层级：z-index: 1000
```

**交互**：点击后从右侧滑出侧边抽屉（宽度360px，高度100%）。

---

### 任务2：侧边抽屉表单

**需求**：点击悬浮按钮后，右侧滑出反馈表单。

**表单字段**：

```
┌─────────────────────────────────────────┐
│  💬 意见反馈                        [X] │
│                                         │
│  我们想听听你的声音                       │
│  你的每一条建议都会被认真对待               │
│                                         │
│  ─────────────────────────────────────  │
│                                         │
│  反馈类型 *                              │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐  │
│  │功能建议│ │Bug反馈│ │内容纠错│ │ 其他 │  │
│  └──────┘ └──────┘ └──────┘ └──────┘  │
│                                         │
│  详细描述 *                              │
│  ┌─────────────────────────────────┐   │
│  │                                 │   │
│  │ 请描述你的问题或建议...           │   │
│  │                                 │   │
│  └─────────────────────────────────┘   │
│                                         │
│  联系方式（选填）                         │
│  ┌─────────────────────────────────┐   │
│  │ 微信号/手机号/邮箱               │   │
│  └─────────────────────────────────┘   │
│  填写后我们会通过此方式联系你              │
│                                         │
│  ─────────────────────────────────────  │
│                                         │
│         [ 提交反馈 ]                      │
│                                         │
│  已收到 328 条反馈，采纳 47 条            │
│                                         │
└─────────────────────────────────────────┘
```

**字段说明**：

| 字段 | 类型 | 必填 | 校验 |
|---|---|---|---|
| 反馈类型 | 单选（4个标签） | ✅ | 必须选一个 |
| 详细描述 | textarea | ✅ | 最少10字，最多500字 |
| 联系方式 | input | ❌ | 无校验 |
| 当前页面 | 自动 | - | 提交时记录 `window.location.pathname` |

**标签样式**：选中时高亮，未选中时灰色边框。

---

### 任务3：提交后反馈

**需求**：提交成功后，表单区域替换为感谢页面。

```
┌─────────────────────────────────────────┐
│                                         │
│           ✅ 感谢你的反馈！               │
│                                         │
│   你的建议已收到，我们会认真考虑。         │
│                                         │
│   如果你留下了联系方式，                   │
│   我们会在3个工作日内回复你。              │
│                                         │
│         [ 继续使用 ]                      │
│                                         │
└─────────────────────────────────────────┘
```

点"继续使用"关闭抽屉。

**底部统计数字**：从后端获取真实数据，格式："已收到 X 条反馈，采纳 Y 条"。

---

### 任务4：后端接口

```javascript
// 1. 提交反馈
POST /api/feedback
Body: {
  "type": "feature" | "bug" | "content" | "other",
  "content": "反馈内容",
  "contact": "联系方式（可选）",
  "page": "/knowledge/xxx"
}
Response: { "ok": true, "id": 123 }

// 2. 获取反馈统计（用于底部显示）
GET /api/feedback/stats
Response: { "total": 328, "accepted": 47 }
```

**数据表**：

```sql
CREATE TABLE feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  content TEXT NOT NULL,
  contact TEXT,
  page TEXT,
  status TEXT DEFAULT 'pending',
  admin_reply TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

### 任务5：埋点

```javascript
track('feedback_open', { page: string });
track('feedback_submit', { type: string, has_contact: boolean });
```

---

## 三、P1：知识库（2天）

### 任务1：知识库列表页

**路由**：`/knowledge`

**页面结构**：

```
┌─────────────────────────────────────────┐
│  📖 知识库                                │
│                                         │
│  🔍 搜索知识库...                         │
│                                         │
│  热门搜索：                               │
│  [无法起飞] [图传黑屏] [电池鼓包]         │
│  [GPS信号弱] [云台卡住] [电机不转]        │
│                                         │
│  ─────────────────────────────────────  │
│                                         │
│  分类筛选：                               │
│  [全部] [故障排查] [维修教程] [配件指南]   │
│  [新手入门]                               │
│                                         │
│  机型：[全部] [Mavic] [Air] [Mini] [T30] │
│  难度：[全部] [⭐] [⭐⭐] [⭐⭐⭐]          │
│                                         │
│  ─────────────────────────────────────  │
│                                         │
│  文章列表：                               │
│  ┌─────────────────────────────────┐   │
│  │ Mavic 3 无法起飞的 7 种常见原因  │   │
│  │ 故障排查 · Mavic · ⭐⭐           │   │
│  │ 👁️ 1,234次阅读                  │   │
│  └─────────────────────────────────┘   │
│  ┌─────────────────────────────────┐   │
│  │ 电池保养完整指南                  │   │
│  │ 维修教程 · 全机型 · ⭐           │   │
│  │ 👁️ 856次阅读                    │   │
│  └─────────────────────────────────┘   │
│  ... 更多文章 ...                        │
│                                         │
└─────────────────────────────────────────┘
```

**接口**：

```javascript
GET /api/knowledge/articles?page=1&limit=20&category=troubleshooting&device=mavic&difficulty=2&search=无法起飞
Response: {
  "articles": [
    {
      "id": 1,
      "title": "Mavic 3 无法起飞的 7 种常见原因",
      "category": "troubleshooting",
      "deviceType": "mavic",
      "difficulty": 2,
      "viewCount": 1234,
      "createdAt": "2026-05-15"
    }
  ],
  "total": 120,
  "page": 1,
  "limit": 20
}
```

---

### 任务2：文章详情页

**路由**：`/knowledge/:id`

**页面结构**：

```
┌─────────────────────────────────────────┐
│  ← 返回知识库                            │
│                                         │
│  Mavic 3 无法起飞的 7 种常见原因          │
│                                         │
│  📅 2026-05-15  👁️ 1,234次阅读  ⭐ 4.8分 │
│                                         │
│  ─────────────────────────────────────  │
│                                         │
│  [免费内容区域 - 前30%内容]               │
│  无人机无法起飞是最常见的故障之一...       │
│  根据我们的统计，70%的无法起飞故障         │
│  是由以下原因造成的：                      │
│                                         │
│  1. 电池电量不足                          │
│     电池电量低于20%时...                  │
│                                         │
│  2. GPS信号弱                            │
│     GPS卫星数少于6颗时...                 │
│                                         │
│  ─────────────────────────────────────  │
│                                         │
│  🔒 登录查看完整内容                      │
│                                         │
│  还有 5 个原因和详细解决方案               │
│  登录即可免费阅读完整内容                  │
│                                         │
│  [微信扫码查看完整内容]                    │
│  [继续浏览其他免费内容]                    │
│                                         │
└─────────────────────────────────────────┘
```

**登录后显示完整内容 + 底部推荐**：

```
┌─────────────────────────────────────────┐
│  [完整内容区域]                           │
│  ...                                     │
│  ─────────────────────────────────────  │
│                                         │
│  📚 相关推荐                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐│
│  │ GPS信号弱 │ │ 电池保养 │ │ IMU校准  ││
│  │ 排查指南  │ │ 完整指南 │ │ 详细步骤 ││
│  └──────────┘ └──────────┘ └──────────┘│
│                                         │
│  ─────────────────────────────────────  │
│                                         │
│  🎯 这篇文章对你有帮助吗？                │
│  [👍 有帮助]  [👎 需要改进]               │
│                                         │
│  ─────────────────────────────────────  │
│                                         │
│  💾 收藏这篇文章                          │
│  [已收藏] 或 [收藏]                       │
│                                         │
└─────────────────────────────────────────┘
```

**接口**：

```javascript
GET /api/knowledge/articles/:id
Response: {
  "id": 1,
  "title": "...",
  "content": "...",           // 完整内容（Markdown）
  "freePreview": "...",       // 免费预览内容（前30%）
  "isLocked": true,           // 是否需要登录才能看完整内容
  "category": "troubleshooting",
  "deviceType": "mavic",
  "difficulty": 2,
  "viewCount": 1234,
  "relatedArticles": [        // 相关推荐（3篇）
    { "id": 2, "title": "GPS信号弱排查指南", "category": "troubleshooting" },
    { "id": 3, "title": "电池保养完整指南", "category": "repair" },
    { "id": 4, "title": "IMU校准详细步骤", "category": "repair" }
  ],
  "isFavorited": false,       // 当前用户是否已收藏
  "helpfulCount": 45,         // 点赞数
  "notHelpfulCount": 3        // 点踩数
}
```

**渐进式解锁逻辑**：
- 未登录用户：显示 `freePreview`，底部显示"🔒 登录查看完整内容"引导
- 已登录用户：显示完整 `content`
- 新手入门分类：所有人显示完整内容（`isLocked: false`）

---

### 任务3：收藏功能

**需求**：已登录用户可收藏文章，收藏后文章出现在个人中心"我的收藏"。

**接口**：

```javascript
// 收藏/取消收藏（切换）
POST /api/knowledge/favorites
Body: { "articleId": 1 }
Response: { "ok": true, "isFavorited": true }

// 获取我的收藏列表
GET /api/knowledge/favorites?page=1&limit=20
Response: {
  "articles": [...],
  "total": 12
}
```

**数据表**：

```sql
CREATE TABLE user_favorites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  article_id INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, article_id)
);
```

---

### 任务4：学习进度追踪

**需求**：登录用户在知识库页面顶部显示学习进度卡片。

```
┌─────────────────────────────────────────┐
│  📊 你的学习进度                          │
│                                         │
│  已阅读：12/45 篇文章                     │
│  ████████░░░░░░░░░░░░░░░░░  27%         │
│                                         │
│  本周新学：3 篇                           │
│  连续学习：5 天 🔥                        │
│                                         │
│  [继续学习 →]                            │
└─────────────────────────────────────────┘
```

**接口**：

```javascript
GET /api/knowledge/progress
Response: {
  "readCount": 12,
  "totalCount": 45,
  "weekCount": 3,
  "streak": 5
}
```

**数据表**：

```sql
CREATE TABLE user_read_articles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  article_id INTEGER NOT NULL,
  read_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, article_id)
);
```

**记录时机**：用户在文章详情页停留超过10秒，自动记录为已读。

---

### 任务5：文章帮助反馈

**需求**：文章底部"有帮助/需要改进"按钮。

**交互**：
- 点击后按钮高亮，数字+1
- 同一用户对同一篇文章只能点一次
- 已登录用户才显示（未登录隐藏）

**接口**：

```javascript
POST /api/knowledge/helpful
Body: { "articleId": 1, "helpful": true }
Response: { "ok": true }
```

---

### 任务6：埋点

```javascript
track('knowledge_article_view', { article_id: number, category: string });
track('knowledge_article_complete', { article_id: number, read_percent: number });
track('knowledge_login_prompt_seen', { trigger: 'unlock' | 'favorite' });
track('knowledge_login_prompt_action', { action: 'login' | 'skip' });
track('knowledge_search', { query: string, results_count: number });
```

---

## 四、P1：CAAC题库练习（2天）

### 任务1：题库入口页

**路由**：`/caac`

**页面结构**：

```
┌─────────────────────────────────────────┐
│  🎓 CAAC考证指南                          │
│                                         │
│  ─────────────────────────────────────  │
│                                         │
│  📅 今日学习打卡                          │
│  ┌───┬───┬───┬───┬───┬───┬───┐        │
│  │ 一 │ 二 │ 三 │ 四 │ 五 │ 六 │ 日 │    │
│  │ ✅ │ ✅ │ ✅ │   │   │   │   │        │
│  └───┴───┴───┴───┴───┴───┴───┘        │
│  已连续打卡 3 天 🔥                       │
│  今日目标：做 10 道题  已完成：5/10        │
│                                         │
│  ─────────────────────────────────────  │
│                                         │
│  📝 题库练习                              │
│  ┌─────────────────────────────────┐   │
│  │ [按章节练习] [顺序练习] [随机练习] │   │
│  └─────────────────────────────────┘   │
│                                         │
│  章节列表：                               │
│  ┌─────────────────────────────────┐   │
│  │ 飞行法规        已做 45/100 题   │   │
│  │ 气象知识        已做 23/80 题    │   │
│  │ 飞行原理        已做 67/120 题   │   │
│  │ 无人机系统      已做 34/100 题   │   │
│  │ 应急处置        已做 12/100 题   │   │
│  └─────────────────────────────────┘   │
│                                         │
│  ─────────────────────────────────────  │
│                                         │
│  📕 我的错题本（23 道）                   │
│  [查看错题 →]                            │
│                                         │
│  ─────────────────────────────────────  │
│                                         │
│  🎯 模拟考试                              │
│  [全真模拟 120分钟100题]                  │
│  [历史成绩]                               │
│                                         │
└─────────────────────────────────────────┘
```

**接口**：

```javascript
// 获取学习统计（打卡+进度）
GET /api/caac/stats
Response: {
  "totalQuestions": 500,
  "doneQuestions": 150,
  "correctRate": 78,
  "streak": 3,
  "todayDone": 5,
  "todayGoal": 10,
  "chapters": [
    { "id": "flight_law", "name": "飞行法规", "total": 100, "done": 45 },
    { "id": "meteorology", "name": "气象知识", "total": 80, "done": 23 },
    ...
  ],
  "mistakeCount": 23
}
```

---

### 任务2：练习页

**路由**：`/caac/practice?mode=chapter&chapter=flight_law`

**页面结构**：

```
┌─────────────────────────────────────────┐
│  📝 CAAC题库练习                          │
│  飞行法规 · 第 15/100 题                  │
│                                         │
│  ████████░░░░░░░░░░░░░░░░░  15%         │
│                                         │
│  ─────────────────────────────────────  │
│                                         │
│  Q. 无人机飞行前，以下哪项不是              │
│     必须检查的项目？                      │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ A. 电池电量                      │   │
│  └─────────────────────────────────┘   │
│  ┌─────────────────────────────────┐   │
│  │ B. GPS信号强度                   │   │
│  └─────────────────────────────────┘   │
│  ┌─────────────────────────────────┐   │
│  │ C. 遥控器电量                    │   │
│  └─────────────────────────────────┘   │
│  ┌─────────────────────────────────┐   │
│  │ D. 手机信号强度                  │   │
│  └─────────────────────────────────┘   │
│                                         │
│  ─────────────────────────────────────  │
│                                         │
│  [上一题]  [下一题]  [收藏]  [查看解析]   │
│                                         │
└─────────────────────────────────────────┘
```

**答题后反馈**（选择答案后立即显示）：

```
┌─────────────────────────────────────────┐
│                                         │
│  ✅ 回答正确！                            │
│                                         │
│  解析：                                  │
│  手机信号强度不是飞行前必须检查的项目。    │
│  飞行前必须检查的项目包括：               │
│  - 电池电量（A正确）                     │
│  - GPS信号强度（B正确）                  │
│  - 遥控器电量（C正确）                   │
│                                         │
│  相关知识点：飞行前检查清单               │
│  [查看知识点 →]                          │
│                                         │
│  [下一题]                                │
│                                         │
└─────────────────────────────────────────┘
```

**错误时**：选项变红，正确答案变绿，显示解析。

**接口**：

```javascript
// 获取题目列表
GET /api/caac/questions?page=1&limit=20&chapter=flight_law&type=single
Response: {
  "questions": [
    {
      "id": 1,
      "chapter": "flight_law",
      "type": "single",
      "question": "无人机飞行前，以下哪项不是必须检查的项目？",
      "options": [
        { "key": "A", "text": "电池电量" },
        { "key": "B", "text": "GPS信号强度" },
        { "key": "C", "text": "遥控器电量" },
        { "key": "D", "text": "手机信号强度" }
      ],
      "answer": "D",
      "explanation": "手机信号强度不是飞行前必须检查的项目...",
      "difficulty": 1
    }
  ],
  "total": 100,
  "page": 1,
  "limit": 20
}

// 提交答案
POST /api/caac/answer
Body: {
  "questionId": 1,
  "answer": "D",
  "timeSpent": 15
}
Response: {
  "correct": true,
  "correctAnswer": "D",
  "explanation": "...",
  "relatedKnowledge": { "id": 5, "title": "飞行前检查清单" }
}
```

---

### 任务3：错题本

**路由**：`/caac/mistakes`

**页面结构**：

```
┌─────────────────────────────────────────┐
│  📕 我的错题本                            │
│                                         │
│  共 23 道错题                            │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ Q. 以下哪种情况不需要进行指南针校准？│   │
│  │                                 │   │
│  │ 正确答案：C                      │   │
│  │ 你的答案：A ❌                    │   │
│  │                                 │   │
│  │ 错误次数：2次                     │   │
│  │ 最近错误：3天前                   │   │
│  │                                 │   │
│  │ [重新做这道题] [查看解析] [移除]   │   │
│  └─────────────────────────────────┘   │
│  ... 更多错题 ...                        │
│                                         │
│  [清空已掌握的错题]                       │
│                                         │
└─────────────────────────────────────────┘
```

**接口**：

```javascript
// 获取错题列表
GET /api/caac/mistakes?page=1&limit=20
Response: {
  "mistakes": [
    {
      "questionId": 1,
      "question": "...",
      "yourAnswer": "A",
      "correctAnswer": "C",
      "mistakeCount": 2,
      "lastMistake": "2026-05-27",
      "nextReview": "2026-05-30"
    }
  ],
  "total": 23
}

// 移除错题（已掌握）
DELETE /api/caac/mistakes/:questionId
Response: { "ok": true }
```

**数据表**：

```sql
CREATE TABLE user_answers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  question_id INTEGER NOT NULL,
  answer TEXT NOT NULL,
  correct BOOLEAN NOT NULL,
  time_spent INTEGER,
  answered_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

### 任务4：每日打卡

**需求**：用户每天做题后自动打卡，显示连续天数和今日进度。

**打卡逻辑**：
- 用户当天做了至少1道题，自动记录打卡
- 连续天数：昨天也打了卡，streak+1；昨天没打，streak重置为1
- 今日进度：今日已做题数 / 今日目标（默认10题）

**接口**：

```javascript
// 记录打卡（每次答题后自动调用）
POST /api/caac/checkin
Body: { "questionsDone": 1 }
Response: {
  "ok": true,
  "streak": 3,
  "todayDone": 5,
  "todayGoal": 10
}
```

**数据表**：

```sql
CREATE TABLE user_checkins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  checkin_date DATE NOT NULL,
  questions_done INTEGER DEFAULT 0,
  UNIQUE(user_id, checkin_date)
);
```

---

### 任务5：埋点

```javascript
track('caac_question_answer', { question_id: number, correct: boolean, time_spent: number });
track('caac_checkin', { questions_done: number, streak: number });
track('caac_mistake_review', { question_id: number });
track('caac_exam_start', { exam_type: 'full' | 'chapter', chapter: string });
track('caac_exam_complete', { score: number, passed: boolean, weak_chapters: string[] });
```

---

## 五、P2：模拟考试（上线后第3周，2天）

### 任务1：模拟考试入口

**路由**：`/caac/exam`

**页面结构**：

```
┌─────────────────────────────────────────┐
│  🎯 模拟考试                              │
│                                         │
│  全真模拟（120分钟，100题）               │
│  ┌─────────────────────────────────┐   │
│  │  难度：⭐⭐⭐                      │   │
│  │  时间：120分钟                    │   │
│  │  题量：100题                      │   │
│  │  及格线：70分                     │   │
│  │                                 │   │
│  │  [开始考试]                       │   │
│  └─────────────────────────────────┘   │
│                                         │
│  章节测试（30分钟，20题）                 │
│  ┌─────────────────────────────────┐   │
│  │  [飞行法规] [气象知识] [飞行原理] │   │
│  │  [无人机系统] [应急处置]          │   │
│  └─────────────────────────────────┘   │
│                                         │
│  历史成绩：                               │
│  - 5月28日：78分 ✅                       │
│  - 5月25日：65分 ❌                       │
│  - 5月20日：72分 ✅                       │
│                                         │
└─────────────────────────────────────────┘
```

### 任务2：考试进行页

**需求**：
- 全真模拟：120分钟倒计时，100题，做完一题自动下一题
- 章节测试：30分钟倒计时，20题
- 顶部显示剩余时间和进度
- 做完所有题目后自动提交，显示结果

**考试结果页**：

```
┌─────────────────────────────────────────┐
│                                         │
│           🎉 恭喜通过！                   │
│           你的得分：78分                  │
│           及格线：70分                    │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │  飞行法规      ████████░░  80%   │   │
│  │  气象知识      ██████░░░░  60%   │   │
│  │  飞行原理      ████████░░  80%   │   │
│  │  无人机系统    ██████████  100%  │   │
│  │  应急处置      ██████░░░░  60%   │   │
│  └─────────────────────────────────┘   │
│                                         │
│  薄弱环节：气象知识、应急处置             │
│                                         │
│  [查看错题] [针对薄弱环节练习] [再来一次] │
│                                         │
└─────────────────────────────────────────┘
```

**接口**：

```javascript
// 获取历史成绩
GET /api/caac/exams?page=1&limit=10
Response: {
  "exams": [
    { "id": 1, "type": "full", "score": 78, "passed": true, "date": "2026-05-28" },
    { "id": 2, "type": "full", "score": 65, "passed": false, "date": "2026-05-25" }
  ],
  "total": 5
}

// 提交考试结果
POST /api/caac/exams
Body: {
  "type": "full" | "chapter",
  "chapter": "flight_law",  // 章节测试时才有
  "answers": [
    { "questionId": 1, "answer": "D", "timeSpent": 15 },
    ...
  ]
}
Response: {
  "id": 3,
  "score": 78,
  "passed": true,
  "chapterScores": {
    "flight_law": 80,
    "meteorology": 60,
    ...
  },
  "weakChapters": ["meteorology", "emergency"]
}
```

**数据表**：

```sql
CREATE TABLE user_exams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,  -- 'full' | 'chapter'
  chapter TEXT,
  score INTEGER NOT NULL,
  passed BOOLEAN NOT NULL,
  chapter_scores TEXT,  -- JSON格式
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## 六、验收标准

### 意见箱
- [ ] 全局右下角悬浮按钮，所有页面可见
- [ ] 点击后右侧滑出抽屉，表单字段完整
- [ ] 反馈类型4个标签可选择，详细描述最少10字校验
- [ ] 提交后显示感谢页面，底部显示真实统计数据
- [ ] 后端接口正常，数据存入数据库
- [ ] 埋点正常上报

### 知识库
- [ ] 列表页：文章列表、分类筛选、搜索功能
- [ ] 详情页：前30%内容免费，登录引导正确
- [ ] 详情页：登录后显示完整内容+相关推荐
- [ ] 收藏功能：点击收藏/取消，个人中心可查看
- [ ] 学习进度：已读/总数、连续天数显示正确
- [ ] 帮助反馈：有帮助/需要改进按钮可用
- [ ] 埋点正常上报

### CAAC题库
- [ ] 入口页：打卡卡片、章节列表、错题本入口
- [ ] 练习页：题目显示、选项选择、答题后反馈
- [ ] 错题本：错题列表、重新做题、移除功能
- [ ] 打卡功能：每日打卡自动记录、连续天数计算
- [ ] 埋点正常上报

### 模拟考试
- [ ] 考试入口：全真模拟/章节测试选择
- [ ] 考试进行：倒计时、题目切换、自动提交
- [ ] 考试结果：分数、及格判断、薄弱环节分析
- [ ] 历史成绩：成绩列表显示

---

## 七、数据准备

开发前需要准备的数据：

1. **知识库文章**：至少20篇，覆盖4个分类
   - 故障排查：8篇（每个故障类型1-2篇）
   - 维修教程：6篇
   - 配件指南：3篇
   - 新手入门：3篇

2. **CAAC题库**：至少200道，覆盖5个章节
   - 飞行法规：40道
   - 气象知识：40道
   - 飞行原理：40道
   - 无人机系统：40道
   - 应急处置：40道

**数据格式**：我会提供JSON文件，直接导入数据库即可。

---

有问题随时沟通，优先做P0意见箱，P1知识库和CAAC可以并行开发。
