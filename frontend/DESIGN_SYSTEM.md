# DroneDoctor 设计系统文档

## 概述

DroneDoctor 设计系统是一套完整的设计语言和组件库，旨在为用户提供专业、可信、易用的无人机故障诊断体验。

## 设计原则

### 1. 专业可信
- 使用DJI极简风格，黑白灰+品牌橙
- 清晰的信息层级，避免视觉噪音
- 数据驱动的信任标识

### 2. 用户优先
- 快速诊断流程，减少操作步骤
- 清晰的反馈机制，让用户了解系统状态
- 无障碍设计，支持所有用户

### 3. 一致性
- 统一的设计语言和组件
- 可预测的交互模式
- 响应式设计，适配所有设备

### 4. 可维护性
- 基于设计令牌的系统
- 模块化的组件架构
- 清晰的文档和示例

---

## 颜色系统

### 品牌色

| 名称 | 变量 | 色值 | 用途 |
|------|------|------|------|
| 品牌主色 | `--color-brand-primary` | `#FF6B00` | 主按钮、链接、强调元素 |
| 品牌悬停 | `--color-brand-hover` | `#FF8533` | 悬停状态 |
| 品牌激活 | `--color-brand-active` | `#E55A00` | 激活状态 |
| 品牌浅色 | `--color-brand-light` | `#FFF4EB` | 背景、标签 |
| 品牌深色 | `--color-brand-dark` | `#CC5500` | 文本、边框 |

### 中性色

| 名称 | 变量 | 色值 | 用途 |
|------|------|------|------|
| 深黑 | `--color-neutral-900` | `#1A1A1A` | 标题、重要文本 |
| 中黑 | `--color-neutral-700` | `#404040` | 正文文本 |
| 中灰 | `--color-neutral-500` | `#737373` | 次要文本 |
| 浅灰 | `--color-neutral-300` | `#D4D4D4` | 边框、分隔线 |
| 极浅灰 | `--color-neutral-100` | `#F5F5F5` | 背景 |
| 纯白 | `--color-neutral-white` | `#FFFFFF` | 背景、文本 |

### 语义色

| 类型 | 主色 | 浅色 | 深色 | 用途 |
|------|------|------|------|------|
| 成功 | `#10B981` | `#D1FAE5` | `#059669` | 成功状态、确认 |
| 警告 | `#F59E0B` | `#FEF3C7` | `#D97706` | 警告状态、提醒 |
| 错误 | `#EF4444` | `#FEE2E2` | `#DC2626` | 错误状态、删除 |
| 信息 | `#3B82F6` | `#DBEAFE` | `#2563EB` | 信息提示、帮助 |

---

## 字体系统

### 字体族

```css
--font-family-sans: 'Inter', 'SF Pro Display', 'PingFang SC', 'Microsoft YaHei', sans-serif;
--font-family-mono: 'SF Mono', 'Monaco', 'Consolas', monospace;
```

### 字体大小

| 名称 | 大小 | 行高 | 用途 |
|------|------|------|------|
| xs | 12px | 1.5 | 辅助文本、标签 |
| sm | 14px | 1.5 | 次要文本、说明 |
| base | 16px | 1.5 | 正文文本 |
| lg | 18px | 1.5 | 重要文本 |
| xl | 20px | 1.4 | 小标题 |
| 2xl | 24px | 1.4 | 副标题 |
| 3xl | 32px | 1.2 | 标题 |
| 4xl | 40px | 1.2 | 大标题 |
| 5xl | 48px | 1.1 | 页面标题 |
| 6xl | 64px | 1.1 | 超大标题 |

### 字重

- Normal: 400
- Medium: 500
- Semibold: 600
- Bold: 700

---

## 间距系统

基于 4px 基础单位的间距系统：

| 名称 | 值 | 用途 |
|------|------|------|
| spacing-1 | 4px | 极小间距 |
| spacing-2 | 8px | 小间距 |
| spacing-3 | 12px | 中小间距 |
| spacing-4 | 16px | 标准间距 |
| spacing-6 | 24px | 中等间距 |
| spacing-8 | 32px | 大间距 |
| spacing-12 | 48px | 超大间距 |
| spacing-16 | 64px | 区块间距 |

---

## 圆角系统

| 名称 | 值 | 用途 |
|------|------|------|
| radius-sm | 4px | 小元素、标签 |
| radius-md | 8px | 按钮、输入框 |
| radius-lg | 12px | 卡片、弹窗 |
| radius-xl | 16px | 大卡片 |
| radius-full | 9999px | 圆形、标签 |

