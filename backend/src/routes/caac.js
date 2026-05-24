const express = require('express');
const router = express.Router();

// 获取CAAC题库
router.get('/questions', (req, res) => {
  const { category = 'theory', page = 1, pageSize = 20 } = req.query;
  
  res.json({
    success: true,
    questions: [
      {
        id: 1,
        question: '无人机的最大飞行高度是多少？',
        options: ['A. 100米', 'B. 120米', 'C. 150米', 'D. 200米'],
        answer: 'B',
        explanation: '根据民航局规定，无人机最大飞行高度为120米'
      }
    ],
    total: 2000,
    page: parseInt(page),
    pageSize: parseInt(pageSize)
  });
});

// 获取考试大纲
router.get('/syllabus', (req, res) => {
  res.json({
    success: true,
    syllabus: {
      theory: [
        '无人机概述与系统组成',
        '民航法规与术语',
        '航空气象与飞行环境',
        '飞行原理与飞行性能'
      ],
      practice: [
        '模拟飞行',
        '无人机拆装、维护和保养',
        '地面站设置与任务规划',
        '起飞与降落训练'
      ]
    }
  });
});

module.exports = router;
