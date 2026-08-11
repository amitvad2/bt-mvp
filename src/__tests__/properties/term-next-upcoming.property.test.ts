// Feature: term-session-management, Property 8: Next upcoming date is the earliest active date in the future
// **Validates: Requirements 7.4**

// @vitest-environment node

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { getNextUpcoming } from '@/lib/term-schedule-utils';
import type { ScheduleEntry } from '@/types';

/**
 * Property 8: Next upcoming date is the earliest active date in the future.
 *
 * For any term schedule array and any reference date (today), the "next upcoming
 * session" SHALL be the entry with the smallest date value that is greater than
 * or equal to the reference date AND has status === 'active'. If no such entry
 * exists, the result SHALL be null/undefined.
 */

// --- Custom Arbitraries ---

/** Generates a valid YYYY-MM-DD date string within a reasonable range */
const dateArb = fc
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

/** Generates a ScheduleEntry with a given date and random status/recipe */
const scheduleEntryArb = (dateStr: string): fc.Arbitrary<ScheduleEntry> =>
  fc.record({
    date: fc.constant(dateStr),
    recipeId: fc.oneof(fc.constant(''), fc.string({ minLength: 1, maxLength: 10 })),
    recipeName: fc.oneof(fc.constant(''), fc.string({ minLength: 1, maxLength: 20 })),
    recipePhotoUrl: fc.oneof(fc.constant(''), fc.string({ minLength: 1, maxLength: 30 })),
    status: fc.oneof(fc.constant('active' as const), fc.constant('skipped' as const)),
  });

/** Generates a sorted array of ScheduleEntry objects with mixed statuses */
const scheduleArb: fc.Arbitrary<ScheduleEntry[]> = fc
  .array(dateArb, { minLength: 0, maxLength: 20 })
  .chain((dates) => {
    // Sort dates ascending to produce a chronologically ordered schedule
    const sortedDates = [...dates].sort();
    // Generate an entry for each date
    return fc.tuple(...sortedDates.map((d) => scheduleEntryArb(d)));
  })
  .map((entries) => entries as ScheduleEntry[]);

/** Reference date arbitrary */
const referenceDateArb = dateArb;

// --- Property Tests ---

