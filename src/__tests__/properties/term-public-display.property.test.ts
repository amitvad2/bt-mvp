// Feature: term-session-management, Property 6: Public schedule display shows only active entries with correct recipe text
// **Validates: Requirements 4.2, 4.3, 4.4**

// @vitest-environment node

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { getDisplaySchedule } from '@/lib/term-schedule-utils';
import type { ScheduleEntry } from '@/types';

/**
 * Property 6: Public schedule display shows only active entries with correct recipe text.
 *
 * For any term schedule array, the displayed schedule SHALL include only entries with
 * status === 'active', SHALL show recipe name and photo for entries with non-empty
 * recipeId, and SHALL display "Recipe to be announced" for entries with empty recipeId.
 */

// --- Custom Arbitraries ---

/** Generates a random YYYY-MM-DD date string within a reasonable range */
const dateArb = fc
  .date({
    min: new Date(2024, 0, 1),
    max: new Date(2030, 11, 31),
  })
  .map((d) => {
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

/** Generates a non-empty recipe ID */
const filledRecipeIdArb = fc
  .string({ minLength: 5, maxLength: 20 })
  .map((s) => `rec_${s}`);

/** Generates a random recipe ID (empty or filled) */
const recipeIdArb = fc.oneof(fc.constant(''), filledRecipeIdArb);

/** Generates a non-empty recipe name */
const filledRecipeNameArb = fc.string({ minLength: 3, maxLength: 30 });

/** Generates a random recipe name (empty or filled) */
const recipeNameArb = fc.oneof(fc.constant(''), filledRecipeNameArb);

/** Generates a random recipe photo URL (empty or filled) */
const recipePhotoUrlArb = fc.oneof(fc.constant(''), fc.webUrl());

/**
 * Generates a ScheduleEntry with a consistent recipe assignment:
 * - If recipeId is non-empty, recipeName and recipePhotoUrl are also non-empty
 * - If recipeId is empty, recipeName and recipePhotoUrl are also empty
 */
const consistentScheduleEntryArb: fc.Arbitrary<ScheduleEntry> = fc.oneof(
  // Assigned recipe entry
  fc.record({
    date: dateArb,
    recipeId: filledRecipeIdArb,
    recipeName: filledRecipeNameArb,
    recipePhotoUrl: fc.webUrl(),
    status: statusArb,
  }),
  // Unassigned recipe entry
  fc.record({
    date: dateArb,
    recipeId: fc.constant(''),
    recipeName: fc.constant(''),
    recipePhotoUrl: fc.constant(''),
    status: statusArb,
  })
);

/** Generates an array of ScheduleEntry with mixed statuses and recipe assignments */
const scheduleArb = fc.array(consistentScheduleEntryArb, {
  minLength: 0,
  maxLength: 52,
});

/** Generates a non-empty schedule array */
const nonEmptyScheduleArb = fc.array(consistentScheduleEntryArb, {
  minLength: 1,
  maxLength: 52,
});

/**
 * Generates a schedule where entries have arbitrary recipe fields
 * (including inconsistent ones, e.g. empty recipeId but non-empty recipeName).
 * This tests the function's behavior with any possible input shape.
 */
const arbitraryScheduleEntryArb: fc.Arbitrary<ScheduleEntry> = fc.record({
  date: dateArb,
  recipeId: recipeIdArb,
  recipeName: recipeNameArb,
  recipePhotoUrl: recipePhotoUrlArb,
  status: statusArb,
});

const arbitraryScheduleArb = fc.array(arbitraryScheduleEntryArb, {
  minLength: 0,
  maxLength: 52,
});

// --- Property Tests ---

describe('Feature: term-session-management, Property 6: Public schedule display shows only active entries with correct recipe text', () => {
  describe('Result length equals number of active entries in the input', () => {
    it('display schedule contains exactly as many entries as active entries in the source', () => {
      fc.assert(
        fc.property(arbitraryScheduleArb, (schedule) => {
          const result = getDisplaySchedule(schedule);
          const activeCount = schedule.filter(
            (e) => e.status === 'active'
          ).length;

          expect(result.length).toBe(activeCount);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('No skipped entries appear in the result', () => {
    it('all result entries correspond to active source entries only', () => {
      fc.assert(
        fc.property(arbitraryScheduleArb, (schedule) => {
          const result = getDisplaySchedule(schedule);
          const activeDates = schedule
            .filter((e) => e.status === 'active')
            .map((e) => e.date);

          // Every date in the result must come from an active entry
          for (const entry of result) {
            expect(activeDates).toContain(entry.date);
          }
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Entries with non-empty recipeId show original recipeName', () => {
    it('assigned recipes display their original recipeName', () => {
      fc.assert(
        fc.property(scheduleArb, (schedule) => {
          const result = getDisplaySchedule(schedule);
          const activeEntries = schedule.filter(
            (e) => e.status === 'active'
          );

          for (let i = 0; i < result.length; i++) {
            const source = activeEntries[i];
            if (source.recipeId !== '') {
              expect(result[i].recipeName).toBe(source.recipeName);
            }
          }
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Entries with empty recipeId show "Recipe to be announced"', () => {
    it('unassigned entries display "Recipe to be announced" as recipeName', () => {
      fc.assert(
        fc.property(scheduleArb, (schedule) => {
          const result = getDisplaySchedule(schedule);
          const activeEntries = schedule.filter(
            (e) => e.status === 'active'
          );

          for (let i = 0; i < result.length; i++) {
            const source = activeEntries[i];
            if (source.recipeId === '') {
              expect(result[i].recipeName).toBe('Recipe to be announced');
            }
          }
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Entries with non-empty recipeId preserve original recipePhotoUrl', () => {
    it('assigned recipes display their original recipePhotoUrl', () => {
      fc.assert(
        fc.property(scheduleArb, (schedule) => {
          const result = getDisplaySchedule(schedule);
          const activeEntries = schedule.filter(
            (e) => e.status === 'active'
          );

          for (let i = 0; i < result.length; i++) {
            const source = activeEntries[i];
            if (source.recipeId !== '') {
              expect(result[i].recipePhotoUrl).toBe(source.recipePhotoUrl);
            }
          }
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Entries with empty recipeId preserve original recipePhotoUrl (empty string)', () => {
    it('unassigned entries keep the original recipePhotoUrl value', () => {
      fc.assert(
        fc.property(scheduleArb, (schedule) => {
          const result = getDisplaySchedule(schedule);
          const activeEntries = schedule.filter(
            (e) => e.status === 'active'
          );

          for (let i = 0; i < result.length; i++) {
            const source = activeEntries[i];
            if (source.recipeId === '') {
              expect(result[i].recipePhotoUrl).toBe(source.recipePhotoUrl);
            }
          }
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Result entries maintain the same date order as active entries in the input', () => {
    it('display schedule order matches the order of active entries in the source array', () => {
      fc.assert(
        fc.property(arbitraryScheduleArb, (schedule) => {
          const result = getDisplaySchedule(schedule);
          const activeEntries = schedule.filter(
            (e) => e.status === 'active'
          );

          // The result dates should match the active entries dates in order
          for (let i = 0; i < result.length; i++) {
            expect(result[i].date).toBe(activeEntries[i].date);
          }
        }),
        { numRuns: 100 }
      );
    });
  });
});
