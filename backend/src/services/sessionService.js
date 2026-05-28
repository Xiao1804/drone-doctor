/**
 * Session管理服务
 * 用于管理多轮诊断对话的会话状态
 */

class SessionService {
  constructor() {
    this.sessions = new Map();
    this.SESSION_TIMEOUT = 30 * 60 * 1000; // 30分钟
    
    // 定期清理过期会话
    setInterval(() => this.cleanupExpiredSessions(), 5 * 60 * 1000);
  }

  /**
   * 创建新会话
   * @returns {string} sessionId
   */
  createSession() {
    const sessionId = this.generateSessionId();
    const session = {
      id: sessionId,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      conversationHistory: [], // 对话历史
      currentRound: 0, // 当前轮次
      maxRounds: 10, // 最多10轮追问（优化后缩短，防止废话过多）
      diagnosisResult: null, // 最终诊断结果
      status: 'active', // active | completed | expired
      // 新增：结构化信息收集清单
      infoChecklist: {
        brand: { collected: false, value: null, question: '请问您的无人机品牌是什么？', options: ['大疆(DJI)', '道通(Autel)', '极飞(XAG)', '其他品牌'] },
        model: { collected: false, value: null, question: '请问具体型号是什么？', options: [] }, // 选项根据品牌动态填充
        symptom: { collected: false, value: null, question: '请描述故障现象', options: [] },
        environment: { collected: false, value: null, question: '故障是在什么环境下出现的？', options: ['室内', '空旷户外', '高楼密集区', '山区/树林', '其他'] },
        attempted: { collected: false, value: null, question: '您已经尝试过哪些排查步骤？', options: ['重启设备', '重新校准', '更换电池', '更新固件', '未尝试'] }
      }
    };
    
    this.sessions.set(sessionId, session);
    console.log(`Session created: ${sessionId}`);
    return sessionId;
  }

  /**
   * 获取会话
   * @param {string} sessionId 
   * @returns {Object|null}
   */
  getSession(sessionId) {
    const session = this.sessions.get(sessionId);
    
    if (!session) {
      return null;
    }
    
    // 检查是否过期
    if (Date.now() - session.lastActivityAt > this.SESSION_TIMEOUT) {
      session.status = 'expired';
      return null;
    }
    
    return session;
  }

  /**
   * 更新信息收集清单
   * @param {string} sessionId 
   * @param {string} field 字段名
   * @param {any} value 值
   */
  updateInfoChecklist(sessionId, field, value) {
    const session = this.getSession(sessionId);
    if (!session || !session.infoChecklist[field]) return null;
    
    session.infoChecklist[field].collected = true;
    session.infoChecklist[field].value = value;
    session.lastActivityAt = Date.now();
    
    // 如果品牌已收集，更新型号选项
    if (field === 'brand') {
      const brandModelMap = {
        '大疆(DJI)': ['Mavic 3', 'Air 3', 'Mini 4 Pro', 'Phantom 4', 'Inspire 3', 'T40', '其他型号'],
        '道通(Autel)': ['EVO II', 'EVO Nano', 'EVO Lite', '其他型号'],
        '极飞(XAG)': ['P100', 'P80', 'V40', '其他型号'],
        '其他品牌': ['请手动输入']
      };
      session.infoChecklist.model.options = brandModelMap[value] || ['请手动输入'];
    }
    
    return session;
  }

  /**
   * 获取下一个需要收集的信息
   * @param {string} sessionId 
   * @returns {Object|null} {field, question, options} 或 null表示已收集完毕
   */
  getNextMissingInfo(sessionId) {
    const session = this.getSession(sessionId);
    if (!session) return null;
    
    const checklist = session.infoChecklist;
    const order = ['brand', 'model', 'symptom', 'environment', 'attempted'];
    
    for (const field of order) {
      if (!checklist[field].collected) {
        return {
          field,
          question: checklist[field].question,
          options: checklist[field].options
        };
      }
    }
    
    return null; // 所有信息已收集完毕
  }

  /**
   * 检查信息是否收集完毕
   * @param {string} sessionId 
   * @returns {boolean}
   */
  isInfoComplete(sessionId) {
    const session = this.getSession(sessionId);
    if (!session) return false;
    
    return Object.values(session.infoChecklist).every(item => item.collected);
  }

