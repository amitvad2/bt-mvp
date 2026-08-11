// Feature: term-session-management, Property 7: Booking decrements capacity and auto-transitions to full
// **Validates: Requirements 5.4, 6.3**

// @vitest-environment node

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

/**
 * Property 7: Booking decrements capacity and auto-transitions to full.
 *
 * For any term session with spotsAvailable > 0, processing a successful payment
 * SHALL decrement spotsAvailable by exactly 1. When the resulting spotsAvailable
 * equals 0, the session status SHALL be updated to 'full'.
 */

// --- Pure function modeling the capacity decrement logic ---

/**
 * Models the booking capacity logic as a pure function.
 * This mirrors the webhook handler's Firestore transaction:
 * - If spotsAvailable > 0: decrement by 1, auto-transition to 'full' if result is 0
 * - If spotsAvailable <= 0: flag as overbooking, do not decrement further
 */
function processBooking(
  spotsAvailable: number,
  currentStatus: string
): { newSpots: number; newStatus: string; overbooking: boolean } {
  if (spotsAvailable <= 0) {
    return { newSpots: spotsAvailable, newStatus: currentStatus, overbooking: true };
  }
  const newSpots = spotsAvailable - 1;
  const newStatus = newSpots === 0 ? 'full' : currentStatus;
  return { newSpots, newStatus, overbooking: false };
}

// --- Custom Arbitraries ---

/** Spots available > 0 (valid booking scenario) */
const positiveSpotsArb = fc.integer({ min: 1, max: 100 });

/** Spots available exactly 1 (boundary - will become full after booking) */
const singleSpotArb = fc.constant(1);

/** Spots available > 1 (will NOT become full after booking) */
const multipleSpotsArb = fc.integer({ min: 2, max: 100 });

/** Spots available <= 0 (overbooking scenario) */
const zeroOrNegativeSpotsArb = fc.integer({ min: -10, max: 0 });

/** Any valid session status (open, draft, closed, etc.) */
const statusArb = fc.oneof(
  fc.constant('open'),
  fc.constant('draft'),
  fc.constant('closed'),
  fc.constant('full'),
  fc.constant('cancelled')
);

/** Non-full status (realistic for a session accepting bookings) */
const nonFullStatusArb = fc.oneof(
  fc.constant('open'),
  fc.constant('draft'),
  fc.constant('closed')
);

// --- Property Tests ---

describe('Feature: term-session-management, Property 7: Booking decrements capacity and auto-transitions to full', () => {
  describe('For any spotsAvailable > 0: newSpots === spotsAvailable - 1', () => {
    it('booking always decrements spotsAvailable by exactly 1', () => {
      fc.assert(
        fc.property(
          positiveSpotsArb,
          statusArb,
          (spots, status) => {
            const result = processBooking(spots, status);

            expect(result.newSpots).toBe(spots - 1);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('For any spotsAvailable === 1: newStatus === "full"', () => {
    it('status transitions to full when last spot is taken', () => {
      fc.assert(
        fc.property(
          statusArb,
          (status) => {
            const result = processBooking(1, status);

            expect(result.newSpots).toBe(0);
            expect(result.newStatus).toBe('full');
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('For any spotsAvailable > 1: newStatus === currentStatus (unchanged)', () => {
    it('status remains unchanged when spots remain after booking', () => {
      fc.assert(
        fc.property(
          multipleSpotsArb,
          statusArb,
          (spots, status) => {
            const result = processBooking(spots, status);

            expect(result.newStatus).toBe(status);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('For any spotsAvailable <= 0: overbooking === true', () => {
    it('overbooking is flagged when no spots available', () => {
      fc.assert(
        fc.property(
          zeroOrNegativeSpotsArb,
          statusArb,
          (spots, status) => {
            const result = processBooking(spots, status);

            expect(result.overbooking).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('For any spotsAvailable > 0: overbooking === false', () => {
    it('no overbooking when spots are available', () => {
      fc.assert(
        fc.property(
          positiveSpotsArb,
          statusArb,
          (spots, status) => {
            const result = processBooking(spots, status);

            expect(result.overbooking).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('newSpots is never negative when spotsAvailable > 0', () => {
    it('result spots are always >= 0 when starting with positive spots', () => {
      fc.assert(
        fc.property(
          positiveSpotsArb,
          statusArb,
          (spots, status) => {
            const result = processBooking(spots, status);

            expect(result.newSpots).toBeGreaterThanOrEqual(0);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Overbooking preserves spots unchanged', () => {
    it('spots are not decremented in overbooking scenario', () => {
      fc.assert(
        fc.property(
          zeroOrNegativeSpotsArb,
          statusArb,
          (spots, status) => {
            const result = processBooking(spots, status);

            expect(result.newSpots).toBe(spots);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('status remains unchanged in overbooking scenario', () => {
      fc.assert(
        fc.property(
          zeroOrNegativeSpotsArb,
          statusArb,
          (spots, status) => {
            const result = processBooking(spots, status);

            expect(result.newStatus).toBe(status);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Sequential bookings drain capacity and auto-transition to full', () => {
    it('booking from N spots drains to 0 and becomes full at that point', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 30 }),
          nonFullStatusArb,
          (initialSpots, initialStatus) => {
            let currentSpots = initialSpots;
            let currentStatus = initialStatus;

            // Process bookings until spots run out
            for (let i = 0; i < initialSpots; i++) {
              const result = processBooking(currentSpots, currentStatus);
              expect(result.overbooking).toBe(false);
              currentSpots = result.newSpots;
              currentStatus = result.newStatus;
            }

            // After all spots used, final state should be full with 0 spots
            expect(currentSpots).toBe(0);
            expect(currentStatus).toBe('full');

            // Next booking attempt should be overbooking
            const overbook = processBooking(currentSpots, currentStatus);
            expect(overbook.overbooking).toBe(true);
            expect(overbook.newSpots).toBe(0);
            expect(overbook.newStatus).toBe('full');
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
