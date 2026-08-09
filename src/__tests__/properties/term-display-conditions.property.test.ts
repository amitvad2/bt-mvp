// Feature: recurring-term-classes, Property 4: Term class display conditions
// **Validates: Requirements 3.1, 3.5, 7.1, 7.3**

// @vitest-environment node

import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { isTermClassActive, isTermClassExpired } from '@/lib/term-utils';

/**
 * Property 4: Term class display conditions.
 *
 * For any term class, it SHALL be displayed on public pages if and only if
 * `spotsAvailable > 0` AND the current date is on or before `termEndDate`.
 *
 * We test:
 * 1. isTermClassActive returns true iff both conditions are met
 * 2. isTermClassExpired returns true iff date is past the termEndDate
 */

// Helper to format date as YYYY-MM-DD
function toYYYYMMDD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Arbitrary for a date within a reasonable range (2020-2030)
// Using integer-based generation to avoid NaN date edge cases from fc.date()
const dateArb = fc.integer({ min: 0, max: 3650 }).map((daysOffset) => {
  const base = new Date('2020-01-01T00:00:00');
  base.setDate(base.getDate() + daysOffset);
  return base;
});

// Arbitrary for spotsAvailable (including 0 and positive values)
const spotsArb = fc.integer({ min: 0, max: 100 });

describe('Feature: recurring-term-classes, Property 4: Term class display conditions', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('isTermClassActive returns true iff spotsAvailable > 0 AND current date <= termEndDate', () => {
    fc.assert(
      fc.property(
        dateArb, // "today" (the mocked current date)
        dateArb, // termEndDate
        spotsArb,
        (today, termEnd, spots) => {
          // Mock the current date
          vi.useFakeTimers();
          vi.setSystemTime(today);

          const termEndDate = toYYYYMMDD(termEnd);
          const result = isTermClassActive(termEndDate, spots);

          // Compute expected: today (midnight) <= termEndDate (midnight) AND spots > 0
          const todayMidnight = new Date(today);
          todayMidnight.setHours(0, 0, 0, 0);
          const endMidnight = new Date(termEndDate + 'T00:00:00');

          const dateCondition = endMidnight >= todayMidnight;
          const spotsCondition = spots > 0;
          const expected = dateCondition && spotsCondition;

          expect(result).toBe(expected);

          vi.useRealTimers();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('isTermClassActive returns false when spotsAvailable is 0 regardless of date', () => {
    fc.assert(
      fc.property(
        dateArb, // "today"
        dateArb, // termEndDate (future, today, or past)
        (today, termEnd) => {
          vi.useFakeTimers();
          vi.setSystemTime(today);

          const termEndDate = toYYYYMMDD(termEnd);
          const result = isTermClassActive(termEndDate, 0);

          // Should always be false when spots === 0
          expect(result).toBe(false);

          vi.useRealTimers();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('isTermClassActive returns false when termEndDate is in the past regardless of spots', () => {
    fc.assert(
      fc.property(
        dateArb, // "today"
        fc.integer({ min: 1, max: 100 }), // positive spots
        (today, spots) => {
          vi.useFakeTimers();
          vi.setSystemTime(today);

          // Create a termEndDate that is strictly in the past (at least 1 day before today)
          const pastDate = new Date(today);
          pastDate.setDate(pastDate.getDate() - 1);
          const termEndDate = toYYYYMMDD(pastDate);

          const result = isTermClassActive(termEndDate, spots);

          expect(result).toBe(false);

          vi.useRealTimers();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('isTermClassActive returns true when termEndDate is today and spots > 0', () => {
    fc.assert(
      fc.property(
        dateArb, // "today"
        fc.integer({ min: 1, max: 100 }), // positive spots
        (today, spots) => {
          vi.useFakeTimers();
          vi.setSystemTime(today);

          // termEndDate is exactly today
          const termEndDate = toYYYYMMDD(today);

          const result = isTermClassActive(termEndDate, spots);

          expect(result).toBe(true);

          vi.useRealTimers();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('isTermClassExpired returns true iff current date is past the termEndDate', () => {
    fc.assert(
      fc.property(
        dateArb, // "today"
        dateArb, // termEndDate
        (today, termEnd) => {
          vi.useFakeTimers();
          vi.setSystemTime(today);

          const termEndDate = toYYYYMMDD(termEnd);
          const result = isTermClassExpired(termEndDate);

          // Expected: today (midnight) > endDate (midnight)
          const todayMidnight = new Date(today);
          todayMidnight.setHours(0, 0, 0, 0);
          const endMidnight = new Date(termEndDate + 'T00:00:00');

          const expected = todayMidnight > endMidnight;

          expect(result).toBe(expected);

          vi.useRealTimers();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('isTermClassExpired and isTermClassActive are complementary for spots > 0', () => {
    fc.assert(
      fc.property(
        dateArb, // "today"
        dateArb, // termEndDate
        fc.integer({ min: 1, max: 100 }), // positive spots
        (today, termEnd, spots) => {
          vi.useFakeTimers();
          vi.setSystemTime(today);

          const termEndDate = toYYYYMMDD(termEnd);

          const active = isTermClassActive(termEndDate, spots);
          const expired = isTermClassExpired(termEndDate);

          // When spots > 0: active iff NOT expired (since both conditions collapse to date check)
          expect(active).toBe(!expired);

          vi.useRealTimers();
        }
      ),
      { numRuns: 100 }
    );
  });
});
