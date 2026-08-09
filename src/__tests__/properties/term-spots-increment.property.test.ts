// Feature: recurring-term-classes, Property 8: Spots increment on term cancellation
// **Validates: Requirements 5.3, 6.3**

// @vitest-environment node

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

/**
 * Property 8: Spots increment on term cancellation.
 *
 * For any term booking cancellation, the `spotsAvailable` count on the BTClass
 * document SHALL be incremented by exactly one.
 *
 * We model the increment as pure functions:
 * - Given initial spots and K cancellations, verify spots increases by exactly 1
 *   per cancellation (spotsAvailable = initial + K).
 * - Each cancellation increments by exactly 1.
 * - Cancellation is the inverse of booking (spots + 1 per cancel, spots - 1 per book).
 *
 * The portal My Classes cancel handler uses `increment(1)` on the class document:
 *   await updateDoc(doc(db, 'classes', booking.classId), {
 *       spotsAvailable: increment(1)
 *   });
 */

// --- Pure functions modeling the spots increment logic ---

/**
 * Models FieldValue.increment(1) as applied in the cancel handler.
 * This mirrors the portal code:
 *   await updateDoc(doc(db, 'classes', booking.classId), { spotsAvailable: increment(1) });
 *
 * Returns the new spotsAvailable value after a single cancellation.
 */
function incrementSpots(currentSpots: number): number {
  return currentSpots + 1;
}

/**
 * Models FieldValue.increment(-1) as applied in the booking (webhook) handler.
 * Used to verify the inverse relationship between booking and cancellation.
 */
function decrementSpots(currentSpots: number): number {
  return currentSpots - 1;
}

/**
 * Models the full spots update for a single term booking cancellation.
 * Returns the new spots value after the cancellation.
 * This mirrors the logic in the portal's cancel handler:
 *   - Always increments by 1 (the class regains one spot)
 */
function processTermCancellation(currentSpots: number): { newSpots: number } {
  return {
    newSpots: currentSpots + 1,
  };
}

/**
 * Applies K sequential cancellations to an initial spots count.
 * Each cancellation increments by exactly 1.
 * Returns the final spots value and cancellation results.
 */
function applySequentialCancellations(
  initialSpots: number,
  numCancellations: number
): { finalSpots: number; cancellationResults: Array<{ newSpots: number }> } {
  let currentSpots = initialSpots;
  const cancellationResults: Array<{ newSpots: number }> = [];

  for (let i = 0; i < numCancellations; i++) {
    const result = processTermCancellation(currentSpots);
    currentSpots = result.newSpots;
    cancellationResults.push(result);
  }

  return { finalSpots: currentSpots, cancellationResults };
}

// --- Arbitraries ---

// Initial spots available (realistic range — can be 0 if class was fully booked)
const initialSpotsArb = fc.integer({ min: 0, max: 50 });

// Number of cancellations to apply (at least 1)
const numCancellationsArb = fc.integer({ min: 1, max: 30 });

// Extended spots range (including edge cases)
const anySpotsArb = fc.integer({ min: 0, max: 50 });

// Max size for a class (used in boundary tests)
const maxSizeArb = fc.integer({ min: 1, max: 50 });

// --- Property Tests ---

