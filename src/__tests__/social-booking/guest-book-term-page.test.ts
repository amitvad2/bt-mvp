/**
 * Tests for /guest/book-term/[token] deep link resolution page.
 *
 * Validates that the social channel programme deep link:
 * - Resolves a valid token and redirects to /express-book-term/[classId]?source=social_<channel>
 * - Rejects expired, consumed, and invalid tokens with appropriate messages
 * - Validates the referenced programme class is still bookable
 * - Applies IP-based rate limiting and blocking
 *
 * Validates: Requirements 13.6
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted Mocks ──────────────────────────────────────────────────────────

const {
  mockValidateAndConsume,
  mockCheckDeepLinkRateLimit,
  mockIsIPBlocked,
  mockTrackFailedTokenAttempt,
  mockValidateAndExtractUtmParams,
  mockRedirect,
  mockHeaders,
  mockAdminDbGet,
  mockAdminDbUpdate,
} = vi.hoisted(() => ({
  mockValidateAndConsume: vi.fn(),
  mockCheckDeepLinkRateLimit: vi.fn(),
  mockIsIPBlocked: vi.fn(),
  mockTrackFailedTokenAttempt: vi.fn(),
  mockValidateAndExtractUtmParams: vi.fn(),
  mockRedirect: vi.fn(),
  mockHeaders: vi.fn(),
  mockAdminDbGet: vi.fn(),
  mockAdminDbUpdate: vi.fn(),
}));

vi.mock('@/lib/social-booking/token', () => ({
  createTokenService: () => ({
    validateAndConsume: mockValidateAndConsume,
  }),
}));

vi.mock('@/lib/social-booking/rate-limit', () => ({
  checkDeepLinkRateLimit: mockCheckDeepLinkRateLimit,
  isIPBlocked: mockIsIPBlocked,
  trackFailedTokenAttempt: mockTrackFailedTokenAttempt,
}));

vi.mock('@/lib/social-booking/utm-validation', () => ({
  validateAndExtractUtmParams: mockValidateAndExtractUtmParams,
}));

vi.mock('next/navigation', () => ({
  redirect: mockRedirect,
}));

vi.mock('next/headers', () => ({
  headers: mockHeaders,
}));

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: () => ({
      doc: () => ({
        get: mockAdminDbGet,
        update: mockAdminDbUpdate,
      }),
    }),
  },
  adminInitError: null,
}));

// ─── Import page component after mocks ──────────────────────────────────────

import GuestBookTermPage from '@/app/guest/book-term/[token]/page';

// ─── Test setup ─────────────────────────────────────────────────────────────

describe('/guest/book-term/[token] — Deep Link Resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHeaders.mockResolvedValue({
      get: (name: string) => {
        if (name === 'x-forwarded-for') return '1.2.3.4';
        if (name === 'x-real-ip') return null;
        return null;
      },
    });
    mockIsIPBlocked.mockResolvedValue(false);
    mockCheckDeepLinkRateLimit.mockResolvedValue({ allowed: true });
    mockValidateAndExtractUtmParams.mockReturnValue(null);
  });

  it('redirects to /express-book-term/[classId] with social source on valid token', async () => {
    mockValidateAndConsume.mockResolvedValue({
      valid: true,
      sessionId: '',
      channel: 'whatsapp',
      campaign: null,
      socialBookingSessionId: 'sbs_123',
      classId: 'class_abc',
      bookingType: 'term',
    });

    mockAdminDbGet.mockResolvedValue({
      exists: true,
      data: () => ({
        commitment: 'term',
        termEndDate: '2099-12-31',
        spotsAvailable: 5,
      }),
    });

    await GuestBookTermPage({
      params: Promise.resolve({ token: 'valid-token-123' }),
      searchParams: Promise.resolve({}),
    });

    expect(mockRedirect).toHaveBeenCalledWith(
      '/express-book-term/class_abc?source=social_whatsapp'
    );
  });

  it('includes campaign in redirect URL when present', async () => {
    mockValidateAndConsume.mockResolvedValue({
      valid: true,
      sessionId: '',
      channel: 'instagram',
      campaign: { campaign: 'summer-2025' },
      socialBookingSessionId: 'sbs_456',
      classId: 'class_xyz',
      bookingType: 'term',
    });

    mockAdminDbGet.mockResolvedValue({
      exists: true,
      data: () => ({
        commitment: 'term',
        termEndDate: '2099-12-31',
        spotsAvailable: 3,
      }),
    });

    await GuestBookTermPage({
      params: Promise.resolve({ token: 'valid-token-456' }),
      searchParams: Promise.resolve({}),
    });

    expect(mockRedirect).toHaveBeenCalledWith(
      '/express-book-term/class_xyz?source=social_instagram&campaign=summer-2025'
    );
  });

  it('renders expired message for expired tokens', async () => {
    mockValidateAndConsume.mockResolvedValue({
      valid: false,
      reason: 'expired',
    });

    const result = await GuestBookTermPage({
      params: Promise.resolve({ token: 'expired-token' }),
      searchParams: Promise.resolve({}),
    });

    expect(mockRedirect).not.toHaveBeenCalled();
    expect(result).toBeDefined();
  });

  it('renders consumed message for already-used tokens', async () => {
    mockValidateAndConsume.mockResolvedValue({
      valid: false,
      reason: 'consumed',
    });

    const result = await GuestBookTermPage({
      params: Promise.resolve({ token: 'consumed-token' }),
      searchParams: Promise.resolve({}),
    });

    expect(mockRedirect).not.toHaveBeenCalled();
    expect(result).toBeDefined();
  });

  it('tracks failed attempt and renders error for invalid tokens', async () => {
    mockValidateAndConsume.mockResolvedValue({
      valid: false,
      reason: 'invalid',
    });

    const result = await GuestBookTermPage({
      params: Promise.resolve({ token: 'invalid-token' }),
      searchParams: Promise.resolve({}),
    });

    expect(mockTrackFailedTokenAttempt).toHaveBeenCalledWith('1.2.3.4');
    expect(mockRedirect).not.toHaveBeenCalled();
    expect(result).toBeDefined();
  });

  it('renders blocked message when IP is blocked', async () => {
    mockIsIPBlocked.mockResolvedValue(true);

    const result = await GuestBookTermPage({
      params: Promise.resolve({ token: 'any-token' }),
      searchParams: Promise.resolve({}),
    });

    expect(mockValidateAndConsume).not.toHaveBeenCalled();
    expect(mockRedirect).not.toHaveBeenCalled();
    expect(result).toBeDefined();
  });

  it('renders rate limit message when deep link rate is exceeded', async () => {
    mockCheckDeepLinkRateLimit.mockResolvedValue({
      allowed: false,
      retryAfterSeconds: 30,
    });

    const result = await GuestBookTermPage({
      params: Promise.resolve({ token: 'any-token' }),
      searchParams: Promise.resolve({}),
    });

    expect(mockValidateAndConsume).not.toHaveBeenCalled();
    expect(mockRedirect).not.toHaveBeenCalled();
    expect(result).toBeDefined();
  });

  it('renders error when programme class is no longer bookable (full)', async () => {
    mockValidateAndConsume.mockResolvedValue({
      valid: true,
      sessionId: '',
      channel: 'messenger',
      campaign: null,
      socialBookingSessionId: 'sbs_789',
      classId: 'class_full',
      bookingType: 'term',
    });

    mockAdminDbGet.mockResolvedValue({
      exists: true,
      data: () => ({
        commitment: 'term',
        termEndDate: '2099-12-31',
        spotsAvailable: 0, // Full
      }),
    });

    const result = await GuestBookTermPage({
      params: Promise.resolve({ token: 'full-class-token' }),
      searchParams: Promise.resolve({}),
    });

    expect(mockRedirect).not.toHaveBeenCalled();
    expect(result).toBeDefined();
  });

  it('renders error when programme class has expired', async () => {
    mockValidateAndConsume.mockResolvedValue({
      valid: true,
      sessionId: '',
      channel: 'whatsapp',
      campaign: null,
      socialBookingSessionId: 'sbs_expired',
      classId: 'class_expired',
      bookingType: 'term',
    });

    mockAdminDbGet.mockResolvedValue({
      exists: true,
      data: () => ({
        commitment: 'term',
        termEndDate: '2020-01-01', // Past
        spotsAvailable: 5,
      }),
    });

    const result = await GuestBookTermPage({
      params: Promise.resolve({ token: 'expired-class-token' }),
      searchParams: Promise.resolve({}),
    });

    expect(mockRedirect).not.toHaveBeenCalled();
    expect(result).toBeDefined();
  });

  it('renders error when token has no classId', async () => {
    mockValidateAndConsume.mockResolvedValue({
      valid: true,
      sessionId: 'session_abc', // Per-session token, not programme
      channel: 'whatsapp',
      campaign: null,
      socialBookingSessionId: 'sbs_wrong_type',
      // No classId
    });

    const result = await GuestBookTermPage({
      params: Promise.resolve({ token: 'wrong-type-token' }),
      searchParams: Promise.resolve({}),
    });

    expect(mockRedirect).not.toHaveBeenCalled();
    expect(result).toBeDefined();
  });
});
