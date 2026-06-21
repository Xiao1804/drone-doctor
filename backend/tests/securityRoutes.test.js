const express = require('express');
const http = require('http');

jest.mock('../src/services/userService', () => ({
  verifyToken: jest.fn(),
  getActiveUser: jest.fn(),
}));

jest.mock('../src/controllers/caseController', () => {
  const ok = jest.fn((req, res) => res.json({ ok: true }));
  return {
    getAllCases: ok,
    searchCases: ok,
    getStats: ok,
    getCase: ok,
    addCase: ok,
    updateCase: ok,
    reviewCase: ok,
    deleteCase: ok,
  };
});

jest.mock('../src/controllers/userController', () => ({
  login: jest.fn((req, res) => res.status(401).json({ error: 'invalid credentials' })),
  getCurrentUser: jest.fn(),
  updateUser: jest.fn(),
  changePassword: jest.fn(),
  verifyToken: jest.fn(),
}));

jest.mock('../src/db', () => ({
  run: jest.fn().mockResolvedValue({ changes: 1 }),
}));

jest.mock('../src/services/couponService', () => ({
  getAccessStatus: jest.fn().mockResolvedValue({ allowed: false, isTrial: false }),
  validateTrialAccessToken: jest.fn().mockResolvedValue({ valid: false, reason: 'invalid' }),
  generateCoupons: jest.fn().mockResolvedValue({
    codes: ['ABCD-EFGH'],
    batchId: 'batch-test',
  }),
  activateCoupon: jest.fn().mockResolvedValue({
    accessToken: 'trial-access-token',
    expiresAt: '2026-07-19T00:00:00.000Z',
    durationLabel: '3天体验',
  }),
  getMarketMetrics: jest.fn().mockResolvedValue({
    coupons: { total: 1, issued: 1, activated: 1, activationRate: 1 },
    diagnosis: { starts: 1, completions: 1, completionRate: 1, uniqueUsers: 1 },
    feedback: { total: 0, helpful: 0, notHelpful: 0, unclear: 0 },
  }),
  markCouponIssued: jest.fn().mockResolvedValue({ success: true }),
}));

jest.mock('../src/services/unifiedDiagnosisService', () => ({
  quickDiagnose: jest.fn(),
  interactiveDiagnose: jest.fn(),
  loadData: jest.fn().mockResolvedValue(),
  IntentParserService: jest.fn(),
  getSession: jest.fn(),
}));

jest.mock('../src/services/agentDiagnosisService', () => ({
  getKnowledgeStatus: jest.fn(),
  loadKnowledgeBase: jest.fn(),
  parseIntent: jest.fn(),
  retrieveDocuments: jest.fn(),
  diagnose: jest.fn(),
  chat: jest.fn(),
}));

jest.mock('../src/services/freeUsageService', () => ({
  incrementUsage: jest.fn(),
}));

jest.mock('../src/services/historyService', () => ({
  addHistory: jest.fn(),
}));

const userService = require('../src/services/userService');
const caseController = require('../src/controllers/caseController');
const userController = require('../src/controllers/userController');
const db = require('../src/db');
const couponService = require('../src/services/couponService');
const caseRoutes = require('../src/routes/cases');
const eventRoutes = require('../src/routes/events');
const createUserRoutes = require('../src/routes/user');
const couponRoutes = require('../src/routes/coupon');
const unifiedDiagnosisRoutes = require('../src/routes/unifiedDiagnosis');
const diagnosisAgentRoutes = require('../src/routes/diagnosisAgent');
const { freeUsageLimit } = require('../src/middleware/freeUsageLimit');
const { createAuthLimiters } = require('../src/middleware/rateLimiters');

function createApp(path, router) {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '64kb', strict: true }));
  app.use(path, router);
  return app;
}

