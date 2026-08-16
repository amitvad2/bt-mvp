import type { GalleryCategory, GalleryCategoryDoc } from '@/types';
import { DEFAULT_CATEGORIES } from '@/lib/gallery-categories-service';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';

// Legacy founder-creation categories stored in Firestore before the taxonomy update.
// These are never written by new code but must continue to display correctly.
const LEGACY_PERSONAL: ReadonlySet<string> = new Set(['cakes', 'cookies', 'breads']);

/**
 * Fetches gallery categories from the `gallery_categories` Firestore collection.
 * Ordered by `order` ASC. Optionally filters to only visible categories.
 *
 * Falls back to DEFAULT_CATEGORIES if the collection is empty or the read fails.
 */
export async function fetchCategories(
    options?: { visibleOnly?: boolean }
): Promise<GalleryCategoryDoc[]> {
    try {
        const categoriesRef = collection(db, 'gallery_categories');

        const constraints = [];
        if (options?.visibleOnly) {
            constraints.push(where('isVisible', '==', true));
        }
        constraints.push(orderBy('order', 'asc'));

        const q = query(categoriesRef, ...constraints);
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            return DEFAULT_CATEGORIES;
        }

        return snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
        })) as GalleryCategoryDoc[];
    } catch {
        return DEFAULT_CATEGORIES;
    }
}

/**
 * Normalizes a raw category string to a valid category slug.
 *
 * Legacy mapping: 'cakes', 'cookies', 'breads' → 'personal-gallery'
 * Dynamic mapping: if validSlugs is provided, checks membership
 * Fallback: unknown values → 'cooking-classes'
 */
export function normalizeCategory(raw: string | undefined, validSlugs?: Set<string>): GalleryCategory {
    if (!raw) return 'cooking-classes';
    if (LEGACY_PERSONAL.has(raw)) return 'personal-gallery';
    // If we have dynamic slugs, check membership
    if (validSlugs && validSlugs.has(raw)) return raw;
    // For known slugs without a validSlugs set, pass through
    if (raw === 'personal-gallery' || raw === 'cooking-classes') return raw;
    // Unknown legacy value
    return 'cooking-classes';
}

export const PUBLIC_CATEGORIES: Array<{ value: GalleryCategory | 'all'; label: string }> = [
    { value: 'all', label: 'All Photos' },
    { value: 'cooking-classes', label: 'Cooking Classes' },
    { value: 'personal-gallery', label: 'Personal Gallery' },
];

export const ADMIN_CATEGORIES: Array<{ value: GalleryCategory; label: string }> = [
    { value: 'cooking-classes', label: 'Cooking Classes' },
    { value: 'personal-gallery', label: 'Personal Gallery' },
];

export const CATEGORY_LABELS: Record<string, string> = {
    'cooking-classes': 'Cooking Classes',
    'personal-gallery': 'Personal Gallery',
};
