jest.mock('../src/db', () => ({
  query: jest.fn(),
  run: jest.fn(),
  get: jest.fn(),
  isPostgres: true,
}));

jest.mock('../src/services/trialAccessService', () => ({
  issueTrialAccessToken: jest.fn(() => 'signed-trial-token'),
  validateTrialAccessToken: jest.fn(),
}));

const db = require('../src/db');
const trialAccessService = require('../src/services/trialAccessService');
const couponService = require('../src/services/couponService');

describe('anonymous coupon activation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('redeems an unused coupon with one conditional database update', async () => {
    db.query.mockResolvedValue({
      rows: [{
        id: 7,
        duration_days: 3,
        duration_label: '3天体验',
        access_id: 'access-id',
        expires_at: '2026-07-01T00:00:00.000Z',
      }],
    });

    const result = await couponService.activateCoupon('ABCD-EFGH');

    expect(db.query).toHaveBeenCalledTimes(1);
    expect(db.query.mock.calls[0][0]).toContain("AND status = 'unused'");
    expect(db.query.mock.calls[0][0]).toContain('RETURNING');
    expect(result).toMatchObject({
      accessToken: 'signed-trial-token',
      durationDays: 3,
      durationLabel: '3天体验',
    });
    expect(trialAccessService.issueTrialAccessToken).toHaveBeenCalledWith(
      expect.objectContaining({ couponId: 7 })
    );
  });

  test('a second redemption cannot reuse an already used coupon', async () => {
    db.query.mockResolvedValue({ rows: [] });
    db.get.mockResolvedValue({
      id: 7,
      status: 'used',
    });

    await expect(couponService.activateCoupon('ABCD-EFGH'))
      .rejects.toThrow('券码已被使用');
  });
});
