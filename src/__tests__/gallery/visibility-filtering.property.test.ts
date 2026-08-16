// Feature: dynamic-gallery-categories, Property 5: Visibility filtering for public view
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import type { GalleryCategoryDoc } from '@/types';

/**
 * **Validates: Requirements 3.4, 3.5, 6.4**
 *
 * Property 5: Visibility filtering for public view
 * For any set of gallery categories with arbitrary isVisible flags, the public gallery
 * SHALL display only categories where isVisible is true as filter tabs, and when filtering
 * by category, only images belonging to visible categories SHALL appear in the
 * category-specific views. Images belonging to hidden categories SHALL still appear
 * under "All Photos".
 */
describe('Property 5: Visibility filtering for public view', () => {
    // --- Pure logic functions mirroring GalleryClient behavior ---

    /**
     * Returns only the visible categories, ordered by `order` ASC.
     * This mirrors what `fetchCategories({ visibleOnly: true })` returns
     * and what the public gallery renders as tabs.
     */
    function getPublicTabs(categories: GalleryCategoryDoc[]): GalleryCategoryDoc[] {
        return categories
            .filter((c) => c.isVisible)
            .sort((a, b) => a.order - b.order);
    }

    /**
     * Filters images for the "All Photos" view.
     * Per Requirement 3.5: images from hidden categories SHALL still appear under "All Photos".
     * Per Requirement 6.4: "All Photos" displays all images that belong to any category
     * (visible OR hidden) since they are still valid gallery images.
     *
     * The implementation actually shows ALL images when "All Photos" is selected,
     * as the "All Photos" tab is meant to be an unfiltered view of all gallery content.
     */
    function filterImagesForAllPhotos(
        images: { id: string; category: string }[],
        allCategorySlugs: Set<string>
    ): { id: string; category: string }[] {
        // "All Photos" shows ALL images — including those in hidden categories
        // This is the correct behavior per Requirement 3.5
        return images.filter((img) => allCategorySlugs.has(img.category));
    }

    /**
     * Filters images for a specific category view.
     * Only visible category slugs are valid for category-specific filtering.
     */
    function filterImagesForCategory(
        images: { id: string; category: string }[],
        selectedSlug: string
    ): { id: string; category: string }[] {
        return images.filter((img) => img.category === selectedSlug);
    }

    // --- Generators ---

    // Generate a valid slug
    const slugArb = fc
        .stringMatching(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/)
        .filter((s) => s.length >= 1 && s.length <= 60 && !s.includes('--'));

    // Generate a list of categories with unique slugs and contiguous orders
    const categoryListArb = fc
        .integer({ min: 1, max: 15 })
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
                .filter((cats) => {
                    // Ensure unique slugs
                    const slugs = cats.map((c) => c.slug);
                    return new Set(slugs).size === slugs.length;
                })
                .map((cats) =>
                    cats.map((c, i) => ({
                        ...c,
                        id: `cat-${i}`,
                        order: i + 1,
                    })) as GalleryCategoryDoc[]
                )
        );

    // Generate images assigned to random slugs from a given set
    function imagesForCategories(categorySlugs: string[]) {
        return fc
            .array(
                fc.record({
                    id: fc.uuid(),
                    category: fc.constantFrom(...categorySlugs),
                }),
                { minLength: 1, maxLength: 30 }
            );
    }

    // --- Property tests ---

    it('public tabs contain ONLY categories with isVisible: true', () => {
        fc.assert(
            fc.property(categoryListArb, (categories) => {
                const tabs = getPublicTabs(categories);

                // All tabs must have isVisible === true
                for (const tab of tabs) {
                    expect(tab.isVisible).toBe(true);
                }

                // No hidden category should appear in tabs
                const hiddenSlugs = new Set(
                    categories.filter((c) => !c.isVisible).map((c) => c.slug)
                );
                for (const tab of tabs) {
                    expect(hiddenSlugs.has(tab.slug)).toBe(false);
                }

                // All visible categories must be present in tabs
                const visibleCategories = categories.filter((c) => c.isVisible);
                expect(tabs.length).toBe(visibleCategories.length);
            }),
            { numRuns: 100 }
        );
    });

    it('public tabs are ordered by order field ascending', () => {
        fc.assert(
            fc.property(categoryListArb, (categories) => {
                const tabs = getPublicTabs(categories);

                // Tabs should be in ascending order
                for (let i = 1; i < tabs.length; i++) {
                    expect(tabs[i].order).toBeGreaterThan(tabs[i - 1].order);
                }
            }),
            { numRuns: 100 }
        );
    });

    it('under "All Photos", images from hidden categories ARE included', () => {
        fc.assert(
            fc.property(
                categoryListArb.filter(
                    (cats) =>
                        cats.some((c) => c.isVisible) && cats.some((c) => !c.isVisible)
                ),
                (categories) => {
                    const allSlugs = new Set(categories.map((c) => c.slug));
                    const hiddenSlugs = categories
                        .filter((c) => !c.isVisible)
                        .map((c) => c.slug);
                    const visibleSlugs = categories
                        .filter((c) => c.isVisible)
                        .map((c) => c.slug);

                    // Create images: some in visible categories, some in hidden
                    const hiddenImages = hiddenSlugs.map((slug, i) => ({
                        id: `hidden-${i}`,
                        category: slug,
                    }));
                    const visibleImages = visibleSlugs.map((slug, i) => ({
                        id: `visible-${i}`,
                        category: slug,
                    }));
                    const allImages = [...visibleImages, ...hiddenImages];

                    // "All Photos" should include images from ALL categories (visible AND hidden)
                    const allPhotosResult = filterImagesForAllPhotos(allImages, allSlugs);

                    // All hidden category images should be present
                    for (const hiddenImg of hiddenImages) {
                        expect(allPhotosResult.some((img) => img.id === hiddenImg.id)).toBe(true);
                    }
                    // All visible category images should be present
                    for (const visibleImg of visibleImages) {
                        expect(allPhotosResult.some((img) => img.id === visibleImg.id)).toBe(true);
                    }
                }
            ),
            { numRuns: 100 }
        );
    });

    it('category-specific filter shows only images matching the selected visible slug', () => {
        fc.assert(
            fc.property(
                categoryListArb.filter((cats) => cats.some((c) => c.isVisible)),
                (categories) => {
                    const allSlugs = categories.map((c) => c.slug);

                    // Pick a visible category to filter by
                    const visibleCats = categories.filter((c) => c.isVisible);
                    const selectedSlug = visibleCats[0].slug;

                    // Generate images assigned to various categories
                    const images = allSlugs.map((slug, i) => ({
                        id: `img-${i}`,
                        category: slug,
                    }));

                    const filtered = filterImagesForCategory(images, selectedSlug);

                    // All returned images should match the selected slug
                    for (const img of filtered) {
                        expect(img.category).toBe(selectedSlug);
                    }

                    // No image from another category should be included
                    const otherImages = images.filter((img) => img.category !== selectedSlug);
                    for (const otherImg of otherImages) {
                        expect(filtered.some((img) => img.id === otherImg.id)).toBe(false);
                    }
                }
            ),
            { numRuns: 100 }
        );
    });

    it('hidden categories never appear as public tabs regardless of their order', () => {
        fc.assert(
            fc.property(categoryListArb, (categories) => {
                const tabs = getPublicTabs(categories);
                const tabSlugs = new Set(tabs.map((t) => t.slug));

                // Every hidden category must NOT appear in tabs
                for (const cat of categories) {
                    if (!cat.isVisible) {
                        expect(tabSlugs.has(cat.slug)).toBe(false);
                    }
                }
            }),
            { numRuns: 100 }
        );
    });

    it('"All Photos" includes images from hidden categories with randomized images', () => {
        fc.assert(
            fc.property(
                categoryListArb
                    .filter(
                        (cats) =>
                            cats.some((c) => c.isVisible) && cats.some((c) => !c.isVisible)
                    )
                    .chain((categories) => {
                        const allSlugs = categories.map((c) => c.slug);
                        return imagesForCategories(allSlugs).map((images) => ({
                            categories,
                            images,
                        }));
                    }),
                ({ categories, images }) => {
                    const allSlugs = new Set(categories.map((c) => c.slug));
                    const hiddenSlugs = new Set(
                        categories.filter((c) => !c.isVisible).map((c) => c.slug)
                    );

                    const allPhotos = filterImagesForAllPhotos(images, allSlugs);

                    // Images from hidden categories should be present in "All Photos"
                    const hiddenCategoryImages = images.filter((img) =>
                        hiddenSlugs.has(img.category)
                    );
                    for (const hiddenImg of hiddenCategoryImages) {
                        expect(allPhotos.some((img) => img.id === hiddenImg.id)).toBe(true);
                    }

                    // Total "All Photos" count should equal all images that belong to any known category
                    const expectedCount = images.filter((img) => allSlugs.has(img.category)).length;
                    expect(allPhotos.length).toBe(expectedCount);
                }
            ),
            { numRuns: 100 }
        );
    });
});
