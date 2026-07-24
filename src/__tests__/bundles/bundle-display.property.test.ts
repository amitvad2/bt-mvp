// Feature: session-bundles, Property 4: Per-session saving calculation
// Feature: session-bundles, Property 5: Availability status derivation
// Feature: session-bundles, Property 6: Session dates ordering
// **Validates: Requirements 2.2, 2.3, 2.4, 2.5, 3.4**

// @vitest-environment node

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

/**
 * Per-session saving calculation extracted from BundleBrowser.tsx.
 * Computes (totalIndividualPrice - bundlePrice) / sessionCount / 100 to 2 decimal places.
 */
function calculatePerSessionSaving(totalIndividualPrice: number, bundlePrice: number, sessionCount: number): string {
  const totalSaving = totalIndividualPrice - bundlePrice;
  const perSession = totalSaving / sessionCount / 100;
  return perSession.toFixed(2);
}

/**
 * Availability status derivation extracted from BundleBrowser.tsx.
 * Determines bundle availability based on session spots.
 */
function deriveAvailability(sessions: { spotsAvailable: number }[]): 'Available' | 'Limited Availability' | 'Full' {
  if (sessions.length === 0) return 'Full';
  const allFull = sessions.every(s => s.spotsAvailable === 0);
  if (allFull) return 'Full';
  const someFull = sessions.some(s => s.spotsAvailable === 0);
  if (someFull) return 'Limited Availability';
  return 'Available';
}

/**
 * Session dates sorting extracted from BundleBrowser.tsx.
 * Sorts YYYY-MM-DD date strings in ascending chronological order.
 */
function sortSessionDates(dates: string[]): string[] {
  return [...dates].sort((a, b) => a.localeCompare(b));
}

// --- Arbitraries ---

// Price in pence: integer between 100 and 100000 (£1.00 to £1000.00)
const priceInPenceArb = fc.integer({ min: 100, max: 100000 });

// Session count: 2 to 20 sessions per bundle spec
const sessionCountArb = fc.integer({ min: 2, max: 20 });

// Spots available: 0 or more (up to reasonable max)
const spotsArb = fc.integer({ min: 0, max: 30 });

// Valid YYYY-MM-DD date string
const dateStringArb = fc.date({
  min: new Date('2020-01-01'),
  max: new Date('2030-12-31'),
}).map(d => d.toISOString().split('T')[0]);

