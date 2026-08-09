import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks ───────────────────────────────────────────────────────────

const {
  mockDocGet,
  mockDocSet,
  mockDoc,
  mockStripeCreate,
  mockStripeUpdate,
  mockStripeCancel,
  mockVerifyTurnstile,
  mockCheckRateLimit,
  mockKvGet,
  mockKvSet,
  mockIsGuestCheckoutEnabled,
} = vi.hoisted(() => {
  // Track individual doc references so we can differentiate session vs draft calls
  const mockDocGet = vi.fn();
  const mockDocSet = vi.fn();
  const mockDoc = vi.fn(() => ({ get: mockDocGet, set: mockDocSet }));
  const mockStripeCreate = vi.fn();
  const mockStripeUpdate = vi.fn();
  const mockStripeCancel = vi.fn();
  const mockVerifyTurnstile = vi.fn();
  const mockCheckRateLimit = vi.fn();
  const mockKvGet = vi.fn();
  const mockKvSet = vi.fn();
  const mockIsGuestCheckoutEnabled = vi.fn();
  return {
    mockDocGet,
    mockDocSet,
    mockDoc,
    mockStripeCreate,
    mockStripeUpdate,
    mockStripeCancel,
    mockVerifyTurnstile,
    mockCheckRateLimit,
    mockKvGet,
    mockKvSet,
    mockIsGuestCheckoutEnabled,
  };
});

// ─── Module mocks ────────────────────────────────────────────────────────────

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: { doc: mockDoc },
  adminInitError: null,
}));

vi.mock('firebase-admin', () => ({
  firestore: { FieldValue: { serverTimestamp: () => 'SERVER_TIMESTAMP' } },
}));

