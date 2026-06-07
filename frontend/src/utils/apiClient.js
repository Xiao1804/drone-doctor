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
