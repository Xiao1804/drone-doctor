/**
 * DroneDoctor Design System - UI Components
 * 
 * 可复用的UI组件库，基于设计系统规范。
 */

import React from 'react'
import './ui.css'

// ==================== 按钮组件 ====================

export function Button({ 
  children, 
  variant = 'primary', 
  size = 'md', 
  loading = false,
  disabled = false,
  className = '',
  ...props 
}) {
  const baseClass = 'btn'
  const variantClass = `btn-${variant}`
  const sizeClass = size !== 'md' ? `btn-${size}` : ''
  
  return (
    <button
      className={`${baseClass} ${variantClass} ${sizeClass} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <span className="spinner" />}
      {children}
    </button>
  )
}

// ==================== 输入框组件 ====================

export function Input({ 
  size = 'md',
  error = false,
  className = '',
  ...props 
}) {
  const sizeClass = size !== 'md' ? `input-${size}` : ''
  const errorClass = error ? 'input-error' : ''
  
  return (
    <input
      className={`input ${sizeClass} ${errorClass} ${className}`}
      {...props}
    />
  )
}

// ==================== 卡片组件 ====================

export function Card({ 
  children, 
  elevated = false,
  hoverable = true,
  className = '',
  ...props 
}) {
  const elevatedClass = elevated ? 'card-elevated' : ''
  const hoverableClass = hoverable ? 'card-hoverable' : ''
  
  return (
    <div
      className={`card ${elevatedClass} ${hoverableClass} ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}

// ==================== 标签组件 ====================

export function Tag({ 
  children, 
  variant = 'default',
  removable = false,
  onRemove,
  className = '',
  ...props 
}) {
  const variantClass = variant !== 'default' ? `tag-${variant}` : ''
  
  return (
    <span
      className={`tag ${variantClass} ${className}`}
      {...props}
    >
      {children}
      {removable && (
        <button
          onClick={onRemove}
          className="tag-remove"
          aria-label="移除标签"
        >
          ×
        </button>
      )}
    </span>
  )
}

// ==================== 徽章组件 ====================

export function Badge({ 
  children, 
  variant = 'default',
  className = '',
  ...props 
}) {
  const variantClass = variant !== 'default' ? `badge-${variant}` : ''
  
  return (
    <span
      className={`badge ${variantClass} ${className}`}
      {...props}
    >
      {children}
    </span>
  )
}

// ==================== 加载状态组件 ====================

export function Spinner({ size = 'md', className = '' }) {
  const sizeClass = size !== 'md' ? `spinner-${size}` : ''
  
  return (
    <div
      className={`spinner ${sizeClass} ${className}`}
      role="status"
      aria-label="加载中"
    />
  )
}

export function Skeleton({ 
  width, 
  height, 
  variant = 'text',
  className = '' 
}) {
  const variantClass = `skeleton-${variant}`
  
  return (
    <div
      className={`skeleton ${variantClass} ${className}`}
      style={{ width, height }}
      aria-hidden="true"
    />
  )
}

// ==================== 提示组件 ====================

export function Tooltip({ 
  children, 
  content,
  position = 'top',
  className = '' 
}) {
  return (
    <div className={`tooltip tooltip-${position} ${className}`}>
      {children}
      <div className="tooltip-content" role="tooltip">
        {content}
      </div>
    </div>
  )
}

// ==================== 动画容器组件 ====================

export function AnimatedContainer({ 
  children, 
  animation = 'fadeIn',
  delay = 0,
  className = '' 
}) {
  return (
    <div
      className={`animate-${animation} ${className}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      {children}
    </div>
  )
}

// ==================== 交互反馈组件 ====================

export function Ripple({ children, className = '' }) {
  const handleClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    
    const ripple = document.createElement('span')
    ripple.className = 'ripple-effect'
    ripple.style.left = `${x}px`
    ripple.style.top = `${y}px`
    
    e.currentTarget.appendChild(ripple)
    
    setTimeout(() => {
      ripple.remove()
    }, 600)
  }
  
  return (
    <div
      className={`ripple-container ${className}`}
      onClick={handleClick}
    >
      {children}
    </div>
  )
}

// ==================== 进度指示器 ====================

export function Progress({ 
  value = 0, 
  max = 100,
  variant = 'default',
  size = 'md',
  showLabel = false,
  className = '' 
}) {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100)
  
  return (
    <div className={`progress progress-${variant} progress-${size} ${className}`}>
      <div className="progress-track">
        <div 
          className="progress-fill" 
          style={{ width: `${percentage}%` }}
          role="progressbar"
          aria-valuenow={value}
          aria-valuemin={0}
          aria-valuemax={max}
        />
      </div>
      {showLabel && (
        <span className="progress-label">{Math.round(percentage)}%</span>
      )}
    </div>
  )
}

// ==================== 空状态组件 ====================

export function EmptyState({ 
  icon,
  title,
  description,
  action,
  className = '' 
}) {
  return (
    <div className={`empty-state ${className}`}>
      {icon && <div className="empty-state-icon">{icon}</div>}
      {title && <h3 className="empty-state-title">{title}</h3>}
      {description && <p className="empty-state-description">{description}</p>}
      {action && <div className="empty-state-action">{action}</div>}
    </div>
  )
}

// ==================== 错误边界组件 ====================

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }
  
  static getDerivedStateFromError(error) {
    return { hasError: true }
  }
  
  componentDidCatch(error, errorInfo) {
    console.error('Error caught by boundary:', error, errorInfo)
  }
  
  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <h2>出现了一些问题</h2>
          <button onClick={() => window.location.reload()}>
            刷新页面
          </button>
        </div>
      )
    }
    
    return this.props.children
  }
}
