// Feature: term-session-management, Property 1: Schedule generation produces valid date occurrences
// **Validates: Requirements 1.3, 1.4**

// @vitest-environment node

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { generateSchedule } from '@/lib/term-schedule-utils';

/**
 * Property 1: Schedule generation produces valid date occurrences.
 *
 * For any valid start date, end date, and day of week where end date > start date
 * and the day occurs at least once in the range: the generated schedule array SHALL
 * contain exactly one entry for each occurrence of that day of week between start and
 * end dates (inclusive), all entries SHALL be chronologically sorted, each entry SHALL
 * have the `date` field populated with a valid YYYY-MM-DD string that falls on the
 * specified day of week, and all recipe fields SHALL be empty strings with status 'active'.
 */

// --- Constants ---

const DAYS_OF_WEEK = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

/** Maps day name to JS Date.getDay() index */
const DAY_INDEX: Record<string, number> = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
};

// --- Helper Functions ---

/** Formats a Date to YYYY-MM-DD */
function toDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Parses YYYY-MM-DD to a Date */
function parseDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

// --- Custom Arbitraries ---

/** Generates a day of week string */
const dayOfWeekArb = fc.constantFrom(...DAYS_OF_WEEK);

/**
 * Generates a valid date range (start < end) with a span of 1–52 weeks.
 * Ensures the dayOfWeek occurs at least once in the range.
 * Returns { startDate: string, endDate: string, dayOfWeek: string }
 */
const validTermInputArb = fc
  .record({
    // Base date as a timestamp between 2020-01-01 and 2030-12-31
    baseTimestamp: fc.integer({
      min: new Date(2020, 0, 1).getTime(),
      max: new Date(2030, 11, 31).getTime(),
    }),
    // Span between 7 and 364 days (1–52 weeks)
    spanDays: fc.integer({ min: 7, max: 364 }),
    dayOfWeek: dayOfWeekArb,
  })
  .map(({ baseTimestamp, spanDays, dayOfWeek }) => {
    const startDate = new Date(baseTimestamp);
    // Zero out time to midnight
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + spanDays);

    return {
      startDate: toDateString(startDate),
      endDate: toDateString(endDate),
      dayOfWeek,
    };
  })
  // Filter to ensure at least one occurrence exists
  .filter(({ startDate, endDate, dayOfWeek }) => {
    const start = parseDate(startDate);
    const end = parseDate(endDate);
    const targetDay = DAY_INDEX[dayOfWeek];

    // Find first occurrence on or after start
    const currentDay = start.getDay();
    const daysUntilTarget = (targetDay - currentDay + 7) % 7;
    const firstOccurrence = new Date(start);
    firstOccurrence.setDate(firstOccurrence.getDate() + daysUntilTarget);

    return firstOccurrence <= end;
  });

// --- Property Tests ---

