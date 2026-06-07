/**
 * DroneDoctor 前后端共享枚举定义
 * 数据来源：shared/enums.json（单一事实来源）
 * @version 2.0
 */

import enumsData from '../../../shared/enums.json';

export const DEVICE_TYPES = enumsData.DEVICE_TYPES;
export const FAULT_TYPES = enumsData.FAULT_TYPES;
export const FAULT_TYPE_MAPPING = enumsData.FAULT_TYPE_MAPPING;
export const DEVICE_TYPE_MAPPING = enumsData.DEVICE_TYPE_MAPPING;
export const BACKEND_TO_FRONTEND_FAULT = enumsData.BACKEND_TO_FRONTEND_FAULT;

export function mapFrontendFaultToBackend(frontendId) {
  return FAULT_TYPE_MAPPING[frontendId] || null;
}

export function mapBackendFaultToFrontend(backendId) {
  return BACKEND_TO_FRONTEND_FAULT[backendId] || null;
}

export function mapFrontendDeviceToBackend(frontendId) {
  return DEVICE_TYPE_MAPPING[frontendId] || null;
}

export function getFaultTypeById(id) {
  return FAULT_TYPES.find(f => f.id === id) || null;
}

export function getDeviceTypeById(id) {
  return DEVICE_TYPES.find(d => d.id === id) || null;
}
