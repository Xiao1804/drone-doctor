import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { apiUrl } from '../config/api'
import { showToast } from '../components/Toast'
import { checkFreeUsageBeforeDiagnosis } from '../utils/freeUsage'
import CouponModal from '../components/CouponModal'

function ImageDiagnosisPage() {
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview] = useState(null)
  const [scenario, setScenario] = useState('fault')
  const [result, setResult] = useState(null)
  const [membershipChecked, setMembershipChecked] = useState(false)
  const [showCouponModal, setShowCouponModal] = useState(false)
  const [membership, setMembership] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    // 检查会员状态
    checkFreeUsageBeforeDiagnosis().then(state => {
      setMembership(state)
      setMembershipChecked(true)
      if (!state.allowed) {
        if (!localStorage.getItem('token')) {
          navigate('/auth')
        } else {
          setShowCouponModal(true)
        }
      }
    })
  }, [navigate])

  const scenarios = [
    { value: 'fault', label: '故障部位识别', description: '拍摄无人机故障部位照片' },
    { value: 'error', label: 'APP报错识别', description: '上传APP报错截图' },
    { value: 'model', label: '设备型号识别', description: '拍摄无人机外观照片' },
    { value: 'log', label: '飞行日志分析', description: '上传飞行日志截图' }
  ]

  const handleFileChange = (e) => {
    const file = e.target.files[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => {
        setPreview(reader.result)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleUpload = async () => {
    const fileInput = document.getElementById('image-input')
    const file = fileInput.files[0]
    
    if (!file) {
      showToast('请选择图片文件', 'warning')
      return
    }

    // 再次检查会员状态
    const state = await checkFreeUsageBeforeDiagnosis()
    if (!state.allowed) {
      if (!localStorage.getItem('token')) {
        navigate('/auth')
      } else {
        setShowCouponModal(true)
      }
      return
    }

    setUploading(true)

    try {
      const formData = new FormData()
      formData.append('image', file)
      formData.append('scenario', scenario)

      const response = await axios.post(apiUrl('/api/image/recognize'), formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        },
        timeout: 90000
      })

      setResult(response.data)

    } catch (error) {
      console.error('Upload error:', error)
      showToast('图片识别失败: ' + (error.response?.data?.error || error.message), 'error')
    } finally {
      setUploading(false)
    }
  }

  const handleClear = () => {
    setPreview(null)
    setResult(null)
    document.getElementById('image-input').value = ''
  }

  const renderFaultResult = (data) => (
    <div className="space-y-4">
      <div>
        <h4 className="font-medium text-gray-900 mb-2">故障部位</h4>
        <p className="text-gray-600">{data.component}</p>
      </div>
      <div>
        <h4 className="font-medium text-gray-900 mb-2">故障类型</h4>
        <span className="inline-block px-3 py-1 bg-orange-100 text-[#FF6B00] rounded-full text-sm">
          {data.faultType}
        </span>
      </div>
      <div>
        <h4 className="font-medium text-gray-900 mb-2">严重程度</h4>
        <span className={`inline-block px-3 py-1 rounded-full text-sm ${
          data.severity === '严重' ? 'bg-red-100 text-red-600' :
          data.severity === '中等' ? 'bg-yellow-100 text-yellow-600' :
          'bg-green-100 text-green-600'
        }`}>
          {data.severity}
        </span>
      </div>
      {data.possibleCauses && (
        <div>
          <h4 className="font-medium text-gray-900 mb-2">可能原因</h4>
          <ul className="list-disc list-inside text-gray-600 space-y-1">
            {data.possibleCauses.map((cause, i) => <li key={i}>{cause}</li>)}
          </ul>
        </div>
      )}
      <div>
        <h4 className="font-medium text-gray-900 mb-2">维修建议</h4>
        <p className="text-gray-600">{data.repairSuggestion}</p>
      </div>
    </div>
  )

  const renderErrorResult = (data) => (
    <div className="space-y-4">
      <div>
        <h4 className="font-medium text-gray-900 mb-2">错误代码</h4>
        <code className="px-3 py-1 bg-gray-100 rounded text-sm">{data.errorCode}</code>
      </div>
      <div>
        <h4 className="font-medium text-gray-900 mb-2">错误提示</h4>
        <p className="text-gray-600">{data.errorMessage}</p>
      </div>
      {data.solutions && (
        <div>
          <h4 className="font-medium text-gray-900 mb-2">解决方案</h4>
          <ol className="list-decimal list-inside text-gray-600 space-y-2">
            {data.solutions.map((solution, i) => <li key={i}>{solution}</li>)}
          </ol>
        </div>
      )}
    </div>
  )

  const renderModelResult = (data) => (
    <div className="space-y-4">
      <div>
        <h4 className="font-medium text-gray-900 mb-2">品牌</h4>
        <p className="text-2xl font-semibold text-[#FF6B00]">{data.brand}</p>
      </div>
      <div>
        <h4 className="font-medium text-gray-900 mb-2">型号</h4>
        <p className="text-xl font-medium">{data.model}</p>
      </div>
      <div>
        <h4 className="font-medium text-gray-900 mb-2">类型</h4>
        <span className="inline-block px-3 py-1 bg-blue-100 text-blue-600 rounded-full text-sm">
          {data.type}
        </span>
      </div>
    </div>
  )

  const renderLogResult = (data) => (
    <div className="space-y-4">
      {data.anomalies && (
        <div>
          <h4 className="font-medium text-gray-900 mb-2">检测到的异常</h4>
          <div className="space-y-3">
            {data.anomalies.map((anomaly, i) => (
              <div key={i} className="p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium">{anomaly.type}</span>
                  <span className={`px-2 py-1 rounded text-xs ${
                    anomaly.severity === '严重' ? 'bg-red-100 text-red-600' :
                    anomaly.severity === '中等' ? 'bg-yellow-100 text-yellow-600' :
                    'bg-green-100 text-green-600'
                  }`}>
                    {anomaly.severity}
                  </span>
                </div>
                <p className="text-sm text-gray-600">{anomaly.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )

  const renderResult = () => {
    if (!result || !result.result) return null

    const renderers = {
      fault: renderFaultResult,
      error: renderErrorResult,
      model: renderModelResult,
      log: renderLogResult
    }

    const renderer = renderers[result.scenario]
    return renderer ? renderer(result.result) : (
      <pre className="text-sm text-gray-600 whitespace-pre-wrap">
        {JSON.stringify(result.result, null, 2)}
      </pre>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/')} className="text-gray-600 hover:text-black">
              ← 返回
            </button>
            <div className="w-px h-6 bg-gray-300" />
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-[#FF6B00] rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">D</span>
              </div>
              <span className="font-semibold">图片识别诊断</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left: Upload */}
          <div>
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="text-lg font-semibold mb-4">📷 图片识别诊断</h3>
              
              {/* Scenario Selection */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">识别场景</label>
                <div className="grid grid-cols-2 gap-2">
                  {scenarios.map((s) => (
                    <button
                      key={s.value}
                      onClick={() => setScenario(s.value)}
                      className={`p-3 text-left border rounded-lg transition-colors ${
                        scenario === s.value
                          ? 'border-[#FF6B00] bg-orange-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="font-medium text-sm">{s.label}</div>
                      <div className="text-xs text-gray-500 mt-1">{s.description}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* File Upload */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">上传图片</label>
                <input
                  id="image-input"
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="block w-full text-sm text-gray-500
                    file:mr-4 file:py-2 file:px-4
                    file:rounded-lg file:border-0
                    file:text-sm file:font-medium
                    file:bg-gray-100 file:text-gray-700
                    hover:file:bg-gray-200
                    file:cursor-pointer"
                />
                <p className="text-xs text-gray-400 mt-1">支持 JPG、PNG、GIF、BMP、WEBP，最大10MB</p>
              </div>

              {/* Preview */}
              {preview && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">图片预览</label>
                  <div className="relative">
                    <img src={preview} alt="Preview" className="w-full max-h-64 object-contain rounded-lg border" />
                    <button
                      onClick={handleClear}
                      className="absolute top-2 right-2 p-1 bg-black bg-opacity-50 text-white rounded hover:bg-opacity-70"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              )}

              {/* Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={handleUpload}
                  disabled={uploading || !preview}
                  className="flex-1 py-3 bg-[#FF6B00] text-white rounded-lg font-medium hover:bg-orange-600 transition-colors disabled:opacity-50"
                >
                  {uploading ? '识别中...' : '开始识别'}
                </button>
                {preview && (
                  <button onClick={handleClear} className="px-6 py-3 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
                    清除
                  </button>
                )}
              </div>
            </div>

            {/* Tips */}
            <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-medium text-blue-900 mb-2">💡 使用提示</h4>
              <ul className="text-sm text-blue-700 space-y-1">
                <li>• 拍摄清晰的照片，确保故障部位清晰可见</li>
                <li>• APP报错截图需包含完整的错误信息</li>
                <li>• 设备型号识别需拍摄无人机正面或侧面</li>
                <li>• 飞行日志截图需包含异常数据部分</li>
              </ul>
            </div>
          </div>

          {/* Right: Result */}
          <div>
            {result ? (
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h3 className="text-lg font-semibold mb-4">识别结果</h3>
                {renderResult()}
                <div className="mt-6 pt-6 border-t">
                  <button onClick={handleClear} className="w-full py-3 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
                    重新识别
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 p-6 text-center text-gray-500">
                <div className="text-6xl mb-4">📷</div>
                <p>上传图片后将在此显示识别结果</p>
              </div>
            )}
          </div>
        </div>
      </div>
      {/* 券码激活弹窗 */}
      {showCouponModal && (
        <CouponModal
          onClose={() => setShowCouponModal(false)}
          onActivated={() => {
            setShowCouponModal(false)
            checkFreeUsageBeforeDiagnosis().then(state => {
              setMembership(state)
            })
          }}
        />
      )}
    </div>
  )
}

export default ImageDiagnosisPage