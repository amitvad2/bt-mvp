// @vitest-environment node

/**
 * Unit tests for booking wizard step visibility logic.
 * Tests the pure logic functions that determine whether the questionnaire step
 * and emergency contact form are shown/hidden based on class type flags.
 *
 * These functions mirror the exact logic in:
 * - src/app/book/[sessionId]/layout.tsx (questionnaire step filter)
 * - src/app/book/[sessionId]/medical/page.tsx (emergency contact visibility)
 *
 * Requirements: 7.1, 7.2, 8.1, 8.2
 */

import { describe, it, expect } from 'vitest';

/**
 * Determines whether the dietary questionnaire step should be shown in the wizard.
 * Mirrors the step condition logic in layout.tsx:
 *   condition: (_state, classTypeRecord) => classTypeRecord === null || classTypeRecord.skipQuestionnaire === false
 */
function shouldShowQuestionnaire(classTypeRecord: { skipQuestionnaire: boolean } | null): boolean {
  if (classTypeRecord === null) return true;
  return classTypeRecord.skipQuestionnaire === false;
}

/**
 * Determines whether the emergency contact form should be displayed in the medical step.
 * Mirrors the logic in medical/page.tsx:
 *   const showEmergencyContact = classTypeRecord?.requireEmergencyContact ?? false;
 */
function shouldShowEmergencyContact(classTypeRecord: { requireEmergencyContact: boolean } | null): boolean {
  return classTypeRecord?.requireEmergencyContact ?? false;
}

describe('Booking Wizard Step Visibility', () => {
  describe('shouldShowQuestionnaire — Requirement 7.1, 7.2', () => {
    it('shows questionnaire step when skipQuestionnaire is false', () => {
      // Requirement 7.2: step shown when skipQuestionnaire === false
      const result = shouldShowQuestionnaire({ skipQuestionnaire: false });
      expect(result).toBe(true);
    });

    it('hides questionnaire step when skipQuestionnaire is true', () => {
      // Requirement 7.1: step skipped when skipQuestionnaire === true
      const result = shouldShowQuestionnaire({ skipQuestionnaire: true });
      expect(result).toBe(false);
    });

    it('defaults to showing questionnaire step when classTypeRecord is null', () => {
      // When record is null (loading or not found), default to showing the step
      const result = shouldShowQuestionnaire(null);
      expect(result).toBe(true);
    });
  });

  describe('shouldShowEmergencyContact — Requirement 8.1, 8.2', () => {
    it('shows emergency contact form when requireEmergencyContact is true', () => {
      // Requirement 8.1: form shown when requireEmergencyContact === true
      const result = shouldShowEmergencyContact({ requireEmergencyContact: true });
      expect(result).toBe(true);
    });

    it('hides emergency contact form when requireEmergencyContact is false', () => {
      // Requirement 8.2: form hidden when requireEmergencyContact === false
      const result = shouldShowEmergencyContact({ requireEmergencyContact: false });
      expect(result).toBe(false);
    });

    it('defaults to hiding emergency contact form when classTypeRecord is null', () => {
      // When record is null (loading or not found), default to hiding the form
      const result = shouldShowEmergencyContact(null);
      expect(result).toBe(false);
    });
  });
});
