# DroneDoctor 用户反馈系统 MVP 设计

## 目标

当前阶段不做客服系统、不做邮件通知、不做复杂工单。反馈系统只解决一个核心问题：

> 用户使用 DroneDoctor 后，能把“有没有帮助、哪里不准、哪里看不懂、希望增加什么”反馈给管理员，管理员能查看并记录处理结果。

## 用户侧场景

### 入口

第一版只做一个全局固定入口：

- 页面右下角：`反馈`

后续再扩展到：

- 诊断结果页：`这次诊断有帮助吗？`
- 排故节点页：`这一步你能完成吗？`
- 飞行日志页：`日志分析结果是否准确？`

### 表单字段

用户提交反馈时填写：

| 字段 | 说明 |
|---|---|
| type | 反馈类型 |
| rating | 有帮助 / 没帮助 / 看不懂 / 未选择 |
| content | 反馈正文 |
| contact | 联系方式，可选 |
| page | 当前页面路径 |

反馈类型第一版：

```text
诊断不准确
看不懂步骤
不会操作
页面/功能出错
想要新增功能
其他
```

## 管理员侧场景

管理员页面：

```text
/admin/feedback
```

管理员可以：

- 查看反馈列表
- 按状态筛选
- 查看用户、页面、类型、内容、联系方式
- 修改状态
- 填写管理员备注

状态：

```text
new        新反馈
reviewing 处理中
resolved   已处理
ignored    不采纳/忽略
```

## 数据表

表名：`feedback`

| 字段 | 类型 | 说明 |
|---|---|---|
| id | serial/integer | 主键 |
| user_id | text | 用户 ID，可为空 |
| username | text | 用户名快照，可为空 |
| type | text | 反馈类型 |
| rating | text | 反馈评价 |
| page | text | 来源页面 |
| content | text | 反馈内容 |
| contact | text | 联系方式，可为空 |
| diagnosis_id | text | 关联诊断 ID，预留 |
| tree_id | text | 关联决策树 ID，预留 |
| node_id | text | 关联节点 ID，预留 |
| status | text | new/reviewing/resolved/ignored |
| admin_note | text | 管理员备注 |
| created_at | timestamp/text | 创建时间 |
| updated_at | timestamp/text | 更新时间 |

## API 设计

### POST /api/feedback

提交反馈。允许匿名用户和登录用户。

请求：

```json
{
  "type": "诊断不准确",
  "rating": "not_helpful",
  "page": "/guide/tree-flight-abnormal",
  "content": "这里建议查 GPS，但我的 APP 报的是电池通信异常。",
  "contact": "user@example.com",
  "diagnosisId": "optional",
  "treeId": "optional",
  "nodeId": "optional"
}
```

响应：

```json
{
  "success": true,
  "feedback": {
    "id": 1,
    "status": "new"
  }
}
```

### GET /api/feedback/admin

管理员查看反馈列表。

查询参数：

```text
status=new&page=1&pageSize=20
```

### PUT /api/feedback/admin/:id

管理员更新反馈状态和备注。

请求：

```json
{
  "status": "reviewing",
  "adminNote": "后续补充电池通信异常分支。"
}
```

## 验收标准

1. 匿名用户能提交反馈
2. 登录用户能提交反馈，并记录 user_id / username
3. 普通用户访问 `/api/feedback/admin` 返回 403
4. 管理员能访问 `/admin/feedback`
5. 管理员能更新反馈状态和备注
6. 反馈正文为空时返回 400
7. 反馈类型不在白名单时返回 400

## 后续扩展

反馈 MVP 稳定后，再做：

- 诊断结果绑定反馈
- 排故节点绑定反馈
- 高频反馈统计
- 反馈导出
- 邮件通知
- 客服工单
