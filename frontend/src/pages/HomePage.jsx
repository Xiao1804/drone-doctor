import React, { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import axios from 'axios'
import { apiUrl } from '../config/api'
import DiagnosisCounter, { incrementDiagnosisCount, refreshFreeUsage } from '../components/DiagnosisCounter'
import { checkFreeUsageBeforeDiagnosis } from '../utils/freeUsage'
import { trackDiagnosisStart } from '../utils/tracking'
import { DEVICE_TYPES, FAULT_TYPES } from '../shared/enums'
import { showToast } from '../components/Toast'
import CouponModal from '../components/CouponModal'
import WeChatQR from '../components/WeChatQR'
import { apiClient } from '../utils/apiClient'

// 机型选项与故障类型从共享枚举导入（src/shared/enums.js）
// 如需修改枚举值，请同步更新 shared/enums.js 和后端引用

// 小知识文案
const TIPS = [
  '70%的"无法起飞"故障原因是电池电量不足或GPS信号弱',
  '云台卡住时，先检查是否有异物进入云台关节',
  '图传黑屏最常见的原因是排线松动或天线接触不良',
  '电池鼓包后严禁继续使用，存在安全隐患',
  'GPS信号弱时，建议到空旷地带等待搜星完成再起飞',
  '电机异响可能是螺旋桨安装不到位或轴承磨损',
  '定期校准IMU可以避免飞行姿态异常',
  '避障失灵时，先检查传感器镜片是否有污渍或划痕',
  '飞行前务必检查桨叶是否有裂纹，高速旋转下桨叶断裂极其危险',
  '返航失败通常是因为返航点未记录或GPS信号丢失',
  '指南针干扰多来自钢筋混凝土建筑，起飞前建议远离',
  '续航骤降可能是电池老化或环境温度过低导致',
  '遥控器信号中断时，无人机默认执行返航或悬停',
  '云台抖动可能是减震球老化或云台电机故障',
  '图传延迟超过200ms时建议检查天线方向和周围干扰源'
]

function HomePage() {
  // 结构化三步选择状态
  const [step, setStep] = useState(1)
  const [selectedDevice, setSelectedDevice] = useState(null)
  const [selectedFault, setSelectedFault] = useState(null)
  const [extraDescription, setExtraDescription] = useState('')
  const [customFault, setCustomFault] = useState('')
  const [customDevice, setCustomDevice] = useState('')

  // 等待页状态
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressText, setProgressText] = useState('')
  const [currentTip, setCurrentTip] = useState(TIPS[0])
  const [totalDiagnoses, setTotalDiagnoses] = useState(null)

  const navigate = useNavigate()

  // 智能体诊断状态（试点）
  const [showAgentModal, setShowAgentModal] = useState(false)
  const [agentQuery, setAgentQuery] = useState('')
  const [agentLoading, setAgentLoading] = useState(false)
  const [agentResult, setAgentResult] = useState(null)

  // 体验状态
  const [accessStatus, setAccessStatus] = useState(null)
  const [showCouponModal, setShowCouponModal] = useState(false)

  useEffect(() => {
    // 获取总诊断次数
    axios.get(apiUrl('/api/stats/total-diagnoses')).then(res => {
      setTotalDiagnoses(res.data.total)
    }).catch(() => {})

    // 获取体验状态
    apiClient.get('/api/stats/free-usage').then(res => {
      setAccessStatus(res.data)
    }).catch(() => {
      setAccessStatus({ allowed: false, isAdmin: false })
    })
  }, [])

  useEffect(() => {
    if (['#trial', '#pricing'].includes(window.location.hash)) {
      setTimeout(() => {
        document.getElementById('trial')?.scrollIntoView({ behavior: 'smooth' })
      }, 100)
    }
  }, [])

  // 等待页进度条动画
  useEffect(() => {
    if (!loading) {
      setProgress(0)
      setProgressText('')
      return
    }

    const phases = [
      { target: 33, text: '正在解析故障描述...', duration: 2000 },
      { target: 66, text: '正在匹配故障案例库...', duration: 2000 },
      { target: 99, text: '正在生成排查步骤...', duration: 2000 }
    ]

    let currentPhase = 0
    let elapsed = 0
    const interval = setInterval(() => {
      if (currentPhase >= phases.length) {
        clearInterval(interval)
        return
      }

      const phase = phases[currentPhase]
      elapsed += 50
      const phaseProgress = Math.min((elapsed / phase.duration) * (phase.target - (currentPhase > 0 ? phases[currentPhase - 1].target : 0)), phase.target - (currentPhase > 0 ? phases[currentPhase - 1].target : 0))
      const base = currentPhase > 0 ? phases[currentPhase - 1].target : 0
      setProgress(Math.min(base + phaseProgress, 99))
      setProgressText(phase.text)

      if (elapsed >= phase.duration) {
        elapsed = 0
        currentPhase++
      }
    }, 50)

    return () => clearInterval(interval)
  }, [loading])

  // 小知识切换
  useEffect(() => {
    if (!loading) return
    let tipIndex = 0
    const tipInterval = setInterval(() => {
      tipIndex = (tipIndex + 1) % TIPS.length
      setCurrentTip(TIPS[tipIndex])
    }, 3000)
    return () => clearInterval(tipInterval)
  }, [loading])

  // 选择机型
  const handleSelectDevice = (device) => {
    setSelectedDevice(device)
    // 其他机型：留在本步露出输入框，让用户填具体型号（与"其他故障"一致）
    if (device.id === 'other') return
    setStep(2)
  }

  // 选择故障类型
  const handleSelectFault = (fault) => {
    if (fault.id === 'other') {
      setSelectedFault(fault)
      // 不跳步骤，让用户在当前步骤输入自定义故障
    } else {
      setSelectedFault(fault)
      setStep(3)
    }
  }

  // 提交诊断
  const handleSubmitDiagnosis = async () => {
    const isOtherDevice = selectedDevice?.id === 'other'
    const isOtherFault = selectedFault?.id === 'other'
    const faultText = isOtherFault ? customFault : (selectedFault?.label || '')

    if (!faultText && !extraDescription.trim()) return

    // 拼装给智能体的初始消息：机型 + 故障 + 补充描述
    // - 选"其他机型"时不硬塞"是其他机型"（无意义），用户真机型号通常已在描述里
    // - 选"其他故障"时 customFault 是用户原话描述，直接用，不套"遇到了…的问题"（否则双重嵌套）
    let initialMessage = ''
    if (isOtherDevice) {
      // 其他机型：用用户填的具体型号（customDevice）
      if (customDevice.trim()) initialMessage += `我的无人机是${customDevice.trim()}，`
    } else if (selectedDevice?.label) {
      initialMessage += `我的无人机是${selectedDevice.label}，`
    }
    if (isOtherFault) {
      initialMessage += customFault.trim()
    } else if (faultText) {
      initialMessage += `出现了"${faultText}"的问题。`
    }
    if (extraDescription.trim()) {
      initialMessage += `\n补充：${extraDescription.trim()}`
    }
    initialMessage += '\n请帮我初步诊断可能的原因和排查步骤。'
    initialMessage = initialMessage.trim()

    // 体验通行证检查（与图片识别/飞行日志一致：没券且非管理员 → 弹兑换券）
    const usageState = await checkFreeUsageBeforeDiagnosis()
    if (!usageState.allowed) {
      refreshFreeUsage()
      setShowCouponModal(true)
      return
    }

    // 埋点
    trackDiagnosisStart({
      source: 'hero',
      deviceType: selectedDevice?.id || '',
      faultType: selectedFault?.id || '',
      remainingFree: usageState.remaining
    })

    incrementDiagnosisCount()
    refreshFreeUsage()

    // 直跳智能对话 /agent，把上下文作为初始消息自动发给智能体做初步诊断。
    // 决策树已转作 /agent 的 RAG 骨架，不再作前台流程；交互式诊断/维修助手向导已全部隐藏。
    navigate('/agent', {
      state: {
        initialMessage,
        autoSend: true,
        deviceType: selectedDevice?.id,
        faultType: selectedFault?.id
      }
    })
  }

  // 智能体诊断（试点）
  const handleAgentDiagnose = async () => {
    if (!agentQuery.trim()) return

    // 体验通行证检查
    const usageState = await checkFreeUsageBeforeDiagnosis()
    if (!usageState.allowed) {
      refreshFreeUsage()
      setShowCouponModal(true)
      return
    }

    setAgentLoading(true)
    setAgentResult(null)

    try {
      const response = await axios.post(apiUrl('/api/diagnosis/agent'), {
        query: agentQuery.trim(),
        mode: 'single'
      })

      if (response.data.success) {
        setAgentResult(response.data.data)
        incrementDiagnosisCount()
        refreshFreeUsage()
      } else {
        showToast('诊断失败：' + (response.data.error || '未知错误'), 'error')
      }
    } catch (error) {
      console.error('Agent diagnosis error:', error)
      if (
        [401, 403].includes(error?.response?.status)
        && error?.response?.data?.error === 'TRIAL_ACCESS_REQUIRED'
      ) {
        refreshFreeUsage()
        setShowCouponModal(true)
      } else {
        showToast('智能体诊断失败，请稍后重试', 'error')
      }
    } finally {
      setAgentLoading(false)
    }
  }

  // 平台统计（从后端 API 获取真实数据）
  const [platformStats, setPlatformStats] = useState(null)

  useEffect(() => {
    axios.get(apiUrl('/api/stats/overview')).then(res => {
      const d = res.data
      setPlatformStats([
        { number: d.totalDiagnoses > 0 ? d.totalDiagnoses.toLocaleString() + '+' : '—', label: '诊断次数' },
        { number: d.totalCases > 0 ? d.totalCases + '条' : '—', label: '故障案例' },
        { number: d.totalTrials > 0 ? d.totalTrials.toLocaleString() + '+' : '—', label: '已激活体验' },
        { number: 'AI辅助', label: '智能诊断' },
      ])
    }).catch(() => {
      // fallback：只显示案例数（可验证的真实数据）
      setPlatformStats([
        { number: '—', label: '诊断次数' },
        { number: '129条', label: '故障案例' },
        { number: '—', label: '已激活体验' },
        { number: 'AI辅助', label: '智能诊断' },
      ])
    })
  }, [])

  const features = [
    { icon: '🔍', title: '智能诊断', description: 'AI分析故障原因，提供精准排查步骤' },
    { icon: '📖', title: '知识库', description: '覆盖主流机型，持续更新的维修案例' },
    { icon: '🎓', title: '考证指南', description: 'CAAC考证全流程指导，题库练习' }
  ]

  // 统一 4 个功能入口的门禁：没券且非管理员 → 滚到“扫码加微信”区（与图片识别/飞行日志页一致），
  // 不进功能页。accessStatus 还在加载(null)时放行，交给目标页自身门禁兜底。
  const requireFeatureAccess = () => {
    if (accessStatus === null) return true
    if (accessStatus?.allowed || accessStatus?.isAdmin) return true
    document.getElementById('trial')?.scrollIntoView({ behavior: 'smooth' })
    return false
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 bg-white/95 backdrop-blur-sm border-b border-gray-100 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-[#FF6B00] rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">D</span>
            </div>
            <span className="font-semibold text-lg">DroneDoctor</span>
          </div>
          <div className="flex items-center gap-8">
            <a href="#features" className="text-sm text-gray-600 hover:text-black transition-colors">功能</a>
            <a href="#trial" className="text-sm text-gray-600 hover:text-black transition-colors">免费体验</a>
            <Link to="/agent" className="px-4 py-2 bg-gradient-to-r from-cyan-600 to-teal-500 text-white text-sm rounded-lg hover:from-cyan-700 hover:to-teal-600 transition-all">🚁 智能对话</Link>
            {/* 维修助手（/guide 决策树向导）入口已隐藏（2026-07-07）：决策树转作 /agent 的 RAG 骨架，
                不再作前台流程；用户统一走 /agent。/guide 路由保留，需恢复时取消此注释即可。
            <button onClick={() => navigate('/guide')} className="px-4 py-2 bg-[#FF6B00] text-white text-sm rounded-lg hover:bg-black transition-colors">维修助手</button>
            */}
            <button onClick={() => setShowCouponModal(true)} className="px-4 py-2 bg-black text-white text-sm rounded-lg hover:bg-[#FF6B00] transition-colors">输入兑换券</button>
          </div>
        </div>
      </nav>

      {/* 全局次数指示器 */}
      <DiagnosisCounter showUpgradeHint={!loading && step === 3} showTrialEntry />

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-gray-50 rounded-full mb-8">
            <span className="w-2 h-2 bg-[#FF6B00] rounded-full animate-pulse"></span>
            <span className="text-sm text-gray-600">AI驱动的无人机故障诊断平台</span>
          </div>

          {/* Headline */}
          <h1 className="text-5xl md:text-6xl font-bold text-black mb-6 leading-tight">
            无人机故障<br /><span className="text-[#FF6B00]">智能诊断</span>
          </h1>

          <p className="text-xl text-gray-600 mb-12 max-w-2xl mx-auto">
            三步完成故障诊断，AI分析原因并提供详细的排查步骤
          </p>

          {/* ===== 结构化三步选择 / 等待页 ===== */}
          <div className="max-w-2xl mx-auto mb-8">
            {loading ? (
              /* 等待页 */
              <div className="bg-white rounded-2xl border border-gray-200 p-8 shadow-sm">
                <div className="text-4xl mb-4">🤖</div>
                <h3 className="text-xl font-semibold text-black mb-6">AI正在分析你的故障...</h3>

                {/* 进度条 */}
                <div className="w-full bg-gray-100 rounded-full h-3 mb-4 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#FF6B00] to-[#FF8533] rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="text-sm text-gray-500 mb-6">{progressText}</p>

                {/* 小知识 */}
                <div className="bg-gray-50 rounded-xl p-4 mb-6">
                  <p className="text-sm text-gray-600">
                    💡 <span className="font-medium">小知识：</span>{currentTip}
                  </p>
                </div>

                {/* 总诊断次数 */}
                {totalDiagnoses !== null && (
                  <p className="text-sm text-gray-400">
                    已完成 {totalDiagnoses.toLocaleString()} 次故障诊断
                  </p>
                )}
              </div>
            ) : (
              /* 三步选择 */
              <div className="bg-white rounded-2xl border border-gray-200 p-8 shadow-sm text-left">
                {/* 步骤指示器 */}
                <div className="flex items-center justify-center gap-2 mb-8">
                  {[1, 2, 3].map(s => (
                    <div key={s} className="flex items-center gap-2">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                        s <= step ? 'bg-[#FF6B00] text-white' : 'bg-gray-100 text-gray-400'
                      }`}>
                        {s < step ? '✓' : s}
                      </div>
                      {s < 3 && <div className={`w-12 h-0.5 ${s < step ? 'bg-[#FF6B00]' : 'bg-gray-200'}`} />}
                    </div>
                  ))}
                </div>

                {/* 第1步：选机型 */}
                {step === 1 && (
                  <div>
                    <h3 className="text-lg font-semibold text-black mb-1">选择你的无人机机型</h3>
                    <p className="text-sm text-gray-500 mb-6">选择最接近的系列</p>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {DEVICE_TYPES.map(device => (
                        <button
                          key={device.id}
                          onClick={() => handleSelectDevice(device)}
                          className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-gray-200 hover:border-[#FF6B00] hover:bg-orange-50 transition-all group"
                        >
                          <span className="text-2xl group-hover:scale-110 transition-transform">{device.icon}</span>
                          <span className="text-sm font-medium text-gray-700 group-hover:text-[#FF6B00]">{device.label}</span>
                        </button>
                      ))}
                    </div>

                    {/* "其他机型"选中后：填具体型号（与"其他故障"一致） */}
                    {selectedDevice?.id === 'other' && (
                      <div className="mt-4">
                        <input
                          type="text"
                          value={customDevice}
                          onChange={(e) => setCustomDevice(e.target.value)}
                          placeholder="请输入你的无人机型号，例如：DJI NEO 2、FPV、道通 EVO Lite、FIMI..."
                          className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#FF6B00] transition-colors"
                          autoFocus
                        />
                        <button
                          onClick={() => customDevice.trim() && setStep(2)}
                          disabled={!customDevice.trim()}
                          className="mt-3 w-full py-3 bg-[#FF6B00] text-white rounded-xl font-medium hover:bg-[#FF8533] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          下一步
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* 第2步：选故障类型 */}
                {step === 2 && (
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <button onClick={() => setStep(1)} className="text-sm text-gray-400 hover:text-[#FF6B00]">← 换机型</button>
                    </div>
                    <h3 className="text-lg font-semibold text-black mb-1">选择故障类型</h3>
                    <p className="text-sm text-gray-500 mb-6">已选：{selectedDevice?.icon} {selectedDevice?.label}{selectedDevice?.id === 'other' && customDevice ? `（${customDevice}）` : ''}</p>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {FAULT_TYPES.map(fault => (
                        <button
                          key={fault.id}
                          onClick={() => handleSelectFault(fault)}
                          className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all group ${
                            selectedFault?.id === fault.id
                              ? 'border-[#FF6B00] bg-orange-50'
                              : 'border-gray-200 hover:border-[#FF6B00] hover:bg-orange-50'
                          }`}
                        >
                          <span className="text-2xl group-hover:scale-110 transition-transform">{fault.icon}</span>
                          <span className="text-sm font-medium text-gray-700 group-hover:text-[#FF6B00]">{fault.label}</span>
                        </button>
                      ))}
                    </div>

                    {/* "其他故障"选中后显示自定义输入 */}
                    {selectedFault?.id === 'other' && (
                      <div className="mt-4">
                        <input
                          type="text"
                          value={customFault}
                          onChange={(e) => setCustomFault(e.target.value)}
                          placeholder="请描述你的故障现象..."
                          className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#FF6B00] transition-colors"
                          autoFocus
                        />
                        <button
                          onClick={() => customFault.trim() && setStep(3)}
                          disabled={!customFault.trim()}
                          className="mt-3 w-full py-3 bg-[#FF6B00] text-white rounded-xl font-medium hover:bg-[#FF8533] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          下一步
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* 第3步：补充描述 + 开始诊断 */}
                {step === 3 && (
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <button onClick={() => setStep(2)} className="text-sm text-gray-400 hover:text-[#FF6B00] ← 换故障类型">← 换故障类型</button>
                    </div>
                    <h3 className="text-lg font-semibold text-black mb-1">补充描述（选填）</h3>
                    <p className="text-sm text-gray-500 mb-4">
                      已选：{selectedDevice?.icon} {selectedDevice?.label}{selectedDevice?.id === 'other' && customDevice ? `（${customDevice}）` : ''} → {selectedFault?.icon} {selectedFault?.id === 'other' ? customFault : selectedFault?.label}
                    </p>
                    <textarea
                      value={extraDescription}
                      onChange={(e) => setExtraDescription(e.target.value)}
                      placeholder="例如：飞行时突然发生、已尝试重启、出现过多次..."
                      rows={3}
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#FF6B00] transition-colors resize-none mb-4"
                    />
                    <button
                      onClick={handleSubmitDiagnosis}
                      className="w-full py-4 bg-black text-white rounded-xl text-lg font-medium hover:bg-[#FF6B00] transition-colors"
                    >
                      开始诊断
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 其他诊断模式入口 */}
          {!loading && (
            <div className="flex items-center justify-center gap-4 mb-8 flex-wrap">
              <Link
                to="/agent"
                onClick={(e) => { if (!requireFeatureAccess()) e.preventDefault() }}
                className="px-6 py-3 bg-gradient-to-r from-cyan-600 to-teal-500 text-white rounded-lg text-sm font-medium hover:from-cyan-700 hover:to-teal-600 transition-all flex items-center gap-2"
              >
                <span>🚁</span> 智能对话（新）
              </Link>
              {/* 交互式诊断入口已隐藏（2026-07-07）：决策树是 /agent 的 RAG 骨架，不作前台流程；
                  用户只见 /agent，不见树。后端代码保留，需恢复时取消此注释即可。
              <button
                onClick={() => { if (requireFeatureAccess()) navigate('/guide?mode=interactive') }}
                className="px-6 py-3 bg-[#FF6B00] text-white rounded-lg text-sm font-medium hover:bg-orange-600 transition-colors"
              >
                交互式诊断（推荐）
              </button>
              */}
              <button
                onClick={() => { if (requireFeatureAccess()) navigate('/image-diagnosis') }}
                className="px-6 py-3 border-2 border-[#FF6B00] text-[#FF6B00] rounded-lg text-sm font-medium hover:bg-orange-50 transition-colors"
              >
                📷 图片识别
              </button>
              <button
                onClick={() => { if (requireFeatureAccess()) navigate('/flight-log') }}
                className="px-6 py-3 border-2 border-gray-900 text-gray-900 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                飞行日志解析
              </button>
            </div>
          )}

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 max-w-3xl mx-auto">
            {(platformStats || []).map((stat, index) => (
              <div key={index} className="text-center">
                <div className="text-3xl font-bold text-black mb-1">{stat.number}</div>
                <div className="text-sm text-gray-500">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 px-6 bg-gray-50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-black mb-4">核心功能</h2>
            <p className="text-gray-600">专业的无人机维修诊断解决方案</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <div key={index} className="bg-white p-8 rounded-xl border border-gray-100 hover:border-gray-200 transition-colors">
                <div className="text-4xl mb-4">{feature.icon}</div>
                <h3 className="text-xl font-semibold text-black mb-2">{feature.title}</h3>
                <p className="text-gray-600">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-black mb-4">如何使用</h2>
            <p className="text-gray-600">三步完成故障诊断</p>
          </div>
          <div className="grid md:grid-cols-3 gap-12">
            {[
              { step: '01', title: '选择机型', desc: '选择你的无人机系列和故障类型' },
              { step: '02', title: 'AI分析', desc: '智能匹配故障案例库，深度推理' },
              { step: '03', title: '获取方案', desc: '详细的排查步骤和解决方案' }
            ].map((item, index) => (
              <div key={index} className="text-center">
                <div className="text-6xl font-bold text-gray-100 mb-4">{item.step}</div>
                <h3 className="text-xl font-semibold text-black mb-2">{item.title}</h3>
                <p className="text-gray-600">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Free trial validation section */}
      <section id="trial" className="py-20 px-6 bg-gray-50">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-black mb-4">使用方式</h2>
            <p className="text-gray-600">当前免费开放，用真实体验判断大家是否需要这个工具</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 p-8 md:p-12 text-center">
            <div className="text-5xl mb-4">🎫</div>
            <h3 className="text-2xl font-bold text-black mb-3">3天免费体验</h3>
            <p className="text-gray-600 mb-8 max-w-md mx-auto">
              添加我的微信，说明你遇到的无人机问题。我会免费发放兑换券，无需注册账号，激活后可使用全部诊断功能 3 天。
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-2xl mx-auto mb-8">
              <div className="bg-gray-50 rounded-xl p-4">
                <div className="font-bold text-black">① 添加微信</div>
                <div className="text-xs text-gray-500 mt-1">说明你的体验需求</div>
              </div>
              <div className="bg-gray-50 rounded-xl p-4">
                <div className="font-bold text-black">② 免费领取</div>
                <div className="text-xs text-gray-500 mt-1">直接获取免费兑换券</div>
              </div>
              <div className="bg-gray-50 rounded-xl p-4">
                <div className="font-bold text-black">③ 体验3天</div>
                <div className="text-xs text-gray-500 mt-1">解锁全部诊断功能</div>
              </div>
            </div>
            <div className="bg-orange-50 rounded-xl p-6 mb-6">
              <p className="text-sm text-gray-700 mb-4">扫码加我微信，免费体验3天</p>
              <WeChatQR size="md" />
            </div>
            {!accessStatus?.allowed && !accessStatus?.isAdmin && (
              <button
                onClick={() => setShowCouponModal(true)}
                className="px-8 py-3 bg-[#FF6B00] text-white rounded-lg font-medium hover:bg-[#FF8533] transition-colors"
              >
                已有体验券？立即激活
              </button>
            )}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-6 bg-black">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-white mb-4">开始使用 DroneDoctor</h2>
          <p className="text-gray-400 mb-8">添加微信，免费领取3天体验</p>
          <button
            onClick={() => {
              if (accessStatus?.allowed || accessStatus?.isAdmin) {
                window.scrollTo({ top: 0, behavior: 'smooth' })
              } else {
                document.getElementById('trial')?.scrollIntoView({ behavior: 'smooth' })
              }
            }}
            className="px-8 py-4 bg-[#FF6B00] text-white rounded-lg font-medium hover:bg-[#FF8533] transition-colors"
          >
            {accessStatus?.allowed || accessStatus?.isAdmin ? '开始诊断' : '领取免费兑换券'}
          </button>
        </div>
      </section>

      {/* Footer via global layout in App.jsx */}

      {/* AI智能诊断弹窗（试点） */}
      {showAgentModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[80vh] overflow-y-auto shadow-2xl">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">🤖</span>
                  <h3 className="text-lg font-semibold">AI智能诊断</h3>
                  <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">v1.0</span>
                </div>
                <button
                  onClick={() => { setShowAgentModal(false); setAgentResult(null); setAgentQuery(""); }}
                  className="text-gray-400 hover:text-gray-600 text-xl"
                >
                  ✕
                </button>
              </div>

              <p className="text-sm text-gray-500 mb-4">
                用自然语言描述你的故障，AI从知识库中查找相关资料并给出诊断建议。
              </p>

              {!agentResult ? (
                <div>
                  <textarea
                    value={agentQuery}
                    onChange={(e) => setAgentQuery(e.target.value)}
                    placeholder="例如：Mavic 3电池充不进去电，充电器指示灯不亮"
                    rows={4}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-purple-500 transition-colors resize-none mb-4"
                  />
                  <button
                    onClick={handleAgentDiagnose}
                    disabled={agentLoading || !agentQuery.trim()}
                    className="w-full py-3 bg-purple-600 text-white rounded-xl font-medium hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {agentLoading ? (
                      <>
                        <span className="animate-spin">⏳</span> 分析中...
                      </>
                    ) : (
                      <>开始智能诊断</>
                    )}
                  </button>
                </div>
              ) : (
                <div>
                  <div className="bg-gray-50 rounded-xl p-4 mb-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm font-medium">
                        {agentResult.canDiagnose ? "✅ 可以诊断" : "❓ 需要更多信息"}
                      </span>
                      <span className="text-xs text-gray-400">
                        置信度: {Math.round(agentResult.confidence * 100)}%
                      </span>
                    </div>
                    <div className="text-sm text-gray-700 whitespace-pre-line">
                      {agentResult.answer}
                    </div>
                  </div>

                  {agentResult.suggestedActions && agentResult.suggestedActions.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-4">
                      {agentResult.suggestedActions.map((action, i) => (
                        <button
                          key={i}
                          onClick={() => {
                            if (action.type === "start_tree" && action.payload?.treeId) {
                              navigate("/guide/" + action.payload.treeId);
                              setShowAgentModal(false);
                            }
                          }}
                          className="px-4 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 transition-colors"
                        >
                          {action.label}
                        </button>
                      ))}
                    </div>
                  )}

                  {agentResult.relatedCases && agentResult.relatedCases.length > 0 && (
                    <div className="mb-4">
                      <p className="text-sm font-medium text-gray-600 mb-2">相关案例:</p>
                      <div className="flex flex-wrap gap-2">
                        {agentResult.relatedCases.map((c) => (
                          <span key={c.caseId} className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                            {c.title} ({c.caseId})
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <button
                    onClick={() => setAgentResult(null)}
                    className="w-full py-3 border-2 border-gray-200 text-gray-600 rounded-xl font-medium hover:border-purple-500 hover:text-purple-600 transition-colors"
                  >
                    重新描述
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 券码激活弹窗 */}
      {showCouponModal && (
        <CouponModal
          onClose={() => setShowCouponModal(false)}
          onActivated={() => {
            setShowCouponModal(false)
            refreshFreeUsage()
            // 重新获取体验状态
            apiClient.get('/api/stats/free-usage').then(res => {
              setAccessStatus(res.data)
            }).catch(() => {})
          }}
        />
      )}

    </div>
  )
}

export default HomePage
