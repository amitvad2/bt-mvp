/**
 * Regression tests for existing booking flows.
 *
 * Verifies that introducing social booking features has NOT broken existing
 * booking flows. Tests the Stripe webhook's booking creation logic with mock
 * data matching the existing patterns.
 *
 * Requirements: 15.1, 15.2, 15.3, 15.6, 19.5
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted Mocks ──────────────────────────────────────────────────────────

const { mockFirestore, mockFieldValue, mockConstructEvent } = vi.hoisted(() => {
  // IMPORTANT: Set before any module imports (webhook captures this at module load)
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret';

  const store = new Map<string, Record<string, unknown>>();

  const mockFieldValue = {
    serverTimestamp: () => 'SERVER_TIMESTAMP',
    increment: (n: number) => ({ _increment: n }),
  };

  const createDocRef = (path: string) => ({
    id: path.split('/').pop()!,
    path,
    get: vi.fn(async () => {
      const data = store.get(path);
      return { exists: !!data, id: path.split('/').pop()!, data: () => data };
    }),
    set: vi.fn(async (data: Record<string, unknown>) => {
      store.set(path, data);
    }),
    update: vi.fn(async (data: Record<string, unknown>) => {
      const existing = store.get(path) ?? {};
      store.set(path, { ...existing, ...data });
    }),
    delete: vi.fn(async () => { store.delete(path); }),
  });

  const mockFirestore = {
    _store: store,
    doc: vi.fn((path: string) => createDocRef(path)),
    collection: vi.fn(),
    runTransaction: vi.fn(async (fn: (tx: unknown) => Promise<void>) => {
      const tx = {
        get: vi.fn(async (ref: ReturnType<typeof createDocRef>) => ref.get()),
        set: vi.fn((ref: ReturnType<typeof createDocRef>, data: Record<string, unknown>) => {
          ref.set(data);
        }),
        update: vi.fn((ref: ReturnType<typeof createDocRef>, data: Record<string, unknown>) => {
          ref.update(data);
        }),
      };
      await fn(tx);
    }),
  };

  const mockConstructEvent = vi.fn();

  return { mockFirestore, mockFieldValue, store, mockConstructEvent };
});

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: mockFirestore,
}));

vi.mock('firebase-admin', () => ({
  default: {
    firestore: {
      FieldValue: mockFieldValue,
      Timestamp: {
        now: () => ({ toMillis: () => Date.now() }),
        fromMillis: (ms: number) => ({ toMillis: () => ms }),
      },
    },
  },
  firestore: {
    FieldValue: mockFieldValue,
    Timestamp: {
      now: () => ({ toMillis: () => Date.now() }),
      fromMillis: (ms: number) => ({ toMillis: () => ms }),
    },
  },
}));

vi.mock('@/lib/stripe', () => ({
  default: {
    webhooks: {
      constructEvent: mockConstructEvent,
    },
  },
}));

vi.mock('@/lib/resend', () => ({
  resend: {
    emails: { send: vi.fn(async () => ({ data: { id: 'email_123' } })) },
  },
}));

vi.mock('@/lib/guest-validation', () => ({
  determineSafetyReviewStatus: vi.fn(() => 'not_required'),
}));

vi.mock('@/lib/social-booking', () => ({
  createSocialBookingService: vi.fn(() => ({
    confirmBooking: vi.fn(async () => {}),
    sendSocialConfirmation: vi.fn(async () => {}),
  })),
}));

vi.mock('@/lib/social-booking/adapters/whatsapp', () => ({
  WhatsAppAdapter: vi.fn(),
}));
vi.mock('@/lib/social-booking/adapters/instagram', () => ({
  InstagramAdapter: vi.fn(),
}));
vi.mock('@/lib/social-booking/adapters/messenger', () => ({
  MessengerAdapter: vi.fn(),
}));

import { POST } from '@/app/api/webhooks/stripe/route';

// ─── Test Fixtures ───────────────────────────────────────────────────────────

const AUTHENTICATED_DRAFT = {
  sessionId: 'session_001',
  sessionDate: '2025-07-21',
  className: 'Kids After School Cooking',
  venueName: 'Blooming Kitchen HQ',
  startTime: '15:30',
  endTime: '16:30',
  bookedByUid: 'user_abc123',
  bookedByName: 'Jane Smith',
  bookedByEmail: 'jane@example.com',
  studentId: 'student_xyz789',
  studentName: 'Tommy Smith',
  medicalInfo: { foodAllergies: false, epipenRequired: false },
  emergencyContact: { name: 'John Smith', phone: '07700900123' },
  questionnaire: { dietaryNeeds: 'none' },
  termsAccepted: true,
};

const GUEST_DRAFT = {
  bookingMode: 'guest',
  sessionId: 'session_002',
  source: 'website',
  className: 'Weekend Young Adult Cooking',
  sessionDate: '2025-07-26',
  venueName: "St Mary's Community Centre",
  startTime: '10:30',
  endTime: '12:30',
  guestContact: {
    firstName: 'Sarah',
    lastName: 'Jones',
    email: 'sarah@example.com',
    phone: '07700900456',
  },
  childDetails: { firstName: 'Lily', lastName: 'Jones', dateOfBirth: '2015-03-15' },
  medicalInfo: { foodAllergies: false, epipenRequired: false,
    respiratoryProblems: false, airborneAllergies: false, medicalConditions: '' },
  allergyDietaryInfo: { allergies: [], dietaryPreferences: [] },
  emergencyContact: { name: 'Sarah Jones', phone: '07700900456', relation: 'Mother' },
  authorisedCollector: { name: 'Sarah Jones', relation: 'Mother' },
  consentAudit: {
    consents: { termsAccepted: true, dataProcessing: true, photoPermission: true },
    acceptedAt: 'SERVER_TIMESTAMP',
    acceptedBy: 'Sarah Jones',
    termsVersion: '1.0',
    privacyNoticeVersion: '1.0',
    sourceChannel: 'website_express',
    submissionTimestamp: 'SERVER_TIMESTAMP',
  },
};

const GUEST_DRAFT_WITH_SOCIAL_ATTRIBUTION = {
  ...GUEST_DRAFT,
  socialAttribution: {
    bookingSource: 'whatsapp_express',
    campaign: { source: 'instagram-ad', medium: 'social', campaign: 'summer-2025' },
    socialBookingSessionId: 'sbs_abc123',
  },
};

const SESSION_DATA = {
  className: 'Kids After School Cooking',
  classType: 'kidsAfterSchool',
  date: '2025-07-21',
  startTime: '15:30',
  endTime: '16:30',
  venueName: 'Blooming Kitchen HQ',
  ageMin: 5,
  ageMax: 12,
  price: 1500,
  spotsAvailable: 6,
  status: 'open',
};

function createPaymentIntent(id: string, amount = 1500) {
  return {
    id,
    amount,
    currency: 'gbp',
    status: 'succeeded',
    metadata: {},
  };
}

function createStripeEvent(type: string, paymentIntent: Record<string, unknown>) {
  return {
    id: `evt_${Date.now()}`,
    type,
    data: { object: paymentIntent },
    created: Math.floor(Date.now() / 1000),
  };
}

function createRequest(body: unknown): Request {
  return new Request('http://localhost/api/webhooks/stripe', {
    method: 'POST',
    headers: { 'stripe-signature': 'test_sig_valid' },
    body: JSON.stringify(body),
  });
}

// ─── Test Suite ──────────────────────────────────────────────────────────────

describe('Regression: Existing Booking Flows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFirestore._store.clear();
  });

  describe('Authenticated booking flow (bookingMode: account)', () => {
    it('creates booking document with correct structure via webhook', async () => {
      const piId = 'pi_auth_test_001';
      const pi = createPaymentIntent(piId);
      const event = createStripeEvent('payment_intent.succeeded', pi);

      // Seed the draft
      mockFirestore._store.set(`booking_drafts/${piId}`, AUTHENTICATED_DRAFT);
      // Seed the session
      mockFirestore._store.set(`sessions/${AUTHENTICATED_DRAFT.sessionId}`, SESSION_DATA);

      mockConstructEvent.mockReturnValue(event as any);

      const req = createRequest(event);
      const response = await POST(req);

      expect(response.status).toBe(200);

      // Verify booking was created with correct ID (idempotency)
      const booking = mockFirestore._store.get(`bookings/${piId}`);
      expect(booking).toBeDefined();
      expect(booking!.sessionId).toBe(AUTHENTICATED_DRAFT.sessionId);
      expect(booking!.sessionDate).toBe(AUTHENTICATED_DRAFT.sessionDate);
      expect(booking!.className).toBe(AUTHENTICATED_DRAFT.className);
      expect(booking!.venueName).toBe(AUTHENTICATED_DRAFT.venueName);
      expect(booking!.bookedByUid).toBe(AUTHENTICATED_DRAFT.bookedByUid);
      expect(booking!.bookedByName).toBe(AUTHENTICATED_DRAFT.bookedByName);
      expect(booking!.studentId).toBe(AUTHENTICATED_DRAFT.studentId);
      expect(booking!.studentName).toBe(AUTHENTICATED_DRAFT.studentName);
      expect(booking!.status).toBe('confirmed');
      expect(booking!.medicalInfo).toEqual(AUTHENTICATED_DRAFT.medicalInfo);
      expect(booking!.emergencyContact).toEqual(AUTHENTICATED_DRAFT.emergencyContact);
      expect(booking!.questionnaire).toEqual(AUTHENTICATED_DRAFT.questionnaire);
      expect(booking!.termsAccepted).toBe(true);
    });

    it('booking document ID equals PaymentIntent ID (idempotency)', async () => {
      const piId = 'pi_idempotency_auth_002';
      const pi = createPaymentIntent(piId);
      const event = createStripeEvent('payment_intent.succeeded', pi);

      mockFirestore._store.set(`booking_drafts/${piId}`, AUTHENTICATED_DRAFT);
      mockFirestore._store.set(`sessions/${AUTHENTICATED_DRAFT.sessionId}`, SESSION_DATA);

      mockConstructEvent.mockReturnValue(event as any);

      const req = createRequest(event);
      await POST(req);

      // The booking document key is the PaymentIntent ID
      const booking = mockFirestore._store.get(`bookings/${piId}`);
      expect(booking).toBeDefined();

      // Payment object references the same PI ID
      const payment = booking!.payment as Record<string, unknown>;
      expect(payment.stripePaymentIntentId).toBe(piId);
    });

    it('payment field has correct structure', async () => {
      const piId = 'pi_payment_struct_003';
      const pi = createPaymentIntent(piId, 2500);
      const event = createStripeEvent('payment_intent.succeeded', pi);

      mockFirestore._store.set(`booking_drafts/${piId}`, AUTHENTICATED_DRAFT);
      mockFirestore._store.set(`sessions/${AUTHENTICATED_DRAFT.sessionId}`, SESSION_DATA);

      mockConstructEvent.mockReturnValue(event as any);

      const req = createRequest(event);
      await POST(req);

      const booking = mockFirestore._store.get(`bookings/${piId}`);
      const payment = booking!.payment as Record<string, unknown>;
      expect(payment).toEqual({
        stripePaymentIntentId: piId,
        amount: 2500,
        currency: 'gbp',
        status: 'paid',
        receiptUrl: null,
      });
    });
  });

  describe('Guest express checkout flow (bookingMode: guest, no social attribution)', () => {
    it('creates guest booking with default website_express acquisition', async () => {
      const piId = 'pi_guest_test_001';
      const pi = createPaymentIntent(piId);
      const event = createStripeEvent('payment_intent.succeeded', pi);

      mockFirestore._store.set(`booking_drafts/${piId}`, GUEST_DRAFT);
      mockFirestore._store.set(`sessions/${GUEST_DRAFT.sessionId}`, {
        ...SESSION_DATA,
        className: 'Weekend Young Adult Cooking',
        date: '2025-07-26',
        startTime: '10:30',
        endTime: '12:30',
        venueName: "St Mary's Community Centre",
      });

      mockConstructEvent.mockReturnValue(event as any);

      const req = createRequest(event);
      const response = await POST(req);

      expect(response.status).toBe(200);

      const booking = mockFirestore._store.get(`bookings/${piId}`);
      expect(booking).toBeDefined();
      expect(booking!.bookingMode).toBe('guest');

      // Acquisition defaults to website_express when no social attribution
      const acquisition = booking!.acquisition as Record<string, unknown>;
      expect(acquisition).toEqual({
        bookingSource: 'website_express',
        campaign: null,
        socialBookingSessionId: null,
      });
    });

    it('preserves guest contact and child snapshot fields', async () => {
      const piId = 'pi_guest_fields_002';
      const pi = createPaymentIntent(piId);
      const event = createStripeEvent('payment_intent.succeeded', pi);

      mockFirestore._store.set(`booking_drafts/${piId}`, GUEST_DRAFT);
      mockFirestore._store.set(`sessions/${GUEST_DRAFT.sessionId}`, {
        ...SESSION_DATA, spotsAvailable: 4,
      });

      mockConstructEvent.mockReturnValue(event as any);

      const req = createRequest(event);
      await POST(req);

      const booking = mockFirestore._store.get(`bookings/${piId}`);
      expect(booking!.guestContact).toEqual(GUEST_DRAFT.guestContact);
      expect(booking!.childSnapshot).toEqual(GUEST_DRAFT.childDetails);
      expect(booking!.medicalSnapshot).toEqual(GUEST_DRAFT.medicalInfo);
      expect(booking!.emergencyContactSnapshot).toEqual(GUEST_DRAFT.emergencyContact);
      expect(booking!.authorisedCollectorSnapshot).toEqual(GUEST_DRAFT.authorisedCollector);
      expect(booking!.consentAudit).toEqual(GUEST_DRAFT.consentAudit);
    });

    it('booking document ID equals PaymentIntent ID (guest idempotency)', async () => {
      const piId = 'pi_guest_idemp_003';
      const pi = createPaymentIntent(piId);
      const event = createStripeEvent('payment_intent.succeeded', pi);

      mockFirestore._store.set(`booking_drafts/${piId}`, GUEST_DRAFT);
      mockFirestore._store.set(`sessions/${GUEST_DRAFT.sessionId}`, SESSION_DATA);

      mockConstructEvent.mockReturnValue(event as any);

      const req = createRequest(event);
      await POST(req);

      const booking = mockFirestore._store.get(`bookings/${piId}`);
      expect(booking).toBeDefined();
      expect(booking!.id).toBe(piId);

      const payment = booking!.payment as Record<string, unknown>;
      expect(payment.stripePaymentIntentId).toBe(piId);
    });
  });

  describe('Guest express checkout with social attribution', () => {
    it('creates booking with correct social acquisition metadata', async () => {
      const piId = 'pi_social_guest_001';
      const pi = createPaymentIntent(piId);
      const event = createStripeEvent('payment_intent.succeeded', pi);

      mockFirestore._store.set(`booking_drafts/${piId}`, GUEST_DRAFT_WITH_SOCIAL_ATTRIBUTION);
      mockFirestore._store.set(`sessions/${GUEST_DRAFT.sessionId}`, SESSION_DATA);

      mockConstructEvent.mockReturnValue(event as any);

      const req = createRequest(event);
      const response = await POST(req);

      expect(response.status).toBe(200);

      const booking = mockFirestore._store.get(`bookings/${piId}`);
      expect(booking).toBeDefined();

      const acquisition = booking!.acquisition as Record<string, unknown>;
      expect(acquisition).toEqual({
        bookingSource: 'whatsapp_express',
        campaign: { source: 'instagram-ad', medium: 'social', campaign: 'summer-2025' },
        socialBookingSessionId: 'sbs_abc123',
      });
    });

    it('preserves all other fields identically to non-social guest booking', async () => {
      const piId = 'pi_social_fields_002';
      const pi = createPaymentIntent(piId);
      const event = createStripeEvent('payment_intent.succeeded', pi);

      mockFirestore._store.set(`booking_drafts/${piId}`, GUEST_DRAFT_WITH_SOCIAL_ATTRIBUTION);
      mockFirestore._store.set(`sessions/${GUEST_DRAFT.sessionId}`, SESSION_DATA);

      mockConstructEvent.mockReturnValue(event as any);

      const req = createRequest(event);
      await POST(req);

      const booking = mockFirestore._store.get(`bookings/${piId}`);

      // All non-acquisition fields should be identical
      expect(booking!.bookingMode).toBe('guest');
      expect(booking!.sessionId).toBe(GUEST_DRAFT.sessionId);
      expect(booking!.status).toBe('confirmed');
      expect(booking!.guestContact).toEqual(GUEST_DRAFT.guestContact);
      expect(booking!.childSnapshot).toEqual(GUEST_DRAFT.childDetails);
      expect(booking!.medicalSnapshot).toEqual(GUEST_DRAFT.medicalInfo);
      expect(booking!.emergencyContactSnapshot).toEqual(GUEST_DRAFT.emergencyContact);
      expect(booking!.consentAudit).toEqual(GUEST_DRAFT.consentAudit);

      const payment = booking!.payment as Record<string, unknown>;
      expect(payment.stripePaymentIntentId).toBe(piId);
      expect(payment.amount).toBe(1500);
      expect(payment.currency).toBe('gbp');
      expect(payment.status).toBe('paid');
    });
  });

  describe('Existing fields preserved regardless of attribution', () => {
    it('medicalInfo, emergencyContact, payment, sessionId present on authenticated booking', async () => {
      const piId = 'pi_preserved_auth_001';
      const pi = createPaymentIntent(piId);
      const event = createStripeEvent('payment_intent.succeeded', pi);

      mockFirestore._store.set(`booking_drafts/${piId}`, AUTHENTICATED_DRAFT);
      mockFirestore._store.set(`sessions/${AUTHENTICATED_DRAFT.sessionId}`, SESSION_DATA);

      mockConstructEvent.mockReturnValue(event as any);

      const req = createRequest(event);
      await POST(req);

      const booking = mockFirestore._store.get(`bookings/${piId}`);
      expect(booking).toBeDefined();

      // Core fields exist
      expect(booking!.sessionId).toBe('session_001');
      expect(booking!.medicalInfo).toBeDefined();
      expect(booking!.emergencyContact).toBeDefined();
      expect(booking!.payment).toBeDefined();
      expect(booking!.termsAccepted).toBe(true);
      expect(booking!.termsAcceptedAt).toBe('SERVER_TIMESTAMP');
      expect(booking!.createdAt).toBe('SERVER_TIMESTAMP');
      expect(booking!.startTime).toBe('15:30');
      expect(booking!.endTime).toBe('16:30');
    });

    it('guest booking has sessionSnapshot, payment, consentAudit regardless of social attribution', async () => {
      const piId = 'pi_preserved_guest_001';
      const pi = createPaymentIntent(piId);
      const event = createStripeEvent('payment_intent.succeeded', pi);

      mockFirestore._store.set(`booking_drafts/${piId}`, GUEST_DRAFT_WITH_SOCIAL_ATTRIBUTION);
      mockFirestore._store.set(`sessions/${GUEST_DRAFT.sessionId}`, SESSION_DATA);

      mockConstructEvent.mockReturnValue(event as any);

      const req = createRequest(event);
      await POST(req);

      const booking = mockFirestore._store.get(`bookings/${piId}`);
      expect(booking).toBeDefined();

      // Essential fields present
      expect(booking!.sessionId).toBe(GUEST_DRAFT.sessionId);
      expect(booking!.payment).toBeDefined();
      expect(booking!.consentAudit).toBeDefined();
      expect(booking!.medicalSnapshot).toBeDefined();
      expect(booking!.emergencyContactSnapshot).toBeDefined();
      expect(booking!.sessionSnapshot).toBeDefined();
      expect(booking!.createdAt).toBe('SERVER_TIMESTAMP');

      // Session snapshot structure
      const snap = booking!.sessionSnapshot as Record<string, unknown>;
      expect(snap.id).toBe(GUEST_DRAFT.sessionId);
      expect(snap.className).toBeDefined();
      expect(snap.date).toBeDefined();
      expect(snap.price).toBeDefined();
    });
  });

  describe('Bundle booking flow', () => {
    it('creates multiple booking documents for bundle payment', async () => {
      const piId = 'pi_bundle_test_001';
      const pi = createPaymentIntent(piId, 4500);
      const event = createStripeEvent('payment_intent.succeeded', pi);

      const bundleDraft = {
        bundleId: 'bundle_summer_2025',
        bundleName: 'Summer Bundle 3-Pack',
        sessionIds: ['session_b1', 'session_b2', 'session_b3'],
        sessions: [
          { sessionId: 'session_b1', date: '2025-07-21', startTime: '15:30', endTime: '16:30', venueName: 'Blooming Kitchen HQ' },
          { sessionId: 'session_b2', date: '2025-07-28', startTime: '15:30', endTime: '16:30', venueName: 'Blooming Kitchen HQ' },
          { sessionId: 'session_b3', date: '2025-08-04', startTime: '15:30', endTime: '16:30', venueName: 'Blooming Kitchen HQ' },
        ],
        className: 'Kids After School Cooking',
        venueName: 'Blooming Kitchen HQ',
        bookedByUid: 'user_bundle_001',
        bookedByName: 'Jane Bundle',
        bookedByEmail: 'jane.bundle@example.com',
        studentId: 'student_b001',
        studentName: 'Tommy Bundle',
        medicalInfo: { foodAllergies: false },
        emergencyContact: { name: 'Jane Bundle', phone: '07700900789' },
        questionnaire: null,
        termsAccepted: true,
      };

      mockFirestore._store.set(`booking_drafts/${piId}`, bundleDraft);
      mockFirestore._store.set('sessions/session_b1', { ...SESSION_DATA, spotsAvailable: 5 });
      mockFirestore._store.set('sessions/session_b2', { ...SESSION_DATA, spotsAvailable: 3 });
      mockFirestore._store.set('sessions/session_b3', { ...SESSION_DATA, spotsAvailable: 8 });

      mockConstructEvent.mockReturnValue(event as any);

      const req = createRequest(event);
      const response = await POST(req);

      expect(response.status).toBe(200);

      // Bundle creates bookings with composite IDs: pi_{piId}_{sessionId}
      const b1 = mockFirestore._store.get(`bookings/${piId}_session_b1`);
      const b2 = mockFirestore._store.get(`bookings/${piId}_session_b2`);
      const b3 = mockFirestore._store.get(`bookings/${piId}_session_b3`);

      expect(b1).toBeDefined();
      expect(b2).toBeDefined();
      expect(b3).toBeDefined();

      // Each booking retains core fields
      expect(b1!.bundleId).toBe('bundle_summer_2025');
      expect(b1!.studentName).toBe('Tommy Bundle');
      expect(b1!.status).toBe('confirmed');
      expect(b1!.medicalInfo).toEqual({ foodAllergies: false });

      // Per-session payment is split equally
      const payment = b1!.payment as Record<string, unknown>;
      expect(payment.stripePaymentIntentId).toBe(piId);
      expect(payment.amount).toBe(1500); // 4500 / 3
    });
  });
});
