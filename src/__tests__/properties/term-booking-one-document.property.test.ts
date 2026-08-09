// Feature: recurring-term-classes, Property 6: Term booking creates exactly one booking document
// **Validates: Requirements 4.2, 4.5**

// @vitest-environment node

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

/**
 * Property 6: Term booking creates exactly one booking document.
 *
 * For any successful term payment, the system SHALL create exactly one booking
 * document with `bookingType: 'term'` and `classId` referencing the term class —
 * never individual booking documents per session day.
 *
 * We model the booking creation logic as a pure function:
 * - Given N payment events for the same term class (even with multiple session days),
 *   verify that exactly one booking document is created per PaymentIntent.
 * - The booking has bookingType === 'term' and classId set (not sessionId).
 * - Duplicate webhook calls don't create additional bookings.
 */

// --- Pure functions under test ---

/**
 * Models the in-memory bookings store used during transaction processing.
 * Mirrors the Firestore transaction logic in handleTermPaymentSucceeded:
 *   - Uses paymentIntentId as the document ID (bookings/{piId})
 *   - Performs idempotency check before creation
 */
interface TermBookingDocument {
  id: string;
  bookingType: 'term';
  classId: string;
  className: string;
  recurrenceDays: string[];
  termStartDate: string;
  termEndDate: string;
  sessionId: string; // Always '' for term bookings
  sessionDate: string; // Always '' for term bookings
  bookedByUid: string;
  studentId: string;
  studentName: string;
  status: 'confirmed';
  payment: {
    stripePaymentIntentId: string;
    amount: number;
    currency: string;
    status: 'paid';
  };
}

interface TermClassData {
  id: string;
  commitment: 'term';
  name: string;
  recurrenceDays: string[];
  termStartDate: string;
  termEndDate: string;
  termPrice: number;
  spotsAvailable: number;
}

interface TermBookingDraft {
  bookingType: 'term';
  classId: string;
  className: string;
  classType: string;
  recurrenceDays: string[];
  termStartDate: string;
  termEndDate: string;
  bookedByUid: string;
  bookedByName: string;
  bookedByEmail: string;
  studentId: string;
  studentName: string;
}

interface PaymentIntent {
  id: string;
  amount: number;
}

/**
 * Models the term booking creation logic from handleTermPaymentSucceeded.
 * Returns the booking document created, or null if skipped (duplicate).
 */
function processTermPayment(
  paymentIntent: PaymentIntent,
  draft: TermBookingDraft,
  classData: TermClassData,
  existingBookings: Map<string, TermBookingDocument>
): { booking: TermBookingDocument | null; created: boolean } {
  const piId = paymentIntent.id;

  // Idempotency check: if booking already exists, skip
  if (existingBookings.has(piId)) {
    return { booking: null, created: false };
  }

  // Create the term booking document
  const booking: TermBookingDocument = {
    id: piId,
    bookingType: 'term',
    classId: draft.classId,
    className: draft.className,
    recurrenceDays: draft.recurrenceDays,
    termStartDate: draft.termStartDate,
    termEndDate: draft.termEndDate,
    sessionId: '', // Not applicable for term bookings
    sessionDate: '', // Not applicable for term bookings
    bookedByUid: draft.bookedByUid,
    studentId: draft.studentId,
    studentName: draft.studentName,
    status: 'confirmed',
    payment: {
      stripePaymentIntentId: piId,
      amount: paymentIntent.amount,
      currency: 'gbp',
      status: 'paid',
    },
  };

  existingBookings.set(piId, booking);
  return { booking, created: true };
}

/**
 * Simulates multiple webhook deliveries for the same PaymentIntent.
 * Returns the total number of bookings created.
 */
function processMultipleWebhookDeliveries(
  paymentIntent: PaymentIntent,
  draft: TermBookingDraft,
  classData: TermClassData,
  deliveryCount: number
): { totalCreated: number; finalBookings: Map<string, TermBookingDocument> } {
  const bookings = new Map<string, TermBookingDocument>();
  let totalCreated = 0;

  for (let i = 0; i < deliveryCount; i++) {
    const result = processTermPayment(paymentIntent, draft, classData, bookings);
    if (result.created) {
      totalCreated++;
    }
  }

  return { totalCreated, finalBookings: bookings };
}

