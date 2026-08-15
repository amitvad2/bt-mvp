import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';

// ─── Hoisted mocks ───────────────────────────────────────────────────────────

const {
  mockDocGet,
  mockDocSet,
  mockDocUpdate,
  mockDocDelete,
  mockDoc,
  mockRunTransaction,
  mockConstructEvent,
  mockResendSend,
  mockDetermineSafetyReviewStatus,
} = vi.hoisted(() => {
  // Set env vars before module is imported (webhookSecret captured at module load)
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
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
  const mockConstructEvent = vi.fn();
  const mockResendSend = vi.fn();
  const mockDetermineSafetyReviewStatus = vi.fn();
  return {
    mockDocGet,
    mockDocSet,
    mockDocUpdate,
    mockDocDelete,
    mockDoc,
    mockRunTransaction,
    mockConstructEvent,
    mockResendSend,
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
}));

// ─── Import route handler AFTER mocks ────────────────────────────────────────

import { POST } from '@/app/api/webhooks/stripe/route';

// ─── Test data ───────────────────────────────────────────────────────────────

const validGuestDraft = {
  bookingMode: 'guest',
  sessionId: 'session-123',
  source: 'whatsapp_express',
  className: 'After School Cooking',
  sessionDate: '2028-06-15',
  startTime: '15:30',
  endTime: '16:30',
  venueName: 'Community Hall',
  amount: 2500,
  stripePaymentIntentId: 'pi_test_guest_abc123',
  guestContact: {
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
  consentAudit: {
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
    acceptedAt: 'SERVER_TIMESTAMP',
    acceptedBy: 'Jane Smith',
    termsVersion: '1.0',
    privacyNoticeVersion: '1.0',
    sourceChannel: 'whatsapp_express',
    submissionTimestamp: 'SERVER_TIMESTAMP',
  },
};

const validSessionData = {
  className: 'After School Cooking',
  classType: 'kidsAfterSchool',
  date: '2028-06-15',
  startTime: '15:30',
  endTime: '16:30',
  venueName: 'Community Hall',
  ageMin: 5,
  ageMax: 12,
  price: 2500,
  spotsAvailable: 5,
  status: 'open',
};

const validPaymentIntent = {
  id: 'pi_test_guest_abc123',
  amount: 2500,
  currency: 'gbp',
  status: 'succeeded',
  last_payment_error: null,
};

function makeStripeEvent(type: string, paymentIntent: any) {
  return {
    id: 'evt_test_123',
    type,
    data: { object: paymentIntent },
  };
}

function makeRequest(body: string = ''): Request {
  return new Request('http://localhost/api/webhooks/stripe', {
    method: 'POST',
    headers: {
      'stripe-signature': 'test_sig_valid',
      'Content-Type': 'application/json',
    },
    body,
  });
}

// ─── Setup helpers ───────────────────────────────────────────────────────────

function setupGuestHappyPath() {
  // Stripe constructEvent returns guest payment_intent.succeeded event
  mockConstructEvent.mockReturnValue(
    makeStripeEvent('payment_intent.succeeded', validPaymentIntent)
  );

  // Safety review returns 'not_required'
  mockDetermineSafetyReviewStatus.mockReturnValue('not_required');

  // Resend returns success
  mockResendSend.mockResolvedValue({ data: { id: 'email_123' }, error: null });

  // Draft exists with guest data
  mockDocGet.mockResolvedValue({
    exists: true,
    data: () => validGuestDraft,
  });

  // Transaction implementation: calls the callback with a mock tx
  mockRunTransaction.mockImplementation(async (callback: any) => {
    const txGet = vi.fn();
    const txSet = vi.fn();
    const txUpdate = vi.fn();
    const tx = { get: txGet, set: txSet, update: txUpdate };

    // First get: booking doc (doesn't exist yet)
    txGet.mockResolvedValueOnce({ exists: false });
    // Second get: session doc (exists with valid data)
    txGet.mockResolvedValueOnce({ exists: true, data: () => validSessionData });

    await callback(tx);

    // Store tx operations for assertions
    (mockRunTransaction as any)._lastTx = tx;
    (mockRunTransaction as any)._txSet = txSet;
    (mockRunTransaction as any)._txUpdate = txUpdate;
    (mockRunTransaction as any)._txGet = txGet;
  });

  // Draft delete succeeds
  mockDocDelete.mockResolvedValue(undefined);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Webhook — Guest Booking Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupGuestHappyPath();
  });

  // ── 1. Successful guest booking creation ──────────────────────────────────

  describe('Successful guest booking creation', () => {
    it('creates guest booking document with correct embedded snapshots', async () => {
      const res = await POST(makeRequest('raw-body'));
      expect(res.status).toBe(200);

      // Verify transaction was invoked
      expect(mockRunTransaction).toHaveBeenCalledTimes(1);

      // Verify the booking was set in the transaction
      const txSet = (mockRunTransaction as any)._txSet;
      expect(txSet).toHaveBeenCalledTimes(1);

      const bookingDoc = txSet.mock.calls[0][1];

      // Verify embedded snapshots
      expect(bookingDoc.bookingMode).toBe('guest');
      expect(bookingDoc.bookingSource).toBe('whatsapp_express');
      expect(bookingDoc.sessionId).toBe('session-123');
      expect(bookingDoc.status).toBe('confirmed');
      expect(bookingDoc.guestContact).toEqual(validGuestDraft.guestContact);
      expect(bookingDoc.childSnapshot).toEqual(validGuestDraft.childDetails);
      expect(bookingDoc.medicalSnapshot).toEqual(validGuestDraft.medicalInfo);
      expect(bookingDoc.allergyDietarySnapshot).toEqual(validGuestDraft.allergyDietaryInfo);
      expect(bookingDoc.emergencyContactSnapshot).toEqual(validGuestDraft.emergencyContact);
      expect(bookingDoc.authorisedCollectorSnapshot).toEqual(validGuestDraft.authorisedCollector);
      expect(bookingDoc.consentAudit).toEqual(validGuestDraft.consentAudit);
      expect(bookingDoc.safetyReviewStatus).toBe('not_required');

      // Verify payment info
      expect(bookingDoc.payment).toEqual({
        stripePaymentIntentId: 'pi_test_guest_abc123',
        amount: 2500,
        currency: 'gbp',
        status: 'paid',
        receiptUrl: null,
      });

      // Verify session snapshot
      expect(bookingDoc.sessionSnapshot).toEqual({
        id: 'session-123',
        className: 'After School Cooking',
        classType: 'kidsAfterSchool',
        date: '2028-06-15',
        startTime: '15:30',
        endTime: '16:30',
        venueName: 'Community Hall',
        ageMin: 5,
        ageMax: 12,
        price: 2500,
        spotsAvailable: 5,
        status: 'open',
      });

      // Verify createdAt uses server timestamp
      expect(bookingDoc.createdAt).toBe('SERVER_TIMESTAMP');
    });

    it('booking document ID is set to PaymentIntent ID', async () => {
      await POST(makeRequest('raw-body'));

      // Verify booking doc path uses PI ID
      expect(mockDoc).toHaveBeenCalledWith('bookings/pi_test_guest_abc123');
    });
  });

  // ── 2. spotsAvailable decremented exactly once ────────────────────────────

  describe('Spots decrement', () => {
    it('decrements spotsAvailable by exactly 1 in the transaction', async () => {
      await POST(makeRequest('raw-body'));

      const txUpdate = (mockRunTransaction as any)._txUpdate;
      expect(txUpdate).toHaveBeenCalledTimes(1);

      const updateArgs = txUpdate.mock.calls[0][1];
      expect(updateArgs.spotsAvailable).toEqual({ _increment: -1 });
    });

    it('updates the correct session document', async () => {
      await POST(makeRequest('raw-body'));

      // Verify session doc reference was used
      expect(mockDoc).toHaveBeenCalledWith('sessions/session-123');
    });
  });

  // ── 3. Duplicate webhook is skipped (idempotent) ──────────────────────────

  describe('Idempotency — duplicate webhook', () => {
    it('skips booking creation when booking already exists', async () => {
      // Override transaction: booking already exists
      mockRunTransaction.mockImplementation(async (callback: any) => {
        const txGet = vi.fn();
        const txSet = vi.fn();
        const txUpdate = vi.fn();
        const tx = { get: txGet, set: txSet, update: txUpdate };

        // Booking doc already exists
        txGet.mockResolvedValueOnce({ exists: true });

        await callback(tx);

        (mockRunTransaction as any)._txSet = txSet;
        (mockRunTransaction as any)._txUpdate = txUpdate;
      });

      const res = await POST(makeRequest('raw-body'));
      expect(res.status).toBe(200);

      // No booking should be created
      const txSet = (mockRunTransaction as any)._txSet;
      expect(txSet).not.toHaveBeenCalled();

      // No spots decremented
      const txUpdate = (mockRunTransaction as any)._txUpdate;
      expect(txUpdate).not.toHaveBeenCalled();

      // No confirmation email sent (alreadyProcessed short-circuits)
      expect(mockResendSend).not.toHaveBeenCalled();

      // Draft should not be deleted
      expect(mockDocDelete).not.toHaveBeenCalled();
    });
  });

  // ── 4. payment_failed does NOT create a booking ───────────────────────────

  describe('payment_intent.payment_failed', () => {
    it('does not create a booking document', async () => {
      const failedPaymentIntent = {
        id: 'pi_test_failed_xyz',
        amount: 2500,
        currency: 'gbp',
        status: 'requires_payment_method',
        last_payment_error: { message: 'Card declined' },
      };

      mockConstructEvent.mockReturnValue(
        makeStripeEvent('payment_intent.payment_failed', failedPaymentIntent)
      );

      const res = await POST(makeRequest('raw-body'));
      expect(res.status).toBe(200);

      // No transaction should be executed
      expect(mockRunTransaction).not.toHaveBeenCalled();

      // No confirmation email sent
      expect(mockResendSend).not.toHaveBeenCalled();
    });

    it('updates draft with failure status', async () => {
      const failedPaymentIntent = {
        id: 'pi_test_failed_xyz',
        amount: 2500,
        currency: 'gbp',
        status: 'requires_payment_method',
        last_payment_error: { message: 'Card declined' },
      };

      mockConstructEvent.mockReturnValue(
        makeStripeEvent('payment_intent.payment_failed', failedPaymentIntent)
      );

      await POST(makeRequest('raw-body'));

      // Should attempt to update draft with failure status
      expect(mockDoc).toHaveBeenCalledWith('booking_drafts/pi_test_failed_xyz');
      expect(mockDocUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          paymentStatus: 'failed',
          failureMessage: 'Card declined',
        })
      );
    });
  });

  // ── 5. Missing draft handled gracefully ───────────────────────────────────

  describe('Missing draft', () => {
    it('returns 200 without creating booking when draft is missing', async () => {
      // Draft does not exist
      mockDocGet.mockResolvedValue({
        exists: false,
        data: () => undefined,
      });

      const res = await POST(makeRequest('raw-body'));
      expect(res.status).toBe(200);

      // No transaction should be run
      expect(mockRunTransaction).not.toHaveBeenCalled();

      // No email sent
      expect(mockResendSend).not.toHaveBeenCalled();
    });
  });

  // ── 6. Missing consent in draft prevents booking ──────────────────────────

  describe('Missing consent in draft', () => {
    it('does not create booking when consentAudit is missing', async () => {
      const draftWithoutConsent = { ...validGuestDraft, consentAudit: undefined };
      mockDocGet.mockResolvedValue({
        exists: true,
        data: () => draftWithoutConsent,
      });

      const res = await POST(makeRequest('raw-body'));
      expect(res.status).toBe(200);

      // No transaction should be run for guest booking
      expect(mockRunTransaction).not.toHaveBeenCalled();

      // No email sent
      expect(mockResendSend).not.toHaveBeenCalled();
    });

    it('does not create booking when consentAudit.consents is null', async () => {
      const draftWithNullConsents = {
        ...validGuestDraft,
        consentAudit: { consents: null },
      };
      mockDocGet.mockResolvedValue({
        exists: true,
        data: () => draftWithNullConsents,
      });

      const res = await POST(makeRequest('raw-body'));
      expect(res.status).toBe(200);

      // No transaction should be run
      expect(mockRunTransaction).not.toHaveBeenCalled();
    });
  });

  // ── 7. Confirmation email excludes medical data ───────────────────────────

  describe('Confirmation email content', () => {
    it('sends confirmation email that excludes medical data', async () => {
      await POST(makeRequest('raw-body'));

      // Email should be sent (may be called multiple times for confirmation + admin)
      expect(mockResendSend).toHaveBeenCalled();

      // Find the guest confirmation email (sent to parent email, not admin)
      const confirmationCall = mockResendSend.mock.calls.find(
        (call: any[]) => call[0].to?.includes('jane@example.com')
      );
      expect(confirmationCall).toBeDefined();

      const htmlContent = confirmationCall![0].html;

      // Should include non-sensitive data
      expect(htmlContent).toContain('Jane'); // parent first name
      expect(htmlContent).toContain('Oliver'); // child first name
      expect(htmlContent).toContain('After School Cooking'); // class name

      // Should NOT include medical/allergy data
      expect(htmlContent).not.toContain('foodAllergies');
      expect(htmlContent).not.toContain('epipenRequired');
      expect(htmlContent).not.toContain('respiratoryProblems');
      expect(htmlContent).not.toContain('medicalConditions');
      expect(htmlContent).not.toContain('allergenDetails');
      expect(htmlContent).not.toContain('knownReactions');

      // Should NOT include emergency contact details
      expect(htmlContent).not.toContain('07700900001'); // emergency contact phone

      // Should NOT include full PaymentIntent ID
      expect(htmlContent).not.toContain('pi_test_guest_abc123');
    });

    it('sends to correct parent email address', async () => {
      await POST(makeRequest('raw-body'));

      // Find the guest confirmation email
      const confirmationCall = mockResendSend.mock.calls.find(
        (call: any[]) => call[0].to?.includes('jane@example.com')
      );
      expect(confirmationCall).toBeDefined();
      expect(confirmationCall![0].to).toContain('jane@example.com');
    });
  });

  // ── 8. safetyReviewStatus set correctly ───────────────────────────────────

  describe('Safety review status', () => {
    it('calls determineSafetyReviewStatus with the draft', async () => {
      await POST(makeRequest('raw-body'));

      expect(mockDetermineSafetyReviewStatus).toHaveBeenCalledTimes(1);
      expect(mockDetermineSafetyReviewStatus).toHaveBeenCalledWith(validGuestDraft);
    });

    it('stores pending safety review status on the booking document', async () => {
      mockDetermineSafetyReviewStatus.mockReturnValue('pending');

      await POST(makeRequest('raw-body'));

      const txSet = (mockRunTransaction as any)._txSet;
      const bookingDoc = txSet.mock.calls[0][1];
      expect(bookingDoc.safetyReviewStatus).toBe('pending');
    });

    it('stores not_required safety review status on the booking document', async () => {
      mockDetermineSafetyReviewStatus.mockReturnValue('not_required');

      await POST(makeRequest('raw-body'));

      const txSet = (mockRunTransaction as any)._txSet;
      const bookingDoc = txSet.mock.calls[0][1];
      expect(bookingDoc.safetyReviewStatus).toBe('not_required');
    });
  });

  // ── 9. Existing authenticated booking flow unaffected ─────────────────────

  describe('Existing authenticated booking flow', () => {
    it('processes non-guest draft with the original booking logic', async () => {
      // Draft without bookingMode (authenticated booking)
      const authenticatedDraft = {
        sessionId: 'session-456',
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

      mockDocGet.mockResolvedValue({
        exists: true,
        data: () => authenticatedDraft,
      });

      mockConstructEvent.mockReturnValue(
        makeStripeEvent('payment_intent.succeeded', {
          id: 'pi_test_auth_xyz',
          amount: 1500,
          currency: 'gbp',
          status: 'succeeded',
        })
      );

      // Transaction for authenticated path
      mockRunTransaction.mockImplementation(async (callback: any) => {
        const txGet = vi.fn();
        const txSet = vi.fn();
        const txUpdate = vi.fn();
        const tx = { get: txGet, set: txSet, update: txUpdate };

        // Booking doc doesn't exist
        txGet.mockResolvedValueOnce({ exists: false });
        // Session doc exists
        txGet.mockResolvedValueOnce({
          exists: true,
          data: () => ({ ...validSessionData, status: 'open', spotsAvailable: 3 }),
        });

        await callback(tx);

        (mockRunTransaction as any)._txSet = txSet;
        (mockRunTransaction as any)._txUpdate = txUpdate;
      });

      const res = await POST(makeRequest('raw-body'));
      expect(res.status).toBe(200);

      // Transaction should be called (standard booking creation)
      expect(mockRunTransaction).toHaveBeenCalledTimes(1);

      // determineSafetyReviewStatus IS now called for authenticated bookings (fix applied)
      expect(mockDetermineSafetyReviewStatus).toHaveBeenCalled();

      // Should use original booking doc structure (not guest)
      const txSet = (mockRunTransaction as any)._txSet;
      const bookingDoc = txSet.mock.calls[0][1];
      expect(bookingDoc.bookedByUid).toBe('user-uid-123');
      expect(bookingDoc.studentId).toBe('student-789');
      expect(bookingDoc).not.toHaveProperty('bookingMode');
      expect(bookingDoc).not.toHaveProperty('guestContact');
      expect(bookingDoc).not.toHaveProperty('childSnapshot');
    });

    it('bundle draft goes through bundle handler without guest logic', async () => {
      const bundleDraft = {
        bundleId: 'bundle-001',
        bundleName: '4-week course',
        sessionIds: ['session-a', 'session-b'],
        sessions: [
          { sessionId: 'session-a', date: '2028-07-01', startTime: '15:30', endTime: '16:30', venueName: 'Hall A' },
          { sessionId: 'session-b', date: '2028-07-08', startTime: '15:30', endTime: '16:30', venueName: 'Hall B' },
        ],
        className: 'Kids Cooking',
        bookedByUid: 'user-uid-123',
        bookedByName: 'Parent User',
        bookedByEmail: 'parent@example.com',
        studentId: 'student-789',
        studentName: 'Child User',
        medicalInfo: null,
        emergencyContact: null,
        questionnaire: null,
        termsAccepted: true,
        venueName: 'Hall A',
      };

      mockDocGet.mockResolvedValue({
        exists: true,
        data: () => bundleDraft,
      });

      mockConstructEvent.mockReturnValue(
        makeStripeEvent('payment_intent.succeeded', {
          id: 'pi_test_bundle_xyz',
          amount: 5000,
          currency: 'gbp',
          status: 'succeeded',
        })
      );

      // Transaction for bundle path
      mockRunTransaction.mockImplementation(async (callback: any) => {
        const txGet = vi.fn();
        const txSet = vi.fn();
        const txUpdate = vi.fn();
        const tx = { get: txGet, set: txSet, update: txUpdate };

        // Existing bookings don't exist, sessions do
        txGet.mockResolvedValueOnce({ exists: false }); // booking A
        txGet.mockResolvedValueOnce({ exists: false }); // booking B
        txGet.mockResolvedValueOnce({ exists: true, data: () => ({ ...validSessionData, spotsAvailable: 3 }) }); // session A
        txGet.mockResolvedValueOnce({ exists: true, data: () => ({ ...validSessionData, spotsAvailable: 2 }) }); // session B

        await callback(tx);

        (mockRunTransaction as any)._txSet = txSet;
      });

      const res = await POST(makeRequest('raw-body'));
      expect(res.status).toBe(200);

      // determineSafetyReviewStatus should NOT be called for bundle bookings
      expect(mockDetermineSafetyReviewStatus).not.toHaveBeenCalled();
    });
  });

  // ── Draft cleanup ─────────────────────────────────────────────────────────

  describe('Draft cleanup', () => {
    it('deletes the draft after successful booking creation', async () => {
      await POST(makeRequest('raw-body'));

      expect(mockDoc).toHaveBeenCalledWith('booking_drafts/pi_test_guest_abc123');
      expect(mockDocDelete).toHaveBeenCalled();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Bug Condition Exploration: Authenticated Bookings Missing Safety Review Status
// ─────────────────────────────────────────────────────────────────────────────
// **Validates: Requirements 1.1, 2.1**
//
// Property 1: Bug Condition — For all authenticated booking drafts with at least
// one high-risk medical declaration (foodAllergies, epipenRequired,
// respiratoryProblems, airborneAllergies, or non-empty medicalConditions), the
// booking document MUST contain `safetyReviewStatus: 'pending'`.
//
// EXPECTED OUTCOME: This test FAILS on unfixed code because the authenticated
// branch never calls `determineSafetyReviewStatus` — the booking document will
// not have a `safetyReviewStatus` field.
// ─────────────────────────────────────────────────────────────────────────────

describe('Bug Condition Exploration — Authenticated Bookings Missing Safety Review Status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Generator for high-risk medical info objects.
   * At least one of the high-risk flags must be true.
   */
  const highRiskMedicalInfoArb = fc.record({
    foodAllergies: fc.boolean(),
    epipenRequired: fc.boolean(),
    respiratoryProblems: fc.boolean(),
    airborneAllergies: fc.boolean(),
    medicalConditions: fc.oneof(
      fc.constant(''),
      fc.string({ minLength: 1, maxLength: 50 })
    ),
    // Non-risk fields — always present but don't affect safety status
    dietaryRequirements: fc.constant(''),
    allergenDetails: fc.constant(''),
    knownReactions: fc.constant(''),
    symptoms: fc.constant(''),
    epipenDetails: fc.constant(''),
    medicationDetails: fc.constant(''),
    recentOperations: fc.constant(''),
    visionImpairment: fc.constant(false),
    hearingImpairment: fc.constant(false),
    additionalSupportNeeds: fc.constant(''),
    otherSafetyInfo: fc.constant(''),
  }).filter((med) => {
    // At least one high-risk flag must be true
    return (
      med.foodAllergies === true ||
      med.epipenRequired === true ||
      med.respiratoryProblems === true ||
      med.airborneAllergies === true ||
      med.medicalConditions.trim().length > 0
    );
  });

  it('authenticated booking with high-risk medical info MUST have safetyReviewStatus: pending', async () => {
    await fc.assert(
      fc.asyncProperty(highRiskMedicalInfoArb, async (medicalInfo) => {
        vi.clearAllMocks();

        // Arrange: authenticated draft with high-risk medical declarations
        const authenticatedDraft = {
          sessionId: 'session-456',
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
          medicalInfo,
          emergencyContact: { name: 'Parent', relationship: 'Mother', mobile: '07700900000' },
          questionnaire: null,
          termsAccepted: true,
        };

        // Mock Stripe event
        mockConstructEvent.mockReturnValue(
          makeStripeEvent('payment_intent.succeeded', {
            id: 'pi_test_auth_medical',
            amount: 1500,
            currency: 'gbp',
            status: 'succeeded',
          })
        );

        // Mock draft fetch
        mockDocGet.mockResolvedValue({
          exists: true,
          data: () => authenticatedDraft,
        });

        // Mock determineSafetyReviewStatus to return 'pending' (as it would for high-risk)
        mockDetermineSafetyReviewStatus.mockReturnValue('pending');

        // Mock Resend
        mockResendSend.mockResolvedValue({ data: { id: 'email_123' }, error: null });

        // Mock transaction
        mockRunTransaction.mockImplementation(async (callback: any) => {
          const txGet = vi.fn();
          const txSet = vi.fn();
          const txUpdate = vi.fn();
          const tx = { get: txGet, set: txSet, update: txUpdate };

          // Booking doesn't exist yet (not a duplicate)
          txGet.mockResolvedValueOnce({ exists: false });
          // Session exists with available spots
          txGet.mockResolvedValueOnce({
            exists: true,
            data: () => ({ spotsAvailable: 5, status: 'open' }),
          });

          await callback(tx);

          (mockRunTransaction as any)._txSet = txSet;
        });

        // Mock draft delete
        mockDocDelete.mockResolvedValue(undefined);

        // Act: process the webhook
        const res = await POST(makeRequest('raw-body'));
        expect(res.status).toBe(200);

        // Assert: the booking document MUST contain safetyReviewStatus: 'pending'
        const txSet = (mockRunTransaction as any)._txSet;
        expect(txSet).toHaveBeenCalledTimes(1);

        const bookingDoc = txSet.mock.calls[0][1];
        expect(bookingDoc.safetyReviewStatus).toBe('pending');
      }),
      { numRuns: 20 }
    );
  });
});


// ─── Property-Based Tests: Preservation ─────────────────────────────────────
// **Validates: Requirements 3.1, 3.2, 3.4**

describe('Preservation Property Tests (PBT)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Arbitrary generators ──────────────────────────────────────────────────

  /** Generate arbitrary medical info with various flag combinations */
  const arbMedicalInfo = fc.record({
    foodAllergies: fc.boolean(),
    dietaryRequirements: fc.string(),
    airborneAllergies: fc.boolean(),
    allergenDetails: fc.string(),
    knownReactions: fc.string(),
    symptoms: fc.string(),
    epipenRequired: fc.boolean(),
    epipenDetails: fc.string(),
    medicationDetails: fc.string(),
    respiratoryProblems: fc.boolean(),
    medicalConditions: fc.oneof(
      fc.constant(''),
      fc.constant('   '),
      fc.string({ minLength: 1 }),
      fc.constant(null as unknown as string)
    ),
    recentOperations: fc.string(),
    visionImpairment: fc.boolean(),
    hearingImpairment: fc.boolean(),
    additionalSupportNeeds: fc.string(),
    otherSafetyInfo: fc.string(),
  });

  // ── Property 2a: Guest Booking Safety Review Status Preservation ──────────
  // For all guest booking drafts with arbitrary medical info combinations,
  // the webhook handler produces a booking document with safetyReviewStatus
  // matching the output of determineSafetyReviewStatus(draft).

  describe('Property 2a: Guest booking safetyReviewStatus matches determineSafetyReviewStatus output', () => {
    it('for all guest drafts with arbitrary medical info, safetyReviewStatus is written correctly', async () => {
      await fc.assert(
        fc.asyncProperty(arbMedicalInfo, async (medicalInfo) => {
          vi.clearAllMocks();

          // Build a guest draft with the generated medical info
          const guestDraft = {
            ...validGuestDraft,
            medicalInfo,
          };

          // Compute expected safety status using the same logic the handler uses
          const hasHighRisk =
            medicalInfo.foodAllergies === true ||
            medicalInfo.epipenRequired === true ||
            medicalInfo.respiratoryProblems === true ||
            medicalInfo.airborneAllergies === true ||
            (medicalInfo.medicalConditions != null &&
              String(medicalInfo.medicalConditions).trim().length > 0);
          const expectedStatus = hasHighRisk ? 'pending' : 'not_required';

          // Mock determineSafetyReviewStatus to return the expected value
          mockDetermineSafetyReviewStatus.mockReturnValue(expectedStatus);

          // Stripe constructEvent returns guest payment_intent.succeeded event
          mockConstructEvent.mockReturnValue(
            makeStripeEvent('payment_intent.succeeded', validPaymentIntent)
          );

          // Resend returns success
          mockResendSend.mockResolvedValue({ data: { id: 'email_123' }, error: null });

          // Draft exists with generated medical info
          mockDocGet.mockResolvedValue({
            exists: true,
            data: () => guestDraft,
          });

          // Transaction implementation
          mockRunTransaction.mockImplementation(async (callback: any) => {
            const txGet = vi.fn();
            const txSet = vi.fn();
            const txUpdate = vi.fn();
            const tx = { get: txGet, set: txSet, update: txUpdate };

            // Booking doc doesn't exist yet
            txGet.mockResolvedValueOnce({ exists: false });
            // Session doc exists with valid data
            txGet.mockResolvedValueOnce({ exists: true, data: () => validSessionData });

            await callback(tx);

            (mockRunTransaction as any)._txSet = txSet;
          });

          // Draft delete succeeds
          mockDocDelete.mockResolvedValue(undefined);

          const res = await POST(makeRequest('raw-body'));
          expect(res.status).toBe(200);

          // Verify determineSafetyReviewStatus was called with the draft
          expect(mockDetermineSafetyReviewStatus).toHaveBeenCalledWith(guestDraft);

          // Verify the booking document has the correct safetyReviewStatus
          const txSet = (mockRunTransaction as any)._txSet;
          expect(txSet).toHaveBeenCalledTimes(1);
          const bookingDoc = txSet.mock.calls[0][1];
          expect(bookingDoc.safetyReviewStatus).toBe(expectedStatus);
        }),
        { numRuns: 50 }
      );
    });
  });

  // ── Property 2b: Authenticated Booking Field Preservation ─────────────────
  // For all authenticated booking drafts, existing fields remain unchanged
  // in the output booking document.

  describe('Property 2b: Authenticated booking fields are preserved unchanged', () => {
    /** Generate arbitrary authenticated draft field values */
    const arbAuthenticatedDraft = fc.record({
      sessionId: fc.string({ minLength: 1 }),
      sessionDate: fc.constantFrom('2028-06-15', '2028-07-01', '2028-09-10'),
      className: fc.string({ minLength: 1 }),
      venueName: fc.string({ minLength: 1 }),
      startTime: fc.constantFrom('15:30', '10:00', '14:00'),
      endTime: fc.constantFrom('16:30', '12:00', '15:00'),
      bookedByUid: fc.string({ minLength: 1 }),
      bookedByName: fc.string({ minLength: 1 }),
      bookedByEmail: fc.string({ minLength: 1 }),
      studentId: fc.string({ minLength: 1 }),
      studentName: fc.string({ minLength: 1 }),
      medicalInfo: fc.oneof(fc.constant(null), arbMedicalInfo),
      emergencyContact: fc.oneof(
        fc.constant(null),
        fc.record({
          name: fc.string({ minLength: 1 }),
          relationship: fc.string({ minLength: 1 }),
          mobile: fc.string({ minLength: 1 }),
          alternativePhone: fc.string(),
          email: fc.string({ minLength: 1 }),
        })
      ),
      questionnaire: fc.oneof(
        fc.constant(null),
        fc.record({
          favouriteFoods: fc.string(),
          dislikedFoods: fc.string(),
          cookingExperience: fc.string(),
        })
      ),
      termsAccepted: fc.constant(true),
    });

    it('for all authenticated drafts, bookedByUid, studentId, medicalInfo, emergencyContact, questionnaire, payment, status, and termsAccepted are preserved', async () => {
      await fc.assert(
        fc.asyncProperty(arbAuthenticatedDraft, async (draftFields) => {
          vi.clearAllMocks();

          const authenticatedDraft = {
            ...draftFields,
            // Explicitly no bookingMode or bookingMode !== 'guest' (authenticated)
          };

          const piId = 'pi_test_auth_prop_' + Math.random().toString(36).slice(2, 10);
          const paymentAmount = Math.floor(Math.random() * 5000) + 500;

          // Stripe constructEvent returns payment_intent.succeeded event
          mockConstructEvent.mockReturnValue(
            makeStripeEvent('payment_intent.succeeded', {
              id: piId,
              amount: paymentAmount,
              currency: 'gbp',
              status: 'succeeded',
            })
          );

          // Draft exists with authenticated data
          mockDocGet.mockResolvedValue({
            exists: true,
            data: () => authenticatedDraft,
          });

          // Resend returns success
          mockResendSend.mockResolvedValue({ data: { id: 'email_123' }, error: null });

          // Transaction implementation for authenticated path
          mockRunTransaction.mockImplementation(async (callback: any) => {
            const txGet = vi.fn();
            const txSet = vi.fn();
            const txUpdate = vi.fn();
            const tx = { get: txGet, set: txSet, update: txUpdate };

            // Booking doc doesn't exist
            txGet.mockResolvedValueOnce({ exists: false });
            // Session doc exists
            txGet.mockResolvedValueOnce({
              exists: true,
              data: () => ({ ...validSessionData, spotsAvailable: 5, status: 'open' }),
            });

            await callback(tx);

            (mockRunTransaction as any)._txSet = txSet;
          });

          // Draft delete succeeds
          mockDocDelete.mockResolvedValue(undefined);

          const res = await POST(makeRequest('raw-body'));
          expect(res.status).toBe(200);

          // Verify the transaction created a booking
          const txSet = (mockRunTransaction as any)._txSet;
          expect(txSet).toHaveBeenCalledTimes(1);
          const bookingDoc = txSet.mock.calls[0][1];

          // Assert preservation of all key fields
          expect(bookingDoc.bookedByUid).toBe(draftFields.bookedByUid);
          expect(bookingDoc.studentId).toBe(draftFields.studentId);
          expect(bookingDoc.medicalInfo).toEqual(draftFields.medicalInfo ?? null);
          expect(bookingDoc.emergencyContact).toEqual(draftFields.emergencyContact ?? null);
          expect(bookingDoc.questionnaire).toEqual(draftFields.questionnaire ?? null);
          expect(bookingDoc.status).toBe('confirmed');
          expect(bookingDoc.termsAccepted).toBe(draftFields.termsAccepted);

          // Payment field preserved correctly
          expect(bookingDoc.payment).toEqual({
            stripePaymentIntentId: piId,
            amount: paymentAmount,
            currency: 'gbp',
            status: 'paid',
            receiptUrl: null,
          });
        }),
        { numRuns: 50 }
      );
    });
  });
});
