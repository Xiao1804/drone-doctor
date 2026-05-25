const { query, run } = require('../db');

/**
 * 历史记录服务（SQLite 版本）
 */
class HistoryService {
  /**
   * 获取用户历史记录
   */
  async getUserHistory(userId, limit = 50, offset = 0) {
    const result = await query(
      `SELECT * FROM history 
       WHERE user_id = ? 
       ORDER BY created_at DESC 
       LIMIT ? OFFSET ?`,
      [userId, limit, offset]
    );

    return result.rows.map(row => this.formatHistory(row));
  }

  /**
   * 保存历史记录
   */
  async saveHistory(userId, data) {
    const id = `history_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    await run(
      `INSERT INTO history (id, user_id, type, content, result, is_favorite, created_at)
       VALUES (?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP)`,
      [id, userId, data.type, data.content, JSON.stringify(data.result)]
    );

    const result = await query('SELECT * FROM history WHERE id = ?', [id]);
    return this.formatHistory(result.rows[0]);
  }

  /**
   * 删除历史记录
   */
  async deleteHistory(userId, historyId) {
    const result = await run(
      'DELETE FROM history WHERE id = ? AND user_id = ?',
      [historyId, userId]
    );

    if (result.changes === 0) {
      throw new Error('历史记录不存在');
    }

    return true;
  }

  /**
   * 切换收藏状态
   */
  async toggleFavorite(userId, historyId) {
    await run(
      `UPDATE history 
       SET is_favorite = CASE WHEN is_favorite = 1 THEN 0 ELSE 1 END 
       WHERE id = ? AND user_id = ?`,
      [historyId, userId]
    );

    const result = await query('SELECT * FROM history WHERE id = ?', [historyId]);
    if (result.rows.length === 0) {
      throw new Error('历史记录不存在');
    }

    return this.formatHistory(result.rows[0]);
  }

  /**
   * 格式化历史记录数据
   */
  formatHistory(row) {
    return {
      id: row.id,
      userId: row.user_id,
      type: row.type,
      content: row.content,
      result: row.result ? JSON.parse(row.result) : null,
      isFavorite: row.is_favorite === 1,
      createdAt: row.created_at
    };
  }
}

module.exports = new HistoryService();
