/**
 * Integration test for the full social booking flow.
 *
 * Traces the complete journey: trigger → session list → select → token → redirect → payment → booking with attribution
 *
 * This is a unit-level integration test using mocked Firestore, KV, and external APIs.
 * It validates the orchestration between SocialBookingService, TokenService, SessionManager,
 * and Channel Adapters without hitting real services.
 *
 * Validates: Requirements 19.3, 19.4
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type {
  SocialChannel,
  ParsedSocialEvent,
} from '@/types';
import type { ChannelAdapter } from '@/lib/social-booking/adapters/types';

// ─── Hoisted Mock State ──────────────────────────────────────────────────────
// vi.hoisted runs before vi.mock factory, so these are available to mock closures.

const {
  firestoreData,
  kvStore,
  docIdState,
  mockCollection,
  mockRunTransaction,
} = vi.hoisted(() => {
  // In-memory Firestore store: collectionPath → Map<docId, data>
  const firestoreData = new Map<string, Map<string, Record<string, unknown>>>();
  // In-memory KV store
  const kvStore = new Map<string, { value: string | number; expiresAt?: number }>();
  // Mutable doc id counter
  const docIdState = { counter: 0 };

  function getOrCreateCol(path: string) {
    if (!firestoreData.has(path)) {
      firestoreData.set(path, new Map());
    }
    return firestoreData.get(path)!;
  }

  function makeDocRef(collectionPath: string, docId: string): Record<string, unknown> {
    const ref: Record<string, unknown> = {
      id: docId,
      path: `${collectionPath}/${docId}`,
      get: async () => {
        const col = getOrCreateCol(collectionPath);
        const data = col.get(docId);
        return {
          exists: !!data,
          id: docId,
          data: () => data ?? undefined,
          ref: makeDocRef(collectionPath, docId),
        };
      },
      set: async (data: Record<string, unknown>) => {
        const col = getOrCreateCol(collectionPath);
        col.set(docId, data);
      },
      update: async (data: Record<string, unknown>) => {
        const col = getOrCreateCol(collectionPath);
        const existing = col.get(docId) || {};
        col.set(docId, { ...existing, ...data });
      },
      delete: async () => {
        const col = getOrCreateCol(collectionPath);
        col.delete(docId);
      },
    };
    return ref;
  }

  function makeQuery(collectionPath: string): Record<string, unknown> {
    const q: Record<string, unknown> = {
      where: () => makeQuery(collectionPath),
      orderBy: () => makeQuery(collectionPath),
      limit: () => makeQuery(collectionPath),
      get: async () => {
        const col = getOrCreateCol(collectionPath);
        const docs = Array.from(col.entries()).map(([id, data]) => ({
          id,
          exists: true,
          data: () => data,
          ref: makeDocRef(collectionPath, id),
        }));
        return { docs, empty: docs.length === 0, size: docs.length };
      },
    };
    return q;
  }

  const mockCollection = (path: string) => ({
    doc: (docId?: string) => {
      const id = docId ?? `sbs_auto_${++docIdState.counter}`;
      return makeDocRef(path, id);
    },
    where: () => makeQuery(path),
    orderBy: () => makeQuery(path),
    limit: () => makeQuery(path),
    get: async () => {
      const col = getOrCreateCol(path);
      const docs = Array.from(col.entries()).map(([id, data]) => ({
        id,
        exists: true,
        data: () => data,
        ref: makeDocRef(path, id),
      }));
      return { docs, empty: docs.length === 0, size: docs.length };
    },
  });

  const mockRunTransaction = async (fn: (t: unknown) => Promise<unknown>) => {
    const transaction = {
      get: async (docRef: { get: () => Promise<unknown> }) => docRef.get(),
      set: (docRef: { set: (data: unknown) => void }, data: unknown) => {
        docRef.set(data as Record<string, unknown>);
      },
      update: (docRef: { update: (data: unknown) => void }, data: unknown) => {
        docRef.update(data as Record<string, unknown>);
      },
    };
    return fn(transaction);
  };

  return { firestoreData, kvStore, docIdState, mockCollection, mockRunTransaction };
});

// ─── Mock firebase-admin ─────────────────────────────────────────────────────

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: mockCollection,
    runTransaction: mockRunTransaction,
  },
  default: {
    firestore: {
      Timestamp: {
        now: () => ({
          toMillis: () => Date.now(),
          toDate: () => new Date(),
        }),
        fromMillis: (ms: number) => ({
          toMillis: () => ms,
          toDate: () => new Date(ms),
        }),
      },
      FieldValue: {
        serverTimestamp: () => new Date(),
      },
    },
  },
}));

// ─── Mock @vercel/kv ─────────────────────────────────────────────────────────

vi.mock('@vercel/kv', () => ({
  kv: {
    get: async (key: string) => {
      const entry = kvStore.get(key);
      if (!entry) return null;
      if (entry.expiresAt && Date.now() > entry.expiresAt) {
        kvStore.delete(key);
        return null;
      }
      return entry.value;
    },
    set: async (key: string, value: string | number, options?: { ex?: number }) => {
      const expiresAt = options?.ex ? Date.now() + options.ex * 1000 : undefined;
      kvStore.set(key, { value, expiresAt });
      return 'OK';
    },
    incr: async (key: string) => {
      const entry = kvStore.get(key);
      if (!entry || (entry.expiresAt && Date.now() > entry.expiresAt)) {
        kvStore.set(key, { value: 1 });
        return 1;
      }
      const newValue = (typeof entry.value === 'number' ? entry.value : parseInt(String(entry.value), 10) || 0) + 1;
      entry.value = newValue;
      return newValue;
    },
    expire: async (key: string, seconds: number) => {
      const entry = kvStore.get(key);
      if (!entry) return 0;
      entry.expiresAt = Date.now() + seconds * 1000;
      return 1;
    },
    del: async (...keys: string[]) => {
      keys.forEach((k: string) => kvStore.delete(k));
      return keys.length;
    },
    ttl: async (key: string) => {
      const entry = kvStore.get(key);
      if (!entry || !entry.expiresAt) return -1;
      return Math.max(0, Math.floor((entry.expiresAt - Date.now()) / 1000));
    },
  },
}));

// ─── Test Imports (after mocks) ──────────────────────────────────────────────

import { createSocialBookingService } from '@/lib/social-booking/index';
import { hashToken } from '@/lib/social-booking/token';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getOrCreateCollection(path: string) {
  if (!firestoreData.has(path)) {
    firestoreData.set(path, new Map());
  }
  return firestoreData.get(path)!;
}

function createMockAdapter(channel: SocialChannel): ChannelAdapter {
  return {
    channel,
    sendSessionList: vi.fn(async () => {}),
    sendCheckoutLink: vi.fn(async () => {}),
    sendBookingConfirmation: vi.fn(async () => {}),
    sendNoSessionsMessage: vi.fn(async () => {}),
    sendSessionUnavailableMessage: vi.fn(async () => {}),
    sendHelpMessage: vi.fn(async () => {}),
    sendErrorMessage: vi.fn(async () => {}),
    parseEvent: vi.fn(() => null),
  };
}

// ─── Test Suite ──────────────────────────────────────────────────────────────

describe('Social Booking Flow - Full E2E Integration', () => {
  let whatsappAdapter: ChannelAdapter;
  let service: ReturnType<typeof createSocialBookingService>;

  const testSessionId = 'session_kids_cooking_001';
  const testSenderId = '447700900123';
  const testConversationId = 'conv_wa_447700900123';
  const testChannel: SocialChannel = 'whatsapp';

  beforeEach(() => {
    vi.clearAllMocks();
    firestoreData.clear();
    kvStore.clear();
    docIdState.counter = 0;

    // Set up environment
    process.env.NEXT_PUBLIC_APP_URL = 'https://bloomingtastebuds.co.uk';

    // Create the WhatsApp adapter mock
    whatsappAdapter = createMockAdapter('whatsapp');

    // Create the service with the adapter registered
    const adapters = new Map<SocialChannel, ChannelAdapter>();
    adapters.set('whatsapp', whatsappAdapter);

    service = createSocialBookingService({ adapters });

    // Seed the sessions collection with a bookable session
    const sessionsCol = getOrCreateCollection('sessions');
    sessionsCol.set(testSessionId, {
      id: testSessionId,
      classId: 'class_001',
      className: 'Kids After School Cooking',
      classType: 'kidsAfterSchool',
      date: '2025-09-15',
      startTime: '15:30',
      endTime: '16:30',
      venueName: 'Blooming Kitchen HQ',
      venueId: 'venue_001',
      spotsAvailable: 6,
      spotsTotal: 10,
      status: 'open',
      ageMin: 5,
      ageMax: 12,
      price: 1500,
      createdAt: new Date('2025-01-01'),
    });
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_APP_URL;
  });

  it('completes the full social booking journey from trigger to confirmed booking with attribution', async () => {
    // ─── Step 1: Trigger ─────────────────────────────────────────────────────
    // Customer sends "Book" via WhatsApp
    const triggerEvent: ParsedSocialEvent = {
      type: 'trigger',
      channel: testChannel,
      senderId: testSenderId,
      conversationId: testConversationId,
      text: 'Book',
    };

    await service.handleInboundMessage(triggerEvent);

    // Verify: Social_Booking_Session created with state 'started'
    const socialBookingSessions = getOrCreateCollection('social_booking_sessions');
    expect(socialBookingSessions.size).toBeGreaterThan(0);

    // Get the created session
    const sessionEntries = Array.from(socialBookingSessions.entries());
    const [createdSessionId, createdSessionData] = sessionEntries[0];
    expect(createdSessionData.state).toBe('started');
    expect(createdSessionData.channel).toBe('whatsapp');
    expect(createdSessionData.externalUserId).toBe(testSenderId);

    // Verify: Adapter's sendSessionList called with available sessions
    expect(whatsappAdapter.sendSessionList).toHaveBeenCalledTimes(1);
    expect(whatsappAdapter.sendSessionList).toHaveBeenCalledWith(
      testSenderId,
      expect.arrayContaining([
        expect.objectContaining({
          sessionId: testSessionId,
          className: 'Kids After School Cooking',
        }),
      ])
    );

    // ─── Step 2: Selection ───────────────────────────────────────────────────
    // Customer selects a session via interactive button reply
    const selectionEvent: ParsedSocialEvent = {
      type: 'session_selection',
      channel: testChannel,
      senderId: testSenderId,
      conversationId: testConversationId,
      selectedSessionId: testSessionId,
    };

    await service.handleInboundMessage(selectionEvent);

    // Verify: State transitions to 'checkout-created' (selecting-session is intermediate)
    const updatedSession = socialBookingSessions.get(createdSessionId);
    expect(updatedSession).toBeDefined();
    expect(updatedSession!.state).toBe('checkout-created');
    expect(updatedSession!.sessionId).toBe(testSessionId);

    // Verify: Token hash stored (not raw token)
    expect(updatedSession!.checkoutTokenHash).toBeDefined();
    expect(updatedSession!.checkoutTokenHash).toHaveLength(64); // SHA-256 hex is 64 chars
    expect(updatedSession!.tokenConsumed).toBe(false);

    // Verify: Adapter's sendCheckoutLink called with deep link
    expect(whatsappAdapter.sendCheckoutLink).toHaveBeenCalledTimes(1);
    expect(whatsappAdapter.sendCheckoutLink).toHaveBeenCalledWith(
      testSenderId,
      expect.stringContaining('https://bloomingtastebuds.co.uk/guest/book/'),
      expect.objectContaining({
        sessionId: testSessionId,
        className: 'Kids After School Cooking',
      })
    );

    // Extract the generated token from the deep link URL
    const sendCheckoutLinkCall = (whatsappAdapter.sendCheckoutLink as ReturnType<typeof vi.fn>).mock.calls[0];
    const deepLinkUrl: string = sendCheckoutLinkCall[1];
    const rawToken = deepLinkUrl.replace('https://bloomingtastebuds.co.uk/guest/book/', '');

    // Verify: Token hash matches SHA-256 of raw token
    const expectedHash = hashToken(rawToken);
    expect(updatedSession!.checkoutTokenHash).toBe(expectedHash);

    // ─── Step 3: Token Validation ────────────────────────────────────────────
    // Simulate opening the deep link — call validateAndConsumeToken
    const tokenResult = await service.validateAndConsumeToken(rawToken);

    // Verify: Returns valid result with correct sessionId and channel
    expect(tokenResult.valid).toBe(true);
    if (tokenResult.valid) {
      expect(tokenResult.sessionId).toBe(testSessionId);
      expect(tokenResult.channel).toBe('whatsapp');
      expect(tokenResult.socialBookingSessionId).toBe(createdSessionId);
    }

    // Verify: Token is now consumed
    const consumedSession = socialBookingSessions.get(createdSessionId);
    expect(consumedSession!.tokenConsumed).toBe(true);

    // ─── Step 4: Booking Confirmation ────────────────────────────────────────
    // Simulate Stripe webhook firing — call confirmBooking and sendSocialConfirmation
    const paymentIntentId = 'pi_test_abc123def456';
    const bookingRef = paymentIntentId.slice(-8); // Last 8 chars

    // First transition to payment-pending (happens when PaymentIntent is created)
    // In real flow, this is triggered when the guest checkout creates the PaymentIntent
    const { createSessionManager } = await import('@/lib/social-booking/session-manager');
    const sessionManager = createSessionManager();
    await sessionManager.transitionState(createdSessionId, 'payment-pending');

    // Then confirm the booking (happens when Stripe webhook fires)
    await service.confirmBooking(createdSessionId, paymentIntentId);

    // Verify: Session state transitions to 'confirmed'
    const confirmedSession = socialBookingSessions.get(createdSessionId);
    expect(confirmedSession!.state).toBe('confirmed');

    // Send social confirmation
    await service.sendSocialConfirmation(createdSessionId, bookingRef);

    // Verify: Adapter's sendBookingConfirmation called
    expect(whatsappAdapter.sendBookingConfirmation).toHaveBeenCalledTimes(1);
    expect(whatsappAdapter.sendBookingConfirmation).toHaveBeenCalledWith(
      testSenderId,
      expect.objectContaining({
        className: 'Kids After School Cooking',
        startTime: '15:30',
        venueName: 'Blooming Kitchen HQ',
        bookingRef,
      })
    );

    // ─── Step 5: Attribution Verification ────────────────────────────────────
    // Verify the full attribution chain
    const finalSession = socialBookingSessions.get(createdSessionId);

    // Session has correct channel
    expect(finalSession!.channel).toBe('whatsapp');

    // Session has correct source (would propagate to booking draft)
    expect(finalSession!.source).toBe('whatsapp_express');

    // Session ID is available for attribution
    expect(finalSession!.socialBookingSessionId).toBeDefined();
  });

  it('handles unavailable session selection gracefully', async () => {
    // Create an unavailable session (no spots)
    const sessionsCol = getOrCreateCollection('sessions');
    sessionsCol.set('session_full', {
      id: 'session_full',
      className: 'Full Class',
      status: 'open',
      spotsAvailable: 0,
      date: '2025-09-20',
      startTime: '10:30',
      venueName: 'Test Venue',
      ageMin: 5,
      ageMax: 12,
      price: 1500,
    });

    // Trigger first to create a session
    const triggerEvent: ParsedSocialEvent = {
      type: 'trigger',
      channel: testChannel,
      senderId: testSenderId,
      conversationId: testConversationId,
      text: 'Book',
    };
    await service.handleInboundMessage(triggerEvent);

    // Try to select the full session
    const selectionEvent: ParsedSocialEvent = {
      type: 'session_selection',
      channel: testChannel,
      senderId: testSenderId,
      conversationId: testConversationId,
      selectedSessionId: 'session_full',
    };

    await service.handleInboundMessage(selectionEvent);

    // Verify: sendSessionUnavailableMessage called (not sendCheckoutLink)
    expect(whatsappAdapter.sendSessionUnavailableMessage).toHaveBeenCalledTimes(1);
    expect(whatsappAdapter.sendCheckoutLink).not.toHaveBeenCalled();

    // Verify: No state transition to selecting-session or checkout-created
    const socialBookingSessions = getOrCreateCollection('social_booking_sessions');
    const sessions = Array.from(socialBookingSessions.values());
    for (const session of sessions) {
      expect(session.state).not.toBe('selecting-session');
      expect(session.state).not.toBe('checkout-created');
    }
  });

  it('reuses active session on repeated trigger', async () => {
    // First trigger — creates session
    const triggerEvent: ParsedSocialEvent = {
      type: 'trigger',
      channel: testChannel,
      senderId: testSenderId,
      conversationId: testConversationId,
      text: 'Book',
    };

    await service.handleInboundMessage(triggerEvent);

    const socialBookingSessions = getOrCreateCollection('social_booking_sessions');
    const firstSize = socialBookingSessions.size;
    expect(firstSize).toBeGreaterThan(0);

    // Second trigger — should reuse the existing session
    await service.handleInboundMessage(triggerEvent);

    // Verify: No new session created (same size)
    expect(socialBookingSessions.size).toBe(firstSize);

    // Verify: sendSessionList called both times
    expect(whatsappAdapter.sendSessionList).toHaveBeenCalledTimes(2);
  });

  it('sends no-sessions message when no sessions are available', async () => {
    // Clear sessions collection so no sessions are available
    firestoreData.delete('sessions');

    const triggerEvent: ParsedSocialEvent = {
      type: 'trigger',
      channel: testChannel,
      senderId: testSenderId,
      conversationId: testConversationId,
      text: 'Book',
    };

    await service.handleInboundMessage(triggerEvent);

    // Verify: sendNoSessionsMessage called
    expect(whatsappAdapter.sendNoSessionsMessage).toHaveBeenCalledTimes(1);
    expect(whatsappAdapter.sendNoSessionsMessage).toHaveBeenCalledWith(testSenderId);
    expect(whatsappAdapter.sendSessionList).not.toHaveBeenCalled();
  });

  it('sends help message for unrecognised commands', async () => {
    const unknownEvent: ParsedSocialEvent = {
      type: 'unknown',
      channel: testChannel,
      senderId: testSenderId,
      conversationId: testConversationId,
      text: 'What is this?',
    };

    await service.handleInboundMessage(unknownEvent);

    // Verify: sendHelpMessage called
    expect(whatsappAdapter.sendHelpMessage).toHaveBeenCalledTimes(1);
    expect(whatsappAdapter.sendHelpMessage).toHaveBeenCalledWith(testSenderId);
  });

  it('validates that consumed token cannot be used twice', async () => {
    // Set up flow: trigger → selection → get token
    const triggerEvent: ParsedSocialEvent = {
      type: 'trigger',
      channel: testChannel,
      senderId: testSenderId,
      conversationId: testConversationId,
      text: 'Book',
    };
    await service.handleInboundMessage(triggerEvent);

    const selectionEvent: ParsedSocialEvent = {
      type: 'session_selection',
      channel: testChannel,
      senderId: testSenderId,
      conversationId: testConversationId,
      selectedSessionId: testSessionId,
    };
    await service.handleInboundMessage(selectionEvent);

    // Extract token
    const sendCheckoutLinkCall = (whatsappAdapter.sendCheckoutLink as ReturnType<typeof vi.fn>).mock.calls[0];
    const deepLinkUrl: string = sendCheckoutLinkCall[1];
    const rawToken = deepLinkUrl.replace('https://bloomingtastebuds.co.uk/guest/book/', '');

    // First validation — should succeed
    const result1 = await service.validateAndConsumeToken(rawToken);
    expect(result1.valid).toBe(true);

    // Second validation — should fail with 'consumed'
    const result2 = await service.validateAndConsumeToken(rawToken);
    expect(result2.valid).toBe(false);
    if (!result2.valid) {
      expect(result2.reason).toBe('consumed');
    }
  });

  it('supports campaign attribution throughout the flow', async () => {
    // Trigger to create session
    const triggerEvent: ParsedSocialEvent = {
      type: 'trigger',
      channel: testChannel,
      senderId: testSenderId,
      conversationId: testConversationId,
      text: 'Book',
    };
    await service.handleInboundMessage(triggerEvent);

    // Get the created session and manually add campaign data (simulating UTM propagation)
    const socialBookingSessions = getOrCreateCollection('social_booking_sessions');
    const sessionEntries = Array.from(socialBookingSessions.entries());
    const [sessionId] = sessionEntries[0];
    socialBookingSessions.set(sessionId, {
      ...socialBookingSessions.get(sessionId)!,
      campaign: {
        source: 'instagram-ad',
        medium: 'social',
        campaign: 'summer-cooking-2025',
      },
    });

    // Complete selection
    const selectionEvent: ParsedSocialEvent = {
      type: 'session_selection',
      channel: testChannel,
      senderId: testSenderId,
      conversationId: testConversationId,
      selectedSessionId: testSessionId,
    };
    await service.handleInboundMessage(selectionEvent);

    // Extract token and validate
    const sendCheckoutLinkCall = (whatsappAdapter.sendCheckoutLink as ReturnType<typeof vi.fn>).mock.calls[0];
    const deepLinkUrl: string = sendCheckoutLinkCall[1];
    const rawToken = deepLinkUrl.replace('https://bloomingtastebuds.co.uk/guest/book/', '');

    const tokenResult = await service.validateAndConsumeToken(rawToken);

    // Verify campaign attribution is propagated through token validation
    expect(tokenResult.valid).toBe(true);
    if (tokenResult.valid) {
      expect(tokenResult.channel).toBe('whatsapp');
      expect(tokenResult.socialBookingSessionId).toBeDefined();
      // Campaign should be available from the session (for propagation to draft)
      expect(tokenResult.campaign).toEqual({
        source: 'instagram-ad',
        medium: 'social',
        campaign: 'summer-cooking-2025',
      });
    }
  });
});
