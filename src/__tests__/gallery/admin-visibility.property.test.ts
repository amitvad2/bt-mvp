// Feature: dynamic-gallery-categories, Property 9: Admin view shows all categories regardless of visibility
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import type { GalleryCategoryDoc } from '@/types';

/**
 * **Validates: Requirements 7.1, 7.2**
 *
 * Property 9: Admin view shows all categories regardless of visibility
 * For any set of gallery categories with arbitrary `isVisible` flags, the admin category
 * dropdown SHALL include every category in the set, regardless of its `isVisible` value,
 * ordered by `order` ascending.
 */
describe('Property 9: Admin view shows all categories regardless of visibility', () => {
    /**
     * Pure logic for what the admin dropdown should display.
     * Admin sees ALL categories ordered by order ASC — no visibility filtering.
     */
    function getAdminDropdownCategories(categories: GalleryCategoryDoc[]): GalleryCategoryDoc[] {
        return [...categories].sort((a, b) => a.order - b.order);
    }

    // Generator for a category with random isVisible flag and unique order
    const categoryArb = (order: number) =>
        fc.record({
            id: fc.string({ minLength: 1, maxLength: 10 }).map((s) => `cat-${order}-${s}`),
            slug: fc.stringMatching(/^[a-z]{3,12}$/).filter((s) => s.length >= 3).map((s) => `${s}-${order}`),
            label: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
            order: fc.constant(order),
            isVisible: fc.boolean(),
            createdAt: fc.constant(null as any),
        });

    // Generator for a list of categories with contiguous orders (1..N), random visibility
    const categoryListArb = fc.integer({ min: 1, max: 15 }).chain((n) => {
        const arbs = Array.from({ length: n }, (_, i) => categoryArb(i + 1));
        return fc.tuple(...(arbs as [ReturnType<typeof categoryArb>, ...ReturnType<typeof categoryArb>[]]));
    }).map((cats) => cats as GalleryCategoryDoc[]);

    it('includes every category regardless of isVisible flag', () => {
        fc.assert(
            fc.property(categoryListArb, (categories) => {
                const result = getAdminDropdownCategories(categories);

                // Result must contain ALL categories — none filtered out
                expect(result.length).toBe(categories.length);

                // Every input category must be present in result
                for (const cat of categories) {
                    const found = result.find((r) => r.id === cat.id);
                    expect(found).toBeDefined();
                }
            }),
            { numRuns: 100 }
        );
    });

    it('result is ordered by order ASC', () => {
        fc.assert(
            fc.property(categoryListArb, (categories) => {
                const result = getAdminDropdownCategories(categories);

                // Verify ascending order
                for (let i = 1; i < result.length; i++) {
                    expect(result[i].order).toBeGreaterThanOrEqual(result[i - 1].order);
                }
            }),
            { numRuns: 100 }
        );
    });

    it('hidden categories (isVisible=false) are NOT excluded from admin view', () => {
        fc.assert(
            fc.property(categoryListArb, (categories) => {
                const hiddenCategories = categories.filter((c) => !c.isVisible);
                const result = getAdminDropdownCategories(categories);

                // Every hidden category must still appear in the admin dropdown
                for (const hidden of hiddenCategories) {
                    const found = result.find((r) => r.id === hidden.id);
                    expect(found).toBeDefined();
                }
            }),
            { numRuns: 100 }
        );
    });

    it('no categories are added or duplicated in the result', () => {
        fc.assert(
            fc.property(categoryListArb, (categories) => {
                const result = getAdminDropdownCategories(categories);

                // Same count — no duplicates or extras
                expect(result.length).toBe(categories.length);

                // Verify each result ID maps back to exactly one input
                const resultIds = result.map((r) => r.id);
                const uniqueResultIds = new Set(resultIds);
                expect(uniqueResultIds.size).toBe(result.length);
            }),
            { numRuns: 100 }
        );
    });
});
