/**
 * Feature: social-commerce-guest-booking, Property 8: Token Single-Use
 *
 * For any valid Guest_Checkout_Token, the first validation-and-consume call
 * SHALL succeed, and all subsequent calls with the same token (including
 * concurrent calls) SHALL fail with reason 'consumed'. Exactly one of N
 * concurrent requests SHALL succeed.
 *
 * Validates: Requirements 6.4, 6.8
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import crypto from 'crypto';
import { hashToken } from '@/lib/social-booking/token';

// ─── In-Memory Firestore Mock ────────────────────────────────────────────────

interface DocData {
  [key: string]: unknown;
}

/**
 * Creates an in-memory Firestore mock specifically designed for token single-use testing.
 * Supports:
 * - Storing documents in social_booking_sessions collection
 * - query where('checkoutTokenHash', '==', hash)
 * - runTransaction that atomically updates tokenConsumed
 */
function createInMemoryFirestore() {
  const collections = new Map<string, Map<string, DocData>>();

  function getCollection(name: string): Map<string, DocData> {
    if (!collections.has(name)) {
      collections.set(name, new Map());
    }
    return collections.get(name)!;
  }

  function createDocRef(collectionName: string, docId: string) {
    return {
      id: docId,
      path: `${collectionName}/${docId}`,
      get: async () => {
        const col = getCollection(collectionName);
        const data = col.get(docId);
        return {
          exists: data !== undefined,
          id: docId,
          data: () => data,
          ref: createDocRef(collectionName, docId),
        };
      },
      set: async (data: DocData) => {
        const col = getCollection(collectionName);
        col.set(docId, { ...data });
      },
      update: async (data: DocData) => {
        const col = getCollection(collectionName);
        const existing = col.get(docId);
        if (!existing) throw new Error(`Document ${collectionName}/${docId} not found`);
        col.set(docId, { ...existing, ...data });
      },
    };
  }

  function createCollectionRef(collectionName: string) {
    return {
      doc: (docId?: string) => {
        const id = docId ?? crypto.randomUUID();
        return createDocRef(collectionName, id);
      },
      where: (field: string, op: string, value: unknown) => {
        // Supports chaining: .where().limit().get()
        const chainable = {
          where: () => chainable,
          orderBy: () => chainable,
          limit: () => chainable,
          get: async () => {
            const col = getCollection(collectionName);
            const matchingDocs: Array<{
              id: string;
              exists: boolean;
              data: () => DocData;
              ref: ReturnType<typeof createDocRef>;
            }> = [];

            for (const [id, data] of col.entries()) {
              let match = false;
              if (op === '==') match = data[field] === value;
              else if (op === '>') match = (data[field] as number) > (value as number);
              else if (op === '<') match = (data[field] as number) < (value as number);

              if (match) {
                matchingDocs.push({
                  id,
                  exists: true,
                  data: () => data,
                  ref: createDocRef(collectionName, id),
                });
              }
            }

            return {
              docs: matchingDocs,
              empty: matchingDocs.length === 0,
              size: matchingDocs.length,
            };
          },
        };
        return chainable;
      },
    };
  }

  // Track transaction lock for concurrency simulation
  let transactionLock = false;

  const mockDb = {
    _collections: collections,
    collection: (path: string) => createCollectionRef(path),
    runTransaction: async (updateFn: (transaction: unknown) => Promise<unknown>) => {
      // Simulate atomic transaction with a lock
      while (transactionLock) {
        await new Promise((resolve) => setTimeout(resolve, 1));
      }
      transactionLock = true;

      try {
        const transaction = {
          get: async (docRef: { get: () => Promise<unknown> }) => docRef.get(),
          update: (docRef: { update: (data: DocData) => Promise<void> }, data: DocData) => {
            // In a transaction, updates are deferred but we execute immediately for simplicity
            docRef.update(data);
          },
        };
        const result = await updateFn(transaction);
        return result;
      } finally {
        transactionLock = false;
      }
    },
  };

  return mockDb;
}

// ─── Mock Setup ──────────────────────────────────────────────────────────────

let mockDb: ReturnType<typeof createInMemoryFirestore>;

// Mock Firestore Timestamp
const mockTimestamp = {
  now: () => ({
    toMillis: () => Date.now(),
  }),
  fromMillis: (ms: number) => ({
    toMillis: () => ms,
  }),
};

