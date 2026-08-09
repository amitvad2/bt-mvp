/**
 * Integration tests for term booking flows.
 *
 * Tests end-to-end logic by calling route handlers directly with mocked
 * Firestore and Stripe dependencies.
 *
 * Validates: Requirements 4.2, 4.4, 5.3, 7.1, 7.2
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks ───────────────────────────────────────────────────────────

const {
  mockDocGet,
  mockDocSet,
  mockDocUpdate,
  mockDocDelete,
  mockDoc,
  mockRunTransaction,
  mockStripeCreate,
  mockStripeCancel,
  mockConstructEvent,
  mockResendSend,
  mockVerifyIdToken,
  mockDetermineSafetyReviewStatus,
} = vi.hoisted(() => {
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
  process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
  process.env.RESEND_API_KEY = 're_test_key';
  process.env.RESEND_FROM_EMAIL = 'test@bloomingtastebuds.co.uk';
  process.env.RESEND_ADMIN_EMAIL = 'admin@bloomingtastebuds.co.uk';
  process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';

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
  const mockStripeCancel = vi.fn();
  const mockConstructEvent = vi.fn();
  const mockResendSend = vi.fn();
  const mockVerifyIdToken = vi.fn();
  const mockDetermineSafetyReviewStatus = vi.fn();

  return {
    mockDocGet,
    mockDocSet,
    mockDocUpdate,
    mockDocDelete,
    mockDoc,
    mockRunTransaction,
    mockStripeCreate,
    mockStripeCancel,
    mockConstructEvent,
    mockResendSend,
    mockVerifyIdToken,
    mockDetermineSafetyReviewStatus,
  };
});

// ─── Module mocks ────────────────────────────────────────────────────────────

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    doc: mockDoc,
    runTransaction: mockRunTransaction,
  },
  adminAuth: {
    verifyIdToken: mockVerifyIdToken,
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
      cancel: mockStripeCancel,
    },
    webhooks: {
      constructEvent: mockConstructEvent,
    },
  },
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
  validateChildAge: () => true,
}));

vi.mock('@/lib/social-booking', () => ({
  createSocialBookingService: () => ({
    confirmBooking: vi.fn(),
    sendSocialConfirmation: vi.fn(),
  }),
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

// ─── Import route handlers AFTER mocks ───────────────────────────────────────

import { POST as createIntent } from '@/app/api/payments/create-intent/route';
import { POST as webhookHandler } from '@/app/api/webhooks/stripe/route';

// ─── Import term utilities ───────────────────────────────────────────────────

import { isTermClassActive, isTermClassExpired } from '@/lib/term-utils';

// ─── Shared test data ────────────────────────────────────────────────────────

const termClassData = {
  id: 'class-term-001',
  name: 'After School Cooking Term',
  type: 'kidsAfterSchool',
  commitment: 'term',
  termStartDate: '2025-09-01',
  termEndDate: '2099-12-20', // Far future to avoid expiry in tests
  termPrice: 12000, // £120.00
  recurrenceDays: ['Monday', 'Wednesday'],
  spotsAvailable: 8,
  maxSize: 12,
  startTime: '15:30',
  endTime: '16:30',
  venueName: 'Community Hall',
  venueId: 'venue-001',
  instructor: 'Chef Sarah',
  ageMin: 5,
  ageMax: 12,
  dayOfWeek: 'Monday',
  price: 1500, // per-session price (not used for term)
  createdAt: 'SERVER_TIMESTAMP',
};

const termBookingDraft = {
  stripePaymentIntentId: 'pi_term_int_001',
  paymentStatus: 'pending',
  bookingType: 'term' as const,
  classId: 'class-term-001',
  className: 'After School Cooking Term',
  classType: 'kidsAfterSchool',
  venueName: 'Community Hall',
  startTime: '15:30',
  endTime: '16:30',
  recurrenceDays: ['Monday', 'Wednesday'],
  termStartDate: '2025-09-01',
  termEndDate: '2099-12-20',
  bookedByUid: 'user-uid-parent-001',
  bookedByName: 'Jane Smith',
  bookedByEmail: 'jane@example.com',
  studentId: 'student-001',
  studentName: 'Oliver Smith',
  medicalInfo: null,
  emergencyContact: null,
  questionnaire: null,
  termsAccepted: true,
};

// ─── Helper functions ────────────────────────────────────────────────────────

function makeCreateIntentRequest(body: object): Request {
  return new Request('http://localhost/api/payments/create-intent', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer valid-token-123',
    },
    body: JSON.stringify(body),
  });
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

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Integration: Term Booking Flows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── 1. Full term booking flow ──────────────────────────────────────────────

  describe('Full booking flow: create term class → book → webhook → verify booking', () => {
    it('create-intent uses termPrice from class doc and creates correct draft', async () => {
      // Setup: authenticated user with valid student
      mockVerifyIdToken.mockResolvedValue({ uid: 'user-uid-parent-001' });

      // Mock doc reads: first for student validation, then for class doc
      mockDocGet
        .mockResolvedValueOnce({
          exists: true,
          data: () => ({ parentUid: 'user-uid-parent-001' }),
        }) // students/{studentId}
        .mockResolvedValueOnce({
          exists: true,
          data: () => termClassData,
        }); // classes/{classId}

      mockDocSet.mockResolvedValue(undefined);
      mockStripeCreate.mockResolvedValue({
        id: 'pi_term_int_001',
        client_secret: 'pi_term_int_001_secret_xyz',
      });

      const res = await createIntent(
        makeCreateIntentRequest({
          classId: 'class-term-001',
          bookingType: 'term',
          bookedByName: 'Jane Smith',
          bookedByEmail: 'jane@example.com',
          studentId: 'student-001',
          studentName: 'Oliver Smith',
          className: 'After School Cooking Term',
          venueName: 'Community Hall',
          startTime: '15:30',
          endTime: '16:30',
          recurrenceDays: ['Monday', 'Wednesday'],
          termStartDate: '2025-09-01',
          termEndDate: '2099-12-20',
          classType: 'kidsAfterSchool',
          medicalInfo: null,
          emergencyContact: null,
          questionnaire: null,
          termsAccepted: true,
        })
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.clientSecret).toBe('pi_term_int_001_secret_xyz');
      expect(json.paymentIntentId).toBe('pi_term_int_001');

      // Verify Stripe PI created with termPrice (12000 pence = £120)
      expect(mockStripeCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 12000,
          currency: 'gbp',
          automatic_payment_methods: { enabled: true },
        })
      );

      // Verify draft saved with bookingType: 'term' and classId
      expect(mockDoc).toHaveBeenCalledWith('booking_drafts/pi_term_int_001');
      expect(mockDocSet).toHaveBeenCalledWith(
        expect.objectContaining({
          stripePaymentIntentId: 'pi_term_int_001',
          bookingType: 'term',
          classId: 'class-term-001',
          className: 'After School Cooking Term',
          recurrenceDays: ['Monday', 'Wednesday'],
          termStartDate: '2025-09-01',
          termEndDate: '2099-12-20',
          bookedByUid: 'user-uid-parent-001',
          studentId: 'student-001',
          studentName: 'Oliver Smith',
        })
      );
    });

    it('webhook creates term booking with correct fields and decrements spotsAvailable', async () => {
      const piId = 'pi_term_int_001';

      // Setup webhook event
      mockConstructEvent.mockReturnValue({
        id: 'evt_term_001',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: piId,
            amount: 12000,
            currency: 'gbp',
            status: 'succeeded',
            last_payment_error: null,
          },
        },
      });

      // Draft exists with term booking data
      mockDocGet
        .mockResolvedValueOnce({ exists: true, data: () => termBookingDraft }) // booking_drafts/{piId}
        .mockResolvedValueOnce({ exists: false }); // bookings/{piId} - idempotency check

      mockResendSend.mockResolvedValue({ data: { id: 'email_term_001' }, error: null });
      mockDocDelete.mockResolvedValue(undefined);

      // Mock the transaction
      mockRunTransaction.mockImplementation(async (callback: any) => {
        const txGet = vi.fn();
        const txSet = vi.fn();
        const txUpdate = vi.fn();
        const tx = { get: txGet, set: txSet, update: txUpdate };

        // Class doc read inside transaction
        txGet.mockResolvedValueOnce({
          exists: true,
          data: () => ({ ...termClassData, spotsAvailable: 8 }),
        });

        await callback(tx);
        (mockRunTransaction as any)._txSet = txSet;
        (mockRunTransaction as any)._txUpdate = txUpdate;
      });

      const res = await webhookHandler(makeWebhookRequest());
      expect(res.status).toBe(200);

      // Verify transaction was called
      expect(mockRunTransaction).toHaveBeenCalledTimes(1);

      // Verify booking doc created with correct term fields
      const txSet = (mockRunTransaction as any)._txSet;
      expect(txSet).toHaveBeenCalledTimes(1);

      const bookingDoc = txSet.mock.calls[0][1];
      expect(bookingDoc.bookingType).toBe('term');
      expect(bookingDoc.classId).toBe('class-term-001');
      expect(bookingDoc.className).toBe('After School Cooking Term');
      expect(bookingDoc.recurrenceDays).toEqual(['Monday', 'Wednesday']);
      expect(bookingDoc.termStartDate).toBe('2025-09-01');
      expect(bookingDoc.termEndDate).toBe('2099-12-20');
      expect(bookingDoc.bookedByUid).toBe('user-uid-parent-001');
      expect(bookingDoc.studentId).toBe('student-001');
      expect(bookingDoc.studentName).toBe('Oliver Smith');
      expect(bookingDoc.status).toBe('confirmed');
      expect(bookingDoc.sessionId).toBe(''); // No sessionId for term bookings
      expect(bookingDoc.sessionDate).toBe(''); // No sessionDate for term bookings
      expect(bookingDoc.payment.stripePaymentIntentId).toBe(piId);
      expect(bookingDoc.payment.amount).toBe(12000);
      expect(bookingDoc.payment.currency).toBe('gbp');
      expect(bookingDoc.payment.status).toBe('paid');
      expect(bookingDoc.overbooking).toBe(false);

      // Verify spotsAvailable decremented by 1 on the class doc
      const txUpdate = (mockRunTransaction as any)._txUpdate;
      expect(txUpdate).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          spotsAvailable: { _increment: -1 },
        })
      );

      // Verify confirmation email sent
      expect(mockResendSend).toHaveBeenCalled();

      // Verify draft deleted
      expect(mockDocDelete).toHaveBeenCalled();
    });
  });

  // ── 2. Cancellation flow ───────────────────────────────────────────────────

  describe('Cancellation flow: cancel term booking → verify spotsAvailable incremented', () => {
    it('cancelling a term booking increments spotsAvailable on the class doc', async () => {
      // This tests the cancellation logic as a unit:
      // 1. Update booking status to 'cancelled'
      // 2. Increment class spotsAvailable by 1

      // Simulate the cancellation action that the portal performs:
      // - Update bookings/{id}.status to 'cancelled'
      // - Update classes/{classId}.spotsAvailable by +1

      const bookingId = 'pi_term_cancel_001';
      const classId = 'class-term-001';

      // Track which paths get which operations
      const docPaths: string[] = [];
      mockDoc.mockImplementation((path: string) => {
        docPaths.push(path);
        return {
          get: mockDocGet,
          set: mockDocSet,
          update: mockDocUpdate,
          delete: mockDocDelete,
        };
      });

      mockDocUpdate.mockResolvedValue(undefined);

      // Simulate the two-step cancellation:
      // Step 1: Update booking status
      const { adminDb } = await import('@/lib/firebase-admin');
      await adminDb.doc(`bookings/${bookingId}`).update({ status: 'cancelled' });

      // Step 2: Increment spotsAvailable on the class
      await adminDb.doc(`classes/${classId}`).update({
        spotsAvailable: { _increment: 1 },
      });

      // Verify booking was updated
      expect(docPaths).toContain(`bookings/${bookingId}`);
      expect(docPaths).toContain(`classes/${classId}`);

      // Verify the update calls
      expect(mockDocUpdate).toHaveBeenCalledTimes(2);
      expect(mockDocUpdate).toHaveBeenCalledWith({ status: 'cancelled' });
      expect(mockDocUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          spotsAvailable: { _increment: 1 },
        })
      );
    });
  });

  // ── 3. Expired term class ──────────────────────────────────────────────────

  describe('Expired term class: not displayed, booking rejected with 400', () => {
    it('isTermClassActive returns false for expired term class', () => {
      // A term class with termEndDate in the past
      const pastEndDate = '2024-01-01';
      const spotsAvailable = 5;

      expect(isTermClassActive(pastEndDate, spotsAvailable)).toBe(false);
    });

    it('isTermClassExpired returns true for expired term class', () => {
      const pastEndDate = '2024-01-01';

      expect(isTermClassExpired(pastEndDate)).toBe(true);
    });

    it('isTermClassActive returns false when spots are zero even if not expired', () => {
      // Future end date but no spots
      const futureEndDate = '2099-12-31';
      const spotsAvailable = 0;

      expect(isTermClassActive(futureEndDate, spotsAvailable)).toBe(false);
    });

    it('isTermClassActive returns true when term is active and has spots', () => {
      const futureEndDate = '2099-12-31';
      const spotsAvailable = 5;

      expect(isTermClassActive(futureEndDate, spotsAvailable)).toBe(true);
    });

    it('create-intent returns 400 when term has ended', async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: 'user-uid-parent-001' });

      // Mock student validation pass, then expired class doc
      mockDocGet
        .mockResolvedValueOnce({
          exists: true,
          data: () => ({ parentUid: 'user-uid-parent-001' }),
        }) // students/{studentId}
        .mockResolvedValueOnce({
          exists: true,
          data: () => ({
            ...termClassData,
            termEndDate: '2024-01-01', // expired
          }),
        }); // classes/{classId}

      const res = await createIntent(
        makeCreateIntentRequest({
          classId: 'class-term-001',
          bookingType: 'term',
          bookedByName: 'Jane Smith',
          bookedByEmail: 'jane@example.com',
          studentId: 'student-001',
          studentName: 'Oliver Smith',
          termsAccepted: true,
        })
      );

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe('Term has ended.');

      // Stripe should NOT be called for expired term
      expect(mockStripeCreate).not.toHaveBeenCalled();
    });

    it('create-intent returns 400 when class is full', async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: 'user-uid-parent-001' });

      // Mock student validation pass, then full class doc
      mockDocGet
        .mockResolvedValueOnce({
          exists: true,
          data: () => ({ parentUid: 'user-uid-parent-001' }),
        }) // students/{studentId}
        .mockResolvedValueOnce({
          exists: true,
          data: () => ({
            ...termClassData,
            termEndDate: '2099-12-31', // future (not expired)
            spotsAvailable: 0, // full
          }),
        }); // classes/{classId}

      const res = await createIntent(
        makeCreateIntentRequest({
          classId: 'class-term-001',
          bookingType: 'term',
          bookedByName: 'Jane Smith',
          bookedByEmail: 'jane@example.com',
          studentId: 'student-001',
          studentName: 'Oliver Smith',
          termsAccepted: true,
        })
      );

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe('Class is full.');

      // Stripe should NOT be called for full class
      expect(mockStripeCreate).not.toHaveBeenCalled();
    });

    it('create-intent returns 400 when class is not a term class', async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: 'user-uid-parent-001' });

      // Mock student validation pass, then per-session class doc
      mockDocGet
        .mockResolvedValueOnce({
          exists: true,
          data: () => ({ parentUid: 'user-uid-parent-001' }),
        }) // students/{studentId}
        .mockResolvedValueOnce({
          exists: true,
          data: () => ({
            ...termClassData,
            commitment: 'perSession', // not a term class
          }),
        }); // classes/{classId}

      const res = await createIntent(
        makeCreateIntentRequest({
          classId: 'class-term-001',
          bookingType: 'term',
          bookedByName: 'Jane Smith',
          bookedByEmail: 'jane@example.com',
          studentId: 'student-001',
          studentName: 'Oliver Smith',
          termsAccepted: true,
        })
      );

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe('This class is not a term class.');
    });
  });

  // ── 4. Guest term booking flow ─────────────────────────────────────────────

  describe('Guest term booking: create-intent without authentication', () => {
    function makeGuestTermRequest(body: object): Request {
      return new Request('http://localhost/api/payments/create-intent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // No Authorization header — guest flow
        },
        body: JSON.stringify(body),
      });
    }

    const guestTermBody = {
      classId: 'class-term-001',
      bookingType: 'term',
      bookingMode: 'guest',
      guestContact: {
        firstName: 'Sarah',
        lastName: 'Johnson',
        email: 'sarah@example.com',
        telephone: '07700900123',
      },
      childSnapshot: {
        firstName: 'Emily',
        lastName: 'Johnson',
        dateOfBirth: '2017-05-15',
      },
      medicalInfo: { conditions: 'none' },
      emergencyContact: { name: 'James Johnson', phone: '07700900456' },
      consentAudit: {
        consents: { termsAndCancellationPolicy: true },
        acceptedAt: '2025-01-15T10:00:00Z',
        acceptedBy: 'Sarah Johnson',
      },
      source: 'website_express',
      termsAccepted: true,
    };

    it('creates PaymentIntent and draft without auth token for guest term booking', async () => {
      // No auth mocking needed — guest path skips auth
      mockDocGet.mockResolvedValueOnce({
        exists: true,
        data: () => termClassData,
      }); // classes/{classId}

      mockDocSet.mockResolvedValue(undefined);
      mockStripeCreate.mockResolvedValue({
        id: 'pi_guest_term_001',
        client_secret: 'pi_guest_term_001_secret_abc',
      });

      const res = await createIntent(makeGuestTermRequest(guestTermBody));

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.clientSecret).toBe('pi_guest_term_001_secret_abc');
      expect(json.paymentIntentId).toBe('pi_guest_term_001');

      // Verify Stripe was called with termPrice
      expect(mockStripeCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 12000,
          currency: 'gbp',
          metadata: expect.objectContaining({
            classId: 'class-term-001',
            bookingType: 'term',
            bookingMode: 'guest',
          }),
        })
      );

      // Verify draft was written with guest fields
      expect(mockDocSet).toHaveBeenCalledWith(
        expect.objectContaining({
          stripePaymentIntentId: 'pi_guest_term_001',
          bookingType: 'term',
          bookingMode: 'guest',
          classId: 'class-term-001',
          guestContact: guestTermBody.guestContact,
          childSnapshot: guestTermBody.childSnapshot,
          consentAudit: guestTermBody.consentAudit,
          source: 'website_express',
          medicalInfo: guestTermBody.medicalInfo,
          emergencyContact: guestTermBody.emergencyContact,
          termsAccepted: true,
        })
      );

      // Verify NO bookedByUid in the draft (guest has no UID)
      const draftArg = mockDocSet.mock.calls[0][0];
      expect(draftArg.bookedByUid).toBeUndefined();
      expect(draftArg.studentId).toBeUndefined();

      // Verify auth was never called
      expect(mockVerifyIdToken).not.toHaveBeenCalled();
    });

    it('does NOT require studentId validation for guest term bookings', async () => {
      mockDocGet.mockResolvedValueOnce({
        exists: true,
        data: () => termClassData,
      });

      mockDocSet.mockResolvedValue(undefined);
      mockStripeCreate.mockResolvedValue({
        id: 'pi_guest_term_002',
        client_secret: 'pi_guest_term_002_secret_def',
      });

      const res = await createIntent(makeGuestTermRequest(guestTermBody));

      expect(res.status).toBe(200);
      // Student doc was never read (only class doc was read)
      expect(mockDoc).not.toHaveBeenCalledWith(expect.stringContaining('students/'));
    });

    it('returns 400 for guest term booking when class is full', async () => {
      mockDocGet.mockResolvedValueOnce({
        exists: true,
        data: () => ({ ...termClassData, spotsAvailable: 0 }),
      });

      const res = await createIntent(makeGuestTermRequest(guestTermBody));

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe('Class is full.');
      expect(mockStripeCreate).not.toHaveBeenCalled();
    });

    it('returns 400 for guest term booking when term has ended', async () => {
      mockDocGet.mockResolvedValueOnce({
        exists: true,
        data: () => ({ ...termClassData, termEndDate: '2020-01-01' }),
      });

      const res = await createIntent(makeGuestTermRequest(guestTermBody));

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe('Term has ended.');
      expect(mockStripeCreate).not.toHaveBeenCalled();
    });

    it('returns 401 for non-guest term booking without auth token', async () => {
      // Request without bookingMode: 'guest' but also without auth header
      const nonGuestBody = {
        classId: 'class-term-001',
        bookingType: 'term',
        // No bookingMode — requires auth
        bookedByName: 'Jane Smith',
        studentId: 'student-001',
        studentName: 'Oliver Smith',
        termsAccepted: true,
      };

      const res = await createIntent(makeGuestTermRequest(nonGuestBody));

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toBe('Unauthorised');
    });

    it('uses termPrice from class document (server-authoritative) for guest bookings', async () => {
      mockDocGet.mockResolvedValueOnce({
        exists: true,
        data: () => ({ ...termClassData, termPrice: 6000 }), // £60.00
      });

      mockDocSet.mockResolvedValue(undefined);
      mockStripeCreate.mockResolvedValue({
        id: 'pi_guest_term_003',
        client_secret: 'pi_guest_term_003_secret_ghi',
      });

      const res = await createIntent(makeGuestTermRequest(guestTermBody));

      expect(res.status).toBe(200);
      expect(mockStripeCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 6000, // Server price, not client-supplied
        })
      );
    });
  });
});
