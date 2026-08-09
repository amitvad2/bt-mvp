/**
 * Unit tests for social booking rate limiting.
 *
 * Tests the four exported functions:
 * - checkTokenRateLimit (10/hour per externalUserId)
 * - checkDeepLinkRateLimit (20/min per IP)
 * - trackFailedTokenAttempt (5 failures/10min → 30min block)
 * - isIPBlocked (check if IP is blocked)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted in-memory KV store ──────────────────────────────────────────────

const { kvStore, mockIncr, mockExpire, mockTtl, mockGet, mockSet } = vi.hoisted(() => {
  const kvStore = new Map<string, { value: string | number; expiresAt?: number }>();

  function isExpired(key: string): boolean {
    const entry = kvStore.get(key);
    if (!entry) return true;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      kvStore.delete(key);
      return true;
    }
    return false;
  }

  const mockIncr = vi.fn(async (key: string) => {
    if (isExpired(key)) {
      kvStore.set(key, { value: 1 });
      return 1;
    }
    const entry = kvStore.get(key)!;
    const newValue =
      (typeof entry.value === 'number' ? entry.value : parseInt(String(entry.value), 10) || 0) + 1;
    entry.value = newValue;
    return newValue;
  });

  const mockExpire = vi.fn(async (key: string, seconds: number) => {
    const entry = kvStore.get(key);
    if (!entry) return 0;
    entry.expiresAt = Date.now() + seconds * 1000;
    return 1;
  });

  const mockTtl = vi.fn(async (key: string) => {
    const entry = kvStore.get(key);
    if (!entry || !entry.expiresAt) return -1;
    const remaining = Math.ceil((entry.expiresAt - Date.now()) / 1000);
    return remaining > 0 ? remaining : -2;
  });

  const mockGet = vi.fn(async (key: string) => {
    if (isExpired(key)) return null;
    const entry = kvStore.get(key);
    return entry?.value ?? null;
  });

  const mockSet = vi.fn(
    async (key: string, value: string | number, options?: { ex?: number }) => {
      let expiresAt: number | undefined;
      if (options?.ex) expiresAt = Date.now() + options.ex * 1000;
      kvStore.set(key, { value, expiresAt });
      return 'OK';
    }
  );

  return { kvStore, mockIncr, mockExpire, mockTtl, mockGet, mockSet };
});

// ─── Mock @vercel/kv ─────────────────────────────────────────────────────────

vi.mock('@vercel/kv', () => ({
  kv: {
    get: mockGet,
    set: mockSet,
    incr: mockIncr,
    expire: mockExpire,
    ttl: mockTtl,
  },
}));

// ─── Import module under test AFTER mock setup ───────────────────────────────

import {
  checkTokenRateLimit,
  checkDeepLinkRateLimit,
  trackFailedTokenAttempt,
  isIPBlocked,
} from '@/lib/social-booking/rate-limit';

describe('Social Booking Rate Limiting', () => {
  beforeEach(() => {
    kvStore.clear();
    vi.clearAllMocks();
  });

  // ── checkTokenRateLimit ────────────────────────────────────────────────────

  describe('checkTokenRateLimit', () => {
    it('allows first request for a new user', async () => {
      const result = await checkTokenRateLimit('user-123');
      expect(result.allowed).toBe(true);
      expect(result.retryAfterSeconds).toBeUndefined();
    });

    it('allows up to 10 requests within the window', async () => {
      for (let i = 0; i < 10; i++) {
        const result = await checkTokenRateLimit('user-456');
        expect(result.allowed).toBe(true);
      }
    });

    it('rejects the 11th request within the window', async () => {
      for (let i = 0; i < 10; i++) {
        await checkTokenRateLimit('user-789');
      }
      const result = await checkTokenRateLimit('user-789');
      expect(result.allowed).toBe(false);
      expect(result.retryAfterSeconds).toBeGreaterThan(0);
    });

    it('sets expiry on first request only', async () => {
      await checkTokenRateLimit('user-first');
      expect(mockExpire).toHaveBeenCalledWith('social_token_rate:user-first', 3600);

      vi.clearAllMocks();
      await checkTokenRateLimit('user-first');
      expect(mockExpire).not.toHaveBeenCalled();
    });

    it('isolates rate limits between users', async () => {
      for (let i = 0; i < 10; i++) {
        await checkTokenRateLimit('user-a');
      }
      const result = await checkTokenRateLimit('user-b');
      expect(result.allowed).toBe(true);
    });
  });

  // ── checkDeepLinkRateLimit ─────────────────────────────────────────────────

  describe('checkDeepLinkRateLimit', () => {
    it('allows first request for a new IP', async () => {
      const result = await checkDeepLinkRateLimit('192.168.1.1');
      expect(result.allowed).toBe(true);
      expect(result.retryAfterSeconds).toBeUndefined();
    });

    it('allows up to 20 requests within the window', async () => {
      for (let i = 0; i < 20; i++) {
        const result = await checkDeepLinkRateLimit('10.0.0.1');
        expect(result.allowed).toBe(true);
      }
    });

    it('rejects the 21st request within the window', async () => {
      for (let i = 0; i < 20; i++) {
        await checkDeepLinkRateLimit('10.0.0.2');
      }
      const result = await checkDeepLinkRateLimit('10.0.0.2');
      expect(result.allowed).toBe(false);
      expect(result.retryAfterSeconds).toBeGreaterThan(0);
    });

    it('sets expiry of 60 seconds on first request', async () => {
      await checkDeepLinkRateLimit('172.16.0.1');
      expect(mockExpire).toHaveBeenCalledWith('social_deeplink_rate:172.16.0.1', 60);
    });

    it('isolates rate limits between IPs', async () => {
      for (let i = 0; i < 20; i++) {
        await checkDeepLinkRateLimit('ip-a');
      }
      const result = await checkDeepLinkRateLimit('ip-b');
      expect(result.allowed).toBe(true);
    });
  });

  // ── trackFailedTokenAttempt ────────────────────────────────────────────────

  describe('trackFailedTokenAttempt', () => {
    it('increments the failure counter', async () => {
      await trackFailedTokenAttempt('192.168.1.50');
      expect(mockIncr).toHaveBeenCalledWith('social_token_fail:192.168.1.50');
    });

    it('sets 10-minute expiry on first failure', async () => {
      await trackFailedTokenAttempt('192.168.1.51');
      expect(mockExpire).toHaveBeenCalledWith('social_token_fail:192.168.1.51', 600);
    });

    it('does not block IP before 5 failures', async () => {
      for (let i = 0; i < 4; i++) {
        await trackFailedTokenAttempt('192.168.1.52');
      }
      const blocked = await isIPBlocked('192.168.1.52');
      expect(blocked).toBe(false);
    });

    it('blocks IP after 5 failures', async () => {
      for (let i = 0; i < 5; i++) {
        await trackFailedTokenAttempt('192.168.1.53');
      }
      const blocked = await isIPBlocked('192.168.1.53');
      expect(blocked).toBe(true);
    });

    it('sets IP block with 1800s TTL', async () => {
      for (let i = 0; i < 5; i++) {
        await trackFailedTokenAttempt('192.168.1.54');
      }
      expect(mockSet).toHaveBeenCalledWith('social_ip_block:192.168.1.54', '1', { ex: 1800 });
    });
  });

  // ── isIPBlocked ────────────────────────────────────────────────────────────

  describe('isIPBlocked', () => {
    it('returns false for an unblocked IP', async () => {
      const blocked = await isIPBlocked('10.10.10.10');
      expect(blocked).toBe(false);
    });

    it('returns true for a blocked IP', async () => {
      kvStore.set('social_ip_block:10.10.10.11', {
        value: '1',
        expiresAt: Date.now() + 1800 * 1000,
      });
      const blocked = await isIPBlocked('10.10.10.11');
      expect(blocked).toBe(true);
    });

    it('returns false for an expired block', async () => {
      kvStore.set('social_ip_block:10.10.10.12', {
        value: '1',
        expiresAt: Date.now() - 1000,
      });
      const blocked = await isIPBlocked('10.10.10.12');
      expect(blocked).toBe(false);
    });
  });
});
