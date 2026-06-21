import React, { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import axios from 'axios'
import { apiUrl } from '../config/api'
import { showToast } from './Toast'

const FEEDBACK_TYPES = [
  '诊断不准确',
  '看不懂步骤',
  '不会操作',
  '页面/功能出错',
  '想要新增功能',
  '其他',
]

const RATING_OPTIONS = [
  { value: 'helpful', label: '有帮助' },
  { value: 'not_helpful', label: '没帮助' },
  { value: 'unclear', label: '看不懂' },
  { value: 'none', label: '暂不选择' },
]

function getEmptyForm() {
  return {
    type: '诊断不准确',
    rating: 'none',
    content: '',
    contact: '',
    diagnosisId: '',
    treeId: '',
    nodeId: '',
    contextLabel: '',
  }
}

function getFeedbackTypeForRating(rating) {
  if (rating === 'unclear') return '看不懂步骤'
  if (rating === 'helpful') return '其他'
  return '诊断不准确'
}

function getPrefillContent(rating) {
  if (rating === 'helpful') return '这次诊断对我有帮助。'
  if (rating === 'unclear') return '我看不懂这一步/这个诊断结果，卡住的位置是：'
  return '这个诊断结果没有解决我的问题，实际情况是：'
}

export default function FeedbackWidget() {
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState(getEmptyForm())
  const location = useLocation()

  const isDiagnosisPage = location.pathname.startsWith('/guide') || location.pathname.startsWith('/image-diagnosis') || location.pathname.startsWith('/flight-log')
  const isCompliancePage = location.pathname === '/compliance'

  useEffect(() => {
    const handleOpenFeedback = (event) => {
      const detail = event.detail || {}
      setForm(prev => ({
        ...prev,
        type: detail.type || prev.type || '诊断不准确',
        rating: detail.rating || prev.rating || 'none',
        content: detail.content || '',
        contact: detail.contact || prev.contact || '',
        diagnosisId: detail.diagnosisId || '',
        treeId: detail.treeId || '',
        nodeId: detail.nodeId || '',
        contextLabel: detail.contextLabel || '',
      }))
      setOpen(true)
    }

    window.addEventListener('open-feedback', handleOpenFeedback)
    return () => window.removeEventListener('open-feedback', handleOpenFeedback)
  }, [])

  const openContextFeedback = (rating) => {
    setForm(prev => ({
      ...prev,
      type: getFeedbackTypeForRating(rating),
      rating,
      content: getPrefillContent(rating),
      contextLabel: isDiagnosisPage ? '当前诊断/排故页面' : '',
    }))
    setOpen(true)
  }

  const updateField = (key, value) => {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  const resetForm = () => {
    setForm(getEmptyForm())
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!form.content.trim()) {
      showToast('请填写反馈内容', 'warning')
      return
    }

    setSubmitting(true)
    try {
      const res = await axios.post(apiUrl('/api/feedback'), {
        type: form.type,
        rating: form.rating,
        content: form.content.trim(),
        contact: form.contact.trim(),
        page: window.location.pathname + window.location.search,
        diagnosisId: form.diagnosisId,
        treeId: form.treeId,
        nodeId: form.nodeId,
      })

      showToast(res.data?.message || '反馈已提交，感谢你的建议', 'success')
      resetForm()
      setOpen(false)
    } catch (error) {
      console.error('Feedback submit error:', error)
      showToast(error.response?.data?.error || '反馈提交失败，请稍后重试', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  if (isCompliancePage) {
    return null
  }

  return (
    <>
      {isDiagnosisPage && !open && (
        <div className="fixed right-6 bottom-20 z-50 w-[280px] bg-white border border-orange-100 shadow-xl rounded-2xl p-4 hidden sm:block">
          <div className="text-sm font-semibold text-gray-900 mb-1">这次诊断有帮助吗？</div>
          <div className="text-xs text-gray-500 mb-3">你的反馈会直接用于改进排故流程。</div>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => openContextFeedback('helpful')}
              className="py-2 text-xs rounded-lg bg-green-50 text-green-700 hover:bg-green-100"
            >
              有帮助
            </button>
            <button
              onClick={() => openContextFeedback('not_helpful')}
              className="py-2 text-xs rounded-lg bg-orange-50 text-[#FF6B00] hover:bg-orange-100"
            >
              没帮助
            </button>
            <button
              onClick={() => openContextFeedback('unclear')}
              className="py-2 text-xs rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200"
            >
              看不懂
            </button>
          </div>
        </div>
      )}

      <button
        onClick={() => {
          resetForm()
          setOpen(true)
        }}
        className="fixed right-6 bottom-6 z-50 px-4 py-3 bg-black text-white rounded-full shadow-lg hover:bg-[#FF6B00] transition-colors text-sm font-medium"
      >
        反馈
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">提交反馈</h3>
                <p className="text-sm text-gray-500 mt-1">告诉我们哪里不准、哪里看不懂，或你希望增加什么功能。</p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="text-gray-400 hover:text-gray-700 text-xl"
                aria-label="关闭反馈弹窗"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {form.contextLabel && (
                <div className="bg-orange-50 border border-orange-100 rounded-lg p-3 text-sm text-[#FF6B00]">
                  反馈对象：{form.contextLabel}
                </div>
              )}

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">反馈类型</label>
                  <select
                    value={form.type}
                    onChange={(e) => updateField('type', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#FF6B00]"
                  >
                    {FEEDBACK_TYPES.map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">这次体验</label>
                  <select
                    value={form.rating}
                    onChange={(e) => updateField('rating', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#FF6B00]"
                  >
                    {RATING_OPTIONS.map(option => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">反馈内容</label>
                <textarea
                  value={form.content}
                  onChange={(e) => updateField('content', e.target.value)}
                  rows={5}
                  maxLength={3000}
                  placeholder="例如：这一步我不会操作；系统建议查 GPS，但我的 APP 报的是电池通信异常。"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:border-[#FF6B00] resize-none"
                />
                <div className="text-xs text-gray-400 text-right mt-1">{form.content.length}/3000</div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">联系方式（选填）</label>
                <input
                  value={form.contact}
                  onChange={(e) => updateField('contact', e.target.value)}
                  maxLength={200}
                  placeholder="微信号 / 电话（选填，方便回访真实使用情况）"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:border-[#FF6B00]"
                />
              </div>

              <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-500 space-y-1">
                <div>当前页面：{window.location.pathname || '/'}</div>
                {(form.treeId || form.nodeId || form.diagnosisId) && (
                  <div>
                    关联：{form.treeId ? `tree=${form.treeId} ` : ''}{form.nodeId ? `node=${form.nodeId} ` : ''}{form.diagnosisId ? `diagnosis=${form.diagnosisId}` : ''}
                  </div>
                )}
              </div>

              <div className="flex gap-3 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:border-gray-400"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-[#FF6B00] text-white rounded-lg text-sm font-medium hover:bg-orange-600 disabled:opacity-50"
                >
                  {submitting ? '提交中...' : '提交反馈'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
