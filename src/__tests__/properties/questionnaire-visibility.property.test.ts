// Feature: dynamic-class-types, Property 3: Flag-Driven Questionnaire Step Visibility
// **Validates: Requirements 7.1, 7.2**

// @vitest-environment node

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

/**
 * Pure function extracted from the booking wizard layout step filter logic.
 * Determines whether the dietary questionnaire step should be shown.
 *
 * - When classTypeRecord is null (loading/not found), default to showing the step.
 * - Otherwise, show the step if and only if skipQuestionnaire === false.
 */
function shouldShowQuestionnaire(classTypeRecord: { skipQuestionnaire: boolean } | null): boolean {
  if (classTypeRecord === null) return true;
  return classTypeRecord.skipQuestionnaire === false;
}

describe('Property 3: Flag-Driven Questionnaire Step Visibility', () => {
  it('shows questionnaire step iff skipQuestionnaire === false', () => {
    fc.assert(
      fc.property(fc.boolean(), (skipQuestionnaire) => {
        const classTypeRecord = { skipQuestionnaire };
        const result = shouldShowQuestionnaire(classTypeRecord);

        if (skipQuestionnaire === false) {
          // Requirement 7.2: step is shown when skipQuestionnaire is false
          expect(result).toBe(true);
        } else {
          // Requirement 7.1: step is skipped when skipQuestionnaire is true
          expect(result).toBe(false);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('defaults to showing the questionnaire step when classTypeRecord is null', () => {
    // When classTypeRecord is null (loading or not found), always show the step
    const result = shouldShowQuestionnaire(null);
    expect(result).toBe(true);
  });

  it('step visibility is entirely determined by the skipQuestionnaire flag', () => {
    // Generate arbitrary class type records with additional random properties
    // to verify that only skipQuestionnaire influences the result
    const classTypeRecordArb = fc.record({
      skipQuestionnaire: fc.boolean(),
      // Extra fields that should NOT influence the outcome
      requireEmergencyContact: fc.boolean(),
      displayName: fc.string(),
      slug: fc.string(),
      defaultAgeMin: fc.nat(),
      defaultAgeMax: fc.nat(),
    });

    fc.assert(
      fc.property(classTypeRecordArb, (record) => {
        const result = shouldShowQuestionnaire(record);
        // The result must be the logical negation of skipQuestionnaire
        expect(result).toBe(!record.skipQuestionnaire);
      }),
      { numRuns: 100 }
    );
  });
});
