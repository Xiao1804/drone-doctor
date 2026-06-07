/**
 * DroneDoctor 前后端共享枚举定义
 * 数据来源：shared/enums.json（单一事实来源）
 * @version 2.0
 */

const path = require('path');
const enumsData = require(path.join(__dirname, '../../../shared/enums.json'));

const DEVICE_TYPES = enumsData.DEVICE_TYPES;
const FAULT_TYPES = enumsData.FAULT_TYPES;
const FAULT_TYPE_MAPPING = enumsData.FAULT_TYPE_MAPPING;
const DEVICE_TYPE_MAPPING = enumsData.DEVICE_TYPE_MAPPING;
const BACKEND_TO_FRONTEND_FAULT = enumsData.BACKEND_TO_FRONTEND_FAULT;

function mapFrontendFaultToBackend(frontendId) {
  return FAULT_TYPE_MAPPING[frontendId] || null;
}

function mapBackendFaultToFrontend(backendId) {
  return BACKEND_TO_FRONTEND_FAULT[backendId] || null;
}

function mapFrontendDeviceToBackend(frontendId) {
  return DEVICE_TYPE_MAPPING[frontendId] || null;
}

function getFaultTypeById(id) {
  return FAULT_TYPES.find(f => f.id === id) || null;
}

function getDeviceTypeById(id) {
  return DEVICE_TYPES.find(d => d.id === id) || null;
}

module.exports = {
  DEVICE_TYPES,
  FAULT_TYPES,
  FAULT_TYPE_MAPPING,
  DEVICE_TYPE_MAPPING,
  BACKEND_TO_FRONTEND_FAULT,
  mapFrontendFaultToBackend,
  mapBackendFaultToFrontend,
  mapFrontendDeviceToBackend,
  getFaultTypeById,
  getDeviceTypeById,
};
