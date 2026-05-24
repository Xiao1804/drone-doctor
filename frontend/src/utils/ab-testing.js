/**
 * DroneDoctor - A/B Testing Framework
 * 
 * 简单的A/B测试框架，用于测试不同的UI变体和优化转化率。
 */

class ABTesting {
  constructor() {
    this.experiments = new Map()
    this.results = new Map()
    this.loadFromStorage()
  }
  
  /**
   * 创建实验
   * @param {string} experimentId - 实验ID
   * @param {Object} config - 实验配置
   * @param {Array} config.variants - 变体配置
   * @param {number} config.traffic - 流量分配（0-1）
   */
  createExperiment(experimentId, config) {
    const experiment = {
      id: experimentId,
      variants: config.variants,
      traffic: config.traffic || 1.0,
      createdAt: Date.now(),
      status: 'running'
    }
    
    this.experiments.set(experimentId, experiment)
    this.saveToStorage()
    
    return experiment
  }
  
  /**
   * 获取用户的实验变体
   * @param {string} experimentId - 实验ID
   * @param {string} userId - 用户ID（可选）
   * @returns {string} 变体ID
   */
  getVariant(experimentId, userId = null) {
    const experiment = this.experiments.get(experimentId)
    
    if (!experiment || experiment.status !== 'running') {
      return 'control'
    }
    
    // 检查流量分配
    if (Math.random() > experiment.traffic) {
      return 'control'
    }
    
    // 使用用户ID或随机分配
    const userKey = userId || this.getOrCreateUserId()
    const hash = this.hashString(`${experimentId}-${userKey}`)
    const variantIndex = hash % experiment.variants.length
    
    return experiment.variants[variantIndex].id
  }
  
  /**
   * 记录实验事件
   * @param {string} experimentId - 实验ID
   * @param {string} variantId - 变体ID
   * @param {string} eventName - 事件名称
   * @param {Object} data - 事件数据
   */
  trackEvent(experimentId, variantId, eventName, data = {}) {
    const key = `${experimentId}-${variantId}-${eventName}`
    
    if (!this.results.has(key)) {
      this.results.set(key, {
        experimentId,
        variantId,
        eventName,
        count: 0,
        data: []
      })
    }
    
    const result = this.results.get(key)
    result.count++
    result.data.push({
      timestamp: Date.now(),
      ...data
    })
    
    this.saveToStorage()
  }
  
  /**
   * 获取实验结果
   * @param {string} experimentId - 实验ID
   * @returns {Object} 实验结果
   */
  getResults(experimentId) {
    const experiment = this.experiments.get(experimentId)
    
    if (!experiment) {
      return null
    }
    
    const results = {
      experimentId,
      status: experiment.status,
      variants: experiment.variants.map(variant => {
        const variantResults = {
          id: variant.id,
          name: variant.name,
          metrics: {}
        }
        
        // 计算各种指标
        const exposures = this.results.get(`${experimentId}-${variant.id}-exposure`) || { count: 0 }
        const conversions = this.results.get(`${experimentId}-${variant.id}-conversion`) || { count: 0 }
        
        variantResults.metrics = {
          exposures: exposures.count,
          conversions: conversions.count,
          conversionRate: exposures.count > 0 
            ? (conversions.count / exposures.count * 100).toFixed(2) + '%'
            : '0%'
        }
        
        return variantResults
      })
    }
    
    return results
  }
  
  /**
   * 结束实验
   * @param {string} experimentId - 实验ID
   * @param {string} winnerId - 获胜变体ID
   */
  endExperiment(experimentId, winnerId = null) {
    const experiment = this.experiments.get(experimentId)
    
    if (experiment) {
      experiment.status = 'completed'
      experiment.winner = winnerId
      experiment.completedAt = Date.now()
      
      this.saveToStorage()
    }
  }
  
  /**
   * 获取或创建用户ID
   */
  getOrCreateUserId() {
    let userId = localStorage.getItem('ab_user_id')
    
    if (!userId) {
      userId = 'user_' + Math.random().toString(36).substr(2, 9)
      localStorage.setItem('ab_user_id', userId)
    }
    
    return userId
  }
  
  /**
   * 简单的字符串哈希
   */
  hashString(str) {
    let hash = 0
    
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash
    }
    
    return Math.abs(hash)
  }
  
  /**
   * 保存到本地存储
   */
  saveToStorage() {
    try {
      localStorage.setItem('ab_experiments', JSON.stringify(Array.from(this.experiments.entries())))
      localStorage.setItem('ab_results', JSON.stringify(Array.from(this.results.entries())))
    } catch (e) {
      console.error('Failed to save A/B testing data:', e)
    }
  }
  
  /**
   * 从本地存储加载
   */
  loadFromStorage() {
    try {
      const experiments = localStorage.getItem('ab_experiments')
      const results = localStorage.getItem('ab_results')
      
      if (experiments) {
        this.experiments = new Map(JSON.parse(experiments))
      }
      
      if (results) {
        this.results = new Map(JSON.parse(results))
      }
    } catch (e) {
      console.error('Failed to load A/B testing data:', e)
    }
  }
  
  /**
   * 清除所有数据
   */
  clearAll() {
    this.experiments.clear()
    this.results.clear()
    localStorage.removeItem('ab_experiments')
    localStorage.removeItem('ab_results')
    localStorage.removeItem('ab_user_id')
  }
}

// 创建单例
const abTesting = new ABTesting()

// 导出
export default abTesting

// 示例使用：
// 
// // 创建实验
// abTesting.createExperiment('button_color_test', {
//   variants: [
//     { id: 'control', name: '橙色按钮' },
//     { id: 'variant_a', name: '黑色按钮' },
//     { id: 'variant_b', name: '蓝色按钮' }
//   ],
//   traffic: 0.5 // 50%流量参与实验
// })
// 
// // 获取变体
// const variant = abTesting.getVariant('button_color_test')
// 
// // 记录曝光
// abTesting.trackEvent('button_color_test', variant, 'exposure')
// 
// // 记录转化
// abTesting.trackEvent('button_color_test', variant, 'conversion', {
//   type: 'click',
//   element: 'diagnosis_button'
// })
// 
// // 获取结果
// const results = abTesting.getResults('button_color_test')
// console.log(results)
