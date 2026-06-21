import React, { useCallback, useEffect, useState } from 'react'
import { apiClient } from '../utils/apiClient'

let globalRefreshFn = null

export function refreshFreeUsage() {
  globalRefreshFn?.()
}

export function incrementDiagnosisCount() {
  refreshFreeUsage()
}

export default function DiagnosisCounter({ showUpgradeHint = false, showTrialEntry = false }) {
  const [access, setAccess] = useState({
    allowed: false,
    isTrial: false,
    isAdmin: false,
    expiresAt: null,
    daysLeft: 0,
  })
  const [loading, setLoading] = useState(false)

  const syncFromBackend = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiClient.get('/api/stats/free-usage')
      setAccess({
        allowed: !!res.data.allowed,
        isTrial: !!res.data.isTrial,
        isAdmin: !!res.data.isAdmin,
        expiresAt: res.data.expiresAt || null,
        daysLeft: res.data.daysLeft || 0,
      })
    } catch {
      setAccess({
        allowed: false,
        isTrial: false,
        isAdmin: false,
        expiresAt: null,
        daysLeft: 0,
      })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    syncFromBackend()
    globalRefreshFn = syncFromBackend
    return () => {
      if (globalRefreshFn === syncFromBackend) globalRefreshFn = null
    }
  }, [syncFromBackend])

  const scrollToTrial = () => {
    document.getElementById('trial')?.scrollIntoView({ behavior: 'smooth' })
  }

  if (access.isAdmin) {
    return (
      <div className="fixed top-20 right-6 z-40 rounded-full border border-green-100 bg-white/95 px-4 py-2 shadow-sm">
        <span className="text-sm font-medium text-green-600">管理员模式</span>
      </div>
    )
  }

  if (access.allowed) {
    return (
      <>
        <div className="fixed top-20 right-6 z-40 rounded-full border border-green-100 bg-white/95 px-4 py-2 shadow-sm">
          <span className="text-sm font-medium text-green-600">
            免费体验有效 · 剩余 {access.daysLeft} 天
          </span>
          {loading && <span className="ml-2 text-xs text-gray-400">同步中</span>}
        </div>
        {showUpgradeHint && (
          <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-4">
            <p className="text-sm text-green-700">
              体验已激活，可直接使用。到期时间：
              {access.expiresAt ? new Date(access.expiresAt).toLocaleString('zh-CN') : '-'}
            </p>
          </div>
        )}
      </>
    )
  }

  if (!showTrialEntry) return null

  return (
    <>
      <div className="fixed top-20 right-6 z-40 rounded-full border border-orange-100 bg-white/95 px-4 py-2 shadow-sm">
        <button
          onClick={scrollToTrial}
          className="text-sm font-medium text-[#FF6B00]"
        >
          输入兑换券，免费体验
        </button>
      </div>
      {showUpgradeHint && (
        <div className="mt-4 rounded-xl border border-orange-200 bg-orange-50 p-4">
          <p className="text-sm text-gray-700">加微信免费领取兑换券，无需注册账号。</p>
        </div>
      )}
    </>
  )
}
