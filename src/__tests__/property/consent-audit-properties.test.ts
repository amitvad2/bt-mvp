// Feature: guest-express-checkout
// Property 4: Consent Audit Round-Trip
// **Validates: Requirements 6.5, 20.1–20.7**

// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';

// --- Mocks ---

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

// Import the POST handler after mocks are set up
import { POST } from '@/app/api/payments/create-guest-intent/route';

// --- Helpers ---

/** Build a future date string (7 days from now) */
function futureDateStr(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().split('T')[0];
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

// --- Arbitraries ---

/** Generate a valid first/last name (alphabetic, 1-50 chars) */
const nameArbitrary = fc.stringMatching(/^[A-Za-z][A-Za-z '-]{0,49}$/).filter((s) => s.length >= 1);

/** Generate valid email addresses */
const emailArbitrary = fc
  .tuple(
    fc.stringMatching(/^[a-z][a-z0-9]{1,10}$/),
    fc.stringMatching(/^[a-z]{2,8}$/),
    fc.constantFrom('com', 'co.uk', 'org', 'net', 'io')
  )
  .map(([user, domain, tld]) => `${user}@${domain}.${tld}`);

/** Generate valid UK phone numbers (10-20 digits) */
const phoneArbitrary = fc
  .stringMatching(/^[0-9]{9,19}$/)
  .map((digits) => '0' + digits.slice(0, 10));

/** Generate random booking source values */
const sourceArbitrary = fc.constantFrom(
  'website' as const,
  'website_express' as const,
  'whatsapp_express' as const,
  'facebook_express' as const,
  'instagram_express' as const,
  'qr_express' as const,
  'google_express' as const,
  'unknown' as const
);

/** Generate random version strings (e.g., "1.0", "2.3", "10.5") */
const versionArbitrary = fc
  .tuple(fc.integer({ min: 1, max: 99 }), fc.integer({ min: 0, max: 9 }))
  .map(([major, minor]) => `${major}.${minor}`);

/** Generate consent records with all mandatory set to true, optional random */
const validConsentsArbitrary = fc.record({
  parentGuardianAuthority: fc.constant(true),
  accuracyOfInformation: fc.constant(true),
  healthSafetyDataProcessing: fc.constant(true),
  emergencyAssistanceAuthorisation: fc.constant(true),
  termsAndCancellationPolicy: fc.constant(true),
  privacyNoticeAcknowledgement: fc.constant(true),
  photographyPromotionalUse: fc.boolean(),
  emailMarketing: fc.boolean(),
  whatsappMarketing: fc.boolean(),
});

/** Generate parent details with random names */
const parentDetailsArbitrary = fc.record({
  firstName: nameArbitrary,
  lastName: nameArbitrary,
  email: emailArbitrary,
  telephone: phoneArbitrary,
});

// --- Setup ---

beforeEach(() => {
  vi.clearAllMocks();
  process.env.STRIPE_SECRET_KEY = 'sk_test_123';
  process.env.NEXT_PUBLIC_GUEST_CHECKOUT_ENABLED = 'true';
});

// --- Property 4: Consent Audit Round-Trip ---

describe('Property 4: Consent Audit Round-Trip', () => {
  it('consentAudit in draft contains each consent value, acceptedAt, acceptedBy (parent full name), termsVersion, privacyNoticeVersion, sourceChannel, submissionTimestamp', async () => {
    await fc.assert(
      fc.asyncProperty(
        validConsentsArbitrary,
        parentDetailsArbitrary,
        versionArbitrary,
        versionArbitrary,
        sourceArbitrary,
        async (consents, parentDetails, termsVersion, privacyNoticeVersion, source) => {
          vi.clearAllMocks();

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

          // Mock Stripe PaymentIntent creation
          mockPaymentIntentsCreate.mockResolvedValue({
            id: 'pi_test_consent_audit',
            client_secret: 'cs_test_consent_audit',
          });
          mockPaymentIntentsUpdate.mockResolvedValue({});
          mockFirestoreDocSet.mockResolvedValue(undefined);

          const body = {
            sessionId: 'session-123',
            source,
            submissionRef: '550e8400-e29b-41d4-a716-446655440000',
            turnstileToken: 'valid-token',
            parentDetails,
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
            consents,
            termsVersion,
            privacyNoticeVersion,
          };

          const req = makeRequest(body);
          const res = await POST(req);

          // Ensure the request succeeded (200)
          expect(res.status).toBe(200);

          // Capture the draft data written to Firestore
          expect(mockFirestoreDocSet).toHaveBeenCalledTimes(1);
          const draftData = mockFirestoreDocSet.mock.calls[0][0];
          const consentAudit = draftData.consentAudit;

          // 1. consentAudit.consents matches each submitted consent value
          expect(consentAudit.consents).toEqual(consents);

          // 2. acceptedBy equals parent full name
          expect(consentAudit.acceptedBy).toBe(
            `${parentDetails.firstName} ${parentDetails.lastName}`
          );

          // 3. termsVersion matches submitted termsVersion
          expect(consentAudit.termsVersion).toBe(termsVersion);

          // 4. privacyNoticeVersion matches submitted privacyNoticeVersion
          expect(consentAudit.privacyNoticeVersion).toBe(privacyNoticeVersion);

          // 5. sourceChannel matches submitted source
          expect(consentAudit.sourceChannel).toBe(source);

          // 6. acceptedAt is set (serverTimestamp marker)
          expect(consentAudit.acceptedAt).toBe('SERVER_TIMESTAMP');

          // 7. submissionTimestamp is set (serverTimestamp marker)
          expect(consentAudit.submissionTimestamp).toBe('SERVER_TIMESTAMP');
        }
      ),
      { numRuns: 100 }
    );
  });
});
