// Feature: guest-express-checkout
// Property 11: Confirmation Response Non-Sensitivity
// **Validates: Requirements 10.6, 25.1–25.4**

// @vitest-environment node

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// --- Allowed fields in the confirmation response ---

const ALLOWED_RESPONSE_FIELDS = new Set([
  'status',
  'reference',
  'childFirstName',
  'className',
  'date',
  'startTime',
  'endTime',
  'venueName',
  'amountPaid',
]);

// --- Sensitive field names that must NEVER appear as keys in the response ---

const SENSITIVE_KEY_PATTERNS = [
  'medicalConditions', 'medicalSnapshot', 'medicalInfo',
  'epipen', 'epipenRequired', 'epipenDetails', 'medicationDetails',
  'respiratoryProblems', 'visionImpairment', 'hearingImpairment',
  'additionalSupportNeeds', 'otherSafetyInfo', 'recentOperations',
  'allergyDietarySnapshot', 'allergyDietaryInfo',
  'foodAllergies', 'airborneAllergies', 'allergenDetails',
  'dietaryRequirements', 'knownReactions', 'symptoms',
  'emergencyContact', 'emergencyContactSnapshot',
  'alternativePhone', 'relationship',
  'authorisedCollector', 'authorisedCollectorSnapshot', 'sameAsParent',
  'stripePaymentIntentId', 'paymentIntentId',
  'email', 'telephone', 'phone',
  'lastName',
  'consentAudit', 'consents',
  'guestContact', 'parentDetails',
  'bookedByUid', 'sessionId',
];

// --- Arbitraries ---

/** Valid ISO date string arbitrary (avoids Invalid Date issue with fc.date) */
const validIsoDateStringArbitrary = fc.integer({
  min: new Date(2020, 0, 1).getTime(),
  max: new Date(2030, 11, 31).getTime(),
}).map((ts) => new Date(ts).toISOString());

/**
 * Generate uniquely-prefixed strings for sensitive data to avoid false positives.
 * By using distinguishable prefixes, we can reliably detect leakage.
 */
const sensitiveStringArb = (prefix: string) =>
  fc.string({ minLength: 5, maxLength: 30 }).map((s) => `${prefix}_${s}`);

/** Generate random guest parent details with identifiable sensitive values */
const guestContactArbitrary = fc.record({
  firstName: fc.string({ minLength: 1, maxLength: 50 }),
  lastName: sensitiveStringArb('PLASTNAME'),
  email: fc.tuple(
    fc.string({ minLength: 3, maxLength: 10 }).filter((s) => /^[a-z]+$/.test(s)),
    fc.constantFrom('testdomain.co.uk', 'example.org', 'mail.test')
  ).map(([user, domain]) => `PEMAIL_${user}@${domain}`),
  telephone: fc.string({ minLength: 10, maxLength: 15 }).map((s) => `PTEL${s.replace(/[^0-9]/g, '').slice(0, 11)}`),
});

/** Generate random child details with identifiable sensitive values */
const childDetailsArbitrary = fc.record({
  firstName: fc.string({ minLength: 1, maxLength: 50 }),
  lastName: sensitiveStringArb('CLASTNAME'),
  dateOfBirth: fc.integer({
    min: new Date(2012, 0, 1).getTime(),
    max: new Date(2020, 11, 31).getTime(),
  }).map((ts) => {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }),
});

/** Generate random medical info */
const medicalInfoArbitrary = fc.record({
  foodAllergies: fc.boolean(),
  dietaryRequirements: sensitiveStringArb('MEDDIETARY'),
  airborneAllergies: fc.boolean(),
  allergenDetails: sensitiveStringArb('MEDALLERGEN'),
  knownReactions: sensitiveStringArb('MEDREACTION'),
  symptoms: sensitiveStringArb('MEDSYMPTOM'),
  epipenRequired: fc.boolean(),
  epipenDetails: sensitiveStringArb('MEDEPIPEN'),
  medicationDetails: sensitiveStringArb('MEDMEDS'),
  respiratoryProblems: fc.boolean(),
  medicalConditions: sensitiveStringArb('MEDCOND'),
  recentOperations: sensitiveStringArb('MEDOPS'),
  visionImpairment: fc.boolean(),
  hearingImpairment: fc.boolean(),
  additionalSupportNeeds: sensitiveStringArb('MEDSUPPORT'),
  otherSafetyInfo: sensitiveStringArb('MEDSAFETY'),
});

