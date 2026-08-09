import { describe, it, expect } from 'vitest';
import {
  isValidUtmValue,
  validateAndExtractUtmParams,
  UTM_ALLOWED_CHARS,
  UTM_MAX_LENGTH,
} from '@/lib/social-booking/utm-validation';

describe('UTM Validation', () => {
  describe('isValidUtmValue', () => {
    it('returns false for undefined', () => {
      expect(isValidUtmValue(undefined)).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(isValidUtmValue('')).toBe(false);
    });

    it('returns true for valid alphanumeric value', () => {
      expect(isValidUtmValue('summer2024')).toBe(true);
    });

    it('returns true for value with hyphens', () => {
      expect(isValidUtmValue('social-campaign')).toBe(true);
    });

    it('returns true for value with underscores', () => {
      expect(isValidUtmValue('social_campaign')).toBe(true);
    });

    it('returns true for value with periods', () => {
      expect(isValidUtmValue('campaign.v2')).toBe(true);
    });

    it('returns true for value with mixed allowed chars', () => {
      expect(isValidUtmValue('My_Campaign-2024.v1')).toBe(true);
    });

    it('returns false for value with spaces', () => {
      expect(isValidUtmValue('summer campaign')).toBe(false);
    });

    it('returns false for value with special characters', () => {
      expect(isValidUtmValue('campaign@2024')).toBe(false);
      expect(isValidUtmValue('campaign+test')).toBe(false);
      expect(isValidUtmValue('campaign=value')).toBe(false);
      expect(isValidUtmValue('campaign&other')).toBe(false);
    });

    it('returns false for value exceeding 128 characters', () => {
      const longValue = 'a'.repeat(129);
      expect(isValidUtmValue(longValue)).toBe(false);
    });

    it('returns true for value at exactly 128 characters', () => {
      const maxValue = 'a'.repeat(128);
      expect(isValidUtmValue(maxValue)).toBe(true);
    });

    it('returns true for single character values', () => {
      expect(isValidUtmValue('a')).toBe(true);
      expect(isValidUtmValue('1')).toBe(true);
      expect(isValidUtmValue('-')).toBe(true);
      expect(isValidUtmValue('_')).toBe(true);
      expect(isValidUtmValue('.')).toBe(true);
    });
  });

  describe('validateAndExtractUtmParams', () => {
    it('returns null when no params are provided', () => {
      expect(validateAndExtractUtmParams({})).toBeNull();
    });

    it('returns null when all params are invalid', () => {
      expect(
        validateAndExtractUtmParams({
          utm_source: 'invalid source',
          utm_medium: 'bad@medium',
          utm_campaign: '',
        })
      ).toBeNull();
    });

    it('extracts all valid params', () => {
      const result = validateAndExtractUtmParams({
        utm_source: 'whatsapp',
        utm_medium: 'social',
        utm_campaign: 'summer-2024',
      });
      expect(result).toEqual({
        source: 'whatsapp',
        medium: 'social',
        campaign: 'summer-2024',
      });
    });

    it('ignores invalid params while preserving valid ones', () => {
      const result = validateAndExtractUtmParams({
        utm_source: 'whatsapp',
        utm_medium: 'invalid medium!',
        utm_campaign: 'summer-2024',
      });
      expect(result).toEqual({
        source: 'whatsapp',
        medium: null,
        campaign: 'summer-2024',
      });
    });

    it('returns result with only one valid param', () => {
      const result = validateAndExtractUtmParams({
        utm_campaign: 'launch',
      });
      expect(result).toEqual({
        source: null,
        medium: null,
        campaign: 'launch',
      });
    });

    it('ignores params exceeding 128 characters', () => {
      const result = validateAndExtractUtmParams({
        utm_source: 'a'.repeat(129),
        utm_medium: 'valid',
        utm_campaign: 'b'.repeat(200),
      });
      expect(result).toEqual({
        source: null,
        medium: 'valid',
        campaign: null,
      });
    });
  });

  describe('constants', () => {
    it('UTM_MAX_LENGTH is 128', () => {
      expect(UTM_MAX_LENGTH).toBe(128);
    });

    it('UTM_ALLOWED_CHARS matches the correct character set', () => {
      expect(UTM_ALLOWED_CHARS.test('abcXYZ019')).toBe(true);
      expect(UTM_ALLOWED_CHARS.test('._-')).toBe(true);
      expect(UTM_ALLOWED_CHARS.test('has space')).toBe(false);
      expect(UTM_ALLOWED_CHARS.test('special@char')).toBe(false);
    });
  });
});
