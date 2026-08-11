// Feature: term-session-management, Property 2: Invalid date range validation rejects bad inputs
// **Validates: Requirements 1.5, 1.6**

// @vitest-environment node

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { validateTermDates } from '@/lib/term-schedule-utils';

/**
 * Property 2: Invalid date range validation rejects bad inputs.
 *
 * For any (startDate, endDate, dayOfWeek) triple where either:
 *   (a) endDate <= startDate, or
 *   (b) the specified dayOfWeek does not occur between startDate and endDate inclusive
 * the validation function SHALL return an error and prevent form submission.
 */

// --- Helpers ---

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

/** Maps day name to JS Date getDay() index (0 = Sunday) */
const DAY_INDEX: Record<string, number> = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
};

function toDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

// --- Arbitraries ---

/** Generates a valid YYYY-MM-DD date string within a reasonable range */
const dateArb = fc.date({
  min: new Date(2020, 0, 1),
  max: new Date(2035, 11, 31),
}).map(toDateString);

/** Generates a day of week string */
const dayOfWeekArb = fc.constantFrom(...DAYS_OF_WEEK);

/**
 * Generates a (startDate, endDate) pair where endDate <= startDate.
 * Case (a): endDate is the same day as startDate or earlier.
 */
const invalidDateRangeArb = fc.tuple(dateArb, fc.nat({ max: 365 })).map(([startStr, offset]) => {
  const start = parseDate(startStr);
  // endDate = startDate - offset (so endDate <= startDate; offset=0 means equal)
  const end = new Date(start);
  end.setDate(end.getDate() - offset);
  return { startDate: startStr, endDate: toDateString(end) };
});

/**
 * Generates a (startDate, endDate, dayOfWeek) triple where the range is valid
 * (end > start) but the range is too short for the specified day to occur.
 * Case (b): dayOfWeek does not occur between start and end.
 *
 * Strategy: pick a start date, then set end date to be 1-5 days later (less than a week),
 * and pick a dayOfWeek that does NOT fall in that short range.
 */
const dayNotInRangeArb = fc.tuple(
  dateArb,
  fc.integer({ min: 1, max: 5 })
).chain(([startStr, gap]) => {
  const start = parseDate(startStr);
  const end = new Date(start);
  end.setDate(end.getDate() + gap);

  // Determine which days of week DO occur in this range
  const daysInRange = new Set<number>();
  const cursor = new Date(start);
  while (cursor <= end) {
    daysInRange.add(cursor.getDay());
    cursor.setDate(cursor.getDate() + 1);
  }

  // Find days of week NOT in the range
  const daysNotInRange = DAYS_OF_WEEK.filter(day => !daysInRange.has(DAY_INDEX[day]));

  if (daysNotInRange.length === 0) {
    // If all days are covered (gap >= 6), fall back to a deterministic choice
    // This shouldn't happen since max gap is 5, but guard just in case
    return fc.constant({
      startDate: startStr,
      endDate: toDateString(end),
      dayOfWeek: 'Monday' as string, // won't be used
      valid: false,
    });
  }

  return fc.constantFrom(...daysNotInRange).map(day => ({
    startDate: startStr,
    endDate: toDateString(end),
    dayOfWeek: day,
    valid: true,
  }));
});

/**
 * Generates a valid triple where end > start AND dayOfWeek occurs in the range.
 * Used to verify the positive case (valid inputs return valid: true).
 */
const validTripleArb = fc.tuple(
  dateArb,
  fc.integer({ min: 7, max: 365 }), // At least 7 days guarantees any day occurs
  dayOfWeekArb
).map(([startStr, gap, dayOfWeek]) => {
  const start = parseDate(startStr);
  const end = new Date(start);
  end.setDate(end.getDate() + gap);
  return { startDate: startStr, endDate: toDateString(end), dayOfWeek };
});

// --- Property Tests ---

describe('Feature: term-session-management, Property 2: Invalid date range validation rejects bad inputs', () => {
  describe('Case (a): endDate <= startDate returns error', () => {
    it('rejects when endDate is before or equal to startDate', () => {
      fc.assert(
        fc.property(
          invalidDateRangeArb,
          dayOfWeekArb,
          ({ startDate, endDate }, dayOfWeek) => {
            const result = validateTermDates(startDate, endDate, dayOfWeek);

            expect(result.valid).toBe(false);
            expect(result.error).toBeDefined();
            expect(typeof result.error).toBe('string');
            expect(result.error!.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('endDate exactly equal to startDate returns error', () => {
      fc.assert(
        fc.property(
          dateArb,
          dayOfWeekArb,
          (dateStr, dayOfWeek) => {
            // endDate === startDate
            const result = validateTermDates(dateStr, dateStr, dayOfWeek);

            expect(result.valid).toBe(false);
            expect(result.error).toBeDefined();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Case (b): dayOfWeek not occurring in range returns error', () => {
    it('rejects when the specified day does not occur between start and end', () => {
      fc.assert(
        fc.property(
          dayNotInRangeArb.filter(triple => triple.valid),
          ({ startDate, endDate, dayOfWeek }) => {
            const result = validateTermDates(startDate, endDate, dayOfWeek);

            expect(result.valid).toBe(false);
            expect(result.error).toBeDefined();
            expect(typeof result.error).toBe('string');
            expect(result.error!.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Positive case: valid inputs return valid: true', () => {
    it('accepts when end > start AND dayOfWeek occurs in the range', () => {
      fc.assert(
        fc.property(
          validTripleArb,
          ({ startDate, endDate, dayOfWeek }) => {
            const result = validateTermDates(startDate, endDate, dayOfWeek);

            expect(result.valid).toBe(true);
            expect(result.error).toBeUndefined();
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