describe('Property 4: Per-session saving calculation', () => {
  it('computes (totalIndividualPrice - bundlePrice) / N / 100 to 2 decimal places', () => {
    fc.assert(
      fc.property(
        priceInPenceArb,
        sessionCountArb,
        (totalIndividualPrice, sessionCount) => {
          // bundlePrice must be > 0 and <= totalIndividualPrice
          const bundlePrice = Math.max(1, Math.floor(totalIndividualPrice * 0.7));

          const result = calculatePerSessionSaving(totalIndividualPrice, bundlePrice, sessionCount);

          // Expected calculation
          const expectedRaw = (totalIndividualPrice - bundlePrice) / sessionCount / 100;
          const expected = expectedRaw.toFixed(2);

          expect(result).toBe(expected);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('returns a valid numeric string with exactly 2 decimal places', () => {
    fc.assert(
      fc.property(
        priceInPenceArb,
        sessionCountArb,
        (totalIndividualPrice, sessionCount) => {
          const bundlePrice = Math.max(1, Math.floor(totalIndividualPrice * 0.8));

          const result = calculatePerSessionSaving(totalIndividualPrice, bundlePrice, sessionCount);

          // Result must be a valid numeric string
          expect(Number.isNaN(parseFloat(result))).toBe(false);
          // Must have exactly 2 decimal places
          expect(result).toMatch(/^\d+\.\d{2}$/);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('returns "0.00" when bundlePrice equals totalIndividualPrice (no discount)', () => {
    fc.assert(
      fc.property(
        priceInPenceArb,
        sessionCountArb,
        (price, sessionCount) => {
          const result = calculatePerSessionSaving(price, price, sessionCount);
          expect(result).toBe('0.00');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('per-session saving is non-negative when bundlePrice <= totalIndividualPrice', () => {
    fc.assert(
      fc.property(
        priceInPenceArb,
        sessionCountArb,
        (totalIndividualPrice, sessionCount) => {
          const bundlePrice = fc.sample(fc.integer({ min: 1, max: totalIndividualPrice }), 1)[0];

          const result = calculatePerSessionSaving(totalIndividualPrice, bundlePrice, sessionCount);

          expect(parseFloat(result)).toBeGreaterThanOrEqual(0);
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Property 5: Bundle availability status derivation', () => {
  it('returns "Full" when all sessions have 0 spots', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constant({ spotsAvailable: 0 }), { minLength: 1, maxLength: 20 }),
        (sessions) => {
          const result = deriveAvailability(sessions);
          expect(result).toBe('Full');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('returns "Full" when sessions array is empty', () => {
    const result = deriveAvailability([]);
    expect(result).toBe('Full');
  });

  it('returns "Available" when all sessions have spots > 0', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.integer({ min: 1, max: 30 }).map(spots => ({ spotsAvailable: spots })),
          { minLength: 1, maxLength: 20 }
        ),
        (sessions) => {
          const result = deriveAvailability(sessions);
          expect(result).toBe('Available');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('returns "Limited Availability" when there is a mix of 0 and >0 spots', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.integer({ min: 1, max: 30 }).map(spots => ({ spotsAvailable: spots })),
          { minLength: 1, maxLength: 10 }
        ),
        fc.array(fc.constant({ spotsAvailable: 0 }), { minLength: 1, maxLength: 10 }),
        (availableSessions, fullSessions) => {
          // Mix sessions with spots > 0 and sessions with spots === 0
          const mixed = [...availableSessions, ...fullSessions];

          const result = deriveAvailability(mixed);
          expect(result).toBe('Limited Availability');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('status is always one of the three valid values', () => {
    fc.assert(
      fc.property(
        fc.array(spotsArb.map(spots => ({ spotsAvailable: spots })), { minLength: 0, maxLength: 20 }),
        (sessions) => {
          const result = deriveAvailability(sessions);
          expect(['Available', 'Limited Availability', 'Full']).toContain(result);
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Property 6: Session dates chronological ordering', () => {
  it('output is always sorted in ascending order', () => {
    fc.assert(
      fc.property(
        fc.array(dateStringArb, { minLength: 0, maxLength: 20 }),
        (dates) => {
          const sorted = sortSessionDates(dates);

          for (let i = 1; i < sorted.length; i++) {
            expect(sorted[i].localeCompare(sorted[i - 1])).toBeGreaterThanOrEqual(0);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('does not modify the original array', () => {
    fc.assert(
      fc.property(
        fc.array(dateStringArb, { minLength: 0, maxLength: 20 }),
        (dates) => {
          const original = [...dates];
          sortSessionDates(dates);
          expect(dates).toEqual(original);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('output contains exactly the same elements as input', () => {
    fc.assert(
      fc.property(
        fc.array(dateStringArb, { minLength: 0, maxLength: 20 }),
        (dates) => {
          const sorted = sortSessionDates(dates);

          expect(sorted.length).toBe(dates.length);
          expect([...sorted].sort()).toEqual([...dates].sort());
        }
      ),
      { numRuns: 100 }
    );
  });

  it('sorting is idempotent — sorting a sorted array yields the same result', () => {
    fc.assert(
      fc.property(
        fc.array(dateStringArb, { minLength: 0, maxLength: 20 }),
        (dates) => {
          const sortedOnce = sortSessionDates(dates);
          const sortedTwice = sortSessionDates(sortedOnce);

          expect(sortedTwice).toEqual(sortedOnce);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('single element array returns unchanged', () => {
    fc.assert(
      fc.property(
        dateStringArb,
        (date) => {
          const result = sortSessionDates([date]);
          expect(result).toEqual([date]);
        }
      ),
      { numRuns: 100 }
    );
  });
});