---

## 阴影系统

| 名称 | 值 | 用途 |
|------|------|------|
| shadow-xs | `0 1px 2px rgba(0,0,0,0.05)` | 微阴影 |
| shadow-sm | `0 2px 4px rgba(0,0,0,0.06)` | 小阴影 |
| shadow-md | `0 4px 8px rgba(0,0,0,0.08)` | 中阴影 |
| shadow-lg | `0 8px 16px rgba(0,0,0,0.1)` | 大阴影 |
| shadow-xl | `0 16px 32px rgba(0,0,0,0.12)` | 超大阴影 |
| shadow-brand | `0 4px 12px rgba(255,107,0,0.2)` | 品牌阴影 |

---

## 组件规范

### 按钮

**主要按钮**
- 背景：品牌橙 `#FF6B00`
- 文字：白色
- 圆角：8px
- 内边距：12px 24px
- 悬停：背景变浅，添加阴影，上移1px
- 激活：背景变深，回到原位

**次要按钮**
- 背景：深黑 `#1A1A1A`
- 文字：白色
- 其他同主要按钮

**轮廓按钮**
- 背景：透明
- 边框：2px 中灰
- 文字：深黑
- 悬停：边框变深黑，背景浅灰

### 输入框

- 背景：白色
- 边框：2px 浅灰
- 圆角：8px
- 内边距：12px 16px
- 悬停：边框变深
- 焦点：边框变品牌橙，添加橙色光晕

### 卡片

- 背景：白色
- 边框：1px 浅灰
- 圆角：12px
- 内边距：24px
- 悬停：添加阴影，边框变深

---

## 动画规范

### 过渡时间

- Fast: 150ms（快速反馈）
- Base: 200ms（标准过渡）
- Slow: 300ms（复杂动画）
- Slower: 500ms（页面过渡）

### 缓动函数

- ease-in: 加速
- ease-out: 减速
- ease-in-out: 先加速后减速
- ease-bounce: 弹性效果

### 标准动画

- fadeIn: 淡入
- slideInUp: 从下往上滑入
- slideInDown: 从上往下滑入
- scaleIn: 缩放进入
- pulse: 脉冲（加载状态）

---

## 可访问性规范

### WCAG AA 标准

1. **对比度**
   - 正文文本：至少 4.5:1
   - 大文本：至少 3:1

2. **焦点状态**
   - 所有交互元素必须有明显的焦点指示
   - 使用品牌橙色光晕

3. **键盘导航**
   - 所有功能可通过键盘访问
   - Tab 顺序符合逻辑

4. **屏幕阅读器**
   - 所有图片有 alt 文本
   - 表单元素有 label
   - 使用语义化 HTML

5. **减少动画**
   - 尊重用户偏好设置
   - 提供减少动画选项

---

## 响应式断点

| 名称 | 宽度 | 用途 |
|------|------|------|
| sm | 640px | 手机横屏 |
| md | 768px | 平板竖屏 |
| lg | 1024px | 平板横屏、小屏笔记本 |
| xl | 1280px | 标准笔记本 |
| 2xl | 1536px | 大屏显示器 |

---

## 设计令牌使用示例

```css
/* 使用设计令牌 */
.my-button {
  background-color: var(--color-brand-primary);
  color: var(--color-text-inverse);
  padding: var(--spacing-3) var(--spacing-6);
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  transition: all var(--transition-base);
}

.my-button:hover {
  background-color: var(--color-brand-hover);
  box-shadow: var(--shadow-brand);
}
```

---

## 组件使用示例

```jsx
import { Button, Card, Tag } from './components/ui'

function MyComponent() {
  return (
    <Card elevated>
      <h2>故障诊断</h2>
      <Tag variant="brand">动力系统</Tag>
      <Button variant="primary" size="lg">
        开始诊断
      </Button>
    </Card>
  )
}
```

---

## 维护指南

### 添加新颜色

1. 在 `design-tokens.css` 中定义新变量
2. 更新本文档
3. 在所有使用该颜色的地方引用变量

### 添加新组件

1. 在 `components/ui/index.jsx` 中创建组件
2. 在 `components/ui/ui.css` 中添加样式
3. 更新本文档
4. 添加使用示例

### 修改设计令牌

1. 评估影响范围
2. 更新 `design-tokens.css`
3. 测试所有使用该令牌的组件
4. 更新本文档

---

## 版本历史

- v1.0.0 (2026-05-23): 初始版本，建立完整设计系统
