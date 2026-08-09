// Feature: recurring-term-classes, Property 1: Term field visibility is controlled by commitment value
// **Validates: Requirements 1.2, 1.3**

// @vitest-environment node

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { classFormSchema } from '@/app/admin/classes/schema';

/**
 * Property 1: Term field visibility is controlled by commitment value.
 *
 * For any class form state, term-specific fields (termStartDate, termEndDate,
 * termPrice, recurrenceDays) SHALL be visible/required if and only if the
 * commitment value is 'term'.
 *
 * We test this at the schema level: when commitment === 'term', omitting term
 * fields causes validation errors. When commitment === 'perSession', omitting
 * term fields does NOT cause validation errors.
 */

// Arbitrary for valid base form data (fields that are always required)
const baseFormDataArb = fc.record({
  type: fc.constantFrom('kidsAfterSchool', 'youngAdultWeekend'),
  dayOfWeek: fc.constantFrom('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'),
  startTime: fc.constant('09:00'),
  endTime: fc.constant('10:00'),
  ageMin: fc.integer({ min: 0, max: 17 }),
  ageMax: fc.integer({ min: 1, max: 18 }),
  maxSize: fc.integer({ min: 1, max: 30 }),
  instructor: fc.string(),
  venueId: fc.constantFrom('venue1', 'venue2', 'venue3'),
  price: fc.integer({ min: 0, max: 100000 }),
});

// Arbitrary for valid term-specific fields (recurrenceDays can be empty — it's optional per Requirement 1.7, 11.9)
const validTermFieldsArb = fc.record({
  termStartDate: fc.constant('2025-01-06'),
  termEndDate: fc.constant('2025-03-28'),
  termPrice: fc.integer({ min: 1, max: 100000 }),
  recurrenceDays: fc.subarray(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'], { minLength: 0 }),
});

describe('Feature: recurring-term-classes, Property 1: Term field visibility is controlled by commitment value', () => {
  it('when commitment is "perSession", form validates successfully WITHOUT term fields', () => {
    fc.assert(
      fc.property(
        baseFormDataArb,
        (baseData) => {
          const formData = {
            ...baseData,
            commitment: 'perSession' as const,
            // No term fields provided
          };

          const result = classFormSchema.safeParse(formData);

          // Per-session forms should not require term fields
          // Check that there are no term-field-specific errors
          if (!result.success) {
            const termFieldPaths = ['termStartDate', 'termEndDate', 'termPrice', 'recurrenceDays'];
            const termErrors = result.error.issues.filter(issue =>
              issue.path.some(p => termFieldPaths.includes(String(p)))
            );
            // There should be no validation errors on term fields
            expect(termErrors).toHaveLength(0);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('when commitment is "term", form REQUIRES term-specific fields and fails without them', () => {
    fc.assert(
      fc.property(
        baseFormDataArb,
        (baseData) => {
          const formData = {
            ...baseData,
            commitment: 'term' as const,
            // Deliberately omit term fields
          };

          const result = classFormSchema.safeParse(formData);

          // Should fail validation because term fields are missing
          expect(result.success).toBe(false);
          if (!result.success) {
            const errorPaths = result.error.issues.map(issue => issue.path[0]);
            // At least one term field should produce a validation error
            const termFieldPaths = ['termStartDate', 'termEndDate', 'termPrice', 'recurrenceDays'];
            const hasTermErrors = termFieldPaths.some(field => errorPaths.includes(field));
            expect(hasTermErrors).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('when commitment is "term" with valid term fields, form validates successfully', () => {
    fc.assert(
      fc.property(
        baseFormDataArb,
        validTermFieldsArb,
        (baseData, termFields) => {
          const formData = {
            ...baseData,
            commitment: 'term' as const,
            ...termFields,
          };

          const result = classFormSchema.safeParse(formData);

          // With all valid term fields provided, the form should pass
          expect(result.success).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('term field requirement is biconditional: visible/required iff commitment === "term"', () => {
    fc.assert(
      fc.property(
        baseFormDataArb,
        fc.constantFrom('perSession' as const, 'term' as const),
        validTermFieldsArb,
        (baseData, commitment, termFields) => {
          // Test with term fields omitted
          const formDataWithout = {
            ...baseData,
            commitment,
          };

          const resultWithout = classFormSchema.safeParse(formDataWithout);

          if (commitment === 'term') {
            // Term commitment without term fields should FAIL
            expect(resultWithout.success).toBe(false);
          } else {
            // Per-session commitment without term fields should have no term-related errors
            if (!resultWithout.success) {
              const termFieldPaths = ['termStartDate', 'termEndDate', 'termPrice', 'recurrenceDays'];
              const termErrors = resultWithout.error.issues.filter(issue =>
                issue.path.some(p => termFieldPaths.includes(String(p)))
              );
              expect(termErrors).toHaveLength(0);
            }
          }

          // Test with term fields included
          const formDataWith = {
            ...baseData,
            commitment,
            ...termFields,
          };

          const resultWith = classFormSchema.safeParse(formDataWith);

          if (commitment === 'term') {
            // Term commitment with valid term fields should PASS
            expect(resultWith.success).toBe(true);
          } else {
            // Per-session commitment with term fields should also pass (extra fields are allowed by zod .object())
            // No term-field validation errors should occur
            if (!resultWith.success) {
              const termFieldPaths = ['termStartDate', 'termEndDate', 'termPrice', 'recurrenceDays'];
              const termErrors = resultWith.error.issues.filter(issue =>
                issue.path.some(p => termFieldPaths.includes(String(p)))
              );
              expect(termErrors).toHaveLength(0);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
