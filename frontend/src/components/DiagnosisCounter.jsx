import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiClient } from '../utils/apiClient'
import CouponModal from './CouponModal'

// 全局刷新回调
let globalRefreshFn = null

/**
 * 外部调用：刷新会员状态
 */
export function refreshFreeUsage() {
  if (globalRefreshFn) {
    globalRefreshFn()
  }
}

/**
 * 向后兼容旧调用
 */
export function incrementDiagnosisCount() {
  refreshFreeUsage()
}

export default function DiagnosisCounter({ showUpgradeHint = false }) {
  const [membership, setMembership] = useState({
    isMember: false,
    expiresAt: null,
    daysLeft: 0,
    isAdmin: false,
  })
  const [loading, setLoading] = useState(false)
  const [showCouponModal, setShowCouponModal] = useState(false)
  const navigate = useNavigate()

  const syncFromBackend = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiClient.get('/api/stats/free-usage')
      setMembership({
        isMember: !!res.data.isMember,
        expiresAt: res.data.expiresAt,
        daysLeft: res.data.daysLeft || 0,
        isAdmin: !!res.data.isAdmin,
      })
    } catch (e) {
      // 未登录或接口不可用
      setMembership({
        isMember: false,
        expiresAt: null,
        daysLeft: 0,
        isAdmin: false,
      })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    syncFromBackend()
    globalRefreshFn = syncFromBackend
    return () => {
      if (globalRefreshFn === syncFromBackend) {
        globalRefreshFn = null
      }
    }
  }, [syncFromBackend])

  const handleActivated = () => {
    syncFromBackend()
    setShowCouponModal(false)
  }

  // 管理员
  if (membership.isAdmin) {
    return (
      <>
        <div className="fixed top-20 right-6 z-40">
          <div className="bg-white/95 backdrop-blur-sm rounded-full px-4 py-2 shadow-sm border border-gray-100 flex items-center gap-2">
            <div className="w-2 h-2 bg-green-500 rounded-full" />
            <span className="text-sm font-medium text-green-600">管理员</span>
            {loading && (
              <span className="w-3 h-3 border-2 border-gray-300 border-t-green-500 rounded-full animate-spin" />
            )}
          </div>
        </div>
      </>
    )
  }

  // 有会员
  if (membership.isMember) {
    return (
      <>
        <div className="fixed top-20 right-6 z-40">
          <div className="bg-white/95 backdrop-blur-sm rounded-full px-4 py-2 shadow-sm border border-gray-100 flex items-center gap-2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span className="text-sm font-medium text-green-600">
              会员到期：{membership.daysLeft}天后
            </span>
            {loading && (
              <span className="w-3 h-3 border-2 border-gray-300 border-t-green-500 rounded-full animate-spin" />
            )}
          </div>
        </div>
        {showUpgradeHint && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 mt-4">
            <p className="text-sm text-green-700">
              会员有效中，到期时间：{membership.expiresAt ? new Date(membership.expiresAt).toLocaleString('zh-CN') : '-'}
            </p>
          </div>
        )}
      </>
    )
  }

  // 已登录但无会员
  const token = localStorage.getItem('token')
  if (token) {
    return (
      <>
        <div className="fixed top-20 right-6 z-40">
          <div className="bg-white/95 backdrop-blur-sm rounded-full px-4 py-2 shadow-sm border border-gray-100 flex items-center gap-2">
            <div className="w-2 h-2 bg-orange-500 rounded-full" />
            <button
              onClick={() => setShowCouponModal(true)}
              className="text-sm font-medium text-orange-500 hover:text-[#FF6B00] transition-colors"
            >
              激活券码
            </button>
            {loading && (
              <span className="w-3 h-3 border-2 border-gray-300 border-t-orange-500 rounded-full animate-spin" />
            )}
          </div>
        </div>
        {showUpgradeHint && (
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 mt-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <p className="text-sm font-medium text-gray-900">需要激活券码才能使用诊断功能</p>
                <p className="text-xs text-gray-500 mt-1">扫码加微信获取券码，激活后即可使用</p>
              </div>
              <button
                onClick={() => setShowCouponModal(true)}
                className="px-4 py-2 bg-[#FF6B00] text-white text-sm rounded-lg hover:bg-[#FF8533] transition-colors whitespace-nowrap"
              >
                激活券码
              </button>
            </div>
          </div>
        )}
        {showCouponModal && (
          <CouponModal onClose={() => setShowCouponModal(false)} onActivated={handleActivated} />
        )}
      </>
    )
  }

  // 未登录
  return (
    <div className="fixed top-20 right-6 z-40">
      <div className="bg-white/95 backdrop-blur-sm rounded-full px-4 py-2 shadow-sm border border-gray-100 flex items-center gap-2">
        <div className="w-2 h-2 bg-gray-400 rounded-full" />
        <button
          onClick={() => navigate('/auth')}
          className="text-sm font-medium text-gray-600 hover:text-[#FF6B00] transition-colors"
        >
          登录
        </button>
      </div>
    </div>
  )
}
