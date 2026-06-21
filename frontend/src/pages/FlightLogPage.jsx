import React, { useMemo, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { apiUrl } from '../config/api'
import { checkFreeUsageBeforeDiagnosis } from '../utils/freeUsage'

function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return '-'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let index = 0
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024
    index += 1
  }
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}

function formatValue(value) {
  if (value === null || value === undefined || value === '') return '-'
  if (typeof value === 'number') return Number.isInteger(value) ? value : value.toFixed(3).replace(/\.?0+$/, '')
  return value
}

function levelClass(level) {
  if (level === 'danger') return 'border-red-200 bg-red-50 text-red-700'
  if (level === 'warning') return 'border-yellow-200 bg-yellow-50 text-yellow-700'
  if (level === 'ok') return 'border-green-200 bg-green-50 text-green-700'
  return 'border-blue-200 bg-blue-50 text-blue-700'
}

function summaryClass(level) {
  if (level === 'danger') return 'border-red-200 bg-red-50 text-red-800'
  if (level === 'warning') return 'border-yellow-200 bg-yellow-50 text-yellow-800'
  if (level === 'ok') return 'border-green-200 bg-green-50 text-green-800'
  return 'border-blue-200 bg-blue-50 text-blue-800'
}

function summaryLabel(level) {
  if (level === 'danger') return '优先处理'
  if (level === 'warning') return '需要复核'
  if (level === 'ok') return '基本正常'
  return '可解析'
}

function engineerAccentClass(level) {
  if (level === 'danger') return 'border-red-500'
  if (level === 'warning') return 'border-yellow-500'
  if (level === 'ok') return 'border-green-500'
  return 'border-blue-500'
}

function engineerBadgeClass(level) {
  if (level === 'danger') return 'bg-red-50 text-red-700'
  if (level === 'warning') return 'bg-yellow-50 text-yellow-700'
  if (level === 'ok') return 'bg-green-50 text-green-700'
  return 'bg-blue-50 text-blue-700'
}

function engineerLabel(level) {
  if (level === 'danger') return '优先处理'
  if (level === 'warning') return '重点复核'
  if (level === 'ok') return '暂不优先'
  return '补充信息'
}

function confidenceText(value) {
  if (value === 'confirmed') return '日志确认'
  if (value === 'high-confidence inference') return '高可信推断'
  if (value === 'medium-confidence inference') return '推断线索，需人工复核'
  if (value === 'unknown') return '尚未确认'
  return value
}

function StatPill({ label, value }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-gray-950">{formatValue(value)}</div>
    </div>
  )
}

