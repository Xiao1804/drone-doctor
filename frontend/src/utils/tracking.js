/**
 * DroneDoctor 埋点工具
 * 异步 POST 到 /api/events，失败静默不报错
 */

import axios from 'axios'
import { apiUrl } from '../config/api'

// 待上报队列（防止页面关闭丢数据）
const queue = []
let flushing = false

/**
 * 上报埋点事件
 * @param {string} event - 事件名
 * @param {Object} data - 事件数据
 */
export function track(event, data = {}) {
  const payload = {
    event,
    data: {
      ...data,
      page_url: window.location.pathname,
      user_agent: navigator.userAgent.slice(0, 100)
    },
    timestamp: new Date().toISOString()
  }

  // 优先用 sendBeacon（页面关闭不丢数据）
  if (navigator.sendBeacon) {
    try {
      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' })
      navigator.sendBeacon(apiUrl('/api/events'), blob)
      return
    } catch (e) {
      // sendBeacon 失败，降级到 axios
    }
  }

  // 降级：用 axios 异步发送，静默失败
  axios.post(apiUrl('/api/events'), payload, { timeout: 5000 }).catch(() => {})
}

// ===== 预定义事件快捷方法 =====

/**
 * 开始诊断
 */
export function trackDiagnosisStart({ source, deviceType, faultType, remainingFree }) {
  track('diagnosis_start', {
    source,
    device_type: deviceType,
    fault_type: faultType,
    remaining_free: remainingFree
  })
}

/**
 * 诊断完成
 */
export function trackDiagnosisComplete({ diagnosisId, durationMs, stepsCount, difficulty }) {
  track('diagnosis_complete', {
    diagnosis_id: diagnosisId,
    duration_ms: durationMs,
    steps_count: stepsCount,
    difficulty
  })
}

/**
 * 反馈按钮
 */
export function trackFeedback({ result, diagnosisId }) {
  track('feedback_given', {
    result, // 'solved' | 'unsolved'
    diagnosis_id: diagnosisId
  })
}

/**
 * 付费墙页面浏览
 */
export function trackPaywallSeen({ remainingFree }) {
  track('paywall_seen', { remaining_free: remainingFree })
}

/**
 * 付费墙操作
 */
export function trackPaywallAction({ action }) {
  track('paywall_action', { action }) // 'upgrade' | 'come_back' | 'browse_free'
}

/**
 * 注册引导展示
 */
export function trackRegisterPromptSeen({ diagnosisCount }) {
  track('register_prompt_seen', { diagnosis_count: diagnosisCount })
}

/**
 * 注册引导操作
 */
export function trackRegisterPromptAction({ action }) {
  track('register_prompt_action', { action }) // 'register' | 'skip'
}
