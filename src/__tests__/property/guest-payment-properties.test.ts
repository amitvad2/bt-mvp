// Feature: guest-express-checkout
// Property 2: Session Eligibility Gate
// Property 3: Mandatory Consent Enforcement
// Property 5: Server-Authoritative Price
// Property 13: Zod Schema Validation Consistency
// Property 14: Draft Failure Triggers PaymentIntent Cancellation
// **Validates: Requirements 2.1–2.5, 6.1, 6.3, 8.3–8.11**

// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';

// --- Mocks ---

const mockGet = vi.fn();
const mockSet = vi.fn();
const mockDoc = vi.fn();
const mockFirestoreDocSet = vi.fn();

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    doc: (path: string) => {
      mockDoc(path);
      return {
        get: mockGet,
        set: mockFirestoreDocSet,
      };
    },
  },
  adminInitError: null,
}));

const mockPaymentIntentsCreate = vi.fn();
const mockPaymentIntentsUpdate = vi.fn();
const mockPaymentIntentsCancel = vi.fn();

vi.mock('@/lib/stripe', () => ({
  default: {
    paymentIntents: {
      create: (...args: unknown[]) => mockPaymentIntentsCreate(...args),
      update: (...args: unknown[]) => mockPaymentIntentsUpdate(...args),
      cancel: (...args: unknown[]) => mockPaymentIntentsCancel(...args),
    },
  },
}));

vi.mock('@/lib/turnstile', () => ({
  verifyTurnstileToken: vi.fn().mockResolvedValue(true),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 4, resetAt: 0 }),
}));

vi.mock('@vercel/kv', () => ({
  kv: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
  },
}));

vi.mock('@/lib/feature-flags', () => ({
  isGuestCheckoutEnabled: vi.fn().mockReturnValue(true),
}));

vi.mock('firebase-admin', () => ({
  firestore: {
    FieldValue: {
      serverTimestamp: () => 'SERVER_TIMESTAMP',
    },
  },
}));

// Import the POST handler after mocks are set up
import { POST } from '@/app/api/payments/create-guest-intent/route';
import { createGuestIntentSchema } from '@/app/api/payments/create-guest-intent/schemas';

// --- Helpers ---

/** Build a valid request body that passes all validations */
function buildValidBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    sessionId: 'session-123',
    source: 'website_express',
    submissionRef: '550e8400-e29b-41d4-a716-446655440000',
    turnstileToken: 'valid-token',
    parentDetails: {
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane@example.com',
      telephone: '07700900000',
    },
    childDetails: {
      firstName: 'Tom',
      lastName: 'Doe',
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
      name: 'John Doe',
      relationship: 'Father',
      mobile: '07700900001',
      alternativePhone: '07700900002',
      email: 'john@example.com',
    },
    authorisedCollector: {
      name: 'Jane Doe',
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
    ...overrides,
  };
}

/** Create a Request object from a body */
function makeRequest(body: unknown): Request {
  const json = JSON.stringify(body);
  return new Request('http://localhost:3000/api/payments/create-guest-intent', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': String(Buffer.byteLength(json)),
      'x-forwarded-for': '127.0.0.1',
    },
    body: json,
  });
}

/** Build a future date string (7 days from now) */
function futureDateStr(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().split('T')[0];
}

// --- Arbitraries ---

const sessionStatusArbitrary = fc.constantFrom('open', 'closed', 'cancelled', 'full');

const spotsArbitrary = fc.integer({ min: -5, max: 20 });

/** Generate a session date that could be past or future */
const sessionDateArbitrary = fc.integer({ min: -365, max: 365 }).map((offset) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().split('T')[0];
});

const priceArbitrary = fc.integer({ min: 100, max: 50000 });

/** Arbitrary that generates consent objects with some mandatory consents potentially false */
const consentsArbitrary = fc.record({
  parentGuardianAuthority: fc.boolean(),
  accuracyOfInformation: fc.boolean(),
  healthSafetyDataProcessing: fc.boolean(),
  emergencyAssistanceAuthorisation: fc.boolean(),
  termsAndCancellationPolicy: fc.boolean(),
  privacyNoticeAcknowledgement: fc.boolean(),
  photographyPromotionalUse: fc.boolean(),
  emailMarketing: fc.boolean(),
  whatsappMarketing: fc.boolean(),
});

const mandatoryConsentKeys = [
  'parentGuardianAuthority',
  'accuracyOfInformation',
  'healthSafetyDataProcessing',
  'emergencyAssistanceAuthorisation',
  'termsAndCancellationPolicy',
  'privacyNoticeAcknowledgement',
] as const;

// --- Setup ---

beforeEach(() => {
  vi.clearAllMocks();
  process.env.STRIPE_SECRET_KEY = 'sk_test_123';
  process.env.NEXT_PUBLIC_GUEST_CHECKOUT_ENABLED = 'true';
});

// --- Property 2: Session Eligibility Gate ---
// **Validates: Requirements 2.1–2.5**

