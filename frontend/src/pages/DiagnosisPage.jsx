import React from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

function DiagnosisPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const result = location.state?.result

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

  const { diagnosis } = result

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

      <div className="max-w-4xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#FF6B00]/10 rounded-full mb-4">
            <span className="text-[#FF6B00]">✓</span>
            <span className="text-sm text-[#FF6B00] font-medium">诊断完成</span>
          </div>
          <h1 className="text-4xl font-bold text-black mb-2">诊断结果</h1>
          <p className="text-gray-600">基于AI分析和案例库匹配生成的诊断报告</p>
        </div>

        {/* Fault Type Card */}
        <div className="bg-white rounded-xl border border-gray-200 p-8 mb-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-black rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="text-white text-xl">🔍</span>
            </div>
            <div>
              <div className="text-sm text-gray-500 mb-1">故障类型</div>
              <div className="text-2xl font-bold text-black">{diagnosis.faultType || '未知'}</div>
            </div>
          </div>
        </div>

        {/* Possible Causes */}
        <div className="bg-white rounded-xl border border-gray-200 p-8 mb-6">
          <h2 className="text-xl font-semibold text-black mb-6">可能原因</h2>
          <div className="space-y-4">
            {diagnosis.possibleCauses?.map((cause, index) => (
              <div key={index} className="flex items-start gap-4 p-4 bg-gray-50 rounded-lg">
                <div className="w-8 h-8 bg-black text-white rounded-full flex items-center justify-center flex-shrink-0 text-sm font-medium">
                  {index + 1}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="font-medium text-black">{cause.cause}</span>
                    <span className="px-2 py-0.5 bg-[#FF6B00]/10 text-[#FF6B00] text-xs rounded-full font-medium">
                      {cause.probability}
                    </span>
                  </div>
                  <div className="text-sm text-gray-600">{cause.description}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Troubleshooting Steps */}
        <div className="bg-white rounded-xl border border-gray-200 p-8 mb-6">
          <h2 className="text-xl font-semibold text-black mb-6">排查步骤</h2>
          <div className="space-y-6">
            {diagnosis.steps?.map((step, index) => (
              <div key={index} className="border-l-2 border-black pl-6 relative">
                <div className="absolute -left-3 top-0 w-6 h-6 bg-black text-white rounded-full flex items-center justify-center text-xs font-medium">
                  {step.step}
                </div>
                <div className="mb-3">
                  <h3 className="font-semibold text-black text-lg">{step.operation}</h3>
                </div>
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
                  {step.tools && step.tools.length > 0 && (
                    <div className="flex items-start gap-2">
                      <span className="text-sm text-gray-500 w-20 flex-shrink-0">所需工具</span>
                      <span className="text-sm text-gray-900">{step.tools.join('、')}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Summary */}
        <div className="grid md:grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="text-sm text-gray-500 mb-2">所需工具</div>
            <div className="font-semibold text-black">
              {diagnosis.requiredTools && diagnosis.requiredTools.length > 0 
                ? diagnosis.requiredTools.join('、') 
                : '无需特殊工具'}
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="text-sm text-gray-500 mb-2">预计时间</div>
            <div className="font-semibold text-black">{diagnosis.totalEstimatedTime || '-'}</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="text-sm text-gray-500 mb-2">难度等级</div>
            <div className="font-semibold text-black">{diagnosis.difficulty || '未知'}</div>
          </div>
        </div>

        {/* Professional Repair Notice */}
        {diagnosis.needProfessionalRepair && (
          <div className="bg-[#FF6B00]/5 border border-[#FF6B00]/20 rounded-xl p-6 mb-8">
            <div className="flex items-start gap-3">
              <div className="text-2xl">⚠️</div>
              <div>
                <div className="font-semibold text-black mb-1">建议寻求专业维修</div>
                <div className="text-sm text-gray-600">
                  此故障可能需要专业工具或技术支持，建议联系大疆官方售后或专业维修店
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
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
