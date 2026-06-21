import axios from 'axios'

const TRIAL_TOKEN_KEY = 'dd_trial_access_token'
const TRIAL_EXPIRES_KEY = 'dd_trial_expires_at'
const TRIAL_LABEL_KEY = 'dd_trial_duration_label'

function getStoredAdmin() {
  try {
    return JSON.parse(localStorage.getItem('user') || 'null')
  } catch {
    return null
  }
}

export function getAdminToken() {
  const user = getStoredAdmin()
  return user?.role === 'admin' ? localStorage.getItem('token') : null
}

export function clearTrialAccess() {
  localStorage.removeItem(TRIAL_TOKEN_KEY)
  localStorage.removeItem(TRIAL_EXPIRES_KEY)
  localStorage.removeItem(TRIAL_LABEL_KEY)
}

export function getTrialAccess() {
  const token = localStorage.getItem(TRIAL_TOKEN_KEY)
  const expiresAt = localStorage.getItem(TRIAL_EXPIRES_KEY)
  const durationLabel = localStorage.getItem(TRIAL_LABEL_KEY)

  if (!token || !expiresAt || new Date(expiresAt) <= new Date()) {
    clearTrialAccess()
    return null
  }

  return { token, expiresAt, durationLabel }
}

export function storeTrialAccess({ accessToken, expiresAt, durationLabel }) {
  if (!accessToken || !expiresAt) {
    throw new Error('兑换结果缺少体验通行证')
  }

  localStorage.setItem(TRIAL_TOKEN_KEY, accessToken)
  localStorage.setItem(TRIAL_EXPIRES_KEY, expiresAt)
  localStorage.setItem(TRIAL_LABEL_KEY, durationLabel || '免费体验')
}

export function getAccessToken() {
  return getAdminToken() || getTrialAccess()?.token || null
}

export function getAccessHeaders() {
  const token = getAccessToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

let interceptorInstalled = false

export function installAxiosAccessInterceptor() {
  if (interceptorInstalled) return
  interceptorInstalled = true

  axios.interceptors.request.use(config => {
    const token = getAccessToken()
    if (token && !config.headers?.Authorization) {
      config.headers = config.headers || {}
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  })
}