describe('Property 2: Session Eligibility Gate', () => {
  it('returns eligible (200) IFF status is open AND date is future AND spots > 0', async () => {
    await fc.assert(
      fc.asyncProperty(
        sessionStatusArbitrary,
        sessionDateArbitrary,
        spotsArbitrary,
        priceArbitrary,
        async (status, dateStr, spots, price) => {
          vi.clearAllMocks();

          // Determine if session should be eligible
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const sessionDate = new Date(dateStr);
          sessionDate.setHours(0, 0, 0, 0);
          const isFuture = sessionDate >= today;
          const isOpen = status === 'open';
          const hasSpots = spots > 0;
          const shouldBeEligible = isOpen && isFuture && hasSpots;

          // Mock Firestore session document
          mockGet.mockResolvedValue({
            exists: true,
            data: () => ({
              status,
              date: dateStr,
              spotsAvailable: spots,
              price,
              ageMin: 3,
              ageMax: 15,
            }),
          });

          // Mock Stripe (only matters if eligible)
          mockPaymentIntentsCreate.mockResolvedValue({
            id: 'pi_test_123',
            client_secret: 'cs_test_123',
          });
          mockPaymentIntentsUpdate.mockResolvedValue({});
          mockFirestoreDocSet.mockResolvedValue(undefined);

          const body = buildValidBody();
          const req = makeRequest(body);
          const res = await POST(req);
          const json = await res.json();

          if (shouldBeEligible) {
            expect(res.status).toBe(200);
            expect(json.clientSecret).toBeDefined();
          } else {
            expect(res.status).toBe(400);
            expect(json.error).toBeDefined();
          }
        }
      ),
      { numRuns: 80 }
    );
  });
});

// --- Property 3: Mandatory Consent Enforcement ---
// **Validates: Requirements 6.1, 6.3**

describe('Property 3: Mandatory Consent Enforcement', () => {
  it('rejects submission IFF any mandatory consent is false', async () => {
    await fc.assert(
      fc.asyncProperty(consentsArbitrary, async (consents) => {
        vi.clearAllMocks();

        const allMandatoryTrue = mandatoryConsentKeys.every(
          (key) => consents[key] === true
        );

        // Mock session as valid (open, future, spots available)
        mockGet.mockResolvedValue({
          exists: true,
          data: () => ({
            status: 'open',
            date: futureDateStr(),
            spotsAvailable: 5,
            price: 2500,
            ageMin: 3,
            ageMax: 15,
          }),
        });

        mockPaymentIntentsCreate.mockResolvedValue({
          id: 'pi_test_consent',
          client_secret: 'cs_test_consent',
        });
        mockPaymentIntentsUpdate.mockResolvedValue({});
        mockFirestoreDocSet.mockResolvedValue(undefined);

        const body = buildValidBody({ consents });
        const req = makeRequest(body);
        const res = await POST(req);

        if (allMandatoryTrue) {
          // Should succeed (200)
          expect(res.status).toBe(200);
        } else {
          // Should be rejected — either by Zod validation (400 VALIDATION_ERROR)
          // or by the mandatory consent check (400 CONSENT_MISSING)
          expect(res.status).toBe(400);
          const json = await res.json();
          expect(
            json.code === 'VALIDATION_ERROR' || json.code === 'CONSENT_MISSING'
          ).toBe(true);
        }
      }),
      { numRuns: 100 }
    );
  });
});

// --- Property 5: Server-Authoritative Price ---
// **Validates: Requirements 8.6**

