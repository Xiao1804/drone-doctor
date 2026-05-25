/**
 * API 配置
 * 开发环境：空字符串，走 Vite proxy
 * 生产环境：读取环境变量 VITE_API_BASE_URL
 */
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

export default API_BASE_URL;

/**
 * 带基础地址的 axios 请求辅助函数
 * 用法：axios.post(apiUrl('/user/login'), data)
 */
export function apiUrl(path) {
  // 确保 path 以 / 开头
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
}
