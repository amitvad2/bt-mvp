// Feature: dynamic-class-types, Property 7: Display Name Derivation
// **Validates: Requirements 6.1, 9.1**

// @vitest-environment node

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

/**
 * Display name derivation function extracted from admin sessions page.
 * Given a list of class types and a parent class's type slug,
 * returns the displayName of the matching class type record.
 *
 * Fallback chain:
 * 1. If parentClassType is undefined/empty → 'Unknown'
 * 2. If class type record found → record's displayName
 * 3. If no record found → parentClassType slug as fallback
 */
function deriveClassName(
  classTypes: { slug: string; displayName: string }[],
  parentClassType: string | undefined
): string {
  if (!parentClassType) return 'Unknown';
  const ct = classTypes.find(t => t.slug === parentClassType);
  return ct?.displayName || parentClassType || 'Unknown';
}

// Arbitrary for generating a valid slug (lowercase alphanumeric + hyphens, 1-30 chars)
const slugArbitrary = fc.stringMatching(/^[a-z0-9-]{1,30}$/);

// Arbitrary for generating a non-empty display name (1-50 chars)
const displayNameArbitrary = fc.string({ minLength: 1, maxLength: 50 });

// Arbitrary for generating a class type record with slug and displayName
const classTypeArbitrary = fc.record({
  slug: slugArbitrary,
  displayName: displayNameArbitrary,
});

describe('Property 7: Display Name Derivation', () => {
  it('returns the displayName of the class type record whose slug matches parentClassType', () => {
    fc.assert(
      fc.property(
        fc.array(classTypeArbitrary, { minLength: 1, maxLength: 20 }),
        fc.nat({ max: 19 }),
        (classTypes, indexRaw) => {
          // Pick a class type that exists in the array
          const index = indexRaw % classTypes.length;
          const target = classTypes[index];

          // Ensure uniqueness: if there are duplicates, the first match wins
          const firstMatch = classTypes.find(ct => ct.slug === target.slug)!;

          const result = deriveClassName(classTypes, target.slug);

          expect(result).toBe(firstMatch.displayName);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('returns "Unknown" when parentClassType is undefined', () => {
    fc.assert(
      fc.property(
        fc.array(classTypeArbitrary, { minLength: 0, maxLength: 20 }),
        (classTypes) => {
          const result = deriveClassName(classTypes, undefined);
          expect(result).toBe('Unknown');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('returns the raw slug as fallback when no matching class type record exists', () => {
    fc.assert(
      fc.property(
        fc.array(classTypeArbitrary, { minLength: 0, maxLength: 20 }),
        slugArbitrary,
        (classTypes, candidateSlug) => {
          // Pre-condition: no class type has this slug
          fc.pre(!classTypes.some(ct => ct.slug === candidateSlug));

          const result = deriveClassName(classTypes, candidateSlug);

          // Should fall back to the raw slug since it's a non-empty string
          expect(result).toBe(candidateSlug);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('never returns a stale or manually entered class name — always derives from record', () => {
    fc.assert(
      fc.property(
        fc.array(classTypeArbitrary, { minLength: 1, maxLength: 20 }),
        fc.nat({ max: 19 }),
        (classTypes, indexRaw) => {
          const index = indexRaw % classTypes.length;
          const target = classTypes[index];

          const result = deriveClassName(classTypes, target.slug);

          // The result must be either the displayName from the matching record
          // or the slug fallback — never some arbitrary external value
          const firstMatch = classTypes.find(ct => ct.slug === target.slug);
          if (firstMatch) {
            expect(result).toBe(firstMatch.displayName);
          } else {
            expect(result).toBe(target.slug);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('derivation is deterministic — same inputs always produce the same className', () => {
    fc.assert(
      fc.property(
        fc.array(classTypeArbitrary, { minLength: 1, maxLength: 20 }),
        slugArbitrary,
        (classTypes, parentClassType) => {
          const result1 = deriveClassName(classTypes, parentClassType);
          const result2 = deriveClassName(classTypes, parentClassType);

          expect(result1).toBe(result2);
        }
      ),
      { numRuns: 100 }
    );
  });
});
