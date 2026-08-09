/**
 * Feature: social-commerce-guest-booking, Property 10: Session State Machine Transitions
 *
 * For any Social_Booking_Session, the state SHALL only transition through the valid
 * sequence: `started → selecting-session → checkout-created → payment-pending → confirmed`,
 * or from any non-confirmed, non-expired state to `expired` when expiresAt is exceeded.
 * No other state transitions SHALL be permitted.
 *
 * Validates: Requirements 4.1, 4.3, 4.5, 4.6, 4.7, 4.8
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import crypto from 'crypto';
import type { SocialBookingState, SocialChannel } from '@/types';

// ─── In-Memory Firestore Mock ────────────────────────────────────────────────

interface DocData {
  [key: string]: unknown;
}

/**
 * In-memory Firestore mock for session state machine testing.
 * Supports collection/doc/get/set/update and query chaining.
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
        const chainable: Record<string, unknown> = {
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
              if (op === '==' && data[field] === value) match = true;
              if (op === 'not-in' && Array.isArray(value) && !value.includes(data[field])) match = true;

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

  const mockDb = {
    _collections: collections,
    collection: (path: string) => createCollectionRef(path),
  };

  return mockDb;
}

// ─── Mock Setup ──────────────────────────────────────────────────────────────

let mockDb: ReturnType<typeof createInMemoryFirestore>;

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

// ─── Constants ───────────────────────────────────────────────────────────────

const ALL_STATES: SocialBookingState[] = [
  'started',
  'selecting-session',
  'checkout-created',
  'payment-pending',
  'confirmed',
  'expired',
];

const VALID_TRANSITIONS: Record<SocialBookingState, SocialBookingState[]> = {
  'started': ['selecting-session', 'expired'],
  'selecting-session': ['checkout-created', 'expired'],
  'checkout-created': ['payment-pending', 'expired'],
  'payment-pending': ['confirmed', 'expired'],
  'confirmed': [],
  'expired': [],
};

// The linear progression (excluding expired)
const LINEAR_PROGRESSION: SocialBookingState[] = [
  'started',
  'selecting-session',
  'checkout-created',
  'payment-pending',
  'confirmed',
];

// ─── Generators ──────────────────────────────────────────────────────────────

const arbSocialChannel: fc.Arbitrary<SocialChannel> = fc.constantFrom(
  'whatsapp',
  'instagram',
  'messenger'
);

const arbState: fc.Arbitrary<SocialBookingState> = fc.constantFrom(...ALL_STATES);

/** States that can still transition (not terminal) */
const arbNonTerminalState: fc.Arbitrary<SocialBookingState> = fc.constantFrom(
  'started',
  'selecting-session',
  'checkout-created',
  'payment-pending'
);

/** Terminal states */
const arbTerminalState: fc.Arbitrary<SocialBookingState> = fc.constantFrom(
  'confirmed',
  'expired'
);

/** Generate a valid next state for a given current state */
function arbValidNextState(currentState: SocialBookingState): fc.Arbitrary<SocialBookingState> {
  const validNext = VALID_TRANSITIONS[currentState];
  if (validNext.length === 0) {
    // No valid transitions from this state — return the state itself (will be used for invalid check)
    return fc.constantFrom(currentState);
  }
  return fc.constantFrom(...validNext);
}

/** Generate an invalid next state for a given current state */
function arbInvalidNextState(currentState: SocialBookingState): fc.Arbitrary<SocialBookingState> | null {
  const validNext = VALID_TRANSITIONS[currentState];
  const invalidStates = ALL_STATES.filter((s) => !validNext.includes(s) && s !== currentState);
  if (invalidStates.length === 0) return null;
  return fc.constantFrom(...invalidStates);
}

/** Generate a random sequence of N valid forward transitions starting from 'started' */
const arbValidTransitionSequence: fc.Arbitrary<SocialBookingState[]> = fc
  .integer({ min: 1, max: 4 })
  .map((steps) => LINEAR_PROGRESSION.slice(1, steps + 1));

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Seeds a Social_Booking_Session document with a given state and non-expired timestamp.
 */
function seedSession(
  docId: string,
  state: SocialBookingState,
  options?: { expired?: boolean }
): void {
  const col = mockDb._collections.get('social_booking_sessions') ?? new Map();
  mockDb._collections.set('social_booking_sessions', col);

  const expiresAtMs = options?.expired
    ? Date.now() - 60_000 // 1 minute ago (expired)
    : Date.now() + 30 * 60_000; // 30 minutes from now (not expired)

  col.set(docId, {
    id: docId,
    channel: 'whatsapp',
    externalConversationId: 'conv-1',
    externalUserId: 'user-1',
    state,
    sessionId: null,
    checkoutTokenHash: null,
    tokenConsumed: false,
    tokenExpiresAt: null,
    source: 'whatsapp_express',
    campaign: null,
    socialBookingSessionId: docId,
    createdAt: mockTimestamp.now(),
    expiresAt: mockTimestamp.fromMillis(expiresAtMs),
    updatedAt: mockTimestamp.now(),
  });
}

// ─── Property Tests ──────────────────────────────────────────────────────────