function request(app, { method = 'GET', path = '/', headers = {}, body }) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const payload = body === undefined ? null : JSON.stringify(body);
      const req = http.request({
        host: '127.0.0.1',
        port: address.port,
        method,
        path,
        headers: {
          ...(payload ? {
            'content-type': 'application/json',
            'content-length': Buffer.byteLength(payload),
          } : {}),
          ...headers,
        },
      }, (res) => {
        let responseBody = '';
        res.setEncoding('utf8');
        res.on('data', chunk => {
          responseBody += chunk;
        });
        res.on('end', () => {
          server.close(() => resolve({
            status: res.statusCode,
            headers: res.headers,
            body: responseBody,
          }));
        });
      });

      req.on('error', error => {
        server.close(() => reject(error));
      });
      if (payload) req.write(payload);
      req.end();
    });
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  userService.verifyToken.mockImplementation(token => {
    if (token === 'admin-token') return { userId: 'admin-1', role: 'admin' };
    if (token === 'user-token') return { userId: 'user-1', role: 'user' };
    if (token === 'former-admin-token') return { userId: 'former-admin-1', role: 'admin' };
    if (token === 'inactive-token') return { userId: 'inactive-1', role: 'admin' };
    return null;
  });
  userService.getActiveUser.mockImplementation(async userId => {
    if (userId === 'admin-1') return { id: userId, role: 'admin', isActive: true };
    if (userId === 'user-1') return { id: userId, role: 'user', isActive: true };
    if (userId === 'former-admin-1') return { id: userId, role: 'user', isActive: true };
    return null;
  });
});

describe('case write authorization', () => {
  const app = createApp('/api/cases', caseRoutes);
  const writes = [
    ['POST', '/api/cases'],
    ['PUT', '/api/cases/F001'],
    ['POST', '/api/cases/F001/review'],
    ['DELETE', '/api/cases/F001'],
  ];

  test.each(writes)('%s %s rejects anonymous requests', async (method, path) => {
    const response = await request(app, { method, path, body: {} });
    expect(response.status).toBe(401);
  });

  test.each(writes)('%s %s rejects non-admin users', async (method, path) => {
    const response = await request(app, {
      method,
      path,
      headers: { authorization: 'Bearer user-token' },
      body: {},
    });
    expect(response.status).toBe(403);
  });

  test('admin can reach the protected write handler', async () => {
    const response = await request(app, {
      method: 'POST',
      path: '/api/cases',
      headers: { authorization: 'Bearer admin-token' },
      body: {},
    });
    expect(response.status).toBe(200);
    expect(caseController.addCase).toHaveBeenCalledTimes(1);
  });

  test('a downgraded admin cannot use the role stored in an old token', async () => {
    const response = await request(app, {
      method: 'DELETE',
      path: '/api/cases/F001',
      headers: { authorization: 'Bearer former-admin-token' },
    });
    expect(response.status).toBe(403);
    expect(caseController.deleteCase).not.toHaveBeenCalled();
  });

  test('a disabled user cannot use an otherwise valid token', async () => {
    const response = await request(app, {
      method: 'DELETE',
      path: '/api/cases/F001',
      headers: { authorization: 'Bearer inactive-token' },
    });
    expect(response.status).toBe(403);
    expect(caseController.deleteCase).not.toHaveBeenCalled();
  });

  test('read routes remain public', async () => {
    const response = await request(app, { path: '/api/cases' });
    expect(response.status).toBe(200);
  });
});

describe('event ingestion controls', () => {
  const app = createApp('/api/events', eventRoutes);

  test('rejects unknown event names without writing', async () => {
    const response = await request(app, {
      method: 'POST',
      path: '/api/events',
      body: { event: 'attacker_defined_event', data: {} },
    });
    expect(response.status).toBe(400);
    expect(db.run).not.toHaveBeenCalled();
  });

  test('rejects non-object and oversized event data', async () => {
    const invalid = await request(app, {
      method: 'POST',
      path: '/api/events',
      body: { event: 'diagnosis_start', data: [] },
    });
    expect(invalid.status).toBe(400);

    const oversized = await request(app, {
      method: 'POST',
      path: '/api/events',
      body: { event: 'diagnosis_start', data: { value: 'x'.repeat(17 * 1024) } },
    });
    expect(oversized.status).toBe(413);
    expect(db.run).not.toHaveBeenCalled();
  });

  test('ignores spoofed user headers for anonymous events', async () => {
    const response = await request(app, {
      method: 'POST',
      path: '/api/events',
      headers: { 'x-user-id': 'spoofed-user' },
      body: { event: 'diagnosis_start', data: { source: 'home' } },
    });
    expect(response.status).toBe(200);
    expect(db.run).toHaveBeenCalledWith(
      expect.any(String),
      ['diagnosis_start', '{"source":"home"}', null, '127.0.0.1']
    );
  });

  test('uses only a verified admin identity when present', async () => {
    const response = await request(app, {
      method: 'POST',
      path: '/api/events',
      headers: { authorization: 'Bearer admin-token' },
      body: { event: 'diagnosis_complete', data: {} },
    });
    expect(response.status).toBe(200);
    expect(db.run).toHaveBeenCalledWith(
      expect.any(String),
      ['diagnosis_complete', '{}', 'admin-1', '127.0.0.1']
    );
  });
});

