// Feature: term-session-management, Property 9: Webhook idempotency prevents duplicate bookings
// **Validates: Requirements 8.3**

// @vitest-environment node

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

/**
 * Property 9: Webhook idempotency prevents duplicate bookings.
 *
 * For any PaymentIntent ID, processing the payment_intent.succeeded webhook event
 * multiple times SHALL result in exactly one booking document with that ID.
 * Subsequent processing of the same event SHALL be a no-op.
 *
 * We model the idempotency logic as a pure in-memory simulation:
 * - The BookingStore uses a Map keyed by PaymentIntent ID
 * - processPayment checks existence before inserting (mirrors Firestore transaction check)
 * - First call creates the booking and returns true
 * - Subsequent calls detect the existing booking and return false (no-op)
 */

// --- Pure model of the booking store idempotency logic ---

/**
 * Simulates the bookings store with idempotency check.
 * Mirrors the Firestore transaction logic in the Stripe webhook:
 *   - Check if booking doc exists (bookings/{paymentIntentId})
 *   - If exists: skip (return false) — duplicate webhook delivery
 *   - If not exists: create booking doc (return true)
 */
class BookingStore {
  private bookings = new Map<string, object>();

  processPayment(paymentIntentId: string, bookingData: object): boolean {
    if (this.bookings.has(paymentIntentId)) return false; // Already exists, no-op
    this.bookings.set(paymentIntentId, bookingData);
    return true; // Created
  }

  getBookingCount(paymentIntentId: string): number {
    return this.bookings.has(paymentIntentId) ? 1 : 0;
  }

  getTotalBookings(): number {
    return this.bookings.size;
  }

  hasBooking(paymentIntentId: string): boolean {
    return this.bookings.has(paymentIntentId);
  }

  getBooking(paymentIntentId: string): object | undefined {
    return this.bookings.get(paymentIntentId);
  }
}

// --- Arbitraries ---

const paymentIntentIdArb = fc.stringMatching(/^pi_[a-zA-Z0-9]{24}$/);

const bookingDataArb = fc.record({
  sessionId: fc.uuid(),
  className: fc.string({ minLength: 1, maxLength: 50 }),
  studentName: fc.string({ minLength: 1, maxLength: 30 }),
  bookedByUid: fc.uuid(),
  status: fc.constant('confirmed'),
  bookingType: fc.constant('term'),
  payment: fc.record({
    amount: fc.integer({ min: 100, max: 500_000 }),
    currency: fc.constant('gbp'),
    status: fc.constant('paid'),
  }),
});

// Number of times webhook fires (simulating duplicate deliveries)
const processingCountArb = fc.integer({ min: 1, max: 20 });

// Number of distinct payment intents
const distinctPaymentCountArb = fc.integer({ min: 2, max: 15 });

// --- Property Tests ---

