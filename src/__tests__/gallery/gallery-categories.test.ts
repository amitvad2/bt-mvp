import { describe, it, expect } from 'vitest';
import {
    normalizeCategory,
    PUBLIC_CATEGORIES,
    ADMIN_CATEGORIES,
    CATEGORY_LABELS,
} from '@/lib/gallery-categories';

describe('normalizeCategory', () => {
    it('passes cooking-classes through unchanged', () => {
        expect(normalizeCategory('cooking-classes')).toBe('cooking-classes');
    });

    it('passes personal-gallery through unchanged', () => {
        expect(normalizeCategory('personal-gallery')).toBe('personal-gallery');
    });

    it('maps legacy "cakes" to personal-gallery', () => {
        expect(normalizeCategory('cakes')).toBe('personal-gallery');
    });

    it('maps legacy "cookies" to personal-gallery', () => {
        expect(normalizeCategory('cookies')).toBe('personal-gallery');
    });

    it('maps legacy "breads" to personal-gallery', () => {
        expect(normalizeCategory('breads')).toBe('personal-gallery');
    });

    it('defaults undefined to cooking-classes', () => {
        expect(normalizeCategory(undefined)).toBe('cooking-classes');
    });

    it('defaults empty string to cooking-classes', () => {
        expect(normalizeCategory('')).toBe('cooking-classes');
    });

    it('defaults an unknown string to cooking-classes', () => {
        expect(normalizeCategory('something-else')).toBe('cooking-classes');
    });
});

describe('PUBLIC_CATEGORIES', () => {
    it('contains All Photos, Cooking Classes, and Personal Gallery tabs', () => {
        const labels = PUBLIC_CATEGORIES.map(c => c.label);
        expect(labels).toContain('All Photos');
        expect(labels).toContain('Cooking Classes');
        expect(labels).toContain('Personal Gallery');
    });

    it('does not contain legacy category tabs', () => {
        const labels = PUBLIC_CATEGORIES.map(c => c.label);
        expect(labels).not.toContain('Cakes');
        expect(labels).not.toContain('Cookies');
        expect(labels).not.toContain('Breads');
    });

    it('has exactly 3 entries', () => {
        expect(PUBLIC_CATEGORIES).toHaveLength(3);
    });
});

describe('ADMIN_CATEGORIES', () => {
    it('has exactly 2 entries', () => {
        expect(ADMIN_CATEGORIES).toHaveLength(2);
    });

    it('contains cooking-classes and personal-gallery', () => {
        const values = ADMIN_CATEGORIES.map(c => c.value);
        expect(values).toContain('cooking-classes');
        expect(values).toContain('personal-gallery');
    });

    it('does not contain legacy categories', () => {
        const values = ADMIN_CATEGORIES.map(c => c.value);
        expect(values).not.toContain('cakes');
        expect(values).not.toContain('cookies');
        expect(values).not.toContain('breads');
    });
});

describe('CATEGORY_LABELS', () => {
    it('maps cooking-classes to "Cooking Classes"', () => {
        expect(CATEGORY_LABELS['cooking-classes']).toBe('Cooking Classes');
    });

    it('maps personal-gallery to "Personal Gallery"', () => {
        expect(CATEGORY_LABELS['personal-gallery']).toBe('Personal Gallery');
    });
});

describe('normalizeCategory — filter simulation', () => {
    const images = [
        { id: '1', category: 'cooking-classes' as const },
        { id: '2', category: 'cakes' as string },
        { id: '3', category: 'cookies' as string },
        { id: '4', category: 'breads' as string },
        { id: '5', category: 'personal-gallery' as const },
        { id: '6', category: undefined },
    ];

    it('filtering by personal-gallery includes all legacy founder categories', () => {
        const results = images.filter(img => normalizeCategory(img.category) === 'personal-gallery');
        const ids = results.map(i => i.id);
        expect(ids).toContain('2'); // cakes
        expect(ids).toContain('3'); // cookies
        expect(ids).toContain('4'); // breads
        expect(ids).toContain('5'); // personal-gallery
    });

    it('filtering by personal-gallery excludes cooking-classes and undefined', () => {
        const results = images.filter(img => normalizeCategory(img.category) === 'personal-gallery');
        const ids = results.map(i => i.id);
        expect(ids).not.toContain('1'); // cooking-classes
        expect(ids).not.toContain('6'); // undefined → cooking-classes
    });

    it('filtering by cooking-classes only shows class media and undefined fallback', () => {
        const results = images.filter(img => normalizeCategory(img.category) === 'cooking-classes');
        const ids = results.map(i => i.id);
        expect(ids).toContain('1'); // cooking-classes
        expect(ids).toContain('6'); // undefined defaults to cooking-classes
        expect(ids).not.toContain('2'); // cakes → personal-gallery
        expect(ids).not.toContain('3'); // cookies → personal-gallery
        expect(ids).not.toContain('4'); // breads → personal-gallery
        expect(ids).not.toContain('5'); // personal-gallery
    });
});