describe('authentication rate limiting', () => {
  test('public registration is explicitly retired', async () => {
    const app = createApp('/api/user', createUserRoutes(createAuthLimiters()));
    const response = await request(app, {
      method: 'POST',
      path: '/api/user/register',
      body: {
        username: 'new-user',
        email: 'new-user@example.com',
        password: 'password',
      },
    });

    expect(response.status).toBe(410);
    expect(JSON.parse(response.body)).toMatchObject({
      code: 'PUBLIC_ACCOUNTS_RETIRED',
    });
  });

  test('the sixth login attempt within a minute is rejected', async () => {
    const app = createApp('/api/user', createUserRoutes(createAuthLimiters()));
    const statuses = [];

    for (let attempt = 0; attempt < 6; attempt += 1) {
      const response = await request(app, {
        method: 'POST',
        path: '/api/user/login',
        body: {},
      });
      statuses.push(response.status);
    }

    expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    expect(statuses[5]).toBe(429);
    expect(userController.login).toHaveBeenCalledTimes(5);
  });

  test('IPv6 addresses in the same /64 share the same limit', async () => {
    const app = createApp('/api/user', createUserRoutes(createAuthLimiters()));
    const statuses = [];

    for (let attempt = 1; attempt <= 6; attempt += 1) {
      const response = await request(app, {
        method: 'POST',
        path: '/api/user/login',
        headers: { 'x-forwarded-for': `2001:db8:abcd:1234::${attempt}` },
        body: { usernameOrEmail: 'same-account', password: 'invalid' },
      });
      statuses.push(response.status);
    }

    expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    expect(statuses[5]).toBe(429);
  });
});

describe('coupon routes remain available to existing users', () => {
  const app = createApp('/api/coupon', couponRoutes);

  test('only the 3-day trial duration is exposed', async () => {
    const response = await request(app, {
      path: '/api/coupon/durations',
    });

    expect(response.status).toBe(200);
    expect(JSON.parse(response.body).durations).toEqual([
      { days: 3, label: '3天体验' },
    ]);
  });

  test('admin generation always creates 3-day trial coupons', async () => {
    const response = await request(app, {
      method: 'POST',
      path: '/api/coupon/generate',
      headers: { authorization: 'Bearer admin-token' },
      body: {
        durationDays: 365,
        durationLabel: '1年',
        count: 2,
        note: '免费体验',
      },
    });

    expect(response.status).toBe(200);
    expect(couponService.generateCoupons).toHaveBeenCalledWith(
      2,
      'admin-1',
      '免费体验'
    );
  });

  test('an anonymous visitor can activate a coupon without an account', async () => {
    const response = await request(app, {
      method: 'POST',
      path: '/api/coupon/activate',
      body: { code: 'ABCD-EFGH' },
    });

    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      accessToken: 'trial-access-token',
      durationLabel: '3天体验',
    });
    expect(couponService.activateCoupon).toHaveBeenCalledWith('ABCD-EFGH');
  });

  test('a browser can check its trial pass without an account', async () => {
    couponService.getAccessStatus.mockResolvedValueOnce({
      allowed: true,
      isTrial: true,
      expiresAt: '2026-07-19T00:00:00.000Z',
      daysLeft: 3,
    });

    const response = await request(app, {
      path: '/api/coupon/access',
      headers: { authorization: 'Bearer trial-token' },
    });

    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      allowed: true,
      isTrial: true,
    });
    expect(couponService.getAccessStatus).toHaveBeenCalledWith('trial-token');
  });

  test('the legacy paid-membership endpoint is explicitly retired', async () => {
    const response = await request(app, {
      path: '/api/coupon/membership',
    });

    expect(response.status).toBe(410);
    expect(JSON.parse(response.body)).toMatchObject({
      code: 'MEMBERSHIP_RETIRED',
    });
  });

  test('market validation metrics remain admin-only', async () => {
    const anonymous = await request(app, {
      path: '/api/coupon/metrics',
    });
    expect(anonymous.status).toBe(401);

    const admin = await request(app, {
      path: '/api/coupon/metrics',
      headers: { authorization: 'Bearer admin-token' },
    });
    expect(admin.status).toBe(200);
    expect(couponService.getMarketMetrics).toHaveBeenCalledTimes(1);
  });

  test('only an admin can mark a coupon as issued', async () => {
    const user = await request(app, {
      method: 'PUT',
      path: '/api/coupon/1/issue',
      headers: { authorization: 'Bearer user-token' },
      body: {},
    });
    expect(user.status).toBe(403);

    const admin = await request(app, {
      method: 'PUT',
      path: '/api/coupon/1/issue',
      headers: { authorization: 'Bearer admin-token' },
      body: {},
    });
    expect(admin.status).toBe(200);
    expect(couponService.markCouponIssued).toHaveBeenCalledWith('1');
  });
});

