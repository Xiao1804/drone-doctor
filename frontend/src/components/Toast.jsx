import React, { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'

let toastId = 0
const listeners = new Set()

/**
 * 全局 Toast 通知系统
 * 用法：import { showToast } from '../components/Toast'
 *       showToast('操作成功', 'success')
 *       showToast('发生错误', 'error')
 */

export function showToast(message, type = 'info', duration = 3000) {
  const id = ++toastId
  const toast = { id, message, type, duration }
  listeners.forEach(fn => fn(toast))
  return id
}

function ToastContainer() {
  const [toasts, setToasts] = useState([])

  useEffect(() => {
    const handler = (toast) => {
      setToasts(prev => [...prev, toast])
    }
    listeners.add(handler)
    return () => listeners.delete(handler)
  }, [])

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  return createPortal(
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
      {toasts.map(toast => (
        <ToastItem key={toast.id} toast={toast} onRemove={removeToast} />
      ))}
    </div>,
    document.body
  )
}

function ToastItem({ toast, onRemove }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))
    const timer = setTimeout(() => {
      setVisible(false)
      setTimeout(() => onRemove(toast.id), 300)
    }, toast.duration)
    return () => clearTimeout(timer)
  }, [toast.id, toast.duration, onRemove])

  const typeStyles = {
    success: 'bg-green-500 text-white',
    error: 'bg-red-500 text-white',
    info: 'bg-gray-800 text-white',
    warning: 'bg-yellow-500 text-black',
  }

  const icons = {
    success: '✓',
    error: '✕',
    info: 'ℹ',
    warning: '⚠',
  }

  return (
    <div
      className={`
        pointer-events-auto px-4 py-3 rounded-lg shadow-lg flex items-center gap-2
        transition-all duration-300 ease-out min-w-[240px] max-w-[360px]
        ${typeStyles[toast.type] || typeStyles.info}
        ${visible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-8'}
      `}
    >
      <span className="font-bold text-sm">{icons[toast.type] || icons.info}</span>
      <span className="text-sm flex-1">{toast.message}</span>
    </div>
  )
}

export default ToastContainer
