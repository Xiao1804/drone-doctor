import axios from 'axios'
import { apiUrl } from '../config/api'
import { getAccessHeaders, getAccessToken } from './accessToken'

const MAX_FREE = 3
const STORAGE_KEY = 'dd_diagnosis_count'
const STORAGE_DATE_KEY = 'dd_diagnosis_date'

/**
 * 获取当前登录用户的 token
 */
/**
 * 从后端获取管理员或免注册体验通行证状态。
 */
export async function fetchFreeUsageState() {
  try {
    const res = await axios.get(apiUrl('/api/stats/free-usage'), {
      headers: getAccessHeaders(),
      timeout: 5000,
    })
    // 格式：{ allowed, isTrial, expiresAt, daysLeft, isAdmin }
    return {
      used: Number(res.data.used || 0),
      remaining: res.data.allowed ? Infinity : 0,
      limit: Number(res.data.limit || MAX_FREE),
      allowed: !!res.data.allowed,
      isAdmin: !!res.data.isAdmin,
      isTrial: !!res.data.isTrial,
      expiresAt: res.data.expiresAt || null,
      daysLeft: res.data.daysLeft || 0,
    }
  } catch (error) {
    if (!getAccessToken()) {
      return { used: 0, remaining: 0, limit: MAX_FREE, allowed: false, isAdmin: false, isTrial: false }
    }
    return { used: 0, remaining: 0, limit: MAX_FREE, allowed: false, isAdmin: false, isTrial: false }
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
    error?.response?.status === 403 ||
    error?.response?.data?.code === 'FREE_LIMIT_EXCEEDED' ||
    error?.response?.data?.error === 'TRIAL_ACCESS_REQUIRED'
}

/**
 * 获取错误提示文案
 */
export function getFreeLimitMessage() {
  return '请先输入兑换券激活免费体验'
}
