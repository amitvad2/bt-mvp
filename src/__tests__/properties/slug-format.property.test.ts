// Feature: dynamic-class-types, Property 2: Slug Format Validation
// **Validates: Requirements 2.2**

// @vitest-environment node

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { classTypeSchema } from '@/app/admin/class-types/schema';

const SLUG_REGEX = /^[a-z0-9-]+$/;

describe('Property 2: Slug Format Validation', () => {
  it('accepts a string iff it matches /^[a-z0-9-]+$/', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const result = classTypeSchema.shape.slug.safeParse(input);
        const matchesRegex = SLUG_REGEX.test(input);

        if (matchesRegex) {
          // Valid slug: regex matches AND non-empty (regex `+` already implies non-empty)
          expect(result.success).toBe(true);
        } else {
          // Invalid slug: either empty or contains invalid characters
          expect(result.success).toBe(false);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('always accepts valid slug strings (lowercase alphanumeric + hyphens)', () => {
    // Generate strings that match the valid slug pattern (non-empty, a-z0-9-)
    const validSlugArb = fc.stringMatching(/^[a-z0-9-]+$/);

    fc.assert(
      fc.property(validSlugArb, (slug) => {
        const result = classTypeSchema.shape.slug.safeParse(slug);
        expect(result.success).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it('always rejects strings with uppercase, spaces, or special characters', () => {
    // Generate strings that contain at least one invalid character
    const invalidCharArb = fc.stringMatching(/^[A-Z !@#$%^&*()_+=\[\]{}|;:'",.?/\\`~]+$/);

    fc.assert(
      fc.property(invalidCharArb, (input) => {
        const result = classTypeSchema.shape.slug.safeParse(input);
        expect(result.success).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  it('always rejects empty strings', () => {
    const result = classTypeSchema.shape.slug.safeParse('');
    expect(result.success).toBe(false);
  });
});
