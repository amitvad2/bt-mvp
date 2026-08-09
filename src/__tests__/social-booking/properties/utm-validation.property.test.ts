/**
 * Feature: social-commerce-guest-booking, Property 12: UTM Parameter Validation
 *
 * For any UTM parameter value (utm_source, utm_medium, utm_campaign), the system
 * SHALL accept the value if it contains only characters from [A-Za-z0-9._-] and
 * is at most 128 characters in length; SHALL ignore the parameter if it exceeds
 * 128 characters or contains disallowed characters; and SHALL preserve all valid
 * parameters while discarding only invalid ones.
 *
 * Validates: Requirements 7.5, 9.1, 9.3
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { isValidUtmValue, validateAndExtractUtmParams } from '@/lib/social-booking/utm-validation';
import { arbValidUtmValue, arbInvalidUtmValue } from '../helpers/generators';

describe('Property 12: UTM Parameter Validation', () => {
  it('accepts any string containing only [A-Za-z0-9._-] with length 1–128', () => {
    fc.assert(
      fc.property(arbValidUtmValue, (value) => {
        expect(isValidUtmValue(value)).toBe(true);
      }),
      { numRuns: 20 }
    );
  });

  it('rejects any string exceeding 128 characters even if valid charset', () => {
    const arbLongValidChars = fc.string({
      unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._-'.split('')),
      minLength: 129,
      maxLength: 256,
    });

    fc.assert(
      fc.property(arbLongValidChars, (value) => {
        expect(isValidUtmValue(value)).toBe(false);
      }),
      { numRuns: 20 }
    );
  });

  it('rejects any string containing characters outside [A-Za-z0-9._-]', () => {
    const arbInvalidCharsOnly = fc.string({ minLength: 1, maxLength: 128 })
      .filter((s) => /[^A-Za-z0-9._-]/.test(s));

    fc.assert(
      fc.property(arbInvalidCharsOnly, (value) => {
        expect(isValidUtmValue(value)).toBe(false);
      }),
      { numRuns: 20 }
    );
  });

  it('validateAndExtractUtmParams preserves valid params and ignores invalid ones', () => {
    fc.assert(
      fc.property(
        arbValidUtmValue,
        arbValidUtmValue,
        arbInvalidUtmValue,
        (validSource, validCampaign, invalidMedium) => {
          const result = validateAndExtractUtmParams({
            utm_source: validSource,
            utm_medium: invalidMedium,
            utm_campaign: validCampaign,
          });

          // At least one valid param was provided, so result should not be null
          expect(result).not.toBeNull();
          // Valid source is preserved
          expect(result!.source).toBe(validSource);
          // Invalid medium is ignored
          expect(result!.medium).toBeNull();
          // Valid campaign is preserved
          expect(result!.campaign).toBe(validCampaign);
        }
      ),
      { numRuns: 20 }
    );
  });
});
