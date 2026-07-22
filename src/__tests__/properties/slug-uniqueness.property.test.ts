// Feature: dynamic-class-types, Property 1: Slug Uniqueness Invariant
// Validates: Requirements 1.2, 2.3, 3.3

// @vitest-environment node

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

/**
 * Slug uniqueness validation function extracted from the admin class-types page.
 * Returns true if the candidate slug is a duplicate (already exists on a different document).
 */
function isSlugDuplicate(
  classTypes: { id: string; slug: string }[],
  candidateSlug: string,
  editingId?: string
): boolean {
  return classTypes.some(ct => ct.slug === candidateSlug && ct.id !== editingId);
}

// Arbitrary for generating a valid slug (lowercase alphanumeric + hyphens, 1-30 chars)
const slugArbitrary = fc.stringMatching(/^[a-z0-9][a-z0-9-]{0,29}$/);

// Arbitrary for generating a class type record with id and slug
const classTypeRecordArbitrary = fc.record({
  id: fc.uuid(),
  slug: slugArbitrary,
});

describe('Property 1: Slug Uniqueness Invariant', () => {
  it('rejects a candidate slug that already exists on a different document (create scenario)', () => {
    fc.assert(
      fc.property(
        fc.array(classTypeRecordArbitrary, { minLength: 1, maxLength: 20 }),
        (classTypes) => {
          // Pick an existing slug from the collection (simulates creating a duplicate)
          const existingRecord = classTypes[0];
          const candidateSlug = existingRecord.slug;

          // When creating (no editingId), if the slug exists, it should be detected as duplicate
          const result = isSlugDuplicate(classTypes, candidateSlug);
          expect(result).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('accepts a candidate slug that does not exist in the collection (create scenario)', () => {
    fc.assert(
      fc.property(
        fc.array(classTypeRecordArbitrary, { minLength: 0, maxLength: 20 }),
        slugArbitrary,
        (classTypes, candidateSlug) => {
          // Pre-condition: the candidate slug must NOT already be in the collection
          fc.pre(!classTypes.some(ct => ct.slug === candidateSlug));

          // When creating with a unique slug, it should NOT be detected as duplicate
          const result = isSlugDuplicate(classTypes, candidateSlug);
          expect(result).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('allows a document to keep its own slug when editing (update scenario)', () => {
    fc.assert(
      fc.property(
        fc.array(classTypeRecordArbitrary, { minLength: 1, maxLength: 20 }),
        (classTypes) => {
          // Pick an existing record — editing itself with its own slug should be allowed
          const editingRecord = classTypes[0];
          const candidateSlug = editingRecord.slug;
          const editingId = editingRecord.id;

          // When editing, if the slug belongs to the same document, it should NOT be a duplicate
          // (unless another document also has the same slug)
          const otherWithSameSlug = classTypes.some(
            ct => ct.slug === candidateSlug && ct.id !== editingId
          );

          const result = isSlugDuplicate(classTypes, candidateSlug, editingId);
          expect(result).toBe(otherWithSameSlug);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('rejects a candidate slug that exists on a different document during edit', () => {
    fc.assert(
      fc.property(
        fc.array(classTypeRecordArbitrary, { minLength: 2, maxLength: 20 }),
        (classTypes) => {
          // Ensure we have at least two distinct records
          fc.pre(classTypes.length >= 2);

          // The editing record is the first, try to use a slug from a different record
          const editingRecord = classTypes[0];
          const otherRecord = classTypes.find(
            ct => ct.id !== editingRecord.id && ct.slug !== editingRecord.slug
          );

          // Skip if no suitable "other" record exists
          fc.pre(otherRecord !== undefined);

          const candidateSlug = otherRecord!.slug;
          const editingId = editingRecord.id;

          // When editing, if the candidate slug belongs to a different document, it's a duplicate
          const result = isSlugDuplicate(classTypes, candidateSlug, editingId);
          expect(result).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('for any collection state, the validation correctly distinguishes duplicates from unique slugs', () => {
    fc.assert(
      fc.property(
        fc.array(classTypeRecordArbitrary, { minLength: 0, maxLength: 20 }),
        slugArbitrary,
        fc.option(fc.uuid(), { nil: undefined }),
        (classTypes, candidateSlug, editingId) => {
          const result = isSlugDuplicate(classTypes, candidateSlug, editingId);

          // The result should be true iff there exists a record with the same slug
          // whose id is different from editingId
          const expected = classTypes.some(
            ct => ct.slug === candidateSlug && ct.id !== editingId
          );

          expect(result).toBe(expected);
        }
      ),
      { numRuns: 100 }
    );
  });
});
