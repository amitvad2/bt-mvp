import { describe, it, expect, vi, beforeEach } from 'vitest';

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

      // determineSafetyReviewStatus should NOT be called for authenticated booking
      expect(mockDetermineSafetyReviewStatus).not.toHaveBeenCalled();

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
