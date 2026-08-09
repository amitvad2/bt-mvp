/**
 * Property 16: Deep Link Rate Limiting
 *
 * For any IP address and any number N of requests (1-30):
 * - The first 20 requests should return { allowed: true }
 * - The 21st and subsequent requests should return { allowed: false, retryAfterSeconds: <positive number> }
 *
 * Feature: social-commerce-guest-booking, Property 16: Deep Link Rate Limiting
 * Validates: Requirements 11.4
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

import { checkDeepLinkRateLimit } from '@/lib/social-booking/rate-limit';

// ─── Property Test ───────────────────────────────────────────────────────────

describe('Property 16: Deep Link Rate Limiting', () => {
  beforeEach(() => {
    kvStore.clear();
    vi.clearAllMocks();
  });

  it('allows exactly 20 requests per IP per minute, then rejects subsequent requests with retryAfterSeconds', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate a non-empty IP-like string
        fc.stringMatching(/^[a-zA-Z0-9.:]{1,45}$/),
        // Generate total number of requests between 1 and 30
        fc.integer({ min: 1, max: 30 }),
        async (ip, totalRequests) => {
          // Clear store for each property run
          kvStore.clear();

          for (let i = 1; i <= totalRequests; i++) {
            const result = await checkDeepLinkRateLimit(ip);

            if (i <= 20) {
              // First 20 requests MUST be allowed
              expect(result.allowed).toBe(true);
              expect(result.retryAfterSeconds).toBeUndefined();
            } else {
              // 21st and subsequent requests MUST be rejected
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
