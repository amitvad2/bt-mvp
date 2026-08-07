// Feature: guest-express-checkout
// Property 1: Age Validation Correctness
// Property 10: Feature Flag API Gating
// **Validates: Requirements 3.2, 3.3, 8.5, 16.1, 16.2, 16.4**

// @vitest-environment node

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fc from 'fast-check';
import { validateChildAge } from '@/lib/guest-validation';
import { isGuestCheckoutEnabled } from '@/lib/feature-flags';

// --- Helpers ---

/**
 * Reference age calculation (same logic as validateChildAge) used to build
 * the oracle for property assertions.
 */
function calculateAge(dob: Date, sessionDate: Date): number {
  let age = sessionDate.getFullYear() - dob.getFullYear();
  const monthDiff = sessionDate.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && sessionDate.getDate() < dob.getDate())) {
    age--;
  }
  return age;
}

/** Format a Date as YYYY-MM-DD string */
function toDateString(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// --- Arbitraries ---

/**
 * Generate a valid date in a reasonable range (2000-01-01 to 2030-12-31).
 * Returns a Date object constrained to valid calendar dates.
 */
const dateArbitrary = fc
  .record({
    year: fc.integer({ min: 2000, max: 2030 }),
    month: fc.integer({ min: 1, max: 12 }),
    day: fc.integer({ min: 1, max: 28 }), // use 28 to avoid invalid day-of-month issues
  })
  .map(({ year, month, day }) => new Date(year, month - 1, day));

/**
 * Generate DOB and session date such that the child's age is non-negative
 * (session date is on or after DOB).
 */
const dobAndSessionArbitrary = fc
  .record({
    dob: dateArbitrary,
    sessionDate: dateArbitrary,
  })
  .filter(({ dob, sessionDate }) => sessionDate >= dob);

/** Age range arbitrary: ageMin <= ageMax, within sensible bounds */
const ageRangeArbitrary = fc
  .record({
    ageMin: fc.integer({ min: 0, max: 18 }),
    ageMax: fc.integer({ min: 0, max: 25 }),
  })
  .filter(({ ageMin, ageMax }) => ageMin <= ageMax);

// --- Property 1: Age Validation Correctness ---

describe('Property 1: Age Validation Correctness', () => {
  it('accepts child IFF age at session date is within [ageMin, ageMax]', () => {
    fc.assert(
      fc.property(
        dobAndSessionArbitrary,
        ageRangeArbitrary,
        ({ dob, sessionDate }, { ageMin, ageMax }) => {
          const dobStr = toDateString(dob);
          const sessionStr = toDateString(sessionDate);

          const result = validateChildAge(dobStr, sessionStr, ageMin, ageMax);

          // Oracle: compute age independently and check range
          const age = calculateAge(dob, sessionDate);
          const expected = age >= ageMin && age <= ageMax;

          expect(result).toBe(expected);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('returns true when child age is exactly ageMin (lower boundary)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 18 }),
        dateArbitrary,
        (ageMin, baseSessionDate) => {
          // Construct a DOB that is exactly ageMin years before the session date
          const dob = new Date(
            baseSessionDate.getFullYear() - ageMin,
            baseSessionDate.getMonth(),
            baseSessionDate.getDate()
          );

          const dobStr = toDateString(dob);
          const sessionStr = toDateString(baseSessionDate);
          const ageMax = ageMin + 5;

          const result = validateChildAge(dobStr, sessionStr, ageMin, ageMax);
          expect(result).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('returns true when child age is exactly ageMax (upper boundary)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 18 }),
        dateArbitrary,
        (ageMax, baseSessionDate) => {
          // Construct a DOB that is exactly ageMax years before the session date
          const dob = new Date(
            baseSessionDate.getFullYear() - ageMax,
            baseSessionDate.getMonth(),
            baseSessionDate.getDate()
          );

          const dobStr = toDateString(dob);
          const sessionStr = toDateString(baseSessionDate);
          const ageMin = Math.max(0, ageMax - 5);

          const result = validateChildAge(dobStr, sessionStr, ageMin, ageMax);
          expect(result).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('returns false when child age is below ageMin', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 5, max: 18 }),
        dateArbitrary,
        (ageMin, baseSessionDate) => {
          // Construct a DOB that makes the child younger than ageMin
          // Child born (ageMin - 1) years before session — so they are ageMin - 1
          const dob = new Date(
            baseSessionDate.getFullYear() - (ageMin - 1),
            baseSessionDate.getMonth(),
            baseSessionDate.getDate()
          );

          const dobStr = toDateString(dob);
          const sessionStr = toDateString(baseSessionDate);
          const ageMax = ageMin + 5;

          const result = validateChildAge(dobStr, sessionStr, ageMin, ageMax);
          expect(result).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('returns false when child age is above ageMax', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 5, max: 15 }),
        dateArbitrary,
        (ageMax, baseSessionDate) => {
          // Construct a DOB that makes the child older than ageMax
          // Child born (ageMax + 1) years before session — so they are ageMax + 1
          const dob = new Date(
            baseSessionDate.getFullYear() - (ageMax + 1),
            baseSessionDate.getMonth(),
            baseSessionDate.getDate()
          );

          const dobStr = toDateString(dob);
          const sessionStr = toDateString(baseSessionDate);
          const ageMin = Math.max(0, ageMax - 5);

          const result = validateChildAge(dobStr, sessionStr, ageMin, ageMax);
          expect(result).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// --- Property 10: Feature Flag API Gating ---

describe('Property 10: Feature Flag API Gating', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns true ONLY when env var is exactly the string "true"', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 50 }),
        (envValue) => {
          process.env.NEXT_PUBLIC_GUEST_CHECKOUT_ENABLED = envValue;

          const result = isGuestCheckoutEnabled();

          if (envValue === 'true') {
            expect(result).toBe(true);
          } else {
            expect(result).toBe(false);
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  it('returns false when env var is undefined', () => {
    delete process.env.NEXT_PUBLIC_GUEST_CHECKOUT_ENABLED;
    expect(isGuestCheckoutEnabled()).toBe(false);
  });

  it('returns false for common truthy-looking values that are not exactly "true"', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('True', 'TRUE', '1', 'yes', 'on', 'enabled', ' true', 'true ', ' true '),
        (envValue) => {
          process.env.NEXT_PUBLIC_GUEST_CHECKOUT_ENABLED = envValue;

          const result = isGuestCheckoutEnabled();
          expect(result).toBe(false);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('returns true when env var is set to exactly "true"', () => {
    process.env.NEXT_PUBLIC_GUEST_CHECKOUT_ENABLED = 'true';
    expect(isGuestCheckoutEnabled()).toBe(true);
  });
});
