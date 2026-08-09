import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted so mocks are accessible inside vi.mock factory
const { mockGet } = vi.hoisted(() => {
  const mockGet = vi.fn();
  return { mockGet };
});

vi.mock('@/lib/firebase-admin', () => {
  const chainableQuery: Record<string, unknown> = {};
  chainableQuery.where = vi.fn(() => chainableQuery);
  chainableQuery.orderBy = vi.fn(() => chainableQuery);
  chainableQuery.limit = vi.fn(() => chainableQuery);
  chainableQuery.get = mockGet;

  return {
    adminDb: {
      collection: vi.fn(() => chainableQuery),
    },
  };
});

import { getAvailableSessions, formatSessionDate, formatPrice, formatAgeRange } from '@/lib/social-booking/session-discovery';

describe('Session Discovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('formatSessionDate', () => {
    it('should format YYYY-MM-DD as "Day DD Mon"', () => {
      // 2025-07-19 is a Saturday
      const result = formatSessionDate('2025-07-19');
      expect(result).toBe('Sat 19 Jul');
    });

    it('should format another date correctly', () => {
      // 2025-01-06 is a Monday
      const result = formatSessionDate('2025-01-06');
      expect(result).toBe('Mon 6 Jan');
    });

    it('should handle single-digit days without padding', () => {
      // 2025-03-01 is a Saturday
      const result = formatSessionDate('2025-03-01');
      expect(result).toBe('Sat 1 Mar');
    });

    it('should handle December dates', () => {
      // 2025-12-25 is a Thursday
      const result = formatSessionDate('2025-12-25');
      expect(result).toBe('Thu 25 Dec');
    });
  });

  describe('formatPrice', () => {
    it('should format pence to £XX.XX', () => {
      expect(formatPrice(1500)).toBe('£15.00');
    });

    it('should handle zero pence correctly', () => {
      expect(formatPrice(0)).toBe('£0.00');
    });

    it('should handle amounts with non-zero pence', () => {
      expect(formatPrice(2599)).toBe('£25.99');
    });

    it('should handle single-digit pound amounts', () => {
      expect(formatPrice(500)).toBe('£5.00');
    });

    it('should handle large amounts', () => {
      expect(formatPrice(10000)).toBe('£100.00');
    });
  });

  describe('formatAgeRange', () => {
    it('should format age range with en-dash', () => {
      expect(formatAgeRange(5, 12)).toBe('5\u201312');
    });

    it('should format adult age range', () => {
      expect(formatAgeRange(18, 25)).toBe('18\u201325');
    });

    it('should handle same min and max', () => {
      expect(formatAgeRange(10, 10)).toBe('10\u201310');
    });
  });

  describe('getAvailableSessions', () => {
    it('should return mapped SessionSummary objects from Firestore results', async () => {
      mockGet.mockResolvedValueOnce({
        docs: [
          {
            id: 'session-1',
            data: () => ({
              className: 'Kids Cooking Fun',
              date: '2025-07-19',
              startTime: '10:30',
              venueName: 'Community Hall',
              ageMin: 5,
              ageMax: 12,
              spotsAvailable: 3,
              price: 1500,
            }),
          },
          {
            id: 'session-2',
            data: () => ({
              className: 'Young Adult Baking',
              date: '2025-07-20',
              startTime: '14:00',
              venueName: 'Studio Kitchen',
              ageMin: 18,
              ageMax: 25,
              spotsAvailable: 5,
              price: 2500,
            }),
          },
        ],
      });

      const results = await getAvailableSessions();

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({
        sessionId: 'session-1',
        className: 'Kids Cooking Fun',
        date: 'Sat 19 Jul',
        startTime: '10:30',
        venueName: 'Community Hall',
        ageRange: '5\u201312',
        spotsAvailable: 3,
        price: '£15.00',
      });
      expect(results[1]).toEqual({
        sessionId: 'session-2',
        className: 'Young Adult Baking',
        date: 'Sun 20 Jul',
        startTime: '14:00',
        venueName: 'Studio Kitchen',
        ageRange: '18\u201325',
        spotsAvailable: 5,
        price: '£25.00',
      });
    });

    it('should return empty array when no sessions match', async () => {
      mockGet.mockResolvedValueOnce({ docs: [] });

      const results = await getAvailableSessions();

      expect(results).toEqual([]);
    });

    it('should query the sessions collection', async () => {
      mockGet.mockResolvedValueOnce({ docs: [] });

      await getAvailableSessions();

      expect(mockGet).toHaveBeenCalledTimes(1);
    });
  });
});
