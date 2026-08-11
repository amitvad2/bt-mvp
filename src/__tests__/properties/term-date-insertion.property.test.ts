// Feature: term-session-management, Property 5: Make-up date insertion maintains chronological order
// **Validates: Requirements 3.2**

// @vitest-environment node

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { insertDate } from '@/lib/term-schedule-utils';
import type { ScheduleEntry } from '@/types';

/**
 * Property 5: Make-up date insertion maintains chronological order.
 *
 * For any chronologically sorted schedule array and any new date, inserting
 * the new date into the schedule SHALL produce an array that remains sorted
 * in ascending chronological order by the `date` field, with the new entry
 * at the correct position.
 */

// --- Custom Arbitraries ---

/**
 * Generates a valid YYYY-MM-DD date string within a reasonable range.
 */
const dateStringArb = fc
  .date({
    min: new Date(2020, 0, 1),
    max: new Date(2030, 11, 31),
  })
  .map((d) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  });

/**
 * Generates a ScheduleEntry with a given date string.
 * Recipe fields may or may not be assigned; status is 'active' or 'skipped'.
 */
function scheduleEntryArb(dateStr: string): fc.Arbitrary<ScheduleEntry> {
  return fc.record({
    date: fc.constant(dateStr),
    recipeId: fc.oneof(fc.constant(''), fc.uuid()),
    recipeName: fc.oneof(fc.constant(''), fc.string({ minLength: 1, maxLength: 30 })),
    recipePhotoUrl: fc.oneof(fc.constant(''), fc.webUrl()),
    status: fc.oneof(fc.constant('active' as const), fc.constant('skipped' as const)),
  });
}

/**
 * Generates a chronologically sorted array of ScheduleEntry objects.
 * First generates random dates, sorts them, then creates entries for each.
 */
const sortedScheduleArb: fc.Arbitrary<ScheduleEntry[]> = fc
  .array(dateStringArb, { minLength: 0, maxLength: 20 })
  .map((dates) => [...dates].sort())
  .chain((sortedDates) =>
    fc.tuple(...sortedDates.map((d) => scheduleEntryArb(d))).map((entries) => entries)
  );

// --- Helper Functions ---

/**
 * Checks if an array of ScheduleEntry is sorted in ascending order by date.
 */
function isSortedAscending(schedule: ScheduleEntry[]): boolean {
  for (let i = 1; i < schedule.length; i++) {
    if (schedule[i].date < schedule[i - 1].date) {
      return false;
    }
  }
  return true;
}

// --- Property Tests ---

