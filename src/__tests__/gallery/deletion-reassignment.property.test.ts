// Feature: dynamic-gallery-categories, Property 7: Deletion reassigns images to lowest-order category
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

/**
 * **Validates: Requirements 5.3**
 *
 * Property 7: Deletion reassigns images to lowest-order category
 * For any set of gallery categories (N ≥ 2) and any category that has images assigned,
 * deleting that category SHALL reassign all its images to the category with the lowest
 * `order` value among the remaining categories. No images SHALL be orphaned.
 */
describe('Property 7: Deletion reassigns images to lowest-order category', () => {
    /**
     * Pure logic for deletion + image reassignment.
     * Mirrors the DELETE handler behavior in the API route.
     */
    function deleteAndReassign(
        categories: { id: string; slug: string; order: number }[],
        images: { id: string; category: string }[],
        deleteIndex: number
    ): { images: { id: string; category: string }[]; deletedSlug: string; reassignedTo: string } {
        const deletedCategory = categories[deleteIndex];
        const deletedSlug = deletedCategory.slug;

        // Find remaining categories (all except the deleted one)
        const remaining = categories.filter((_, i) => i !== deleteIndex);

        // Find the remaining category with the lowest order
        const lowestOrderCategory = remaining.reduce((min, cat) =>
            cat.order < min.order ? cat : min
        );
        const reassignedTo = lowestOrderCategory.slug;

        // Reassign images: any image in the deleted category goes to the lowest-order remaining
        const updatedImages = images.map((img) => {
            if (img.category === deletedSlug) {
                return { ...img, category: reassignedTo };
            }
            return img;
        });

        return { images: updatedImages, deletedSlug, reassignedTo };
    }

    // Generator for unique lowercase slug strings
    const slugArb = fc
        .stringMatching(/^[a-z]{3,10}$/)
        .filter((s) => s.length >= 3);

    // Generator for a valid category list with N≥2 unique slugs + a delete index
    const categoryListArb = fc.integer({ min: 2, max: 10 }).chain((n) =>
        fc
            .tuple(
                fc.array(
                    fc.stringMatching(/^[a-z]{3,10}$/).filter((s) => s.length >= 3),
                    { minLength: n + 2, maxLength: n + 5 }
                ),
                fc.nat({ max: n - 1 }) // index to delete
            )
            .map(([slugCandidates, delIdx]) => {
                // Deduplicate slugs and take at least 2
                const uniqueSlugs = [...new Set(slugCandidates)].slice(0, Math.max(2, n));
                const categories = uniqueSlugs.map((slug, i) => ({
                    id: `cat-${i}`,
                    slug,
                    order: i + 1,
                }));
                const safeDeleteIndex = delIdx % categories.length;
                return { categories, deleteIndex: safeDeleteIndex };
            })
            .filter(({ categories }) => categories.length >= 2)
    );

    // Generator for images assigned to random categories from the list (with unique IDs)
    const imagesArb = (categorySlugs: string[]) =>
        fc.integer({ min: 1, max: 20 }).chain((count) =>
            fc.array(
                fc.constantFrom(...categorySlugs),
                { minLength: count, maxLength: count }
            ).map((cats) =>
                cats.map((category, i) => ({
                    id: `img-${i}`,
                    category,
                }))
            )
        );

    it('no image references the deleted category after deletion', () => {
        fc.assert(
            fc.property(
                categoryListArb.chain(({ categories, deleteIndex }) => {
                    const slugs = categories.map((c) => c.slug);
                    return imagesArb(slugs).map((images) => ({
                        categories,
                        deleteIndex,
                        images,
                    }));
                }),
                ({ categories, deleteIndex, images }) => {
                    const result = deleteAndReassign(categories, images, deleteIndex);

                    // No image should reference the deleted slug
                    const hasOrphans = result.images.some(
                        (img) => img.category === result.deletedSlug
                    );
                    expect(hasOrphans).toBe(false);
                }
            ),
            { numRuns: 100 }
        );
    });

    it('all images from the deleted category are reassigned to the lowest-order remaining category', () => {
        fc.assert(
            fc.property(
                categoryListArb.chain(({ categories, deleteIndex }) => {
                    const slugs = categories.map((c) => c.slug);
                    return imagesArb(slugs).map((images) => ({
                        categories,
                        deleteIndex,
                        images,
                    }));
                }),
                ({ categories, deleteIndex, images }) => {
                    const deletedSlug = categories[deleteIndex].slug;
                    const remaining = categories.filter((_, i) => i !== deleteIndex);
                    const lowestOrder = remaining.reduce((min, cat) =>
                        cat.order < min.order ? cat : min
                    );

                    const result = deleteAndReassign(categories, images, deleteIndex);

                    // Every image that was in the deleted category must now be in the lowest-order remaining
                    const originallyInDeleted = images.filter(
                        (img) => img.category === deletedSlug
                    );
                    for (const origImg of originallyInDeleted) {
                        const updatedImg = result.images.find((img) => img.id === origImg.id);
                        expect(updatedImg).toBeDefined();
                        expect(updatedImg!.category).toBe(lowestOrder.slug);
                    }
                }
            ),
            { numRuns: 100 }
        );
    });

    it('total image count remains the same (no orphaned or duplicated images)', () => {
        fc.assert(
            fc.property(
                categoryListArb.chain(({ categories, deleteIndex }) => {
                    const slugs = categories.map((c) => c.slug);
                    return imagesArb(slugs).map((images) => ({
                        categories,
                        deleteIndex,
                        images,
                    }));
                }),
                ({ categories, deleteIndex, images }) => {
                    const result = deleteAndReassign(categories, images, deleteIndex);

                    // Total count must remain the same
                    expect(result.images.length).toBe(images.length);
                }
            ),
            { numRuns: 100 }
        );
    });

    it('images not in the deleted category remain unchanged', () => {
        fc.assert(
            fc.property(
                categoryListArb.chain(({ categories, deleteIndex }) => {
                    const slugs = categories.map((c) => c.slug);
                    return imagesArb(slugs).map((images) => ({
                        categories,
                        deleteIndex,
                        images,
                    }));
                }),
                ({ categories, deleteIndex, images }) => {
                    const deletedSlug = categories[deleteIndex].slug;
                    const result = deleteAndReassign(categories, images, deleteIndex);

                    // Images not in the deleted category should be unchanged
                    const unaffectedOriginals = images.filter(
                        (img) => img.category !== deletedSlug
                    );
                    for (const origImg of unaffectedOriginals) {
                        const updatedImg = result.images.find((img) => img.id === origImg.id);
                        expect(updatedImg).toBeDefined();
                        expect(updatedImg!.category).toBe(origImg.category);
                    }
                }
            ),
            { numRuns: 100 }
        );
    });
});
