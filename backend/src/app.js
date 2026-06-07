const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const { initDatabase } = require('./db');

const diagnosisRoutes = require('./routes/diagnosis');
const knowledgeRoutes = require('./routes/knowledge');
const caacRoutes = require('./routes/caac');
const casesRoutes = require('./routes/cases');
const imageRoutes = require('./routes/image');
const userRoutes = require('./routes/user');
const historyRoutes = require('./routes/history');
const decisionTreeRoutes = require('./routes/decisionTrees');
const eventsRoutes = require('./routes/events');
const statsRoutes = require('./routes/stats');
const flightLogRoutes = require('./routes/flightLog');
const diagnosisAgentRoutes = require('./routes/diagnosisAgent');
const unifiedDiagnosisRoutes = require('./routes/unifiedDiagnosis');

const { errorHandler } = require('./middleware/errorHandler');

const app = express();

// 信任代理（nginx 反向代理场景，1层代理）
app.set('trust proxy', 1);

const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:3000'
];
const VERCEL_APP_ORIGIN = /^https:\/\/[a-z0-9-]+\.vercel\.app$/i;
const RENDER_APP_ORIGIN = /^https:\/\/[a-z0-9-]+\.onrender\.com$/i;

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
    if (!origin || allowAllOrigins || allowedOrigins.has(origin) || VERCEL_APP_ORIGIN.test(origin) || RENDER_APP_ORIGIN.test(origin)) {
      return callback(null, true);
    }

    return callback(null, false);
  },
  credentials: true
}));
app.use(express.json());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use('/api/', limiter);

app.use('/api/diagnosis', diagnosisRoutes);
app.use('/api/knowledge', knowledgeRoutes);
app.use('/api/caac', caacRoutes);
app.use('/api/cases', casesRoutes);
app.use('/api/image', imageRoutes);
app.use('/api/user', userRoutes);
app.use('/api/history', historyRoutes);
app.use('/api/decision-trees', decisionTreeRoutes);
app.use('/api/events', eventsRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/flight-logs', flightLogRoutes);
app.use('/api/diagnosis/agent', diagnosisAgentRoutes);
app.use('/api/diagnosis/unified', unifiedDiagnosisRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
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
      console.log(`DroneDoctor API running on ${HOST}:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

module.exports = app;