/**
 * Simulates multiple DIFFERENT payment intents for the same term class.
 * Each PaymentIntent should create exactly one booking document.
 */
function processMultiplePaymentsForSameClass(
  paymentIntents: PaymentIntent[],
  drafts: TermBookingDraft[],
  classData: TermClassData
): Map<string, TermBookingDocument> {
  const bookings = new Map<string, TermBookingDocument>();

  for (let i = 0; i < paymentIntents.length; i++) {
    processTermPayment(paymentIntents[i], drafts[i], classData, bookings);
  }

  return bookings;
}

// --- Arbitraries ---

const dayOfWeekArb = fc.constantFrom(
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'
);

const recurrenceDaysArb = fc.uniqueArray(dayOfWeekArb, { minLength: 1, maxLength: 7 });

const paymentIntentIdArb = fc.stringMatching(/^pi_[a-zA-Z0-9]{24}$/);

const classIdArb = fc.uuid();
const userIdArb = fc.uuid();

const termPriceArb = fc.integer({ min: 100, max: 500_000 }); // 1.00 to 5000.00 GBP

const termClassDataArb = fc.record({
  id: classIdArb,
  commitment: fc.constant('term' as const),
  name: fc.string({ minLength: 1, maxLength: 50 }),
  recurrenceDays: recurrenceDaysArb,
  termStartDate: fc.constant('2025-01-06'),
  termEndDate: fc.constant('2025-06-28'),
  termPrice: termPriceArb,
  spotsAvailable: fc.integer({ min: 1, max: 30 }),
});

const termBookingDraftArb = (classData: TermClassData): fc.Arbitrary<TermBookingDraft> =>
  fc.record({
    bookingType: fc.constant('term' as const),
    classId: fc.constant(classData.id),
    className: fc.constant(classData.name),
    classType: fc.constantFrom('kidsAfterSchool', 'youngAdultWeekend'),
    recurrenceDays: fc.constant(classData.recurrenceDays),
    termStartDate: fc.constant(classData.termStartDate),
    termEndDate: fc.constant(classData.termEndDate),
    bookedByUid: userIdArb,
    bookedByName: fc.string({ minLength: 1, maxLength: 30 }),
    bookedByEmail: fc.emailAddress(),
    studentId: userIdArb,
    studentName: fc.string({ minLength: 1, maxLength: 30 }),
  });

const paymentIntentArb = (amount: number): fc.Arbitrary<PaymentIntent> =>
  fc.record({
    id: paymentIntentIdArb,
    amount: fc.constant(amount),
  });

// Number of duplicate webhook deliveries (between 1 and 10)
const deliveryCountArb = fc.integer({ min: 1, max: 10 });

// --- Property Tests ---

