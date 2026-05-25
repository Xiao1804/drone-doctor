import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { apiUrl } from '../config/api'

function HomePage() {
  const [symptom, setSymptom] = useState('')
  const [loading, setLoading] = useState(false)
  const [user, setUser] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    const userData = localStorage.getItem('user')
    if (userData) {
      setUser(JSON.parse(userData))
    }
  }, [])

  const handleDiagnose = async (e) => {
    e.preventDefault()
    if (!symptom.trim()) return

    setLoading(true)
    try {
      const response = await axios.post(apiUrl('/api/diagnosis'), {
        symptom: symptom
      })
      
      navigate('/diagnosis', { state: { result: response.data } })
    } catch (error) {
      console.error('Diagnosis error:', error)
      alert('诊断失败，请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  const popularTags = [
    '无法起飞',
    'GPS信号弱',
    '电机不转',
    '图传黑屏',
    '云台卡住'
  ]

  const stats = [
    { number: '50,000+', label: '诊断次数' },
    { number: '92%', label: '准确率' },
    { number: '10,000+', label: '用户数' },
    { number: '100+', label: '故障案例' }
  ]

  const features = [
    {
      icon: '🔍',
      title: '智能诊断',
      description: 'AI分析故障原因，提供精准排查步骤'
    },
    {
      icon: '📖',
      title: '知识库',
      description: '覆盖主流机型，持续更新的维修案例'
    },
    {
      icon: '🎓',
      title: '考证指南',
      description: 'CAAC考证全流程指导，题库练习'
    }
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
            <button 
              onClick={() => navigate('/history')}
              className="text-sm text-gray-600 hover:text-black transition-colors"
            >
              历史记录
            </button>
            {user ? (
              <div className="flex items-center gap-3">
                <button
                  onClick={() => navigate('/profile')}
                  className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg hover:border-black transition-colors"
                >
                  <div className="w-6 h-6 bg-[#FF6B00] rounded-full flex items-center justify-center">
                    <span className="text-white text-xs font-bold">{user.username?.charAt(0).toUpperCase()}</span>
                  </div>
                  <span className="text-sm">{user.username}</span>
                </button>
              </div>
            ) : (
              <button 
                onClick={() => navigate('/auth')}
                className="px-4 py-2 bg-black text-white text-sm rounded-lg hover:bg-[#FF6B00] transition-colors"
              >
                登录 / 注册
              </button>
            )}
          </div>
        </div>
      </nav>

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
            无人机故障
            <br />
            <span className="text-[#FF6B00]">智能诊断</span>
          </h1>

          {/* Subheadline */}
          <p className="text-xl text-gray-600 mb-12 max-w-2xl mx-auto">
            输入故障现象，AI分析原因并提供详细的排查步骤、所需工具和解决方案
          </p>

          {/* Diagnosis Form */}
          <form onSubmit={handleDiagnose} className="max-w-2xl mx-auto mb-6">
            <div className="relative">
              <input
                type="text"
                value={symptom}
                onChange={(e) => setSymptom(e.target.value)}
                placeholder="描述你的无人机故障，例如：道通EVO II无法起飞、极飞P100喷洒异常..."
                className="w-full px-6 py-4 text-lg border-2 border-gray-200 rounded-xl focus:outline-none focus:border-black transition-colors pr-32"
              />
              <button
                type="submit"
                disabled={loading}
                className="absolute right-2 top-1/2 -translate-y-1/2 px-6 py-2 bg-black text-white rounded-lg hover:bg-[#FF6B00] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? '诊断中...' : '快速诊断'}
              </button>
            </div>
          </form>

          {/* Diagnosis Mode Selection */}
          <div className="flex items-center justify-center gap-4 mb-6">
            <button
              onClick={handleDiagnose}
              disabled={loading || !symptom.trim()}
              className="px-6 py-3 border-2 border-gray-200 rounded-lg text-sm font-medium hover:border-black transition-colors disabled:opacity-50"
            >
              快速诊断（单轮）
            </button>
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

          {/* Quick Tags */}
          <div className="mb-8">
            <p className="text-sm text-gray-500 mb-3">大疆无人机常见故障：</p>
            <div className="flex flex-wrap justify-center gap-2">
              {['无法起飞', 'GPS信号弱', '电机不转', '图传黑屏', '云台卡住'].map((tag, index) => (
                <button
                  key={index}
                  onClick={() => setSymptom(tag)}
                  className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-full hover:border-black hover:text-black transition-colors"
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-16">
            <p className="text-sm text-gray-500 mb-3">其他品牌常见故障：</p>
            <div className="flex flex-wrap justify-center gap-2">
              {['道通EVO图传延迟', '极飞P100喷洒不均', '哈博森Zino续航短', '亿航载人机通信异常'].map((tag, index) => (
                <button
                  key={index}
                  onClick={() => setSymptom(tag)}
                  className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-full hover:border-[#FF6B00] hover:text-[#FF6B00] transition-colors"
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

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
              { step: '01', title: '输入故障', desc: '描述无人机故障现象' },
              { step: '02', title: 'AI分析', desc: '智能匹配故障案例库' },
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
            {/* Free */}
            <div className="bg-white p-8 rounded-xl border border-gray-200">
              <div className="text-sm text-gray-500 mb-2">免费版</div>
              <div className="text-4xl font-bold text-black mb-1">¥0</div>
              <div className="text-sm text-gray-500 mb-6">永久免费</div>
              <ul className="space-y-3 mb-8">
                <li className="flex items-center gap-2 text-sm text-gray-600">
                  <span className="text-[#FF6B00]">✓</span> 每日3次诊断
                </li>
                <li className="flex items-center gap-2 text-sm text-gray-600">
                  <span className="text-[#FF6B00]">✓</span> 部分知识库
                </li>
                <li className="flex items-center gap-2 text-sm text-gray-600">
                  <span className="text-[#FF6B00]">✓</span> 基础题库
                </li>
              </ul>
              <button className="w-full py-3 border-2 border-gray-200 rounded-lg text-sm font-medium hover:border-black transition-colors">
                开始使用
              </button>
            </div>

            {/* Monthly */}
            <div className="bg-black p-8 rounded-xl text-white relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-[#FF6B00] text-white text-xs rounded-full">
                最受欢迎
              </div>
              <div className="text-sm text-gray-400 mb-2">月度会员</div>
              <div className="text-4xl font-bold mb-1">¥39<span className="text-lg font-normal">/月</span></div>
              <div className="text-sm text-gray-400 mb-6">按月付费</div>
              <ul className="space-y-3 mb-8">
                <li className="flex items-center gap-2 text-sm">
                  <span className="text-[#FF6B00]">✓</span> 无限诊断
                </li>
                <li className="flex items-center gap-2 text-sm">
                  <span className="text-[#FF6B00]">✓</span> 完整知识库
                </li>
                <li className="flex items-center gap-2 text-sm">
                  <span className="text-[#FF6B00]">✓</span> 完整题库
                </li>
                <li className="flex items-center gap-2 text-sm">
                  <span className="text-[#FF6B00]">✓</span> 优先客服
                </li>
              </ul>
              <button className="w-full py-3 bg-[#FF6B00] rounded-lg text-sm font-medium hover:bg-[#FF8533] transition-colors">
                立即订阅
              </button>
            </div>

            {/* Annual */}
            <div className="bg-white p-8 rounded-xl border border-gray-200">
              <div className="text-sm text-gray-500 mb-2">年度会员</div>
              <div className="text-4xl font-bold text-black mb-1">¥299<span className="text-lg font-normal text-gray-500">/年</span></div>
              <div className="text-sm text-[#FF6B00] mb-6">省¥169</div>
              <ul className="space-y-3 mb-8">
                <li className="flex items-center gap-2 text-sm text-gray-600">
                  <span className="text-[#FF6B00]">✓</span> 月度会员全部权益
                </li>
                <li className="flex items-center gap-2 text-sm text-gray-600">
                  <span className="text-[#FF6B00]">✓</span> 飞行日志解析
                </li>
                <li className="flex items-center gap-2 text-sm text-gray-600">
                  <span className="text-[#FF6B00]">✓</span> 专属社群
                </li>
                <li className="flex items-center gap-2 text-sm text-gray-600">
                  <span className="text-[#FF6B00]">✓</span> 1对1技术支持
                </li>
              </ul>
              <button className="w-full py-3 border-2 border-black rounded-lg text-sm font-medium hover:bg-black hover:text-white transition-colors">
                立即订阅
              </button>
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
            <div className="text-sm text-gray-500">
              © 2026 DroneDoctor. All rights reserved.
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default HomePage
