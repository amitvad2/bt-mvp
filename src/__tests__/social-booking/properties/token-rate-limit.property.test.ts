/**
 * Property 15: Token Generation Rate Limiting
 *
 * For any externalUserId (string) and any number N of requests (1-20):
 * - The first 10 requests should return { allowed: true }
 * - The 11th and subsequent requests should return { allowed: false, retryAfterSeconds: <positive number> }
 *
 * Feature: social-commerce-guest-booking, Property 15: Token Generation Rate Limiting
 * Validates: Requirements 11.3
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

import { checkTokenRateLimit } from '@/lib/social-booking/rate-limit';

describe('Property 15: Token Generation Rate Limiting', () => {
  beforeEach(() => {
    kvStore.clear();
    vi.clearAllMocks();
  });

  it('for any externalUserId and N requests (1-20), the first 10 are allowed and the 11th+ are rejected with retryAfterSeconds > 0', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate a non-empty externalUserId string
        fc.string({ minLength: 1, maxLength: 64 }),
        // Generate N requests between 1 and 20
        fc.integer({ min: 1, max: 20 }),
        async (externalUserId, numRequests) => {
          // Clear store for each property iteration
          kvStore.clear();

          for (let i = 1; i <= numRequests; i++) {
            const result = await checkTokenRateLimit(externalUserId);

            if (i <= 10) {
              // First 10 requests should be allowed
              expect(result.allowed).toBe(true);
              expect(result.retryAfterSeconds).toBeUndefined();
            } else {
              // 11th and subsequent requests should be rejected
              expect(result.allowed).toBe(false);
              expect(result.retryAfterSeconds).toBeGreaterThan(0);
            }
          }
        }
      ),
      { numRuns: 20 }
    );
  });
});
