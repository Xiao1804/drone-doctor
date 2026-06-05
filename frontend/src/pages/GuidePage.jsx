import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate, useParams, useSearchParams, useLocation } from 'react-router-dom'
import axios from 'axios'
import { apiUrl } from '../config/api'
import { isFreeLimitError, getFreeLimitMessage } from '../utils/freeUsage'

// ── Types ──
// question:  yes / no 分支
// action:    next 继续
// terminal:  定损结论
// checklist: 维修完成后检查清单
// preview:   快速诊断结果预览
// interactive: 交互式诊断（通过unified API）

export default function GuidePage() {
  const { treeId } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const location = useLocation()
  const urlMode = searchParams.get('mode')

  // ── Mode detection ──
  // Priority: urlMode > treeId > menu
  const initialMode = (() => {
    if (urlMode === 'preview') return 'preview'
    if (urlMode === 'interactive') return 'interactive'
    if (treeId) return 'wizard'
    return 'menu'
  })()

  const [mode, setMode] = useState(initialMode)

  // ── Shared Data ──
  const [trees, setTrees] = useState([])
  const [currentTree, setCurrentTree] = useState(null)
  const [currentNodeId, setCurrentNodeId] = useState(null)
  const [history, setHistory] = useState([])
  const [checklist, setChecklist] = useState(null)
  const [checkedItems, setCheckedItems] = useState(new Set())
  const [loading, setLoading] = useState(false)

  // ── Preview mode data ──
  const [previewData, setPreviewData] = useState(location.state?.unifiedResult || null)

  // ── Interactive mode data ──
  const [sessionId, setSessionId] = useState(null)
  const [interactiveNode, setInteractiveNode] = useState(null)
  const [interactivePath, setInteractivePath] = useState([])
  const [aiPrompt, setAiPrompt] = useState(null)
  const [interactiveProgress, setInteractiveProgress] = useState({ currentStep: 0, totalSteps: 0 })
  const [interactiveDiagnosis, setInteractiveDiagnosis] = useState(null)
  const [interactiveLoading, setInteractiveLoading] = useState(false)
  const [freeTextInput, setFreeTextInput] = useState('')
  const [showPaywall, setShowPaywall] = useState(false)

  // 付费墙弹窗组件（局部）
  const PaywallModal = () => {
    if (!showPaywall) return null
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl p-8 text-center">
          <div className="text-5xl mb-4">🔒</div>
          <h3 className="text-xl font-bold text-black mb-2">今日免费次数已用完</h3>
          <p className="text-gray-600 mb-6">{getFreeLimitMessage()}</p>
          <div className="space-y-3">
            <button
              onClick={() => {
                setShowPaywall(false)
                navigate('/#pricing')
                setTimeout(() => {
                  document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' })
                }, 100)
              }}
              className="w-full py-3 bg-[#FF6B00] text-white rounded-xl font-medium hover:bg-[#FF8533] transition-colors"
            >
              查看会员方案
            </button>
            <button
              onClick={() => setShowPaywall(false)}
              className="w-full py-3 border-2 border-gray-200 rounded-xl font-medium hover:border-black transition-colors"
            >
              暂时不用
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Load tree list on mount (always needed for terminal navigation)
  useEffect(() => {
    axios.get(apiUrl('/api/decision-trees'))
      .then(res => setTrees(res.data.trees || []))
      .catch(console.error)
  }, [])

  // Load checklist
  useEffect(() => {
    axios.get(apiUrl('/api/decision-trees/checklist/post-repair'))
      .then(res => setChecklist(res.data))
      .catch(console.error)
  }, [])

  // ── Wizard mode: load specific tree ──
  useEffect(() => {
    if (treeId && (mode === 'wizard' || mode === 'interactive')) {
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

  // ── Interactive mode: start via unified API ──
  useEffect(() => {
    if (mode === 'interactive' && treeId && !sessionId && !interactiveLoading) {
      const startInteractive = async () => {
        setInteractiveLoading(true)
        try {
          const symptom = location.state?.input || location.state?.unifiedResult?.intent?.raw || ''
          const res = await axios.post(apiUrl('/api/diagnosis/unified'), {
            mode: 'interactive',
            input: symptom,
            deviceType: location.state?.deviceType,
            faultType: location.state?.faultType,
          })
          const data = res.data
          setSessionId(data.sessionId)
          setInteractiveNode(data.currentNode)
          setAiPrompt(data.aiPrompt)
          setInteractiveProgress(data.progress)
          if (data.status === 'completed') {
            setInteractiveDiagnosis(data.diagnosis)
          }
        } catch (err) {
          console.error('Interactive start failed:', err)
          if (isFreeLimitError(err)) {
            setShowPaywall(true)
          } else {
            alert('启动交互式诊断失败，将使用本地决策树')
            setMode('wizard')
          }
        } finally {
          setInteractiveLoading(false)
        }
      }
      startInteractive()
    }
  }, [mode, treeId, sessionId, interactiveLoading, location.state])

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

  // ── Interactive mode: handle answer ──
  const handleInteractiveAnswer = async (answer) => {
    if (!sessionId || interactiveLoading) return
    setInteractiveLoading(true)
    try {
      const res = await axios.post(apiUrl('/api/diagnosis/unified'), {
        mode: 'interactive',
        sessionId,
        userAnswer: answer,
      })
      const data = res.data
      setInteractiveNode(data.currentNode)
      setAiPrompt(data.aiPrompt)
      setInteractiveProgress(data.progress)
      if (data.status === 'completed') {
        setInteractiveDiagnosis(data.diagnosis)
      }
    } catch (err) {
      console.error('Interactive step failed:', err)
      if (isFreeLimitError(err)) {
        setShowPaywall(true)
      }
    } finally {
      setInteractiveLoading(false)
      setFreeTextInput('')
    }
  }

  // ── RENDER: Preview ──
  if (mode === 'preview' && previewData) {
    const { intent, matchedTree, predictedPath, diagnosis, confidence, suggestedActions } = previewData
    return (
      <div className="min-h-screen bg-gray-50">
        <PaywallModal />
        <nav className="bg-white border-b border-gray-100">
          <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
            <button onClick={() => navigate('/')} className="text-gray-600 hover:text-black">← 返回首页</button>
            <span className="font-semibold">诊断预览</span>
            <button onClick={() => navigate('/guide')} className="text-gray-600 hover:text-black">维修助手</button>
          </div>
        </nav>

        <div className="max-w-2xl mx-auto px-6 py-12">
          {/* Intent Card */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
            <div className="flex items-center gap-2 mb-3">
              <span className="px-2 py-1 bg-blue-50 text-blue-600 text-xs rounded">意图解析</span>
              <span className="text-sm text-gray-500">置信度 {Math.round((confidence || 0) * 100)}%</span>
            </div>
            <div className="text-lg font-semibold text-black mb-1">
              {intent.faultTypeLabel || '未知故障'}
            </div>
            <div className="text-sm text-gray-600">
              匹配决策树：<span className="font-medium">{matchedTree?.name}</span>
            </div>
          </div>

          {/* Predicted Path Timeline */}
          {predictedPath?.nodes && predictedPath.nodes.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
              <h3 className="font-semibold text-black mb-4">预测排查路径</h3>
              <div className="space-y-3">
                {predictedPath.nodes.map((node, i) => (
                  <div key={node.id} className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-xs text-gray-500 flex-shrink-0 mt-0.5">
                      {i + 1}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-800">{node.title}</div>
                      <div className="text-xs text-gray-500">{node.description}</div>
                    </div>
                  </div>
                ))}
                {predictedPath.terminalNode && (
                  <div className="flex items-start gap-3 pt-2 border-t border-gray-100">
                    <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center text-xs text-green-600 flex-shrink-0 mt-0.5">
                      ✓
                    </div>
                    <div>
                      <div className="text-sm font-medium text-green-700">{predictedPath.terminalNode.conclusion}</div>
                      <div className="text-xs text-gray-500">{predictedPath.terminalNode.recommendation}</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Diagnosis Summary */}
          {diagnosis && (
            <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
              <h3 className="font-semibold text-black mb-3">诊断摘要</h3>
              {diagnosis.possibleCauses?.length > 0 && (
                <div className="mb-4">
                  <div className="text-sm text-gray-500 mb-2">可能原因</div>
                  <div className="space-y-2">
                    {diagnosis.possibleCauses.map((c, i) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <span className="text-gray-700">{c.cause}</span>
                        <span className="text-gray-400">{c.probability}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex items-center gap-4 text-sm text-gray-500">
                <span>预计耗时: {diagnosis.totalEstimatedTime}</span>
                <span>难度: {diagnosis.difficulty}</span>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="space-y-3">
            {suggestedActions?.map((action, i) => {
              if (action.type === 'start-tree') {
                return (
                  <button
                    key={i}
                    onClick={() => {
                      navigate(`/guide/${action.targetId}`)
                      setMode('wizard')
                    }}
                    className="w-full py-4 bg-black text-white rounded-xl font-medium hover:bg-[#FF6B00] transition-colors flex items-center justify-center gap-2"
                  >
                    <span>🔧</span> {action.label}
                  </button>
                )
              }
              if (action.type === 'interactive') {
                return (
                  <button
                    key={i}
                    onClick={() => {
                      navigate(`/guide/${action.targetId}?mode=interactive`, {
                        state: { ...location.state, input: intent.raw }
                      })
                      setMode('interactive')
                    }}
                    className="w-full py-4 bg-[#FF6B00] text-white rounded-xl font-medium hover:bg-orange-600 transition-colors flex items-center justify-center gap-2"
                  >
                    <span>🗣️</span> {action.label}
                  </button>
                )
              }
              return null
            })}
            <button
              onClick={() => navigate('/')}
              className="w-full py-4 border-2 border-gray-200 rounded-xl font-medium hover:border-black transition-colors"
            >
              描述不准确？重新输入
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── RENDER: Interactive ──
  if (mode === 'interactive') {
    if (interactiveLoading || (!interactiveNode && !interactiveDiagnosis)) {
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <PaywallModal />
          <div className="text-center">
            <div className="text-4xl mb-4 animate-spin">⏳</div>
            <p className="text-gray-600">启动交互式诊断...</p>
          </div>
        </div>
      )
    }

    // Completed
    if (interactiveDiagnosis) {
      const terminalNode = interactiveNode
      return (
        <div className="min-h-screen bg-gray-50">
          <PaywallModal />
          <nav className="bg-white border-b border-gray-100">
            <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
              <button onClick={() => navigate('/guide')} className="text-gray-600 hover:text-black">← 返回</button>
              <span className="font-semibold">交互式诊断完成</span>
            </div>
          </nav>
          <div className="max-w-2xl mx-auto px-6 py-12">
            <div className="bg-white rounded-xl border border-gray-200 p-8 mb-6">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-green-100 rounded-full mb-4">
                <span className="text-green-700 text-sm font-medium">✓ 诊断完成</span>
              </div>
              <h1 className="text-2xl font-bold text-black mb-2">{terminalNode?.title}</h1>
              <p className="text-gray-600 mb-6">{terminalNode?.description}</p>
              <div className="bg-black text-white rounded-xl p-6 mb-4">
                <div className="text-sm text-gray-400 mb-1">定损结论</div>
                <div className="text-xl font-bold">{terminalNode?.conclusion}</div>
              </div>
              <div className="bg-[#FF6B00]/10 border border-[#FF6B00]/20 rounded-xl p-4">
                <div className="text-sm text-[#FF6B00] font-medium mb-1">建议操作</div>
                <div className="text-gray-700">{terminalNode?.recommendation}</div>
              </div>
            </div>
            <div className="flex gap-4">
              <button onClick={handleRestart} className="flex-1 py-4 border-2 border-gray-200 rounded-xl font-medium hover:border-black transition-colors">
                重新开始
              </button>
              <button onClick={() => { navigate('/guide'); setMode('menu'); }} className="flex-1 py-4 bg-black text-white rounded-xl font-medium hover:bg-[#FF6B00] transition-colors">
                返回向导首页
              </button>
            </div>
          </div>
        </div>
      )
    }

    // Active interactive step
    return (
      <div className="min-h-screen bg-gray-50">
        <PaywallModal />
        <nav className="bg-white border-b border-gray-100">
          <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
            <button onClick={() => { navigate('/guide'); setMode('menu'); setSessionId(null); }} className="text-gray-600 hover:text-black">← 退出</button>
            <span className="font-semibold">交互式诊断</span>
            <span className="text-sm text-gray-400">步骤 {interactiveProgress.currentStep}/{interactiveProgress.totalSteps}</span>
          </div>
        </nav>

        <div className="max-w-2xl mx-auto px-6 py-8">
          {/* Progress */}
          <div className="mb-8">
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#FF6B00] rounded-full transition-all"
                style={{ width: `${Math.min((interactiveProgress.currentStep / interactiveProgress.totalSteps) * 100, 100)}%` }}
              />
            </div>
          </div>

          {/* Step Card */}
          <div className="bg-white rounded-xl border border-gray-200 p-8 mb-6">
            <div className="inline-flex items-center gap-2 px-2 py-1 bg-purple-50 rounded mb-4">
              <span className="text-xs text-purple-600">AI增强提示</span>
            </div>
            <h1 className="text-2xl font-bold text-black mb-4">{interactiveNode?.title}</h1>
            <p className="text-gray-600 mb-6 leading-relaxed">{interactiveNode?.description}</p>
            {interactiveNode?.criteria && (
              <div className="bg-gray-50 rounded-lg p-4 mb-6">
                <div className="text-sm text-gray-500 mb-1">判定标准</div>
                <div className="text-gray-800 font-medium">{interactiveNode.criteria}</div>
              </div>
            )}
            {aiPrompt?.message && (
              <div className="bg-purple-50 rounded-lg p-4 mb-6">
                <div className="text-sm text-purple-600">{aiPrompt.message}</div>
              </div>
            )}
          </div>

          {/* Answer Buttons */}
          <div className="space-y-3">
            {aiPrompt?.suggestedAnswers?.map((answer, i) => (
              <button
                key={i}
                onClick={() => handleInteractiveAnswer(answer)}
                disabled={interactiveLoading}
                className="w-full py-4 bg-black text-white rounded-xl font-medium hover:bg-[#FF6B00] transition-colors disabled:opacity-50"
              >
                {answer}
              </button>
            ))}

            {aiPrompt?.allowFreeText && (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={freeTextInput}
                  onChange={(e) => setFreeTextInput(e.target.value)}
                  placeholder="或输入你的回答..."
                  className="flex-1 px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-[#FF6B00]"
                  onKeyDown={(e) => e.key === 'Enter' && freeTextInput.trim() && handleInteractiveAnswer(freeTextInput)}
                />
                <button
                  onClick={() => freeTextInput.trim() && handleInteractiveAnswer(freeTextInput)}
                  disabled={!freeTextInput.trim() || interactiveLoading}
                  className="px-6 py-3 bg-gray-800 text-white rounded-xl hover:bg-black transition-colors disabled:opacity-50"
                >
                  发送
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── RENDER: Menu ──
  if (mode === 'menu') {
    const noMatch = location.state?.noMatch
    return (
      <div className="min-h-screen bg-gray-50">
        <PaywallModal />
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

          {noMatch && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-8 text-center">
              <p className="text-sm text-amber-800">
                未找到精确匹配的决策树，请根据故障现象手动选择排查流程
                {location.state?.input && <span className="block text-xs text-amber-600 mt-1">你的描述：{location.state.input}</span>}
              </p>
            </div>
          )}

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
        <PaywallModal />
        <div className="text-center">
          <div className="text-4xl mb-4 animate-spin">⏳</div>
          <p className="text-gray-600">加载向导中...</p>
        </div>
      </div>
    )
  }

  // ── RENDER: Result (terminal node) ──
  if (currentNode.type === 'terminal') {
    const isPreInspection = currentTree.id === 'tree-damage-assessment'
    const allChecked = checklist?.items?.every(item =>
      item.required ? checkedItems.has(item.id) : true
    )

    return (
      <div className="min-h-screen bg-gray-50">
        <PaywallModal />
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

          {/* Pre-Inspection Complete → show fault diagnosis entry points */}
          {isPreInspection && (
            <div className="bg-white rounded-xl border border-gray-200 p-8 mb-6">
              <h2 className="text-xl font-semibold text-black mb-2">选择故障排查流程</h2>
              <p className="text-gray-500 text-sm mb-6">定损前检查已完成，请根据故障现象选择排查流程</p>
              <div className="space-y-3">
                {trees.filter(t => t.id !== 'tree-damage-assessment').map(t => (
                  <button
                    key={t.id}
                    onClick={() => handleStartTree(t.id)}
                    className="w-full flex items-center gap-4 p-4 rounded-xl border border-gray-200 hover:border-black hover:shadow-lg transition-all text-left bg-white"
                  >
                    <span className="text-3xl">{t.icon}</span>
                    <div className="flex-1">
                      <div className="font-semibold text-black">{t.name}</div>
                      <div className="text-sm text-gray-500">{t.description}</div>
                    </div>
                    <span className="text-gray-400">→</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Post-Repair Checklist — only for actual repair trees */}
          {!isPreInspection && checklist && (
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
      <PaywallModal />
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