/** Generate random allergy/dietary info */
const allergyDietaryInfoArbitrary = fc.record({
  foodAllergies: fc.array(sensitiveStringArb('ALLERGYFA'), { minLength: 1, maxLength: 3 }),
  dietaryRequirements: fc.array(sensitiveStringArb('ALLERGYDR'), { minLength: 1, maxLength: 3 }),
  airborneAllergies: fc.array(sensitiveStringArb('ALLERGYAB'), { minLength: 1, maxLength: 3 }),
  allergenDetails: sensitiveStringArb('ALLERGYDET'),
  reactionDetails: sensitiveStringArb('ALLERGYREACT'),
  symptoms: sensitiveStringArb('ALLERGYSYMP'),
});

/** Generate random emergency contact with identifiable values */
const emergencyContactArbitrary = fc.record({
  name: sensitiveStringArb('EMNAME'),
  relationship: sensitiveStringArb('EMREL'),
  mobile: fc.string({ minLength: 10, maxLength: 15 }).map((s) => `EMMOB${s.replace(/[^0-9]/g, '').slice(0, 11)}`),
  alternativePhone: fc.string({ minLength: 5, maxLength: 15 }).map((s) => `EMALT${s.replace(/[^0-9]/g, '').slice(0, 11)}`),
  email: fc.tuple(
    fc.string({ minLength: 3, maxLength: 10 }).filter((s) => /^[a-z]+$/.test(s)),
    fc.constantFrom('emergency.test', 'emcontact.org')
  ).map(([user, domain]) => `EMEMAIL_${user}@${domain}`),
});

/** Generate random authorised collector */
const authorisedCollectorArbitrary = fc.record({
  name: sensitiveStringArb('ACNAME'),
  relationship: sensitiveStringArb('ACREL'),
  phone: fc.string({ minLength: 10, maxLength: 15 }).map((s) => `ACPH${s.replace(/[^0-9]/g, '').slice(0, 11)}`),
  sameAsParent: fc.boolean(),
});

/** Generate random consent record */
const consentAuditArbitrary = fc.record({
  consents: fc.record({
    parentGuardianAuthority: fc.constant(true as const),
    accuracyOfInformation: fc.constant(true as const),
    healthSafetyDataProcessing: fc.constant(true as const),
    emergencyAssistanceAuthorisation: fc.constant(true as const),
    termsAndCancellationPolicy: fc.constant(true as const),
    privacyNoticeAcknowledgement: fc.constant(true as const),
    photographyPromotionalUse: fc.boolean(),
    emailMarketing: fc.boolean(),
    whatsappMarketing: fc.boolean(),
  }),
  acceptedAt: validIsoDateStringArbitrary,
  acceptedBy: fc.string({ minLength: 2, maxLength: 50 }),
  termsVersion: fc.string({ minLength: 1, maxLength: 10 }),
  privacyNoticeVersion: fc.string({ minLength: 1, maxLength: 10 }),
  sourceChannel: fc.constantFrom(
    'website', 'website_express', 'whatsapp_express',
    'facebook_express', 'instagram_express', 'qr_express',
    'google_express', 'unknown'
  ),
  submissionTimestamp: validIsoDateStringArbitrary,
});

/** Generate session snapshot (these are non-sensitive — they appear in the response) */
const sessionSnapshotArbitrary = fc.record({
  className: fc.string({ minLength: 1, maxLength: 50 }),
  classType: fc.constantFrom('kidsAfterSchool', 'youngAdultWeekend'),
  date: fc.integer({
    min: new Date(2024, 0, 1).getTime(),
    max: new Date(2026, 11, 31).getTime(),
  }).map((ts) => {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }),
  startTime: fc.constantFrom('15:30', '10:30', '14:00', '09:00'),
  endTime: fc.constantFrom('16:30', '12:30', '15:00', '10:00'),
  venueName: fc.string({ minLength: 1, maxLength: 50 }),
  ageMin: fc.integer({ min: 3, max: 8 }),
  ageMax: fc.integer({ min: 8, max: 18 }),
  price: fc.integer({ min: 500, max: 5000 }),
  spotsAvailable: fc.integer({ min: 0, max: 20 }),
  status: fc.constantFrom('open', 'closed', 'cancelled', 'full'),
});

