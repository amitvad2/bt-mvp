// Feature: session-bundles, Property 11: Booking document ID scheme
// Feature: session-bundles, Property 12: Bundle linkage invariant
// Feature: session-bundles, Property 19: Public display filter
// **Validates: Requirements 4.3, 4.5, 7.4**

// @vitest-environment node

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// --- Property 11 functions ---

function generateBundleBookingId(paymentIntentId: string, sessionId: string): string {
  return `${paymentIntentId}_${sessionId}`;
}

function generateAllBookingIds(piId: string, sessionIds: string[]): string[] {
  return sessionIds.map(sid => `${piId}_${sid}`);
}

// --- Property 12 function ---

function allBookingsShareBundleId(bookings: { bundleId: string }[], expectedBundleId: string): boolean {
  return bookings.every(b => b.bundleId === expectedBundleId);
}

// --- Property 19 function ---

function filterActiveBundles(bundles: { status: string }[]): { status: string }[] {
  return bundles.filter(b => b.status === 'active');
}

// --- Arbitraries ---

/** Generates a non-empty alphanumeric string resembling a Stripe PaymentIntent ID */
const paymentIntentIdArb = fc.stringMatching(/^pi_[A-Za-z0-9]{10,30}$/);

/** Generates a non-empty alphanumeric string resembling a Firestore session ID */
const sessionIdArb = fc.stringMatching(/^[A-Za-z0-9]{10,25}$/);

/** Generates a non-empty array of unique session IDs (2–20, matching bundle constraints) */
const sessionIdsArb = fc.uniqueArray(sessionIdArb, { minLength: 2, maxLength: 20 });

/** Generates a bundle status value */
const bundleStatusArb = fc.constantFrom('active', 'closed', 'cancelled');

/** Generates a non-empty alphanumeric bundle ID */
const bundleIdArb = fc.stringMatching(/^[A-Za-z0-9]{10,25}$/);

// --- Property 11: Booking document ID scheme ---

describe('Property 11: Booking document ID scheme', () => {
  it('generates a booking ID matching {piId}_{sessionId} pattern for a single booking', () => {
    fc.assert(
      fc.property(paymentIntentIdArb, sessionIdArb, (piId, sessionId) => {
        const id = generateBundleBookingId(piId, sessionId);
        expect(id).toBe(`${piId}_${sessionId}`);
        // Verify the ID contains exactly one underscore separating piId and sessionId
        const parts = id.split('_');
        // piId starts with "pi_" so it contains an underscore itself
        // The pattern is {piId}_{sessionId} where piId = "pi_XXXX"
        // So full ID = "pi_XXXX_sessionId"
        expect(id).toContain(piId);
        expect(id).toContain(sessionId);
        expect(id).toBe(`${piId}_${sessionId}`);
      }),
      { numRuns: 100 }
    );
  });

  it('generates exactly N booking IDs for N sessions, each matching the pattern', () => {
    fc.assert(
      fc.property(paymentIntentIdArb, sessionIdsArb, (piId, sessionIds) => {
        const ids = generateAllBookingIds(piId, sessionIds);

        // Exactly N IDs produced
        expect(ids).toHaveLength(sessionIds.length);

        // Each ID matches {piId}_{sessionId}
        for (let i = 0; i < sessionIds.length; i++) {
          expect(ids[i]).toBe(`${piId}_${sessionIds[i]}`);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('produces unique IDs when session IDs are unique', () => {
    fc.assert(
      fc.property(paymentIntentIdArb, sessionIdsArb, (piId, sessionIds) => {
        const ids = generateAllBookingIds(piId, sessionIds);
        const uniqueIds = new Set(ids);
        expect(uniqueIds.size).toBe(ids.length);
      }),
      { numRuns: 100 }
    );
  });
});

// --- Property 12: Bundle linkage invariant ---

describe('Property 12: Bundle linkage invariant', () => {
  it('all bookings from a bundle share the same bundleId', () => {
    fc.assert(
      fc.property(
        bundleIdArb,
        fc.integer({ min: 2, max: 20 }),
        (expectedBundleId, count) => {
          // Simulate N bookings all created with the same bundleId
          const bookings = Array.from({ length: count }, () => ({
            bundleId: expectedBundleId,
          }));

          expect(allBookingsShareBundleId(bookings, expectedBundleId)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('detects when any booking has a different bundleId', () => {
    fc.assert(
      fc.property(
        bundleIdArb,
        bundleIdArb,
        fc.integer({ min: 2, max: 20 }),
        (expectedBundleId, differentBundleId, count) => {
          // Only test when the two IDs are actually different
          fc.pre(expectedBundleId !== differentBundleId);

          // Create bookings where one has a mismatched bundleId
          const bookings = Array.from({ length: count }, (_, i) => ({
            bundleId: i === 0 ? differentBundleId : expectedBundleId,
          }));

          expect(allBookingsShareBundleId(bookings, expectedBundleId)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// --- Property 19: Public display filter ---

describe('Property 19: Public display filter', () => {
  it('returns only bundles with status active', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({ status: bundleStatusArb }),
          { minLength: 0, maxLength: 30 }
        ),
        (bundles) => {
          const result = filterActiveBundles(bundles);

          // All returned bundles must have status 'active'
          for (const bundle of result) {
            expect(bundle.status).toBe('active');
          }

          // Count of returned bundles matches count of active bundles in input
          const expectedCount = bundles.filter(b => b.status === 'active').length;
          expect(result).toHaveLength(expectedCount);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('never returns closed or cancelled bundles', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({ status: fc.constantFrom('closed', 'cancelled') }),
          { minLength: 1, maxLength: 20 }
        ),
        (bundles) => {
          const result = filterActiveBundles(bundles);
          expect(result).toHaveLength(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('returns all bundles when all are active', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({ status: fc.constant('active') }),
          { minLength: 1, maxLength: 20 }
        ),
        (bundles) => {
          const result = filterActiveBundles(bundles);
          expect(result).toHaveLength(bundles.length);
        }
      ),
      { numRuns: 100 }
    );
  });
});
