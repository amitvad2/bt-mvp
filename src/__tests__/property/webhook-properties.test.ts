// Feature: guest-express-checkout
// Property 7: Guest Booking Data Completeness
// Property 8: Safety Review Status Classification
// Property 9: Webhook Idempotency
// **Validates: Requirements 9.3–9.9, 13.1, 13.2, 18.1–18.12, 21.4, 21.5**

// @vitest-environment node

import { describe, it, expect, vi } from 'vitest';
import * as fc from 'fast-check';
import { determineSafetyReviewStatus } from '@/lib/guest-validation';

// --- Arbitraries ---

/** Generate random guest parent details */
const guestContactArbitrary = fc.record({
  firstName: fc.string({ minLength: 1, maxLength: 50 }),
  lastName: fc.string({ minLength: 1, maxLength: 50 }),
  email: fc.emailAddress(),
  telephone: fc.string({ minLength: 10, maxLength: 20 }),
});

/** Generate random child details */
const childDetailsArbitrary = fc.record({
  firstName: fc.string({ minLength: 1, maxLength: 50 }),
  lastName: fc.string({ minLength: 1, maxLength: 50 }),
  dateOfBirth: fc.date({ min: new Date(2010, 0, 1), max: new Date(2020, 11, 31) }).map(
    (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  ),
});

/** Generate random medical info with boolean flags and string fields */
const medicalInfoArbitrary = fc.record({
  foodAllergies: fc.boolean(),
  dietaryRequirements: fc.string({ maxLength: 100 }),
  airborneAllergies: fc.boolean(),
  allergenDetails: fc.string({ maxLength: 100 }),
  knownReactions: fc.string({ maxLength: 100 }),
  symptoms: fc.string({ maxLength: 100 }),
  epipenRequired: fc.boolean(),
  epipenDetails: fc.string({ maxLength: 100 }),
  medicationDetails: fc.string({ maxLength: 100 }),
  respiratoryProblems: fc.boolean(),
  medicalConditions: fc.string({ maxLength: 100 }),
  recentOperations: fc.string({ maxLength: 100 }),
  visionImpairment: fc.boolean(),
  hearingImpairment: fc.boolean(),
  additionalSupportNeeds: fc.string({ maxLength: 100 }),
  otherSafetyInfo: fc.string({ maxLength: 100 }),
});

/** Generate random allergy/dietary info */
const allergyDietaryInfoArbitrary = fc.record({
  foodAllergies: fc.array(fc.string({ minLength: 1, maxLength: 30 }), { maxLength: 5 }),
  dietaryRequirements: fc.array(fc.string({ minLength: 1, maxLength: 30 }), { maxLength: 5 }),
  airborneAllergies: fc.array(fc.string({ minLength: 1, maxLength: 30 }), { maxLength: 5 }),
  allergenDetails: fc.string({ maxLength: 100 }),
  reactionDetails: fc.string({ maxLength: 100 }),
  symptoms: fc.string({ maxLength: 100 }),
});

/** Generate random emergency contact */
const emergencyContactArbitrary = fc.record({
  name: fc.string({ minLength: 1, maxLength: 50 }),
  relationship: fc.string({ minLength: 1, maxLength: 30 }),
  mobile: fc.string({ minLength: 10, maxLength: 20 }),
  alternativePhone: fc.string({ maxLength: 20 }),
  email: fc.emailAddress(),
});

/** Generate random authorised collector */
const authorisedCollectorArbitrary = fc.record({
  name: fc.string({ minLength: 1, maxLength: 50 }),
  relationship: fc.string({ minLength: 1, maxLength: 30 }),
  phone: fc.string({ minLength: 10, maxLength: 20 }),
  sameAsParent: fc.boolean(),
});

/** Generate random consent record (all mandatory true for valid drafts) */
const consentRecordArbitrary = fc.record({
  parentGuardianAuthority: fc.constant(true as const),
  accuracyOfInformation: fc.constant(true as const),
  healthSafetyDataProcessing: fc.constant(true as const),
  emergencyAssistanceAuthorisation: fc.constant(true as const),
  termsAndCancellationPolicy: fc.constant(true as const),
  privacyNoticeAcknowledgement: fc.constant(true as const),
  photographyPromotionalUse: fc.boolean(),
  emailMarketing: fc.boolean(),
  whatsappMarketing: fc.boolean(),
});

/** Valid date arbitrary for timestamps */
const validDateArbitrary = fc.date({ min: new Date(2020, 0, 1), max: new Date(2030, 11, 31) }).filter(d => !isNaN(d.getTime()));

/** Generate consent audit */
const consentAuditArbitrary = fc.record({
  consents: consentRecordArbitrary,
  acceptedAt: validDateArbitrary.map((d) => d.toISOString()),
  acceptedBy: fc.string({ minLength: 2, maxLength: 50 }),
  termsVersion: fc.string({ minLength: 1, maxLength: 10 }),
  privacyNoticeVersion: fc.string({ minLength: 1, maxLength: 10 }),
  sourceChannel: fc.constantFrom(
    'website', 'website_express', 'whatsapp_express',
    'facebook_express', 'instagram_express', 'qr_express',
    'google_express', 'unknown'
  ),
  submissionTimestamp: validDateArbitrary.map((d) => d.toISOString()),
});

/** Generate booking source */
const bookingSourceArbitrary = fc.constantFrom(
  'website', 'website_express', 'whatsapp_express',
  'facebook_express', 'instagram_express', 'qr_express',
  'google_express', 'unknown'
);

/** Generate a full valid draft document */
const draftArbitrary = fc.record({
  sessionId: fc.string({ minLength: 5, maxLength: 30 }),
  bookingMode: fc.constant('guest' as const),
  source: bookingSourceArbitrary,
  guestContact: guestContactArbitrary,
  childDetails: childDetailsArbitrary,
  medicalInfo: medicalInfoArbitrary,
  allergyDietaryInfo: allergyDietaryInfoArbitrary,
  emergencyContact: emergencyContactArbitrary,
  authorisedCollector: authorisedCollectorArbitrary,
  consentAudit: consentAuditArbitrary,
});

/** Generate session data */
const sessionDataArbitrary = fc.record({
  className: fc.string({ minLength: 1, maxLength: 50 }),
  classType: fc.constantFrom('kidsAfterSchool', 'youngAdultWeekend'),
  date: fc.date({ min: new Date(2024, 0, 1), max: new Date(2026, 11, 31) }).map(
    (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  ),
  startTime: fc.constantFrom('15:30', '10:30', '14:00'),
  endTime: fc.constantFrom('16:30', '12:30', '15:00'),
  venueName: fc.string({ minLength: 1, maxLength: 50 }),
  ageMin: fc.integer({ min: 3, max: 8 }),
  ageMax: fc.integer({ min: 8, max: 18 }),
  price: fc.integer({ min: 500, max: 5000 }),
  spotsAvailable: fc.integer({ min: 0, max: 20 }),
  status: fc.constantFrom('open', 'closed', 'cancelled', 'full'),
});

// --- Helper: buildGuestBookingDoc (mirrors webhook implementation) ---

/**
 * Pure function replicating the webhook's buildGuestBookingDoc logic.
 * We test this in isolation to verify data completeness without needing
 * Firestore or Stripe dependencies.
 */
function buildGuestBookingDoc(
  draft: Record<string, any>,
  paymentIntent: { id: string; amount: number; currency: string },
  safetyReviewStatus: string,
  sessionData: Record<string, any>
) {
  const piId = paymentIntent.id;

  return {
    id: piId,
    bookingMode: 'guest' as const,
    bookingSource: draft.source ?? 'unknown',
    sessionId: draft.sessionId,
    status: 'confirmed',
    guestContact: draft.guestContact,
    childSnapshot: draft.childDetails,
    medicalSnapshot: draft.medicalInfo,
    allergyDietarySnapshot: draft.allergyDietaryInfo,
    emergencyContactSnapshot: draft.emergencyContact,
    authorisedCollectorSnapshot: draft.authorisedCollector,
    consentAudit: draft.consentAudit,
    sessionSnapshot: {
      id: draft.sessionId,
      className: sessionData.className ?? '',
      classType: sessionData.classType ?? '',
      date: sessionData.date ?? '',
      startTime: sessionData.startTime ?? '',
      endTime: sessionData.endTime ?? '',
      venueName: sessionData.venueName ?? '',
      ageMin: sessionData.ageMin ?? 0,
      ageMax: sessionData.ageMax ?? 0,
      price: sessionData.price ?? 0,
      spotsAvailable: sessionData.spotsAvailable ?? 0,
      status: sessionData.status ?? '',
    },
    safetyReviewStatus,
    payment: {
      stripePaymentIntentId: piId,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      status: 'paid',
      receiptUrl: null,
    },
  };
}

// --- Property 7: Guest Booking Data Completeness ---

describe('Property 7: Guest Booking Data Completeness', () => {
  it('resulting booking document contains all required embedded snapshots matching draft data', () => {
    fc.assert(
      fc.property(
        draftArbitrary,
        sessionDataArbitrary,
        fc.string({ minLength: 3, maxLength: 30 }).map((s) => `pi_${s}`),
        fc.integer({ min: 500, max: 10000 }),
        (draft, sessionData, piId, amount) => {
          const paymentIntent = { id: piId, amount, currency: 'gbp' };
          const safetyReviewStatus = determineSafetyReviewStatus(draft);

          const doc = buildGuestBookingDoc(draft, paymentIntent, safetyReviewStatus, sessionData);

          // Verify all required snapshot fields are present
          expect(doc.guestContact).toEqual(draft.guestContact);
          expect(doc.childSnapshot).toEqual(draft.childDetails);
          expect(doc.medicalSnapshot).toEqual(draft.medicalInfo);
          expect(doc.allergyDietarySnapshot).toEqual(draft.allergyDietaryInfo);
          expect(doc.emergencyContactSnapshot).toEqual(draft.emergencyContact);
          expect(doc.authorisedCollectorSnapshot).toEqual(draft.authorisedCollector);
          expect(doc.consentAudit).toEqual(draft.consentAudit);

          // Session snapshot matches session data
          expect(doc.sessionSnapshot.className).toBe(sessionData.className);
          expect(doc.sessionSnapshot.classType).toBe(sessionData.classType);
          expect(doc.sessionSnapshot.date).toBe(sessionData.date);
          expect(doc.sessionSnapshot.startTime).toBe(sessionData.startTime);
          expect(doc.sessionSnapshot.endTime).toBe(sessionData.endTime);
          expect(doc.sessionSnapshot.venueName).toBe(sessionData.venueName);
          expect(doc.sessionSnapshot.ageMin).toBe(sessionData.ageMin);
          expect(doc.sessionSnapshot.ageMax).toBe(sessionData.ageMax);
          expect(doc.sessionSnapshot.price).toBe(sessionData.price);

          // Booking ID matches PaymentIntent ID
          expect(doc.id).toBe(piId);
          expect(doc.payment.stripePaymentIntentId).toBe(piId);

          // Booking mode is always 'guest'
          expect(doc.bookingMode).toBe('guest');

          // Source comes from draft
          expect(doc.bookingSource).toBe(draft.source);

          // Payment amount matches the PaymentIntent amount
          expect(doc.payment.amount).toBe(amount);
          expect(doc.payment.currency).toBe('gbp');
          expect(doc.payment.status).toBe('paid');
        }
      ),
      { numRuns: 200 }
    );
  });

  it('session snapshot captures session ID from draft', () => {
    fc.assert(
      fc.property(
        draftArbitrary,
        sessionDataArbitrary,
        (draft, sessionData) => {
          const paymentIntent = { id: 'pi_test123', amount: 1500, currency: 'gbp' };
          const doc = buildGuestBookingDoc(draft, paymentIntent, 'not_required', sessionData);

          expect(doc.sessionSnapshot.id).toBe(draft.sessionId);
          expect(doc.sessionId).toBe(draft.sessionId);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// --- Property 8: Safety Review Status Classification ---

describe('Property 8: Safety Review Status Classification', () => {
  it("returns 'pending' IFF any high-risk declaration is true", () => {
    fc.assert(
      fc.property(medicalInfoArbitrary, (medicalInfo) => {
        const draft = { medicalInfo };
        const result = determineSafetyReviewStatus(draft);

        // Oracle: compute expected status independently
        const hasHighRisk =
          medicalInfo.foodAllergies === true ||
          medicalInfo.epipenRequired === true ||
          medicalInfo.respiratoryProblems === true ||
          medicalInfo.airborneAllergies === true ||
          (medicalInfo.medicalConditions != null &&
            medicalInfo.medicalConditions.trim().length > 0);

        if (hasHighRisk) {
          expect(result).toBe('pending');
        } else {
          expect(result).toBe('not_required');
        }
      }),
      { numRuns: 500 }
    );
  });

  it("returns 'not_required' when all risk flags are false and medicalConditions is empty", () => {
    fc.assert(
      fc.property(
        fc.record({
          foodAllergies: fc.constant(false),
          dietaryRequirements: fc.string({ maxLength: 100 }),
          airborneAllergies: fc.constant(false),
          allergenDetails: fc.string({ maxLength: 100 }),
          knownReactions: fc.string({ maxLength: 100 }),
          symptoms: fc.string({ maxLength: 100 }),
          epipenRequired: fc.constant(false),
          epipenDetails: fc.string({ maxLength: 100 }),
          medicationDetails: fc.string({ maxLength: 100 }),
          respiratoryProblems: fc.constant(false),
          medicalConditions: fc.constantFrom('', '   ', '\t', '\n'),
          recentOperations: fc.string({ maxLength: 100 }),
          visionImpairment: fc.boolean(),
          hearingImpairment: fc.boolean(),
          additionalSupportNeeds: fc.string({ maxLength: 100 }),
          otherSafetyInfo: fc.string({ maxLength: 100 }),
        }),
        (medicalInfo) => {
          const result = determineSafetyReviewStatus({ medicalInfo });
          expect(result).toBe('not_required');
        }
      ),
      { numRuns: 200 }
    );
  });

  it("returns 'pending' when at least one high-risk boolean is true", () => {
    // Generate medical info where exactly one high-risk flag is true
    const oneHighRiskArbitrary = fc
      .constantFrom(
        'foodAllergies',
        'epipenRequired',
        'respiratoryProblems',
        'airborneAllergies'
      )
      .chain((flagName) =>
        medicalInfoArbitrary.map((info) => ({
          ...info,
          foodAllergies: false,
          epipenRequired: false,
          respiratoryProblems: false,
          airborneAllergies: false,
          medicalConditions: '',
          [flagName]: true,
        }))
      );

    fc.assert(
      fc.property(oneHighRiskArbitrary, (medicalInfo) => {
        const result = determineSafetyReviewStatus({ medicalInfo });
        expect(result).toBe('pending');
      }),
      { numRuns: 200 }
    );
  });

  it("returns 'pending' when medicalConditions is non-empty (even if all booleans false)", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 200 }).filter((s) => s.trim().length > 0),
        (medicalConditions) => {
          const medicalInfo = {
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
            medicalConditions,
            recentOperations: '',
            visionImpairment: false,
            hearingImpairment: false,
            additionalSupportNeeds: '',
            otherSafetyInfo: '',
          };

          const result = determineSafetyReviewStatus({ medicalInfo });
          expect(result).toBe('pending');
        }
      ),
      { numRuns: 200 }
    );
  });

  it("returns 'not_required' when medicalInfo is undefined", () => {
    const result = determineSafetyReviewStatus({});
    expect(result).toBe('not_required');
  });
});

// --- Property 9: Webhook Idempotency ---

describe('Property 9: Webhook Idempotency', () => {
  /**
   * Simulates calling the webhook transaction logic multiple times for the same PI ID.
   * Uses a simple in-memory store to mimic Firestore transaction behavior:
   * - First call creates the booking and decrements spots
   * - Subsequent calls detect existing booking and skip
   */

  interface MockStore {
    bookings: Map<string, Record<string, any>>;
    sessions: Map<string, { spotsAvailable: number }>;
  }

  function createMockStore(sessionId: string, spotsAvailable: number): MockStore {
    return {
      bookings: new Map(),
      sessions: new Map([[sessionId, { spotsAvailable }]]),
    };
  }

  /**
   * Simulates the webhook transaction logic for guest bookings.
   * Returns true if the booking was created, false if it was skipped (idempotent).
   */
  function simulateWebhookTransaction(
    store: MockStore,
    piId: string,
    sessionId: string,
    draft: Record<string, any>
  ): boolean {
    // Idempotency check — mirrors the Firestore transaction logic
    if (store.bookings.has(piId)) {
      return false; // Already processed
    }

    const session = store.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Create booking
    store.bookings.set(piId, {
      id: piId,
      bookingMode: 'guest',
      sessionId,
      ...draft,
    });

    // Decrement spots (only if available)
    if (session.spotsAvailable > 0) {
      session.spotsAvailable -= 1;
    }

    return true;
  }

  it('creates at most one booking per PaymentIntent ID regardless of call count', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 3, maxLength: 30 }).map((s) => `pi_${s}`),
        fc.string({ minLength: 3, maxLength: 20 }),
        fc.integer({ min: 1, max: 20 }),
        fc.integer({ min: 2, max: 10 }),
        (piId, sessionId, initialSpots, callCount) => {
          const store = createMockStore(sessionId, initialSpots);
          const draft = { guestContact: { firstName: 'Test' }, childDetails: { firstName: 'Child' } };

          let createdCount = 0;
          for (let i = 0; i < callCount; i++) {
            const created = simulateWebhookTransaction(store, piId, sessionId, draft);
            if (created) createdCount++;
          }

          // At most one booking created
          expect(createdCount).toBe(1);
          expect(store.bookings.size).toBe(1);
          expect(store.bookings.has(piId)).toBe(true);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('decrements spotsAvailable at most once per PaymentIntent ID', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 3, maxLength: 30 }).map((s) => `pi_${s}`),
        fc.string({ minLength: 3, maxLength: 20 }),
        fc.integer({ min: 1, max: 20 }),
        fc.integer({ min: 2, max: 10 }),
        (piId, sessionId, initialSpots, callCount) => {
          const store = createMockStore(sessionId, initialSpots);
          const draft = { guestContact: { firstName: 'Test' } };

          for (let i = 0; i < callCount; i++) {
            simulateWebhookTransaction(store, piId, sessionId, draft);
          }

          // Spots should be decremented exactly once
          const finalSpots = store.sessions.get(sessionId)!.spotsAvailable;
          expect(finalSpots).toBe(initialSpots - 1);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('different PaymentIntent IDs create separate bookings and decrements', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.string({ minLength: 3, maxLength: 20 }).map((s) => `pi_${s}`),
          { minLength: 2, maxLength: 5 }
        ).filter((arr) => new Set(arr).size === arr.length), // unique PI IDs
        fc.string({ minLength: 3, maxLength: 20 }),
        fc.integer({ min: 5, max: 20 }),
        (piIds, sessionId, initialSpots) => {
          const store = createMockStore(sessionId, initialSpots);
          const draft = { guestContact: { firstName: 'Test' } };

          // Process each PI ID twice to test idempotency across multiple PIs
          for (const piId of piIds) {
            simulateWebhookTransaction(store, piId, sessionId, draft);
            simulateWebhookTransaction(store, piId, sessionId, draft); // duplicate
          }

          // Each unique PI gets exactly one booking
          expect(store.bookings.size).toBe(piIds.length);

          // Spots decremented once per unique PI
          const finalSpots = store.sessions.get(sessionId)!.spotsAvailable;
          expect(finalSpots).toBe(initialSpots - piIds.length);
        }
      ),
      { numRuns: 200 }
    );
  });
});
