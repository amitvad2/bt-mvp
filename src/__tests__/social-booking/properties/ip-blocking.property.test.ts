/**
 * Property 17: IP Blocking After Failed Attempts
 *
 * For any IP address:
 * - After fewer than 5 failed token attempts within 10 minutes, isIPBlocked returns false
 * - After exactly 5 failed attempts within the 10-minute window, isIPBlocked returns true
 * - The block duration is 30 minutes (1800s TTL set on the block key)
 *
 * Feature: social-commerce-guest-booking, Property 17: IP Blocking After Failed Attempts
 * Validates: Requirements 11.5
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';

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

import { trackFailedTokenAttempt, isIPBlocked } from '@/lib/social-booking/rate-limit';

// ─── Property Tests ──────────────────────────────────────────────────────────

describe('Property 17: IP Blocking After Failed Attempts', () => {
  beforeEach(() => {
    kvStore.clear();
    vi.clearAllMocks();
  });

  it('does not block an IP after fewer than 5 failed attempts', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate a non-empty IP-like string
        fc.stringMatching(/^[a-zA-Z0-9.:]{1,45}$/),
        // Generate number of failures between 1 and 4 (below threshold)
        fc.integer({ min: 1, max: 4 }),
        async (ip, failureCount) => {
          // Clear store for each property run
          kvStore.clear();

          // Track the given number of failed attempts
          for (let i = 0; i < failureCount; i++) {
            await trackFailedTokenAttempt(ip);
          }

          // IP should NOT be blocked
          const blocked = await isIPBlocked(ip);
          expect(blocked).toBe(false);
        }
      ),
      { numRuns: 20 }
    );
  });

  it('blocks an IP after exactly 5 failed attempts within the 10-minute window', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate a non-empty IP-like string
        fc.stringMatching(/^[a-zA-Z0-9.:]{1,45}$/),
        async (ip) => {
          // Clear store for each property run
          kvStore.clear();

          // Track exactly 5 failed attempts
          for (let i = 0; i < 5; i++) {
            await trackFailedTokenAttempt(ip);
          }

          // IP MUST be blocked
          const blocked = await isIPBlocked(ip);
          expect(blocked).toBe(true);
        }
      ),
      { numRuns: 20 }
    );
  });

  it('sets a 30-minute (1800s) TTL on the block key', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate a non-empty IP-like string
        fc.stringMatching(/^[a-zA-Z0-9.:]{1,45}$/),
        async (ip) => {
          // Clear store for each property run
          kvStore.clear();

          // Track 5 failed attempts to trigger the block
          for (let i = 0; i < 5; i++) {
            await trackFailedTokenAttempt(ip);
          }

          // Verify the block key was set with the correct TTL (1800 seconds)
          const blockKey = `social_ip_block:${ip}`;
          expect(mockSet).toHaveBeenCalledWith(blockKey, '1', { ex: 1800 });
        }
      ),
      { numRuns: 20 }
    );
  });
});
