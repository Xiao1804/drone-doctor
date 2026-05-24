const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const diagnosisRoutes = require('./routes/diagnosis');
const knowledgeRoutes = require('./routes/knowledge');
const caacRoutes = require('./routes/caac');
const casesRoutes = require('./routes/cases');
const imageRoutes = require('./routes/image');
const userRoutes = require('./routes/user');
const historyRoutes = require('./routes/history');

const app = express();

// 中间件
app.use(cors());
app.use(express.json());

// 限流
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 100 // 限制100次请求
});
app.use('/api/', limiter);

// 路由
app.use('/api/diagnosis', diagnosisRoutes);
app.use('/api/knowledge', knowledgeRoutes);
app.use('/api/caac', caacRoutes);
app.use('/api/cases', casesRoutes);
app.use('/api/image', imageRoutes);
app.use('/api/user', userRoutes);
app.use('/api/history', historyRoutes);

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 错误处理
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`DroneDoctor API running on port ${PORT}`);
});

module.exports = app;
