import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks ───────────────────────────────────────────────────────────

const {
  mockDocGet,
  mockDoc,
  mockIsGuestCheckoutEnabled,
  mockCheckRateLimit,
} = vi.hoisted(() => {
  const mockDocGet = vi.fn();
  const mockDoc = vi.fn(() => ({ get: mockDocGet }));
  const mockIsGuestCheckoutEnabled = vi.fn();
  const mockCheckRateLimit = vi.fn();
  return {
    mockDocGet,
    mockDoc,
    mockIsGuestCheckoutEnabled,
    mockCheckRateLimit,
  };
});

// ─── Module mocks ────────────────────────────────────────────────────────────

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: { doc: mockDoc },
  adminInitError: null,
}));

vi.mock('@/lib/feature-flags', () => ({
  isGuestCheckoutEnabled: mockIsGuestCheckoutEnabled,
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: mockCheckRateLimit,
}));

// ─── Import route handler AFTER mocks ────────────────────────────────────────

import { GET } from '@/app/api/guest-booking-status/route';

// ─── Test helpers ────────────────────────────────────────────────────────────

function makeRequest(pi?: string, session?: string): Request {
  const params = new URLSearchParams();
  if (pi) params.set('pi', pi);
  if (session) params.set('session', session);

  return new Request(`http://localhost/api/guest-booking-status?${params.toString()}`, {
    method: 'GET',
    headers: {
      'x-forwarded-for': '192.168.1.100',
    },
  });
}

/** A valid booking document as it would exist in Firestore. */
const validBookingData = {
  sessionId: 'session-abc-123',
  childSnapshot: { firstName: 'Oliver' },
  className: 'After School Cooking Club',
  sessionDate: '2028-03-15',
  startTime: '15:30',
  endTime: '16:30',
  venueName: 'Community Hall',
  payment: { amount: 2500 },
};

// ─── Defaults for happy path ─────────────────────────────────────────────────

function setupHappyPath() {
  mockIsGuestCheckoutEnabled.mockReturnValue(true);
  mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 29, resetAt: Date.now() + 60000 });
  mockDocGet.mockResolvedValue({
    exists: true,
    data: () => validBookingData,
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('GET /api/guest-booking-status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupHappyPath();
  });

  // ── Pending state (booking not yet created) ───────────────────────────────

  describe('Pending state', () => {
    it('returns status "pending" when booking does not exist yet', async () => {
      mockDocGet.mockResolvedValue({ exists: false });

      const res = await GET(makeRequest('pi_test_abc12345', 'session-abc-123'));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.status).toBe('pending');
    });
  });

  // ── Confirmed state returns correct summary fields ────────────────────────

  describe('Confirmed state', () => {
    it('returns confirmed status with correct summary fields', async () => {
      const res = await GET(makeRequest('pi_test_abc12345', 'session-abc-123'));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.status).toBe('confirmed');
      expect(json.reference).toBe('abc12345'); // last 8 chars of 'pi_test_abc12345'
      expect(json.childFirstName).toBe('Oliver');
      expect(json.className).toBe('After School Cooking Club');
      expect(json.date).toBe('2028-03-15');
      expect(json.startTime).toBe('15:30');
      expect(json.endTime).toBe('16:30');
      expect(json.venueName).toBe('Community Hall');
      expect(json.amountPaid).toBe(2500);
    });

    it('does not return sensitive data in confirmed response', async () => {
      const bookingWithSensitive = {
        ...validBookingData,
        guestContact: { firstName: 'Jane', lastName: 'Smith', email: 'jane@example.com', telephone: '07700900000' },
        childSnapshot: { firstName: 'Oliver', lastName: 'Smith' },
        medicalSnapshot: { foodAllergies: true, epipenRequired: true },
        allergyDietarySnapshot: { foodAllergies: ['peanuts'] },
        emergencyContactSnapshot: { name: 'John Smith', mobile: '07700900001' },
      };
      mockDocGet.mockResolvedValue({ exists: true, data: () => bookingWithSensitive });

      const res = await GET(makeRequest('pi_test_abc12345', 'session-abc-123'));
      const json = await res.json();

      // Should NOT contain sensitive fields
      expect(json).not.toHaveProperty('medicalSnapshot');
      expect(json).not.toHaveProperty('allergyDietarySnapshot');
      expect(json).not.toHaveProperty('emergencyContactSnapshot');
      expect(json).not.toHaveProperty('guestContact');
      expect(json).not.toHaveProperty('email');
      expect(json).not.toHaveProperty('telephone');
      expect(json).not.toHaveProperty('phone');

      // Verify stringified response doesn't contain PII
      const jsonStr = JSON.stringify(json);
      expect(jsonStr).not.toContain('jane@example.com');
      expect(jsonStr).not.toContain('07700900000');
      expect(jsonStr).not.toContain('07700900001');
      expect(jsonStr).not.toContain('Smith');
      expect(jsonStr).not.toContain('peanuts');
    });
  });

  // ── Invalid PI format rejected ────────────────────────────────────────────

  describe('Invalid PI format', () => {
    it('returns 400 when pi param is missing', async () => {
      const res = await GET(makeRequest(undefined, 'session-abc-123'));
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.error).toBe('Invalid payment reference.');
    });

    it('returns 400 when pi param does not start with "pi_"', async () => {
      const res = await GET(makeRequest('invalid_format', 'session-abc-123'));
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.error).toBe('Invalid payment reference.');
    });

    it('returns 400 when pi param is empty string', async () => {
      const res = await GET(makeRequest('', 'session-abc-123'));
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.error).toBe('Invalid payment reference.');
    });
  });

  // ── Mismatched session ID rejected ────────────────────────────────────────

  describe('Mismatched session ID', () => {
    it('returns 400 when session param does not match booking sessionId', async () => {
      const res = await GET(makeRequest('pi_test_abc12345', 'wrong-session-id'));
      expect(res.status).toBe(400);

      const json = await res.json();
      // Returns same error as invalid PI to prevent enumeration
      expect(json.error).toBe('Invalid payment reference.');
    });

    it('returns 400 when session param is missing', async () => {
      const res = await GET(makeRequest('pi_test_abc12345', undefined));
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.error).toBe('Session parameter required.');
    });
  });

  // ── Feature flag disabled → 403 ───────────────────────────────────────────

  describe('Feature flag disabled', () => {
    it('returns 403 with unavailable status when guest checkout is disabled', async () => {
      mockIsGuestCheckoutEnabled.mockReturnValue(false);

      const res = await GET(makeRequest('pi_test_abc12345', 'session-abc-123'));
      expect(res.status).toBe(403);

      const json = await res.json();
      expect(json.status).toBe('unavailable');
    });
  });

  // ── Rate limiting enforced ────────────────────────────────────────────────

  describe('Rate limiting', () => {
    it('returns 429 when rate limit is exceeded', async () => {
      mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0, resetAt: Date.now() + 60000 });

      const res = await GET(makeRequest('pi_test_abc12345', 'session-abc-123'));
      expect(res.status).toBe(429);

      const json = await res.json();
      expect(json.error).toBe('Too many requests.');
    });

    it('calls rate limit with correct parameters (30 req/60s for polling)', async () => {
      await GET(makeRequest('pi_test_abc12345', 'session-abc-123'));

      expect(mockCheckRateLimit).toHaveBeenCalledWith(
        'status:192.168.1.100',
        30,
        60
      );
    });
  });
});