describe('Feature: recurring-term-classes, Property 6: Term booking creates exactly one booking document', () => {
  describe('Exactly one booking document per PaymentIntent', () => {
    it('a single successful term payment creates exactly one booking document', () => {
      fc.assert(
        fc.property(
          termClassDataArb,
          (classData) => {
            const draft: TermBookingDraft = {
              bookingType: 'term',
              classId: classData.id,
              className: classData.name,
              classType: 'kidsAfterSchool',
              recurrenceDays: classData.recurrenceDays,
              termStartDate: classData.termStartDate,
              termEndDate: classData.termEndDate,
              bookedByUid: 'user-123',
              bookedByName: 'Test User',
              bookedByEmail: 'test@example.com',
              studentId: 'student-456',
              studentName: 'Test Student',
            };

            const paymentIntent: PaymentIntent = {
              id: `pi_${classData.id.replace(/-/g, '').slice(0, 24)}`,
              amount: classData.termPrice,
            };

            const bookings = new Map<string, TermBookingDocument>();
            const result = processTermPayment(paymentIntent, draft, classData, bookings);

            // Exactly one booking created
            expect(result.created).toBe(true);
            expect(bookings.size).toBe(1);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('regardless of how many recurrenceDays the term has, only one booking document is created', () => {
      fc.assert(
        fc.property(
          termClassDataArb,
          (classData) => {
            const draft: TermBookingDraft = {
              bookingType: 'term',
              classId: classData.id,
              className: classData.name,
              classType: 'kidsAfterSchool',
              recurrenceDays: classData.recurrenceDays,
              termStartDate: classData.termStartDate,
              termEndDate: classData.termEndDate,
              bookedByUid: 'user-123',
              bookedByName: 'Test User',
              bookedByEmail: 'test@example.com',
              studentId: 'student-456',
              studentName: 'Test Student',
            };

            const paymentIntent: PaymentIntent = {
              id: `pi_${classData.id.replace(/-/g, '').slice(0, 24)}`,
              amount: classData.termPrice,
            };

            const bookings = new Map<string, TermBookingDocument>();
            processTermPayment(paymentIntent, draft, classData, bookings);

            // Even if the term has 7 recurrence days, only ONE booking document exists
            expect(bookings.size).toBe(1);
            expect(classData.recurrenceDays.length).toBeGreaterThanOrEqual(1);
            expect(classData.recurrenceDays.length).toBeLessThanOrEqual(7);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Booking document has bookingType === term and classId (not sessionId)', () => {
    it('the created booking always has bookingType set to term', () => {
      fc.assert(
        fc.property(
          termClassDataArb,
          (classData) => {
            const draft: TermBookingDraft = {
              bookingType: 'term',
              classId: classData.id,
              className: classData.name,
              classType: 'youngAdultWeekend',
              recurrenceDays: classData.recurrenceDays,
              termStartDate: classData.termStartDate,
              termEndDate: classData.termEndDate,
              bookedByUid: 'user-abc',
              bookedByName: 'Parent User',
              bookedByEmail: 'parent@example.com',
              studentId: 'child-xyz',
              studentName: 'Child Name',
            };

            const paymentIntent: PaymentIntent = {
              id: `pi_${classData.id.replace(/-/g, '').slice(0, 24)}`,
              amount: classData.termPrice,
            };

            const bookings = new Map<string, TermBookingDocument>();
            const result = processTermPayment(paymentIntent, draft, classData, bookings);

            expect(result.booking).not.toBeNull();
            expect(result.booking!.bookingType).toBe('term');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('the created booking always has classId set to the term class ID', () => {
      fc.assert(
        fc.property(
          termClassDataArb,
          (classData) => {
            const draft: TermBookingDraft = {
              bookingType: 'term',
              classId: classData.id,
              className: classData.name,
              classType: 'kidsAfterSchool',
              recurrenceDays: classData.recurrenceDays,
              termStartDate: classData.termStartDate,
              termEndDate: classData.termEndDate,
              bookedByUid: 'user-def',
              bookedByName: 'Another Parent',
              bookedByEmail: 'another@example.com',
              studentId: 'student-ghi',
              studentName: 'Another Child',
            };

            const paymentIntent: PaymentIntent = {
              id: `pi_${classData.id.replace(/-/g, '').slice(0, 24)}`,
              amount: classData.termPrice,
            };

            const bookings = new Map<string, TermBookingDocument>();
            const result = processTermPayment(paymentIntent, draft, classData, bookings);

            expect(result.booking).not.toBeNull();
            expect(result.booking!.classId).toBe(classData.id);
            // sessionId should be empty for term bookings
            expect(result.booking!.sessionId).toBe('');
            expect(result.booking!.sessionDate).toBe('');
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Idempotency: duplicate webhook calls do not create additional bookings', () => {
    it('duplicate webhook deliveries for the same PaymentIntent create exactly one booking', () => {
      fc.assert(
        fc.property(
          termClassDataArb,
          deliveryCountArb,
          (classData, deliveryCount) => {
            const draft: TermBookingDraft = {
              bookingType: 'term',
              classId: classData.id,
              className: classData.name,
              classType: 'kidsAfterSchool',
              recurrenceDays: classData.recurrenceDays,
              termStartDate: classData.termStartDate,
              termEndDate: classData.termEndDate,
              bookedByUid: 'user-idem',
              bookedByName: 'Idem User',
              bookedByEmail: 'idem@example.com',
              studentId: 'student-idem',
              studentName: 'Idem Student',
            };

            const paymentIntent: PaymentIntent = {
              id: `pi_${classData.id.replace(/-/g, '').slice(0, 24)}`,
              amount: classData.termPrice,
            };

            const { totalCreated, finalBookings } = processMultipleWebhookDeliveries(
              paymentIntent,
              draft,
              classData,
              deliveryCount
            );

            // Only one booking was ever created, regardless of how many times webhook fires
            expect(totalCreated).toBe(1);
            expect(finalBookings.size).toBe(1);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('after the first delivery creates a booking, subsequent deliveries return created=false', () => {
      fc.assert(
        fc.property(
          termClassDataArb,
          deliveryCountArb,
          (classData, extraDeliveries) => {
            const draft: TermBookingDraft = {
              bookingType: 'term',
              classId: classData.id,
              className: classData.name,
              classType: 'youngAdultWeekend',
              recurrenceDays: classData.recurrenceDays,
              termStartDate: classData.termStartDate,
              termEndDate: classData.termEndDate,
              bookedByUid: 'user-dup',
              bookedByName: 'Dup User',
              bookedByEmail: 'dup@example.com',
              studentId: 'student-dup',
              studentName: 'Dup Student',
            };

            const paymentIntent: PaymentIntent = {
              id: `pi_${classData.id.replace(/-/g, '').slice(0, 24)}`,
              amount: classData.termPrice,
            };

            const bookings = new Map<string, TermBookingDocument>();

            // First delivery: creates the booking
            const first = processTermPayment(paymentIntent, draft, classData, bookings);
            expect(first.created).toBe(true);
            expect(first.booking).not.toBeNull();

            // Subsequent deliveries: idempotent, no new booking
            for (let i = 0; i < extraDeliveries; i++) {
              const subsequent = processTermPayment(paymentIntent, draft, classData, bookings);
              expect(subsequent.created).toBe(false);
              expect(subsequent.booking).toBeNull();
            }

            // Still only one booking total
            expect(bookings.size).toBe(1);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Multiple different PaymentIntents for the same term class', () => {
    it('each unique PaymentIntent creates exactly one booking for the same class', () => {
      fc.assert(
        fc.property(
          termClassDataArb,
          fc.integer({ min: 2, max: 10 }),
          (classData, numPayments) => {
            // Generate unique payment intent IDs
            const paymentIntents: PaymentIntent[] = [];
            const drafts: TermBookingDraft[] = [];

            for (let i = 0; i < numPayments; i++) {
              paymentIntents.push({
                id: `pi_payment${i.toString().padStart(20, '0')}`,
                amount: classData.termPrice,
              });
              drafts.push({
                bookingType: 'term',
                classId: classData.id,
                className: classData.name,
                classType: 'kidsAfterSchool',
                recurrenceDays: classData.recurrenceDays,
                termStartDate: classData.termStartDate,
                termEndDate: classData.termEndDate,
                bookedByUid: `user-${i}`,
                bookedByName: `User ${i}`,
                bookedByEmail: `user${i}@example.com`,
                studentId: `student-${i}`,
                studentName: `Student ${i}`,
              });
            }

            const bookings = processMultiplePaymentsForSameClass(
              paymentIntents,
              drafts,
              classData
            );

            // Each unique PaymentIntent produces exactly one booking
            expect(bookings.size).toBe(numPayments);

            // All bookings reference the same classId
            for (const booking of bookings.values()) {
              expect(booking.bookingType).toBe('term');
              expect(booking.classId).toBe(classData.id);
              expect(booking.sessionId).toBe('');
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('booking document ID always equals the PaymentIntent ID', () => {
      fc.assert(
        fc.property(
          termClassDataArb,
          (classData) => {
            const piId = `pi_${classData.id.replace(/-/g, '').slice(0, 24)}`;
            const paymentIntent: PaymentIntent = {
              id: piId,
              amount: classData.termPrice,
            };

            const draft: TermBookingDraft = {
              bookingType: 'term',
              classId: classData.id,
              className: classData.name,
              classType: 'kidsAfterSchool',
              recurrenceDays: classData.recurrenceDays,
              termStartDate: classData.termStartDate,
              termEndDate: classData.termEndDate,
              bookedByUid: 'user-id-check',
              bookedByName: 'ID Check User',
              bookedByEmail: 'idcheck@example.com',
              studentId: 'student-id-check',
              studentName: 'ID Check Student',
            };

            const bookings = new Map<string, TermBookingDocument>();
            processTermPayment(paymentIntent, draft, classData, bookings);

            // The booking is stored under the PaymentIntent ID
            expect(bookings.has(piId)).toBe(true);
            expect(bookings.get(piId)!.id).toBe(piId);
            expect(bookings.get(piId)!.payment.stripePaymentIntentId).toBe(piId);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
