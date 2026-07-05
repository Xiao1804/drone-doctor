/**
 * Agent 匿名访问计数（内存版）
 *
 * 用途：agentGate 中间件给 /api/agent/chat、/api/agent/retrieve 的匿名访客
 * 提供 N 次免费额度，超出后要求兑换券通行证（TRIAL_ACCESS_REQUIRED）。
 *
 * 设计取舍：
 * - 单 backend 容器，进程内 Map 计数，无需 DB 表/迁移 → 部署风险最低。
 * - 重启清零（软门槛；全局限流 100/15min/IP 已兜底，可接受）。
 * - key 形如 `ip:<sha256(ip)>`，标识来自 freeUsageService.getIpIdentifier。
 * - MAX_ENTRIES 卫生上限：达到上限时清最早条目（Map 保持插入顺序），防长期膨胀。
 *
 * 若日后要"终身持久、重启不清零"，再加 agent_anon_usage 表 + 迁移。
 */

const LIMIT = 2; // 匿名访客每个 IP 免费次数
const MAX_ENTRIES = 10000;

const counts = new Map(); // key -> count

function keyOf(identifier) {
  return `${identifier.type}:${identifier.value}`;
}

function getCount(identifier) {
  return counts.get(keyOf(identifier)) || 0;
}

function incrementAndGet(identifier) {
  const key = keyOf(identifier);
  if (!counts.has(key) && counts.size >= MAX_ENTRIES) {
    const firstKey = counts.keys().next().value;
    if (firstKey) counts.delete(firstKey);
  }
  const next = (counts.get(key) || 0) + 1;
  counts.set(key, next);
  return next;
}

module.exports = {
  LIMIT,
  MAX_ENTRIES,
  getCount,
  incrementAndGet,
};