describe('Feature: term-session-management, Property 5: Make-up date insertion maintains chronological order', () => {
  describe('Result array is sorted in ascending order by date', () => {
    it('inserting any date into a sorted schedule produces a sorted result', () => {
      fc.assert(
        fc.property(
          sortedScheduleArb,
          dateStringArb,
          (schedule, newDate) => {
            const result = insertDate(schedule, newDate);

            expect(isSortedAscending(result)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('inserting a date earlier than all existing dates places it first', () => {
      fc.assert(
        fc.property(
          sortedScheduleArb.filter((s) => s.length > 0),
          (schedule) => {
            // Create a date guaranteed to be earlier than the first entry
            const firstDate = schedule[0].date;
            const earlier = new Date(firstDate);
            earlier.setDate(earlier.getDate() - 1);
            const earlierStr = `${earlier.getFullYear()}-${String(earlier.getMonth() + 1).padStart(2, '0')}-${String(earlier.getDate()).padStart(2, '0')}`;

            const result = insertDate(schedule, earlierStr);

            expect(result[0].date).toBe(earlierStr);
            expect(isSortedAscending(result)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('inserting a date later than all existing dates places it last', () => {
      fc.assert(
        fc.property(
          sortedScheduleArb.filter((s) => s.length > 0),
          (schedule) => {
            // Create a date guaranteed to be later than the last entry
            const lastDate = schedule[schedule.length - 1].date;
            const later = new Date(lastDate);
            later.setDate(later.getDate() + 1);
            const laterStr = `${later.getFullYear()}-${String(later.getMonth() + 1).padStart(2, '0')}-${String(later.getDate()).padStart(2, '0')}`;

            const result = insertDate(schedule, laterStr);

            expect(result[result.length - 1].date).toBe(laterStr);
            expect(isSortedAscending(result)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Result array has exactly original.length + 1 entries', () => {
    it('insertion always adds exactly one entry', () => {
      fc.assert(
        fc.property(
          sortedScheduleArb,
          dateStringArb,
          (schedule, newDate) => {
            const result = insertDate(schedule, newDate);

            expect(result.length).toBe(schedule.length + 1);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('The new date appears in the result array', () => {
    it('the inserted date is present in the result', () => {
      fc.assert(
        fc.property(
          sortedScheduleArb,
          dateStringArb,
          (schedule, newDate) => {
            const result = insertDate(schedule, newDate);

            const hasNewDate = result.some((entry) => entry.date === newDate);
            expect(hasNewDate).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('The new entry has correct default fields', () => {
    it('new entry has empty recipeId, recipeName, recipePhotoUrl, and status active', () => {
      fc.assert(
        fc.property(
          sortedScheduleArb,
          dateStringArb,
          (schedule, newDate) => {
            const result = insertDate(schedule, newDate);

            // Find the newly inserted entry — it's the one with the new date
            // and default (empty) recipe fields
            const newEntries = result.filter(
              (entry) =>
                entry.date === newDate &&
                entry.recipeId === '' &&
                entry.recipeName === '' &&
                entry.recipePhotoUrl === '' &&
                entry.status === 'active'
            );

            // At least one entry with the new date and default fields must exist
            expect(newEntries.length).toBeGreaterThanOrEqual(1);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('All original entries are preserved in the result', () => {
    it('every original entry exists in the result unchanged', () => {
      fc.assert(
        fc.property(
          sortedScheduleArb,
          dateStringArb,
          (schedule, newDate) => {
            const result = insertDate(schedule, newDate);

            // Track which result entries have been matched to originals
            const matched = new Array(result.length).fill(false);

            for (const original of schedule) {
              // Find an unmatched entry in result that matches this original
              const matchIdx = result.findIndex(
                (entry, idx) =>
                  !matched[idx] &&
                  entry.date === original.date &&
                  entry.recipeId === original.recipeId &&
                  entry.recipeName === original.recipeName &&
                  entry.recipePhotoUrl === original.recipePhotoUrl &&
                  entry.status === original.status
              );

              expect(matchIdx).not.toBe(-1);
              matched[matchIdx] = true;
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('inserting into an empty schedule produces a single-entry array', () => {
      fc.assert(
        fc.property(
          dateStringArb,
          (newDate) => {
            const result = insertDate([], newDate);

            expect(result.length).toBe(1);
            expect(result[0].date).toBe(newDate);
            expect(result[0].recipeId).toBe('');
            expect(result[0].recipeName).toBe('');
            expect(result[0].recipePhotoUrl).toBe('');
            expect(result[0].status).toBe('active');
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Original schedule is not mutated', () => {
    it('insertDate returns a new array without modifying the original', () => {
      fc.assert(
        fc.property(
          sortedScheduleArb,
          dateStringArb,
          (schedule, newDate) => {
            const originalSnapshot = schedule.map((e) => ({ ...e }));

            insertDate(schedule, newDate);

            // Original array should be unchanged
            expect(schedule.length).toBe(originalSnapshot.length);
            for (let i = 0; i < schedule.length; i++) {
              expect(schedule[i].date).toBe(originalSnapshot[i].date);
              expect(schedule[i].recipeId).toBe(originalSnapshot[i].recipeId);
              expect(schedule[i].recipeName).toBe(originalSnapshot[i].recipeName);
              expect(schedule[i].recipePhotoUrl).toBe(originalSnapshot[i].recipePhotoUrl);
              expect(schedule[i].status).toBe(originalSnapshot[i].status);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
