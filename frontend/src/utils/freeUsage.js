import axios from 'axios'
import { apiUrl } from '../config/api'

const MAX_FREE = 3
const STORAGE_KEY = 'dd_diagnosis_count'
const STORAGE_DATE_KEY = 'dd_diagnosis_date'

/**
 * 获取当前登录用户的 token
 */
function getAuthToken() {
  return localStorage.getItem('token')
}

/**
 * 从后端获取真实的免费使用状态
 * 已登录用户和未登录用户都适用
 */
export async function fetchFreeUsageState() {
  try {
    const token = getAuthToken()
    const headers = token ? { Authorization: `Bearer ${token}` } : {}
    const res = await axios.get(apiUrl('/api/stats/free-usage'), {
      headers,
      timeout: 5000,
    })
    return {
      used: Number(res.data.used || 0),
      remaining: res.data.isAdmin ? Infinity : Number(res.data.remaining || 0),
      limit: Number(res.data.limit || MAX_FREE),
      allowed: !!res.data.allowed,
      isAdmin: !!res.data.isAdmin,
    }
  } catch (error) {
    // 后端不可用时 fallback 到 localStorage
    const today = new Date().toISOString().slice(0, 10)
    const savedDate = localStorage.getItem(STORAGE_DATE_KEY)
    if (savedDate !== today) {
      localStorage.setItem(STORAGE_DATE_KEY, today)
      localStorage.setItem(STORAGE_KEY, '0')
      return { used: 0, remaining: MAX_FREE, limit: MAX_FREE, allowed: true, isAdmin: false }
    }
    const used = parseInt(localStorage.getItem(STORAGE_KEY) || '0', 10)
    return {
      used,
      remaining: Math.max(0, MAX_FREE - used),
      limit: MAX_FREE,
      allowed: used < MAX_FREE,
      isAdmin: false,
    }
  }
}

/**
 * 诊断开始前获取可用次数，并同步本地展示缓存。
 */
export async function checkFreeUsageBeforeDiagnosis() {
  const state = await fetchFreeUsageState()
  if (state.isAdmin) {
    syncLocalCount(0)
  } else {
    syncLocalCount(state.used)
  }
  return state
}

/**
 * 同步 localStorage 计数（用于前端展示一致性）
 */
export function syncLocalCount(used) {
  const today = new Date().toISOString().slice(0, 10)
  localStorage.setItem(STORAGE_DATE_KEY, today)
  localStorage.setItem(STORAGE_KEY, String(used))
}

/**
 * 清空本地免费次数展示缓存。
 * 登录、退出、切换账号后调用，避免旧账号/匿名状态污染新账号展示。
 */
export function clearLocalUsageCache() {
  localStorage.removeItem(STORAGE_KEY)
  localStorage.removeItem(STORAGE_DATE_KEY)
}

/**
 * 检查是否为免费次数超限错误
 */
export function isFreeLimitError(error) {
  return error?.response?.status === 429 ||
    error?.response?.data?.code === 'FREE_LIMIT_EXCEEDED'
}

/**
 * 获取错误提示文案
 */
export function getFreeLimitMessage() {
  return '今日免费诊断次数已用完（3次/天），请明日再来或升级会员享受无限次诊断'
}
