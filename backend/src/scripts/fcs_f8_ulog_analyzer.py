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

    return {
        "file": {
            "name": input_path.name,
            "sizeBytes": input_path.stat().st_size,
        },
        "overview": {
            "durationSeconds": round_value((ulog.last_timestamp - ulog.start_timestamp) / 1_000_000 if ulog.last_timestamp else None),
            "topicCount": len(topics),
            "messageCount": len(all_messages),
            "conclusion": build_conclusion(anomalies, flight_topic),
        },
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