describe('Property 5: Server-Authoritative Price', () => {
  it('PaymentIntent amount always equals Firestore session price regardless of client-supplied value', async () => {
    await fc.assert(
      fc.asyncProperty(
        priceArbitrary,
        fc.integer({ min: 1, max: 99999 }),
        async (firestorePrice, clientAttemptedPrice) => {
          vi.clearAllMocks();

          // Mock session with the Firestore price
          mockGet.mockResolvedValue({
            exists: true,
            data: () => ({
              status: 'open',
              date: futureDateStr(),
              spotsAvailable: 5,
              price: firestorePrice,
              ageMin: 3,
              ageMax: 15,
            }),
          });

          mockPaymentIntentsCreate.mockResolvedValue({
            id: 'pi_test_price',
            client_secret: 'cs_test_price',
          });
          mockPaymentIntentsUpdate.mockResolvedValue({});
          mockFirestoreDocSet.mockResolvedValue(undefined);

          // Client attempts to supply a different price via an extra field
          const body = buildValidBody({ amount: clientAttemptedPrice });
          const req = makeRequest(body);
          await POST(req);

          // Verify Stripe was called with the Firestore price, not the client price
          expect(mockPaymentIntentsCreate).toHaveBeenCalledTimes(1);
          const createCall = mockPaymentIntentsCreate.mock.calls[0][0];
          expect(createCall.amount).toBe(firestorePrice);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// --- Property 13: Zod Schema Validation Consistency ---
// **Validates: Requirements 8.3**

describe('Property 13: Zod Schema Validation Consistency', () => {
  /** Arbitrary for valid parent details */
  // Use a constrained email arbitrary that only produces emails Zod v4 accepts
  // Zod v4 pattern: /^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-\.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/
  const zodSafeEmailArb = fc
    .tuple(
      fc.stringMatching(/^[a-z][a-z0-9]{1,8}$/),
      fc.stringMatching(/^[a-z]{2,8}$/),
      fc.constantFrom('com', 'co.uk', 'org', 'net', 'io')
    )
    .map(([local, domain, tld]) => `${local}@${domain}.${tld}`);

  const validParentArb = fc.record({
    firstName: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
    lastName: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
    email: zodSafeEmailArb,
    telephone: fc.string({ minLength: 10, maxLength: 20 }).map((s) =>
      '0' + s.replace(/[^0-9]/g, '').slice(0, 14).padEnd(9, '0')
    ),
  });

  /** Arbitrary for valid child details */
  const validChildArb = fc.record({
    firstName: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
    lastName: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
    dateOfBirth: fc
      .record({
        year: fc.integer({ min: 2010, max: 2022 }),
        month: fc.integer({ min: 1, max: 12 }),
        day: fc.integer({ min: 1, max: 28 }),
      })
      .map(({ year, month, day }) =>
        `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      ),
  });

  /** Arbitrary for valid booking source */
  const validSourceArb = fc.constantFrom(
    'website',
    'website_express',
    'whatsapp_express',
    'facebook_express',
    'instagram_express',
    'qr_express',
    'google_express',
    'unknown'
  );

  it('schema accepts valid inputs consistently', () => {
    fc.assert(
      fc.property(validParentArb, validChildArb, validSourceArb, (parent, child, source) => {
        const body = {
          sessionId: 'session-abc',
          source,
          submissionRef: '550e8400-e29b-41d4-a716-446655440000',
          turnstileToken: 'token-abc',
          parentDetails: parent,
          childDetails: child,
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
            name: 'Contact',
            relationship: 'Uncle',
            mobile: '07700900001',
            alternativePhone: '07700900002',
            email: 'e@x.com',
          },
          authorisedCollector: {
            name: 'Collector',
            relationship: 'Aunt',
            phone: '07700900003',
            sameAsParent: false,
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

        const result = createGuestIntentSchema.safeParse(body);
        expect(result.success).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it('schema rejects invalid inputs consistently', () => {
    /** Generate bodies with various invalid fields */
    const invalidBodyArb = fc.oneof(
      // Missing sessionId
      fc.constant({ ...buildValidBody(), sessionId: '' }),
      // Invalid email
      fc.constant({
        ...buildValidBody(),
        parentDetails: { ...(buildValidBody().parentDetails as object), email: 'not-an-email' },
      }),
      // Invalid source enum value
      fc.constant({ ...buildValidBody(), source: 'invalid_source' }),
      // Invalid date of birth format
      fc.constant({
        ...buildValidBody(),
        childDetails: { firstName: 'Tom', lastName: 'Doe', dateOfBirth: '15-06-2017' },
      }),
      // Invalid submissionRef (not UUID)
      fc.constant({ ...buildValidBody(), submissionRef: 'not-a-uuid' }),
      // Missing turnstile token
      fc.constant({ ...buildValidBody(), turnstileToken: '' }),
      // telephone too short
      fc.constant({
        ...buildValidBody(),
        parentDetails: { firstName: 'J', lastName: 'D', email: 'a@b.com', telephone: '123' },
      })
    );

    fc.assert(
      fc.property(invalidBodyArb, (body) => {
        const result = createGuestIntentSchema.safeParse(body);
        expect(result.success).toBe(false);
      }),
      { numRuns: 50 }
    );
  });
});

// --- Property 14: Draft Failure Triggers PaymentIntent Cancellation ---
// **Validates: Requirements 8.11**

describe('Property 14: Draft Failure Triggers PaymentIntent Cancellation', () => {
  it('if draft write fails, PaymentIntent is cancelled', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 5, maxLength: 30 }).map(
          (s) => `pi_${s.replace(/[^a-zA-Z0-9]/g, 'x')}`
        ),
        async (piId) => {
          vi.clearAllMocks();

          // Mock session as valid
          mockGet.mockResolvedValue({
            exists: true,
            data: () => ({
              status: 'open',
              date: futureDateStr(),
              spotsAvailable: 5,
              price: 2500,
              ageMin: 3,
              ageMax: 15,
            }),
          });

          // Stripe creates PI successfully
          mockPaymentIntentsCreate.mockResolvedValue({
            id: piId,
            client_secret: `${piId}_secret_test`,
          });
          mockPaymentIntentsUpdate.mockResolvedValue({});

          // Draft save FAILS
          mockFirestoreDocSet.mockRejectedValue(new Error('Firestore write failed'));

          // Mock cancel to succeed
          mockPaymentIntentsCancel.mockResolvedValue({ id: piId, status: 'canceled' });

          const body = buildValidBody();
          const req = makeRequest(body);
          const res = await POST(req);

          // Should return 500
          expect(res.status).toBe(500);

          // PaymentIntent.cancel MUST have been called with the PI id
          expect(mockPaymentIntentsCancel).toHaveBeenCalledTimes(1);
          expect(mockPaymentIntentsCancel).toHaveBeenCalledWith(piId);
        }
      ),
      { numRuns: 50 }
    );
  });
});
