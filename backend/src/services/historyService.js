const fs = require('fs').promises;
const path = require('path');

const HISTORY_FILE = path.join(__dirname, '../../../data/history.json');

/**
 * 历史记录服务
 */
class HistoryService {
  constructor() {
    this.history = [];
    this.loadHistory();
  }

  /**
   * 加载历史记录
   */
  async loadHistory() {
    try {
      const data = await fs.readFile(HISTORY_FILE, 'utf-8');
      this.history = JSON.parse(data);
      console.log(`Loaded ${this.history.length} history records`);
    } catch (error) {
      console.log('No history file found, creating new one');
      this.history = [];
      await this.saveToFile();
    }
  }

  /**
   * 保存历史记录到文件
   */
  async saveToFile() {
    try {
      await fs.writeFile(HISTORY_FILE, JSON.stringify(this.history, null, 2), 'utf-8');
    } catch (error) {
      console.error('Save history error:', error);
      throw error;
    }
  }

  /**
   * 获取用户历史记录
   */
  getUserHistory(userId, limit = 50, offset = 0) {
    const userHistory = this.history
      .filter(h => h.userId === userId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(offset, offset + limit);

    return userHistory;
  }

  /**
   * 保存历史记录
   */
  async saveHistory(userId, data) {
    const record = {
      id: `history_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId,
      type: data.type, // 'text', 'conversation', 'image'
      content: data.content,
      result: data.result,
      isFavorite: false,
      createdAt: new Date().toISOString()
    };

    this.history.push(record);
    
    // 限制每个用户最多100条历史记录
    const userHistory = this.history.filter(h => h.userId === userId);
    if (userHistory.length > 100) {
      const toDelete = userHistory
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
        .slice(0, userHistory.length - 100);
      
      this.history = this.history.filter(h => !toDelete.find(d => d.id === h.id));
    }

    await this.saveToFile();
    return record;
  }

  /**
   * 删除历史记录
   */
  async deleteHistory(userId, historyId) {
    const index = this.history.findIndex(h => h.id === historyId && h.userId === userId);
    
    if (index === -1) {
      throw new Error('历史记录不存在');
    }

    this.history.splice(index, 1);
    await this.saveToFile();
    return true;
  }

  /**
   * 切换收藏状态
   */
  async toggleFavorite(userId, historyId) {
    const record = this.history.find(h => h.id === historyId && h.userId === userId);
    
    if (!record) {
      throw new Error('历史记录不存在');
    }

    record.isFavorite = !record.isFavorite;
    await this.saveToFile();
    return record;
  }
}

// 单例模式
const historyService = new HistoryService();

module.exports = historyService;
