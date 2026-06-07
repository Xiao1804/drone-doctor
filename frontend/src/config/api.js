import axios from 'axios';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');

let interceptorInstalled = false;

function isApiRequest(url = '') {
  if (typeof url !== 'string') return false;
  if (url.startsWith('/api/')) return true;
  if (!API_BASE_URL) return false;
  return url.startsWith(`${API_BASE_URL}/api/`);
}

function installAuthInterceptor() {
  if (interceptorInstalled) return;
  interceptorInstalled = true;

  axios.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    const url = config.url || '';

    if (token && isApiRequest(url)) {
      config.headers = config.headers || {};
      if (!config.headers.Authorization) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }

    return config;
  });
}

installAuthInterceptor();

export default API_BASE_URL;

export function apiUrl(path) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
}
