#!/usr/bin/env python3
"""Analyze Walkera FCS-F8 ULog files and emit a compact JSON report.

The parser keeps confirmed facts separate from interpretation. Topic and field
names come from the ULog file via pyulog; business meaning is limited to the
current FCS-F8 evidence set used by DroneDoctor.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
from pathlib import Path

from pyulog import ULog


MODE_NAMES = {
    0: "ALTHOLD",
    1: "LOITER",
    11: "LAND",
}

RC_FUNCTIONS = {
    "ch01": "横滚 Roll",
    "ch02": "俯仰 Pitch",
    "ch03": "油门 Throttle",
    "ch04": "航向 Yaw",
    "ch05": "飞行模式开关",
}

HEX_X_MOTOR_LAYOUT = {
    1: {"port": "M1", "positionLabel": "前左", "rotationDirection": "顺时针 CW"},
    2: {"port": "M2", "positionLabel": "前右", "rotationDirection": "逆时针 CCW"},
    3: {"port": "M3", "positionLabel": "右侧", "rotationDirection": "顺时针 CW"},
    4: {"port": "M4", "positionLabel": "后右", "rotationDirection": "逆时针 CCW"},
    5: {"port": "M5", "positionLabel": "后左", "rotationDirection": "顺时针 CW"},
    6: {"port": "M6", "positionLabel": "左侧", "rotationDirection": "逆时针 CCW"},
}
HEX_X_PHYSICAL_PORTS = set(HEX_X_MOTOR_LAYOUT)

IMPORTANT_MESSAGE_PATTERNS = (
    "FC_SW_VERSION",
    "FC_SW_BUILD_DATE",
    "SN:",
    "GNSS_TIME",
    "mode set",
    "disarm",
    "failsafe",
    "health",
    "error",
    "fail",
    "lost",
)


def as_number(value):
    try:
        if hasattr(value, "item"):
            value = value.item()
        if isinstance(value, bytes):
            return value.decode("utf-8", errors="replace")
        if isinstance(value, (int, float)):
            if isinstance(value, float) and not math.isfinite(value):
                return None
            return value
        return float(value)
    except Exception:
        return None


def round_value(value, digits=3):
    if value is None:
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        rounded = round(value, digits)
        if rounded == int(rounded):
            return int(rounded)
        return rounded
    return value


def get_values(topic, field):
    if not topic or field not in topic.data:
        return []
    return [as_number(value) for value in topic.data[field]]


def row_count(topic):
    if not topic or not topic.data:
        return 0
    first = next(iter(topic.data.values()))
    return len(first)


def topic_fields(topic):
    if not topic:
        return []
    return list(topic.data.keys())


def find_topic(topics, *names):
    for name in names:
        for topic in topics:
            if topic.name == name:
                return topic
    return None


def rel_time(topic, index, fallback_start):
    timestamps = get_values(topic, "timestamp")
    if not timestamps or index >= len(timestamps):
        return None

    current = timestamps[index]
    if current is None:
        return None

    first = timestamps[0] or fallback_start or current
    base = fallback_start if fallback_start and current >= fallback_start else first
    try:
        return round((float(current) - float(base)) / 1_000_000, 2)
    except Exception:
        return None


def stats(topic, field):
    values = [value for value in get_values(topic, field) if isinstance(value, (int, float))]
    if not values:
        return None
    return {
        "field": field,
        "start": round_value(values[0]),
        "end": round_value(values[-1]),
        "min": round_value(min(values)),
        "max": round_value(max(values)),
        "avg": round_value(sum(values) / len(values)),
        "samples": len(values),
    }


def transitions(topic, field, fallback_start, limit=80):
    values = get_values(topic, field)
    result = []
    last = object()
    for index, value in enumerate(values):
        if value is None:
            continue
        comparable = round(value, 6) if isinstance(value, float) else value
        if comparable != last:
            item = {
                "time_s": rel_time(topic, index, fallback_start),
                "field": field,
                "value": round_value(value),
            }
            if field in ("flight_mode", "mode"):
                item["meaning"] = MODE_NAMES.get(int(value), "未知模式") if isinstance(value, (int, float)) else "未知模式"
            result.append(item)
            last = comparable
            if len(result) >= limit:
                break
    return result


def value_at_nearest_time(topic, field, target_time_s, fallback_start):
    timestamps = get_values(topic, "timestamp")
    values = get_values(topic, field)
    if not timestamps or not values:
        return None

    best_index = None
    best_delta = None
    for index, _timestamp in enumerate(timestamps):
        current = rel_time(topic, index, fallback_start)
        if current is None:
            continue
        delta = abs(current - target_time_s)
        if best_delta is None or delta < best_delta:
            best_delta = delta
            best_index = index
    if best_index is None or best_index >= len(values):
        return None
    return values[best_index]


def message_level(message):
    level_func = getattr(message, "log_level_str", None)
    if callable(level_func):
        try:
            return level_func()
        except Exception:
            return ""
    return ""


def parse_messages(ulog, fallback_start):
    messages = []
    important = []
    for message in getattr(ulog, "logged_messages", []):
        text = getattr(message, "message", "") or ""
        timestamp = getattr(message, "timestamp", None)
        item = {
            "time_s": round((timestamp - fallback_start) / 1_000_000, 2) if timestamp and fallback_start else None,
            "level": message_level(message),
            "message": text,
        }
        messages.append(item)
        low = text.lower()
        if any(pattern.lower() in low for pattern in IMPORTANT_MESSAGE_PATTERNS):
            important.append(item)
    return messages, important[:80]


def extract_identity(important_messages):
    identity = {}
    for item in important_messages:
        text = item["message"]
        for key in ("FC_SW_VERSION", "FC_SW_BUILD_DATE", "SN"):
            if key in text:
                identity[key] = text
        if "GNSS_TIME" in text:
            identity["GNSS_TIME"] = text
    return identity


def summarize_rc(rc_topic):
    channels = []
    for field, label in RC_FUNCTIONS.items():
        item = stats(rc_topic, field)
        if item:
            item["label"] = label
            item["max_abs_deviation_from_1500"] = round_value(max(abs(item["min"] - 1500), abs(item["max"] - 1500)))
            channels.append(item)
    return channels


def summarize_motors(motor_topic):
    motors = []
    fingerprints = {}
    for index in range(1, 13):
        field = f"MOT{index:02d}"
        item = stats(motor_topic, field)
        if not item:
            continue
        values = [value for value in get_values(motor_topic, field) if isinstance(value, (int, float))]
        fingerprint = tuple(round(value, 4) for value in values)
        fingerprints.setdefault(fingerprint, []).append(field)
        item["_fingerprint"] = fingerprint
        item["portIndex"] = index
        item["port"] = f"M{index}"
        layout = HEX_X_MOTOR_LAYOUT.get(index)
        if layout:
            item.update(layout)
            item["manualMapping"] = "FCS-F8 SE manual Hex X layout"
        else:
            item["manualMapping"] = "not part of manual Hex X six-motor layout"
        item["active_in_log"] = bool(item["max"] and item["max"] > 1050 and (item["max"] - item["min"]) > 20)
        motors.append(item)

    for motor in motors:
        duplicate_group = fingerprints.get(motor.pop("_fingerprint"), [])
        duplicate_count = len(duplicate_group)
        motor["duplicateGroupSize"] = duplicate_count
        motor["likelyPhysicalMotor"] = bool(motor.get("active_in_log") and motor["portIndex"] in HEX_X_PHYSICAL_PORTS)
        if motor["portIndex"] not in HEX_X_PHYSICAL_PORTS:
            motor["physicalMotorNote"] = "Excluded from Hex X six-motor statistics"

    active = [motor for motor in motors if motor.get("likelyPhysicalMotor")]
    spread = None
    if active:
        avg_values = [motor["avg"] for motor in active if isinstance(motor.get("avg"), (int, float))]
        if avg_values:
            spread = round_value(max(avg_values) - min(avg_values))
    return {
        "motors": motors,
        "activeCount": len(active),
        "avgSpread": spread,
        "manualLayout": {
            "name": "FCS-F8 SE Hex X",
            "source": "FCS-F8 SE CN manual pages 11-12",
            "note": "For the user-confirmed 6-motor aircraft, MOT01..MOT06 are interpreted as M1..M6 in the manual Hex X layout unless wiring evidence contradicts it.",
        },
    }


def summarize_gps(flight_topic, gps_topic, gnss_topic, fallback_start):
    gps = {
        "fixState": stats(gps_topic, "fixState"),
        "numSV": stats(gps_topic, "numSV"),
        "hAcc": stats(gps_topic, "hAcc"),
        "vAcc": stats(gps_topic, "vAcc"),
        "inavGpsHealthTransitions": transitions(flight_topic, "inav_gps_health", fallback_start, limit=40),
        "gnssFixType": stats(gnss_topic, "fixtype"),
        "gnssNumSv": stats(gnss_topic, "numsv"),
    }

    lat_values = get_values(gps_topic, "latitude")
    lon_values = get_values(gps_topic, "longitude")
    if lat_values and lon_values:
        first_lat, last_lat = lat_values[0], lat_values[-1]
        first_lon, last_lon = lon_values[0], lon_values[-1]
        scale = 10_000_000 if max(abs(first_lat or 0), abs(first_lon or 0), abs(last_lat or 0), abs(last_lon or 0)) > 180 else 1
        gps["position"] = {
            "start": {
                "lat": round_value((first_lat or 0) / scale, 7),
                "lon": round_value((first_lon or 0) / scale, 7),
            },
            "end": {
                "lat": round_value((last_lat or 0) / scale, 7),
                "lon": round_value((last_lon or 0) / scale, 7),
            },
            "scale": "degrees*1e7" if scale == 10_000_000 else "degrees",
        }
    return gps


def summarize_attitude(flight_topic):
    return {
        "roll": stats(flight_topic, "roll"),
        "pitch": stats(flight_topic, "pitch"),
        "yaw": stats(flight_topic, "yaw"),
        "roll_rate": stats(flight_topic, "roll_rate"),
        "pitch_rate": stats(flight_topic, "pitch_rate"),
        "yaw_rate": stats(flight_topic, "yaw_rate"),
        "velocity": [
            stats(flight_topic, "velocity[0]"),
            stats(flight_topic, "velocity[1]"),
            stats(flight_topic, "velocity[2]"),
        ],
        "position": [
            stats(flight_topic, "position[0]"),
            stats(flight_topic, "position[1]"),
            stats(flight_topic, "position[2]"),
        ],
    }


def summarize_battery(raw_sensor_topic):
    return {
        "raw_battery_voltage": stats(raw_sensor_topic, "raw_battery_voltage"),
        "smart_bat_voltage": stats(raw_sensor_topic, "smart_bat_voltage"),
        "smart_bat_current": stats(raw_sensor_topic, "smart_bat_current"),
        "smart_bat_temperature": stats(raw_sensor_topic, "smart_bat_temperature"),
        "smart_bat_capacity_percent": stats(raw_sensor_topic, "smart_bat_capacity_percen"),
    }


def build_timeline(flight_topic, mode_topic, important_messages, fallback_start):
    events = []
    for item in transitions(flight_topic, "flag_arm", fallback_start):
        label = "解锁/开始飞行" if item["value"] == 1 else "锁定/停止飞行"
        events.append({**item, "type": "arm", "label": label})
    for item in transitions(flight_topic, "failsafe", fallback_start):
        if item["value"] != 0:
            label = "failsafe 触发"
        else:
            label = "failsafe 正常/未触发"
        events.append({**item, "type": "failsafe", "label": label})
    for item in transitions(mode_topic, "mode", fallback_start):
        events.append({**item, "type": "mode", "label": f"模式切换：{item.get('meaning', item['value'])}"})
    for item in important_messages:
        text = item["message"]
        if "mode set" in text.lower() or "disarm" in text.lower() or "health" in text.lower() or "fail" in text.lower():
            events.append({
                "time_s": item["time_s"],
                "type": "message",
                "label": text,
                "value": None,
            })
    return sorted(events, key=lambda event: event["time_s"] if event["time_s"] is not None else 10**12)[:120]


def build_anomalies(flight_topic, gps_topic, motor_summary, battery_summary, important_messages, fallback_start):
    anomalies = []

    failsafe_values = [value for value in get_values(flight_topic, "failsafe") if isinstance(value, (int, float))]
    if any(value != 0 for value in failsafe_values):
        anomalies.append({
            "level": "danger",
            "title": "日志中出现 failsafe 非零状态",
            "description": "需要结合 mode/reason、遥控输入和 GNSS 状态进一步定位保护触发原因。",
            "confidence": "confirmed",
        })

    arm_values = [value for value in get_values(flight_topic, "flag_arm") if isinstance(value, (int, float))]
    if arm_values and not any(value == 1 for value in arm_values):
        anomalies.append({
            "level": "info",
            "title": "本日志没有检测到解锁飞行段",
            "description": "flag_arm 始终不为 1，可能是地面测试或未起飞日志。",
            "confidence": "confirmed",
        })

    gps_fix = stats(gps_topic, "fixState")
    if gps_fix and gps_fix.get("min") is not None and gps_fix["min"] < 3:
        anomalies.append({
            "level": "warning",
            "title": "GPS 定位状态曾低于 3",
            "description": "fixState 低于 3 的阶段不宜直接判断为稳定定位，需要看是否发生在解锁飞行段。",
            "confidence": "confirmed",
        })

    voltage = battery_summary.get("raw_battery_voltage")
    if voltage and voltage.get("start") and voltage.get("end"):
        drop = voltage["start"] - voltage["end"]
        if voltage["start"] > 0 and drop / voltage["start"] > 0.08:
            anomalies.append({
                "level": "warning",
                "title": "电压下降幅度较大",
                "description": f"raw_battery_voltage 从 {voltage['start']} 降到 {voltage['end']}，下降约 {round_value(drop)}。",
                "confidence": "medium-confidence inference",
            })

    if motor_summary.get("avgSpread") and motor_summary["avgSpread"] > 250:
        anomalies.append({
            "level": "warning",
            "title": "电机平均输出差异较大",
            "description": f"活跃电机平均输出差约 {motor_summary['avgSpread']}。这可能来自姿态控制、载荷偏心、风或电机/桨叶差异。",
            "confidence": "medium-confidence inference",
        })

    for item in important_messages:
        text = item["message"]
        low = text.lower()
        if any(word in low for word in ("error", "fail", "lost", "failsafe")):
            anomalies.append({
                "level": "warning",
                "title": "日志文本中出现异常关键词",
                "description": text,
                "time_s": item["time_s"],
                "confidence": "confirmed",
            })

    if not anomalies:
        anomalies.append({
            "level": "ok",
            "title": "未发现明确的 failsafe 或错误文本",
            "description": "这不等于完全无故障；漂移、振动、电机异常仍需结合具体飞行段和维修现象判断。",
            "confidence": "confirmed",
        })

    return anomalies[:30]


def build_conclusion(anomalies, flight_topic):
    severe = [item for item in anomalies if item["level"] == "danger"]
    warnings = [item for item in anomalies if item["level"] == "warning"]
    arm_values = [value for value in get_values(flight_topic, "flag_arm") if isinstance(value, (int, float))]

    if severe:
        return "日志中发现明确保护/异常状态，请优先查看 failsafe、模式切换和日志文本证据。"
    if warnings:
        return "日志可解析，并发现若干需要复核的风险线索。建议结合故障现象查看对应时间窗口。"
    if arm_values and any(value == 1 for value in arm_values):
        return "日志可解析，包含解锁飞行段，未见明确 failsafe 或错误文本。"
    return "日志可解析，但未检测到明显解锁飞行段，更像地面测试或未起飞日志。"


def format_duration_text(seconds):
    if not isinstance(seconds, (int, float)):
        return "-"
    seconds = int(round(seconds))
    minutes, remain = divmod(seconds, 60)
    if minutes:
        return f"{minutes}分{remain}秒"
    return f"{remain}秒"


def build_plain_summary(duration_seconds, flight_topic, gps_topic, motor_summary, battery_summary, anomalies, fallback_start):
    danger_count = sum(1 for item in anomalies if item.get("level") == "danger")
    warning_count = sum(1 for item in anomalies if item.get("level") == "warning")
    risk_level = "danger" if danger_count else "warning" if warning_count else "ok"

    good_news = []
    watch_items = []
    next_steps = []
    plain_metrics = [
        {
            "label": "日志时长",
            "value": format_duration_text(duration_seconds),
            "meaning": "这份文件覆盖的总时间",
        }
    ]

    arm_events = transitions(flight_topic, "flag_arm", fallback_start)
    arm_start = next((item["time_s"] for item in arm_events if item.get("value") == 1 and item.get("time_s") is not None), None)
    arm_end = next((item["time_s"] for item in arm_events if item.get("value") == 0 and item.get("time_s") is not None and arm_start is not None and item["time_s"] > arm_start), None)
    if arm_start is not None and arm_end is not None:
        armed_duration = round_value(arm_end - arm_start)
        plain_metrics.append({
            "label": "实际飞行",
            "value": format_duration_text(armed_duration),
            "meaning": "从解锁到落地锁定",
        })
        good_news.append(f"日志里能看到完整飞行过程：{arm_start}s 解锁，{arm_end}s 落地锁定。")
    elif arm_start is not None:
        good_news.append(f"日志里能看到 {arm_start}s 解锁，但没有明确落地锁定时间。")
    else:
        watch_items.append("没有检测到明确解锁飞行段，这份日志可能是地面测试或记录不完整。")

    failsafe_values = [value for value in get_values(flight_topic, "failsafe") if isinstance(value, (int, float))]
    if failsafe_values and all(value == 0 for value in failsafe_values):
        good_news.append("没有看到 failsafe 触发，暂未发现断联保护或紧急保护介入。")
    elif any(value != 0 for value in failsafe_values):
        watch_items.append("日志里出现 failsafe 非零值，需要优先排查遥控、定位或保护触发原因。")
        next_steps.append("先查 failsafe 发生时刻附近的遥控信号、GPS 状态和模式切换。")

    gps_fix = stats(gps_topic, "fixState")
    gps_sv = stats(gps_topic, "numSV")
    if gps_fix and gps_fix.get("min") is not None:
        if gps_fix["min"] >= 3:
            sv_text = f"，卫星数约 {gps_sv['min']}-{gps_sv['max']} 颗" if gps_sv else ""
            good_news.append(f"GPS 定位状态稳定，fixState 全程不低于 3{sv_text}。")
        else:
            watch_items.append("GPS 定位曾低于稳定状态，涉及漂移/返航/定点问题时要重点看这段。")
            next_steps.append("复核起飞前是否等到 GPS 稳定，再看 GNSS 健康状态是否中途掉线。")

    voltage = battery_summary.get("raw_battery_voltage")
    if voltage and voltage.get("start") and voltage.get("end"):
        drop = round_value(voltage["start"] - voltage["end"])
        plain_metrics.append({
            "label": "电压变化",
            "value": f"{voltage['start']}V → {voltage['end']}V",
            "meaning": f"下降约 {drop}V",
        })
        if voltage["start"] > 0 and (voltage["start"] - voltage["end"]) / voltage["start"] > 0.08:
            cell_note = ""
            if voltage["start"] > 35:
                cell_note = f"按 12S 粗略估算，结束时约 {round_value(voltage['end'] / 12, 2)}V/节。"
            watch_items.append(f"电池电压下降较大：从 {voltage['start']}V 降到 {voltage['end']}V。{cell_note}")
            next_steps.append("优先检查电池：是否满电起飞、单节压差、内阻、老化鼓包，以及降落电压参数。")

    motor_spread = motor_summary.get("avgSpread")
    active_count = motor_summary.get("activeCount")
    if active_count:
        plain_metrics.append({
            "label": "实体电机",
            "value": f"{active_count} 个",
            "meaning": f"六轴平均差 {formatValueForText(motor_spread)}",
        })
    if isinstance(motor_spread, (int, float)):
        if motor_spread <= 150:
            good_news.append(f"按六轴 Hex X 口径看，6 个实体电机平均输出差约 {motor_spread}，没有明显单个电机被拉爆。")
        elif motor_spread <= 250:
            watch_items.append(f"6 个实体电机平均输出差约 {motor_spread}，略有差异，若有抖动/偏航现象再重点排查电机和桨叶。")
        else:
            watch_items.append(f"6 个实体电机平均输出差约 {motor_spread}，需要检查载荷偏心、电机、桨叶或机架。")
            next_steps.append("检查 6 个电机和桨叶：桨叶是否变形、夹头是否松、机臂是否歪、载荷是否偏心。")

    mode_changes = transitions(flight_topic, "flight_mode", fallback_start)
    in_air_mode_changes = [
        item for item in mode_changes
        if item.get("time_s") is not None and arm_start is not None and item["time_s"] >= arm_start and (arm_end is None or item["time_s"] <= arm_end)
    ]
    if len(in_air_mode_changes) > 6:
        watch_items.append(f"飞行中模式切换较多，共检测到 {len(in_air_mode_changes)} 次，主要在 LOITER/ALTHOLD 间切换。")
        next_steps.append("询问飞手是否主动切换模式；如果不是人为操作，检查模式开关通道 ch05 和飞控模式配置。")
    elif in_air_mode_changes:
        good_news.append("飞行模式切换有记录，可用于和飞手操作过程对照。")

    if not good_news:
        good_news.append("日志已经成功解析，可以继续结合飞手描述定位问题。")
    if not watch_items:
        watch_items.append("没有看到明显保护触发或严重异常；如有具体故障现象，需要按对应时间段继续细查。")
    if not next_steps:
        next_steps.append("把这份摘要先和飞手描述对照：什么时候异常、当时在什么模式、是否有低电压或漂移。")

    if risk_level == "danger":
        headline = "这次日志里有需要优先处理的保护或异常。"
        summary = "先不要只看表格，优先定位保护触发时刻，再查遥控、定位、电池和模式切换。"
    elif warning_count:
        headline = "这次飞行没有看到明显断联保护，但有需要复核的风险点。"
        summary = "先看电池和模式切换；电机表、Topic 明细放在后面给工程师复核。"
    else:
        headline = "这次日志整体看起来比较平稳。"
        summary = "没有看到明显 failsafe 或严重异常；如果飞机有具体故障，需要按飞手描述的时间点继续查。"

    return {
        "riskLevel": risk_level,
        "headline": headline,
        "summary": summary,
        "goodNews": good_news[:5],
        "watchItems": watch_items[:5],
        "nextSteps": next_steps[:5],
        "plainMetrics": plain_metrics,
        "technicalHint": "下面的专业表格保留给维修工程师复核，普通用户先看本摘要即可。",
    }


def build_engineer_summary(flight_topic, gps_topic, motor_summary, battery_summary, anomalies, fallback_start):
    priorities = []
    do_not_misread = [
        "MOT07-MOT12 会保留原始数据，但这台六轴 Hex X 先按 MOT01-MOT06 做实体电机统计。",
        "没有 failsafe 只说明日志中未见保护触发，不等于飞机完全没有机械、电池或装配问题。",
        "电机平均差不大时，不要优先把 MOT11/MOT12 当成故障电机；应先按真实接线和六轴布局复核。",
    ]
    time_windows = []

    arm_events = transitions(flight_topic, "flag_arm", fallback_start)
    arm_start = next((item["time_s"] for item in arm_events if item.get("value") == 1 and item.get("time_s") is not None), None)
    arm_end = next((item["time_s"] for item in arm_events if item.get("value") == 0 and item.get("time_s") is not None and arm_start is not None and item["time_s"] > arm_start), None)
    if arm_start is not None:
        time_windows.append({
            "label": "解锁开始",
            "time_s": arm_start,
            "why": "从这里开始看真实飞行段。",
        })
    if arm_end is not None:
        time_windows.append({
            "label": "落地锁定",
            "time_s": arm_end,
            "why": "这里之后一般不再按空中故障判断。",
        })

    failsafe_events = [
        item for item in transitions(flight_topic, "failsafe", fallback_start)
        if isinstance(item.get("value"), (int, float)) and item.get("value") != 0
    ]
    if failsafe_events:
        first = failsafe_events[0]
        priorities.append({
            "level": "danger",
            "title": "1. 先查 failsafe/保护触发",
            "direction": "如果客户反馈断联、自动降落或突然不受控，先围绕保护触发时刻查。",
            "reason": f"日志中 failsafe 出现非零值，首次记录约在 {first.get('time_s')}s。",
            "check": "取该时刻前后 10 秒，对照遥控输入、GPS/GNSS、飞行模式和日志文本。",
        })
        time_windows.append({
            "label": "failsafe 首次非零",
            "time_s": first.get("time_s"),
            "why": "优先复盘保护触发前后。",
        })

    voltage = battery_summary.get("raw_battery_voltage")
    voltage_drop = None
    voltage_drop_ratio = None
    if voltage and voltage.get("start") and voltage.get("end"):
        voltage_drop = round_value(voltage["start"] - voltage["end"])
        voltage_drop_ratio = (voltage["start"] - voltage["end"]) / voltage["start"] if voltage["start"] else None
        cell_note = ""
        if voltage["start"] > 35:
            cell_note = f"按 12S 粗略估算，结束约 {round_value(voltage['end'] / 12, 2)}V/节。"
        level = "warning" if voltage_drop_ratio and voltage_drop_ratio > 0.08 else "info"
        title_prefix = "2" if priorities else "1"
        priorities.append({
            "level": level,
            "title": f"{title_prefix}. 电池/供电链路",
            "direction": "这条线应优先给维修工程师看，尤其是飞手反馈动力变弱、低电压、返航或降落异常时。",
            "reason": f"raw_battery_voltage 从 {voltage['start']}V 到 {voltage['end']}V，下降约 {voltage_drop}V。{cell_note}",
            "check": "查满电状态、单节压差、内阻、鼓包老化、插头接触、负载压降和低电压保护/降落参数。",
        })

    mode_changes = transitions(flight_topic, "flight_mode", fallback_start)
    in_air_mode_changes = [
        item for item in mode_changes
        if item.get("time_s") is not None and arm_start is not None and item["time_s"] >= arm_start and (arm_end is None or item["time_s"] <= arm_end)
    ]
    mode_names = sorted({item.get("meaning") for item in in_air_mode_changes if item.get("meaning")})
    if len(in_air_mode_changes) > 6:
        title_prefix = str(len(priorities) + 1)
        priorities.append({
            "level": "warning",
            "title": f"{title_prefix}. 飞行模式切换链路",
            "direction": "如果飞手没有主动切模式，就要查模式开关通道和飞控模式配置。",
            "reason": f"解锁飞行段内检测到 {len(in_air_mode_changes)} 次模式变化，涉及 {' / '.join(mode_names) if mode_names else '未知模式'}。",
            "check": "询问飞手是否主动切换；若否，复核 ch05、遥控器模式开关、飞控模式映射和接插件接触。",
        })
        for item in in_air_mode_changes[:6]:
            time_windows.append({
                "label": f"模式：{item.get('meaning', item.get('value'))}",
                "time_s": item.get("time_s"),
                "why": "与飞手操作记录对照。",
            })

    motor_spread = motor_summary.get("avgSpread")
    active_count = motor_summary.get("activeCount")
    title_prefix = str(len(priorities) + 1)
    if isinstance(motor_spread, (int, float)):
        if motor_spread <= 150:
            priorities.append({
                "level": "ok",
                "title": f"{title_prefix}. 电机/桨叶暂不作为首要怀疑",
                "direction": "除非客户明确反馈抖动、偏航、异响或某一路发热，否则先不要从 MOT11/MOT12 误判。",
                "reason": f"按六轴实体电机统计，活跃电机 {active_count} 个，平均输出差约 {formatValueForText(motor_spread)}。",
                "check": "若仍怀疑动力系统，再查 6 个真实电机、桨叶、夹头、机臂、载荷偏心和实际接线顺序。",
            })
        elif motor_spread <= 250:
            priorities.append({
                "level": "warning",
                "title": f"{title_prefix}. 电机/桨叶需要结合现象复核",
                "direction": "电机差异略大，但还不能单独定性为电机故障。",
                "reason": f"按六轴实体电机统计，平均输出差约 {formatValueForText(motor_spread)}。",
                "check": "重点看客户是否反馈抖动/偏航；现场检查桨叶、夹头、机臂、载荷偏心和电机温度。",
            })
        else:
            priorities.append({
                "level": "warning",
                "title": f"{title_prefix}. 电机/桨叶/载荷需要重点复核",
                "direction": "电机输出差异较大，需排除机械和载荷因素。",
                "reason": f"按六轴实体电机统计，平均输出差约 {formatValueForText(motor_spread)}。",
                "check": "检查桨叶变形、夹头松动、机臂变形、载荷偏心、电机轴承和实际电机接线。",
            })
    else:
        priorities.append({
            "level": "info",
            "title": f"{title_prefix}. 电机数据不足",
            "direction": "这份日志暂不能用电机平均差判断动力系统。",
            "reason": "未得到可用的六轴实体电机平均输出差。",
            "check": "需要复核 motors topic 是否存在，或补充同一故障时刻的完整日志。",
        })

    gps_fix = stats(gps_topic, "fixState")
    gps_sv = stats(gps_topic, "numSV")
    title_prefix = str(len(priorities) + 1)
    if gps_fix and gps_fix.get("min") is not None:
        if gps_fix["min"] >= 3:
            sv_text = f"，卫星数约 {gps_sv['min']}-{gps_sv['max']} 颗" if gps_sv else ""
            priorities.append({
                "level": "ok",
                "title": f"{title_prefix}. GPS/定位暂不作为首要怀疑",
                "direction": "除非故障现象是漂移、定点不稳或返航异常，否则先放在供电/模式后面。",
                "reason": f"fixState 全程不低于 3{sv_text}。",
                "check": "若客户反馈漂移或返航异常，再截取对应时间段看 hAcc、vAcc、GNSS 健康和位置变化。",
            })
        else:
            priorities.append({
                "level": "warning",
                "title": f"{title_prefix}. GPS/定位需要重点复核",
                "direction": "如果故障现象涉及漂移、定点或返航，这条线要提前。",
                "reason": f"fixState 最低到 {gps_fix['min']}，曾低于稳定定位状态。",
                "check": "复核起飞前搜星等待、GNSS 健康、水平/垂直精度、天线安装和遮挡。",
            })

    if not priorities:
        priorities.append({
            "level": "info",
            "title": "1. 先补充故障现象",
            "direction": "日志能解析，但需要飞手描述才能锁定排查方向。",
            "reason": "当前没有形成明显的保护、电池、电机或 GPS 单一指向。",
            "check": "补充异常发生时间、当时模式、飞行动作、是否报警、是否低电压、是否漂移/抖动/偏航。",
        })

    danger_or_warning = any(item.get("level") in ("danger", "warning") for item in priorities)
    if failsafe_events:
        headline = "工程师先围绕保护触发时刻复盘，再查供电、遥控和定位。"
    elif voltage_drop_ratio and voltage_drop_ratio > 0.08:
        headline = "工程师先查电池/供电，再核对模式切换；电机暂不作为首要怀疑。"
    elif danger_or_warning:
        headline = "工程师按下面优先级复核，不要先被单个原始字段带偏。"
    else:
        headline = "工程师可先确认客户故障现象，再按供电、模式、电机、GPS 顺序排查。"

    return {
        "headline": headline,
        "handoff": "给工程师的读法：先看优先级 1，再看对应证据和复核动作；后面的 Topic 表只用于定位细节。",
        "priorities": priorities[:6],
        "doNotMisread": do_not_misread,
        "timeWindows": time_windows[:10],
        "askPilot": [
            "异常发生在起飞、悬停、切模式、返航还是降落阶段？大概第几秒？",
            "LOITER/ALTHOLD 的切换是否由飞手主动操作？",
            "当时是否有低电压提示、动力变弱、漂移、抖动、偏航或异响？",
        ],
    }


def formatValueForText(value):
    if value is None:
        return "-"
    if isinstance(value, float):
        return str(round_value(value))
    return str(value)


def analyze(input_path):
    ulog = ULog(str(input_path), disable_str_exceptions=True)
    topics = list(ulog.data_list)
    fallback_start = ulog.start_timestamp or 0

    flight_topic = find_topic(topics, "flight")
    mode_topic = find_topic(topics, "mode")
    gps_topic = find_topic(topics, "gps_raw")
    gnss_topic = find_topic(topics, "gnss_inav")
    rc_topic = find_topic(topics, "rcin")
    motor_topic = find_topic(topics, "motors")
    raw_sensor_topic = find_topic(topics, "raw_sensor")

    all_messages, important_messages = parse_messages(ulog, fallback_start)
    motor_summary = summarize_motors(motor_topic)
    battery_summary = summarize_battery(raw_sensor_topic)
    anomalies = build_anomalies(flight_topic, gps_topic, motor_summary, battery_summary, important_messages, fallback_start)
    duration_seconds = round_value((ulog.last_timestamp - ulog.start_timestamp) / 1_000_000 if ulog.last_timestamp else None)

    return {
        "file": {
            "name": input_path.name,
            "sizeBytes": input_path.stat().st_size,
        },
        "overview": {
            "durationSeconds": duration_seconds,
            "topicCount": len(topics),
            "messageCount": len(all_messages),
            "conclusion": build_conclusion(anomalies, flight_topic),
        },
        "plainSummary": build_plain_summary(duration_seconds, flight_topic, gps_topic, motor_summary, battery_summary, anomalies, fallback_start),
        "engineerSummary": build_engineer_summary(flight_topic, gps_topic, motor_summary, battery_summary, anomalies, fallback_start),
        "identity": extract_identity(important_messages),
        "timeline": build_timeline(flight_topic, mode_topic, important_messages, fallback_start),
        "anomalies": anomalies,
        "flight": {
            "armTransitions": transitions(flight_topic, "flag_arm", fallback_start),
            "flightModeTransitions": transitions(flight_topic, "flight_mode", fallback_start),
            "failsafeTransitions": transitions(flight_topic, "failsafe", fallback_start),
        },
        "gps": summarize_gps(flight_topic, gps_topic, gnss_topic, fallback_start),
        "battery": battery_summary,
        "attitude": summarize_attitude(flight_topic),
        "rc": summarize_rc(rc_topic),
        "motors": motor_summary,
        "messages": important_messages,
        "topics": [
            {
                "name": topic.name,
                "multiId": topic.multi_id,
                "rows": row_count(topic),
                "fieldCount": len(topic_fields(topic)),
                "fields": topic_fields(topic)[:80],
            }
            for topic in sorted(topics, key=lambda item: item.name)
        ],
        "confidenceNotes": {
            "confirmed": [
                "ULog 容器、topic 名、field 名、行数和日志文本来自原始文件。",
                "FCS-F8 手册确认 RC 默认映射：ch01 横滚、ch02 俯仰、ch03 油门、ch04 航向、ch05 模式开关。",
                "已知样本确认 mode=0 ALTHOLD、mode=1 LOITER、mode=11 LAND；其他枚举仍需证据。",
            ],
            "inferred": [
                "电机输出按 PWM 类数值解释，1000 左右通常表示低/怠速。",
                "经纬度若为大整数，按 degrees*1e7 显示。",
                "电压和电机差异告警是维修线索，不等同于厂家故障结论。",
            ],
            "unknown": [
                "完整 mode.reason、failsafe 枚举、debug 字段含义尚未由厂家文档确认。",
                "position/velocity/accel 的精确坐标轴和单位需要校准日志或厂家报告继续确认。",
                "六轴 Hex X 的 MOT01-MOT06 可按手册解释为 M1-M6：前左、前右、右侧、后右、后左、左侧；仍需以实际接线为最终确认。",
            ],
        },
    }


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    parser = argparse.ArgumentParser(description="Analyze Walkera FCS-F8 ULog files.")
    parser.add_argument("--input", required=True, help="Path to a .ulg file")
    args = parser.parse_args()

    input_path = Path(args.input).expanduser().resolve()
    if not input_path.exists():
        raise SystemExit(f"Input file not found: {input_path}")
    if input_path.suffix.lower() != ".ulg":
        raise SystemExit("Only .ulg ULog files are supported in this parser.")

    result = analyze(input_path)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
