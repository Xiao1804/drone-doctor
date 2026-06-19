import React, { useState } from 'react'
import { apiClient } from '../utils/apiClient'

function CouponModal({ onClose, onActivated }) {
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(null)
  const [error, setError] = useState('')

  // 自动格式化：输入时加上 - 分隔
  const handleCodeChange = (e) => {
    let value = e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '')
    // 去掉已有的 -
    value = value.replace(/-/g, '')
    // 限制8位
    value = value.slice(0, 8)
    // 格式化 XXXX-XXXX
    if (value.length > 4) {
      value = value.slice(0, 4) + '-' + value.slice(4)
    }
    setCode(value)
    setError('')
    setSuccess(null)
  }

  const handleActivate = async () => {
    const cleanCode = code.replace('-', '').trim()
    if (cleanCode.length !== 8) {
      setError('请输入8位券码')
      return
    }

    setLoading(true)
    setError('')
    setSuccess(null)

    try {
      const res = await apiClient.post('/api/coupon/activate', { code: cleanCode })
      setSuccess({
        expiresAt: res.data.expiresAt,
        durationLabel: res.data.durationLabel,
      })
      // 通知父组件刷新
      if (onActivated) {
        onActivated(res.data)
      }
    } catch (err) {
      setError(err.response?.data?.error || '激活失败，请检查券码')
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !loading) {
      handleActivate()
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#FF6B00] to-[#FF8533] p-6 text-center">
          <div className="text-4xl mb-2">🎫</div>
          <h3 className="text-xl font-bold text-white">激活3天体验</h3>
          <p className="text-white/80 text-sm mt-1">输入体验券码，免费使用3天</p>
        </div>

        <div className="p-6">
          {success ? (
            /* 激活成功 */
            <div className="text-center py-4">
              <div className="text-5xl mb-4">✅</div>
              <h4 className="text-lg font-bold text-gray-900 mb-2">激活成功！</h4>
              <p className="text-gray-600 mb-1">
                体验时长：<span className="font-medium text-[#FF6B00]">{success.durationLabel}</span>
              </p>
              <p className="text-gray-600 mb-6">
                到期时间：<span className="font-medium">
                  {new Date(success.expiresAt).toLocaleString('zh-CN')}
                </span>
              </p>
              <button
                onClick={onClose}
                className="w-full py-3 bg-[#FF6B00] text-white rounded-xl font-medium hover:bg-[#FF8533] transition-colors"
              >
                开始使用
              </button>
            </div>
          ) : (
            /* 输入券码 */
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                券码
              </label>
              <input
                type="text"
                value={code}
                onChange={handleCodeChange}
                onKeyDown={handleKeyDown}
                placeholder="XXXX-XXXX"
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#FF6B00] transition-colors text-center text-xl tracking-widest font-mono"
                autoFocus
                maxLength={9}
              />

              {error && (
                <p className="text-sm text-red-500 mt-2">{error}</p>
              )}

              <button
                onClick={handleActivate}
                disabled={loading || code.replace('-', '').length !== 8}
                className="w-full py-3 bg-[#FF6B00] text-white rounded-xl font-medium hover:bg-[#FF8533] transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-4"
              >
                {loading ? '激活中...' : '激活'}
              </button>

              {/* 分隔线 */}
              <div className="flex items-center gap-3 my-6">
                <div className="flex-1 h-px bg-gray-200" />
                <span className="text-xs text-gray-400">没有券码？</span>
                <div className="flex-1 h-px bg-gray-200" />
              </div>

              {/* 微信二维码引导 */}
              <div className="text-center">
                <div className="inline-block bg-gray-50 rounded-xl p-4">
                  <img
                    src="/wechat-qr.jpg"
                    alt="微信二维码"
                    className="w-32 h-32 mx-auto mb-2 rounded-lg"
                    onError={(e) => {
                      e.target.style.display = 'none'
                      e.target.nextSibling.style.display = 'block'
                    }}
                  />
                  <div className="hidden w-32 h-32 mx-auto mb-2 bg-gray-100 rounded-lg flex items-center justify-center text-gray-400 text-xs">
                    二维码占位
                  </div>
                  <p className="text-sm text-gray-600 font-medium">扫码加微信，免费体验3天</p>
                  <p className="text-xs text-gray-400 mt-1">添加后领取体验账号和券码</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Close button */}
        {!success && (
          <div className="px-6 pb-4">
            <button
              onClick={onClose}
              className="w-full py-2 text-gray-500 text-sm hover:text-gray-700 transition-colors"
            >
              关闭
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default CouponModal
