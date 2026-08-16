// Feature: dynamic-gallery-categories, Property 6: Category filter correctness
import { describe, it, expect, vi } from 'vitest';
import * as fc from 'fast-check';

vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  getDocs: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
}));

import { normalizeCategory } from '@/lib/gallery-categories';

/**
 * Property 6: Category filter correctness
 *
 * For any set of gallery images with various category slugs and any selected
 * category slug, filtering SHALL return exactly the images whose `category`
 * field (after normalization) matches the selected slug, and no others.
 *
 * **Validates: Requirements 6.3**
 */

/**
 * Pure filtering logic that mirrors what the public gallery does:
 * filters images by matching their normalized category against the selected slug.
 */
function filterByCategory(
  images: { id: string; category: string }[],
  selectedSlug: string,
  validSlugs: Set<string>
): { id: string; category: string }[] {
  return images.filter(
    (img) => normalizeCategory(img.category, validSlugs) === selectedSlug
  );
}

describe('Property 6: Category filter correctness', () => {
  // Generator for valid category slugs (lowercase alphanumeric with hyphens)
  const slugArb = fc
    .stringMatching(/^[a-z][a-z0-9-]{2,14}[a-z0-9]$/)
    .filter((s) => s.length >= 3 && !s.includes('--'));

  // Generator for a set of valid category slugs (at least 2)
  const validSlugsArb = fc
    .array(slugArb, { minLength: 2, maxLength: 8 })
    .map((slugs) => [...new Set(slugs)])
    .filter((slugs) => slugs.length >= 2);

  // Generator for images with category values drawn from valid slugs
  const imagesWithSlugsArb = (slugs: string[]) =>
    fc.array(
      fc.record({
        id: fc.string({ minLength: 1, maxLength: 10 }).map((s) => `img-${s}`),
        category: fc.constantFrom(...slugs),
      }),
      { minLength: 1, maxLength: 30 }
    );

  it('every image in the result has normalizeCategory(img.category, validSlugs) === selectedSlug', () => {
    fc.assert(
      fc.property(
        validSlugsArb.chain((slugs) =>
          fc.tuple(
            imagesWithSlugsArb(slugs),
            fc.constantFrom(...slugs)
          ).map(([images, selected]) => ({
            images,
            selectedSlug: selected,
            validSlugs: new Set(slugs),
          }))
        ),
        ({ images, selectedSlug, validSlugs }) => {
          const result = filterByCategory(images, selectedSlug, validSlugs);

          for (const img of result) {
            expect(normalizeCategory(img.category, validSlugs)).toBe(selectedSlug);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('every image NOT in the result has normalizeCategory(img.category, validSlugs) !== selectedSlug', () => {
    fc.assert(
      fc.property(
        validSlugsArb.chain((slugs) =>
          fc.tuple(
            imagesWithSlugsArb(slugs),
            fc.constantFrom(...slugs)
          ).map(([images, selected]) => ({
            images,
            selectedSlug: selected,
            validSlugs: new Set(slugs),
          }))
        ),
        ({ images, selectedSlug, validSlugs }) => {
          const result = filterByCategory(images, selectedSlug, validSlugs);
          const resultIds = new Set(result.map((img) => img.id));

          const excluded = images.filter((img) => !resultIds.has(img.id));
          for (const img of excluded) {
            expect(normalizeCategory(img.category, validSlugs)).not.toBe(selectedSlug);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('result is a subset of the original images', () => {
    fc.assert(
      fc.property(
        validSlugsArb.chain((slugs) =>
          fc.tuple(
            imagesWithSlugsArb(slugs),
            fc.constantFrom(...slugs)
          ).map(([images, selected]) => ({
            images,
            selectedSlug: selected,
            validSlugs: new Set(slugs),
          }))
        ),
        ({ images, selectedSlug, validSlugs }) => {
          const result = filterByCategory(images, selectedSlug, validSlugs);
          const originalIds = new Set(images.map((img) => img.id));

          for (const img of result) {
            expect(originalIds.has(img.id)).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('result count equals the count of matching images in the original list', () => {
    fc.assert(
      fc.property(
        validSlugsArb.chain((slugs) =>
          fc.tuple(
            imagesWithSlugsArb(slugs),
            fc.constantFrom(...slugs)
          ).map(([images, selected]) => ({
            images,
            selectedSlug: selected,
            validSlugs: new Set(slugs),
          }))
        ),
        ({ images, selectedSlug, validSlugs }) => {
          const result = filterByCategory(images, selectedSlug, validSlugs);

          const expectedCount = images.filter(
            (img) => normalizeCategory(img.category, validSlugs) === selectedSlug
          ).length;

          expect(result.length).toBe(expectedCount);
        }
      ),
      { numRuns: 100 }
    );
  });
});