vi.mock('@/lib/firebase-admin', () => {
  return {
    adminDb: {
      collection: (...args: unknown[]) => mockDb.collection(args[0] as string),
      runTransaction: (...args: unknown[]) => mockDb.runTransaction(args[0] as (t: unknown) => Promise<unknown>),
    },
    default: {
      firestore: {
        Timestamp: {
          now: () => mockTimestamp.now(),
          fromMillis: (ms: number) => mockTimestamp.fromMillis(ms),
        },
        FieldValue: {
          serverTimestamp: () => 'SERVER_TIMESTAMP',
        },
      },
    },
  };
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

type SocialChannel = 'whatsapp' | 'instagram' | 'messenger';

/**
 * Seeds a Social_Booking_Session document with a valid, unexpired, unconsumed token hash.
 */
async function seedSessionWithToken(
  rawToken: string,
  options?: {
    channel?: SocialChannel;
    sessionId?: string;
    campaign?: unknown;
    expiresInMs?: number;
  }
) {
  const tokenHash = hashToken(rawToken);
  const channel = options?.channel ?? 'whatsapp';
  const sessionId = options?.sessionId ?? 'session-123';
  const campaign = options?.campaign ?? null;
  const expiresInMs = options?.expiresInMs ?? 15 * 60 * 1000; // 15 minutes default

  const docId = `sbs-${crypto.randomUUID().slice(0, 8)}`;
  const col = mockDb._collections.get('social_booking_sessions') ?? new Map();
  mockDb._collections.set('social_booking_sessions', col);

  col.set(docId, {
    id: docId,
    channel,
    sessionId,
    checkoutTokenHash: tokenHash,
    tokenConsumed: false,
    tokenExpiresAt: mockTimestamp.fromMillis(Date.now() + expiresInMs),
    state: 'checkout-created',
    campaign,
    externalUserId: 'user-ext-1',
    externalConversationId: 'conv-1',
    createdAt: mockTimestamp.now(),
    updatedAt: mockTimestamp.now(),
  });

  return docId;
}

// ─── Property Tests ──────────────────────────────────────────────────────────

describe('Property 8: Token Single-Use', () => {
  beforeEach(() => {
    mockDb = createInMemoryFirestore();
    vi.clearAllMocks();
  });

  it('first validateAndConsume call succeeds for any valid (not expired, not consumed) token', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 1000 }),
        async (_seed) => {
          // Fresh DB per iteration
          mockDb = createInMemoryFirestore();

          // Dynamically import to pick up fresh mock
          const { createTokenService } = await import('@/lib/social-booking/token');
          const tokenService = createTokenService();

          // Generate a unique raw token
          const { generateRawToken } = await import('@/lib/social-booking/token');
          const rawToken = generateRawToken();

          // Seed an unexpired, unconsumed session
          await seedSessionWithToken(rawToken);

          // First call should succeed
          const result = await tokenService.validateAndConsume(rawToken);
          expect(result.valid).toBe(true);
          if (result.valid) {
            expect(result.sessionId).toBe('session-123');
            expect(result.channel).toBe('whatsapp');
          }
        }
      ),
      { numRuns: 20 }
    );
  });

  it('second validateAndConsume call returns consumed for any valid token', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 1000 }),
        async (_seed) => {
          // Fresh DB per iteration
          mockDb = createInMemoryFirestore();

          const { createTokenService, generateRawToken } = await import('@/lib/social-booking/token');
          const tokenService = createTokenService();

          const rawToken = generateRawToken();
          await seedSessionWithToken(rawToken);

          // First call succeeds
          const firstResult = await tokenService.validateAndConsume(rawToken);
          expect(firstResult.valid).toBe(true);

          // Second call with the same token must return 'consumed'
          const secondResult = await tokenService.validateAndConsume(rawToken);
          expect(secondResult.valid).toBe(false);
          if (!secondResult.valid) {
            expect(secondResult.reason).toBe('consumed');
          }
        }
      ),
      { numRuns: 20 }
    );
  });

  it('for N concurrent validations of the same token, exactly 1 succeeds and N-1 fail with consumed', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 6 }),
        async (concurrency) => {
          // Fresh DB per iteration
          mockDb = createInMemoryFirestore();

          const { createTokenService, generateRawToken } = await import('@/lib/social-booking/token');
          const tokenService = createTokenService();

          const rawToken = generateRawToken();
          await seedSessionWithToken(rawToken);

          // Fire N concurrent validations
          const promises = Array.from({ length: concurrency }, () =>
            tokenService.validateAndConsume(rawToken)
          );
          const results = await Promise.all(promises);

          // Exactly 1 should succeed
          const successes = results.filter((r) => r.valid === true);
          const failures = results.filter((r) => r.valid === false);

          expect(successes).toHaveLength(1);
          expect(failures).toHaveLength(concurrency - 1);

          // All failures should report 'consumed'
          for (const failure of failures) {
            if (!failure.valid) {
              expect(failure.reason).toBe('consumed');
            }
          }
        }
      ),
      { numRuns: 20 }
    );
  });
});
