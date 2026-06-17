import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiClient } from '../utils/apiClient'
import { showToast } from '../components/Toast'

function AdminCouponPage() {
  const [loading, setLoading] = useState(false)
  const [durations, setDurations] = useState([])
  const [generateForm, setGenerateForm] = useState({
    durationDays: 7,
    durationLabel: '7天',
    count: 10,
    note: '',
  })
  const [generatedCodes, setGeneratedCodes] = useState([])
  const [copied, setCopied] = useState(false)
  const [couponList, setCouponList] = useState([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState({ status: '', durationDays: '', batchId: '' })
  const navigate = useNavigate()

  useEffect(() => {
    // 验证管理员权限
    const user = JSON.parse(localStorage.getItem('user') || '{}')
    if (user.role !== 'admin') {
      navigate('/')
      return
    }

    // 获取可选时长
    apiClient.get('/api/coupon/durations').then(res => {
      setDurations(res.data.durations)
    }).catch(() => {})

    fetchCoupons()
  }, [navigate, page])

  const fetchCoupons = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (filters.status) params.append('status', filters.status)
      if (filters.durationDays) params.append('durationDays', filters.durationDays)
      if (filters.batchId) params.append('batchId', filters.batchId)
      params.append('page', page)
      params.append('limit', '20')

      const res = await apiClient.get(`/api/coupon/list?${params.toString()}`)
      setCouponList(res.data.list || [])
      setTotalCount(res.data.total || 0)
    } catch (err) {
      console.error('Fetch coupons error:', err)
      showToast('获取券码列表失败', 'error')
    }
  }, [filters, page])

  useEffect(() => {
    fetchCoupons()
  }, [fetchCoupons])

  const handleGenerate = async () => {
    setLoading(true)
    try {
      const res = await apiClient.post('/api/coupon/generate', {
        durationDays: generateForm.durationDays,
        durationLabel: generateForm.durationLabel,
        count: generateForm.count,
        note: generateForm.note,
      })
      setGeneratedCodes(res.data.codes)
      showToast(`成功生成 ${res.data.count} 个券码`, 'success')
      // 刷新列表
      fetchCoupons()
    } catch (err) {
      showToast(err.response?.data?.error || '生成券码失败', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleCopyAll = () => {
    const text = generatedCodes.join('\n')
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      showToast('已复制到剪贴板', 'success')
    })
  }

  const handleDisable = async (couponId) => {
    if (!window.confirm('确定要禁用此券码吗？')) return
    try {
      await apiClient.put(`/api/coupon/${couponId}/disable`)
      showToast('券码已禁用', 'success')
      fetchCoupons()
    } catch (err) {
      showToast(err.response?.data?.error || '禁用失败', 'error')
    }
  }

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }))
    setPage(1)
  }

  const statusColors = {
    unused: 'bg-green-100 text-green-700',
    used: 'bg-gray-100 text-gray-500',
    disabled: 'bg-red-100 text-red-700',
  }

  const statusLabels = {
    unused: '未使用',
    used: '已使用',
    disabled: '已禁用',
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <div className="bg-[#FF6B00] text-white px-4 py-6">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between mb-2">
            <button onClick={() => navigate('/profile')} className="text-white hover:opacity-80">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-xl font-bold">券码管理</h1>
            <div className="w-6"></div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* 生成券码 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200">
            <h3 className="font-bold text-gray-900">生成券码</h3>
          </div>
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">时长</label>
                <select
                  value={generateForm.durationDays}
                  onChange={(e) => {
                    const opt = durations.find(d => d.days === parseInt(e.target.value, 10))
                    setGenerateForm({
                      ...generateForm,
                      durationDays: parseInt(e.target.value, 10),
                      durationLabel: opt?.label || '',
                    })
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#FF6B00]"
                >
                  {durations.map(d => (
                    <option key={d.days} value={d.days}>{d.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">数量</label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={generateForm.count}
                  onChange={(e) => setGenerateForm({ ...generateForm, count: parseInt(e.target.value, 10) || 1 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#FF6B00]"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">备注（选填）</label>
                <input
                  type="text"
                  value={generateForm.note}
                  onChange={(e) => setGenerateForm({ ...generateForm, note: e.target.value })}
                  placeholder="如：首批推广券"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#FF6B00]"
                />
              </div>
            </div>
            <button
              onClick={handleGenerate}
              disabled={loading}
              className="w-full py-3 bg-[#FF6B00] text-white rounded-lg font-medium hover:bg-[#FF8533] transition-colors disabled:opacity-50"
            >
              {loading ? '生成中...' : '生成券码'}
            </button>
          </div>

          {/* 生成结果 */}
          {generatedCodes.length > 0 && (
            <div className="border-t border-gray-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-medium text-gray-900">生成结果（{generatedCodes.length}个）</h4>
                <button
                  onClick={handleCopyAll}
                  className="px-3 py-1 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-700 transition-colors"
                >
                  {copied ? '已复制 ✓' : '一键复制'}
                </button>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 max-h-48 overflow-y-auto">
                {generatedCodes.map((code, i) => (
                  <div key={i} className="font-mono text-sm text-gray-700 py-0.5">
                    {code}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 券码列表 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200">
            <h3 className="font-bold text-gray-900">券码列表（共{totalCount}条）</h3>
          </div>

          {/* 筛选 */}
          <div className="px-4 py-3 flex flex-wrap gap-3 border-b border-gray-100">
            <select
              value={filters.status}
              onChange={(e) => handleFilterChange('status', e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
            >
              <option value="">全部状态</option>
              <option value="unused">未使用</option>
              <option value="used">已使用</option>
              <option value="disabled">已禁用</option>
            </select>
            <select
              value={filters.durationDays}
              onChange={(e) => handleFilterChange('durationDays', e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
            >
              <option value="">全部时长</option>
              {durations.map(d => (
                <option key={d.days} value={d.days}>{d.label}</option>
              ))}
            </select>
            <input
              type="text"
              value={filters.batchId}
              onChange={(e) => handleFilterChange('batchId', e.target.value)}
              placeholder="批次ID筛选"
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
            />
          </div>

          {/* 表格 */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">券码</th>
                  <th className="px-3 py-2 text-left font-medium">时长</th>
                  <th className="px-3 py-2 text-left font-medium">状态</th>
                  <th className="px-3 py-2 text-left font-medium">创建时间</th>
                  <th className="px-3 py-2 text-left font-medium">激活人</th>
                  <th className="px-3 py-2 text-left font-medium">激活时间</th>
                  <th className="px-3 py-2 text-left font-medium">备注</th>
                  <th className="px-3 py-2 text-left font-medium">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {couponList.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-gray-400">
                      暂无券码记录
                    </td>
                  </tr>
                ) : (
                  couponList.map(coupon => (
                    <tr key={coupon.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-mono text-gray-900">{coupon.code}</td>
                      <td className="px-3 py-2 text-gray-600">{coupon.duration_label}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs ${statusColors[coupon.status] || 'bg-gray-100'}`}>
                          {statusLabels[coupon.status] || coupon.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-gray-500">
                        {coupon.created_at ? new Date(coupon.created_at).toLocaleString('zh-CN') : '-'}
                      </td>
                      <td className="px-3 py-2 text-gray-600">
                        {coupon.activated_by_username || '-'}
                      </td>
                      <td className="px-3 py-2 text-gray-500">
                        {coupon.activated_at ? new Date(coupon.activated_at).toLocaleString('zh-CN') : '-'}
                      </td>
                      <td className="px-3 py-2 text-gray-500 max-w-32 truncate">
                        {coupon.note || '-'}
                      </td>
                      <td className="px-3 py-2">
                        {coupon.status === 'unused' && (
                          <button
                            onClick={() => handleDisable(coupon.id)}
                            className="text-xs text-red-500 hover:text-red-700"
                          >
                            禁用
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* 分页 */}
          {totalCount > 20 && (
            <div className="px-4 py-3 flex items-center justify-between border-t border-gray-100">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50"
              >
                上一页
              </button>
              <span className="text-sm text-gray-500">第 {page} 页 / 共 {Math.ceil(totalCount / 20)} 页</span>
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={page >= Math.ceil(totalCount / 20)}
                className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50"
              >
                下一页
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default AdminCouponPage
