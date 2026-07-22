// Feature: dynamic-class-types, Property 5: Delete Safety — Referenced Type Cannot Be Deleted
// **Validates: Requirements 4.1**

// @vitest-environment node

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

/**
 * Delete safety validation function extracted from the admin class-types page.
 * Checks whether a class type can be deleted based on referential integrity.
 * If any BTClass documents reference the target slug, deletion is blocked.
 */
function canDeleteClassType(
  classTypes: { id: string; slug: string }[],
  targetSlug: string,
  classesWithType: { type: string }[]
): { allowed: boolean; reason?: string } {
  // Check referential integrity
  const referencingClasses = classesWithType.filter(c => c.type === targetSlug);
  if (referencingClasses.length > 0) {
    return { allowed: false, reason: 'Referenced by classes' };
  }
  // Check minimum-one (handled separately in Property 6)
  return { allowed: true };
}

// Arbitrary for generating a valid slug (lowercase alphanumeric + hyphens, 1-30 chars)
const slugArbitrary = fc.stringMatching(/^[a-z0-9-]{1,30}$/);

// Arbitrary for generating a class type record with id and slug
const classTypeRecordArbitrary = fc.record({
  id: fc.uuid(),
  slug: slugArbitrary,
});

// Arbitrary for generating a BTClass reference record
const btClassReferenceArbitrary = fc.record({
  type: slugArbitrary,
});

describe('Property 5: Delete Safety — Referenced Type Cannot Be Deleted', () => {
  it('blocks deletion when one or more BTClass documents reference the target slug', () => {
    fc.assert(
      fc.property(
        fc.array(classTypeRecordArbitrary, { minLength: 1, maxLength: 20 }),
        fc.array(btClassReferenceArbitrary, { minLength: 1, maxLength: 20 }),
        (classTypes, classes) => {
          // Pick a slug that is actually referenced by at least one class
          const targetSlug = classTypes[0].slug;

          // Ensure at least one class references this slug
          const classesWithReference = [
            ...classes,
            { type: targetSlug },
          ];

          const result = canDeleteClassType(classTypes, targetSlug, classesWithReference);

          expect(result.allowed).toBe(false);
          expect(result.reason).toBe('Referenced by classes');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('allows deletion when no BTClass documents reference the target slug', () => {
    fc.assert(
      fc.property(
        fc.array(classTypeRecordArbitrary, { minLength: 1, maxLength: 20 }),
        fc.array(btClassReferenceArbitrary, { minLength: 0, maxLength: 20 }),
        (classTypes, classes) => {
          const targetSlug = classTypes[0].slug;

          // Pre-condition: no class references this target slug
          fc.pre(!classes.some(c => c.type === targetSlug));

          const result = canDeleteClassType(classTypes, targetSlug, classes);

          expect(result.allowed).toBe(true);
          expect(result.reason).toBeUndefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('correctly distinguishes referenced from unreferenced types in any collection state', () => {
    fc.assert(
      fc.property(
        fc.array(classTypeRecordArbitrary, { minLength: 1, maxLength: 20 }),
        slugArbitrary,
        fc.array(btClassReferenceArbitrary, { minLength: 0, maxLength: 20 }),
        (classTypes, targetSlug, classes) => {
          const result = canDeleteClassType(classTypes, targetSlug, classes);

          // The result should be blocked iff at least one class references the target slug
          const hasReferences = classes.some(c => c.type === targetSlug);

          if (hasReferences) {
            expect(result.allowed).toBe(false);
            expect(result.reason).toBe('Referenced by classes');
          } else {
            expect(result.allowed).toBe(true);
            expect(result.reason).toBeUndefined();
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('blocks deletion regardless of how many classes reference the type (1 or many)', () => {
    fc.assert(
      fc.property(
        slugArbitrary,
        fc.integer({ min: 1, max: 50 }),
        fc.array(btClassReferenceArbitrary, { minLength: 0, maxLength: 10 }),
        (targetSlug, referenceCount, otherClasses) => {
          // Create a collection with the target class type
          const classTypes = [{ id: 'target-id', slug: targetSlug }];

          // Create N classes that all reference the target slug
          const referencingClasses = Array.from({ length: referenceCount }, () => ({
            type: targetSlug,
          }));

          // Combine with other random classes
          const allClasses = [...referencingClasses, ...otherClasses];

          const result = canDeleteClassType(classTypes, targetSlug, allClasses);

          expect(result.allowed).toBe(false);
          expect(result.reason).toBe('Referenced by classes');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('only considers exact slug matches — similar slugs do not block deletion', () => {
    fc.assert(
      fc.property(
        slugArbitrary,
        slugArbitrary,
        (targetSlug, otherSlug) => {
          // Pre-condition: the two slugs are different
          fc.pre(targetSlug !== otherSlug);

          const classTypes = [{ id: 'target-id', slug: targetSlug }];
          const classes = [{ type: otherSlug }];

          const result = canDeleteClassType(classTypes, targetSlug, classes);

          // Since no class references the exact target slug, deletion is allowed
          expect(result.allowed).toBe(true);
          expect(result.reason).toBeUndefined();
        }
      ),
      { numRuns: 100 }
    );
  });
});
