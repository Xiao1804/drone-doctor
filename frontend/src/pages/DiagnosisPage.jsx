import React, { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { apiUrl } from '../config/api'
import DiagnosisCounter from '../components/DiagnosisCounter'
import { trackFeedback, trackRegisterPromptSeen, trackRegisterPromptAction } from '../utils/tracking'

function DiagnosisPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const result = location.state?.result
  const durationMs = location.state?.durationMs
  const deviceType = location.state?.deviceType
  const faultType = location.state?.faultType

  const [stepsExpanded, setStepsExpanded] = useState(false)
  const [feedbackGiven, setFeedbackGiven] = useState(null) // 'solved' | 'unsolved'
  const [showFeedbackAnimation, setShowFeedbackAnimation] = useState(false)
  const [similarCount, setSimilarCount] = useState(null)
  const [showRegisterPrompt, setShowRegisterPrompt] = useState(false)

  useEffect(() => {
    if (result && deviceType && faultType) {
      // 获取相似诊断次数
      axios.get(apiUrl(`/api/stats/similar-diagnoses?deviceType=${deviceType}&faultType=${faultType}`))
        .then(res => setSimilarCount(res.data.total))
        .catch(() => {})

      // 检查是否需要显示注册引导（第2次诊断后）
      const usedCount = parseInt(localStorage.getItem('dd_diagnosis_count') || '0', 10)
      const user = localStorage.getItem('user')
      const skipRegister = sessionStorage.getItem('dd_skip_register')

      if (usedCount >= 2 && !user && !skipRegister) {
        setShowRegisterPrompt(true)
        trackRegisterPromptSeen({ diagnosisCount: usedCount })
      }
    }
  }, [result, deviceType, faultType])

  if (!result) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">🔍</div>
          <p className="text-gray-600 mb-6">暂无诊断结果</p>
          <button
            onClick={() => navigate('/')}
            className="px-6 py-3 bg-black text-white rounded-lg hover:bg-[#FF6B00] transition-colors"
          >
            返回首页
          </button>
        </div>
      </div>
    )
  }

  const { diagnosis, diagnosisId } = result

  // 反馈按钮处理
  const handleFeedback = (type) => {
    setFeedbackGiven(type)
    setShowFeedbackAnimation(type === 'solved')

    trackFeedback({
      result: type,
      diagnosis_id: diagnosisId || ''
    })

    if (type === 'solved') {
      setTimeout(() => setShowFeedbackAnimation(false), 2000)
    }
  }

  // 跳过注册引导
  const handleSkipRegister = () => {
    setShowRegisterPrompt(false)
    sessionStorage.setItem('dd_skip_register', '1')
    trackRegisterPromptAction({ action: 'skip' })
  }

  // 难度星级渲染
  const renderDifficulty = (level) => {
    const num = parseInt(level, 10) || 1
    return '⭐'.repeat(Math.min(num, 5))
  }

  // 排查步骤
  const steps = diagnosis.steps || []
  const visibleSteps = stepsExpanded ? steps : steps.slice(0, 2)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <nav className="bg-white border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-gray-600 hover:text-black transition-colors"
          >
            <span>←</span>
            <span>返回首页</span>
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-[#FF6B00] rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">D</span>
            </div>
            <span className="font-semibold">DroneDoctor</span>
          </div>
        </div>
      </nav>

      {/* 全局次数指示器 */}
      <DiagnosisCounter />

      <div className="max-w-4xl mx-auto px-6 py-12">

        {/* ===== 第1段：诊断摘要 ===== */}
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-green-50 rounded-full mb-4">
            <span className="text-green-600">✅</span>
            <span className="text-sm text-green-600 font-medium">诊断完成！</span>
          </div>

          <div className="grid md:grid-cols-2 gap-4 mb-6">
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="text-sm text-gray-500 mb-1">故障类型</div>
              <div className="text-2xl font-bold text-black">{diagnosis.faultType || '未知'}</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="text-sm text-gray-500 mb-1">最可能原因</div>
              <div className="text-lg font-semibold text-black">
                {diagnosis.possibleCauses?.[0]?.cause || '待分析'}
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="text-sm text-gray-500 mb-1">预计解决时间</div>
              <div className="text-lg font-semibold text-black">{diagnosis.totalEstimatedTime || '-'}</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="text-sm text-gray-500 mb-1">难度</div>
              <div className="text-lg">{renderDifficulty(diagnosis.difficulty)}</div>
            </div>
          </div>
        </div>

        {/* ===== 第2段：排查步骤（可折叠） ===== */}
        <div className="bg-white rounded-xl border border-gray-200 p-8 mb-8">
          <h2 className="text-xl font-semibold text-black mb-6">排查步骤</h2>
          <div className="space-y-6">
            {visibleSteps.map((step, index) => (
              <div key={index} className="border-l-2 border-[#FF6B00] pl-6 relative">
                <div className="absolute -left-3 top-0 w-6 h-6 bg-[#FF6B00] text-white rounded-full flex items-center justify-center text-xs font-medium">
                  {step.step}
                </div>
                <h3 className="font-semibold text-black text-lg mb-2">{step.operation}</h3>
                <div className="space-y-2">
                  <div className="flex items-start gap-2">
                    <span className="text-sm text-gray-500 w-20 flex-shrink-0">判断标准</span>
                    <span className="text-sm text-gray-900">{step.criteria}</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-sm text-gray-500 w-20 flex-shrink-0">解决方案</span>
                    <span className="text-sm text-gray-900">{step.solution}</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-sm text-gray-500 w-20 flex-shrink-0">预计时间</span>
                    <span className="text-sm text-gray-900">{step.estimatedTime}</span>
                  </div>
                  {step.tools?.length > 0 && (
                    <div className="flex items-start gap-2">
                      <span className="text-sm text-gray-500 w-20 flex-shrink-0">所需工具</span>
                      <span className="text-sm text-gray-900">{step.tools.join('、')}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* 展开/收起按钮 */}
          {steps.length > 2 && (
            <button
              onClick={() => setStepsExpanded(!stepsExpanded)}
              className="mt-6 w-full py-3 border-2 border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:border-[#FF6B00] hover:text-[#FF6B00] transition-colors"
            >
              {stepsExpanded ? `收起步骤 ▲` : `展开全部 ${steps.length} 步 ▼`}
            </button>
          )}
        </div>

        {/* 专业维修提醒 */}
        {diagnosis.needProfessionalRepair && (
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-6 mb-8">
            <div className="flex items-start gap-3">
              <span className="text-2xl">⚠️</span>
              <div>
                <div className="font-semibold text-black mb-1">建议寻求专业维修</div>
                <div className="text-sm text-gray-600">
                  此故障可能需要专业工具或技术支持，建议联系大疆官方售后或专业维修店
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ===== 第3段：行动引导区 ===== */}
        <div className="grid md:grid-cols-3 gap-4 mb-8">
          {/* 卡片1：查看知识库 */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 flex flex-col items-center text-center">
            <span className="text-3xl mb-3">📋</span>
            <p className="text-sm font-medium text-black mb-3">还需要更多帮助？</p>
            <button
              onClick={() => navigate('/guide')}
              className="text-sm text-[#FF6B00] hover:underline"
            >
              查看维修知识库 →
            </button>
          </div>

          {/* 卡片2：反馈按钮 */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 flex flex-col items-center text-center relative overflow-hidden">
            {showFeedbackAnimation && (
              <div className="absolute inset-0 flex items-center justify-center bg-green-50 z-10 animate-pulse">
                <span className="text-5xl">✅</span>
                <span className="text-2xl font-bold text-green-600 ml-3">太好了！</span>
              </div>
            )}
            <span className="text-3xl mb-3">🎯</span>
            <p className="text-sm font-medium text-black mb-3">这个故障解决了吗？</p>
            <div className="flex gap-2">
              <button
                onClick={() => handleFeedback('solved')}
                disabled={feedbackGiven !== null}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  feedbackGiven === 'solved'
                    ? 'bg-green-500 text-white'
                    : feedbackGiven
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-green-50 text-green-700 hover:bg-green-100'
                }`}
              >
                解决了 ✓
              </button>
              <button
                onClick={() => handleFeedback('unsolved')}
                disabled={feedbackGiven !== null}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  feedbackGiven === 'unsolved'
                    ? 'bg-red-500 text-white'
                    : feedbackGiven
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-red-50 text-red-700 hover:bg-red-100'
                }`}
              >
                还没解决
              </button>
            </div>

            {/* "还没解决"后的选项 */}
            {feedbackGiven === 'unsolved' && (
              <div className="mt-3 flex flex-col gap-2 w-full">
                <button
                  onClick={() => navigate('/')}
                  className="w-full py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:border-[#FF6B00] hover:text-[#FF6B00] transition-colors"
                >
                  换个关键词再试
                </button>
                <button
                  onClick={() => navigate('/guide')}
                  className="w-full py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:border-[#FF6B00] hover:text-[#FF6B00] transition-colors"
                >
                  查看相关教程
                </button>
              </div>
            )}
          </div>

          {/* 卡片3：保存诊断 */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 flex flex-col items-center text-center">
            <span className="text-3xl mb-3">💾</span>
            <p className="text-sm font-medium text-black mb-3">保存诊断结果</p>
            <button
              onClick={() => navigate('/auth')}
              className="px-4 py-2 bg-black text-white rounded-lg text-sm font-medium hover:bg-[#FF6B00] transition-colors mb-2"
            >
              微信扫码登录
            </button>
            <button
              onClick={() => {}}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              暂时不用
            </button>
          </div>
        </div>

        {/* 社会认同 */}
        {similarCount !== null && similarCount > 0 && (
          <p className="text-center text-sm text-gray-400 mb-8">
            本月已有 {similarCount} 人诊断了类似问题
          </p>
        )}

        {/* 注册引导卡片（非弹窗，内嵌） */}
        {showRegisterPrompt && (
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-6 mb-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-base font-semibold text-black mb-2">
                  💾 想保存这次诊断结果吗？
                </p>
                <ul className="text-sm text-gray-600 space-y-1 mb-4">
                  <li>✅ 查看所有诊断历史</li>
                  <li>✅ 对比不同故障的排查方案</li>
                  <li>✅ 收藏常用维修教程</li>
                </ul>
                <button
                  onClick={() => {
                    trackRegisterPromptAction({ action: 'register' })
                    navigate('/auth')
                  }}
                  className="px-6 py-3 bg-[#FF6B00] text-white rounded-lg text-sm font-medium hover:bg-[#FF8533] transition-colors"
                >
                  微信扫码，3秒登录
                </button>
              </div>
              <button
                onClick={handleSkipRegister}
                className="text-sm text-gray-400 hover:text-gray-600 whitespace-nowrap"
              >
                暂时不用 ✕
              </button>
            </div>
          </div>
        )}

        {/* 底部操作 */}
        <div className="flex gap-4">
          <button
            onClick={() => navigate('/')}
            className="flex-1 py-4 border-2 border-gray-200 rounded-xl font-medium hover:border-black transition-colors"
          >
            重新诊断
          </button>
          <button
            onClick={() => {
              if (navigator.share) {
                navigator.share({
                  title: 'DroneDoctor 诊断结果',
                  text: `故障类型：${diagnosis.faultType}`,
                  url: window.location.href
                })
              } else {
                alert('已复制诊断结果')
              }
            }}
            className="flex-1 py-4 bg-black text-white rounded-xl font-medium hover:bg-[#FF6B00] transition-colors"
          >
            分享结果
          </button>
        </div>
      </div>
    </div>
  )
}

export default DiagnosisPage
