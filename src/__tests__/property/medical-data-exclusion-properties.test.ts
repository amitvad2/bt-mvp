// Feature: guest-express-checkout
// Property 6: Medical Data Exclusion Invariant
// Stripe metadata, API errors, confirmation page response, and URL params never contain medical/allergy/dietary data
// **Validates: Requirements 4.5, 8.13, 10.7, 23.1–23.5**

// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';

// --- Medical fields that MUST NEVER leak ---
const MEDICAL_FIELD_KEYS = [
  'foodAllergies',
  'dietaryRequirements',
  'airborneAllergies',
  'allergenDetails',
  'knownReactions',
  'symptoms',
  'epipenRequired',
  'epipenDetails',
  'medicationDetails',
  'respiratoryProblems',
  'medicalConditions',
  'recentOperations',
  'additionalSupportNeeds',
  'otherSafetyInfo',
] as const;

// --- Mocks for create-guest-intent ---

const mockGet = vi.fn();
const mockFirestoreDocSet = vi.fn();
const mockDoc = vi.fn();

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

// Import route handlers after mocks
import { POST } from '@/app/api/payments/create-guest-intent/route';
import { GET } from '@/app/api/guest-booking-status/route';

// --- Helpers ---

/** Build a future date string (7 days from now) */
function futureDateStr(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().split('T')[0];
}

/** Build a valid request body with custom medical data strings injected */
function buildBodyWithMedicalData(medicalStrings: {
  dietaryRequirements: string;
  allergenDetails: string;
  knownReactions: string;
  symptoms: string;
  epipenDetails: string;
  medicationDetails: string;
  medicalConditions: string;
  recentOperations: string;
  additionalSupportNeeds: string;
  otherSafetyInfo: string;
}): Record<string, unknown> {
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
      foodAllergies: true,
      dietaryRequirements: medicalStrings.dietaryRequirements,
      airborneAllergies: true,
      allergenDetails: medicalStrings.allergenDetails,
      knownReactions: medicalStrings.knownReactions,
      symptoms: medicalStrings.symptoms,
      epipenRequired: true,
      epipenDetails: medicalStrings.epipenDetails,
      medicationDetails: medicalStrings.medicationDetails,
      respiratoryProblems: true,
      medicalConditions: medicalStrings.medicalConditions,
      recentOperations: medicalStrings.recentOperations,
      visionImpairment: false,
      hearingImpairment: false,
      additionalSupportNeeds: medicalStrings.additionalSupportNeeds,
      otherSafetyInfo: medicalStrings.otherSafetyInfo,
    },
    allergyDietaryInfo: {
      foodAllergies: ['peanuts', 'shellfish'],
      dietaryRequirements: ['vegan'],
      airborneAllergies: ['pollen'],
      allergenDetails: medicalStrings.allergenDetails,
      reactionDetails: medicalStrings.knownReactions,
      symptoms: medicalStrings.symptoms,
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
  };
}