/** Generate a full guest booking document (as stored in Firestore) */
const guestBookingArbitrary = fc.record({
  id: fc.string({ minLength: 10, maxLength: 30 }).map((s) => `pi_${s}`),
  bookingMode: fc.constant('guest' as const),
  bookingSource: fc.constantFrom(
    'website', 'website_express', 'whatsapp_express',
    'facebook_express', 'instagram_express', 'qr_express',
    'google_express', 'unknown'
  ),
  sessionId: fc.string({ minLength: 5, maxLength: 30 }),
  status: fc.constant('confirmed' as const),
  guestContact: guestContactArbitrary,
  childSnapshot: childDetailsArbitrary,
  medicalSnapshot: medicalInfoArbitrary,
  allergyDietarySnapshot: allergyDietaryInfoArbitrary,
  emergencyContactSnapshot: emergencyContactArbitrary,
  authorisedCollectorSnapshot: authorisedCollectorArbitrary,
  consentAudit: consentAuditArbitrary,
  sessionSnapshot: sessionSnapshotArbitrary,
  safetyReviewStatus: fc.constantFrom('not_required', 'pending', 'reviewed', 'contact_parent'),
  payment: fc.record({
    stripePaymentIntentId: fc.string({ minLength: 10, maxLength: 30 }).map((s) => `pi_${s}`),
    amount: fc.integer({ min: 500, max: 5000 }),
    currency: fc.constant('gbp'),
    status: fc.constant('paid' as const),
    receiptUrl: fc.option(fc.constant('https://receipt.stripe.com/test'), { nil: undefined }),
  }),
});

// --- Pure function replicating the guest-booking-status endpoint response logic ---

/**
 * Mirrors the response construction in src/app/api/guest-booking-status/route.ts
 * This is the function under test — it builds the confirmation response
 * from the full booking document, including ONLY allowed fields.
 */
function buildConfirmationResponse(booking: Record<string, any>, piParam: string) {
  return {
    status: 'confirmed',
    reference: piParam.slice(-8),
    childFirstName: booking.childSnapshot?.firstName ?? booking.studentName ?? '',
    className: booking.className ?? booking.sessionSnapshot?.className ?? '',
    date: booking.sessionDate ?? booking.sessionSnapshot?.date ?? '',
    startTime: booking.startTime ?? booking.sessionSnapshot?.startTime ?? '',
    endTime: booking.endTime ?? booking.sessionSnapshot?.endTime ?? '',
    venueName: booking.venueName ?? booking.sessionSnapshot?.venueName ?? '',
    amountPaid: booking.payment?.amount ?? 0,
  };
}

// --- Property 11: Confirmation Response Non-Sensitivity ---

