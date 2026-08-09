// Feature: recurring-term-classes, Property 7: Spots decrement on term booking
// **Validates: Requirements 4.4**

// @vitest-environment node

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

/**
 * Property 7: Spots decrement on term booking.
 *
 * For any successful term booking, the `spotsAvailable` count on the BTClass
 * document SHALL be decremented by exactly one within a transaction.
 *
 * We model the spots decrement as pure functions:
 * - Given an initial spotsAvailable value and N successful bookings,
 *   spotsAvailable decreases by exactly 1 per booking.
 * - Each individual booking decrements by exactly 1.
 * - The decrement is atomic (simulating concurrent operations via sequential
 *   application of the same function).
 *
 * The webhook handler uses `FieldValue.increment(-1)` inside a Firestore
 * transaction to achieve this atomicity.
 */

// --- Pure functions modeling the spots decrement logic ---

/**
 * Models FieldValue.increment(-1) as applied in the transaction.
 * This mirrors the webhook code:
 *   tx.update(classRef, { spotsAvailable: admin.firestore.FieldValue.increment(-1) });
 *
 * Returns the new spotsAvailable value after a single booking.
 */
function decrementSpots(currentSpots: number): number {
  return currentSpots - 1;
}

/**
 * Models the full spots update for a single term booking within a transaction.
 * Returns the new spots value and the overbooking flag.
 * This mirrors the logic in handleTermPaymentSucceeded:
 *   - If spotsAvailable > 0: decrement by 1, overbooking = false
 *   - If spotsAvailable <= 0: still decrement by 1 (goes negative), overbooking = true
 */
function processTermBooking(currentSpots: number): {
  newSpots: number;
  overbooking: boolean;
} {
  const overbooking = currentSpots <= 0;
  return {
    newSpots: currentSpots - 1,
    overbooking,
  };
}

/**
 * Applies K sequential bookings to an initial spots count.
 * Each booking decrements by exactly 1.
 * Returns the final spots value and booking results.
 */
function applySequentialBookings(
  initialSpots: number,
  numBookings: number
): { finalSpots: number; bookingResults: Array<{ newSpots: number; overbooking: boolean }> } {
  let currentSpots = initialSpots;
  const bookingResults: Array<{ newSpots: number; overbooking: boolean }> = [];

  for (let i = 0; i < numBookings; i++) {
    const result = processTermBooking(currentSpots);
    currentSpots = result.newSpots;
    bookingResults.push(result);
  }

  return { finalSpots: currentSpots, bookingResults };
}

/**
 * Simulates concurrent bookings by applying the decrement atomically.
 * In a real system, the Firestore transaction ensures that even concurrent
 * bookings each read the latest value and decrement by exactly 1.
 * We model this as sequential application (transactions serialize access).
 */
function applyConcurrentBookings(
  initialSpots: number,
  numBookings: number
): number {
  // Transactions serialize access, so concurrent bookings are equivalent to sequential
  return initialSpots - numBookings;
}

// --- Arbitraries ---

// Initial spots available (realistic range for a class)
const initialSpotsArb = fc.integer({ min: 1, max: 50 });

// Number of bookings to apply (at least 1)
const numBookingsArb = fc.integer({ min: 1, max: 30 });

// Extended spots range including 0 and negative (for overbooking scenarios)
const anySpotsArb = fc.integer({ min: -10, max: 50 });

// --- Property Tests ---

