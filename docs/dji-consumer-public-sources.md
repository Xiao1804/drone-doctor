# DJI 消费级公开资料来源索引

生成日期：2026-05-30

本批资料只使用公开网页。当前 seed 批次优先采用 DJI 官方帮助中心和 CAAC/交通运输部公开法规，后续论坛/维修讨论应单独标注为 `public_forum_case` 或 `public_repair_discussion`。

## DJI 官方资料

| ID | 用途 | 来源 |
|---|---|---|
| DJI-S01 | 云台卡住 40002 | [What should I do if the DJI Fly app prompts “Gimbal stuck”?](https://repair.dji.com/help/content?customId=01700007722&documentType=&lang=en&paperDocType=ARTICLE&re=US&spaceId=17) |
| DJI-S02 | IMU 校准 | [IMU Calibration Guide](https://repair.dji.com/help/content?customId=en-us03400006763&lang=en&re=US&spaceId=34) |
| DJI-S03 | 指南针校准 | [Compass Calibration Guide](https://repair.dji.com/help/content?customId=01700006765&lang=en&paperDocType=ARTICLE&re=US&spaceId=17) |
| DJI-S04 | GPS 信号弱/丢失、ATTI 风险 | [Poor Aircraft GPS Signal or Signal Lost](https://repair.dji.com/help/content?customId=01700006474&lang=en&paperDocType=ARTICLE&re=US&spaceId=17) |
| DJI-S05 | 无法起飞、电机/螺旋桨/受限区 | [How to Fix Drone that Can Not Take off](https://repair.dji.com/help/content?customId=01700006800&documentType=&lang=en&paperDocType=ARTICLE&re=US&spaceId=17) |
| DJI-S06 | 飞机与遥控器断连/未连接 | [The app prompts an “Aircraft Disconnected” or “Aircraft not connected to RC” warning](https://repair.dji.com/help/content?customId=01700006757&lang=en&paperDocType=ARTICLE&re=US&spaceId=17) |
| DJI-S07 | 遥控器信号弱/断连 | [How Can I Handle the Remote Controller Signal Error During Flight?](https://repair.dji.com/help/content?customId=01700006475&documentType=&lang=en&paperDocType=ARTICLE&re=US&spaceId=17) |
| DJI-S08 | 无图传/画面黑屏/图传异常 | [How Can I Deal with Image Transmission Issues?](https://repair.dji.com/help/content?customId=01700006477&documentType=&lang=en&paperDocType=ARTICLE&re=US&spaceId=17) |
| DJI-S09 | 智能飞行电池无法充电 | [Aircraft Battery Charging Failure](https://repair.dji.com/help/content?customId=01700006785&documentType=&lang=en&paperDocType=ARTICLE&re=US&spaceId=17) |
| DJI-S10 | 飞机无法开机 | [Unable to Power On the Aircraft](https://repair.dji.com/help/content?customId=01700006767&lang=en&paperDocType=ARTICLE&re=US&spaceId=17) |
| DJI-S11 | 起飞漂移/无法悬停 | [[Self-Troubleshooting] Aircraft Drifting During Takeoff](https://repair.dji.com/help/content?customId=01700009271&documentType=&lang=en&paperDocType=BARRIERTREE&re=US&spaceId=17) |
| DJI-S12 | 碰撞或跌落损伤 | [Aircraft Damage Due to Collision or Dropping](https://repair.dji.com/help/content?customId=01700006752&lang=en&paperDocType=ARTICLE&re=US&spaceId=17) |
| DJI-S13 | 视觉传感器校准 | [Aircraft Vision Sensor Calibration Instructions](https://repair.dji.com/help/content?customId=01700006473&documentType=&lang=en&paperDocType=ARTICLE&re=US&spaceId=17) |
| DJI-S14 | 拍摄素材颜色异常 | [Abnormal Colors on Footage Captured by Drones](https://repair.dji.com/help/content?customId=01700006788&documentType=&lang=en&paperDocType=ARTICLE&re=US&spaceId=17) |
| DJI-S15 | 飞行安全、信号丢失行为、返航高度 | [Flight Safety Guidelines](https://repair.dji.com/help/content?customId=01700006768&lang=en&paperDocType=ARTICLE&re=US&spaceId=17) |
| DJI-S16 | RTH 逻辑、低电返航、失控返航 | [Drone RTH Logic](https://repair.dji.com/help/content?customId=en-us03400006776&documentType=artical&lang=en&paperDocType=paper&re=US&spaceId=34) |
| DJI-S17 | 飞丢后查找与 Flyaway 处置 | [Flyaway Tips: What to Do When Drone Flies Away](https://repair.dji.com/help/content?customId=en-us03400006883&lang=en&re=US&spaceId=34) |
| DJI-S18 | Mini 3 入门、螺旋桨/飞前检查/RTH 设置 | [A Beginner's Guide to DJI Mini 3](https://repair.dji.com/help/content?customId=en-us03400007192&documentType=artical&lang=en&paperDocType=paper&re=US&spaceId=34) |

## CAAC/法规公开资料

| ID | 用途 | 来源 |
|---|---|---|
| CAAC-S01 | CAAC 风格题库的法规依据 | [民用无人驾驶航空器运行安全管理规则（CAAC/交通运输部令 2024 年第 1 号）](https://www.caac.gov.cn/PHONE/XXGK_17/XXGK/MHGZ/202401/t20240103_222566.html) |
| CAAC-S02 | 同一规则 PDF 版本 | [民用无人驾驶航空器运行安全管理规则 PDF](https://app.caac.gov.cn/XXGK/XXGK/MHGZ/202401/P020240103569247124102.pdf) |

## 入库注意

- `public_fault_cases.json` 中的 `confidence=A` 只表示来源为官方公开资料，不表示维修结论可跳过人工审核。
- DJI 官方帮助中心内容是排查模式，不等于真实维修现场案例。真实论坛/维修讨论入库时必须保留原帖链接、发布时间、作者/平台、截图或摘录证据。
- CAAC 题目为“风格化练习题”，不是官方真题。