vi.mock('@/lib/stripe', () => ({
  default: {
    paymentIntents: {
      create: mockStripeCreate,
      update: mockStripeUpdate,
      cancel: mockStripeCancel,
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

// ─── Import route handler AFTER mocks ────────────────────────────────────────

import { POST } from '@/app/api/payments/create-guest-intent/route';

// ─── Test helpers ────────────────────────────────────────────────────────────

/** A valid baseline payload that passes all validation. */
const validPayload = {
  sessionId: 'session-abc-123',
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

/** A valid session Firestore document (open, future, spots available). */
const validSessionData = {
  status: 'open',
  date: '2028-03-15',
  spotsAvailable: 5,
  price: 2500,
  ageMin: 5,
  ageMax: 12,
};

function makeRequest(body: object): Request {
  return new Request('http://localhost/api/payments/create-guest-intent', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-forwarded-for': '192.168.1.1',
    },
    body: JSON.stringify(body),
  });
}

// ─── Defaults for happy path ─────────────────────────────────────────────────

function setupHappyPath() {
  mockIsGuestCheckoutEnabled.mockReturnValue(true);
  mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 4, resetAt: Date.now() + 60000 });
  mockVerifyTurnstile.mockResolvedValue(true);
  mockKvGet.mockResolvedValue(null);
  mockKvSet.mockResolvedValue(undefined);

  // mockDocGet is called twice: first for session lookup, second not used in happy path
  // But the route calls adminDb.doc('sessions/...').get() and adminDb.doc('booking_drafts/...').set()
  // We set get to return valid session data (it's called for session lookup)
  mockDocGet.mockResolvedValue({ exists: true, data: () => validSessionData });
  mockDocSet.mockResolvedValue(undefined);

  mockStripeCreate.mockResolvedValue({
    id: 'pi_test_123456',
    client_secret: 'pi_test_123456_secret_abc',
  });
  mockStripeUpdate.mockResolvedValue({});

  process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('POST /api/payments/create-guest-intent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupHappyPath();
  });

  // ── Feature flag disabled → 403 ───────────────────────────────────────────

  describe('Feature flag disabled', () => {
    it('returns 403 when guest checkout is disabled', async () => {
      mockIsGuestCheckoutEnabled.mockReturnValue(false);

      const res = await POST(makeRequest(validPayload));
      expect(res.status).toBe(403);

      const json = await res.json();
      expect(json.code).toBe('FEATURE_DISABLED');
    });
  });

  // ── Rate limiting → 429 ───────────────────────────────────────────────────

  describe('Rate limiting', () => {
    it('returns 429 when rate limit is exceeded', async () => {
      mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0, resetAt: Date.now() + 60000 });

      const res = await POST(makeRequest(validPayload));
      expect(res.status).toBe(429);

      const json = await res.json();
      expect(json.code).toBe('RATE_LIMITED');
    });
  });

  // ── Bot verification failure → 400 ────────────────────────────────────────

  describe('Bot verification (Turnstile)', () => {
    it('returns 400 when turnstile token verification fails', async () => {
      mockVerifyTurnstile.mockResolvedValue(false);

      const res = await POST(makeRequest(validPayload));
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.code).toBe('TURNSTILE_FAILED');
    });

    it('returns 400 when turnstile token is missing', async () => {
      const payload = { ...validPayload, turnstileToken: '' };

      const res = await POST(makeRequest(payload));
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.code).toBe('TURNSTILE_MISSING');
    });
  });

  // ── Duplicate submission reference → 409 ──────────────────────────────────

  describe('Duplicate submission reference', () => {
    it('returns 409 when submission reference already exists', async () => {
      mockKvGet.mockResolvedValue('1');

      const res = await POST(makeRequest(validPayload));
      expect(res.status).toBe(409);

      const json = await res.json();
      expect(json.code).toBe('DUPLICATE_SUBMISSION');
    });
  });

  // ── Invalid session ID → 400 ──────────────────────────────────────────────

  describe('Session validation', () => {
    it('returns 400 when session does not exist', async () => {
      mockDocGet.mockResolvedValue({ exists: false, data: () => undefined });

      const res = await POST(makeRequest(validPayload));
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.code).toBe('SESSION_NOT_FOUND');
    });

    it('returns 400 when session status is closed', async () => {
      mockDocGet.mockResolvedValue({
        exists: true,
        data: () => ({ ...validSessionData, status: 'closed' }),
      });

      const res = await POST(makeRequest(validPayload));
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.code).toBe('SESSION_NOT_OPEN');
    });

    it('returns 400 when session status is cancelled', async () => {
      mockDocGet.mockResolvedValue({
        exists: true,
        data: () => ({ ...validSessionData, status: 'cancelled' }),
      });

      const res = await POST(makeRequest(validPayload));
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.code).toBe('SESSION_NOT_OPEN');
    });

    it('returns 400 when session is full (spotsAvailable = 0)', async () => {
      mockDocGet.mockResolvedValue({
        exists: true,
        data: () => ({ ...validSessionData, spotsAvailable: 0 }),
      });

      const res = await POST(makeRequest(validPayload));
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.code).toBe('SESSION_FULL');
    });

    it('returns 400 when session date is in the past', async () => {
      mockDocGet.mockResolvedValue({
        exists: true,
        data: () => ({ ...validSessionData, date: '2020-01-01' }),
      });

      const res = await POST(makeRequest(validPayload));
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.code).toBe('SESSION_PAST');
    });
  });

  // ── Child age validation ──────────────────────────────────────────────────

  describe('Child age validation', () => {
    it('returns 400 when child is underage', async () => {
      // Child born 2023-06-15, session date 2028-03-15 → age 4, below ageMin 5
      const payload = {
        ...validPayload,
        childDetails: { ...validPayload.childDetails, dateOfBirth: '2023-06-15' },
      };

      const res = await POST(makeRequest(payload));
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.code).toBe('CHILD_AGE_INVALID');
    });

    it('returns 400 when child is overage', async () => {
      // Child born 2010-01-01, session date 2028-03-15 → age 18, above ageMax 12
      const payload = {
        ...validPayload,
        childDetails: { ...validPayload.childDetails, dateOfBirth: '2010-01-01' },
      };

      const res = await POST(makeRequest(payload));
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.code).toBe('CHILD_AGE_INVALID');
    });
  });

  // ── Missing mandatory consents → 400 ─────────────────────────────────────

  describe('Mandatory consent validation', () => {
    // Note: The Zod schema uses z.literal(true) for mandatory consents, so
    // setting any to false fails Zod validation (step 6) with VALIDATION_ERROR.
    // This still produces a 400 response, which is the desired behaviour.
    const mandatoryConsents = [
      'parentGuardianAuthority',
      'accuracyOfInformation',
      'healthSafetyDataProcessing',
      'emergencyAssistanceAuthorisation',
      'termsAndCancellationPolicy',
      'privacyNoticeAcknowledgement',
    ] as const;

    for (const consent of mandatoryConsents) {
      it(`returns 400 when ${consent} is false`, async () => {
        const payload = {
          ...validPayload,
          consents: { ...validPayload.consents, [consent]: false },
        };

        const res = await POST(makeRequest(payload));
        expect(res.status).toBe(400);

        const json = await res.json();
        // Zod schema enforces z.literal(true), so this fails at validation
        expect(json.code).toBe('VALIDATION_ERROR');
        expect(json.error).toBe('Validation failed.');
      });
    }
  });

  // ── Stripe metadata contains no PII or medical data ───────────────────────

  describe('Stripe metadata safety', () => {
    it('creates PaymentIntent with only safe metadata (no PII or medical data)', async () => {
      const res = await POST(makeRequest(validPayload));
      expect(res.status).toBe(200);

      // Verify Stripe create was called
      expect(mockStripeCreate).toHaveBeenCalledTimes(1);
      const createCall = mockStripeCreate.mock.calls[0][0];
      const metadata = createCall.metadata;

      // Should contain safe fields
      expect(metadata.bookingMode).toBe('guest');
      expect(metadata.sessionId).toBe('session-abc-123');
      expect(metadata.source).toBe('whatsapp_express');

      // Should NOT contain PII
      expect(metadata).not.toHaveProperty('email');
      expect(metadata).not.toHaveProperty('firstName');
      expect(metadata).not.toHaveProperty('lastName');
      expect(metadata).not.toHaveProperty('telephone');
      expect(metadata).not.toHaveProperty('phone');
      expect(metadata).not.toHaveProperty('childName');

      // Should NOT contain medical data
      expect(metadata).not.toHaveProperty('medicalInfo');
      expect(metadata).not.toHaveProperty('allergyDietaryInfo');
      expect(metadata).not.toHaveProperty('foodAllergies');
      expect(metadata).not.toHaveProperty('epipenRequired');
      expect(metadata).not.toHaveProperty('medicalConditions');

      // Verify stringified metadata values don't contain PII
      const metadataStr = JSON.stringify(metadata);
      expect(metadataStr).not.toContain('jane@example.com');
      expect(metadataStr).not.toContain('Jane');
      expect(metadataStr).not.toContain('Smith');
      expect(metadataStr).not.toContain('07700900000');
    });

    it('update call also contains only safe metadata', async () => {
      await POST(makeRequest(validPayload));

      expect(mockStripeUpdate).toHaveBeenCalledTimes(1);
      const updateCall = mockStripeUpdate.mock.calls[0];
      // stripe.paymentIntents.update(id, { metadata: ... })
      const updateArgs = updateCall[1];
      const metadata = updateArgs.metadata;

      // Should contain safe fields only
      expect(metadata.bookingMode).toBe('guest');
      expect(metadata.sessionId).toBe('session-abc-123');
      expect(metadata.source).toBe('whatsapp_express');
      expect(metadata.draftId).toBe('pi_test_123456');

      // Should NOT contain PII
      const metadataStr = JSON.stringify(metadata);
      expect(metadataStr).not.toContain('jane@example.com');
      expect(metadataStr).not.toContain('Oliver');
      expect(metadataStr).not.toContain('allergen');
    });
  });

  // ── Happy path ────────────────────────────────────────────────────────────

  describe('Happy path', () => {
    it('returns 200 with clientSecret and paymentIntentId for valid payload', async () => {
      const res = await POST(makeRequest(validPayload));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.clientSecret).toBe('pi_test_123456_secret_abc');
      expect(json.paymentIntentId).toBe('pi_test_123456');
    });

    it('saves booking draft to Firestore', async () => {
      await POST(makeRequest(validPayload));

      // mockDoc is called for both sessions/{id} and booking_drafts/{id}
      expect(mockDoc).toHaveBeenCalledWith('sessions/session-abc-123');
      expect(mockDoc).toHaveBeenCalledWith('booking_drafts/pi_test_123456');
      expect(mockDocSet).toHaveBeenCalledWith(
        expect.objectContaining({
          stripePaymentIntentId: 'pi_test_123456',
          paymentStatus: 'pending',
          bookingMode: 'guest',
          sessionId: 'session-abc-123',
          source: 'whatsapp_express',
          submissionRef: '550e8400-e29b-41d4-a716-446655440000',
        })
      );
    });
  });

  // ── Social Attribution Propagation ────────────────────────────────────────

  describe('Social attribution propagation', () => {
    function makeRequestWithQueryParams(body: object, queryParams: string): Request {
      return new Request(`http://localhost/api/payments/create-guest-intent?${queryParams}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': '192.168.1.1',
        },
        body: JSON.stringify(body),
      });
    }

    it('writes socialAttribution to draft when source=social_whatsapp', async () => {
      const req = makeRequestWithQueryParams(
        validPayload,
        'source=social_whatsapp&campaign=summer_2025&socialBookingSessionId=sbs_123'
      );
      const res = await POST(req);
      expect(res.status).toBe(200);

      expect(mockDocSet).toHaveBeenCalledWith(
        expect.objectContaining({
          socialAttribution: {
            bookingSource: 'whatsapp_express',
            campaign: 'summer_2025',
            socialBookingSessionId: 'sbs_123',
          },
        })
      );
    });

    it('writes socialAttribution with instagram_express for source=social_instagram', async () => {
      const req = makeRequestWithQueryParams(
        validPayload,
        'source=social_instagram&campaign=ig_promo'
      );
      const res = await POST(req);
      expect(res.status).toBe(200);

      expect(mockDocSet).toHaveBeenCalledWith(
        expect.objectContaining({
          socialAttribution: {
            bookingSource: 'instagram_express',
            campaign: 'ig_promo',
            socialBookingSessionId: null,
          },
        })
      );
    });

    it('writes socialAttribution with facebook_express for source=social_messenger', async () => {
      const req = makeRequestWithQueryParams(
        validPayload,
        'source=social_messenger'
      );
      const res = await POST(req);
      expect(res.status).toBe(200);

      expect(mockDocSet).toHaveBeenCalledWith(
        expect.objectContaining({
          socialAttribution: {
            bookingSource: 'facebook_express',
            campaign: null,
            socialBookingSessionId: null,
          },
        })
      );
    });

    it('does NOT include socialAttribution when no source query param is present', async () => {
      const req = makeRequest(validPayload);
      const res = await POST(req);
      expect(res.status).toBe(200);

      const setCall = mockDocSet.mock.calls[0][0];
      expect(setCall).not.toHaveProperty('socialAttribution');
    });

    it('does NOT include socialAttribution when source is not a social channel', async () => {
      const req = makeRequestWithQueryParams(validPayload, 'source=website_express');
      const res = await POST(req);
      expect(res.status).toBe(200);

      const setCall = mockDocSet.mock.calls[0][0];
      expect(setCall).not.toHaveProperty('socialAttribution');
    });

    it('does NOT include socialAttribution for unrecognised social source', async () => {
      const req = makeRequestWithQueryParams(validPayload, 'source=social_unknown_platform');
      const res = await POST(req);
      expect(res.status).toBe(200);

      const setCall = mockDocSet.mock.calls[0][0];
      expect(setCall).not.toHaveProperty('socialAttribution');
    });

    it('does not modify existing draft fields when social attribution is present', async () => {
      const req = makeRequestWithQueryParams(
        validPayload,
        'source=social_whatsapp&campaign=test_campaign&socialBookingSessionId=sbs_xyz'
      );
      const res = await POST(req);
      expect(res.status).toBe(200);

      // Verify existing fields are still present alongside social attribution
      expect(mockDocSet).toHaveBeenCalledWith(
        expect.objectContaining({
          stripePaymentIntentId: 'pi_test_123456',
          paymentStatus: 'pending',
          bookingMode: 'guest',
          sessionId: 'session-abc-123',
          source: 'whatsapp_express',
          socialAttribution: {
            bookingSource: 'whatsapp_express',
            campaign: 'test_campaign',
            socialBookingSessionId: 'sbs_xyz',
          },
        })
      );
    });
  });
});
