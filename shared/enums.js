/**
 * DroneDoctor 前后端共享枚举定义
 * 本文件作为前后端枚举的单一事实来源，修改时需同步更新两端引用
 * @version 1.0
 */

// ========== 机型枚举 ==========
const DEVICE_TYPES = [
  { id: 'mavic', label: 'Mavic 系列', icon: '✈️', backendModel: 'mavic' },
  { id: 'air', label: 'Air 系列', icon: '🛫', backendModel: 'air' },
  { id: 'mini', label: 'Mini 系列', icon: '🛩️', backendModel: 'mini' },
  { id: 'phantom', label: 'Phantom 系列', icon: '🚁', backendModel: 'phantom' },
  { id: 't30', label: 'T30/T40（植保）', icon: '🌾', backendModel: 't30' },
  { id: 'other', label: '其他机型', icon: '📡', backendModel: null }
];

// ========== 故障类型枚举 ==========
const FAULT_TYPES = [
  { id: 'power', label: '无法起飞', icon: '🚫', backendId: 'flight' },
  { id: 'video', label: '图传异常', icon: '📺', backendId: 'video' },
  { id: 'gimbal', label: '云台故障', icon: '🔄', backendId: 'gimbal' },
  { id: 'battery', label: '电池问题', icon: '🔋', backendId: 'battery' },
  { id: 'gps', label: 'GPS 信号异常', icon: '📡', backendId: 'gps' },
  { id: 'other', label: '其他故障', icon: '❓', backendId: null }
];

// ========== 前端 → 后端映射表 ==========
const FAULT_TYPE_MAPPING = {
  power: 'flight',
  video: 'video',
  gimbal: 'gimbal',
  battery: 'battery',
  gps: 'gps',
  other: null
};

const DEVICE_TYPE_MAPPING = {
  mavic: 'mavic',
  air: 'air',
  mini: 'mini',
  phantom: 'phantom',
  t30: 't30',
  other: null
};

// ========== 反向映射：后端 → 前端 ==========
const BACKEND_TO_FRONTEND_FAULT = {
  'power-on': 'power',
  'link-test': 'other',
  gimbal: 'gimbal',
  battery: 'battery',
  video: 'video',
  gps: 'gps',
  flight: 'power',
  'damage-assessment': 'other',
  firmware: 'other'
};

// ========== 辅助函数 ==========

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

// CommonJS 导出（兼容 Node.js 后端）
if (typeof module !== 'undefined' && module.exports) {
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
    getDeviceTypeById
  };
}
