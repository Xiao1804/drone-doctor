import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { apiUrl } from '../config/api'
import { showToast } from '../components/Toast'
import { clearLocalUsageCache } from '../utils/freeUsage'

function AuthPage() {
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    username: '',
    password: ''
  })
  const navigate = useNavigate()

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      const response = await axios.post(apiUrl('/api/user/login'), {
        usernameOrEmail: formData.username.trim(),
        password: formData.password
      })

      if (response.data.user?.role !== 'admin') {
        throw new Error('仅管理员可登录')
      }

      localStorage.setItem('token', response.data.token)
      localStorage.setItem('user', JSON.stringify(response.data.user))
      clearLocalUsageCache()

      showToast('管理员登录成功', 'success')
      navigate('/admin/coupons')
    } catch (error) {
      console.error('Login error:', error)
      showToast(error.response?.data?.error || '登录失败', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-[#FF6B00] rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-bold text-2xl">D</span>
          </div>
          <h1 className="text-2xl font-bold">DroneDoctor</h1>
          <p className="text-gray-600 mt-2">内部管理后台</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="border-b border-gray-200 px-6 py-4">
            <h2 className="font-semibold text-gray-900">管理员登录</h2>
            <p className="text-sm text-gray-500 mt-1">普通体验用户无需账号，请在首页输入兑换券</p>
          </div>

          <form onSubmit={handleLogin} className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                管理员用户名或邮箱
              </label>
              <input
                type="text"
                name="username"
                value={formData.username}
                onChange={handleChange}
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:border-[#FF6B00]"
                placeholder="请输入用户名或邮箱"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                密码
              </label>
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:border-[#FF6B00]"
                placeholder="请输入密码"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-[#FF6B00] text-white rounded-lg font-medium hover:bg-orange-600 transition-colors disabled:opacity-50"
            >
                {loading ? '登录中...' : '进入后台'}
            </button>

            <div className="text-center">
              <button
                type="button"
                onClick={() => navigate('/')}
                className="text-sm text-gray-600 hover:text-gray-900"
              >
                返回免费体验首页
              </button>
            </div>
          </form>
        </div>

        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="font-medium text-blue-900 mb-2">入口说明</h3>
          <p className="text-sm text-blue-700">
            本页面仅供管理员生成兑换券、查看市场验证指标和处理用户反馈。
          </p>
        </div>
      </div>
    </div>
  )
}

export default AuthPage
