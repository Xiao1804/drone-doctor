# 交互式诊断向导 — 决策树架构设计

## 核心理念

维修助手作为智能体，通过**问答式引导**帮助新人按 SOP 流程排查故障。不是一次性给出诊断结果，而是一步一步引导，每步都有明确的操作指令和判定标准。

---

## 决策树节点类型

```typescript
interface DecisionNode {
  id: string;           // 节点唯一标识
  type: 'question' | 'action' | 'terminal' | 'checklist';
  title: string;        // 步骤标题
  description: string;  // 操作说明
  criteria?: string;    // 判定标准（question 节点必填）
  tools?: string[];     // 所需工具
  estimatedTime?: string; // 预计耗时
  
  // question 节点：有两个分支
  yes?: Branch;
  no?: Branch;
  
  // action 节点：执行后自动进入下一步
  next?: Branch;
  
  // 关联故障案例
  caseId?: string;      // 如 "F099"
  
  // terminal 节点：定损结论
  conclusion?: string;  // 如 "[电调板损坏]"
  recommendation?: string; // 建议操作
}

interface Branch {
  label: string;        // 按钮文字
  goto: string;         // 目标节点 id
  action?: string;      // 附加动作说明
}
```

---

## 5 个决策树

### 1. 定损前通用检查（tree-damage-assessment）
- 线性流程（无分支），6 个步骤依次执行
- 每步检查一项外观/标识/完整性
- 最终节点：外观检查完成，记录并拍照

### 2. 无法开机排查（tree-power-on）
- 分支决策树
- 核心判断：更换电池？→ 排线？→ 电调板？→ 核心板？
- 终端节点：电池定损 / 电调板损坏 / 核心板损坏 / 待确认

### 3. 机身链路测试（tree-link-test）
- 前提：飞机能开机，运行 ET7KY13 链路测试
- 按报错项分类（核心板/电调板/电机/GPS/硬盘/TOF/机臂灯/电池在位/指南针/SD卡槽/相机/云台轴臂）
- 每个报错项：检查排线 → 定损更换
- 特殊分支：相机出图异常 → 花屏/条纹/撕裂判断；云台轴臂 → ET7KY08 测试

### 4. 云台故障（tree-gimbal）
- 两个主分支：转动问题 / 图像问题
- 转动：ET7KY08 → 轴臂受阻 / 电机霍尔损坏 / 排除转动故障
- 图像：花屏/条纹/黑屏/撕裂 → 持续复现判断 → 相机损坏 / FPC 损坏 / 清晰度不良 / 异色点 / 镜头脏污

### 5. 电池故障（tree-battery）
- 分支决策树
- 外观 → 插入开机 → 充电 → APP 检测 → 飞测
- 终端节点：FU 模式 / Shutdown 保护 / 电量过低 / PF 永久失效 / 触发保护 / 充电电路损坏 / 检测异常 / 排除电池故障

---

## 维修完成后综合检查（checklist-post-repair）

非决策树，是**检查清单**，在所有故障修复完成后弹出：
- 8 个检查项（测试矩阵、链路测试、APP 测试、大包版本、防水标签、线扣方向、SN 录件、维修记录）
- 每项可勾选
- 全部勾选后才能提交

---

## API 设计

### GET /api/decision-trees
返回决策树列表：
```json
{
  "trees": [
    { "id": "tree-damage-assessment", "name": "定损前通用检查", "category": "通用流程", "description": "..." },
    { "id": "tree-power-on", "name": "无法开机排查", "category": "电源", "description": "..." },
    ...
  ]
}
```

### GET /api/decision-trees/:id
返回单个决策树完整数据（所有节点）。

### 前端驱动逻辑
- 决策树数据一次性加载到前端
- 用户每点一步，前端根据 `yes/no/next` 跳转到对应节点
- 无需后端参与步骤跳转（纯前端状态管理）
- 终端节点时，前端展示定损结论 + 弹出综合检查清单

---

## 页面流程

```
/guide                          → 选择故障类型（5个卡片）
/guide/:treeId                  → 进入向导
/guide/:treeId/step/:nodeId     → 显示当前步骤
/guide/:treeId/result           → 终端结论页
/guide/:treeId/checklist        → 综合检查清单
```

---

## UI 设计要点

1. **进度条**：顶部显示当前步骤 / 总步骤
2. **步骤卡片**：大卡片展示操作说明 + 判定标准
3. **按钮设计**：
   - Question 节点：左侧绿色「✅ 是（符合标准）」+ 右侧红色「❌ 否（不符合）」
   - Action 节点：中间「➡️ 已完成，继续」
4. **终端结论**：大字号显示 `[电调板损坏]`，下方给出更换指引
5. **返回上一步**：左上角返回箭头，可随时回退
6. **工具提示**：如果步骤需要 ET7KY08/ET7KY13 等工具，高亮显示
