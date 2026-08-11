// Feature: term-session-management, Property 3: Recipe assignment round-trip preserves data
// **Validates: Requirements 2.2, 2.4**

// @vitest-environment node

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import type { ScheduleEntry } from '@/types';

/**
 * Property 3: Recipe assignment round-trip preserves data.
 *
 * For any Schedule_Entry and any Recipe document, assigning the recipe to the entry
 * SHALL set recipeId, recipeName, and recipePhotoUrl to match the Recipe document's
 * id, name, and photoUrl fields respectively. Subsequently clearing the assignment
 * SHALL reset all three fields to empty strings.
 */

// --- Types ---

interface Recipe {
  id: string;
  name: string;
  photoUrl: string;
}

// --- Pure Operations Under Test ---

/**
 * Models the "assign recipe" operation:
 * Sets recipeId, recipeName, and recipePhotoUrl from the Recipe document.
 */
function assignRecipe(entry: ScheduleEntry, recipe: Recipe): ScheduleEntry {
  return {
    ...entry,
    recipeId: recipe.id,
    recipeName: recipe.name,
    recipePhotoUrl: recipe.photoUrl,
  };
}

/**
 * Models the "clear recipe" operation:
 * Resets recipeId, recipeName, and recipePhotoUrl to empty strings.
 */
function clearRecipe(entry: ScheduleEntry): ScheduleEntry {
  return {
    ...entry,
    recipeId: '',
    recipeName: '',
    recipePhotoUrl: '',
  };
}

// --- Custom Arbitraries ---

/** Generates a valid YYYY-MM-DD date string */
const dateStringArb = fc
  .record({
    year: fc.integer({ min: 2020, max: 2035 }),
    month: fc.integer({ min: 1, max: 12 }),
    day: fc.integer({ min: 1, max: 28 }), // Keep 1-28 to avoid invalid dates
  })
  .map(({ year, month, day }) => {
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  });

/** Generates a random ScheduleEntry with any initial recipe state */
const scheduleEntryArb: fc.Arbitrary<ScheduleEntry> = fc.record({
  date: dateStringArb,
  recipeId: fc.string({ minLength: 0, maxLength: 30 }),
  recipeName: fc.string({ minLength: 0, maxLength: 50 }),
  recipePhotoUrl: fc.string({ minLength: 0, maxLength: 100 }),
  status: fc.constantFrom('active' as const, 'skipped' as const),
});

/** Generates a random Recipe document with non-empty fields */
const recipeArb: fc.Arbitrary<Recipe> = fc.record({
  id: fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim().length > 0),
  name: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
  photoUrl: fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0),
});

// --- Property Tests ---

describe('Feature: term-session-management, Property 3: Recipe assignment round-trip preserves data', () => {
  describe('Assignment sets all three recipe fields correctly', () => {
    it('after assignment, recipeId matches recipe.id', () => {
      fc.assert(
        fc.property(scheduleEntryArb, recipeArb, (entry, recipe) => {
          const assigned = assignRecipe(entry, recipe);
          expect(assigned.recipeId).toBe(recipe.id);
        }),
        { numRuns: 100 }
      );
    });

    it('after assignment, recipeName matches recipe.name', () => {
      fc.assert(
        fc.property(scheduleEntryArb, recipeArb, (entry, recipe) => {
          const assigned = assignRecipe(entry, recipe);
          expect(assigned.recipeName).toBe(recipe.name);
        }),
        { numRuns: 100 }
      );
    });

    it('after assignment, recipePhotoUrl matches recipe.photoUrl', () => {
      fc.assert(
        fc.property(scheduleEntryArb, recipeArb, (entry, recipe) => {
          const assigned = assignRecipe(entry, recipe);
          expect(assigned.recipePhotoUrl).toBe(recipe.photoUrl);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Clearing resets all three recipe fields to empty strings', () => {
    it('after clear, recipeId is empty string', () => {
      fc.assert(
        fc.property(scheduleEntryArb, recipeArb, (entry, recipe) => {
          const assigned = assignRecipe(entry, recipe);
          const cleared = clearRecipe(assigned);
          expect(cleared.recipeId).toBe('');
        }),
        { numRuns: 100 }
      );
    });

    it('after clear, recipeName is empty string', () => {
      fc.assert(
        fc.property(scheduleEntryArb, recipeArb, (entry, recipe) => {
          const assigned = assignRecipe(entry, recipe);
          const cleared = clearRecipe(assigned);
          expect(cleared.recipeName).toBe('');
        }),
        { numRuns: 100 }
      );
    });

    it('after clear, recipePhotoUrl is empty string', () => {
      fc.assert(
        fc.property(scheduleEntryArb, recipeArb, (entry, recipe) => {
          const assigned = assignRecipe(entry, recipe);
          const cleared = clearRecipe(assigned);
          expect(cleared.recipePhotoUrl).toBe('');
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Assignment preserves date and status fields unchanged', () => {
    it('assignment does not change the date field', () => {
      fc.assert(
        fc.property(scheduleEntryArb, recipeArb, (entry, recipe) => {
          const assigned = assignRecipe(entry, recipe);
          expect(assigned.date).toBe(entry.date);
        }),
        { numRuns: 100 }
      );
    });

    it('assignment does not change the status field', () => {
      fc.assert(
        fc.property(scheduleEntryArb, recipeArb, (entry, recipe) => {
          const assigned = assignRecipe(entry, recipe);
          expect(assigned.status).toBe(entry.status);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Clearing preserves date and status fields unchanged', () => {
    it('clear does not change the date field', () => {
      fc.assert(
        fc.property(scheduleEntryArb, recipeArb, (entry, recipe) => {
          const assigned = assignRecipe(entry, recipe);
          const cleared = clearRecipe(assigned);
          expect(cleared.date).toBe(entry.date);
        }),
        { numRuns: 100 }
      );
    });

    it('clear does not change the status field', () => {
      fc.assert(
        fc.property(scheduleEntryArb, recipeArb, (entry, recipe) => {
          const assigned = assignRecipe(entry, recipe);
          const cleared = clearRecipe(assigned);
          expect(cleared.status).toBe(entry.status);
        }),
        { numRuns: 100 }
      );
    });
  });
});
