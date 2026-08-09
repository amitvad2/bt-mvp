/**
 * Feature: social-commerce-guest-booking, Property 7: Token Expiry
 *
 * For any Guest_Checkout_Token, if the token is presented for validation at a time
 * greater than 15 minutes after its server-side generation timestamp, the validation
 * SHALL fail with reason 'expired' regardless of client-side clock values.
 *
 * Validates: Requirements 6.3
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';

// ─── Mock @/lib/firebase-admin using globalThis for shared state ─────────────

(globalThis as Record<string, unknown>).__tokenExpiryDocs__ = new Map<string, Record<string, unknown>>();

function getDocs(): Map<string, Record<string, unknown>> {
  return (globalThis as Record<string, unknown>).__tokenExpiryDocs__ as Map<string, Record<string, unknown>>;
}

vi.mock('@/lib/firebase-admin', () => {
  function getDocsInMock(): Map<string, Record<string, unknown>> {
    return (globalThis as Record<string, unknown>).__tokenExpiryDocs__ as Map<string, Record<string, unknown>>;
  }

  function createTimestamp(ms: number) {
    return {
      toMillis: () => ms,
      toDate: () => new Date(ms),
      seconds: Math.floor(ms / 1000),
      nanoseconds: (ms % 1000) * 1_000_000,
    };
  }

  const createDocRef = (docId: string) => ({
    id: docId,
    get: async () => {
      const docs = getDocsInMock();
      const data = docs.get(docId);
      return {
        exists: !!data,
        id: docId,
        data: () => data,
      };
    },
    update: async (updateData: Record<string, unknown>) => {
      const docs = getDocsInMock();
      const existing = docs.get(docId);
      if (!existing) throw new Error(`Doc ${docId} not found`);
      docs.set(docId, { ...existing, ...updateData });
    },
    set: async (data: Record<string, unknown>) => {
      const docs = getDocsInMock();
      docs.set(docId, data);
    },
  });

  const adminDb = {
    collection: (_collectionPath: string) => ({
      doc: (docId: string) => createDocRef(docId),
      where: (field: string, _op: string, value: unknown) => ({
        limit: (_n: number) => ({
          get: async () => {
            const docs = getDocsInMock();
            const matches: Array<{ id: string; exists: boolean; data: () => Record<string, unknown>; ref: ReturnType<typeof createDocRef> }> = [];
            for (const [id, data] of docs.entries()) {
              if (data[field] === value) {
                matches.push({
                  id,
                  exists: true,
                  data: () => data,
                  ref: createDocRef(id),
                });
                break;
              }
            }
            return {
              empty: matches.length === 0,
              docs: matches,
              size: matches.length,
            };
          },
        }),
      }),
    }),
    runTransaction: async (fn: (transaction: unknown) => Promise<unknown>) => {
      const transaction = {
        get: async (docRef: { get: () => Promise<unknown> }) => docRef.get(),
        update: (docRef: { update: (data: unknown) => Promise<void> }, data: unknown) => {
          docRef.update(data as Record<string, unknown>);
        },
      };
      return fn(transaction);
    },
  };

  const admin = {
    firestore: {
      Timestamp: {
        now: () => createTimestamp(Date.now()),
        fromMillis: (ms: number) => createTimestamp(ms),
      },
      FieldValue: {
        serverTimestamp: () => ({ _type: 'serverTimestamp' }),
      },
    },
  };

  return {
    adminDb,
    default: admin,
  };
});

// Import after mock
import { createTokenService } from '@/lib/social-booking/token';

// ─── Constants ───────────────────────────────────────────────────────────────

const TOKEN_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes = 900,000 ms

describe('Property 7: Token Expiry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    getDocs().clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('a token presented BEFORE 15 minutes after generation validates successfully', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Time offset in ms: 0 to just under 15 minutes (exclusive of boundary)
        fc.integer({ min: 0, max: TOKEN_EXPIRY_MS - 1 }),
        fc.uuid(),
        fc.uuid(),
        fc.constantFrom('whatsapp' as const, 'instagram' as const, 'messenger' as const),
        async (timeOffsetMs, socialSessionId, sessionId, channel) => {
          getDocs().clear();

          const baseTime = new Date('2025-06-01T12:00:00Z').getTime();
          vi.setSystemTime(baseTime);

          // Pre-seed the session document (generate() calls update, so doc must exist)
          getDocs().set(socialSessionId, {
            id: socialSessionId,
            channel,
            state: 'selecting-session',
            sessionId: null,
            checkoutTokenHash: null,
            tokenConsumed: false,
            tokenExpiresAt: null,
            campaign: null,
          });

          // Generate the token at baseTime
          const tokenService = createTokenService();
          const rawToken = await tokenService.generate(socialSessionId, sessionId);

          // Advance time within the valid window
          vi.setSystemTime(baseTime + timeOffsetMs);

          // Validate — should succeed
          const result = await tokenService.validateAndConsume(rawToken);
          expect(result.valid).toBe(true);
          if (result.valid) {
            expect(result.sessionId).toBe(sessionId);
          }
        }
      ),
      { numRuns: 20 }
    );
  });

  it('a token presented AFTER 15 minutes after generation fails with reason expired', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Time offset: at or beyond 15 minutes (boundary inclusive) to 2 hours
        fc.integer({ min: TOKEN_EXPIRY_MS, max: 2 * 60 * 60 * 1000 }),
        fc.uuid(),
        fc.uuid(),
        fc.constantFrom('whatsapp' as const, 'instagram' as const, 'messenger' as const),
        async (timeOffsetMs, socialSessionId, sessionId, channel) => {
          getDocs().clear();

          const baseTime = new Date('2025-06-01T12:00:00Z').getTime();
          vi.setSystemTime(baseTime);

          // Pre-seed the session document
          getDocs().set(socialSessionId, {
            id: socialSessionId,
            channel,
            state: 'selecting-session',
            sessionId: null,
            checkoutTokenHash: null,
            tokenConsumed: false,
            tokenExpiresAt: null,
            campaign: null,
          });

          // Generate the token at baseTime
          const tokenService = createTokenService();
          const rawToken = await tokenService.generate(socialSessionId, sessionId);

          // Advance time past the 15-minute boundary
          vi.setSystemTime(baseTime + timeOffsetMs);

          // Validate — should fail with 'expired'
          const result = await tokenService.validateAndConsume(rawToken);
          expect(result.valid).toBe(false);
          if (!result.valid) {
            expect(result.reason).toBe('expired');
          }
        }
      ),
      { numRuns: 20 }
    );
  });

  it('the expiry boundary is exactly at 15 minutes (900,000ms)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.constantFrom('whatsapp' as const, 'instagram' as const, 'messenger' as const),
        async (socialSessionId, sessionId, channel) => {
          // --- Test 1: At exactly 15 min, token is expired ---
          getDocs().clear();

          const baseTime = new Date('2025-06-01T12:00:00Z').getTime();
          vi.setSystemTime(baseTime);

          getDocs().set(socialSessionId, {
            id: socialSessionId,
            channel,
            state: 'selecting-session',
            sessionId: null,
            checkoutTokenHash: null,
            tokenConsumed: false,
            tokenExpiresAt: null,
            campaign: null,
          });

          const tokenService = createTokenService();
          const rawToken = await tokenService.generate(socialSessionId, sessionId);

          // At exactly the boundary: expiresAt.toMillis() <= now.toMillis() → expired
          vi.setSystemTime(baseTime + TOKEN_EXPIRY_MS);

          const result = await tokenService.validateAndConsume(rawToken);
          expect(result.valid).toBe(false);
          if (!result.valid) {
            expect(result.reason).toBe('expired');
          }

          // --- Test 2: At 1ms before the boundary, token is still valid ---
          getDocs().clear();
          vi.setSystemTime(baseTime);

          const altSessionId = socialSessionId + '-alt';
          getDocs().set(altSessionId, {
            id: altSessionId,
            channel,
            state: 'selecting-session',
            sessionId: null,
            checkoutTokenHash: null,
            tokenConsumed: false,
            tokenExpiresAt: null,
            campaign: null,
          });

          const rawToken2 = await tokenService.generate(altSessionId, sessionId);

          vi.setSystemTime(baseTime + TOKEN_EXPIRY_MS - 1);

          const result2 = await tokenService.validateAndConsume(rawToken2);
          expect(result2.valid).toBe(true);
        }
      ),
      { numRuns: 20 }
    );
  });
});