/** Create a POST Request object from a body */
function makePostRequest(body: unknown): Request {
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

/** Create a GET Request for guest-booking-status */
function makeGetRequest(pi: string, session: string): Request {
  return new Request(
    `http://localhost:3000/api/guest-booking-status?pi=${pi}&session=${session}`,
    {
      method: 'GET',
      headers: {
        'x-forwarded-for': '127.0.0.1',
      },
    }
  );
}

/**
 * Check that a string does NOT contain any of the given medical data values.
 * Only checks non-empty strings (empty strings would match everything).
 */
function assertNoMedicalDataInString(
  text: string,
  medicalValues: string[]
): void {
  for (const val of medicalValues) {
    if (val && val.trim().length > 0) {
      expect(text).not.toContain(val);
    }
  }
}

// --- Arbitraries ---

/**
 * Safe response field values that medical strings must NOT be substrings of.
 * This prevents false positives where a generated medical string like "ref"
 * accidentally matches "reference" in the API response.
 */
const SAFE_RESPONSE_TOKENS = [
  'confirmed', 'pending', 'reference', 'childFirstName', 'className',
  'date', 'startTime', 'endTime', 'venueName', 'amountPaid', 'status',
  'Tom', 'After School Cooking', 'Community Hall', '2025', '15:30', '16:30',
  'error', 'code', 'fieldErrors', 'path', 'message',
  'SESSION_NOT_FOUND', 'VALIDATION_ERROR', 'CONSENT_MISSING',
];

/**
 * Generate non-empty medical strings that are identifiable and unique enough
 * to not accidentally appear as substrings of safe API response fields.
 * Uses a prefix "MED_" to ensure medical values are distinctive.
 */
const medicalStringArb = fc
  .stringMatching(/^[a-zA-Z]{4,20}$/)
  .map((s) => `MED_${s}_DATA`)
  .filter((s) => {
    // Ensure the medical string isn't a substring of any safe response token
    const lower = s.toLowerCase();
    return !SAFE_RESPONSE_TOKENS.some(
      (token) => token.toLowerCase().includes(lower) || lower.includes(token.toLowerCase())
    );
  });

/** Generate a set of random medical data fields */
const medicalDataArb = fc.record({
  dietaryRequirements: medicalStringArb,
  allergenDetails: medicalStringArb,
  knownReactions: medicalStringArb,
  symptoms: medicalStringArb,
  epipenDetails: medicalStringArb,
  medicationDetails: medicalStringArb,
  medicalConditions: medicalStringArb,
  recentOperations: medicalStringArb,
  additionalSupportNeeds: medicalStringArb,
  otherSafetyInfo: medicalStringArb,
});

// --- Setup ---

beforeEach(() => {
  vi.clearAllMocks();
  process.env.STRIPE_SECRET_KEY = 'sk_test_123';
  process.env.NEXT_PUBLIC_GUEST_CHECKOUT_ENABLED = 'true';
});

// --- Property 6: Medical Data Exclusion Invariant ---

describe('Property 6: Medical Data Exclusion Invariant', () => {
  describe('Stripe PaymentIntent metadata never contains medical data', () => {
    it('metadata passed to stripe.paymentIntents.create contains none of the medical values', async () => {
      await fc.assert(
        fc.asyncProperty(medicalDataArb, async (medicalData) => {
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

          mockPaymentIntentsCreate.mockResolvedValue({
            id: 'pi_test_medical_excl',
            client_secret: 'cs_test_medical_excl',
          });
          mockPaymentIntentsUpdate.mockResolvedValue({});
          mockFirestoreDocSet.mockResolvedValue(undefined);

          const body = buildBodyWithMedicalData(medicalData);
          const req = makePostRequest(body);
          const res = await POST(req);

          // Should succeed
          expect(res.status).toBe(200);

          // Verify Stripe PaymentIntent.create was called
          expect(mockPaymentIntentsCreate).toHaveBeenCalledTimes(1);
          const createArgs = mockPaymentIntentsCreate.mock.calls[0][0];
          const metadataStr = JSON.stringify(createArgs.metadata);

          // None of the medical string values should appear in metadata
          const medicalValues = Object.values(medicalData);
          assertNoMedicalDataInString(metadataStr, medicalValues);

          // Also verify update call metadata
          if (mockPaymentIntentsUpdate.mock.calls.length > 0) {
            const updateArgs = mockPaymentIntentsUpdate.mock.calls[0][1] ?? mockPaymentIntentsUpdate.mock.calls[0][0];
            const updateMetadataStr = JSON.stringify(updateArgs);
            assertNoMedicalDataInString(updateMetadataStr, medicalValues);
          }

          // Verify metadata keys do not contain medical field names
          const metadataKeys = Object.keys(createArgs.metadata || {});
          for (const key of MEDICAL_FIELD_KEYS) {
            expect(metadataKeys).not.toContain(key);
          }
        }),
        { numRuns: 50 }
      );
    });
  });

  describe('API error responses never contain medical data', () => {
    it('validation error responses do not echo back medical field values', async () => {
      await fc.assert(
        fc.asyncProperty(medicalDataArb, async (medicalData) => {
          vi.clearAllMocks();

          // Mock session as valid but make validation fail by using an invalid sessionId
          mockGet.mockResolvedValue({
            exists: false, // Session not found → triggers 400
            data: () => null,
          });

          const body = buildBodyWithMedicalData(medicalData);
          const req = makePostRequest(body);
          const res = await POST(req);

          // Should fail with 400 (session not found)
          expect(res.status).toBe(400);

          const json = await res.json();
          const responseStr = JSON.stringify(json);

          // Medical data should NEVER appear in error responses
          const medicalValues = Object.values(medicalData);
          assertNoMedicalDataInString(responseStr, medicalValues);
        }),
        { numRuns: 50 }
      );
    });

    it('Zod validation errors do not include medical field values in error messages', async () => {
      await fc.assert(
        fc.asyncProperty(medicalDataArb, async (medicalData) => {
          vi.clearAllMocks();

          // Build body with invalid consent (missing mandatory consent) to trigger validation error
          // but still include medical data
          const body = {
            ...buildBodyWithMedicalData(medicalData),
            // Make consents invalid to trigger Zod validation error
            consents: {
              parentGuardianAuthority: false, // This will trigger Zod rejection (expects literal true)
              accuracyOfInformation: true,
              healthSafetyDataProcessing: true,
              emergencyAssistanceAuthorisation: true,
              termsAndCancellationPolicy: true,
              privacyNoticeAcknowledgement: true,
              photographyPromotionalUse: false,
              emailMarketing: false,
              whatsappMarketing: false,
            },
          };

          // Mock session as valid (so we get past session lookup to Zod validation)
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

          const req = makePostRequest(body);
          const res = await POST(req);

          // Should fail with 400 (validation error or consent missing)
          expect(res.status).toBe(400);

          const json = await res.json();
          const responseStr = JSON.stringify(json);

          // Medical data should NEVER appear in error responses
          const medicalValues = Object.values(medicalData);
          assertNoMedicalDataInString(responseStr, medicalValues);
        }),
        { numRuns: 50 }
      );
    });
  });

  describe('Guest booking status API response never contains medical data', () => {
    it('/api/guest-booking-status response contains no medical data from the booking', async () => {
      await fc.assert(
        fc.asyncProperty(medicalDataArb, async (medicalData) => {
          vi.clearAllMocks();

          // Mock a booking document that contains medical data (as stored in Firestore)
          const bookingData = {
            sessionId: 'session-123',
            bookingMode: 'guest',
            className: 'After School Cooking',
            sessionDate: '2025-02-15',
            startTime: '15:30',
            endTime: '16:30',
            venueName: 'Community Hall',
            studentName: 'Tom Doe',
            childSnapshot: {
              firstName: 'Tom',
              lastName: 'Doe',
              dateOfBirth: '2017-06-15',
            },
            sessionSnapshot: {
              className: 'After School Cooking',
              date: '2025-02-15',
              startTime: '15:30',
              endTime: '16:30',
              venueName: 'Community Hall',
            },
            // Medical data IS stored in the booking (admin needs access)
            medicalSnapshot: {
              foodAllergies: true,
              dietaryRequirements: medicalData.dietaryRequirements,
              airborneAllergies: true,
              allergenDetails: medicalData.allergenDetails,
              knownReactions: medicalData.knownReactions,
              symptoms: medicalData.symptoms,
              epipenRequired: true,
              epipenDetails: medicalData.epipenDetails,
              medicationDetails: medicalData.medicationDetails,
              respiratoryProblems: true,
              medicalConditions: medicalData.medicalConditions,
              recentOperations: medicalData.recentOperations,
              additionalSupportNeeds: medicalData.additionalSupportNeeds,
              otherSafetyInfo: medicalData.otherSafetyInfo,
            },
            allergyDietarySnapshot: {
              foodAllergies: ['peanuts'],
              dietaryRequirements: ['vegan'],
              airborneAllergies: ['pollen'],
              allergenDetails: medicalData.allergenDetails,
              reactionDetails: medicalData.knownReactions,
              symptoms: medicalData.symptoms,
            },
            payment: {
              stripePaymentIntentId: 'pi_test_status_check',
              amount: 2500,
              currency: 'gbp',
              status: 'paid',
            },
          };

          // Mock Firestore to return this booking
          mockGet.mockResolvedValue({
            exists: true,
            data: () => bookingData,
          });

          const req = makeGetRequest('pi_test_status_check', 'session-123');
          const res = await GET(req);

          expect(res.status).toBe(200);

          const json = await res.json();
          const responseStr = JSON.stringify(json);

          // Medical data should NEVER appear in the status API response
          const medicalValues = Object.values(medicalData);
          assertNoMedicalDataInString(responseStr, medicalValues);

          // Verify specific medical field keys are NOT present in response
          for (const key of MEDICAL_FIELD_KEYS) {
            expect(responseStr).not.toContain(`"${key}"`);
          }

          // Verify the response only contains the expected safe fields
          expect(json.status).toBe('confirmed');
          expect(json).toHaveProperty('reference');
          expect(json).toHaveProperty('childFirstName');
          expect(json).toHaveProperty('className');
          expect(json).toHaveProperty('date');
          expect(json).toHaveProperty('startTime');
          expect(json).toHaveProperty('endTime');
          expect(json).toHaveProperty('venueName');
          expect(json).toHaveProperty('amountPaid');
        }),
        { numRuns: 50 }
      );
    });
  });
});
