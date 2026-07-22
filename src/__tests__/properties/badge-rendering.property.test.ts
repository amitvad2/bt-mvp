// Feature: dynamic-class-types, Property 8: Badge Rendering From Class Type Record
// **Validates: Requirements 9.2, 9.3, 10.1, 10.2, 10.3**

// @vitest-environment node

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

/**
 * Badge resolver function extracted from UI components (admin and public).
 * Given a list of class type records and a session's classType slug,
 * returns the badge label and color. Falls back to raw slug with 'gray'
 * when no matching class type is found.
 */
function resolveBadge(
  classTypes: { slug: string; shortLabel: string; badgeColor: string }[],
  sessionClassType: string
): { label: string; color: string } {
  const ct = classTypes.find(t => t.slug === sessionClassType);
  if (ct) {
    return { label: ct.shortLabel, color: ct.badgeColor };
  }
  return { label: sessionClassType, color: 'gray' };
}

// Valid badge colors as defined in the spec
const BADGE_COLORS = ['amber', 'green', 'indigo', 'red', 'gray'] as const;

// Arbitrary for generating a valid slug (lowercase alphanumeric + hyphens, 1-30 chars)
const slugArbitrary = fc.stringMatching(/^[a-z0-9-]{1,30}$/);

// Arbitrary for generating a valid badge color
const badgeColorArbitrary = fc.constantFrom(...BADGE_COLORS);

// Arbitrary for generating a short label (non-empty, max 20 chars)
const shortLabelArbitrary = fc.string({ minLength: 1, maxLength: 20 });

// Arbitrary for generating a class type record relevant to badge rendering
const classTypeRecordArbitrary = fc.record({
  slug: slugArbitrary,
  shortLabel: shortLabelArbitrary,
  badgeColor: badgeColorArbitrary,
});

describe('Property 8: Badge Rendering From Class Type Record', () => {
  it('returns shortLabel and badgeColor when a matching class type exists', () => {
    fc.assert(
      fc.property(
        fc.array(classTypeRecordArbitrary, { minLength: 1, maxLength: 20 }),
        (classTypes) => {
          // Pick the first class type as the session's classType
          const targetClassType = classTypes[0];

          const result = resolveBadge(classTypes, targetClassType.slug);

          expect(result.label).toBe(targetClassType.shortLabel);
          expect(result.color).toBe(targetClassType.badgeColor);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('falls back to raw slug with gray color when no matching class type is found', () => {
    fc.assert(
      fc.property(
        fc.array(classTypeRecordArbitrary, { minLength: 0, maxLength: 20 }),
        slugArbitrary,
        (classTypes, sessionSlug) => {
          // Pre-condition: the session slug does not match any class type in the array
          fc.pre(!classTypes.some(ct => ct.slug === sessionSlug));

          const result = resolveBadge(classTypes, sessionSlug);

          expect(result.label).toBe(sessionSlug);
          expect(result.color).toBe('gray');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('badge color is always one of the valid badge colors or gray fallback', () => {
    fc.assert(
      fc.property(
        fc.array(classTypeRecordArbitrary, { minLength: 0, maxLength: 20 }),
        slugArbitrary,
        (classTypes, sessionSlug) => {
          const result = resolveBadge(classTypes, sessionSlug);

          const validColors = ['amber', 'green', 'indigo', 'red', 'gray'];
          expect(validColors).toContain(result.color);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('badge label is never empty — either shortLabel or raw slug', () => {
    fc.assert(
      fc.property(
        fc.array(classTypeRecordArbitrary, { minLength: 0, maxLength: 20 }),
        slugArbitrary,
        (classTypes, sessionSlug) => {
          const result = resolveBadge(classTypes, sessionSlug);

          expect(result.label.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('returns the first matching class type when duplicates exist', () => {
    fc.assert(
      fc.property(
        slugArbitrary,
        shortLabelArbitrary,
        shortLabelArbitrary,
        badgeColorArbitrary,
        badgeColorArbitrary,
        (slug, label1, label2, color1, color2) => {
          // Create class types with duplicate slugs but different labels/colors
          const classTypes = [
            { slug, shortLabel: label1, badgeColor: color1 },
            { slug, shortLabel: label2, badgeColor: color2 },
          ];

          const result = resolveBadge(classTypes, slug);

          // Should return the first match (Array.find behavior)
          expect(result.label).toBe(label1);
          expect(result.color).toBe(color1);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('correctly resolves any class type from a mixed collection', () => {
    fc.assert(
      fc.property(
        fc.array(classTypeRecordArbitrary, { minLength: 2, maxLength: 20 }),
        fc.nat(),
        (classTypes, indexSeed) => {
          // Ensure unique slugs for this test to avoid ambiguity
          const uniqueClassTypes = classTypes.filter(
            (ct, i, arr) => arr.findIndex(x => x.slug === ct.slug) === i
          );
          fc.pre(uniqueClassTypes.length >= 2);

          // Pick a random class type from the unique set
          const index = indexSeed % uniqueClassTypes.length;
          const target = uniqueClassTypes[index];

          const result = resolveBadge(uniqueClassTypes, target.slug);

          expect(result.label).toBe(target.shortLabel);
          expect(result.color).toBe(target.badgeColor);
        }
      ),
      { numRuns: 100 }
    );
  });
});