describe('Property 10: Session State Machine Transitions', () => {
  beforeEach(() => {
    mockDb = createInMemoryFirestore();
    vi.clearAllMocks();
  });

  it('for any valid state and its allowed next states, transitionState() succeeds', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbNonTerminalState,
        fc.integer({ min: 1, max: 10000 }),
        async (currentState, _seed) => {
          // Fresh DB per iteration
          mockDb = createInMemoryFirestore();

          const { createSessionManager } = await import('@/lib/social-booking/session-manager');
          const manager = createSessionManager();

          const docId = `sbs-${crypto.randomUUID().slice(0, 8)}`;
          seedSession(docId, currentState);

          // Pick a valid next state
          const validNext = VALID_TRANSITIONS[currentState].filter((s) => s !== 'expired');
          if (validNext.length === 0) return; // skip if only 'expired' is valid (handled separately)

          const nextState = validNext[_seed % validNext.length];

          // Should not throw
          await expect(manager.transitionState(docId, nextState)).resolves.not.toThrow();

          // Verify state was updated
          const col = mockDb._collections.get('social_booking_sessions')!;
          const updatedDoc = col.get(docId)!;
          expect(updatedDoc.state).toBe(nextState);
        }
      ),
      { numRuns: 20 }
    );
  });

  it('for any state and an invalid next state, transitionState() throws an error', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbState,
        fc.integer({ min: 0, max: 10000 }),
        async (currentState, _seed) => {
          // Fresh DB per iteration
          mockDb = createInMemoryFirestore();

          const { createSessionManager } = await import('@/lib/social-booking/session-manager');
          const manager = createSessionManager();

          const docId = `sbs-${crypto.randomUUID().slice(0, 8)}`;
          seedSession(docId, currentState);

          // Compute invalid next states for this current state
          const validNext = VALID_TRANSITIONS[currentState];
          const invalidStates = ALL_STATES.filter(
            (s) => !validNext.includes(s) && s !== currentState
          );

          if (invalidStates.length === 0) return; // skip if all states are somehow valid

          const invalidNext = invalidStates[_seed % invalidStates.length];

          // Should throw
          await expect(manager.transitionState(docId, invalidNext)).rejects.toThrow();
        }
      ),
      { numRuns: 20 }
    );
  });

  it('random sequences of valid transitions always follow the linear progression', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbValidTransitionSequence,
        async (transitions) => {
          // Fresh DB per iteration
          mockDb = createInMemoryFirestore();

          const { createSessionManager } = await import('@/lib/social-booking/session-manager');
          const manager = createSessionManager();

          const docId = `sbs-${crypto.randomUUID().slice(0, 8)}`;
          seedSession(docId, 'started');

          // Apply each transition in sequence
          for (const nextState of transitions) {
            await expect(manager.transitionState(docId, nextState)).resolves.not.toThrow();
          }

          // Verify final state matches the last transition
          const col = mockDb._collections.get('social_booking_sessions')!;
          const finalDoc = col.get(docId)!;
          expect(finalDoc.state).toBe(transitions[transitions.length - 1]);

          // Verify the sequence followed linear progression
          const expectedIdx = LINEAR_PROGRESSION.indexOf(transitions[transitions.length - 1]);
          expect(expectedIdx).toBeGreaterThan(0); // At least one step forward from 'started'
        }
      ),
      { numRuns: 20 }
    );
  });

  it('expired sessions cannot transition to any state', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbState,
        async (targetState) => {
          // Fresh DB per iteration
          mockDb = createInMemoryFirestore();

          const { createSessionManager } = await import('@/lib/social-booking/session-manager');
          const manager = createSessionManager();

          const docId = `sbs-${crypto.randomUUID().slice(0, 8)}`;
          seedSession(docId, 'expired');

          // Any transition from 'expired' should throw
          await expect(manager.transitionState(docId, targetState)).rejects.toThrow();
        }
      ),
      { numRuns: 20 }
    );
  });

  it('confirmed sessions cannot transition to any state', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbState,
        async (targetState) => {
          // Fresh DB per iteration
          mockDb = createInMemoryFirestore();

          const { createSessionManager } = await import('@/lib/social-booking/session-manager');
          const manager = createSessionManager();

          const docId = `sbs-${crypto.randomUUID().slice(0, 8)}`;
          seedSession(docId, 'confirmed');

          // Any transition from 'confirmed' should throw
          await expect(manager.transitionState(docId, targetState)).rejects.toThrow();
        }
      ),
      { numRuns: 20 }
    );
  });

  it('non-confirmed, non-expired sessions that have exceeded expiresAt are lazily marked expired and reject transitions', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbNonTerminalState,
        arbState.filter((s) => s !== 'expired'),
        async (currentState, targetState) => {
          // Fresh DB per iteration
          mockDb = createInMemoryFirestore();

          const { createSessionManager } = await import('@/lib/social-booking/session-manager');
          const manager = createSessionManager();

          const docId = `sbs-${crypto.randomUUID().slice(0, 8)}`;
          // Seed with an expired expiresAt timestamp
          seedSession(docId, currentState, { expired: true });

          // Transition should fail because the session has expired
          await expect(manager.transitionState(docId, targetState)).rejects.toThrow(/expired/i);

          // Verify the state was lazily updated to 'expired'
          const col = mockDb._collections.get('social_booking_sessions')!;
          const updatedDoc = col.get(docId)!;
          expect(updatedDoc.state).toBe('expired');
        }
      ),
      { numRuns: 20 }
    );
  });
});
