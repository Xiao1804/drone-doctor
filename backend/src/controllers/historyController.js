const historyService = require('../services/historyService');

/**
 * 获取历史记录
 */
exports.getHistory = async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    const history = historyService.getUserHistory(req.userId, parseInt(limit), parseInt(offset));

    res.json({
      success: true,
      total: history.length,
      history
    });

  } catch (error) {
    console.error('Get history error:', error);
    res.status(500).json({ error: '获取历史记录失败' });
  }
};

/**
 * 保存历史记录
 */
exports.saveHistory = async (req, res) => {
  try {
    const { type, content, result } = req.body;

    if (!type || !content || !result) {
      return res.status(400).json({ error: '缺少必要字段' });
    }

    const history = await historyService.saveHistory(req.userId, {
      type,
      content,
      result
    });

    res.json({
      success: true,
      message: '保存成功',
      history
    });

  } catch (error) {
    console.error('Save history error:', error);
    res.status(500).json({ error: '保存历史记录失败' });
  }
};

/**
 * 删除历史记录
 */
exports.deleteHistory = async (req, res) => {
  try {
    const { id } = req.params;

    await historyService.deleteHistory(req.userId, id);

    res.json({
      success: true,
      message: '删除成功'
    });

  } catch (error) {
    console.error('Delete history error:', error);
    res.status(400).json({ error: error.message });
  }
};

/**
 * 切换收藏状态
 */
exports.toggleFavorite = async (req, res) => {
  try {
    const { id } = req.params;

    const history = await historyService.toggleFavorite(req.userId, id);

    res.json({
      success: true,
      message: history.isFavorite ? '已收藏' : '已取消收藏',
      history
    });

  } catch (error) {
    console.error('Toggle favorite error:', error);
    res.status(400).json({ error: error.message });
  }
};
