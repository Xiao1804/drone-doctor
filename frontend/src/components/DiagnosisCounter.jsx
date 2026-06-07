/**
 * 全局诊断次数指示器
 * 右上角固定定位，全流程可见
 * 状态：普通用户显示剩余免费次数；管理员显示无限次
 */

import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { trackPaywallSeen } from '../utils/tracking'
import { fetchFreeUsageState, syncLocalCount } from '../utils/freeUsage'

const MAX_FREE = 3
const STORAGE_KEY = 'dd_diagnosis_count'
const STORAGE_DATE_KEY = 'dd_diagnosis_date'

// 全局刷新回调（供外部诊断成功后调用）
let globalRefreshFn = null

/**
 * 从 localStorage 快速读取（同步，用于非关键路径）
 */
function getTodayUsedCountFromLocal() {
  const today = new Date().toISOString().slice(0, 10)
  const savedDate = localStorage.getItem(STORAGE_DATE_KEY)
  if (savedDate !== today) {
    localStorage.setItem(STORAGE_DATE_KEY, today)
    localStorage.setItem(STORAGE_KEY, '0')
    return 0
  }
  return parseInt(localStorage.getItem(STORAGE_KEY) || '0', 10)
}

/**
 * 增加 localStorage 计数（向后兼容）
 */
export function incrementDiagnosisCount() {
  const today = new Date().toISOString().slice(0, 10)
  const savedDate = localStorage.getItem(STORAGE_DATE_KEY)
  if (savedDate !== today) {
    localStorage.setItem(STORAGE_DATE_KEY, today)
    localStorage.setItem(STORAGE_KEY, '1')
    return 1
  }
  const current = parseInt(localStorage.getItem(STORAGE_KEY) || '0', 10)
  const next = current + 1
  localStorage.setItem(STORAGE_KEY, String(next))
  return next
}

/**
 * 从 localStorage 获取剩余次数（向后兼容，HomePage 快速预检用）
 */
export function getRemainingCount() {
  return Math.max(0, MAX_FREE - getTodayUsedCountFromLocal())
}

/**
 * 外部调用：刷新次数显示（诊断成功后应调用）
 */
export function refreshFreeUsage() {
  if (globalRefreshFn) {
    globalRefreshFn()
  }
}

export default function DiagnosisCounter({ showUpgradeHint = false }) {
  const [used, setUsed] = useState(getTodayUsedCountFromLocal())
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const syncFromBackend = useCallback(async () => {
    setLoading(true)
    try {
      const state = await fetchFreeUsageState()
      setIsAdmin(!!state.isAdmin)
      setUsed(state.isAdmin ? 0 : state.used)
      // 同步 localStorage，保持前后端一致。管理员只保留 0，避免旧匿名次数污染展示。
      syncLocalCount(state.isAdmin ? 0 : state.used)
    } catch (e) {
      // fallback 到 localStorage
      setIsAdmin(false)
      setUsed(getTodayUsedCountFromLocal())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // 组件挂载时从后端拉取真实数据
    syncFromBackend()
    // 注册全局刷新函数
    globalRefreshFn = syncFromBackend
    return () => {
      if (globalRefreshFn === syncFromBackend) {
        globalRefreshFn = null
      }
    }
  }, [syncFromBackend])

  const remaining = isAdmin ? Infinity : Math.max(0, MAX_FREE - used)
  const isLow = !isAdmin && remaining === 1
  const isExhausted = !isAdmin && remaining === 0

  // 颜色状态
  const colorClass = isAdmin
    ? 'text-green-500'
    : isExhausted
    ? 'text-gray-400'
    : isLow
    ? 'text-orange-500'
    : 'text-blue-500'

  const dotColor = isAdmin
    ? 'bg-green-500'
    : isExhausted
    ? 'bg-gray-300'
    : isLow
    ? 'bg-orange-500'
    : 'bg-blue-500'

  const dotEmptyColor = 'bg-gray-200'

  return (
    <>
      {/* 右上角指示器 */}
      <div className="fixed top-20 right-6 z-40">
        <div className="bg-white/95 backdrop-blur-sm rounded-full px-4 py-2 shadow-sm border border-gray-100 flex items-center gap-3">
          {/* 圆点 */}
          <div className="flex gap-1">
            {Array.from({ length: MAX_FREE }).map((_, i) => (
              <div
                key={i}
                className={`w-2 h-2 rounded-full transition-colors duration-300 ${
                  isAdmin || i < remaining ? dotColor : dotEmptyColor
                }`}
              />
            ))}
          </div>
          {/* 文案 */}
          <span className={`text-sm font-medium ${colorClass} transition-colors duration-300`}>
            {isAdmin
              ? '管理员·无限次'
              : isExhausted
              ? '今日已用完'
              : `今日剩余 ${remaining} 次`}
          </span>
          {/* 刷新按钮（仅在 loading 时显示小 spinner） */}
          {loading && (
            <span className="w-3 h-3 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
          )}
        </div>
      </div>

      {/* 剩余1次时的提示条（非弹窗，内嵌页面底部） */}
      {isLow && showUpgradeHint && (
        <div className="bg-gradient-to-r from-orange-50 to-yellow-50 border border-orange-200 rounded-xl p-4 mt-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="text-sm font-medium text-gray-900">
                这是你今天最后一次免费诊断
              </p>
              <p className="text-xs text-gray-500 mt-1">
                升级会员，无限次诊断 + 完整知识库，仅需 39元/月（每天1.3元）
              </p>
            </div>
            <button
              onClick={() => {
                trackPaywallSeen({ remainingFree: 0 })
                navigate('/#pricing')
                setTimeout(() => {
                  document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' })
                }, 100)
              }}
              className="px-4 py-2 bg-[#FF6B00] text-white text-sm rounded-lg hover:bg-[#FF8533] transition-colors whitespace-nowrap"
            >
              查看会员权益
            </button>
          </div>
        </div>
      )}

      {/* 用完时的升级提示 */}
      {isExhausted && showUpgradeHint && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mt-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="text-sm font-medium text-gray-900">
                今日免费诊断已用完
              </p>
              <p className="text-xs text-gray-500 mt-1">
                升级会员享无限次诊断 + 完整知识库
              </p>
            </div>
            <button
              onClick={() => {
                trackPaywallSeen({ remainingFree: 0 })
                navigate('/#pricing')
                setTimeout(() => {
                  document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' })
                }, 100)
              }}
              className="px-4 py-2 bg-black text-white text-sm rounded-lg hover:bg-[#FF6B00] transition-colors whitespace-nowrap"
            >
              立即升级
            </button>
          </div>
        </div>
      )}
    </>
  )
}
