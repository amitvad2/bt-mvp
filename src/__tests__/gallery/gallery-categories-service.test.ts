import { describe, it, expect } from 'vitest';
import {
    generateSlug,
    validateLabel,
    validateSlug,
    DEFAULT_CATEGORIES,
} from '@/lib/gallery-categories-service';

describe('generateSlug', () => {
    it('converts a simple label to a slug', () => {
        expect(generateSlug('Cooking Classes')).toBe('cooking-classes');
    });

    it('trims whitespace from the label', () => {
        expect(generateSlug('  Hello World  ')).toBe('hello-world');
    });

    it('removes special characters', () => {
        expect(generateSlug('Café & Pâtisserie!')).toBe('caf-ptisserie');
    });

    it('collapses consecutive hyphens', () => {
        expect(generateSlug('one---two')).toBe('one-two');
    });

    it('removes leading and trailing hyphens', () => {
        expect(generateSlug('---hello---')).toBe('hello');
    });

    it('handles spaces and special chars together', () => {
        expect(generateSlug('My   Special!! Category')).toBe('my-special-category');
    });

    it('truncates to 60 characters', () => {
        const longLabel = 'a'.repeat(70);
        const slug = generateSlug(longLabel);
        expect(slug.length).toBeLessThanOrEqual(60);
    });

    it('does not end with a hyphen after truncation', () => {
        // Create a label that will produce a slug ending in a hyphen at position 60
        const label = 'a'.repeat(59) + ' b';
        const slug = generateSlug(label);
        expect(slug).not.toMatch(/-$/);
    });

    it('handles numeric labels', () => {
        expect(generateSlug('123 456')).toBe('123-456');
    });

    it('handles already-valid slugs', () => {
        expect(generateSlug('personal-gallery')).toBe('personal-gallery');
    });
});

describe('validateLabel', () => {
    it('accepts a normal label', () => {
        expect(validateLabel('Cooking Classes')).toEqual({ valid: true });
    });

    it('rejects an empty string', () => {
        const result = validateLabel('');
        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
    });

    it('rejects whitespace-only string', () => {
        const result = validateLabel('   ');
        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
    });

    it('accepts exactly 50 characters after trimming', () => {
        const label = 'a'.repeat(50);
        expect(validateLabel(label)).toEqual({ valid: true });
    });

    it('rejects 51 characters after trimming', () => {
        const label = 'a'.repeat(51);
        const result = validateLabel(label);
        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
    });

    it('trims before measuring length', () => {
        const label = '  ' + 'a'.repeat(50) + '  ';
        expect(validateLabel(label)).toEqual({ valid: true });
    });
});

describe('validateSlug', () => {
    it('accepts a valid slug', () => {
        expect(validateSlug('cooking-classes')).toBe(true);
    });

    it('accepts a numeric slug', () => {
        expect(validateSlug('123-abc')).toBe(true);
    });

    it('rejects an empty string', () => {
        expect(validateSlug('')).toBe(false);
    });

    it('rejects uppercase characters', () => {
        expect(validateSlug('Cooking')).toBe(false);
    });

    it('rejects spaces', () => {
        expect(validateSlug('cooking classes')).toBe(false);
    });

    it('rejects special characters', () => {
        expect(validateSlug('cooking_classes')).toBe(false);
    });

    it('rejects slugs over 60 characters', () => {
        expect(validateSlug('a'.repeat(61))).toBe(false);
    });

    it('accepts slugs of exactly 60 characters', () => {
        expect(validateSlug('a'.repeat(60))).toBe(true);
    });
});

describe('DEFAULT_CATEGORIES', () => {
    it('contains exactly two categories', () => {
        expect(DEFAULT_CATEGORIES).toHaveLength(2);
    });

    it('has cooking-classes as order 1', () => {
        expect(DEFAULT_CATEGORIES[0].slug).toBe('cooking-classes');
        expect(DEFAULT_CATEGORIES[0].label).toBe('Cooking Classes');
        expect(DEFAULT_CATEGORIES[0].order).toBe(1);
        expect(DEFAULT_CATEGORIES[0].isVisible).toBe(true);
    });

    it('has personal-gallery as order 2', () => {
        expect(DEFAULT_CATEGORIES[1].slug).toBe('personal-gallery');
        expect(DEFAULT_CATEGORIES[1].label).toBe('Personal Gallery');
        expect(DEFAULT_CATEGORIES[1].order).toBe(2);
        expect(DEFAULT_CATEGORIES[1].isVisible).toBe(true);
    });

    it('uses null for createdAt', () => {
        expect(DEFAULT_CATEGORIES[0].createdAt).toBeNull();
        expect(DEFAULT_CATEGORIES[1].createdAt).toBeNull();
    });
});
