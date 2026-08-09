/**
 * Tests for social channel programme (term class) booking support.
 *
 * Validates that the social booking service can:
 * - Discover and present available programme classes
 * - Handle programme_selection events
 * - Generate checkout tokens for programme bookings (with classId and bookingType: 'term')
 * - Create term booking drafts through the guest intent API
 *
 * Validates: Requirements 13.6
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type {
  SocialChannel,
  ParsedSocialEvent,
} from '@/types';
import type { ChannelAdapter } from '@/lib/social-booking/adapters/types';

// ─── Hoisted Mock State ──────────────────────────────────────────────────────

const {
  firestoreData,
  kvStore,
  docIdState,
  mockCollection,
  mockRunTransaction,
} = vi.hoisted(() => {
  const firestoreData = new Map<string, Map<string, Record<string, unknown>>>();
  const kvStore = new Map<string, { value: string | number; expiresAt?: number }>();
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
    sendProgrammeList: vi.fn(async () => {}),
    sendProgrammeCheckoutLink: vi.fn(async () => {}),
    parseEvent: vi.fn(() => null),
  };
}

// ─── Test Suite ──────────────────────────────────────────────────────────────

describe('Social Booking - Programme (Term Class) Support', () => {
  let whatsappAdapter: ChannelAdapter;
  let service: ReturnType<typeof createSocialBookingService>;

  const testClassId = 'class_term_holiday_001';
  const testSenderId = '447700900456';
  const testConversationId = 'conv_wa_447700900456';
  const testChannel: SocialChannel = 'whatsapp';

  beforeEach(() => {
    vi.clearAllMocks();
    firestoreData.clear();
    kvStore.clear();
    docIdState.counter = 0;

    process.env.NEXT_PUBLIC_APP_URL = 'https://bloomingtastebuds.co.uk';

    whatsappAdapter = createMockAdapter('whatsapp');
    const adapters = new Map<SocialChannel, ChannelAdapter>();
    adapters.set('whatsapp', whatsappAdapter);
    service = createSocialBookingService({ adapters });

    // Seed with a programme (term) class
    const classesCol = getOrCreateCollection('classes');
    classesCol.set(testClassId, {
      id: testClassId,
      name: 'Junior Chefs Holiday Workshop',
      type: 'kidsAfterSchool',
      commitment: 'term',
      termStartDate: '2027-08-24',
      termEndDate: '2027-08-28',
      termPrice: 6000,
      recurrenceDays: [],
      spotsAvailable: 8,
      maxSize: 10,
      startTime: '11:00',
      endTime: '12:15',
      venueName: 'Blooming Kitchen HQ',
      venueId: 'venue_001',
      ageMin: 5,
      ageMax: 11,
      createdAt: new Date('2025-01-01'),
    });
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_APP_URL;
  });

  it('includes programme classes in the trigger response alongside sessions', async () => {
    // Also seed a per-session offering
    const sessionsCol = getOrCreateCollection('sessions');
    sessionsCol.set('session_001', {
      id: 'session_001',
      className: 'Kids After School Cooking',
      status: 'open',
      spotsAvailable: 5,
      date: '2027-09-15',
      startTime: '15:30',
      venueName: 'Main Venue',
      ageMin: 5,
      ageMax: 12,
      price: 1500,
    });

    const triggerEvent: ParsedSocialEvent = {
      type: 'trigger',
      channel: testChannel,
      senderId: testSenderId,
      conversationId: testConversationId,
      text: 'Book',
    };

    await service.handleInboundMessage(triggerEvent);

    // Both session list and programme list should be sent
    expect(whatsappAdapter.sendSessionList).toHaveBeenCalledTimes(1);
    expect(whatsappAdapter.sendProgrammeList).toHaveBeenCalledTimes(1);
    expect(whatsappAdapter.sendProgrammeList).toHaveBeenCalledWith(
      testSenderId,
      expect.arrayContaining([
        expect.objectContaining({
          classId: testClassId,
          className: 'Junior Chefs Holiday Workshop',
        }),
      ])
    );
  });

  it('sends only programme list when no individual sessions are available', async () => {
    const triggerEvent: ParsedSocialEvent = {
      type: 'trigger',
      channel: testChannel,
      senderId: testSenderId,
      conversationId: testConversationId,
      text: 'Book',
    };

    await service.handleInboundMessage(triggerEvent);

    // Only programme list should be sent (no sessions seeded)
    expect(whatsappAdapter.sendSessionList).not.toHaveBeenCalled();
    expect(whatsappAdapter.sendProgrammeList).toHaveBeenCalledTimes(1);
  });

  it('handles programme_selection event and generates a term booking token', async () => {
    // First trigger to create a social booking session
    const triggerEvent: ParsedSocialEvent = {
      type: 'trigger',
      channel: testChannel,
      senderId: testSenderId,
      conversationId: testConversationId,
      text: 'Book',
    };
    await service.handleInboundMessage(triggerEvent);

    // Now select the programme
    const programmeSelectionEvent: ParsedSocialEvent = {
      type: 'programme_selection',
      channel: testChannel,
      senderId: testSenderId,
      conversationId: testConversationId,
      selectedClassId: testClassId,
    };

    let programmeError: Error | null = null;
    try {
      await service.handleInboundMessage(programmeSelectionEvent);
    } catch (e) {
      programmeError = e as Error;
    }

    expect(programmeError).toBeNull();

    // Verify: sendProgrammeCheckoutLink called with a deep link
    expect(whatsappAdapter.sendProgrammeCheckoutLink).toHaveBeenCalledTimes(1);
    expect(whatsappAdapter.sendProgrammeCheckoutLink).toHaveBeenCalledWith(
      testSenderId,
      expect.stringContaining('https://bloomingtastebuds.co.uk/guest/book-term/'),
      expect.objectContaining({
        classId: testClassId,
        className: 'Junior Chefs Holiday Workshop',
        price: '£60.00 for the programme',
      })
    );

    // Verify: Social booking session has classId and bookingType set
    const socialBookingSessions = getOrCreateCollection('social_booking_sessions');
    const sessionValues = Array.from(socialBookingSessions.values());
    const updatedSession = sessionValues[0];
    expect(updatedSession.classId).toBe(testClassId);
    expect(updatedSession.bookingType).toBe('term');
    expect(updatedSession.sessionId).toBeNull();
    expect(updatedSession.state).toBe('checkout-created');
  });

  it('token validation returns classId and bookingType for programme tokens', async () => {
    // Trigger → programme selection
    const triggerEvent: ParsedSocialEvent = {
      type: 'trigger',
      channel: testChannel,
      senderId: testSenderId,
      conversationId: testConversationId,
      text: 'Book',
    };
    await service.handleInboundMessage(triggerEvent);

    const programmeSelectionEvent: ParsedSocialEvent = {
      type: 'programme_selection',
      channel: testChannel,
      senderId: testSenderId,
      conversationId: testConversationId,
      selectedClassId: testClassId,
    };
    await service.handleInboundMessage(programmeSelectionEvent);

    // Extract token from the deep link
    const call = (whatsappAdapter.sendProgrammeCheckoutLink as ReturnType<typeof vi.fn>).mock.calls[0];
    const deepLinkUrl: string = call[1];
    const rawToken = deepLinkUrl.replace('https://bloomingtastebuds.co.uk/guest/book-term/', '');

    // Validate the token
    const result = await service.validateAndConsumeToken(rawToken);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.classId).toBe(testClassId);
      expect(result.bookingType).toBe('term');
      expect(result.channel).toBe('whatsapp');
    }
  });

  it('rejects programme_selection for a non-term class', async () => {
    // Clear classes collection and seed only a per-session class
    firestoreData.delete('classes');
    const classesCol = getOrCreateCollection('classes');
    classesCol.set('class_persession', {
      id: 'class_persession',
      name: 'Regular Cooking',
      commitment: 'perSession',
      spotsAvailable: 5,
      termStartDate: '2027-01-01',
      termEndDate: '2027-12-31',
      termPrice: 0,
      startTime: '15:30',
      venueName: 'Test Venue',
      ageMin: 5,
      ageMax: 12,
    });

    const triggerEvent: ParsedSocialEvent = {
      type: 'trigger',
      channel: testChannel,
      senderId: testSenderId,
      conversationId: testConversationId,
      text: 'Book',
    };
    await service.handleInboundMessage(triggerEvent);

    // Try to select the per-session class as if it were a programme
    const programmeSelectionEvent: ParsedSocialEvent = {
      type: 'programme_selection',
      channel: testChannel,
      senderId: testSenderId,
      conversationId: testConversationId,
      selectedClassId: 'class_persession',
    };

    await service.handleInboundMessage(programmeSelectionEvent);

    // Should show unavailable message instead of checkout link
    expect(whatsappAdapter.sendSessionUnavailableMessage).toHaveBeenCalledTimes(1);
    expect(whatsappAdapter.sendProgrammeCheckoutLink).not.toHaveBeenCalled();
  });

  it('rejects programme_selection for a full programme', async () => {
    // Make the programme full
    const classesCol = getOrCreateCollection('classes');
    const classData = classesCol.get(testClassId)!;
    classesCol.set(testClassId, { ...classData, spotsAvailable: 0 });

    const triggerEvent: ParsedSocialEvent = {
      type: 'trigger',
      channel: testChannel,
      senderId: testSenderId,
      conversationId: testConversationId,
      text: 'Book',
    };
    await service.handleInboundMessage(triggerEvent);

    const programmeSelectionEvent: ParsedSocialEvent = {
      type: 'programme_selection',
      channel: testChannel,
      senderId: testSenderId,
      conversationId: testConversationId,
      selectedClassId: testClassId,
    };

    await service.handleInboundMessage(programmeSelectionEvent);

    // Should show unavailable message
    expect(whatsappAdapter.sendSessionUnavailableMessage).toHaveBeenCalledTimes(1);
    expect(whatsappAdapter.sendProgrammeCheckoutLink).not.toHaveBeenCalled();
  });

  it('sends programme confirmation via social channel after term booking', async () => {
    // Set up the flow: trigger → programme selection → confirm
    const triggerEvent: ParsedSocialEvent = {
      type: 'trigger',
      channel: testChannel,
      senderId: testSenderId,
      conversationId: testConversationId,
      text: 'Book',
    };
    await service.handleInboundMessage(triggerEvent);

    const programmeSelectionEvent: ParsedSocialEvent = {
      type: 'programme_selection',
      channel: testChannel,
      senderId: testSenderId,
      conversationId: testConversationId,
      selectedClassId: testClassId,
    };
    await service.handleInboundMessage(programmeSelectionEvent);

    // Get the social booking session ID
    const socialBookingSessions = getOrCreateCollection('social_booking_sessions');
    const sessionEntries = Array.from(socialBookingSessions.entries());
    const [sessionId] = sessionEntries[0];

    // After programme_selection, state is 'checkout-created'
    // Transition to payment-pending then confirmed
    const { createSessionManager } = await import('@/lib/social-booking/session-manager');
    const sessionManager = createSessionManager();
    await sessionManager.transitionState(sessionId, 'payment-pending');
    await service.confirmBooking(sessionId, 'pi_test_programme_123');

    // Send social confirmation
    const bookingRef = 'pi_test_programme_123'.slice(-8);
    await service.sendSocialConfirmation(sessionId, bookingRef);

    // Verify: confirmation sent with programme class details
    expect(whatsappAdapter.sendBookingConfirmation).toHaveBeenCalledTimes(1);
    expect(whatsappAdapter.sendBookingConfirmation).toHaveBeenCalledWith(
      testSenderId,
      expect.objectContaining({
        className: 'Junior Chefs Holiday Workshop',
        bookingRef: 'amme_123',
      })
    );
  });
});