describe('Feature: term-session-management, Property 1: Schedule generation produces valid date occurrences', () => {
  describe('All entries have dates that fall on the specified day of week', () => {
    it('every generated date falls on the correct day of week', () => {
      fc.assert(
        fc.property(validTermInputArb, ({ startDate, endDate, dayOfWeek }) => {
          const schedule = generateSchedule(startDate, endDate, dayOfWeek);
          const expectedDayIndex = DAY_INDEX[dayOfWeek];

          for (const entry of schedule) {
            const date = parseDate(entry.date);
            expect(date.getDay()).toBe(expectedDayIndex);
          }
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Entries are in ascending chronological order', () => {
    it('each date is strictly after the previous date', () => {
      fc.assert(
        fc.property(validTermInputArb, ({ startDate, endDate, dayOfWeek }) => {
          const schedule = generateSchedule(startDate, endDate, dayOfWeek);

          for (let i = 1; i < schedule.length; i++) {
            expect(schedule[i].date > schedule[i - 1].date).toBe(true);
          }
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('All recipe fields are empty strings and status is active', () => {
    it('recipeId, recipeName, recipePhotoUrl are empty strings for all entries', () => {
      fc.assert(
        fc.property(validTermInputArb, ({ startDate, endDate, dayOfWeek }) => {
          const schedule = generateSchedule(startDate, endDate, dayOfWeek);

          for (const entry of schedule) {
            expect(entry.recipeId).toBe('');
            expect(entry.recipeName).toBe('');
            expect(entry.recipePhotoUrl).toBe('');
          }
        }),
        { numRuns: 100 }
      );
    });

    it('all entries have status "active"', () => {
      fc.assert(
        fc.property(validTermInputArb, ({ startDate, endDate, dayOfWeek }) => {
          const schedule = generateSchedule(startDate, endDate, dayOfWeek);

          for (const entry of schedule) {
            expect(entry.status).toBe('active');
          }
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('First date >= startDate and last date <= endDate', () => {
    it('first entry date is on or after the start date', () => {
      fc.assert(
        fc.property(validTermInputArb, ({ startDate, endDate, dayOfWeek }) => {
          const schedule = generateSchedule(startDate, endDate, dayOfWeek);

          expect(schedule.length).toBeGreaterThan(0);
          expect(schedule[0].date >= startDate).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('last entry date is on or before the end date', () => {
      fc.assert(
        fc.property(validTermInputArb, ({ startDate, endDate, dayOfWeek }) => {
          const schedule = generateSchedule(startDate, endDate, dayOfWeek);

          expect(schedule.length).toBeGreaterThan(0);
          expect(schedule[schedule.length - 1].date <= endDate).toBe(true);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Dates are exactly 7 days apart', () => {
    it('consecutive entries are exactly 7 days apart', () => {
      fc.assert(
        fc.property(validTermInputArb, ({ startDate, endDate, dayOfWeek }) => {
          const schedule = generateSchedule(startDate, endDate, dayOfWeek);

          for (let i = 1; i < schedule.length; i++) {
            const prevParts = schedule[i - 1].date.split('-').map(Number);
            const currParts = schedule[i].date.split('-').map(Number);

            // Use UTC to avoid DST issues when computing day differences
            const prevUtc = Date.UTC(prevParts[0], prevParts[1] - 1, prevParts[2]);
            const currUtc = Date.UTC(currParts[0], currParts[1] - 1, currParts[2]);

            const diffDays = (currUtc - prevUtc) / (1000 * 60 * 60 * 24);

            expect(diffDays).toBe(7);
          }
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Schedule contains exactly one entry per occurrence of the day in the range', () => {
    it('count matches the expected number of occurrences', () => {
      fc.assert(
        fc.property(validTermInputArb, ({ startDate, endDate, dayOfWeek }) => {
          const schedule = generateSchedule(startDate, endDate, dayOfWeek);
          const targetDay = DAY_INDEX[dayOfWeek];

          // Independently count occurrences of dayOfWeek in [startDate, endDate]
          const start = parseDate(startDate);
          const end = parseDate(endDate);
          let expectedCount = 0;
          const cursor = new Date(start);

          // Find first occurrence
          const daysUntilTarget = (targetDay - cursor.getDay() + 7) % 7;
          cursor.setDate(cursor.getDate() + daysUntilTarget);

          while (cursor <= end) {
            expectedCount++;
            cursor.setDate(cursor.getDate() + 7);
          }

          expect(schedule.length).toBe(expectedCount);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Each date is a valid YYYY-MM-DD string', () => {
    it('all dates match the YYYY-MM-DD format', () => {
      fc.assert(
        fc.property(validTermInputArb, ({ startDate, endDate, dayOfWeek }) => {
          const schedule = generateSchedule(startDate, endDate, dayOfWeek);
          const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

          for (const entry of schedule) {
            expect(entry.date).toMatch(dateRegex);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('all dates parse to valid Date objects', () => {
      fc.assert(
        fc.property(validTermInputArb, ({ startDate, endDate, dayOfWeek }) => {
          const schedule = generateSchedule(startDate, endDate, dayOfWeek);

          for (const entry of schedule) {
            const date = parseDate(entry.date);
            expect(isNaN(date.getTime())).toBe(false);
            // Verify round-trip: parsing and re-formatting gives the same string
            expect(toDateString(date)).toBe(entry.date);
          }
        }),
        { numRuns: 100 }
      );
    });
  });
});
