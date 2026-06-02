# 非官方安全练习题种子：DJI 消费级安全与排查

生成日期：2026-05-30

说明：这是基于公开法规与 DJI 官方安全/排查资料生成的非官方安全练习题草稿，不是 CAAC 官方真题，也不是依据 CAAC 官方考试大纲逐条生成的题库。所有题目均标记为 `pending_human_review`，只能作为产品内容草稿或安全教育素材，不能作为 CAAC 备考题库发布。

结构化 JSON 位于：

`data/dji-consumer-public/safety_practice_questions_seed.json`

## 本地题库整合说明

2026-06-01 已另行完成一批本地 Word/PDF 题库的整合输出，结果位于：

`C:\Users\xmh\Desktop\题库_整合输出\`

交接说明见 [CAAC 题库整合交接说明](./caac-question-bank-integration-handoff.md)。

注意：本地整合题库仍不能默认视为 CAAC 官方真题。它只是对已有本地资料的提取、归类、去重和公开依据解析补充；发布前仍需人工复核来源、答案和解析。

## 更正说明

上一版标题使用“CAAC 风格题库”，容易让人误以为这些题来自 CAAC 官方题库或官方考试大纲。这里更正为“非官方安全练习题”。如果要做真正的 CAAC 题库，应先锁定公开考试大纲、法规条文、训练教材章节和可合法引用的样题，再逐题绑定依据。

## 当前草稿覆盖

| 章节 | 题量 | 主要来源 |
|---|---:|---|
| 飞行前准备 | 2 | DJI-S15, DJI-S16, DJI-S18 |
| 飞行环境与干扰 | 3 | DJI-S03, DJI-S04, DJI-S15 |
| 异常状态处置 | 3 | DJI-S04, DJI-S12, DJI-S17 |
| 设备排查 | 8 | DJI-S01, DJI-S02, DJI-S05, DJI-S07, DJI-S08, DJI-S09 |
| 返航与低电 | 2 | DJI-S15, DJI-S16 |
| 法规意识 | 2 | CAAC-S01, CAAC-S02 |

## 不能声称

- 不能声称为 CAAC 官方题库。
- 不能声称为官方真题、押题或考试原题。
- 不能声称全部题目来自 CAAC 官方考试大纲。
- 不能把 DJI 官方排查建议当作 CAAC 法规条文。

## 可用于产品的标签

- `preflight_check`
- `gps_atti`
- `compass_imu`
- `takeoff_propulsion`
- `remote_signal`
- `battery_safety`
- `rth_low_battery`
- `flyaway_recovery`
- `regulation_awareness`
- `human_review`

## 审核重点

1. 法规题：需要你确认是否符合当前 CAAC 考试章节表述；未经确认前不要发布为 CAAC 题库。
2. DJI 排查题：需要确认是否适合学员/普通用户，不应鼓励拆机或试飞验证风险。
3. 题干措辞：避免“绝对化”，尤其是返航、避障、GNSS、低电等场景。
4. 答案解析：保留来源依据，但不要把官方帮助中心内容当作法规条文。
5. 本地整合题库：去重必须按正确答案文字内容判断，选项顺序变化但正确内容一致的题应合并；只有正确答案内容实质不同才标“答案内容冲突”。
