// Feature: dynamic-gallery-categories, Property 8: Legacy normalization maps unknown strings to default
import { describe, it, expect, vi } from 'vitest';
import * as fc from 'fast-check';

vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  getDocs: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
}));

import { normalizeCategory } from '@/lib/gallery-categories';

/**
 * Property 8: Legacy normalization maps unknown strings to default
 *
 * For any string that is NOT one of the known values
 * ('cooking-classes', 'personal-gallery', 'cakes', 'cookies', 'breads'),
 * normalizeCategory(str) returns 'cooking-classes'.
 *
 * Validates: Requirements 8.2
 */

const KNOWN_VALUES = new Set([
  'cooking-classes',
  'personal-gallery',
  'cakes',
  'cookies',
  'breads',
]);

describe('Property 8: Legacy normalization maps unknown strings to default', () => {
  it('any string not in KNOWN_VALUES maps to cooking-classes', () => {
    fc.assert(
      fc.property(
        fc.string().filter((s) => !KNOWN_VALUES.has(s)),
        (unknownStr) => {
          const result = normalizeCategory(unknownStr);
          expect(result).toBe('cooking-classes');
        }
      ),
      { numRuns: 100 }
    );
  });
});
