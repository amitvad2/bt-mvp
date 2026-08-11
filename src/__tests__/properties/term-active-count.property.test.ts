// Feature: term-session-management, Property 4: Active session count excludes skipped entries
// **Validates: Requirements 3.1, 3.4, 4.3**

// @vitest-environment node

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { getActiveSessionCount } from '@/lib/term-schedule-utils';
import type { ScheduleEntry } from '@/types';

/**
 * Property 4: Active session count excludes skipped entries.
 *
 * For any term schedule array containing a mix of entries with status 'active'
 * and 'skipped', the computed active count SHALL equal the number of entries
 * where status === 'active', and this count SHALL always be less than or equal
 * to the total array length.
 */

// --- Custom Arbitraries ---

/** Generates a random YYYY-MM-DD date string within a reasonable range */
const dateArb = fc.date({
  min: new Date(2024, 0, 1),
  max: new Date(2030, 11, 31),
}).map((d) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
});

/** Generates a random status: 'active' or 'skipped' */
const statusArb = fc.oneof(
  fc.constant('active' as const),
  fc.constant('skipped' as const)
);

/** Generates a random recipe ID (empty or filled) */
const recipeIdArb = fc.oneof(
  fc.constant(''),
  fc.string({ minLength: 5, maxLength: 20 }).map((s) => `rec_${s}`)
);

/** Generates a random recipe name (empty or filled) */
const recipeNameArb = fc.oneof(
  fc.constant(''),
  fc.string({ minLength: 3, maxLength: 30 })
);

/** Generates a random recipe photo URL (empty or filled) */
const recipePhotoUrlArb = fc.oneof(
  fc.constant(''),
  fc.webUrl()
);

/** Generates a single ScheduleEntry with random status and recipe fields */
const scheduleEntryArb: fc.Arbitrary<ScheduleEntry> = fc.record({
  date: dateArb,
  recipeId: recipeIdArb,
  recipeName: recipeNameArb,
  recipePhotoUrl: recipePhotoUrlArb,
  status: statusArb,
});

/** Generates an array of ScheduleEntry with random statuses */
const scheduleArb = fc.array(scheduleEntryArb, { minLength: 0, maxLength: 52 });

/** Generates a non-empty array of ScheduleEntry */
const nonEmptyScheduleArb = fc.array(scheduleEntryArb, { minLength: 1, maxLength: 52 });

/** Generates all-active schedule entries */
const allActiveScheduleArb = fc.array(
  fc.record({
    date: dateArb,
    recipeId: recipeIdArb,
    recipeName: recipeNameArb,
    recipePhotoUrl: recipePhotoUrlArb,
    status: fc.constant('active' as const),
  }),
  { minLength: 1, maxLength: 52 }
);

/** Generates all-skipped schedule entries */
const allSkippedScheduleArb = fc.array(
  fc.record({
    date: dateArb,
    recipeId: recipeIdArb,
    recipeName: recipeNameArb,
    recipePhotoUrl: recipePhotoUrlArb,
    status: fc.constant('skipped' as const),
  }),
  { minLength: 1, maxLength: 52 }
);

// --- Property Tests ---

describe('Feature: term-session-management, Property 4: Active session count excludes skipped entries', () => {
  describe('Count equals number of entries with status === "active"', () => {
    it('active count matches manual filter count for any schedule', () => {
      fc.assert(
        fc.property(
          scheduleArb,
          (schedule) => {
            const result = getActiveSessionCount(schedule);
            const expected = schedule.filter((e) => e.status === 'active').length;

            expect(result).toBe(expected);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('active count + skipped count equals total array length', () => {
      fc.assert(
        fc.property(
          scheduleArb,
          (schedule) => {
            const activeCount = getActiveSessionCount(schedule);
            const skippedCount = schedule.filter((e) => e.status === 'skipped').length;

            expect(activeCount + skippedCount).toBe(schedule.length);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Count is always <= total array length', () => {
    it('active count never exceeds total number of entries', () => {
      fc.assert(
        fc.property(
          scheduleArb,
          (schedule) => {
            const result = getActiveSessionCount(schedule);

            expect(result).toBeLessThanOrEqual(schedule.length);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Count is always >= 0', () => {
    it('active count is never negative', () => {
      fc.assert(
        fc.property(
          scheduleArb,
          (schedule) => {
            const result = getActiveSessionCount(schedule);

            expect(result).toBeGreaterThanOrEqual(0);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('If all entries are active, count === array.length', () => {
    it('all-active schedule returns count equal to length', () => {
      fc.assert(
        fc.property(
          allActiveScheduleArb,
          (schedule) => {
            const result = getActiveSessionCount(schedule);

            expect(result).toBe(schedule.length);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('If all entries are skipped, count === 0', () => {
    it('all-skipped schedule returns count of 0', () => {
      fc.assert(
        fc.property(
          allSkippedScheduleArb,
          (schedule) => {
            const result = getActiveSessionCount(schedule);

            expect(result).toBe(0);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Empty schedule returns 0', () => {
    it('empty array always returns 0', () => {
      const result = getActiveSessionCount([]);
      expect(result).toBe(0);
    });
  });

  describe('Count is independent of recipe assignment', () => {
    it('changing recipe fields does not affect active count', () => {
      fc.assert(
        fc.property(
          nonEmptyScheduleArb,
          recipeIdArb,
          recipeNameArb,
          recipePhotoUrlArb,
          (schedule, newRecipeId, newRecipeName, newPhotoUrl) => {
            // Get count from original schedule
            const originalCount = getActiveSessionCount(schedule);

            // Modify recipe fields on a copy (should not affect count)
            const modified = schedule.map((entry) => ({
              ...entry,
              recipeId: newRecipeId,
              recipeName: newRecipeName,
              recipePhotoUrl: newPhotoUrl,
            }));

            const modifiedCount = getActiveSessionCount(modified);

            // Count should be the same since only recipe fields changed
            expect(modifiedCount).toBe(originalCount);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