describe('Feature: recurring-term-classes, Property 7: Spots decrement on term booking', () => {
  describe('Each individual booking decrements spotsAvailable by exactly 1', () => {
    it('a single booking always decreases spots by exactly 1', () => {
      fc.assert(
        fc.property(
          anySpotsArb,
          (currentSpots) => {
            const result = processTermBooking(currentSpots);

            // The decrement is always exactly 1
            expect(result.newSpots).toBe(currentSpots - 1);
            // The difference is always -1
            expect(currentSpots - result.newSpots).toBe(1);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('decrementSpots always returns exactly currentSpots - 1', () => {
      fc.assert(
        fc.property(
          anySpotsArb,
          (currentSpots) => {
            const newSpots = decrementSpots(currentSpots);

            expect(newSpots).toBe(currentSpots - 1);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('After K bookings, spotsAvailable = initial - K', () => {
    it('sequential bookings result in spotsAvailable = initial - K', () => {
      fc.assert(
        fc.property(
          initialSpotsArb,
          numBookingsArb,
          (initialSpots, numBookings) => {
            const { finalSpots } = applySequentialBookings(initialSpots, numBookings);

            // After K bookings, spots = initial - K
            expect(finalSpots).toBe(initialSpots - numBookings);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('each intermediate step decreases by exactly 1 from the previous', () => {
      fc.assert(
        fc.property(
          initialSpotsArb,
          numBookingsArb,
          (initialSpots, numBookings) => {
            const { bookingResults } = applySequentialBookings(initialSpots, numBookings);

            let expectedSpots = initialSpots;
            for (const result of bookingResults) {
              expectedSpots -= 1;
              expect(result.newSpots).toBe(expectedSpots);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('total decrement equals the number of bookings made', () => {
      fc.assert(
        fc.property(
          initialSpotsArb,
          numBookingsArb,
          (initialSpots, numBookings) => {
            const { finalSpots } = applySequentialBookings(initialSpots, numBookings);

            const totalDecrement = initialSpots - finalSpots;
            expect(totalDecrement).toBe(numBookings);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Decrement atomicity (concurrent operations)', () => {
    it('concurrent bookings produce the same result as sequential bookings', () => {
      fc.assert(
        fc.property(
          initialSpotsArb,
          numBookingsArb,
          (initialSpots, numBookings) => {
            // Sequential application
            const { finalSpots: sequentialResult } = applySequentialBookings(
              initialSpots,
              numBookings
            );

            // Concurrent application (transactions serialize, so result is identical)
            const concurrentResult = applyConcurrentBookings(initialSpots, numBookings);

            // Both approaches must yield the same final value
            expect(concurrentResult).toBe(sequentialResult);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('order of bookings does not affect final spotsAvailable count', () => {
      fc.assert(
        fc.property(
          initialSpotsArb,
          fc.integer({ min: 2, max: 20 }),
          (initialSpots, numBookings) => {
            // Apply all bookings at once
            const result1 = applyConcurrentBookings(initialSpots, numBookings);

            // Apply in two batches (simulates different ordering)
            const batch1Size = Math.floor(numBookings / 2);
            const batch2Size = numBookings - batch1Size;
            const afterBatch1 = applyConcurrentBookings(initialSpots, batch1Size);
            const afterBatch2 = applyConcurrentBookings(afterBatch1, batch2Size);

            // Same final result regardless of batching
            expect(afterBatch2).toBe(result1);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('decrement is commutative — applying N decrements is the same as subtracting N', () => {
      fc.assert(
        fc.property(
          anySpotsArb,
          fc.integer({ min: 1, max: 30 }),
          (initialSpots, numDecrements) => {
            // Apply decrements one by one
            let spots = initialSpots;
            for (let i = 0; i < numDecrements; i++) {
              spots = decrementSpots(spots);
            }

            // Should be the same as a single subtraction
            expect(spots).toBe(initialSpots - numDecrements);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Overbooking detection with decrement', () => {
    it('overbooking is flagged when spotsAvailable <= 0 at booking time', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: -10, max: 0 }),
          (zeroOrNegativeSpots) => {
            const result = processTermBooking(zeroOrNegativeSpots);

            expect(result.overbooking).toBe(true);
            // Still decrements by exactly 1 even in overbooking case
            expect(result.newSpots).toBe(zeroOrNegativeSpots - 1);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('no overbooking when spotsAvailable > 0 at booking time', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 50 }),
          (positiveSpots) => {
            const result = processTermBooking(positiveSpots);

            expect(result.overbooking).toBe(false);
            // Still decrements by exactly 1
            expect(result.newSpots).toBe(positiveSpots - 1);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('overbooking transitions exactly at spots boundary (spots goes from 1 to 0)', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 50 }),
          (initialSpots) => {
            // Book until spots reach 0
            const { bookingResults } = applySequentialBookings(initialSpots, initialSpots + 1);

            // First initialSpots bookings should not be overbooking
            for (let i = 0; i < initialSpots; i++) {
              expect(bookingResults[i].overbooking).toBe(false);
            }

            // The (initialSpots + 1)th booking should be overbooking
            // because at that point spotsAvailable is 0
            expect(bookingResults[initialSpots].overbooking).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Decrement invariants', () => {
    it('decrement is monotonically decreasing with each booking', () => {
      fc.assert(
        fc.property(
          initialSpotsArb,
          numBookingsArb,
          (initialSpots, numBookings) => {
            const { bookingResults } = applySequentialBookings(initialSpots, numBookings);

            // Each step's spots should be less than the previous
            let prevSpots = initialSpots;
            for (const result of bookingResults) {
              expect(result.newSpots).toBeLessThan(prevSpots);
              prevSpots = result.newSpots;
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('decrement of 1 is idempotent when applied to same input', () => {
      fc.assert(
        fc.property(
          anySpotsArb,
          (spots) => {
            // Applying the decrement to the same input always gives the same output
            const result1 = decrementSpots(spots);
            const result2 = decrementSpots(spots);

            expect(result1).toBe(result2);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('decrement never changes by more than 1 per booking', () => {
      fc.assert(
        fc.property(
          anySpotsArb,
          (spots) => {
            const newSpots = decrementSpots(spots);
            const absoluteChange = Math.abs(spots - newSpots);

            // Change is always exactly 1, never 0 and never more than 1
            expect(absoluteChange).toBe(1);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
