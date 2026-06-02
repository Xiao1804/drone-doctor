# DJI 消费级故障分类体系 v0.1

适用范围：DJI 消费级相机无人机，包括 Mini、Air、Mavic、Flip、Neo、Avata、Spark、Phantom 4 消费/准专业机型。企业、农业、机场/机场盒子、行业负载不在本批范围内。

## 一级分类

| 分类 ID | 名称 | 典型症状 | 对应 seed 案例 |
|---|---|---|---|
| `battery_power` | 电池与电源 | 无法开机、无法充电、电池灯异常、电池鼓包 | DJI-CONS-009, DJI-CONS-010 |
| `takeoff_propulsion` | 起飞与动力 | 电机无法启动、无法起飞、螺旋桨安装错误、电机异常 | DJI-CONS-005 |
| `flight_control_sensors` | 飞控与传感器 | IMU/指南针校准、传感器自检异常 | DJI-CONS-002, DJI-CONS-003 |
| `gnss_navigation` | GNSS 与导航 | GPS 弱/无信号、ATTI、搜星慢 | DJI-CONS-004 |
| `vision_sensors` | 视觉定位与避障 | Vision system error、视觉校准失败、避障能力下降 | DJI-CONS-013 |
| `remote_control_link` | 遥控链路 | Aircraft disconnected、遥控器信号弱、断连 | DJI-CONS-006, DJI-CONS-007 |
| `image_transmission` | 图传链路 | 无图传、黑屏、图传卡顿、信道干扰 | DJI-CONS-008 |
| `gimbal_camera` | 云台与相机 | 云台卡住、云台校准失败、颜色异常、画面异常 | DJI-CONS-001, DJI-CONS-014 |
| `flight_stability` | 飞行稳定性 | 起飞漂移、无法悬停、姿态异常 | DJI-CONS-011 |
| `return_to_home_safety` | 返航与飞行安全 | 低电返航、失控返航、RTH 高度设置不当 | DJI-CONS-015 |
| `flyaway_recovery` | 飞丢处置 | 找不到飞机、掉入危险位置、需要 Flyaway case | DJI-CONS-016 |
| `crash_damage` | 碰撞/跌落/进水 | 跌落后无法开机/无法起飞/图像抖动/结构损伤 | DJI-CONS-012 |

## 二级标签建议

- 设备部件：`battery`, `charging_hub`, `motor`, `propeller`, `gimbal`, `camera`, `remote_controller`, `microSD`, `vision_sensor`, `compass`, `IMU`, `GNSS`
- 环境因素：`obstruction`, `electromagnetic_interference`, `restricted_zone`, `low_temperature`, `high_temperature`, `indoor`, `low_light`, `reflective_ground`
- App/软件：`DJI Fly`, `DJI GO 4`, `firmware`, `calibration`, `linking`, `compatibility`, `channel_auto`
- 安全状态：`stop_flight`, `send_for_diagnosis`, `battery_hazard`, `RTH`, `ATTI`, `flyaway`

## 置信度与审核

| 字段 | 含义 |
|---|---|
| `confidence=A` | 来源为官方公开资料，内容可作为高可信“排查依据”。 |
| `confidence=B` | 来源为公开论坛、维修讨论、第三方维修文章，需要交叉验证。 |
| `confidence=C` | 来源不足、只可作为线索，不可直接入生产诊断。 |
| `humanReviewRequired=true` | 涉及安全或维修判断，必须人工复核。 |

## 后续论坛案例入库规则

每条论坛/维修讨论案例建议至少包含：

```json
{
  "id": "DJI-FORUM-YYYYMMDD-001",
  "sourceUrl": "原帖链接",
  "sourcePlatform": "DJI Forum / Reddit / 维修论坛 / 视频评论区",
  "postedAt": "原帖发布时间，未知则 null",
  "model": "机型",
  "symptom": "故障现象",
  "environment": "飞行/维修环境",
  "confirmedCause": "已确认原因，未确认则 null",
  "solution": "处理方法",
  "evidence": "原帖关键证据摘要",
  "confidence": "B/C",
  "reviewStatus": "pending"
}
```

不要把“网友猜测”写成已确认原因；如果只有现象没有结论，应把 `confirmedCause` 留空。
