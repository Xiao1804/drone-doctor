import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'

function HistoryPage() {
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all') // all, text, conversation, image
  const navigate = useNavigate()

  useEffect(() => {
    loadHistory()
  }, [])

  const loadHistory = async () => {
    try {
      const token = localStorage.getItem('token')
      if (!token) {
        alert('请先登录')
        navigate('/auth')
        return
      }

      const response = await axios.get('/api/history', {
        headers: { Authorization: `Bearer ${token}` }
      })

      setHistory(response.data.history || [])
    } catch (error) {
      console.error('Load history error:', error)
      if (error.response?.status === 401) {
        alert('登录已过期，请重新登录')
        navigate('/auth')
      } else {
        alert('加载历史记录失败')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('确定要删除这条记录吗？')) return

    try {
      const token = localStorage.getItem('token')
      await axios.delete(`/api/history/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      })

      setHistory(history.filter(h => h.id !== id))
      alert('删除成功')
    } catch (error) {
      console.error('Delete error:', error)
      alert('删除失败')
    }
  }

  const handleToggleFavorite = async (id) => {
    try {
      const token = localStorage.getItem('token')
      const response = await axios.put(`/api/history/${id}/favorite`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      })

      setHistory(history.map(h => 
        h.id === id ? { ...h, isFavorite: response.data.history.isFavorite } : h
      ))
    } catch (error) {
      console.error('Toggle favorite error:', error)
      alert('操作失败')
    }
  }

  const handleExport = (record) => {
    const data = {
      type: record.type,
      content: record.content,
      result: record.result,
      createdAt: record.createdAt
    }

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `diagnosis-${record.id}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const filteredHistory = history.filter(h => {
    if (filter === 'all') return true
    return h.type === filter
  })

  const getTypeLabel = (type) => {
    const labels = {
      text: '文本诊断',
      conversation: '多轮对话',
      image: '图片识别'
    }
    return labels[type] || type
  }

  const getTypeColor = (type) => {
    const colors = {
      text: 'bg-blue-100 text-blue-800',
      conversation: 'bg-green-100 text-green-800',
      image: 'bg-purple-100 text-purple-800'
    }
    return colors[type] || 'bg-gray-100 text-gray-800'
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">加载中...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <div className="bg-[#FF6B00] text-white px-4 py-6">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => navigate('/')}
              className="text-white hover:opacity-80"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-xl font-bold">诊断历史</h1>
            <div className="w-6"></div>
          </div>

          {/* Filter Tabs */}
          <div className="flex gap-2 mt-4">
            {['all', 'text', 'conversation', 'image'].map(type => (
              <button
                key={type}
                onClick={() => setFilter(type)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  filter === type
                    ? 'bg-white text-[#FF6B00]'
                    : 'bg-white/20 text-white hover:bg-white/30'
                }`}
              >
                {type === 'all' ? '全部' : getTypeLabel(type)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6">
        {filteredHistory.length === 0 ? (
          <div className="text-center py-12">
            <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-gray-500">暂无历史记录</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredHistory.map(record => (
              <div
                key={record.id}
                className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden"
              >
                {/* Header */}
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${getTypeColor(record.type)}`}>
                      {getTypeLabel(record.type)}
                    </span>
                    {record.isFavorite && (
                      <svg className="w-4 h-4 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                    )}
                  </div>
                  <span className="text-xs text-gray-500">
                    {new Date(record.createdAt).toLocaleString('zh-CN')}
                  </span>
                </div>

                {/* Content */}
                <div className="px-4 py-3">
                  <div className="text-sm text-gray-600 mb-2">
                    <span className="font-medium">问题：</span>
                    {record.content.substring(0, 100)}
                    {record.content.length > 100 && '...'}
                  </div>
                  <div className="text-sm text-gray-900">
                    <span className="font-medium">诊断：</span>
                    {record.result.substring(0, 150)}
                    {record.result.length > 150 && '...'}
                  </div>
                </div>

                {/* Actions */}
                <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleToggleFavorite(record.id)}
                      className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 hover:text-yellow-600 transition-colors"
                    >
                      <svg className="w-4 h-4" fill={record.isFavorite ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 20 20">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                      {record.isFavorite ? '已收藏' : '收藏'}
                    </button>
                    <button
                      onClick={() => handleExport(record)}
                      className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 hover:text-blue-600 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      导出
                    </button>
                  </div>
                  <button
                    onClick={() => handleDelete(record.id)}
                    className="text-sm text-red-600 hover:text-red-700"
                  >
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default HistoryPage
