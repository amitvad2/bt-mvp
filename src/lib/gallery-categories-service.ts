import type { GalleryCategoryDoc } from '@/types';

/**
 * Generates a URL-safe slug from a label string.
 * - Trims whitespace
 * - Converts to lowercase
 * - Replaces spaces with hyphens
 * - Removes characters that are not [a-z0-9-]
 * - Collapses consecutive hyphens into one
 * - Removes leading/trailing hyphens
 * - Truncates to 60 characters
 */
export function generateSlug(label: string): string {
    let slug = label
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
        .replace(/-{2,}/g, '-');

    // Remove leading/trailing hyphens
    slug = slug.replace(/^-+|-+$/g, '');

    // Truncate to 60 characters
    slug = slug.slice(0, 60);

    // After truncation, trim any trailing hyphen that may have been introduced
    slug = slug.replace(/-+$/, '');

    return slug;
}

/**
 * Validates a category label.
 * Returns { valid: true } if the trimmed label is non-empty and ≤50 characters.
 */
export function validateLabel(label: string): { valid: boolean; error?: string } {
    const trimmed = label.trim();
    if (trimmed.length === 0) {
        return { valid: false, error: 'Label must not be empty' };
    }
    if (trimmed.length > 50) {
        return { valid: false, error: 'Label must be 50 characters or fewer' };
    }
    return { valid: true };
}

/**
 * Validates a slug string.
 * Must match [a-z0-9-]+, be non-empty, and ≤60 characters.
 */
export function validateSlug(slug: string): boolean {
    if (!slug || slug.length > 60) return false;
    return /^[a-z0-9-]+$/.test(slug);
}

/**
 * Default categories used as fallback when Firestore collection is empty or read fails.
 */
export const DEFAULT_CATEGORIES: GalleryCategoryDoc[] = [
    {
        id: 'default-cooking-classes',
        slug: 'cooking-classes',
        label: 'Cooking Classes',
        order: 1,
        isVisible: true,
        createdAt: null,
    },
    {
        id: 'default-personal-gallery',
        slug: 'personal-gallery',
        label: 'Personal Gallery',
        order: 2,
        isVisible: true,
        createdAt: null,
    },
];