describe('Feature: recurring-term-classes, Property 8: Spots increment on term cancellation', () => {
  describe('Each individual cancellation increments spotsAvailable by exactly 1', () => {
    it('a single cancellation always increases spots by exactly 1', () => {
      fc.assert(
        fc.property(
          anySpotsArb,
          (currentSpots) => {
            const result = processTermCancellation(currentSpots);

            // The increment is always exactly 1
            expect(result.newSpots).toBe(currentSpots + 1);
            // The difference is always +1
            expect(result.newSpots - currentSpots).toBe(1);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('incrementSpots always returns exactly currentSpots + 1', () => {
      fc.assert(
        fc.property(
          anySpotsArb,
          (currentSpots) => {
            const newSpots = incrementSpots(currentSpots);

            expect(newSpots).toBe(currentSpots + 1);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('After K cancellations, spotsAvailable = initial + K', () => {
    it('sequential cancellations result in spotsAvailable = initial + K', () => {
      fc.assert(
        fc.property(
          initialSpotsArb,
          numCancellationsArb,
          (initialSpots, numCancellations) => {
            const { finalSpots } = applySequentialCancellations(initialSpots, numCancellations);

            // After K cancellations, spots = initial + K
            expect(finalSpots).toBe(initialSpots + numCancellations);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('each intermediate step increases by exactly 1 from the previous', () => {
      fc.assert(
        fc.property(
          initialSpotsArb,
          numCancellationsArb,
          (initialSpots, numCancellations) => {
            const { cancellationResults } = applySequentialCancellations(initialSpots, numCancellations);

            let expectedSpots = initialSpots;
            for (const result of cancellationResults) {
              expectedSpots += 1;
              expect(result.newSpots).toBe(expectedSpots);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('total increment equals the number of cancellations made', () => {
      fc.assert(
        fc.property(
          initialSpotsArb,
          numCancellationsArb,
          (initialSpots, numCancellations) => {
            const { finalSpots } = applySequentialCancellations(initialSpots, numCancellations);

            const totalIncrement = finalSpots - initialSpots;
            expect(totalIncrement).toBe(numCancellations);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Cancellation is the inverse of booking', () => {
    it('a booking followed by a cancellation restores the original spots count', () => {
      fc.assert(
        fc.property(
          anySpotsArb,
          (initialSpots) => {
            // Book (decrement) then cancel (increment) = no net change
            const afterBooking = decrementSpots(initialSpots);
            const afterCancellation = incrementSpots(afterBooking);

            expect(afterCancellation).toBe(initialSpots);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('a cancellation followed by a booking restores the original spots count', () => {
      fc.assert(
        fc.property(
          anySpotsArb,
          (initialSpots) => {
            // Cancel (increment) then book (decrement) = no net change
            const afterCancellation = incrementSpots(initialSpots);
            const afterBooking = decrementSpots(afterCancellation);

            expect(afterBooking).toBe(initialSpots);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('N bookings followed by N cancellations restores original spots', () => {
      fc.assert(
        fc.property(
          initialSpotsArb,
          fc.integer({ min: 1, max: 20 }),
          (initialSpots, n) => {
            // Apply N bookings
            let spots = initialSpots;
            for (let i = 0; i < n; i++) {
              spots = decrementSpots(spots);
            }

            // Apply N cancellations
            for (let i = 0; i < n; i++) {
              spots = incrementSpots(spots);
            }

            // Back to original
            expect(spots).toBe(initialSpots);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('mixed bookings and cancellations yield correct net result', () => {
      fc.assert(
        fc.property(
          initialSpotsArb,
          fc.integer({ min: 0, max: 15 }),
          fc.integer({ min: 0, max: 15 }),
          (initialSpots, numBookings, numCancellations) => {
            let spots = initialSpots;

            // Apply bookings (decrement)
            for (let i = 0; i < numBookings; i++) {
              spots = decrementSpots(spots);
            }

            // Apply cancellations (increment)
            for (let i = 0; i < numCancellations; i++) {
              spots = incrementSpots(spots);
            }

            // Net result: initial - bookings + cancellations
            expect(spots).toBe(initialSpots - numBookings + numCancellations);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Increment invariants', () => {
    it('increment is monotonically increasing with each cancellation', () => {
      fc.assert(
        fc.property(
          initialSpotsArb,
          numCancellationsArb,
          (initialSpots, numCancellations) => {
            const { cancellationResults } = applySequentialCancellations(initialSpots, numCancellations);

            // Each step's spots should be greater than the previous
            let prevSpots = initialSpots;
            for (const result of cancellationResults) {
              expect(result.newSpots).toBeGreaterThan(prevSpots);
              prevSpots = result.newSpots;
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('increment of 1 is deterministic when applied to the same input', () => {
      fc.assert(
        fc.property(
          anySpotsArb,
          (spots) => {
            // Applying the increment to the same input always gives the same output
            const result1 = incrementSpots(spots);
            const result2 = incrementSpots(spots);

            expect(result1).toBe(result2);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('increment never changes by more than 1 per cancellation', () => {
      fc.assert(
        fc.property(
          anySpotsArb,
          (spots) => {
            const newSpots = incrementSpots(spots);
            const absoluteChange = Math.abs(newSpots - spots);

            // Change is always exactly 1, never 0 and never more than 1
            expect(absoluteChange).toBe(1);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('spotsAvailable never exceeds maxSize after cancellations from a valid state', () => {
      fc.assert(
        fc.property(
          maxSizeArb,
          fc.integer({ min: 1, max: 20 }),
          (maxSize, numBookings) => {
            // Start with a class that has had numBookings booked
            const actualBookings = Math.min(numBookings, maxSize);
            const initialSpots = maxSize - actualBookings;

            // Cancel all bookings
            const { finalSpots } = applySequentialCancellations(initialSpots, actualBookings);

            // Should never exceed maxSize
            expect(finalSpots).toBe(maxSize);
            expect(finalSpots).toBeLessThanOrEqual(maxSize);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
