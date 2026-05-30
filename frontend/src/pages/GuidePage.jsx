import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import axios from 'axios'
import { apiUrl } from '../config/api'

// ── Types ──
// question:  yes / no 分支
// action:    next 继续
// terminal:  定损结论
// checklist: 维修完成后检查清单

export default function GuidePage() {
  const { treeId } = useParams()
  const navigate = useNavigate()

  // Mode: 'menu' | 'wizard' | 'result' | 'checklist'
  const [mode, setMode] = useState(treeId ? 'wizard' : 'menu')

  // Data
  const [trees, setTrees] = useState([])
  const [currentTree, setCurrentTree] = useState(null)
  const [currentNodeId, setCurrentNodeId] = useState(null)
  const [history, setHistory] = useState([])
  const [checklist, setChecklist] = useState(null)
  const [checkedItems, setCheckedItems] = useState(new Set())
  const [loading, setLoading] = useState(false)

  // Load tree list on mount (menu mode)
  useEffect(() => {
    if (mode === 'menu') {
      axios.get(apiUrl('/api/decision-trees'))
        .then(res => setTrees(res.data.trees || []))
        .catch(console.error)
    }
  }, [mode])

  // Load specific tree (wizard mode)
  useEffect(() => {
    if (treeId && mode === 'wizard') {
      setLoading(true)
      axios.get(apiUrl(`/api/decision-trees/${treeId}`))
        .then(res => {
          setCurrentTree(res.data)
          setCurrentNodeId(res.data.startNode)
          setHistory([])
          setLoading(false)
        })
        .catch(err => {
          console.error(err)
          alert('加载决策树失败')
          navigate('/guide')
          setMode('menu')
          setLoading(false)
        })
    }
  }, [treeId, mode, navigate])

  // Load checklist
  useEffect(() => {
    axios.get(apiUrl('/api/decision-trees/checklist/post-repair'))
      .then(res => setChecklist(res.data))
      .catch(console.error)
  }, [])

  const currentNode = currentTree?.nodes?.[currentNodeId]

  const handleChoice = useCallback((goto) => {
    if (!currentTree || !goto) return
    setHistory(prev => [...prev, currentNodeId])
    setCurrentNodeId(goto)
  }, [currentTree, currentNodeId])

  const handleBack = useCallback(() => {
    if (history.length === 0) {
      navigate('/guide')
      setMode('menu')
      return
    }
    const prev = history[history.length - 1]
    setHistory(h => h.slice(0, -1))
    setCurrentNodeId(prev)
  }, [history, navigate])

  const handleRestart = useCallback(() => {
    if (currentTree) {
      setCurrentNodeId(currentTree.startNode)
      setHistory([])
      setMode('wizard')
    }
  }, [currentTree])

  const handleStartTree = (id) => {
    navigate(`/guide/${id}`)
    setMode('wizard')
  }

  const toggleChecklistItem = (id) => {
    setCheckedItems(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // ── RENDER: Menu ──
  if (mode === 'menu') {
    return (
      <div className="min-h-screen bg-gray-50">
        <nav className="bg-white border-b border-gray-100">
          <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
            <button onClick={() => navigate('/')} className="flex items-center gap-2 text-gray-600 hover:text-black">
              <span>←</span><span>返回首页</span>
            </button>
            <span className="font-semibold">维修助手</span>
          </div>
        </nav>
        <div className="max-w-4xl mx-auto px-6 py-12">
          <div className="text-center mb-12">
            <h1 className="text-3xl font-bold text-black mb-3">交互式维修向导</h1>
            <p className="text-gray-600">根据标准化 SOP 流程，一步一步引导故障排查</p>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            {trees.map(t => (
              <button
                key={t.id}
                onClick={() => handleStartTree(t.id)}
                className="bg-white rounded-xl border border-gray-200 p-6 text-left hover:border-black hover:shadow-lg transition-all"
              >
                <div className="flex items-start gap-4">
                  <div className="text-4xl">{t.icon}</div>
                  <div className="flex-1">
                    <div className="font-semibold text-lg text-black mb-1">{t.name}</div>
                    <div className="text-sm text-gray-500 mb-2">{t.category} · {t.nodeCount} 个步骤</div>
                    <div className="text-sm text-gray-600">{t.description}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // ── RENDER: Loading ──
  if (loading || !currentTree || !currentNode) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-spin">⏳</div>
          <p className="text-gray-600">加载向导中...</p>
        </div>
      </div>
    )
  }

  // ── RENDER: Result (terminal node) ──
  if (currentNode.type === 'terminal') {
    const allChecked = checklist?.items?.every(item =>
      item.required ? checkedItems.has(item.id) : true
    )

    return (
      <div className="min-h-screen bg-gray-50">
        <nav className="bg-white border-b border-gray-100">
          <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
            <button onClick={handleBack} className="text-gray-600 hover:text-black">← 上一步</button>
            <span className="font-semibold">{currentTree.name}</span>
          </div>
        </nav>
        <div className="max-w-2xl mx-auto px-6 py-12">
          {/* Terminal Conclusion */}
          <div className="bg-white rounded-xl border border-gray-200 p-8 mb-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-green-100 rounded-full mb-4">
              <span className="text-green-700 text-sm font-medium">✓ 诊断完成</span>
            </div>
            <h1 className="text-2xl font-bold text-black mb-2">{currentNode.title}</h1>
            <p className="text-gray-600 mb-6">{currentNode.description}</p>
            <div className="bg-black text-white rounded-xl p-6 mb-4">
              <div className="text-sm text-gray-400 mb-1">定损结论</div>
              <div className="text-xl font-bold">{currentNode.conclusion}</div>
            </div>
            <div className="bg-[#FF6B00]/10 border border-[#FF6B00]/20 rounded-xl p-4">
              <div className="text-sm text-[#FF6B00] font-medium mb-1">建议操作</div>
              <div className="text-gray-700">{currentNode.recommendation}</div>
            </div>
          </div>

          {/* Post-Repair Checklist */}
          {checklist && (
            <div className="bg-white rounded-xl border border-gray-200 p-8 mb-6">
              <h2 className="text-xl font-semibold text-black mb-2">维修完成后综合检查</h2>
              <p className="text-gray-500 text-sm mb-6">完成以下检查项后方可交付</p>
              <div className="space-y-3">
                {checklist.items.map(item => (
                  <label
                    key={item.id}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      checkedItems.has(item.id)
                        ? 'bg-green-50 border-green-200'
                        : 'bg-gray-50 border-gray-100 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checkedItems.has(item.id)}
                      onChange={() => toggleChecklistItem(item.id)}
                      className="mt-0.5 w-5 h-5 accent-black"
                    />
                    <div className="flex-1">
                      <div className={`text-sm ${checkedItems.has(item.id) ? 'text-green-800 line-through' : 'text-gray-700'}`}>
                        {item.text}
                      </div>
                      {item.condition && (
                        <div className="text-xs text-gray-400 mt-1">条件：{item.condition}</div>
                      )}
                      {item.required && !checkedItems.has(item.id) && (
                        <div className="text-xs text-[#FF6B00] mt-1">* 必填</div>
                      )}
                    </div>
                  </label>
                ))}
              </div>
              <div className="mt-6 flex items-center justify-between">
                <div className="text-sm text-gray-500">
                  已完成 {checkedItems.size} / {checklist.items.length} 项
                </div>
                <button
                  onClick={() => setCheckedItems(new Set(checklist.items.map(i => i.id)))}
                  className="text-sm text-gray-500 hover:text-black underline"
                >
                  全部勾选
                </button>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-4">
            <button
              onClick={handleRestart}
              className="flex-1 py-4 border-2 border-gray-200 rounded-xl font-medium hover:border-black transition-colors"
            >
              重新开始
            </button>
            <button
              onClick={() => { navigate('/guide'); setMode('menu'); }}
              className="flex-1 py-4 bg-black text-white rounded-xl font-medium hover:bg-[#FF6B00] transition-colors"
            >
              返回向导首页
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── RENDER: Wizard Step ──
  const progress = history.length + 1
  const totalSteps = Object.keys(currentTree.nodes).length

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Nav */}
      <nav className="bg-white border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
          <button onClick={handleBack} className="text-gray-600 hover:text-black">← 上一步</button>
          <span className="font-semibold">{currentTree.name}</span>
          <button
            onClick={() => { navigate('/guide'); setMode('menu'); }}
            className="text-gray-600 hover:text-black"
          >
            ✕
          </button>
        </div>
      </nav>

      <div className="max-w-2xl mx-auto px-6 py-8">
        {/* Progress */}
        <div className="mb-8">
          <div className="flex items-center justify-between text-sm text-gray-500 mb-2">
            <span>步骤 {progress}</span>
            <span>{currentNode.type === 'question' ? '请选择' : '请执行'}</span>
          </div>
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-black rounded-full transition-all"
              style={{ width: `${Math.min((progress / totalSteps) * 100, 100)}%` }}
            />
          </div>
        </div>

        {/* Step Card */}
        <div className="bg-white rounded-xl border border-gray-200 p-8 mb-6">
          {/* Title */}
          <h1 className="text-2xl font-bold text-black mb-4">{currentNode.title}</h1>

          {/* Description */}
          <p className="text-gray-600 mb-6 leading-relaxed">{currentNode.description}</p>

          {/* Criteria */}
          {currentNode.criteria && (
            <div className="bg-gray-50 rounded-lg p-4 mb-6">
              <div className="text-sm text-gray-500 mb-1">判定标准</div>
              <div className="text-gray-800 font-medium">{currentNode.criteria}</div>
            </div>
          )}

          {/* Tools & Time */}
          <div className="flex flex-wrap gap-3 mb-6">
            {currentNode.tools && currentNode.tools.length > 0 && (
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#FF6B00]/10 rounded-lg">
                <span className="text-sm text-[#FF6B00] font-medium">
                  工具：{currentNode.tools.join('、')}
                </span>
              </div>
            )}
            {currentNode.estimatedTime && (
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-gray-100 rounded-lg">
                <span className="text-sm text-gray-600">
                  ⏱ {currentNode.estimatedTime}
                </span>
              </div>
            )}
            {currentNode.caseId && (
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-50 rounded-lg">
                <span className="text-sm text-blue-600">
                  案例：{currentNode.caseId}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-3">
          {currentNode.type === 'question' && (
            <>
              <button
                onClick={() => handleChoice(currentNode.yes?.goto)}
                className="w-full py-4 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
              >
                <span>✅</span>
                <span>{currentNode.yes?.label || '是（符合标准）'}</span>
              </button>
              <button
                onClick={() => handleChoice(currentNode.no?.goto)}
                className="w-full py-4 bg-red-500 text-white rounded-xl font-medium hover:bg-red-600 transition-colors flex items-center justify-center gap-2"
              >
                <span>❌</span>
                <span>{currentNode.no?.label || '否（不符合）'}</span>
              </button>
            </>
          )}

          {currentNode.type === 'action' && (
            <button
              onClick={() => handleChoice(currentNode.next?.goto)}
              className="w-full py-4 bg-black text-white rounded-xl font-medium hover:bg-[#FF6B00] transition-colors flex items-center justify-center gap-2"
            >
              <span>➡️</span>
              <span>{currentNode.next?.label || '已完成，继续'}</span>
            </button>
          )}
        </div>

        {/* History breadcrumb */}
        {history.length > 0 && (
          <div className="mt-8 text-center">
            <div className="text-xs text-gray-400">
              已走过 {history.length} 个步骤
              {currentNode.caseId && ` · 关联案例 ${currentNode.caseId}`}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