describe('Feature: term-session-management, Property 8: Next upcoming date is the earliest active date in the future', () => {
  describe('Result correctness when non-null', () => {
    it('result.date >= referenceDate when result is non-null', () => {
      fc.assert(
        fc.property(
          scheduleArb,
          referenceDateArb,
          (schedule, referenceDate) => {
            const result = getNextUpcoming(schedule, referenceDate);

            if (result !== null) {
              expect(result.date >= referenceDate).toBe(true);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('result.status === "active" when result is non-null', () => {
      fc.assert(
        fc.property(
          scheduleArb,
          referenceDateArb,
          (schedule, referenceDate) => {
            const result = getNextUpcoming(schedule, referenceDate);

            if (result !== null) {
              expect(result.status).toBe('active');
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('no active entry exists with date >= referenceDate AND date < result.date', () => {
      fc.assert(
        fc.property(
          scheduleArb,
          referenceDateArb,
          (schedule, referenceDate) => {
            const result = getNextUpcoming(schedule, referenceDate);

            if (result !== null) {
              // No active entry should be between referenceDate (inclusive) and result.date (exclusive)
              const earlierActive = schedule.filter(
                (entry) =>
                  entry.status === 'active' &&
                  entry.date >= referenceDate &&
                  entry.date < result.date
              );
              expect(earlierActive).toHaveLength(0);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('result is an entry that exists in the original schedule', () => {
      fc.assert(
        fc.property(
          scheduleArb,
          referenceDateArb,
          (schedule, referenceDate) => {
            const result = getNextUpcoming(schedule, referenceDate);

            if (result !== null) {
              // The result must be a reference to (or deep equal to) an entry in the schedule
              const found = schedule.some(
                (entry) =>
                  entry.date === result.date &&
                  entry.status === result.status &&
                  entry.recipeId === result.recipeId &&
                  entry.recipeName === result.recipeName &&
                  entry.recipePhotoUrl === result.recipePhotoUrl
              );
              expect(found).toBe(true);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Result correctness when null', () => {
    it('if result is null, no active entry in the schedule has date >= referenceDate', () => {
      fc.assert(
        fc.property(
          scheduleArb,
          referenceDateArb,
          (schedule, referenceDate) => {
            const result = getNextUpcoming(schedule, referenceDate);

            if (result === null) {
              const activeInFuture = schedule.filter(
                (entry) => entry.status === 'active' && entry.date >= referenceDate
              );
              expect(activeInFuture).toHaveLength(0);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('returns null for an empty schedule', () => {
      fc.assert(
        fc.property(
          referenceDateArb,
          (referenceDate) => {
            const result = getNextUpcoming([], referenceDate);
            expect(result).toBeNull();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('returns null when all entries are skipped', () => {
      fc.assert(
        fc.property(
          fc.array(dateArb, { minLength: 1, maxLength: 15 }),
          referenceDateArb,
          (dates, referenceDate) => {
            // Build a schedule with all entries skipped
            const allSkipped: ScheduleEntry[] = [...dates].sort().map((date) => ({
              date,
              recipeId: '',
              recipeName: '',
              recipePhotoUrl: '',
              status: 'skipped' as const,
            }));

            const result = getNextUpcoming(allSkipped, referenceDate);
            expect(result).toBeNull();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('returns null when all active entries are before the reference date', () => {
      // Generate dates guaranteed to be before the reference date
      const pastDateArb = fc
        .integer({ min: 0, max: 1825 }) // Up to ~5 years of days
        .map((daysOffset) => {
          const base = new Date(2020, 0, 1);
          base.setDate(base.getDate() + daysOffset);
          const year = base.getFullYear();
          const month = String(base.getMonth() + 1).padStart(2, '0');
          const day = String(base.getDate()).padStart(2, '0');
          return `${year}-${month}-${day}`;
        });

      fc.assert(
        fc.property(
          fc.array(pastDateArb, { minLength: 1, maxLength: 10 }),
          (dates) => {
            // All entries are active but before 2025-01-01
            const schedule: ScheduleEntry[] = [...dates].sort().map((date) => ({
              date,
              recipeId: 'rec_1',
              recipeName: 'Test',
              recipePhotoUrl: '',
              status: 'active' as const,
            }));

            // Reference date is after all entries
            const result = getNextUpcoming(schedule, '2025-01-01');
            expect(result).toBeNull();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Minimality of result', () => {
    it('result is the smallest active date >= referenceDate (minimality)', () => {
      fc.assert(
        fc.property(
          scheduleArb,
          referenceDateArb,
          (schedule, referenceDate) => {
            const result = getNextUpcoming(schedule, referenceDate);

            // Compute the expected result manually
            const activeFutureEntries = schedule.filter(
              (entry) => entry.status === 'active' && entry.date >= referenceDate
            );

            if (activeFutureEntries.length === 0) {
              expect(result).toBeNull();
            } else {
              // Sort by date to find the minimum
              const sorted = [...activeFutureEntries].sort((a, b) =>
                a.date.localeCompare(b.date)
              );
              expect(result).not.toBeNull();
              expect(result!.date).toBe(sorted[0].date);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('result date is the minimum across all active entries on or after referenceDate', () => {
      fc.assert(
        fc.property(
          scheduleArb,
          referenceDateArb,
          (schedule, referenceDate) => {
            const result = getNextUpcoming(schedule, referenceDate);

            if (result !== null) {
              // Every active entry on or after referenceDate must have date >= result.date
              const allActiveFuture = schedule.filter(
                (entry) => entry.status === 'active' && entry.date >= referenceDate
              );
              for (const entry of allActiveFuture) {
                expect(entry.date >= result.date).toBe(true);
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Boundary cases', () => {
    it('returns the entry on the exact reference date if it is active', () => {
      fc.assert(
        fc.property(
          dateArb,
          (date) => {
            const schedule: ScheduleEntry[] = [
              { date, recipeId: 'r1', recipeName: 'Recipe', recipePhotoUrl: '', status: 'active' },
            ];

            const result = getNextUpcoming(schedule, date);
            expect(result).not.toBeNull();
            expect(result!.date).toBe(date);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('skips the entry on exact reference date if it is skipped, returns next active', () => {
      fc.assert(
        fc.property(
          fc.date({ min: new Date(2020, 0, 1), max: new Date(2029, 11, 24) }).map((d) => {
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
          }),
          (date) => {
            // Parse date and add 7 days for the next entry
            const [y, m, d] = date.split('-').map(Number);
            const nextDate = new Date(y, m - 1, d + 7);
            const nextDateStr = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}-${String(nextDate.getDate()).padStart(2, '0')}`;

            const schedule: ScheduleEntry[] = [
              { date, recipeId: '', recipeName: '', recipePhotoUrl: '', status: 'skipped' },
              { date: nextDateStr, recipeId: 'r2', recipeName: 'Next', recipePhotoUrl: '', status: 'active' },
            ];

            const result = getNextUpcoming(schedule, date);
            expect(result).not.toBeNull();
            expect(result!.date).toBe(nextDateStr);
            expect(result!.status).toBe('active');
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