describe('trial access authorization uses current database role', () => {
  function trialAccessApp() {
    const router = express.Router();
    router.post('/', freeUsageLimit, (req, res) => res.json({ isAdmin: req.freeUsage.isAdmin }));
    return createApp('/protected', router);
  }

  test('an active current admin bypasses trial-pass checks', async () => {
    const response = await request(trialAccessApp(), {
      method: 'POST',
      path: '/protected',
      headers: { authorization: 'Bearer admin-token' },
      body: {},
    });
    expect(response.status).toBe(200);
    expect(couponService.validateTrialAccessToken).not.toHaveBeenCalled();
  });

  test('a downgraded admin token cannot become a trial pass', async () => {
    const response = await request(trialAccessApp(), {
      method: 'POST',
      path: '/protected',
      headers: { authorization: 'Bearer former-admin-token' },
      body: {},
    });
    expect(response.status).toBe(403);
    expect(couponService.validateTrialAccessToken).toHaveBeenCalledWith('former-admin-token');
  });

  test('a valid trial pass can use protected diagnosis routes', async () => {
    couponService.validateTrialAccessToken.mockResolvedValueOnce({
      valid: true,
      accessId: 'access-1',
      expiresAt: '2026-07-19T00:00:00.000Z',
      daysLeft: 3,
      identifier: { type: 'trial', value: 'access-1' },
    });

    const response = await request(trialAccessApp(), {
      method: 'POST',
      path: '/protected',
      headers: { authorization: 'Bearer trial-token' },
      body: {},
    });

    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ isAdmin: false });
  });

  test.each([
    ['forged', 'invalid'],
    ['expired', 'expired'],
  ])('%s trial passes are rejected', async (_label, reason) => {
    couponService.validateTrialAccessToken.mockResolvedValueOnce({
      valid: false,
      reason,
    });

    const response = await request(trialAccessApp(), {
      method: 'POST',
      path: '/protected',
      headers: { authorization: 'Bearer bad-trial-token' },
      body: {},
    });

    expect(response.status).toBe(403);
  });
});

describe('diagnosis helper routes require a trial pass', () => {
  test.each([
    ['GET', '/api/diagnosis/unified/intent?input=motor'],
    ['GET', '/api/diagnosis/unified/session/session-1'],
    ['POST', '/api/diagnosis/agent/parse-intent'],
    ['POST', '/api/diagnosis/agent/retrieve'],
  ])('%s %s rejects anonymous access', async (method, path) => {
    const app = express();
    app.use(express.json());
    app.use('/api/diagnosis/unified', unifiedDiagnosisRoutes);
    app.use('/api/diagnosis/agent', diagnosisAgentRoutes);

    const response = await request(app, {
      method,
      path,
      body: method === 'POST' ? { query: 'motor' } : undefined,
    });

    expect(response.status).toBe(401);
    expect(JSON.parse(response.body)).toMatchObject({
      error: 'TRIAL_ACCESS_REQUIRED',
    });
  });
});
