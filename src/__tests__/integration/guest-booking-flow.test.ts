/**
 * Integration tests for full guest booking flow.
 *
 * Tests the end-to-end flow through the API layer by calling route handlers
 * directly with mocked dependencies.
 *
 * Validates: Requirements GUEST-TEST-005 (36.1)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Hoisted mocks ───────────────────────────────────────────────────────────

const {
  mockDocGet,
  mockDocSet,
  mockDocUpdate,
  mockDocDelete,
  mockDoc,
  mockRunTransaction,
  mockStripeCreate,
  mockStripeUpdate,
  mockStripeCancel,
  mockConstructEvent,
  mockVerifyTurnstile,
  mockCheckRateLimit,
  mockKvGet,
  mockKvSet,
  mockResendSend,
  mockIsGuestCheckoutEnabled,
  mockDetermineSafetyReviewStatus,
} = vi.hoisted(() => {
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
  process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
  process.env.RESEND_API_KEY = 're_test_key';
  process.env.RESEND_FROM_EMAIL = 'test@bloomingtastebuds.co.uk';
  process.env.RESEND_ADMIN_EMAIL = 'admin@bloomingtastebuds.co.uk';
  process.env.PREVIEW_EMAIL_RECIPIENTS = 'jane@example.com';

  const mockDocGet = vi.fn();
  const mockDocSet = vi.fn();
  const mockDocUpdate = vi.fn();
  const mockDocDelete = vi.fn();
  const mockDoc = vi.fn(() => ({
    get: mockDocGet,
    set: mockDocSet,
    update: mockDocUpdate,
    delete: mockDocDelete,
  }));
  const mockRunTransaction = vi.fn();
  const mockStripeCreate = vi.fn();
  const mockStripeUpdate = vi.fn();
  const mockStripeCancel = vi.fn();
  const mockConstructEvent = vi.fn();
  const mockVerifyTurnstile = vi.fn();
  const mockCheckRateLimit = vi.fn();
  const mockKvGet = vi.fn();
  const mockKvSet = vi.fn();
  const mockResendSend = vi.fn();
  const mockIsGuestCheckoutEnabled = vi.fn();
  const mockDetermineSafetyReviewStatus = vi.fn();

  return {
    mockDocGet,
    mockDocSet,
    mockDocUpdate,
    mockDocDelete,
    mockDoc,
    mockRunTransaction,
    mockStripeCreate,
    mockStripeUpdate,
    mockStripeCancel,
    mockConstructEvent,
    mockVerifyTurnstile,
    mockCheckRateLimit,
    mockKvGet,
    mockKvSet,
    mockResendSend,
    mockIsGuestCheckoutEnabled,
    mockDetermineSafetyReviewStatus,
  };
});

// ─── Module mocks ────────────────────────────────────────────────────────────

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    doc: mockDoc,
    runTransaction: mockRunTransaction,
  },
  adminInitError: null,
}));

vi.mock('firebase-admin', () => ({
  default: {
    firestore: {
      FieldValue: {
        serverTimestamp: () => 'SERVER_TIMESTAMP',
        increment: (n: number) => ({ _increment: n }),
      },
    },
  },
  firestore: {
    FieldValue: {
      serverTimestamp: () => 'SERVER_TIMESTAMP',
      increment: (n: number) => ({ _increment: n }),
    },
  },
}));

vi.mock('@/lib/stripe', () => ({
  default: {
    paymentIntents: {
      create: mockStripeCreate,
      update: mockStripeUpdate,
      cancel: mockStripeCancel,
    },
    webhooks: {
      constructEvent: mockConstructEvent,
    },
  },
}));

vi.mock('@/lib/turnstile', () => ({
  verifyTurnstileToken: mockVerifyTurnstile,
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: mockCheckRateLimit,
}));

vi.mock('@vercel/kv', () => ({
  kv: { get: mockKvGet, set: mockKvSet },
}));

vi.mock('@/lib/feature-flags', () => ({
  isGuestCheckoutEnabled: mockIsGuestCheckoutEnabled,
}));

vi.mock('@/lib/resend', () => ({
  resend: {
    emails: {
      send: mockResendSend,
    },
  },
}));

vi.mock('@/lib/guest-validation', () => ({
  determineSafetyReviewStatus: mockDetermineSafetyReviewStatus,
  validateChildAge: (dob: string, sessionDate: string, ageMin: number, ageMax: number) => {
    const birthDate = new Date(dob);
    const session = new Date(sessionDate);
    let age = session.getFullYear() - birthDate.getFullYear();
    const m = session.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && session.getDate() < birthDate.getDate())) {
      age--;
    }
    return age >= ageMin && age <= ageMax;
  },
}));

// ─── Import route handlers AFTER mocks ───────────────────────────────────────

import { POST as createGuestIntent } from '@/app/api/payments/create-guest-intent/route';
import { GET as getGuestBookingStatus } from '@/app/api/guest-booking-status/route';
import { POST as webhookHandler } from '@/app/api/webhooks/stripe/route';

// ─── Shared test data ────────────────────────────────────────────────────────

const validPayload = {
  sessionId: 'session-int-001',
  source: 'whatsapp_express' as const,
  submissionRef: '550e8400-e29b-41d4-a716-446655440000',
  turnstileToken: 'valid-turnstile-token',
  parentDetails: {
    firstName: 'Jane',
    lastName: 'Smith',
    email: 'jane@example.com',
    telephone: '07700900000',
  },
  childDetails: {
    firstName: 'Oliver',
    lastName: 'Smith',
    dateOfBirth: '2017-06-15',
  },
  medicalInfo: {
    foodAllergies: false,
    dietaryRequirements: '',
    airborneAllergies: false,
    allergenDetails: '',
    knownReactions: '',
    symptoms: '',
    epipenRequired: false,
    epipenDetails: '',
    medicationDetails: '',
    respiratoryProblems: false,
    medicalConditions: '',
    recentOperations: '',
    visionImpairment: false,
    hearingImpairment: false,
    additionalSupportNeeds: '',
    otherSafetyInfo: '',
  },
  allergyDietaryInfo: {
    foodAllergies: [],
    dietaryRequirements: [],
    airborneAllergies: [],
    allergenDetails: '',
    reactionDetails: '',
    symptoms: '',
  },
  emergencyContact: {
    name: 'John Smith',
    relationship: 'Father',
    mobile: '07700900001',
    alternativePhone: '',
    email: 'john@example.com',
  },
  authorisedCollector: {
    name: 'Jane Smith',
    relationship: 'Mother',
    phone: '07700900000',
    sameAsParent: true,
  },
  consents: {
    parentGuardianAuthority: true,
    accuracyOfInformation: true,
    healthSafetyDataProcessing: true,
    emergencyAssistanceAuthorisation: true,
    termsAndCancellationPolicy: true,
    privacyNoticeAcknowledgement: true,
    photographyPromotionalUse: false,
    emailMarketing: false,
    whatsappMarketing: false,
  },
  termsVersion: '1.0',
  privacyNoticeVersion: '1.0',
};

const validSessionData = {
  status: 'open',
  date: '2028-03-15',
  spotsAvailable: 5,
  price: 2500,
  ageMin: 5,
  ageMax: 12,
  className: 'After School Cooking',
  classType: 'kidsAfterSchool',
  startTime: '15:30',
  endTime: '16:30',
  venueName: 'Community Hall',
};

// ─── Helper functions ────────────────────────────────────────────────────────

function makeGuestIntentRequest(body: object): Request {
  return new Request('http://localhost/api/payments/create-guest-intent', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-forwarded-for': '192.168.1.1',
    },
    body: JSON.stringify(body),
  });
}

function makeStatusRequest(pi: string, session: string): Request {
  return new Request(
    `http://localhost/api/guest-booking-status?pi=${pi}&session=${session}`,
    { method: 'GET', headers: { 'x-forwarded-for': '192.168.1.1' } }
  );
}

function makeWebhookRequest(): Request {
  return new Request('http://localhost/api/webhooks/stripe', {
    method: 'POST',
    headers: {
      'stripe-signature': 'test_sig_valid',
      'Content-Type': 'application/json',
    },
    body: 'raw-body',
  });
}

function setupCreateIntentHappyPath() {
  mockIsGuestCheckoutEnabled.mockReturnValue(true);
  mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 4, resetAt: Date.now() + 60000 });
  mockVerifyTurnstile.mockResolvedValue(true);
  mockKvGet.mockResolvedValue(null);
  mockKvSet.mockResolvedValue(undefined);
  mockDocGet.mockResolvedValue({ exists: true, data: () => validSessionData });
  mockDocSet.mockResolvedValue(undefined);
  mockStripeCreate.mockResolvedValue({
    id: 'pi_integration_test_001',
    client_secret: 'pi_integration_test_001_secret_xyz',
  });
  mockStripeUpdate.mockResolvedValue({});
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Integration: Full Guest Booking Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── 1. Complete guest booking flow ─────────────────────────────────────────

  describe('Complete guest booking flow: form → API → Stripe → webhook → booking', () => {
    it('creates PaymentIntent with correct amount from Firestore session price', async () => {
      setupCreateIntentHappyPath();

      const res = await createGuestIntent(makeGuestIntentRequest(validPayload));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.clientSecret).toBe('pi_integration_test_001_secret_xyz');
      expect(json.paymentIntentId).toBe('pi_integration_test_001');

      // Verify PaymentIntent was created with Firestore-authoritative price
      expect(mockStripeCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 2500,
          currency: 'gbp',
          automatic_payment_methods: { enabled: true },
        })
      );
    });

    it('saves booking_drafts document with full payload', async () => {
      setupCreateIntentHappyPath();

      await createGuestIntent(makeGuestIntentRequest(validPayload));

      // Verify draft saved at correct path
      expect(mockDoc).toHaveBeenCalledWith('booking_drafts/pi_integration_test_001');
      expect(mockDocSet).toHaveBeenCalledWith(
        expect.objectContaining({
          stripePaymentIntentId: 'pi_integration_test_001',
          paymentStatus: 'pending',
          bookingMode: 'guest',
          sessionId: 'session-int-001',
          source: 'whatsapp_express',
          guestContact: validPayload.parentDetails,
          childDetails: validPayload.childDetails,
          medicalInfo: validPayload.medicalInfo,
          allergyDietaryInfo: validPayload.allergyDietaryInfo,
          emergencyContact: validPayload.emergencyContact,
          authorisedCollector: validPayload.authorisedCollector,
        })
      );
    });

    it('draft data contains all necessary fields for webhook to produce a valid booking', async () => {
      setupCreateIntentHappyPath();

      await createGuestIntent(makeGuestIntentRequest(validPayload));

      const draftArg = mockDocSet.mock.calls[0][0];

      // Verify draft contains all required fields for webhook booking creation
      expect(draftArg.bookingMode).toBe('guest');
      expect(draftArg.sessionId).toBeDefined();
      expect(draftArg.guestContact).toBeDefined();
      expect(draftArg.guestContact.email).toBe('jane@example.com');
      expect(draftArg.childDetails).toBeDefined();
      expect(draftArg.childDetails.firstName).toBe('Oliver');
      expect(draftArg.medicalInfo).toBeDefined();
      expect(draftArg.allergyDietaryInfo).toBeDefined();
      expect(draftArg.emergencyContact).toBeDefined();
      expect(draftArg.authorisedCollector).toBeDefined();
      expect(draftArg.consentAudit).toBeDefined();
      expect(draftArg.consentAudit.consents).toEqual(validPayload.consents);
      expect(draftArg.stripePaymentIntentId).toBe('pi_integration_test_001');
    });

    it('webhook creates booking from draft data after payment succeeds', async () => {
      // Setup webhook to process a guest payment_intent.succeeded event
      const piId = 'pi_integration_test_001';
      const guestDraft = {
        bookingMode: 'guest',
        sessionId: 'session-int-001',
        source: 'whatsapp_express',
        guestContact: validPayload.parentDetails,
        childDetails: validPayload.childDetails,
        medicalInfo: validPayload.medicalInfo,
        allergyDietaryInfo: validPayload.allergyDietaryInfo,
        emergencyContact: validPayload.emergencyContact,
        authorisedCollector: validPayload.authorisedCollector,
        consentAudit: {
          consents: validPayload.consents,
          acceptedAt: 'SERVER_TIMESTAMP',
          acceptedBy: 'Jane Smith',
          termsVersion: '1.0',
          privacyNoticeVersion: '1.0',
          sourceChannel: 'whatsapp_express',
          submissionTimestamp: 'SERVER_TIMESTAMP',
        },
        stripePaymentIntentId: piId,
      };

      mockConstructEvent.mockReturnValue({
        id: 'evt_test_int_001',
        type: 'payment_intent.succeeded',
        data: { object: { id: piId, amount: 2500, currency: 'gbp', status: 'succeeded', last_payment_error: null } },
      });

      mockDocGet.mockResolvedValue({ exists: true, data: () => guestDraft });
      mockDetermineSafetyReviewStatus.mockReturnValue('not_required');
      mockResendSend.mockResolvedValue({ data: { id: 'email_001' }, error: null });
      mockDocDelete.mockResolvedValue(undefined);

      mockRunTransaction.mockImplementation(async (callback: any) => {
        const txGet = vi.fn();
        const txSet = vi.fn();
        const txUpdate = vi.fn();
        const tx = { get: txGet, set: txSet, update: txUpdate };
        // Booking doesn't exist yet
        txGet.mockResolvedValueOnce({ exists: false });
        // Session exists
        txGet.mockResolvedValueOnce({ exists: true, data: () => validSessionData });
        await callback(tx);
        (mockRunTransaction as any)._txSet = txSet;
        (mockRunTransaction as any)._txUpdate = txUpdate;
      });

      const res = await webhookHandler(makeWebhookRequest());
      expect(res.status).toBe(200);

      // Verify transaction created guest booking
      expect(mockRunTransaction).toHaveBeenCalledTimes(1);
      const txSet = (mockRunTransaction as any)._txSet;
      expect(txSet).toHaveBeenCalledTimes(1);

      const bookingDoc = txSet.mock.calls[0][1];
      expect(bookingDoc.bookingMode).toBe('guest');
      expect(bookingDoc.guestContact).toEqual(validPayload.parentDetails);
      expect(bookingDoc.childSnapshot).toEqual(validPayload.childDetails);
      expect(bookingDoc.sessionId).toBe('session-int-001');
      expect(bookingDoc.status).toBe('confirmed');
      expect(bookingDoc.safetyReviewStatus).toBe('not_required');

      // Verify spots decremented
      const txUpdate = (mockRunTransaction as any)._txUpdate;
      expect(txUpdate).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ spotsAvailable: { _increment: -1 } })
      );

      // Verify confirmation email sent
      expect(mockResendSend).toHaveBeenCalled();
    });
  });

  // ── 2. Admin views render guest bookings without errors ────────────────────

  describe('Admin helper functions handle guest bookings without errors', () => {
    // Test the admin helper logic directly (these are pure functions)
    // Reimplemented here since they are local to the admin page component

    function getSourceLabel(source?: string): string {
      switch (source) {
        case 'whatsapp_express': return 'WhatsApp';
        case 'facebook_express': return 'Messenger';
        case 'instagram_express': return 'Instagram';
        case 'qr_express': return 'QR Code';
        case 'google_express': return 'Google';
        case 'website_express': return 'Website (Guest)';
        case 'website': return 'Website';
        case 'unknown': return 'Unknown';
        default: return '—';
      }
    }

    function getBookerName(booking: any): string {
      if (!booking.bookedByUid && booking.guestContact) {
        return `${booking.guestContact.firstName} ${booking.guestContact.lastName}`;
      }
      return booking.bookedByName || '—';
    }

    function getStudentName(booking: any): string {
      if (!booking.bookedByUid && booking.childSnapshot) {
        return `${booking.childSnapshot.firstName} ${booking.childSnapshot.lastName}`;
      }
      return booking.studentName || '—';
    }

    const guestBooking = {
      id: 'pi_guest_test_123',
      bookingMode: 'guest' as const,
      bookingSource: 'whatsapp_express',
      sessionId: 'session-int-001',
      status: 'confirmed',
      guestContact: {
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane@example.com',
        telephone: '07700900000',
      },
      childSnapshot: {
        firstName: 'Oliver',
        lastName: 'Smith',
        dateOfBirth: '2017-06-15',
      },
    };

    it('getBookerName returns guest parent name when bookedByUid is absent', () => {
      expect(getBookerName(guestBooking)).toBe('Jane Smith');
    });

    it('getBookerName falls back to dash when no guestContact and no bookedByUid', () => {
      expect(getBookerName({ id: 'test' })).toBe('—');
    });

    it('getStudentName returns child name from childSnapshot for guest booking', () => {
      expect(getStudentName(guestBooking)).toBe('Oliver Smith');
    });

    it('getStudentName falls back to dash when no childSnapshot and no bookedByUid', () => {
      expect(getStudentName({ id: 'test' })).toBe('—');
    });

    it('getSourceLabel returns correct labels for all guest booking sources', () => {
      expect(getSourceLabel('whatsapp_express')).toBe('WhatsApp');
      expect(getSourceLabel('facebook_express')).toBe('Messenger');
      expect(getSourceLabel('instagram_express')).toBe('Instagram');
      expect(getSourceLabel('qr_express')).toBe('QR Code');
      expect(getSourceLabel('google_express')).toBe('Google');
      expect(getSourceLabel('website_express')).toBe('Website (Guest)');
      expect(getSourceLabel('website')).toBe('Website');
      expect(getSourceLabel('unknown')).toBe('Unknown');
      expect(getSourceLabel(undefined)).toBe('—');
    });

    it('getBookerName returns bookedByName for authenticated bookings', () => {
      const authBooking = { bookedByUid: 'uid-123', bookedByName: 'Auth Parent' };
      expect(getBookerName(authBooking)).toBe('Auth Parent');
    });

    it('getStudentName returns studentName for authenticated bookings', () => {
      const authBooking = { bookedByUid: 'uid-123', studentName: 'Auth Child' };
      expect(getStudentName(authBooking)).toBe('Auth Child');
    });
  });

  // ── 3. Feature flag toggling hides/shows all guest components ──────────────

  describe('Feature flag toggling', () => {
    it('POST /api/payments/create-guest-intent returns 403 when flag is disabled', async () => {
      mockIsGuestCheckoutEnabled.mockReturnValue(false);

      const res = await createGuestIntent(makeGuestIntentRequest(validPayload));
      expect(res.status).toBe(403);

      const json = await res.json();
      expect(json.code).toBe('FEATURE_DISABLED');

      // Stripe should never be called
      expect(mockStripeCreate).not.toHaveBeenCalled();
      // No draft should be saved
      expect(mockDocSet).not.toHaveBeenCalled();
    });

    it('GET /api/guest-booking-status returns 403 when flag is disabled', async () => {
      mockIsGuestCheckoutEnabled.mockReturnValue(false);

      const res = await getGuestBookingStatus(
        makeStatusRequest('pi_test_123', 'session-int-001')
      );
      expect(res.status).toBe(403);

      const json = await res.json();
      expect(json.status).toBe('unavailable');
    });

    it('POST /api/payments/create-guest-intent proceeds when flag is enabled', async () => {
      setupCreateIntentHappyPath();

      const res = await createGuestIntent(makeGuestIntentRequest(validPayload));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.clientSecret).toBeDefined();
      expect(json.paymentIntentId).toBeDefined();
    });

    it('GET /api/guest-booking-status proceeds when flag is enabled', async () => {
      mockIsGuestCheckoutEnabled.mockReturnValue(true);
      mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 29, resetAt: Date.now() + 60000 });
      mockDocGet.mockResolvedValue({ exists: false });

      const res = await getGuestBookingStatus(
        makeStatusRequest('pi_test_pending_001', 'session-int-001')
      );
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.status).toBe('pending');
    });
  });

  // ── 4. Existing authenticated booking flow unaffected ──────────────────────

  describe('Existing authenticated booking flow unaffected', () => {
    it('webhook processes non-guest draft without guest logic', async () => {
      const authenticatedDraft = {
        sessionId: 'session-auth-001',
        sessionDate: '2028-07-01',
        className: 'Kids Cooking',
        venueName: 'School Kitchen',
        startTime: '15:30',
        endTime: '16:30',
        bookedByUid: 'user-uid-123',
        bookedByName: 'Parent User',
        bookedByEmail: 'parent@example.com',
        studentId: 'student-789',
        studentName: 'Child User',
        medicalInfo: null,
        emergencyContact: null,
        questionnaire: null,
        termsAccepted: true,
      };

      mockConstructEvent.mockReturnValue({
        id: 'evt_test_auth_001',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_auth_test_001',
            amount: 1500,
            currency: 'gbp',
            status: 'succeeded',
            last_payment_error: null,
          },
        },
      });

      mockDocGet.mockResolvedValue({ exists: true, data: () => authenticatedDraft });
      mockResendSend.mockResolvedValue({ data: { id: 'email_auth_001' }, error: null });
      mockDocDelete.mockResolvedValue(undefined);

      mockRunTransaction.mockImplementation(async (callback: any) => {
        const txGet = vi.fn();
        const txSet = vi.fn();
        const txUpdate = vi.fn();
        const tx = { get: txGet, set: txSet, update: txUpdate };
        txGet.mockResolvedValueOnce({ exists: false });
        txGet.mockResolvedValueOnce({
          exists: true,
          data: () => ({ ...validSessionData, spotsAvailable: 3 }),
        });
        await callback(tx);
        (mockRunTransaction as any)._txSet = txSet;
        (mockRunTransaction as any)._txUpdate = txUpdate;
      });

      const res = await webhookHandler(makeWebhookRequest());
      expect(res.status).toBe(200);

      // Transaction should be called for standard booking creation
      expect(mockRunTransaction).toHaveBeenCalledTimes(1);

      // determineSafetyReviewStatus NOT called for authenticated bookings
      expect(mockDetermineSafetyReviewStatus).not.toHaveBeenCalled();

      // Booking doc should use authenticated structure
      const txSet = (mockRunTransaction as any)._txSet;
      const bookingDoc = txSet.mock.calls[0][1];
      expect(bookingDoc.bookedByUid).toBe('user-uid-123');
      expect(bookingDoc.studentId).toBe('student-789');
      expect(bookingDoc).not.toHaveProperty('bookingMode');
      expect(bookingDoc).not.toHaveProperty('guestContact');
      expect(bookingDoc).not.toHaveProperty('childSnapshot');
    });

    it('authenticated draft without bookingMode does not trigger guest webhook handling', async () => {
      const authDraft = {
        sessionId: 'session-auth-002',
        sessionDate: '2028-08-01',
        className: 'Weekend Cooking',
        venueName: 'Kitchen Studio',
        startTime: '10:30',
        endTime: '12:30',
        bookedByUid: 'user-uid-456',
        bookedByName: 'Another Parent',
        bookedByEmail: 'another@example.com',
        studentId: 'student-012',
        studentName: 'Another Child',
        medicalInfo: null,
        emergencyContact: null,
        questionnaire: null,
        termsAccepted: true,
      };

      mockConstructEvent.mockReturnValue({
        id: 'evt_test_auth_002',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_auth_test_002',
            amount: 2000,
            currency: 'gbp',
            status: 'succeeded',
            last_payment_error: null,
          },
        },
      });

      mockDocGet.mockResolvedValue({ exists: true, data: () => authDraft });
      mockResendSend.mockResolvedValue({ data: { id: 'email_auth_002' }, error: null });
      mockDocDelete.mockResolvedValue(undefined);

      mockRunTransaction.mockImplementation(async (callback: any) => {
        const txGet = vi.fn();
        const txSet = vi.fn();
        const txUpdate = vi.fn();
        const tx = { get: txGet, set: txSet, update: txUpdate };
        txGet.mockResolvedValueOnce({ exists: false });
        txGet.mockResolvedValueOnce({
          exists: true,
          data: () => ({ ...validSessionData, spotsAvailable: 4 }),
        });
        await callback(tx);
        (mockRunTransaction as any)._txSet = txSet;
      });

      const res = await webhookHandler(makeWebhookRequest());
      expect(res.status).toBe(200);

      // Guest safety review logic was NOT invoked
      expect(mockDetermineSafetyReviewStatus).not.toHaveBeenCalled();

      // Booking is standard (no guest fields)
      const txSet = (mockRunTransaction as any)._txSet;
      const bookingDoc = txSet.mock.calls[0][1];
      expect(bookingDoc.bookedByUid).toBe('user-uid-456');
      expect(bookingDoc).not.toHaveProperty('bookingMode');
      expect(bookingDoc).not.toHaveProperty('guestContact');
    });
  });
});
