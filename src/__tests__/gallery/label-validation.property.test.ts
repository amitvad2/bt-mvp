// Feature: dynamic-gallery-categories, Property 2: Label validation correctness
// Validates: Requirements 2.2, 3.2

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { validateLabel } from '@/lib/gallery-categories-service';

describe('Property 2: Label validation correctness', () => {
  it('accepts any string whose trimmed length is between 1 and 50 (inclusive)', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }).filter(
          (s) => s.trim().length > 0 && s.trim().length <= 50
        ),
        (label) => {
          const result = validateLabel(label);
          expect(result).toEqual({ valid: true });
        }
      ),
      { numRuns: 100 }
    );
  });

  it('rejects any string that is empty or whitespace-only after trimming', () => {
    fc.assert(
      fc.property(
        fc.string().filter((s) => s.trim().length === 0),
        (label) => {
          const result = validateLabel(label);
          expect(result.valid).toBe(false);
          expect(result.error).toBeDefined();
          expect(typeof result.error).toBe('string');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('rejects any string whose trimmed length exceeds 50 characters', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 51 }).filter((s) => s.trim().length > 50),
        (label) => {
          const result = validateLabel(label);
          expect(result.valid).toBe(false);
          expect(result.error).toBeDefined();
          expect(typeof result.error).toBe('string');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('for any string, validateLabel returns valid:true iff trim().length is 1..50', () => {
    fc.assert(
      fc.property(fc.string(), (label) => {
        const trimmed = label.trim();
        const result = validateLabel(label);

        if (trimmed.length > 0 && trimmed.length <= 50) {
          expect(result).toEqual({ valid: true });
        } else {
          expect(result.valid).toBe(false);
          expect(result.error).toBeDefined();
          expect(typeof result.error).toBe('string');
        }
      }),
      { numRuns: 100 }
    );
  });
});
