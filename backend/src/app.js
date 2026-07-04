const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { initDatabase, query } = require('./db');
const packageInfo = require('../package.json');

const diagnosisRoutes = require('./routes/diagnosis');
const knowledgeRoutes = require('./routes/knowledge');
const caacRoutes = require('./routes/caac');
const casesRoutes = require('./routes/cases');
const imageRoutes = require('./routes/image');
const userRoutes = require('./routes/user');
const decisionTreeRoutes = require('./routes/decisionTrees');
const eventsRoutes = require('./routes/events');
const statsRoutes = require('./routes/stats');
const flightLogRoutes = require('./routes/flightLog');
const diagnosisAgentRoutes = require('./routes/diagnosisAgent');
const unifiedDiagnosisRoutes = require('./routes/unifiedDiagnosis');
const feedbackRoutes = require('./routes/feedback');
const couponRoutes = require('./routes/coupon');
const agentRoutes = require('./routes/agent');

const { errorHandler } = require('./middleware/errorHandler');
const { requestContext } = require('./middleware/requestContext');
const logger = require('./utils/logger');
const {
  createGlobalApiLimiter,
  createAuthLimiters,
} = require('./middleware/rateLimiters');

const app = express();

// 信任代理（nginx 反向代理场景，1层代理）
app.set('trust proxy', 1);
app.use(requestContext);

const DEFAULT_ALLOWED_ORIGINS = process.env.NODE_ENV === 'production'
  ? []
  : ['http://localhost:5173', 'http://localhost:3000'];

function getAllowedOrigins() {
  const configuredOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);

  return new Set([...DEFAULT_ALLOWED_ORIGINS, ...configuredOrigins]);
}

const allowedOrigins = getAllowedOrigins();
const allowAllOrigins = allowedOrigins.has('*');

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowAllOrigins || allowedOrigins.has(origin)) {
      return callback(null, true);
    }

    return callback(null, false);
  },
  credentials: true
}));

// 全局 API 速率限制：每 15 分钟 100 次
app.use('/api/', createGlobalApiLimiter());

// 先限速再解析 JSON，避免畸形或超大请求绕过频率控制。
app.use(express.json({ limit: '64kb', strict: true }));

// 登录接口独立速率限制：每分钟最多 5 次
const authLimiters = createAuthLimiters();

app.use('/api/diagnosis', diagnosisRoutes);
app.use('/api/knowledge', knowledgeRoutes);
app.use('/api/caac', caacRoutes);
app.use('/api/cases', casesRoutes);
app.use('/api/image', imageRoutes);
app.use('/api/user', userRoutes(authLimiters));
app.use('/api/decision-trees', decisionTreeRoutes);
app.use('/api/events', eventsRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/flight-logs', flightLogRoutes);
app.use('/api/diagnosis/agent', diagnosisAgentRoutes);
app.use('/api/diagnosis/unified', unifiedDiagnosisRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/coupon', couponRoutes);
app.use('/api/agent', agentRoutes);

app.get('/health', async (req, res) => {
  const version = process.env.APP_VERSION || packageInfo.version;

  try {
    await query('SELECT 1 AS healthy');
    res.json({
      status: 'ok',
      version,
      database: 'ok',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('health_database_failed', { message: error.message });
    res.status(503).json({
      status: 'degraded',
      version,
      database: 'unavailable',
      timestamp: new Date().toISOString(),
    });
  }
});

app.use(errorHandler);

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

async function startServer() {
  try {
    await initDatabase();
    // 加载已批准的决策树变更
    await decisionTreeRoutes.loadApprovedChanges();
    app.listen(PORT, HOST, () => {
      logger.info('server_started', {
        host: HOST,
        port: PORT,
        version: process.env.APP_VERSION || packageInfo.version,
      });
    });
  } catch (error) {
    logger.error('server_start_failed', { message: error.message, stack: error.stack });
    process.exit(1);
  }
}

startServer();

module.exports = app;
