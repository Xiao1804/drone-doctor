
import React, { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import axios from 'axios'
import { apiUrl } from '../config/api'
import { apiClient } from '../utils/apiClient'
import { showToast } from '../components/Toast'
import CouponModal from '../components/CouponModal'
import { isFreeLimitError } from '../utils/freeUsage'

function AgentChatPage() {
  const [messages, setMessages] = useState([
    {
      id: 1,
      role: 'assistant',
      content: '你好！我是「无人机医生」，一名专业的无人机维修与飞行技术专家。有什么我可以帮你的吗？请告诉我你的无人机遇到了什么问题？'
    }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState(null)
  const [showCouponModal, setShowCouponModal] = useState(false)
  const messagesEndRef = useRef(null)
  const navigate = useNavigate()
  const location = useLocation()

  // 自动滚动到底部
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }
  useEffect(scrollToBottom, [messages])

  // 加载智能体状态
  useEffect(() => {
    apiClient.get('/api/agent/status').then(res => {
      setStatus(res.data)
    }).catch(() => {})
  }, [])

  // 来自首页三步诊断器的初始消息：自动发送一次，让智能体立即做初步诊断
  useEffect(() => {
    const st = location.state
    if (st?.initialMessage && st?.autoSend) {
      // 消费掉 state，避免浏览器 back/forward 重复触发
      navigate(location.pathname, { replace: true, state: null })
      handleSend(st.initialMessage)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSend = async (overrideText) => {
    const userInput = (overrideText !== undefined ? overrideText : input).trim()
    if (!userInput) return
    setInput('')
    setLoading(true)

    const userMessage = {
      id: Date.now(),
      role: 'user',
      content: userInput
    }
    setMessages(prev => [...prev, userMessage])

    try {
      // 构建历史对话
      const history = messages.slice(1).map(m => ({
        role: m.role,
        content: m.content
      }))

      const res = await apiClient.post('/api/agent/chat', {
        message: userInput,
        conversationHistory: history
      })

      if (res.data.success) {
        setMessages(prev => [
          ...prev,
          {
            id: Date.now() + 1,
            role: 'assistant',
            content: res.data.reply,
            sources: res.data.sources || []
          }
        ])
      } else {
        showToast(res.data.error || '对话失败，请稍后重试', 'error')
      }
    } catch (error) {
      console.error('[AgentChat] 错误:', error)
      if (isFreeLimitError(error)) {
        setShowCouponModal(true)
      } else {
        showToast(error.message || '网络错误，请稍后重试', 'error')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const clearChat = () => {
    setMessages([
      {
        id: 1,
        role: 'assistant',
        content: '你好！我是「无人机医生」，一名专业的无人机维修与飞行技术专家。有什么我可以帮你的吗？'
      }
    ])
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航栏 */}
      <div className="bg-white shadow-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/')} className="text-gray-600 hover:text-gray-900">
              ← 返回
            </button>
            <div className="w-px h-6 bg-gray-300" />
            <div className="w-10 h-10 bg-gradient-to-br from-cyan-600 to-teal-400 rounded-xl flex items-center justify-center">
              <span className="text-white font-bold text-lg">🚁</span>
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">无人机医生</h1>
              <p className="text-xs text-gray-500">智能体 v2.1</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {status && (
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${status.llmConfigured ? 'bg-green-500' : 'bg-yellow-500'}`}></span>
                <span className="text-xs text-gray-500">{status.llmConfigured ? '大模型已就绪' : '演示模式'}</span>
              </div>
            )}
            <button
              onClick={clearChat}
              className="text-sm px-3 py-1 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg"
            >
              清空对话
            </button>
          </div>
        </div>
      </div>

      {/* 对话区域 */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* 主对话区 */}
          <div className="lg:col-span-3">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
              {/* 对话消息 */}
              <div className="h-[60vh] overflow-y-auto p-6 space-y-6">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex gap-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    {msg.role === 'assistant' && (
                      <div className="w-10 h-10 bg-gradient-to-br from-cyan-600 to-teal-400 rounded-xl flex items-center justify-center shrink-0">
                        <span className="text-white text-lg">🚁</span>
                      </div>
                    )}
                    <div className={`max-w-[70%] ${msg.role === 'user' ? 'order-2' : 'order-1'}`}>
                      <div className={`p-4 rounded-2xl ${
                        msg.role === 'user'
                          ? 'bg-cyan-600 text-white'
                          : 'bg-gray-50 text-gray-900 border border-gray-200'
                      }`}>
                        <div className="whitespace-pre-wrap leading-relaxed">{msg.content}</div>
                      </div>
                      {/* 参考来源 */}
                      {msg.sources && msg.sources.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {msg.sources.slice(0, 3).map((source, idx) => (
                            <span
                              key={idx}
                              className="text-xs px-2 py-1 bg-cyan-50 text-cyan-700 rounded-lg"
                            >
                              {source.title}
                            </span>
                          ))}
                          {msg.sources.length > 3 && (
                            <span className="text-xs text-gray-500">
                              +{msg.sources.length - 3} 个来源
                            </span>
                          )}
                        </div>
                      )}
                      <div className="mt-1 text-xs text-gray-400">
                        {msg.role === 'user' ? '你' : '无人机医生'}
                      </div>
                    </div>
                    {msg.role === 'user' && (
                      <div className="w-10 h-10 bg-gradient-to-br from-gray-600 to-gray-400 rounded-xl flex items-center justify-center shrink-0 order-3">
                        <span className="text-white text-lg">👤</span>
                      </div>
                    )}
                  </div>
                ))}
                {loading && (
                  <div className="flex gap-4 justify-start">
                    <div className="w-10 h-10 bg-gradient-to-br from-cyan-600 to-teal-400 rounded-xl flex items-center justify-center">
                      <span className="text-white text-lg">🚁</span>
                    </div>
                    <div className="max-w-[70%] bg-gray-50 border border-gray-200 rounded-2xl p-4">
                      <div className="flex gap-2">
                        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></span>
                        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></span>
                        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></span>
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef}></div>
              </div>

              {/* 输入区 */}
              <div className="p-4 bg-gray-50 border-t border-gray-200">
                <div className="flex gap-3">
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="请输入你的问题，例如：无人机无法起飞怎么办？..."
                    rows={1}
                    className="flex-1 px-4 py-3 border border-gray-300 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                    style={{ minHeight: '56px', maxHeight: '120px' }}
                  />
                  <button
                    onClick={handleSend}
                    disabled={loading || !input.trim()}
                    className="px-6 py-3 bg-cyan-600 text-white rounded-xl hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                  >
                    发送
                  </button>
                </div>
                <p className="mt-2 text-xs text-gray-500 text-center">
                  提示：按 Enter 发送，Shift+Enter 换行
                </p>
              </div>
            </div>
          </div>

          {/* 侧边栏 */}
          <div className="lg:col-span-1">
            <div className="space-y-4">
              {/* 快速问题 */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">快速提问</h3>
                <div className="space-y-2">
                  {[
                    '无人机无法起飞',
                    '电机不转',
                    '图传黑屏',
                    '云台卡住',
                    'GPS信号弱',
                    '电池鼓包'
                  ].map((q, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setInput(q)
                      }}
                      className="w-full text-left px-3 py-2 text-sm text-gray-700 bg-gray-50 rounded-lg hover:bg-gray-100"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>

              {/* 使用说明 */}
              <div className="bg-gradient-to-br from-cyan-50 to-teal-50 rounded-2xl border border-cyan-200 p-5">
                <h3 className="text-sm font-semibold text-cyan-900 mb-3">使用说明</h3>
                <ul className="space-y-2 text-sm text-cyan-800">
                  <li className="flex items-start gap-2">
                    <span className="text-cyan-600 mt-0.5">•</span>
                    <span>我只回答无人机领域的问题</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-cyan-600 mt-0.5">•</span>
                    <span>结合知识库提供专业建议</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-cyan-600 mt-0.5">•</span>
                    <span>涉及安全问题会优先提醒</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
      {showCouponModal && (
        <CouponModal
          onClose={() => setShowCouponModal(false)}
          onActivated={() => setShowCouponModal(false)}
        />
      )}
    </div>
  )
}

export default AgentChatPage