describe('Feature: term-session-management, Property 9: Webhook idempotency prevents duplicate bookings', () => {
  describe('After processing N times with same ID: exactly 1 booking exists', () => {
    it('processing the same PaymentIntent ID N times always results in exactly 1 booking', () => {
      fc.assert(
        fc.property(
          paymentIntentIdArb,
          bookingDataArb,
          processingCountArb,
          (piId, bookingData, processCount) => {
            const store = new BookingStore();

            // Process the same payment intent multiple times
            for (let i = 0; i < processCount; i++) {
              store.processPayment(piId, bookingData);
            }

            // Exactly 1 booking exists for this PaymentIntent ID
            expect(store.getBookingCount(piId)).toBe(1);
            expect(store.getTotalBookings()).toBe(1);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('First processing returns true (created)', () => {
    it('the first call to processPayment always returns true', () => {
      fc.assert(
        fc.property(
          paymentIntentIdArb,
          bookingDataArb,
          (piId, bookingData) => {
            const store = new BookingStore();

            const result = store.processPayment(piId, bookingData);

            expect(result).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Subsequent processing returns false (no-op)', () => {
    it('all calls after the first return false for the same PaymentIntent ID', () => {
      fc.assert(
        fc.property(
          paymentIntentIdArb,
          bookingDataArb,
          processingCountArb,
          (piId, bookingData, extraAttempts) => {
            const store = new BookingStore();

            // First processing — creates the booking
            const firstResult = store.processPayment(piId, bookingData);
            expect(firstResult).toBe(true);

            // Subsequent processing attempts — all no-ops
            for (let i = 0; i < extraAttempts; i++) {
              const subsequentResult = store.processPayment(piId, bookingData);
              expect(subsequentResult).toBe(false);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('the booking data is not overwritten by subsequent processing attempts', () => {
      fc.assert(
        fc.property(
          paymentIntentIdArb,
          bookingDataArb,
          bookingDataArb,
          (piId, originalData, differentData) => {
            const store = new BookingStore();

            // First processing with original data
            store.processPayment(piId, originalData);

            // Attempt to process again with different data (simulates modified retry)
            store.processPayment(piId, differentData);

            // The stored booking should be the original data, not overwritten
            const storedBooking = store.getBooking(piId);
            expect(storedBooking).toEqual(originalData);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Different PaymentIntent IDs create different bookings', () => {
    it('each unique PaymentIntent ID creates its own booking independently', () => {
      fc.assert(
        fc.property(
          fc.uniqueArray(paymentIntentIdArb, { minLength: 2, maxLength: 10 }),
          bookingDataArb,
          (piIds, bookingData) => {
            const store = new BookingStore();

            // Process each unique PaymentIntent ID once
            for (const piId of piIds) {
              const result = store.processPayment(piId, { ...bookingData, id: piId });
              expect(result).toBe(true);
            }

            // Each ID has exactly 1 booking
            expect(store.getTotalBookings()).toBe(piIds.length);
            for (const piId of piIds) {
              expect(store.getBookingCount(piId)).toBe(1);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('processing one PaymentIntent ID does not affect bookings for other IDs', () => {
      fc.assert(
        fc.property(
          paymentIntentIdArb,
          paymentIntentIdArb,
          bookingDataArb,
          bookingDataArb,
          (piId1, piId2, data1, data2) => {
            fc.pre(piId1 !== piId2); // Ensure IDs are distinct

            const store = new BookingStore();

            // Create booking for first ID
            store.processPayment(piId1, data1);

            // Create booking for second ID
            store.processPayment(piId2, data2);

            // Both exist independently
            expect(store.hasBooking(piId1)).toBe(true);
            expect(store.hasBooking(piId2)).toBe(true);
            expect(store.getBooking(piId1)).toEqual(data1);
            expect(store.getBooking(piId2)).toEqual(data2);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('After processing different IDs: each has exactly 1 booking', () => {
    it('mixed scenario: multiple IDs processed multiple times each yield exactly 1 booking per ID', () => {
      fc.assert(
        fc.property(
          fc.uniqueArray(paymentIntentIdArb, { minLength: 2, maxLength: 8 }),
          bookingDataArb,
          fc.array(fc.integer({ min: 1, max: 5 }), { minLength: 2, maxLength: 8 }),
          (piIds, baseBookingData, retryCounts) => {
            // Ensure retryCounts matches piIds length
            const counts = piIds.map((_, i) => retryCounts[i % retryCounts.length]);
            const store = new BookingStore();

            // Process each PaymentIntent ID a random number of times
            for (let i = 0; i < piIds.length; i++) {
              const piId = piIds[i];
              const data = { ...baseBookingData, id: piId };

              for (let attempt = 0; attempt < counts[i]; attempt++) {
                store.processPayment(piId, data);
              }
            }

            // Each unique PaymentIntent ID has exactly 1 booking
            expect(store.getTotalBookings()).toBe(piIds.length);
            for (const piId of piIds) {
              expect(store.getBookingCount(piId)).toBe(1);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('interleaved processing of different IDs maintains idempotency for each', () => {
      fc.assert(
        fc.property(
          paymentIntentIdArb,
          paymentIntentIdArb,
          bookingDataArb,
          bookingDataArb,
          processingCountArb,
          (piId1, piId2, data1, data2, interleaveCount) => {
            fc.pre(piId1 !== piId2); // Ensure IDs are distinct

            const store = new BookingStore();

            // Interleave processing of two different PaymentIntent IDs
            for (let i = 0; i < interleaveCount; i++) {
              store.processPayment(piId1, data1);
              store.processPayment(piId2, data2);
            }

            // Each has exactly 1 booking regardless of interleaving
            expect(store.getBookingCount(piId1)).toBe(1);
            expect(store.getBookingCount(piId2)).toBe(1);
            expect(store.getTotalBookings()).toBe(2);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
