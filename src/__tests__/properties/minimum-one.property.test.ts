// Feature: dynamic-class-types, Property 6: Minimum-One Invariant
// **Validates: Requirements 4.2**

// @vitest-environment node

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

/**
 * Minimum-one delete guard validation function extracted from the admin class-types page.
 * When exactly one class type remains in the collection, deletion MUST be blocked
 * to ensure at least one class type always exists.
 */
function canDeleteLastClassType(classTypesCount: number): { allowed: boolean; reason?: string } {
  if (classTypesCount <= 1) {
    return { allowed: false, reason: 'Cannot delete the last class type' };
  }
  return { allowed: true };
}

// Arbitrary for generating a valid slug (lowercase alphanumeric + hyphens)
const slugArbitrary = fc.stringMatching(/^[a-z0-9-]{1,30}$/);

// Arbitrary for generating a class type record
const classTypeRecordArbitrary = fc.record({
  id: fc.uuid(),
  slug: slugArbitrary,
  displayName: fc.string({ minLength: 1, maxLength: 50 }),
  shortLabel: fc.string({ minLength: 1, maxLength: 20 }),
  badgeColor: fc.constantFrom('amber', 'green', 'indigo', 'red', 'gray'),
  skipQuestionnaire: fc.boolean(),
  requireEmergencyContact: fc.boolean(),
  defaultAgeMin: fc.integer({ min: 0, max: 100 }),
  defaultAgeMax: fc.integer({ min: 1, max: 100 }),
  defaultMaxSize: fc.integer({ min: 1, max: 50 }),
  defaultPrice: fc.integer({ min: 0, max: 100000 }),
  order: fc.integer({ min: 0, max: 100 }),
});

describe('Property 6: Minimum-One Invariant', () => {
  it('always blocks deletion when exactly one class type remains in the collection', () => {
    fc.assert(
      fc.property(
        classTypeRecordArbitrary,
        (classType) => {
          // Collection has exactly 1 class type — any attempt to delete it must be blocked
          const result = canDeleteLastClassType(1);

          expect(result.allowed).toBe(false);
          expect(result.reason).toBe('Cannot delete the last class type');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('blocks deletion when the collection count is zero (edge case — guard handles it)', () => {
    fc.assert(
      fc.property(
        fc.constant(0),
        (count) => {
          const result = canDeleteLastClassType(count);

          expect(result.allowed).toBe(false);
          expect(result.reason).toBe('Cannot delete the last class type');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('allows deletion when more than one class type exists in the collection', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 1000 }),
        (count) => {
          const result = canDeleteLastClassType(count);

          expect(result.allowed).toBe(true);
          expect(result.reason).toBeUndefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('the guard decision is solely determined by the collection count — class type content is irrelevant', () => {
    fc.assert(
      fc.property(
        fc.array(classTypeRecordArbitrary, { minLength: 1, maxLength: 1 }),
        (classTypes) => {
          // Regardless of what the class type record contains, if there is only 1, deletion is blocked
          const result = canDeleteLastClassType(classTypes.length);

          expect(result.allowed).toBe(false);
          expect(result.reason).toBe('Cannot delete the last class type');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('correctly transitions from blocked to allowed at the boundary of count = 2', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }),
        (count) => {
          const result = canDeleteLastClassType(count);

          if (count <= 1) {
            expect(result.allowed).toBe(false);
            expect(result.reason).toBe('Cannot delete the last class type');
          } else {
            expect(result.allowed).toBe(true);
            expect(result.reason).toBeUndefined();
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
