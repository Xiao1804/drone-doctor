import React, { useState } from 'react';

/**
 * 飞行日志事件类型图标映射
 */
const EVENT_ICONS = {
  unlock: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
    </svg>
  ),
  lock: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
    </svg>
  ),
  mode_change: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
    </svg>
  ),
  failsafe: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  ),
  error: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  warning: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  ),
  info: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  gps: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  battery: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  ),
  rc: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
    </svg>
  ),
};

/**
 * 严重程度样式映射
 */
const SEVERITY_STYLES = {
  critical: {
    dot: 'bg-red-500 ring-red-200 dark:bg-red-500 dark:ring-red-900',
    text: 'text-red-700 dark:text-red-400',
    border: 'border-red-200 dark:border-red-800',
    bg: 'bg-red-50 dark:bg-red-900/20',
  },
  warning: {
    dot: 'bg-amber-500 ring-amber-200 dark:bg-amber-500 dark:ring-amber-900',
    text: 'text-amber-700 dark:text-amber-400',
    border: 'border-amber-200 dark:border-amber-800',
    bg: 'bg-amber-50 dark:bg-amber-900/20',
  },
  info: {
    dot: 'bg-blue-500 ring-blue-200 dark:bg-blue-500 dark:ring-blue-900',
    text: 'text-blue-700 dark:text-blue-400',
    border: 'border-blue-200 dark:border-blue-800',
    bg: 'bg-blue-50 dark:bg-blue-900/20',
  },
};

/**
 * 默认事件图标
 */
const DEFAULT_ICON = EVENT_ICONS.info;

/**
 * 格式化时间戳显示
 * @param {string} timestamp - ISO 8601 时间字符串
 * @returns {string}
 */
function formatTimestamp(timestamp) {
  if (!timestamp) return '--:--:--';
  try {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  } catch {
    return String(timestamp);
  }
}

/**
 * 格式化日期显示
 * @param {string} timestamp - ISO 8601 时间字符串
 * @returns {string}
 */
function formatDate(timestamp) {
  if (!timestamp) return '';
  try {
    const date = new Date(timestamp);
    return date.toLocaleDateString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
    });
  } catch {
    return '';
  }
}

/**
 * 飞行日志时间线组件
 *
 * @param {Object} props
 * @param {Array} props.events - 飞行日志事件数组
 * @param {string} props.events[].timestamp - 事件时间戳（ISO 8601）
 * @param {string} props.events[].type - 事件类型（unlock/lock/mode_change/failsafe/error/warning/info/gps/battery/rc）
 * @param {string} props.events[].description - 事件描述
 * @param {string} props.events[].severity - 严重程度（critical/warning/info）
 * @param {Object} [props.events[].details] - 详细数据（点击展开）
 * @param {string} [props.className] - 额外类名
 */
export default function TimelineView({ events = [], className = '' }) {
  const [expandedIndex, setExpandedIndex] = useState(null);

  if (!events || events.length === 0) {
    return (
      <div className={`flex items-center justify-center py-12 text-gray-400 dark:text-gray-500 ${className}`}>
        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        暂无飞行日志事件
      </div>
    );
  }

  // 按时间排序
  const sortedEvents = [...events].sort((a, b) => {
    return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
  });

  const toggleExpand = (index) => {
    setExpandedIndex(expandedIndex === index ? null : index);
  };

  return (
    <div className={`w-full ${className}`}>
      <div className="relative">
        {/* 垂直时间轴线 */}
        <div className="absolute left-[19px] top-2 bottom-2 w-px bg-gray-200 dark:bg-gray-700" />

        <ul className="space-y-0">
          {sortedEvents.map((event, index) => {
            const severity = event.severity || 'info';
            const styles = SEVERITY_STYLES[severity] || SEVERITY_STYLES.info;
            const icon = EVENT_ICONS[event.type] || DEFAULT_ICON;
            const isExpanded = expandedIndex === index;
            const hasDetails = event.details && Object.keys(event.details).length > 0;

            return (
              <li
                key={`${event.timestamp}-${index}`}
                className="relative flex items-start gap-4 py-3 group"
              >
                {/* 时间节点圆点 */}
                <div className="relative z-10 flex-shrink-0 mt-0.5">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center ring-4 ${styles.dot} text-white transition-transform group-hover:scale-110`}
                  >
                    {icon}
                  </div>
                </div>

                {/* 事件内容 */}
                <div className="flex-1 min-w-0">
                  <button
                    onClick={() => hasDetails && toggleExpand(index)}
                    className={`w-full text-left rounded-lg border p-3 transition-colors ${
                      hasDetails ? 'cursor-pointer hover:shadow-sm' : 'cursor-default'
                    } ${styles.border} ${styles.bg}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        {/* 时间戳 */}
                        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mb-1">
                          <span className="font-mono font-medium">{formatTimestamp(event.timestamp)}</span>
                          {formatDate(event.timestamp) && (
                            <span className="text-gray-400 dark:text-gray-500">{formatDate(event.timestamp)}</span>
                          )}
                          <span
                            className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide ${styles.text} bg-white/60 dark:bg-black/20`}
                          >
                            {event.type}
                          </span>
                        </div>

                        {/* 事件描述 */}
                        <p className={`text-sm font-medium ${styles.text}`}>
                          {event.description || '未命名事件'}
                        </p>
                      </div>

                      {/* 展开指示器 */}
                      {hasDetails && (
                        <div className="flex-shrink-0 mt-1">
                          <svg
                            className={`w-4 h-4 text-gray-400 dark:text-gray-500 transition-transform ${
                              isExpanded ? 'rotate-180' : ''
                            }`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      )}
                    </div>

                    {/* 展开的详细数据 */}
                    {isExpanded && hasDetails && (
                      <div className="mt-3 pt-3 border-t border-gray-200/60 dark:border-gray-700/60">
                        <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
                          {Object.entries(event.details).map(([key, value]) => (
                            <div key={key} className="flex gap-2">
                              <span className="font-medium text-gray-500 dark:text-gray-400 min-w-[80px]">{key}:</span>
                              <span className="font-mono break-all">
                                {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
