// Feature: dynamic-gallery-categories, Property 1: Slug generation produces valid slugs
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { generateSlug } from '@/lib/gallery-categories-service';

/**
 * **Validates: Requirements 2.1**
 *
 * Property 1: Slug generation produces valid slugs
 * For any non-empty string label (1–50 chars after trimming), generateSlug produces a string
 * that matches [a-z0-9-]+, no consecutive hyphens, no leading/trailing hyphens, ≤60 chars, non-empty.
 */
describe('Property 1: Slug generation produces valid slugs', () => {
    // Generator: strings 1–50 chars after trimming that contain at least one [a-z0-9] character
    // This ensures the slug will be non-empty after processing
    const validLabelArb = fc
        .string({ minLength: 1, maxLength: 50 })
        .filter((s) => {
            const trimmed = s.trim();
            // Must be 1–50 chars after trimming
            if (trimmed.length < 1 || trimmed.length > 50) return false;
            // Must contain at least one character that survives slug processing (a-z, 0-9, or A-Z which lowercases)
            return /[a-zA-Z0-9]/.test(trimmed);
        });

    it('produces a slug containing only valid characters [a-z0-9-]', () => {
        fc.assert(
            fc.property(validLabelArb, (label) => {
                const slug = generateSlug(label);
                expect(slug).toMatch(/^[a-z0-9-]+$/);
            }),
            { numRuns: 100 }
        );
    });

    it('produces a slug with no consecutive hyphens', () => {
        fc.assert(
            fc.property(validLabelArb, (label) => {
                const slug = generateSlug(label);
                expect(slug).not.toContain('--');
            }),
            { numRuns: 100 }
        );
    });

    it('produces a slug with no leading or trailing hyphens', () => {
        fc.assert(
            fc.property(validLabelArb, (label) => {
                const slug = generateSlug(label);
                expect(slug).not.toMatch(/^-/);
                expect(slug).not.toMatch(/-$/);
            }),
            { numRuns: 100 }
        );
    });

    it('produces a slug of at most 60 characters', () => {
        fc.assert(
            fc.property(validLabelArb, (label) => {
                const slug = generateSlug(label);
                expect(slug.length).toBeLessThanOrEqual(60);
            }),
            { numRuns: 100 }
        );
    });

    it('produces a non-empty slug', () => {
        fc.assert(
            fc.property(validLabelArb, (label) => {
                const slug = generateSlug(label);
                expect(slug.length).toBeGreaterThan(0);
            }),
            { numRuns: 100 }
        );
    });

    it('satisfies all slug validity constraints simultaneously', () => {
        fc.assert(
            fc.property(validLabelArb, (label) => {
                const slug = generateSlug(label);

                // Non-empty
                expect(slug.length).toBeGreaterThan(0);
                // Only valid characters
                expect(slug).toMatch(/^[a-z0-9-]+$/);
                // No consecutive hyphens
                expect(slug).not.toContain('--');
                // No leading hyphen
                expect(slug).not.toMatch(/^-/);
                // No trailing hyphen
                expect(slug).not.toMatch(/-$/);
                // At most 60 characters
                expect(slug.length).toBeLessThanOrEqual(60);
            }),
            { numRuns: 100 }
        );
    });
});
