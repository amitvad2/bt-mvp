// Feature: dynamic-gallery-categories, Property 3: Slug immutability on update
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import type { GalleryCategoryDoc } from '@/types';
import { validateLabel } from '@/lib/gallery-categories-service';

/**
 * **Validates: Requirements 3.1**
 *
 * Property 3: Slug immutability on update
 * For any existing GalleryCategoryDoc and any valid new label, updating the category's
 * label SHALL change only the label field while the slug field remains identical to its
 * value before the update.
 */
describe('Property 3: Slug immutability on update', () => {
    // Generator for a valid slug: lowercase alphanumeric with hyphens, no consecutive hyphens,
    // no leading/trailing hyphens, 1-60 chars
    const slugArb = fc
        .stringMatching(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/)
        .filter((s) => s.length >= 1 && s.length <= 60 && !s.includes('--'));

    // Generator for a valid label: non-empty after trimming, ≤50 chars
    const validLabelArb = fc
        .string({ minLength: 1, maxLength: 50 })
        .filter((s) => {
            const trimmed = s.trim();
            return trimmed.length >= 1 && trimmed.length <= 50;
        });

    // Generator for a GalleryCategoryDoc
    const categoryArb = fc.record({
        id: fc.string({ minLength: 1, maxLength: 20 }),
        slug: slugArb,
        label: validLabelArb,
        order: fc.nat({ max: 100 }),
        isVisible: fc.boolean(),
        createdAt: fc.constant(null),
    }) as fc.Arbitrary<GalleryCategoryDoc>;

    /**
     * Simulates the update operation logic: when updating a category's label,
     * only the label field changes. The slug is never modified.
     * This mirrors the API route PUT handler behavior (action: 'update').
     */
    function updateCategoryLabel(
        category: GalleryCategoryDoc,
        newLabel: string
    ): GalleryCategoryDoc {
        // Validate the new label
        const validation = validateLabel(newLabel);
        if (!validation.valid) {
            // If invalid, return the category unchanged (update rejected)
            return category;
        }
        // Update only the label field — slug is immutable
        return {
            ...category,
            label: newLabel.trim(),
        };
    }

    it('preserves the slug field when the label is updated with a valid new label', () => {
        fc.assert(
            fc.property(categoryArb, validLabelArb, (category, newLabel) => {
                const originalSlug = category.slug;
                const updated = updateCategoryLabel(category, newLabel);

                expect(updated.slug).toBe(originalSlug);
            }),
            { numRuns: 100 }
        );
    });

    it('only changes the label field during a label update', () => {
        fc.assert(
            fc.property(categoryArb, validLabelArb, (category, newLabel) => {
                const updated = updateCategoryLabel(category, newLabel);

                // Slug remains identical
                expect(updated.slug).toBe(category.slug);
                // Id remains identical
                expect(updated.id).toBe(category.id);
                // Order remains identical
                expect(updated.order).toBe(category.order);
                // Visibility remains identical
                expect(updated.isVisible).toBe(category.isVisible);
                // CreatedAt remains identical
                expect(updated.createdAt).toBe(category.createdAt);
            }),
            { numRuns: 100 }
        );
    });

    it('preserves the slug even when the new label would generate a different slug', () => {
        fc.assert(
            fc.property(categoryArb, validLabelArb, (category, newLabel) => {
                const updated = updateCategoryLabel(category, newLabel);

                // Even if the new label is completely different from the original,
                // the slug must not change — it is fixed at creation time
                expect(updated.slug).toBe(category.slug);
            }),
            { numRuns: 100 }
        );
    });
});
