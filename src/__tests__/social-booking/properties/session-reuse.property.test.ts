/**
 * Feature: social-commerce-guest-booking, Property 18: Active Session Reuse
 *
 * For any customer who already has an active (non-expired, non-confirmed)
 * Social_Booking_Session on the same channel, initiating a new booking
 * conversation SHALL return the existing session rather than creating a duplicate.
 *
 * Validates: Requirements 4.10
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import crypto from 'crypto';

// ─── In-Memory Firestore Mock ────────────────────────────────────────────────

interface DocData {
  [key: string]: unknown;
}

/**
 * Creates an in-memory Firestore mock for session reuse testing.
 * Supports:
 * - Document CRUD in social_booking_sessions collection
 * - Compound queries: where('channel', '==', ...).where('externalUserId', '==', ...).where('state', 'not-in', [...])
 * - orderBy, limit, get
 * - Tracking created document count
 */
function createInMemoryFirestore() {
  const collections = new Map<string, Map<string, DocData>>();
  let docCreateCount = 0;

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
          data: () => data ?? null,
          ref: createDocRef(collectionName, docId),
        };
      },
      set: async (data: DocData) => {
        const col = getCollection(collectionName);
        col.set(docId, { ...data });
        docCreateCount++;
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
        // Build a filter chain that accumulates conditions
        const filters: Array<{ field: string; op: string; value: unknown }> = [
          { field, op, value },
        ];

        const chainable = {
          where: (f: string, o: string, v: unknown) => {
            filters.push({ field: f, op: o, value: v });
            return chainable;
          },
          orderBy: () => chainable,
          limit: (_n: number) => chainable,
          get: async () => {
            const col = getCollection(collectionName);
            const matchingDocs: Array<{
              id: string;
              exists: boolean;
              data: () => DocData;
              ref: ReturnType<typeof createDocRef>;
            }> = [];

            for (const [id, data] of col.entries()) {
              let allMatch = true;

              for (const filter of filters) {
                if (filter.op === '==') {
                  if (data[filter.field] !== filter.value) {
                    allMatch = false;
                    break;
                  }
                } else if (filter.op === 'not-in') {
                  const arr = filter.value as unknown[];
                  if (arr.includes(data[filter.field])) {
                    allMatch = false;
                    break;
                  }
                } else if (filter.op === '>') {
                  if (!((data[filter.field] as number) > (filter.value as number))) {
                    allMatch = false;
                    break;
                  }
                }
              }

              if (allMatch) {
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

  const mockDb = {
    _collections: collections,
    _getDocCreateCount: () => docCreateCount,
    _resetDocCreateCount: () => { docCreateCount = 0; },
    collection: (path: string) => createCollectionRef(path),
  };

  return mockDb;
}

// ─── Mock Setup ──────────────────────────────────────────────────────────────

let mockDb: ReturnType<typeof createInMemoryFirestore>;

vi.mock('@/lib/firebase-admin', () => {
  return {
    adminDb: {
      collection: (...args: unknown[]) => mockDb.collection(args[0] as string),
    },
    default: {
      firestore: {
        Timestamp: {
          now: () => ({
            toMillis: () => Date.now(),
          }),
          fromMillis: (ms: number) => ({
            toMillis: () => ms,
          }),
        },
        FieldValue: {
          serverTimestamp: () => ({ _type: 'SERVER_TIMESTAMP', toMillis: () => Date.now() }),
        },
      },
    },
  };
});

// ─── Generators ──────────────────────────────────────────────────────────────

const channelArb = fc.constantFrom<'whatsapp' | 'instagram' | 'messenger'>(
  'whatsapp',
  'instagram',
  'messenger'
);

const externalUserIdArb = fc.stringMatching(/^user-[a-z0-9]{4,12}$/);

const externalConversationIdArb = fc.stringMatching(/^conv-[a-z0-9]{4,12}$/);

const activeStateArb = fc.constantFrom<'started' | 'selecting-session' | 'checkout-created' | 'payment-pending'>(
  'started',
  'selecting-session',
  'checkout-created',
  'payment-pending'
);

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Seeds an active Social_Booking_Session in the in-memory Firestore.
 * Active means: non-expired, non-confirmed state.
 */
function seedActiveSession(
  channel: 'whatsapp' | 'instagram' | 'messenger',
  externalUserId: string,
  externalConversationId: string,
  state: 'started' | 'selecting-session' | 'checkout-created' | 'payment-pending'
): string {
  const col = mockDb._collections.get('social_booking_sessions') ?? new Map();
  mockDb._collections.set('social_booking_sessions', col);

  const docId = `sbs-${crypto.randomUUID().slice(0, 8)}`;
  const now = Date.now();
  const expiresAt = now + 30 * 60 * 1000; // 30 minutes from now (not expired)

  col.set(docId, {
    id: docId,
    channel,
    externalConversationId,
    externalUserId,
    state,
    sessionId: null,
    checkoutTokenHash: null,
    tokenConsumed: false,
    tokenExpiresAt: null,
    source: `${channel}_express`,
    campaign: null,
    socialBookingSessionId: docId,
    createdAt: { toMillis: () => now, _type: 'TIMESTAMP' },
    expiresAt: { toMillis: () => expiresAt, _type: 'TIMESTAMP' },
    updatedAt: { toMillis: () => now, _type: 'TIMESTAMP' },
  });

  return docId;
}

// ─── Property Tests ──────────────────────────────────────────────────────────

describe('Property 18: Active Session Reuse', () => {
  beforeEach(() => {
    mockDb = createInMemoryFirestore();
    vi.clearAllMocks();
  });

  it('returns the existing active session instead of creating a new one for the same channel/user', async () => {
    await fc.assert(
      fc.asyncProperty(
        channelArb,
        externalUserIdArb,
        externalConversationIdArb,
        activeStateArb,
        async (channel, externalUserId, externalConversationId, activeState) => {
          // Fresh DB per iteration
          mockDb = createInMemoryFirestore();

          // Seed an active session for this user/channel
          const existingSessionId = seedActiveSession(
            channel,
            externalUserId,
            externalConversationId,
            activeState
          );

          // Import session manager (picks up current mock)
          const { createSessionManager } = await import('@/lib/social-booking/session-manager');
          const sessionManager = createSessionManager();

          // Reset create count after seeding (seeding uses direct map insertion, not set)
          mockDb._resetDocCreateCount();

          // Call createOrReuseSession for the same user/channel
          const result = await sessionManager.createOrReuseSession(
            channel,
            externalUserId,
            externalConversationId
          );

          // Property 1: Should return the existing session, not create a new one
          expect(result.id).toBe(existingSessionId);

          // Property 2: The returned session has the same ID as the existing active session
          expect(result.channel).toBe(channel);
          expect(result.externalUserId).toBe(externalUserId);

          // Property 3: No new document was created in Firestore
          const col = mockDb._collections.get('social_booking_sessions')!;
          expect(col.size).toBe(1); // Only the seeded document exists
          expect(mockDb._getDocCreateCount()).toBe(0); // No new docs created via set()
        }
      ),
      { numRuns: 20 }
    );
  });

  it('creates a new session when no active session exists for the user/channel', async () => {
    await fc.assert(
      fc.asyncProperty(
        channelArb,
        externalUserIdArb,
        externalConversationIdArb,
        async (channel, externalUserId, externalConversationId) => {
          // Fresh DB per iteration — no existing sessions
          mockDb = createInMemoryFirestore();

          const { createSessionManager } = await import('@/lib/social-booking/session-manager');
          const sessionManager = createSessionManager();

          const result = await sessionManager.createOrReuseSession(
            channel,
            externalUserId,
            externalConversationId
          );

          // Should have created a new session
          expect(result.state).toBe('started');
          expect(result.channel).toBe(channel);
          expect(result.externalUserId).toBe(externalUserId);

          // Exactly one document should exist
          const col = mockDb._collections.get('social_booking_sessions')!;
          expect(col.size).toBe(1);
          expect(mockDb._getDocCreateCount()).toBe(1);
        }
      ),
      { numRuns: 20 }
    );
  });

  it('does not reuse sessions from a different channel for the same user', async () => {
    await fc.assert(
      fc.asyncProperty(
        externalUserIdArb,
        externalConversationIdArb,
        activeStateArb,
        async (externalUserId, externalConversationId, activeState) => {
          // Fresh DB per iteration
          mockDb = createInMemoryFirestore();

          // Seed an active session on WhatsApp
          seedActiveSession(
            'whatsapp',
            externalUserId,
            externalConversationId,
            activeState
          );

          const { createSessionManager } = await import('@/lib/social-booking/session-manager');
          const sessionManager = createSessionManager();

          mockDb._resetDocCreateCount();

          // Request a session on Instagram (different channel)
          const result = await sessionManager.createOrReuseSession(
            'instagram',
            externalUserId,
            externalConversationId
          );

          // Should have created a new session — not reused the WhatsApp session
          expect(result.channel).toBe('instagram');
          expect(result.state).toBe('started');
          expect(mockDb._getDocCreateCount()).toBe(1);

          // Two documents should now exist
          const col = mockDb._collections.get('social_booking_sessions')!;
          expect(col.size).toBe(2);
        }
      ),
      { numRuns: 20 }
    );
  });
});
