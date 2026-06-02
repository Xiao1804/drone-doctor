# DJI 消费级公开故障案例种子

生成日期：2026-05-30

结构化数据位于：

`data/dji-consumer-public/public_fault_cases.json`

说明：当前 16 条不是论坛现场维修实录，而是从 DJI 官方公开排查资料提炼出的“故障模式/排查案例”。因此字段中统一标记为 `public_official_troubleshooting_pattern`，不能伪装成真实维修案例。

| ID | 故障现象 | 分类 | 公开来源 | 人工审核 |
|---|---|---|---|---|
| DJI-CONS-001 | DJI Fly 提示云台卡住 40002 | 云台与相机 | DJI-S01 | 必须 |
| DJI-CONS-002 | IMU 需要校准/校准失败 | 飞控与传感器 | DJI-S02 | 必须 |
| DJI-CONS-003 | 指南针校准提示或失败 | 飞控与传感器 | DJI-S03 | 必须 |
| DJI-CONS-004 | GPS 弱/无 GPS/ATTI 风险 | GNSS 与导航 | DJI-S04 | 必须 |
| DJI-CONS-005 | 电机无法启动或无法起飞 | 起飞与动力 | DJI-S05, DJI-S15, DJI-S18 | 必须 |
| DJI-CONS-006 | Aircraft Disconnected/未连接遥控器 | 遥控链路 | DJI-S06 | 必须 |
| DJI-CONS-007 | 遥控器信号弱、断连、图传卡顿 | 遥控链路 | DJI-S07, DJI-S15 | 必须 |
| DJI-CONS-008 | 无图传信号或相机画面黑屏 | 图传链路 | DJI-S08 | 必须 |
| DJI-CONS-009 | 智能飞行电池无法充电 | 电池与电源 | DJI-S09 | 必须 |
| DJI-CONS-010 | 电量充足但飞机无法开机 | 电池与电源 | DJI-S10 | 必须 |
| DJI-CONS-011 | 起飞漂移或无法定点悬停 | 飞行稳定性 | DJI-S11, DJI-S04, DJI-S02, DJI-S03, DJI-S13 | 必须 |
| DJI-CONS-012 | 碰撞或跌落后结构/电子损伤风险 | 碰撞/跌落/进水 | DJI-S12 | 必须 |
| DJI-CONS-013 | 视觉系统错误或视觉校准失败 | 视觉定位与避障 | DJI-S13 | 必须 |
| DJI-CONS-014 | 拍摄照片或视频颜色异常 | 云台与相机 | DJI-S14 | 必须 |
| DJI-CONS-015 | 返航/低电/失控返航设置不当 | 返航与飞行安全 | DJI-S15, DJI-S16 | 必须 |
| DJI-CONS-016 | 飞丢或无法定位飞机 | 飞丢处置 | DJI-S17 | 必须 |

## 审核建议

- 先审核 `stopConditions`：这些决定用户什么时候必须停止 DIY。
- 再审核 `triageSteps`：确认是否符合你的教学口径，不鼓励危险试飞。
- 最后审核 `faultCategory`：如果未来要接入现有诊断系统，分类名称要和数据库保持一致。
