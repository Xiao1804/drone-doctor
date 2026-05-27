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
      maxRounds: 15, // 最多15轮追问，AI会根据信息充分性自行决定何时结束
      diagnosisResult: null, // 最终诊断结果
      status: 'active' // active | completed | expired
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
    
    return session.conversationHistory
      .map(msg => `${msg.role === 'user' ? '用户' : 'AI'}: ${msg.content}`)
      .join('\n');
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