  /**
   * 获取已收集的信息摘要
   * @param {string} sessionId 
   * @returns {Object}
   */
  getCollectedInfo(sessionId) {
    const session = this.getSession(sessionId);
    if (!session) return {};
    
    const info = {};
    for (const [field, item] of Object.entries(session.infoChecklist)) {
      if (item.collected) {
        info[field] = item.value;
      }
    }
    return info;
  }

  /**
   * 添加对话消息
   * @param {string} sessionId 
   * @param {Object} message {role: 'user'|'assistant', content: string, type: 'symptom'|'question'|'answer'|'diagnosis'}
   */
  addMessage(sessionId, message) {
    const session = this.getSession(sessionId);
    
    if (!session) {
      throw new Error('Session not found or expired');
    }
    
    session.conversationHistory.push({
      ...message,
      timestamp: Date.now()
    });
    
    session.lastActivityAt = Date.now();
    
    // 如果是用户回答，增加轮次
    if (message.role === 'user' && message.type === 'answer') {
      session.currentRound++;
    }
    
    return session;
  }

  /**
   * 更新诊断结果
   * @param {string} sessionId 
   * @param {Object} result 
   */
  setDiagnosisResult(sessionId, result) {
    const session = this.getSession(sessionId);
    
    if (!session) {
      throw new Error('Session not found or expired');
    }
    
    session.diagnosisResult = result;
    session.status = 'completed';
    session.lastActivityAt = Date.now();
    
    return session;
  }

  /**
   * 检查是否可以继续追问
   * @param {string} sessionId 
   * @returns {boolean}
   */
  canAskMore(sessionId) {
    const session = this.getSession(sessionId);
    
    if (!session) {
      return false;
    }
    
    return session.currentRound < session.maxRounds && session.status === 'active';
  }

  /**
   * 获取对话上下文（用于AI prompt）
   * @param {string} sessionId 
   * @returns {string}
   */
  getConversationContext(sessionId) {
    const session = this.getSession(sessionId);
    
    if (!session) {
      return '';
    }
    
    // 优先使用结构化的已收集信息
    const collectedInfo = this.getCollectedInfo(sessionId);
    let context = '';
    
    if (Object.keys(collectedInfo).length > 0) {
      context += '【已收集信息】\n';
      if (collectedInfo.brand) context += `- 品牌: ${collectedInfo.brand}\n`;
      if (collectedInfo.model) context += `- 型号: ${collectedInfo.model}\n`;
      if (collectedInfo.symptom) context += `- 故障现象: ${collectedInfo.symptom}\n`;
      if (collectedInfo.environment) context += `- 发生环境: ${collectedInfo.environment}\n`;
      if (collectedInfo.attempted) context += `- 已尝试排查: ${collectedInfo.attempted}\n`;
      context += '\n';
    }
    
    context += '【对话历史】\n';
    context += session.conversationHistory
      .map(msg => `${msg.role === 'user' ? '用户' : 'AI'}: ${msg.content}`)
      .join('\n');
    
    return context;
  }

  /**
   * 删除会话
   * @param {string} sessionId 
   */
  deleteSession(sessionId) {
    this.sessions.delete(sessionId);
    console.log(`Session deleted: ${sessionId}`);
  }

  /**
   * 清理过期会话
   */
  cleanupExpiredSessions() {
    const now = Date.now();
    let cleanedCount = 0;
    
    for (const [sessionId, session] of this.sessions.entries()) {
      if (now - session.lastActivityAt > this.SESSION_TIMEOUT) {
        this.sessions.delete(sessionId);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      console.log(`Cleaned ${cleanedCount} expired sessions`);
    }
  }

  /**
   * 生成会话ID
   * @returns {string}
   */
  generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 获取会话统计信息
   * @returns {Object}
   */
  getStats() {
    return {
      totalSessions: this.sessions.size,
      activeSessions: Array.from(this.sessions.values()).filter(s => s.status === 'active').length,
      completedSessions: Array.from(this.sessions.values()).filter(s => s.status === 'completed').length
    };
  }
}

// 单例模式
const sessionService = new SessionService();

module.exports = sessionService;
