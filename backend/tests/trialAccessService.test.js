process.env.JWT_SECRET = 'test-secret-at-least-32-characters-long';

jest.mock('../src/db', () => ({
  get: jest.fn(),
}));

const jwt = require('jsonwebtoken');
const db = require('../src/db');
const { JWT_SECRET } = require('../src/config');
const {
  issueTrialAccessToken,
  validateTrialAccessToken,
} = require('../src/services/trialAccessService');

describe('trial access tokens', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('a signed token remains bound to its redeemed coupon record', async () => {
    const expiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    db.get.mockResolvedValue({
      id: 12,
      status: 'used',
      access_id: 'access-123',
      expires_at: expiresAt,
      duration_label: '3天体验',
    });

    const token = issueTrialAccessToken({
      couponId: 12,
      accessId: 'access-123',
      expiresAt,
    });
    const result = await validateTrialAccessToken(token);

    expect(result).toMatchObject({
      valid: true,
      couponId: 12,
      accessId: 'access-123',
      durationLabel: '3天体验',
      identifier: { type: 'trial', value: 'access-123' },
    });
    expect(db.get).toHaveBeenCalledWith(
      expect.stringContaining('FROM coupons'),
      [12, 'access-123']
    );
  });

  test('a forged token is rejected before database access', async () => {
    const result = await validateTrialAccessToken('forged.token.value');

    expect(result).toEqual({ valid: false, reason: 'invalid' });
    expect(db.get).not.toHaveBeenCalled();
  });

  test('an expired token is rejected before database access', async () => {
    const token = jwt.sign(
      {
        tokenType: 'trial_access',
        couponId: 12,
        accessId: 'access-123',
        exp: Math.floor(Date.now() / 1000) - 10,
      },
      JWT_SECRET,
      {
        issuer: 'drone-doctor',
        audience: 'trial-access',
        noTimestamp: true,
      }
    );

    const result = await validateTrialAccessToken(token);

    expect(result).toEqual({ valid: false, reason: 'expired' });
    expect(db.get).not.toHaveBeenCalled();
  });

  test('a token is revoked when the database coupon binding no longer exists', async () => {
    db.get.mockResolvedValue(null);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const token = issueTrialAccessToken({
      couponId: 12,
      accessId: 'access-123',
      expiresAt,
    });

    const result = await validateTrialAccessToken(token);

    expect(result).toEqual({ valid: false, reason: 'revoked' });
  });
});