function PlainSummary({ summary }) {
  if (!summary) return null

  const sections = [
    { title: '好消息', items: summary.goodNews || [] },
    { title: '需要注意', items: summary.watchItems || [] },
    { title: '下一步', items: summary.nextSteps || [] },
  ].filter(section => section.items.length > 0)

  return (
    <section className={`rounded-lg border p-5 ${summaryClass(summary.riskLevel)}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm font-medium opacity-80">先看这里</div>
        <div className="rounded-full bg-white/70 px-3 py-1 text-xs font-medium">{summaryLabel(summary.riskLevel)}</div>
      </div>
      <h3 className="mt-3 text-xl font-semibold text-gray-950">{summary.headline}</h3>
      <p className="mt-2 text-sm leading-6 text-gray-700">{summary.summary}</p>

      {(summary.plainMetrics || []).length > 0 && (
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {summary.plainMetrics.map(item => (
            <div key={item.label} className="rounded-lg bg-white/75 px-4 py-3">
              <div className="text-xs text-gray-500">{item.label}</div>
              <div className="mt-1 text-lg font-semibold text-gray-950">{item.value}</div>
              <div className="mt-1 text-xs leading-5 text-gray-600">{item.meaning}</div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        {sections.map(section => (
          <div key={section.title} className="rounded-lg bg-white/75 p-4">
            <h4 className="text-sm font-semibold text-gray-950">{section.title}</h4>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-gray-700">
              {section.items.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {summary.technicalHint && <p className="mt-4 text-xs text-gray-600">{summary.technicalHint}</p>}
    </section>
  )
}

function EngineerSummary({ summary }) {
  if (!summary) return null

  const priorities = summary.priorities || []
  const doNotMisread = summary.doNotMisread || []
  const timeWindows = summary.timeWindows || []
  const askPilot = summary.askPilot || []

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="text-sm font-medium text-gray-500">工程师复核重点</div>
      <h3 className="mt-3 text-xl font-semibold text-gray-950">{summary.headline}</h3>
      {summary.handoff && <p className="mt-2 text-sm leading-6 text-gray-600">{summary.handoff}</p>}

      {priorities.length > 0 && (
        <div className="mt-5 space-y-5">
          {priorities.map((item, index) => (
            <div key={`${item.title}-${index}`} className={`border-l-4 pl-4 ${engineerAccentClass(item.level)}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-base font-semibold text-gray-950">{item.title}</h4>
                <span className={`rounded-full px-3 py-1 text-xs font-medium ${engineerBadgeClass(item.level)}`}>
                  {engineerLabel(item.level)}
                </span>
              </div>
              <div className="mt-3 space-y-2 text-sm leading-6 text-gray-700">
                {item.direction && <p><span className="font-medium text-gray-950">方向：</span>{item.direction}</p>}
                {item.reason && <p><span className="font-medium text-gray-950">依据：</span>{item.reason}</p>}
                {item.check && <p><span className="font-medium text-gray-950">动作：</span>{item.check}</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      {(timeWindows.length > 0 || askPilot.length > 0 || doNotMisread.length > 0) && (
        <div className="mt-6 grid gap-5 border-t border-gray-100 pt-5 lg:grid-cols-3">
          {timeWindows.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-gray-950">先看这些时间点</h4>
              <div className="mt-3 space-y-2 text-sm text-gray-600">
                {timeWindows.map((item, index) => (
                  <div key={`${item.label}-${index}`}>
                    <span className="font-mono text-gray-950">{formatValue(item.time_s)}s</span>
                    <span className="mx-2 text-gray-300">|</span>
                    <span className="font-medium text-gray-800">{item.label}</span>
                    {item.why && <div className="mt-1 text-xs leading-5 text-gray-500">{item.why}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {askPilot.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-gray-950">需要问飞手</h4>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-gray-600">
                {askPilot.map((item, index) => <li key={index}>{item}</li>)}
              </ul>
            </div>
          )}

          {doNotMisread.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-gray-950">不要误判</h4>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-gray-600">
                {doNotMisread.map((item, index) => <li key={index}>{item}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function Section({ title, children }) {
  return (
    <section className="border-t border-gray-100 pt-6">
      <h3 className="mb-4 text-lg font-semibold text-gray-950">{title}</h3>
      {children}
    </section>
  )
}

function StatTable({ items, columns }) {
  const rows = (items || []).filter(Boolean)
  if (!rows.length) {
    return <p className="text-sm text-gray-500">该日志没有对应 topic 或字段。</p>
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            {columns.map(column => (
              <th key={column.key} className="px-4 py-3 text-left font-medium text-gray-600">
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {rows.map((row, index) => (
            <tr key={`${row.field || row.channel || row.name || index}-${index}`}>
              {columns.map(column => (
                <td key={column.key} className="px-4 py-3 text-gray-700">
                  {formatValue(column.render ? column.render(row) : row[column.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function FlightLogPage() {
  const navigate = useNavigate()
  const [file, setFile] = useState(null)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const report = result?.result
  const identityItems = useMemo(() => Object.entries(report?.identity || {}), [report])

  useEffect(() => {
    // 检查体验状态
    checkFreeUsageBeforeDiagnosis().then(state => {
      if (!state.allowed) {
        navigate('/#trial')
      }
    })
  }, [navigate])

  const handleFileChange = (event) => {
    const selected = event.target.files?.[0]
    setError('')
    setResult(null)
    setFile(selected || null)
  }

  const handleAnalyze = async () => {
    if (!file) {
      setError('请先选择 .ulg 飞行日志原文件')
      return
    }

    // 再次检查体验状态
    const state = await checkFreeUsageBeforeDiagnosis()
    if (!state.allowed) {
      navigate('/#trial')
      return
    }

    const formData = new FormData()
    formData.append('log', file)
    setLoading(true)
    setError('')
    setResult(null)

    try {
      const response = await axios.post(apiUrl('/api/flight-logs/analyze'), formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 240000,
      })
      setResult(response.data)
    } catch (err) {
      setError(err.response?.data?.error || err.message || '解析失败')
    } finally {
      setLoading(false)
    }
  }

  const clear = () => {
    setFile(null)
    setResult(null)
    setError('')
    const input = document.getElementById('flight-log-input')
    if (input) input.value = ''
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/')} className="text-sm text-gray-600 hover:text-black">
              返回
            </button>
            <div className="h-6 w-px bg-gray-300" />
            <div>
              <div className="text-sm text-gray-500">华科尔 FCS-F8</div>
              <h1 className="text-xl font-semibold text-gray-950">飞行日志解析</h1>
            </div>
          </div>
          <button onClick={() => navigate('/guide')} className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50">
            维修助手
          </button>
        </div>
      </div>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="grid gap-8 lg:grid-cols-[380px_1fr]">
          <aside>
            <div className="rounded-lg border border-gray-200 bg-white p-6">
              <h2 className="text-lg font-semibold text-gray-950">上传原始日志</h2>
              <p className="mt-2 text-sm text-gray-600">
                支持华科尔 FCS-F8 / FCS-F8 SE 的标准 ULog 原始文件，文件扩展名为 .ulg。
              </p>

              <div className="mt-6">
                <label className="mb-2 block text-sm font-medium text-gray-700">日志文件</label>
                <input
                  id="flight-log-input"
                  type="file"
                  accept=".ulg,.ULG"
                  onChange={handleFileChange}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:rounded-lg file:border-0 file:bg-gray-100 file:px-4 file:py-2 file:text-sm file:font-medium file:text-gray-700 hover:file:bg-gray-200"
                />
              </div>

              {file && (
                <div className="mt-4 rounded-lg bg-gray-50 p-4 text-sm text-gray-700">
                  <div className="font-medium text-gray-950">{file.name}</div>
                  <div className="mt-1 text-gray-500">{formatBytes(file.size)}</div>
                </div>
              )}

              {error && (
                <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <div className="mt-6 flex gap-3">
                <button
                  onClick={handleAnalyze}
                  disabled={loading || !file}
                  className="flex-1 rounded-lg bg-[#FF6B00] px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? '解析中...' : '开始解析'}
                </button>
                {(file || result) && (
                  <button onClick={clear} className="rounded-lg border border-gray-300 px-4 py-3 text-sm hover:bg-gray-50">
                    清除
                  </button>
                )}
              </div>
            </div>

            <div className="mt-6 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
              <div className="font-medium">解析内容</div>
              <ul className="mt-2 space-y-1">
                <li>解锁/锁定、模式切换、failsafe 时间线</li>
                <li>GPS/GNSS、遥控通道、电机输出、电池数据</li>
                <li>日志文本、topic 字段、已知/推断/未知分层</li>
              </ul>
            </div>
          </aside>

          <section className="rounded-lg border border-gray-200 bg-white p-6">
            {!report && !loading && (
              <div className="flex min-h-[420px] flex-col items-center justify-center text-center text-gray-500">
                <div className="mb-4 text-4xl font-semibold text-gray-300">ULog</div>
                <p>上传 .ulg 原始日志后，这里会显示可读解析报告。</p>
              </div>
            )}

            {loading && (
              <div className="flex min-h-[420px] flex-col items-center justify-center text-center">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-[#FF6B00]" />
                <p className="mt-4 text-gray-600">正在解析 ULog topic、飞行状态和维修线索...</p>
              </div>
            )}

            {report && (
              <div className="space-y-8">
                <div>
                  <div className="text-sm text-gray-500">{report.originalName || report.file?.name}</div>
                  <h2 className="mt-1 text-2xl font-semibold text-gray-950">{report.overview?.conclusion}</h2>
                  <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <StatPill label="飞行时长" value={`${formatValue(report.overview?.durationSeconds)} s`} />
                    <StatPill label="Topic 数" value={report.overview?.topicCount} />
                    <StatPill label="日志文本" value={report.overview?.messageCount} />
                    <StatPill label="文件大小" value={formatBytes(report.file?.sizeBytes)} />
                  </div>
                </div>

                <PlainSummary summary={report.plainSummary} />
                <EngineerSummary summary={report.engineerSummary} />

                {identityItems.length > 0 && (
                  <Section title="设备与固件信息">
                    <div className="grid gap-3 md:grid-cols-2">
                      {identityItems.map(([key, value]) => (
                        <div key={key} className="rounded-lg bg-gray-50 p-4">
                          <div className="text-xs text-gray-500">{key}</div>
                          <div className="mt-1 break-words text-sm text-gray-800">{value}</div>
                        </div>
                      ))}
                    </div>
                  </Section>
                )}

                <Section title="异常与维修线索">
                  <div className="space-y-3">
                    {(report.anomalies || []).map((item, index) => (
                      <div key={`${item.title}-${index}`} className={`rounded-lg border p-4 ${levelClass(item.level)}`}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="font-medium">{item.title}</div>
                          <div className="text-xs opacity-80">{confidenceText(item.confidence)}</div>
                        </div>
                        <p className="mt-2 text-sm opacity-90">{item.description}</p>
                        {item.time_s !== undefined && <p className="mt-1 text-xs opacity-80">时间：{item.time_s}s</p>}
                      </div>
                    ))}
                  </div>
                </Section>

                <Section title="飞行时间线">
                  <div className="max-h-96 overflow-auto rounded-lg border border-gray-200">
                    {(report.timeline || []).length === 0 ? (
                      <p className="p-4 text-sm text-gray-500">没有检测到关键时间线事件。</p>
                    ) : (
                      <div className="divide-y divide-gray-100">
                        {report.timeline.map((event, index) => (
                          <div key={`${event.type}-${index}`} className="grid grid-cols-[90px_1fr] gap-3 px-4 py-3 text-sm">
                            <div className="font-mono text-gray-500">{formatValue(event.time_s)}s</div>
                            <div>
                              <div className="font-medium text-gray-900">{event.label}</div>
                              {event.meaning && <div className="text-xs text-gray-500">{event.field}: {event.value}</div>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </Section>

                <Section title="遥控输入">
                  <StatTable
                    items={report.rc}
                    columns={[
                      { key: 'label', label: '通道' },
                      { key: 'start', label: '开始' },
                      { key: 'end', label: '结束' },
                      { key: 'min', label: '最小' },
                      { key: 'max', label: '最大' },
                      { key: 'max_abs_deviation_from_1500', label: '偏离中位' },
                    ]}
                  />
                </Section>

                <Section title="电机输出">
                  <div className="mb-3 grid gap-3 sm:grid-cols-2">
                    <StatPill label="活跃电机数" value={report.motors?.activeCount} />
                    <StatPill label="活跃电机平均差" value={report.motors?.avgSpread} />
                  </div>
                  {report.motors?.manualLayout?.note && (
                    <p className="mb-3 rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-600">
                      按手册 Hex X（六轴 X）布局解释：MOT01-MOT06 对应 M1-M6 的前左、前右、右侧、后右、后左、左侧；实际仍以接线为准。
                    </p>
                  )}
                  <StatTable
                    items={report.motors?.motors}
                    columns={[
                      { key: 'port', label: '手册端口' },
                      { key: 'positionLabel', label: '手册位置', render: row => row.positionLabel || '-' },
                      { key: 'rotationDirection', label: '旋转方向', render: row => row.rotationDirection || '-' },
                      { key: 'field', label: '电机' },
                      { key: 'min', label: '最小' },
                      { key: 'max', label: '最大' },
                      { key: 'avg', label: '平均' },
                      { key: 'active_in_log', label: '有输出变化', render: row => (row.active_in_log ? '是' : '否') },
                      { key: 'likelyPhysicalMotor', label: '疑似实体电机', render: row => (row.likelyPhysicalMotor ? '是' : '待确认') },
                    ]}
                  />
                </Section>

                <Section title="GPS、电池与姿态概要">
                  <div className="grid gap-4 lg:grid-cols-3">
                    <div className="rounded-lg border border-gray-200 p-4">
                      <h4 className="font-medium text-gray-900">GPS/GNSS</h4>
                      <dl className="mt-3 space-y-2 text-sm text-gray-600">
                        <div className="flex justify-between gap-3"><dt>fixState</dt><dd>{formatValue(report.gps?.fixState?.min)} - {formatValue(report.gps?.fixState?.max)}</dd></div>
                        <div className="flex justify-between gap-3"><dt>卫星数</dt><dd>{formatValue(report.gps?.numSV?.min)} - {formatValue(report.gps?.numSV?.max)}</dd></div>
                        <div className="flex justify-between gap-3"><dt>水平精度</dt><dd>{formatValue(report.gps?.hAcc?.min)} - {formatValue(report.gps?.hAcc?.max)}</dd></div>
                      </dl>
                    </div>
                    <div className="rounded-lg border border-gray-200 p-4">
                      <h4 className="font-medium text-gray-900">电池</h4>
                      <dl className="mt-3 space-y-2 text-sm text-gray-600">
                        <div className="flex justify-between gap-3"><dt>原始电压</dt><dd>{formatValue(report.battery?.raw_battery_voltage?.start)} → {formatValue(report.battery?.raw_battery_voltage?.end)}</dd></div>
                        <div className="flex justify-between gap-3"><dt>智能电池电压</dt><dd>{formatValue(report.battery?.smart_bat_voltage?.start)} → {formatValue(report.battery?.smart_bat_voltage?.end)}</dd></div>
                        <div className="flex justify-between gap-3"><dt>电池温度</dt><dd>{formatValue(report.battery?.smart_bat_temperature?.max)}</dd></div>
                      </dl>
                    </div>
                    <div className="rounded-lg border border-gray-200 p-4">
                      <h4 className="font-medium text-gray-900">姿态</h4>
                      <dl className="mt-3 space-y-2 text-sm text-gray-600">
                        <div className="flex justify-between gap-3"><dt>Roll</dt><dd>{formatValue(report.attitude?.roll?.min)} - {formatValue(report.attitude?.roll?.max)}</dd></div>
                        <div className="flex justify-between gap-3"><dt>Pitch</dt><dd>{formatValue(report.attitude?.pitch?.min)} - {formatValue(report.attitude?.pitch?.max)}</dd></div>
                        <div className="flex justify-between gap-3"><dt>Yaw</dt><dd>{formatValue(report.attitude?.yaw?.min)} - {formatValue(report.attitude?.yaw?.max)}</dd></div>
                      </dl>
                    </div>
                  </div>
                </Section>

                <Section title="确认事实 / 推断 / 未知项">
                  <div className="grid gap-4 lg:grid-cols-3">
                    {Object.entries(report.confidenceNotes || {}).map(([key, values]) => (
                      <div key={key} className="rounded-lg border border-gray-200 p-4">
                        <h4 className="font-medium text-gray-900">
                          {key === 'confirmed' ? '确认事实' : key === 'inferred' ? '推断说明' : '未知项'}
                        </h4>
                        <ul className="mt-3 space-y-2 text-sm text-gray-600">
                          {(values || []).map((value, index) => <li key={index}>{value}</li>)}
                        </ul>
                      </div>
                    ))}
                  </div>
                </Section>

                <Section title="ULog Topics">
                  <StatTable
                    items={report.topics}
                    columns={[
                      { key: 'name', label: 'Topic' },
                      { key: 'rows', label: '行数' },
                      { key: 'fieldCount', label: '字段数' },
                      { key: 'fields', label: '字段预览', render: row => (row.fields || []).slice(0, 8).join(', ') },
                    ]}
                  />
                </Section>
              </div>
            )}
          </section>
        </div>
      </main>

    </div>
  )
}

export default FlightLogPage
