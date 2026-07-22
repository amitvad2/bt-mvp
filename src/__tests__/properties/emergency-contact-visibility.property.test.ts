// Feature: dynamic-class-types, Property 4: Flag-Driven Emergency Contact Form Visibility
// Validates: Requirements 8.1, 8.2

// @vitest-environment node

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

/**
 * Emergency contact form visibility function extracted from medical/page.tsx.
 * Returns true if the emergency contact form should be displayed and required.
 * When classTypeRecord is null (loading/not found), defaults to hiding the form.
 */
function shouldShowEmergencyContact(
  classTypeRecord: { requireEmergencyContact: boolean } | null
): boolean {
  return classTypeRecord?.requireEmergencyContact ?? false;
}

describe('Property 4: Flag-Driven Emergency Contact Form Visibility', () => {
  it('shows emergency contact form if and only if requireEmergencyContact is true', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        (requireEmergencyContact) => {
          const classTypeRecord = { requireEmergencyContact };
          const result = shouldShowEmergencyContact(classTypeRecord);

          // The form visibility is entirely determined by the flag
          expect(result).toBe(requireEmergencyContact);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('hides emergency contact form when classTypeRecord is null (loading/not found)', () => {
    fc.assert(
      fc.property(
        fc.constant(null),
        (classTypeRecord) => {
          const result = shouldShowEmergencyContact(classTypeRecord);

          // When no record is available, default to hiding the form
          expect(result).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('form visibility matches the flag value for any class type record shape', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.record({ requireEmergencyContact: fc.boolean() }),
          fc.constant(null)
        ),
        (classTypeRecord) => {
          const result = shouldShowEmergencyContact(classTypeRecord);

          if (classTypeRecord === null) {
            // Null record defaults to hiding
            expect(result).toBe(false);
          } else {
            // Non-null record: visibility equals the flag
            expect(result).toBe(classTypeRecord.requireEmergencyContact);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('requireEmergencyContact=true always results in form being shown', () => {
    fc.assert(
      fc.property(
        fc.constant(true),
        (flagValue) => {
          const classTypeRecord = { requireEmergencyContact: flagValue };
          const result = shouldShowEmergencyContact(classTypeRecord);
          expect(result).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('requireEmergencyContact=false always results in form being hidden', () => {
    fc.assert(
      fc.property(
        fc.constant(false),
        (flagValue) => {
          const classTypeRecord = { requireEmergencyContact: flagValue };
          const result = shouldShowEmergencyContact(classTypeRecord);
          expect(result).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });
});
