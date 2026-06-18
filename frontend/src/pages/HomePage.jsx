import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { apiUrl } from '../config/api'
import DiagnosisCounter, { incrementDiagnosisCount, refreshFreeUsage } from '../components/DiagnosisCounter'
import { checkFreeUsageBeforeDiagnosis, isFreeLimitError, getFreeLimitMessage } from '../utils/freeUsage'
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

  // 等待页状态
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressText, setProgressText] = useState('')
  const [currentTip, setCurrentTip] = useState(TIPS[0])
  const [totalDiagnoses, setTotalDiagnoses] = useState(null)

  const [user, setUser] = useState(null)
  const navigate = useNavigate()

  // 智能体诊断状态（试点）
  const [showAgentModal, setShowAgentModal] = useState(false)
  const [agentQuery, setAgentQuery] = useState('')
  const [agentLoading, setAgentLoading] = useState(false)
  const [agentResult, setAgentResult] = useState(null)

  // 付费墙弹窗
  const [showPaywall, setShowPaywall] = useState(false)

  // 会员状态
  const [membership, setMembership] = useState(null)
  const [showCouponModal, setShowCouponModal] = useState(false)

  useEffect(() => {
    const userData = localStorage.getItem('user')
    if (userData) {
      setUser(JSON.parse(userData))
    }
    // 获取总诊断次数
    axios.get(apiUrl('/api/stats/total-diagnoses')).then(res => {
      setTotalDiagnoses(res.data.total)
    }).catch(() => {})

    // 获取会员状态
    apiClient.get('/api/stats/free-usage').then(res => {
      setMembership(res.data)
    }).catch(() => {
      setMembership({ isMember: false, isAdmin: false })
    })
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
    const faultText = selectedFault?.id === 'other'
      ? customFault
      : selectedFault?.label || ''

    const symptom = `${selectedDevice?.label || ''} ${faultText} ${extraDescription}`.trim()
    if (!symptom) return

    // 会员检查
    const usageState = await checkFreeUsageBeforeDiagnosis()
    if (!usageState.allowed) {
      refreshFreeUsage()
      // 未登录 -> 登录页；已登录无会员 -> 券码弹窗
      if (!localStorage.getItem('token')) {
        navigate('/auth')
      } else {
        setShowCouponModal(true)
      }
      return
    }

    // 埋点
    trackDiagnosisStart({
      source: 'hero',
      deviceType: selectedDevice?.id || '',
      faultType: selectedFault?.id || '',
      remainingFree: usageState.remaining
    })

    setLoading(true)
    const startTime = Date.now()

    try {
      // v2.0: 调用统一诊断API (quick模式)
      const response = await axios.post(apiUrl('/api/diagnosis/unified'), {
        mode: 'quick',
        input: symptom,
        deviceType: selectedDevice?.id,
        faultType: selectedFault?.id
      })

      setProgress(100)
      setProgressText('诊断完成！')

      // 增加次数
      incrementDiagnosisCount()
      refreshFreeUsage()

      // 短暂停留让用户看到100%
      setTimeout(() => {
        const result = response.data
        if (!result.fallback && result.matchedTree) {
          // 高置信度匹配：跳转到决策树预览模式
          navigate(`/guide/${result.matchedTree.id}?mode=preview`, {
            state: {
              unifiedResult: result,
              durationMs: Date.now() - startTime,
              deviceType: selectedDevice?.id,
              faultType: selectedFault?.id
            }
          })
        } else {
          // 低置信度/无匹配：跳转到维修助手菜单，带提示
          navigate('/guide', {
            state: {
              noMatch: true,
              input: symptom,
              intent: result.intent
            }
          })
        }
      }, 500)
    } catch (error) {
      console.error('Diagnosis error:', error)
      if (error?.response?.status === 403 && error?.response?.data?.error === 'MEMBERSHIP_REQUIRED') {
        refreshFreeUsage()
        setShowCouponModal(true)
      } else if (error?.response?.status === 401 || error?.response?.data?.error === 'AUTH_REQUIRED') {
        navigate('/auth')
      } else {
        showToast('诊断失败，请稍后重试', 'error')
      }
      setLoading(false)
    }
  }

  // 智能体诊断（试点）
  const handleAgentDiagnose = async () => {
    if (!agentQuery.trim()) return

    // 会员检查
    const usageState = await checkFreeUsageBeforeDiagnosis()
    if (!usageState.allowed) {
      refreshFreeUsage()
      if (!localStorage.getItem('token')) {
        navigate('/auth')
      } else {
        setShowCouponModal(true)
      }
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
      if (error?.response?.status === 403 && error?.response?.data?.error === 'MEMBERSHIP_REQUIRED') {
        refreshFreeUsage()
        setShowCouponModal(true)
      } else if (error?.response?.status === 401 || error?.response?.data?.error === 'AUTH_REQUIRED') {
        navigate('/auth')
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
        { number: d.totalUsers > 0 ? d.totalUsers.toLocaleString() + '+' : '—', label: '用户数' },
        { number: 'AI辅助', label: '智能诊断' },
      ])
    }).catch(() => {
      // fallback：只显示案例数（可验证的真实数据）
      setPlatformStats([
        { number: '—', label: '诊断次数' },
        { number: '129条', label: '故障案例' },
        { number: '—', label: '用户数' },
        { number: 'AI辅助', label: '智能诊断' },
      ])
    })
  }, [])

  const features = [
    { icon: '🔍', title: '智能诊断', description: 'AI分析故障原因，提供精准排查步骤' },
    { icon: '📖', title: '知识库', description: '覆盖主流机型，持续更新的维修案例' },
    { icon: '🎓', title: '考证指南', description: 'CAAC考证全流程指导，题库练习' }
  ]

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
            <a href="#pricing" className="text-sm text-gray-600 hover:text-black transition-colors">定价</a>
            <button onClick={() => navigate('/history')} className="text-sm text-gray-600 hover:text-black transition-colors">历史记录</button>
            <button onClick={() => navigate('/guide')} className="px-4 py-2 bg-[#FF6B00] text-white text-sm rounded-lg hover:bg-black transition-colors">维修助手</button>
            {user ? (
              <button onClick={() => navigate('/profile')} className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg hover:border-black transition-colors">
                <div className="w-6 h-6 bg-[#FF6B00] rounded-full flex items-center justify-center">
                  <span className="text-white text-xs font-bold">{user.username?.charAt(0).toUpperCase()}</span>
                </div>
                <span className="text-sm">{user.username}</span>
              </button>
            ) : (
              <button onClick={() => navigate('/auth')} className="px-4 py-2 bg-black text-white text-sm rounded-lg hover:bg-[#FF6B00] transition-colors">登录 / 注册</button>
            )}
          </div>
        </div>
      </nav>

      {/* 全局次数指示器 */}
      <DiagnosisCounter showUpgradeHint={!loading && step === 3} />

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
                  </div>
                )}

                {/* 第2步：选故障类型 */}
                {step === 2 && (
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <button onClick={() => setStep(1)} className="text-sm text-gray-400 hover:text-[#FF6B00]">← 换机型</button>
                    </div>
                    <h3 className="text-lg font-semibold text-black mb-1">选择故障类型</h3>
                    <p className="text-sm text-gray-500 mb-6">已选：{selectedDevice?.icon} {selectedDevice?.label}</p>
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
                      已选：{selectedDevice?.icon} {selectedDevice?.label} → {selectedFault?.icon} {selectedFault?.id === 'other' ? customFault : selectedFault?.label}
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
              <button
                onClick={() => setShowAgentModal(true)}
                className="px-6 py-3 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors flex items-center gap-2"
              >
                <span>🤖</span> AI智能诊断
              </button>
              <button
                onClick={() => navigate('/guide?mode=interactive')}
                className="px-6 py-3 bg-[#FF6B00] text-white rounded-lg text-sm font-medium hover:bg-orange-600 transition-colors"
              >
                交互式诊断（推荐）
              </button>
              <button
                onClick={() => navigate('/image-diagnosis')}
                className="px-6 py-3 border-2 border-[#FF6B00] text-[#FF6B00] rounded-lg text-sm font-medium hover:bg-orange-50 transition-colors"
              >
                📷 图片识别
              </button>
              <button
                onClick={() => navigate('/flight-log')}
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

      {/* Pricing Section */}
      <section id="pricing" className="py-20 px-6 bg-gray-50">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-black mb-4">使用方式</h2>
            <p className="text-gray-600">券码激活，即享全部诊断功能</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 p-8 md:p-12 text-center">
            <div className="text-5xl mb-4">🎫</div>
            <h3 className="text-2xl font-bold text-black mb-3">券码会员制</h3>
            <p className="text-gray-600 mb-8 max-w-md mx-auto">
              通过券码激活会员时长，解锁全部诊断功能。可选 1天 / 3天 / 7天 / 30天 / 90天 / 180天 / 1年。
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-2xl mx-auto mb-8">
              {[
                { days: '1天', desc: '体验试用' },
                { days: '7天', desc: '短期使用' },
                { days: '30天', desc: '月度使用' },
                { days: '1年', desc: '长期使用' },
              ].map(item => (
                <div key={item.days} className="bg-gray-50 rounded-xl p-3">
                  <div className="font-bold text-black">{item.days}</div>
                  <div className="text-xs text-gray-500">{item.desc}</div>
                </div>
              ))}
            </div>
            <div className="bg-orange-50 rounded-xl p-6 mb-6">
              <p className="text-sm text-gray-700 mb-4">扫码加微信，获取体验券码</p>
              <WeChatQR size="md" />
            </div>
            {localStorage.getItem('token') && membership && !membership.isMember && !membership.isAdmin && (
              <button
                onClick={() => setShowCouponModal(true)}
                className="px-8 py-3 bg-[#FF6B00] text-white rounded-lg font-medium hover:bg-[#FF8533] transition-colors"
              >
                输入券码
              </button>
            )}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-6 bg-black">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-white mb-4">开始使用 DroneDoctor</h2>
          <p className="text-gray-400 mb-8">专业的无人机故障诊断，券码激活即用</p>
          <button
            onClick={() => {
              if (localStorage.getItem('token') && membership?.isMember) {
                window.scrollTo({ top: 0, behavior: 'smooth' })
              } else if (localStorage.getItem('token')) {
                setShowCouponModal(true)
              } else {
                navigate('/auth')
              }
            }}
            className="px-8 py-4 bg-[#FF6B00] text-white rounded-lg font-medium hover:bg-[#FF8533] transition-colors"
          >
            {membership?.isMember || membership?.isAdmin ? '开始诊断' : '激活券码'}
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 border-t border-gray-100 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-[#FF6B00] rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">D</span>
              </div>
              <span className="font-semibold">DroneDoctor</span>
            </div>
            <WeChatQR size="sm" />
            <button
              onClick={() => navigate('/compliance')}
              className="text-sm text-gray-500 underline decoration-gray-300 underline-offset-4 hover:text-[#FF6B00]"
            >
              合规与使用说明
            </button>
            <div className="text-sm text-gray-500">© 2026 DroneDoctor. All rights reserved.</div>
          </div>
        </div>
      </footer>

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

      {/* 免费次数用完弹窗 */}
      {showPaywall && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl p-8 text-center">
            <div className="text-5xl mb-4">🎫</div>
            <h3 className="text-xl font-bold text-black mb-2">需要激活券码</h3>
            <p className="text-gray-600 mb-6">输入券码激活会员，即可使用诊断功能</p>
            <div className="space-y-3">
              <button
                onClick={() => {
                  setShowPaywall(false)
                  setShowCouponModal(true)
                }}
                className="w-full py-3 bg-[#FF6B00] text-white rounded-xl font-medium hover:bg-[#FF8533] transition-colors"
              >
                输入券码
              </button>
              <button
                onClick={() => {
                  setShowPaywall(false)
                  navigate('/#pricing')
                  setTimeout(() => {
                    document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' })
                  }, 100)
                }}
                className="w-full py-3 border-2 border-gray-200 rounded-xl font-medium hover:border-black transition-colors"
              >
                获取券码
              </button>
              <button
                onClick={() => setShowPaywall(false)}
                className="w-full py-3 text-gray-500 text-sm hover:text-gray-700 transition-colors"
              >
                暂时不用
              </button>
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
            // 重新获取会员状态
            apiClient.get('/api/stats/free-usage').then(res => {
              setMembership(res.data)
            }).catch(() => {})
          }}
        />
      )}

    </div>
  )
}

export default HomePage
