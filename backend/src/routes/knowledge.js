const express = require('express');
const router = express.Router();

// 获取知识库分类
router.get('/categories', (req, res) => {
  res.json({
    success: true,
    categories: [
      { id: 'battery', name: '电池故障', icon: '🔋', count: 15 },
      { id: 'gps', name: 'GPS故障', icon: '📡', count: 12 },
      { id: 'motor', name: '电机故障', icon: '⚙️', count: 18 },
      { id: 'camera', name: '图传故障', icon: '📷', count: 10 },
      { id: 'gimbal', name: '云台故障', icon: '🎯', count: 8 },
      { id: 'flight', name: '飞行故障', icon: '🚁', count: 20 }
    ]
  });
});

// 获取知识库文章
router.get('/articles/:id', (req, res) => {
  res.json({
    success: true,
    article: {
      id: req.params.id,
      title: '示例文章',
      content: '文章内容待补充'
    }
  });
});

module.exports = router;
