import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { apiUrl } from '../config/api'
import { showToast } from '../components/Toast'
import { apiClient } from '../utils/apiClient'
import CouponModal from '../components/CouponModal'

function ProfilePage() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editMode, setEditMode] = useState(false)
  const [membership, setMembership] = useState(null)
  const [showCouponModal, setShowCouponModal] = useState(false)
  const [formData, setFormData] = useState({
    email: '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  })
  const navigate = useNavigate()

  useEffect(() => {
    const token = localStorage.getItem('token')
    const userData = localStorage.getItem('user')

    if (!token || !userData) {
      navigate('/auth')
      return
    }

    const parsedUser = JSON.parse(userData)
    setUser(parsedUser)
    setFormData(prev => ({ ...prev, email: parsedUser.email }))
    setLoading(false)

    // 获取会员状态
    apiClient.get('/api/coupon/membership').then(res => {
      setMembership(res.data)
    }).catch(() => {
      setMembership({ isMember: false, isAdmin: false })
    })
  }, [navigate])

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

  const handleUpdateProfile = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      const token = localStorage.getItem('token')
      const response = await axios.put(apiUrl('/api/user/me'), {
        email: formData.email
      }, {
        headers: { Authorization: `Bearer ${token}` }
      })

      localStorage.setItem('user', JSON.stringify(response.data.user))
      setUser(response.data.user)
      setEditMode(false)
      showToast('更新成功！', 'success')

    } catch (error) {
      console.error('Update error:', error)
      showToast(error.response?.data?.error || '更新失败', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleChangePassword = async (e) => {
    e.preventDefault()

    if (formData.newPassword !== formData.confirmPassword) {
      showToast('两次密码输入不一致', 'warning')
      return
    }

    if (formData.newPassword.length < 6) {
      showToast('新密码至少6个字符', 'warning')
      return
    }

    setLoading(true)

    try {
      const token = localStorage.getItem('token')
      await axios.post(apiUrl('/api/user/change-password'), {
        oldPassword: formData.currentPassword,
        newPassword: formData.newPassword
      }, {
        headers: { Authorization: `Bearer ${token}` }
      })

      showToast('密码修改成功！', 'success')
      setFormData({
        ...formData,
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      })

    } catch (error) {
      console.error('Change password error:', error)
      showToast(error.response?.data?.error || '密码修改失败', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = () => {
    if (window.confirm('确定要退出登录吗？')) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      localStorage.removeItem('dd_diagnosis_count')
      localStorage.removeItem('dd_diagnosis_date')
      navigate('/')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">加载中...</div>
      </div>
    )
  }

  const isAdmin = user?.role === 'admin' || user?.isAdmin

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
            <h1 className="text-xl font-bold">个人中心</h1>
            <div className="w-6"></div>
          </div>

          {/* User Info Card */}
          <div className="bg-white/10 backdrop-blur rounded-xl p-4 mt-4">
            <div className="flex items-center space-x-4">
              <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center">
                <span className="text-2xl font-bold">{user?.username?.charAt(0).toUpperCase()}</span>
              </div>
              <div>
                <h2 className="text-xl font-bold">{user?.username}</h2>
                <p className="text-white/80 text-sm">{user?.email}</p>
                {isAdmin && (
                  <span className="inline-block mt-1 px-2 py-0.5 bg-white/20 rounded text-xs">
                    管理员
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* 会员状态卡片 */}
        {!isAdmin && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200">
              <h3 className="font-bold text-gray-900">会员状态</h3>
            </div>
            <div className="p-4">
              {membership?.isMember ? (
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="inline-block w-2 h-2 bg-green-500 rounded-full" />
                      <span className="font-medium text-green-600">会员有效</span>
                    </div>
                    <p className="text-sm text-gray-500">
                      到期时间：{membership.expiresAt ? new Date(membership.expiresAt).toLocaleString('zh-CN') : '-'}
                    </p>
                    <p className="text-sm text-gray-500">
                      剩余天数：{membership.daysLeft} 天
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-3xl font-bold text-[#FF6B00]">{membership.daysLeft}</div>
                    <div className="text-xs text-gray-500">天</div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-2">
                  <div className="text-4xl mb-2">🎫</div>
                  <p className="text-sm text-gray-600 mb-3">暂无有效会员，激活券码后即可使用诊断功能</p>
                  <button
                    onClick={() => setShowCouponModal(true)}
                    className="px-6 py-2 bg-[#FF6B00] text-white text-sm rounded-lg font-medium hover:bg-[#FF8533] transition-colors"
                  >
                    激活券码
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Profile Section */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
            <h3 className="font-bold text-gray-900">基本信息</h3>
            <button
              onClick={() => setEditMode(!editMode)}
              className="text-sm text-[#FF6B00] hover:underline"
            >
              {editMode ? '取消' : '编辑'}
            </button>
          </div>

          {editMode ? (
            <form onSubmit={handleUpdateProfile} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  用户名
                </label>
                <input
                  type="text"
                  value={user?.username}
                  disabled
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-gray-50 text-gray-500"
                />
                <p className="text-xs text-gray-500 mt-1">用户名不可修改</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  邮箱
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:border-[#FF6B00]"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-[#FF6B00] text-white rounded-lg font-medium hover:bg-orange-600 transition-colors disabled:opacity-50"
              >
                {loading ? '保存中...' : '保存修改'}
              </button>
            </form>
          ) : (
            <div className="p-4 space-y-3">
              <div className="flex justify-between py-2">
                <span className="text-gray-600">用户名</span>
                <span className="text-gray-900 font-medium">{user?.username}</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-gray-600">邮箱</span>
                <span className="text-gray-900 font-medium">{user?.email}</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-gray-600">账号创建时间</span>
                <span className="text-gray-900 font-medium">
                  {user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : '-'}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Change Password Section */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200">
            <h3 className="font-bold text-gray-900">修改密码</h3>
          </div>

          <form onSubmit={handleChangePassword} className="p-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                当前密码
              </label>
              <input
                type="password"
                name="currentPassword"
                value={formData.currentPassword}
                onChange={handleChange}
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:border-[#FF6B00]"
                placeholder="请输入当前密码"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                新密码
              </label>
              <input
                type="password"
                name="newPassword"
                value={formData.newPassword}
                onChange={handleChange}
                required
                minLength={6}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:border-[#FF6B00]"
                placeholder="至少6个字符"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                确认新密码
              </label>
              <input
                type="password"
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                required
                minLength={6}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:border-[#FF6B00]"
                placeholder="再次输入新密码"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition-colors disabled:opacity-50"
            >
              {loading ? '修改中...' : '修改密码'}
            </button>
          </form>
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200">
            <h3 className="font-bold text-gray-900">快捷操作</h3>
          </div>

          <div className="divide-y divide-gray-200">
            <button
              onClick={() => navigate('/history')}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50"
            >
              <div className="flex items-center space-x-3">
                <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-gray-900">诊断历史</span>
              </div>
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>

            <button
              onClick={() => navigate('/compliance')}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50"
            >
              <div className="flex items-center space-x-3">
                <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5l5 5v11a2 2 0 01-2 2z" />
                </svg>
                <span className="text-gray-900">合规与使用说明</span>
              </div>
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>

            {isAdmin && (
              <button
                onClick={() => navigate('/admin/coupons')}
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50"
              >
                <div className="flex items-center space-x-3">
                  <span className="text-xl">🎫</span>
                  <span className="text-gray-900">券码管理</span>
                </div>
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            )}

            {isAdmin && (
              <button
                onClick={() => navigate('/admin/feedback')}
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50"
              >
                <div className="flex items-center space-x-3">
                  <svg className="w-5 h-5 text-[#FF6B00]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                  </svg>
                  <span className="text-gray-900">用户反馈管理</span>
                </div>
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            )}

            <button
              onClick={handleLogout}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50"
            >
              <div className="flex items-center space-x-3">
                <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                <span className="text-red-600">退出登录</span>
              </div>
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <h3 className="font-bold text-gray-900 mb-4">使用统计</h3>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-[#FF6B00]">{user?.stats?.diagnosisCount || 0}</div>
              <div className="text-xs text-gray-600 mt-1">诊断次数</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-[#FF6B00]">{user?.stats?.savedCount || 0}</div>
              <div className="text-xs text-gray-600 mt-1">收藏记录</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-[#FF6B00]">{user?.stats?.reportCount || 0}</div>
              <div className="text-xs text-gray-600 mt-1">生成报告</div>
            </div>
          </div>
        </div>
      </div>

      {/* 券码激活弹窗 */}
      {showCouponModal && (
        <CouponModal
          onClose={() => setShowCouponModal(false)}
          onActivated={() => {
            setShowCouponModal(false)
            // 刷新会员状态
            apiClient.get('/api/coupon/membership').then(res => {
              setMembership(res.data)
            }).catch(() => {})
          }}
        />
      )}
    </div>
  )
}

export default ProfilePage
