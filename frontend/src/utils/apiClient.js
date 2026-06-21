import axios from 'axios'
import { apiUrl } from '../config/api'
import { getAccessHeaders } from './accessToken'

export function getAuthHeaders() {
  return getAccessHeaders()
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

  getAccessStatus() {
    return apiClient.get('/api/coupon/access')
  },

  getDurations() {
    return apiClient.get('/api/coupon/durations')
  },

  generate(count, note) {
    return apiClient.post('/api/coupon/generate', { count, note })
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
