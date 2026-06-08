import React, { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { apiUrl } from '../config/api'
import { showToast } from '../components/Toast'

const STATUS_STYLES = {
  new: 'bg-blue-50 text-blue-700',
  reviewing: 'bg-orange-50 text-[#FF6B00]',
  resolved: 'bg-green-50 text-green-700',
  ignored: 'bg-gray-100 text-gray-600',
}

const RATING_LABELS = {
  helpful: '有帮助',
  not_helpful: '没帮助',
  unclear: '看不懂',
  none: '未选择',
}

function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem('user') || 'null')
  } catch {
    return null
  }
}

export default function MyFeedbackPage() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const navigate = useNavigate()

  const loadMyFeedback = useCallback(async () => {
    const token = localStorage.getItem('token')
    const user = getStoredUser()

    if (!token || !user) {
      showToast('请先登录后查看反馈状态', 'warning')
      navigate('/auth')
      return
    }

    setLoading(true)
    try {
      const res = await axios.get(apiUrl('/api/feedback/my?pageSize=50'), {
        headers: { Authorization: `Bearer ${token}` },
      })
      setItems(res.data.items || [])
      setTotal(res.data.total || 0)
    } catch (error) {
      console.error('Load my feedback error:', error)
      if (error.response?.status === 401) {
        showToast('登录已过期，请重新登录', 'warning')
        navigate('/auth')
      } else {
        showToast(error.response?.data?.error || '加载我的反馈失败', 'error')
      }
    } finally {
      setLoading(false)
    }
  }, [navigate])

  useEffect(() => {
    loadMyFeedback()
  }, [loadMyFeedback])

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">我的反馈</h1>
            <p className="text-sm text-gray-500 mt-1">查看你提交过的反馈、处理状态和官方回复。</p>
          </div>
          <button
            onClick={() => navigate('/profile')}
            className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:border-gray-400"
          >
            返回个人中心
          </button>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6 flex items-center justify-between">
          <div className="text-sm text-gray-500">共 {total} 条反馈</div>
          <button
            onClick={loadMyFeedback}
            disabled={loading}
            className="px-4 py-2 bg-black text-white rounded-lg text-sm hover:bg-[#FF6B00] disabled:opacity-50"
          >
            {loading ? '刷新中...' : '刷新'}
          </button>
        </div>

        {loading ? (
          <div className="bg-white border border-gray-200 rounded-xl p-10 text-center text-gray-500">
            加载中...
          </div>
        ) : items.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-10 text-center">
            <div className="text-gray-900 font-medium mb-2">还没有提交过反馈</div>
            <p className="text-sm text-gray-500 mb-4">在诊断页面点击“这次诊断有帮助吗？”即可提交反馈。</p>
            <button
              onClick={() => navigate('/guide')}
              className="px-5 py-2 bg-[#FF6B00] text-white rounded-lg text-sm hover:bg-orange-600"
            >
              去体验诊断
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {items.map(item => (
              <div key={item.id} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className="px-2 py-1 bg-orange-50 text-[#FF6B00] rounded text-xs font-medium">{item.type}</span>
                      <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs">{RATING_LABELS[item.rating] || item.rating}</span>
                      <span className={`px-2 py-1 rounded text-xs font-medium ${STATUS_STYLES[item.status] || 'bg-gray-100 text-gray-600'}`}>
                        {item.publicStatus || item.status}
                      </span>
                    </div>
                    <div className="text-sm text-gray-500">提交时间：{item.createdAt ? new Date(item.createdAt).toLocaleString() : '-'}</div>
                    <div className="text-sm text-gray-500">来源页面：{item.page || '-'}</div>
                    {item.resolvedAt && (
                      <div className="text-sm text-gray-500">处理时间：{new Date(item.resolvedAt).toLocaleString()}</div>
                    )}
                  </div>
                </div>

                <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-800 whitespace-pre-wrap mb-4">
                  {item.content}
                </div>

                {item.publicReply ? (
                  <div className="bg-green-50 border border-green-100 rounded-lg p-4">
                    <div className="text-sm font-medium text-green-700 mb-1">官方回复</div>
                    <div className="text-sm text-gray-700 whitespace-pre-wrap">{item.publicReply}</div>
                  </div>
                ) : (
                  <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm text-blue-700">
                    已收到你的反馈。管理员处理后，这里会显示公开回复。
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