describe('Property 11: Confirmation Response Non-Sensitivity', () => {
  it('response contains ONLY allowed fields and never leaks sensitive data', () => {
    fc.assert(
      fc.property(guestBookingArbitrary, (booking) => {
        const piParam = booking.id;
        const response = buildConfirmationResponse(booking, piParam);

        // 1. Verify response contains ONLY allowed fields
        const responseKeys = Object.keys(response);
        for (const key of responseKeys) {
          expect(ALLOWED_RESPONSE_FIELDS.has(key)).toBe(true);
        }

        // 2. Verify all allowed fields ARE present
        for (const allowedField of ALLOWED_RESPONSE_FIELDS) {
          expect(response).toHaveProperty(allowedField);
        }

        // 3. Verify response field count matches exactly the allowed set
        expect(responseKeys.length).toBe(ALLOWED_RESPONSE_FIELDS.size);
      }),
      { numRuns: 500 }
    );
  });

  it('response never contains sensitive field names as keys', () => {
    fc.assert(
      fc.property(guestBookingArbitrary, (booking) => {
        const piParam = booking.id;
        const response = buildConfirmationResponse(booking, piParam);

        // Check that no sensitive field patterns appear as keys in the response
        const responseKeys = new Set(Object.keys(response));
        for (const sensitiveKey of SENSITIVE_KEY_PATTERNS) {
          expect(responseKeys.has(sensitiveKey)).toBe(false);
        }
      }),
      { numRuns: 500 }
    );
  });

  it('reference is always exactly 8 characters (last 8 of PI ID)', () => {
    fc.assert(
      fc.property(guestBookingArbitrary, (booking) => {
        const piParam = booking.id;
        const response = buildConfirmationResponse(booking, piParam);

        expect(response.reference).toHaveLength(8);
        expect(response.reference).toBe(piParam.slice(-8));
      }),
      { numRuns: 500 }
    );
  });

  it('response never contains the full PaymentIntent ID', () => {
    fc.assert(
      fc.property(guestBookingArbitrary, (booking) => {
        const piParam = booking.id;
        const response = buildConfirmationResponse(booking, piParam);

        const responseJson = JSON.stringify(response);

        // Full PI ID (>8 chars due to pi_ prefix + 10 min chars) should NOT appear
        expect(responseJson).not.toContain(piParam);
      }),
      { numRuns: 500 }
    );
  });

  it('response never contains parent email address', () => {
    fc.assert(
      fc.property(guestBookingArbitrary, (booking) => {
        const piParam = booking.id;
        const response = buildConfirmationResponse(booking, piParam);

        const responseJson = JSON.stringify(response);
        const parentEmail = booking.guestContact.email;

        // Parent email (prefixed with PEMAIL_) should never appear in response
        expect(responseJson).not.toContain(parentEmail);
      }),
      { numRuns: 500 }
    );
  });

  it('response never contains parent telephone number', () => {
    fc.assert(
      fc.property(guestBookingArbitrary, (booking) => {
        const piParam = booking.id;
        const response = buildConfirmationResponse(booking, piParam);

        const responseJson = JSON.stringify(response);
        const parentPhone = booking.guestContact.telephone;

        // Parent telephone (prefixed with PTEL) should never appear in response
        expect(responseJson).not.toContain(parentPhone);
      }),
      { numRuns: 500 }
    );
  });

  it('response never contains child last name', () => {
    fc.assert(
      fc.property(guestBookingArbitrary, (booking) => {
        const piParam = booking.id;
        const response = buildConfirmationResponse(booking, piParam);

        const responseJson = JSON.stringify(response);
        const childLastName = booking.childSnapshot.lastName;

        // Child last name (prefixed with CLASTNAME_) should never appear
        expect(responseJson).not.toContain(childLastName);
      }),
      { numRuns: 500 }
    );
  });

  it('response never contains medical data values', () => {
    fc.assert(
      fc.property(guestBookingArbitrary, (booking) => {
        const piParam = booking.id;
        const response = buildConfirmationResponse(booking, piParam);

        const responseJson = JSON.stringify(response);
        const medical = booking.medicalSnapshot;

        // Check that identifiable medical text fields (prefixed with MED*) do NOT appear
        const medicalTextFields = [
          medical.allergenDetails,
          medical.knownReactions,
          medical.symptoms,
          medical.epipenDetails,
          medical.medicationDetails,
          medical.medicalConditions,
          medical.recentOperations,
          medical.additionalSupportNeeds,
          medical.otherSafetyInfo,
          medical.dietaryRequirements,
        ];

        for (const value of medicalTextFields) {
          expect(responseJson).not.toContain(value);
        }
      }),
      { numRuns: 500 }
    );
  });

  it('response never contains emergency contact data', () => {
    fc.assert(
      fc.property(guestBookingArbitrary, (booking) => {
        const piParam = booking.id;
        const response = buildConfirmationResponse(booking, piParam);

        const responseJson = JSON.stringify(response);
        const emergency = booking.emergencyContactSnapshot;

        // Emergency contact fields (prefixed with EM*) should never appear
        expect(responseJson).not.toContain(emergency.name);
        expect(responseJson).not.toContain(emergency.mobile);
        expect(responseJson).not.toContain(emergency.alternativePhone);
        expect(responseJson).not.toContain(emergency.email);
      }),
      { numRuns: 500 }
    );
  });

  it('response values are only primitives (string or number), never objects or arrays', () => {
    fc.assert(
      fc.property(guestBookingArbitrary, (booking) => {
        const piParam = booking.id;
        const response = buildConfirmationResponse(booking, piParam);

        for (const value of Object.values(response)) {
          const valueType = typeof value;
          expect(
            valueType === 'string' || valueType === 'number'
          ).toBe(true);
        }
      }),
      { numRuns: 500 }
    );
  });
});
