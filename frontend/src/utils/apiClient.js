import axios from 'axios'
import { apiUrl } from '../config/api'

export function getAuthHeaders() {
  const token = localStorage.getItem('token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export const apiClient = {
  get(path, config = {}) {
    return axios.get(apiUrl(path), {
      ...config,
      headers: {
        ...getAuthHeaders(),
        ...(config.headers || {}),
      },
    })
  },

  post(path, data, config = {}) {
    return axios.post(apiUrl(path), data, {
      ...config,
      headers: {
        ...getAuthHeaders(),
        ...(config.headers || {}),
      },
    })
  },

  put(path, data, config = {}) {
    return axios.put(apiUrl(path), data, {
      ...config,
      headers: {
        ...getAuthHeaders(),
        ...(config.headers || {}),
      },
    })
  },

  delete(path, config = {}) {
    return axios.delete(apiUrl(path), {
      ...config,
      headers: {
        ...getAuthHeaders(),
        ...(config.headers || {}),
      },
    })
  },
}

// 券码相关 API
export const coupon = {
  activate(code) {
    return apiClient.post('/api/coupon/activate', { code })
  },

  getMembership() {
    return apiClient.get('/api/coupon/membership')
  },

  getDurations() {
    return apiClient.get('/api/coupon/durations')
  },

  generate(durationDays, durationLabel, count, note) {
    return apiClient.post('/api/coupon/generate', { durationDays, durationLabel, count, note })
  },

  list(filters = {}) {
    const params = new URLSearchParams()
    if (filters.status) params.append('status', filters.status)
    if (filters.durationDays) params.append('durationDays', filters.durationDays)
    if (filters.batchId) params.append('batchId', filters.batchId)
    if (filters.page) params.append('page', filters.page)
    if (filters.limit) params.append('limit', filters.limit)
    return apiClient.get(`/api/coupon/list?${params.toString()}`)
  },

  disable(id) {
    return apiClient.put(`/api/coupon/${id}/disable`)
  },
}
