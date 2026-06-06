import React, { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { apiUrl } from '../config/api'
import { trackPaywallSeen, trackPaywallAction } from '../utils/tracking'
import { checkFreeUsageBeforeDiagnosis, getFreeLimitMessage, isFreeLimitError } from '../utils/freeUsage'
import { refreshFreeUsage } from '../components/DiagnosisCounter'

function ConversationPage() {
  const [messages, setMessages] = useState([])
  const [inputValue, setInputValue] = useState('')
  const [loading, setLoading] = useState(false)
  const [sessionId, setSessionId] = useState(null)
  const [currentRound, setCurrentRound] = useState(0)
  const [status, setStatus] = useState('active') // active | completed
  const [diagnosis, setDiagnosis] = useState(null)
  const [showPaywall, setShowPaywall] = useState(false)
  const messagesEndRef = useRef(null)
  const navigate = useNavigate()

  // 付费墙显示时埋点
  useEffect(() => {
    if (showPaywall) {
      trackPaywallSeen({ remainingFree: 0 })
    }
  }, [showPaywall])

  const PaywallModal = () => {
    if (!showPaywall) return null
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl p-8 text-center">
          <h3 className="text-xl font-bold text-black mb-2">今日免费次数已用完</h3>
          <p className="text-gray-600 mb-6">{getFreeLimitMessage()}</p>
          <div className="space-y-3">
            <button
              onClick={() => {
                trackPaywallAction({ action: 'upgrade' })
                setShowPaywall(false)
                navigate('/#pricing')
                setTimeout(() => {
                  document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' })
                }, 100)
              }}
              className="w-full py-3 bg-[#FF6B00] text-white rounded-xl font-medium hover:bg-orange-600 transition-colors"
            >
              查看会员方案
            </button>
            <button
              onClick={() => {
                trackPaywallAction({ action: 'skip' })
                setShowPaywall(false)
              }}
              className="w-full py-3 border-2 border-gray-200 rounded-xl font-medium hover:border-black transition-colors"
            >
              暂时不用
            </button>
          </div>
        </div>
      </div>
    )
  }

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // 开始对话
  const startConversation = async (symptom) => {
    setLoading(true)
    try {
      const usageState = await checkFreeUsageBeforeDiagnosis()
      if (!usageState.allowed) {
        refreshFreeUsage()
        setShowPaywall(true)
        return
      }

      const response = await axios.post(apiUrl('/api/diagnosis/conversation/start'), {
        symptom: symptom
      })
      refreshFreeUsage()

      setSessionId(response.data.sessionId)
      setCurrentRound(response.data.currentRound)
      
      // 添加用户消息
      setMessages(prev => [...prev, {
        role: 'user',
        content: symptom,
        type: 'symptom'
      }])

      // 如果是咨询类问题，先显示回答
      if (response.data.answer) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: response.data.answer,
          type: 'answer'
        }])
      }

      // 添加AI追问
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: response.data.question,
        type: 'question',
        options: response.data.options
      }])

    } catch (error) {
      console.error('Start conversation error:', error)
      if (isFreeLimitError(error)) {
        refreshFreeUsage()
        setShowPaywall(true)
      } else {
        alert('启动对话失败，请稍后重试')
      }
    } finally {
      setLoading(false)
    }
  }

  // 继续对话
  const continueConversation = async (answer) => {
    if (!sessionId) return

    setLoading(true)
    try {
      const response = await axios.post(apiUrl('/api/diagnosis/conversation/continue'), {
        sessionId: sessionId,
        answer: answer
      })

      // 添加用户回答
      setMessages(prev => [...prev, {
        role: 'user',
        content: answer,
        type: 'answer'
      }])

      setCurrentRound(response.data.currentRound)
      setStatus(response.data.status)

      if (response.data.status === 'continue') {
        // AI继续追问
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: response.data.question,
          type: 'question',
          options: response.data.options
        }])
      } else if (response.data.status === 'completed') {
        // 对话结束，显示诊断结果
        setDiagnosis(response.data.diagnosis)
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: '诊断完成！',
          type: 'diagnosis',
          diagnosis: response.data.diagnosis
        }])
      }

    } catch (error) {
      console.error('Continue conversation error:', error)
      alert('继续对话失败，请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  // 处理用户输入
  const handleSubmit = (e) => {
    e.preventDefault()
    if (!inputValue.trim() || loading) return

    if (!sessionId) {
      // 开始新对话
      startConversation(inputValue)
    } else {
      // 继续对话
      continueConversation(inputValue)
    }

    setInputValue('')
  }

  // 处理选项点击
  const handleOptionClick = (option) => {
    if (loading) return
    continueConversation(option)
  }

  // 查看详细诊断
  const viewDetailedDiagnosis = () => {
    navigate('/diagnosis', { state: { result: { success: true, diagnosis: diagnosis } } })
  }

  // 重新开始
  const restart = () => {
    setMessages([])
    setSessionId(null)
    setCurrentRound(0)
    setStatus('active')
    setDiagnosis(null)
    setInputValue('')
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <PaywallModal />

      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/')}
              className="text-gray-600 hover:text-black transition-colors"
            >
              ← 返回
            </button>
            <div className="w-px h-6 bg-gray-300" />
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-[#FF6B00] rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">D</span>
              </div>
              <span className="font-semibold">智能诊断对话</span>
            </div>
          </div>
          
          {sessionId && (
            <div className="flex items-center gap-4">
              <div className="text-sm text-gray-600">
                第 {currentRound} 轮
              </div>
              <button
                onClick={restart}
                className="px-3 py-1.5 text-sm text-gray-600 hover:text-black border border-gray-300 rounded-lg hover:border-gray-400 transition-colors"
              >
                重新开始
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-8">
        <div className="max-w-4xl mx-auto space-y-4">
          {/* 欢迎消息 */}
          {messages.length === 0 && (
            <div className="text-center py-16">
              <div className="w-16 h-16 bg-[#FF6B00] rounded-2xl flex items-center justify-center mx-auto mb-6">
                <span className="text-white text-3xl">🤖</span>
              </div>
              <h2 className="text-2xl font-semibold mb-3">您好，我是无人机诊断助手</h2>
              <p className="text-gray-600 mb-8 max-w-md mx-auto">
                请描述您遇到的故障现象，我会通过几个问题帮您精准定位问题
              </p>
              
              {/* 快速开始标签 */}
              <div className="flex flex-wrap gap-2 justify-center">
                {['无法起飞', 'GPS信号弱', '电机不转', '图传黑屏', '云台卡住'].map(tag => (
                  <button
                    key={tag}
                    onClick={() => {
                      setInputValue(tag)
                      setTimeout(() => {
                        startConversation(tag)
                      }, 100)
                    }}
                    disabled={loading}
                    className="px-4 py-2 bg-white border border-gray-300 rounded-full text-sm hover:border-[#FF6B00] hover:text-[#FF6B00] transition-colors disabled:opacity-50"
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 对话消息 */}
          {messages.map((msg, index) => (
            <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-2xl ${msg.role === 'user' ? 'order-2' : 'order-1'}`}>
                {msg.role === 'assistant' && (
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 bg-[#FF6B00] rounded flex items-center justify-center">
                      <span className="text-white text-xs">D</span>
                    </div>
                    <span className="text-sm text-gray-600">诊断助手</span>
                  </div>
                )}
                
                <div className={`rounded-2xl px-4 py-3 ${
                  msg.role === 'user' 
                    ? 'bg-[#FF6B00] text-white' 
                    : 'bg-white border border-gray-200'
                }`}>
                  <p className="text-sm leading-relaxed">{msg.content}</p>
                </div>

                {/* 选项按钮 */}
                {msg.type === 'question' && msg.options && (
                  <div className="mt-3 space-y-2">
                    {msg.options.map((option, optIndex) => (
                      <button
                        key={optIndex}
                        onClick={() => handleOptionClick(option)}
                        disabled={loading}
                        className="block w-full text-left px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm hover:border-[#FF6B00] hover:bg-orange-50 transition-colors disabled:opacity-50"
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                )}

                {/* 诊断结果卡片 */}
                {msg.type === 'diagnosis' && msg.diagnosis && (
                  <div className="mt-4 bg-white border border-gray-200 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-semibold">诊断结果</h3>
                      <span className="px-2 py-1 bg-orange-100 text-[#FF6B00] text-xs rounded">
                        {msg.diagnosis.faultType}
                      </span>
                    </div>
                    
                    <div className="space-y-2 mb-4">
                      {msg.diagnosis.possibleCauses?.slice(0, 3).map((cause, idx) => (
                        <div key={idx} className="flex items-start gap-2 text-sm">
                          <span className="text-[#FF6B00] font-medium">{cause.probability}</span>
                          <span className="text-gray-700">{cause.cause}</span>
                        </div>
                      ))}
                    </div>

                    <button
                      onClick={viewDetailedDiagnosis}
                      className="w-full py-2 bg-[#FF6B00] text-white rounded-lg text-sm font-medium hover:bg-orange-600 transition-colors"
                    >
                      查看完整诊断报告
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Loading indicator */}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-white border border-gray-200 rounded-2xl px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  <span className="text-sm text-gray-600">思考中...</span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      {status === 'active' && (
        <div className="bg-white border-t border-gray-200 px-6 py-4">
          <form onSubmit={handleSubmit} className="max-w-4xl mx-auto">
            <div className="flex gap-3">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={sessionId ? "输入您的回答..." : "描述故障现象..."}
                disabled={loading}
                className="flex-1 px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:border-[#FF6B00] disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={loading || !inputValue.trim()}
                className="px-6 py-3 bg-[#FF6B00] text-white rounded-xl font-medium hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                发送
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Completed status */}
      {status === 'completed' && (
        <div className="bg-white border-t border-gray-200 px-6 py-4">
          <div className="max-w-4xl mx-auto text-center">
            <p className="text-gray-600 mb-3">对话已完成</p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={restart}
                className="px-6 py-2 border border-gray-300 rounded-lg text-sm hover:border-gray-400 transition-colors"
              >
                重新诊断
              </button>
              <button
                onClick={viewDetailedDiagnosis}
                className="px-6 py-2 bg-[#FF6B00] text-white rounded-lg text-sm hover:bg-orange-600 transition-colors"
              >
                查看完整报告
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ConversationPage
