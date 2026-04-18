import type { GalleryCategory } from '@/types';

// Legacy founder-creation categories stored in Firestore before the taxonomy update.
// These are never written by new code but must continue to display correctly.
const LEGACY_PERSONAL: ReadonlySet<string> = new Set(['cakes', 'cookies', 'breads']);

export function normalizeCategory(raw: string | undefined): GalleryCategory {
    if (!raw) return 'cooking-classes';
    if (LEGACY_PERSONAL.has(raw)) return 'personal-gallery';
    if (raw === 'personal-gallery') return 'personal-gallery';
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

export const CATEGORY_LABELS: Record<GalleryCategory, string> = {
    'cooking-classes': 'Cooking Classes',
    'personal-gallery': 'Personal Gallery',
};
