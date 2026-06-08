import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { apiUrl } from '../config/api'
import { showToast } from '../components/Toast'

const STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  { value: 'new', label: '新反馈' },
  { value: 'reviewing', label: '处理中' },
  { value: 'resolved', label: '已处理' },
  { value: 'ignored', label: '不采纳' },
]

const STATUS_LABELS = {
  new: '新反馈',
  reviewing: '处理中',
  resolved: '已处理',
  ignored: '不采纳',
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

export default function AdminFeedbackPage() {
  const [items, setItems] = useState([])
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(false)
  const [savingId, setSavingId] = useState(null)
  const [total, setTotal] = useState(0)
  const [drafts, setDrafts] = useState({})
  const navigate = useNavigate()

  const user = getStoredUser()

  useEffect(() => {
    if (!user || user.role !== 'admin') {
      showToast('需要管理员权限', 'error')
      navigate('/')
    }
  }, [user, navigate])

  const loadFeedback = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (status) params.set('status', status)
      params.set('pageSize', '50')
      const res = await axios.get(apiUrl(`/api/feedback/admin?${params.toString()}`))
      setItems(res.data.items || [])
      setTotal(res.data.total || 0)
      const nextDrafts = {}
      ;(res.data.items || []).forEach(item => {
        nextDrafts[item.id] = {
          status: item.status,
          adminNote: item.adminNote || '',
          publicReply: item.publicReply || '',
        }
      })
      setDrafts(nextDrafts)
    } catch (error) {
      console.error('Load feedback error:', error)
      showToast(error.response?.data?.error || '反馈列表加载失败', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (user?.role === 'admin') {
      loadFeedback()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  const updateDraft = (id, key, value) => {
    setDrafts(prev => ({
      ...prev,
      [id]: {
        ...(prev[id] || {}),
        [key]: value,
      },
    }))
  }

  const saveFeedback = async (id) => {
    const draft = drafts[id]
    if (!draft) return

    setSavingId(id)
    try {
      const res = await axios.put(apiUrl(`/api/feedback/admin/${id}`), {
        status: draft.status,
        adminNote: draft.adminNote,
        publicReply: draft.publicReply,
      })
      setItems(prev => prev.map(item => item.id === id ? res.data.feedback : item))
      showToast('反馈处理状态已更新', 'success')
    } catch (error) {
      console.error('Save feedback error:', error)
      showToast(error.response?.data?.error || '保存失败', 'error')
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">用户反馈</h1>
            <p className="text-sm text-gray-500 mt-1">查看真实用户反馈，用于改进诊断流程和产品功能。</p>
          </div>
          <button
            onClick={() => navigate('/')}
            className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:border-gray-400"
          >
            返回首页
          </button>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[#FF6B00]"
            >
              {STATUS_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <button
              onClick={loadFeedback}
              disabled={loading}
              className="px-4 py-2 bg-black text-white rounded-lg text-sm hover:bg-[#FF6B00] disabled:opacity-50"
            >
              {loading ? '刷新中...' : '刷新'}
            </button>
          </div>
          <div className="text-sm text-gray-500">共 {total} 条</div>
        </div>

        <div className="space-y-4">
          {items.length === 0 && !loading && (
            <div className="bg-white border border-gray-200 rounded-xl p-10 text-center text-gray-500">
              暂无反馈
            </div>
          )}

          {items.map(item => {
            const draft = drafts[item.id] || { status: item.status, adminNote: item.adminNote || '', publicReply: item.publicReply || '' }
            return (
              <div key={item.id} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className="px-2 py-1 bg-orange-50 text-[#FF6B00] rounded text-xs font-medium">{item.type}</span>
                      <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs">{RATING_LABELS[item.rating] || item.rating}</span>
                      <span className="px-2 py-1 bg-blue-50 text-blue-600 rounded text-xs">{STATUS_LABELS[item.status] || item.status}</span>
                      <span className="px-2 py-1 bg-green-50 text-green-700 rounded text-xs">用户看到：{item.publicStatus || STATUS_LABELS[item.status] || item.status}</span>
                    </div>
                    <div className="text-sm text-gray-500">
                      用户：{item.username || '匿名'} {item.userId ? `(${item.userId})` : ''}
                    </div>
                    <div className="text-sm text-gray-500">页面：{item.page || '-'}</div>
                    <div className="text-sm text-gray-500">时间：{item.createdAt ? new Date(item.createdAt).toLocaleString() : '-'}</div>
                  </div>
                  <div className="text-sm text-gray-500">
                    联系方式：{item.contact || '未留'}
                  </div>
                </div>

                <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-800 whitespace-pre-wrap mb-4">
                  {item.content}
                </div>

                {(item.treeId || item.nodeId || item.diagnosisId) && (
                  <div className="text-xs text-gray-500 mb-4">
                    关联：{item.treeId ? `tree=${item.treeId} ` : ''}{item.nodeId ? `node=${item.nodeId} ` : ''}{item.diagnosisId ? `diagnosis=${item.diagnosisId}` : ''}
                  </div>
                )}

                <div className="grid md:grid-cols-[180px_1fr_auto] gap-3 items-start mb-3">
                  <select
                    value={draft.status}
                    onChange={(e) => updateDraft(item.id, 'status', e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[#FF6B00]"
                  >
                    {STATUS_OPTIONS.filter(option => option.value).map(option => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                  <textarea
                    value={draft.publicReply}
                    onChange={(e) => updateDraft(item.id, 'publicReply', e.target.value)}
                    rows={2}
                    placeholder="用户可见回复，例如：我们已收到，会补充电池通信异常分支。"
                    className="px-3 py-2 border border-orange-200 rounded-lg text-sm focus:outline-none focus:border-[#FF6B00] resize-none"
                  />
                  <button
                    onClick={() => saveFeedback(item.id)}
                    disabled={savingId === item.id}
                    className="px-4 py-2 bg-[#FF6B00] text-white rounded-lg text-sm hover:bg-orange-600 disabled:opacity-50"
                  >
                    {savingId === item.id ? '保存中...' : '保存'}
                  </button>
                </div>

                <textarea
                  value={draft.adminNote}
                  onChange={(e) => updateDraft(item.id, 'adminNote', e.target.value)}
                  rows={2}
                  placeholder="内部备注，仅管理员可见。例如：后续补充电池通信异常分支。"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[#FF6B00] resize-none"
                />
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
