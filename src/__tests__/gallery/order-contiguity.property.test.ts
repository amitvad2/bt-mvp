// Feature: dynamic-gallery-categories, Property 4: Order contiguity invariant
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import type { GalleryCategoryDoc } from '@/types';

/**
 * **Validates: Requirements 4.1, 5.5**
 *
 * Property 4: Order contiguity invariant
 * For any list of N gallery categories (N ≥ 1) and any valid mutation (reorder move
 * or deletion), the resulting order values SHALL form a contiguous sequence from 1 to
 * the number of remaining categories, with no gaps or duplicates.
 */
describe('Property 4: Order contiguity invariant', () => {
    // --- Helper functions that mirror the API route behavior ---

    /**
     * Checks that the given categories have contiguous order values 1..N.
     */
    function hasContiguousOrders(categories: GalleryCategoryDoc[]): boolean {
        if (categories.length === 0) return true;
        const orders = categories.map((c) => c.order).sort((a, b) => a - b);
        for (let i = 0; i < orders.length; i++) {
            if (orders[i] !== i + 1) return false;
        }
        return true;
    }

    /**
     * Reorders categories by swapping the target with its neighbor.
     * Mirrors the API route PUT action: 'reorder' logic.
     * Returns null if the move is a no-op (first up / last down).
     */
    function reorderCategories(
        categories: GalleryCategoryDoc[],
        targetIndex: number,
        direction: 'up' | 'down'
    ): GalleryCategoryDoc[] | null {
        // Sort by order to get canonical list
        const sorted = [...categories].sort((a, b) => a.order - b.order);

        // Reject no-op moves
        if (direction === 'up' && targetIndex === 0) return null;
        if (direction === 'down' && targetIndex === sorted.length - 1) return null;

        const neighborIndex = direction === 'up' ? targetIndex - 1 : targetIndex + 1;

        const target = sorted[targetIndex];
        const neighbor = sorted[neighborIndex];

        // Swap orders
        const result = sorted.map((cat) => {
            if (cat.id === target.id) return { ...cat, order: neighbor.order };
            if (cat.id === neighbor.id) return { ...cat, order: target.order };
            return cat;
        });

        return result;
    }

    /**
     * Deletes a category and recalculates orders to maintain contiguity.
     * Mirrors the API route DELETE logic.
     */
    function deleteAndRecalculate(
        categories: GalleryCategoryDoc[],
        deleteIndex: number
    ): GalleryCategoryDoc[] {
        // Sort by order ascending
        const sorted = [...categories].sort((a, b) => a.order - b.order);

        // Remove the category at deleteIndex
        const remaining = sorted.filter((_, i) => i !== deleteIndex);

        // Recalculate orders: assign 1, 2, 3, ...
        return remaining.map((cat, i) => ({ ...cat, order: i + 1 }));
    }

    // --- Generators ---

    // Generate a valid slug
    const slugArb = fc
        .stringMatching(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/)
        .filter((s) => s.length >= 1 && s.length <= 60 && !s.includes('--'));

    // Generate a category list of N categories with contiguous orders 1..N
    // IDs must be unique (as they are in Firestore)
    const categoryListArb = fc
        .integer({ min: 2, max: 20 })
        .chain((n) =>
            fc
                .array(
                    fc.record({
                        slug: slugArb,
                        label: fc.string({ minLength: 1, maxLength: 50 }),
                        isVisible: fc.boolean(),
                        createdAt: fc.constant(null),
                    }),
                    { minLength: n, maxLength: n }
                )
                .map((cats) =>
                    cats.map((c, i) => ({
                        ...c,
                        id: `cat-${i}`,
                        order: i + 1,
                    })) as GalleryCategoryDoc[]
                )
        );

    // --- Property tests ---

    it('after a reorder move, order values still form a contiguous 1..N sequence', () => {
        fc.assert(
            fc.property(
                categoryListArb,
                fc.nat(),
                fc.constantFrom('up' as const, 'down' as const),
                (categories, rawIndex, direction) => {
                    // Constrain the target index to valid range
                    const targetIndex = rawIndex % categories.length;

                    const result = reorderCategories(categories, targetIndex, direction);

                    if (result === null) {
                        // No-op move — original should still be contiguous
                        expect(hasContiguousOrders(categories)).toBe(true);
                    } else {
                        // After reorder, orders must be contiguous 1..N
                        expect(hasContiguousOrders(result)).toBe(true);
                        // Length must be preserved
                        expect(result.length).toBe(categories.length);
                    }
                }
            ),
            { numRuns: 100 }
        );
    });

    it('after a deletion, order values form a contiguous 1..(N-1) sequence', () => {
        fc.assert(
            fc.property(categoryListArb, fc.nat(), (categories, rawIndex) => {
                // Constrain the delete index to valid range
                const deleteIndex = rawIndex % categories.length;

                const result = deleteAndRecalculate(categories, deleteIndex);

                // After deletion, orders must be contiguous 1..(N-1)
                expect(hasContiguousOrders(result)).toBe(true);
                // Length must be N-1
                expect(result.length).toBe(categories.length - 1);
            }),
            { numRuns: 100 }
        );
    });

    it('after multiple sequential reorders, contiguity is maintained', () => {
        fc.assert(
            fc.property(
                categoryListArb,
                fc.array(
                    fc.record({
                        index: fc.nat(),
                        direction: fc.constantFrom('up' as const, 'down' as const),
                    }),
                    { minLength: 1, maxLength: 5 }
                ),
                (categories, moves) => {
                    let current = categories;

                    for (const move of moves) {
                        const targetIndex = move.index % current.length;
                        const result = reorderCategories(current, targetIndex, move.direction);
                        if (result !== null) {
                            current = result;
                        }
                    }

                    // After any sequence of reorders, contiguity must hold
                    expect(hasContiguousOrders(current)).toBe(true);
                    // Length must remain unchanged (reorder doesn't add/remove)
                    expect(current.length).toBe(categories.length);
                }
            ),
            { numRuns: 100 }
        );
    });
});
