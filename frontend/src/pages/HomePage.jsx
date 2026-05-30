import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { apiUrl } from '../config/api'
import DiagnosisCounter, { getRemainingCount, incrementDiagnosisCount } from '../components/DiagnosisCounter'
import { trackDiagnosisStart } from '../utils/tracking'

// 机型选项
const DEVICE_OPTIONS = [
  { id: 'mavic', label: 'Mavic 系列', icon: '✈️' },
  { id: 'air', label: 'Air 系列', icon: '🛫' },
  { id: 'mini', label: 'Mini 系列', icon: '🛩️' },
  { id: 'phantom', label: 'Phantom 系列', icon: '🚁' },
  { id: 't30', label: 'T30/T40（植保）', icon: '🌾' },
  { id: 'other', label: '其他机型', icon: '📡' }
]

// 故障类型选项
const FAULT_OPTIONS = [
  { id: 'power', label: '无法起飞', icon: '🚫' },
  { id: 'video', label: '图传异常', icon: '📺' },
  { id: 'gimbal', label: '云台故障', icon: '🔄' },
  { id: 'battery', label: '电池问题', icon: '🔋' },
  { id: 'gps', label: 'GPS 信号异常', icon: '📡' },
  { id: 'other', label: '其他故障', icon: '❓' }
]

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

  useEffect(() => {
    const userData = localStorage.getItem('user')
    if (userData) {
      setUser(JSON.parse(userData))
    }
    // 获取总诊断次数
    axios.get(apiUrl('/api/stats/total-diagnoses')).then(res => {
      setTotalDiagnoses(res.data.total)
    }).catch(() => {})
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
    const remaining = getRemainingCount()
    if (remaining <= 0) {
      alert('今日免费诊断次数已用完，明天再来！')
      return
    }

    const faultText = selectedFault?.id === 'other'
      ? customFault
      : selectedFault?.label || ''

    const symptom = `${selectedDevice?.label || ''} ${faultText} ${extraDescription}`.trim()
    if (!symptom) return

    // 埋点
    trackDiagnosisStart({
      source: 'hero',
      deviceType: selectedDevice?.id || '',
      faultType: selectedFault?.id || '',
      remainingFree: remaining
    })

    setLoading(true)
    const startTime = Date.now()

    try {
      const response = await axios.post(apiUrl('/api/diagnosis'), {
        symptom,
        deviceType: selectedDevice?.id,
        faultType: selectedFault?.id
      })

      setProgress(100)
      setProgressText('诊断完成！')

      // 增加次数
      incrementDiagnosisCount()

      // 短暂停留让用户看到100%
      setTimeout(() => {
        navigate('/diagnosis', {
          state: {
            result: response.data,
            durationMs: Date.now() - startTime,
            deviceType: selectedDevice?.id,
            faultType: selectedFault?.id
          }
        })
      }, 500)
    } catch (error) {
      console.error('Diagnosis error:', error)
      alert('诊断失败，请稍后重试')
      setLoading(false)
    }
  }

  const stats = [
    { number: '50,000+', label: '诊断次数' },
    { number: '92%', label: '准确率' },
    { number: '10,000+', label: '用户数' },
    { number: '100+', label: '故障案例' }
  ]

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
                      {DEVICE_OPTIONS.map(device => (
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
                      {FAULT_OPTIONS.map(fault => (
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
            <div className="flex items-center justify-center gap-4 mb-8">
              <button
                onClick={() => navigate('/conversation')}
                className="px-6 py-3 bg-[#FF6B00] text-white rounded-lg text-sm font-medium hover:bg-orange-600 transition-colors"
              >
                对话诊断（推荐）
              </button>
              <button
                onClick={() => navigate('/image-diagnosis')}
                className="px-6 py-3 border-2 border-[#FF6B00] text-[#FF6B00] rounded-lg text-sm font-medium hover:bg-orange-50 transition-colors"
              >
                📷 图片识别
              </button>
            </div>
          )}

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 max-w-3xl mx-auto">
            {stats.map((stat, index) => (
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
            <h2 className="text-3xl font-bold text-black mb-4">定价方案</h2>
            <p className="text-gray-600">选择适合你的方案</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="bg-white p-8 rounded-xl border border-gray-200">
              <div className="text-sm text-gray-500 mb-2">免费版</div>
              <div className="text-4xl font-bold text-black mb-1">¥0</div>
              <div className="text-sm text-gray-500 mb-6">永久免费</div>
              <ul className="space-y-3 mb-8">
                <li className="flex items-center gap-2 text-sm text-gray-600"><span className="text-[#FF6B00]">✓</span> 每日3次诊断</li>
                <li className="flex items-center gap-2 text-sm text-gray-600"><span className="text-[#FF6B00]">✓</span> 部分知识库</li>
                <li className="flex items-center gap-2 text-sm text-gray-600"><span className="text-[#FF6B00]">✓</span> 基础题库</li>
              </ul>
              <button className="w-full py-3 border-2 border-gray-200 rounded-lg text-sm font-medium hover:border-black transition-colors">开始使用</button>
            </div>
            <div className="bg-black p-8 rounded-xl text-white relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-[#FF6B00] text-white text-xs rounded-full">最受欢迎</div>
              <div className="text-sm text-gray-400 mb-2">月度会员</div>
              <div className="text-4xl font-bold mb-1">¥39<span className="text-lg font-normal">/月</span></div>
              <div className="text-sm text-gray-400 mb-6">按月付费</div>
              <ul className="space-y-3 mb-8">
                <li className="flex items-center gap-2 text-sm"><span className="text-[#FF6B00]">✓</span> 无限诊断</li>
                <li className="flex items-center gap-2 text-sm"><span className="text-[#FF6B00]">✓</span> 完整知识库</li>
                <li className="flex items-center gap-2 text-sm"><span className="text-[#FF6B00]">✓</span> 完整题库</li>
                <li className="flex items-center gap-2 text-sm"><span className="text-[#FF6B00]">✓</span> 优先客服</li>
              </ul>
              <button className="w-full py-3 bg-[#FF6B00] rounded-lg text-sm font-medium hover:bg-[#FF8533] transition-colors">立即订阅</button>
            </div>
            <div className="bg-white p-8 rounded-xl border border-gray-200">
              <div className="text-sm text-gray-500 mb-2">年度会员</div>
              <div className="text-4xl font-bold text-black mb-1">¥299<span className="text-lg font-normal text-gray-500">/年</span></div>
              <div className="text-sm text-[#FF6B00] mb-6">省¥169</div>
              <ul className="space-y-3 mb-8">
                <li className="flex items-center gap-2 text-sm text-gray-600"><span className="text-[#FF6B00]">✓</span> 月度会员全部权益</li>
                <li className="flex items-center gap-2 text-sm text-gray-600"><span className="text-[#FF6B00]">✓</span> 飞行日志解析</li>
                <li className="flex items-center gap-2 text-sm text-gray-600"><span className="text-[#FF6B00]">✓</span> 专属社群</li>
                <li className="flex items-center gap-2 text-sm text-gray-600"><span className="text-[#FF6B00]">✓</span> 1对1技术支持</li>
              </ul>
              <button className="w-full py-3 border-2 border-black rounded-lg text-sm font-medium hover:bg-black hover:text-white transition-colors">立即订阅</button>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-6 bg-black">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-white mb-4">开始使用 DroneDoctor</h2>
          <p className="text-gray-400 mb-8">专业的无人机故障诊断，从这里开始</p>
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="px-8 py-4 bg-[#FF6B00] text-white rounded-lg font-medium hover:bg-[#FF8533] transition-colors"
          >
            免费开始诊断
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 border-t border-gray-100">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-[#FF6B00] rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">D</span>
              </div>
              <span className="font-semibold">DroneDoctor</span>
            </div>
            <div className="text-sm text-gray-500">© 2026 DroneDoctor. All rights reserved.</div>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default HomePage
