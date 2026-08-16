import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const { mockGetDocs } = vi.hoisted(() => ({
    mockGetDocs: vi.fn(),
}));

const { mockFetchCategories } = vi.hoisted(() => ({
    mockFetchCategories: vi.fn(),
}));

vi.mock('@/lib/firebase', () => ({ db: {} }));

vi.mock('firebase/firestore', () => ({
    collection: vi.fn(),
    query: vi.fn(),
    getDocs: mockGetDocs,
    orderBy: vi.fn(),
}));

vi.mock('@/lib/gallery-categories', () => ({
    fetchCategories: mockFetchCategories,
    normalizeCategory: (raw: string | undefined, validSlugs?: Set<string>) => {
        if (!raw) return 'cooking-classes';
        const LEGACY_PERSONAL = new Set(['cakes', 'cookies', 'breads']);
        if (LEGACY_PERSONAL.has(raw)) return 'personal-gallery';
        if (validSlugs && validSlugs.has(raw)) return raw;
        if (raw === 'personal-gallery' || raw === 'cooking-classes') return raw;
        return 'cooking-classes';
    },
}));

import GalleryClient from '@/app/(public)/gallery/GalleryClient';
import type { GalleryCategoryDoc } from '@/types';

const makeDoc = (id: string, category: string, altText: string) => ({
    id,
    data: () => ({
        id,
        imageUrl: `https://example.com/${id}.jpg`,
        altText,
        description: '',
        order: 0,
        category,
        createdAt: null,
    }),
});

const DOCS = [
    makeDoc('a', 'cooking-classes', 'class photo'),
    makeDoc('b', 'cakes', 'cake photo'),
    makeDoc('c', 'cookies', 'cookies photo'),
    makeDoc('d', 'personal-gallery', 'personal photo'),
];

const DEFAULT_CATEGORIES: GalleryCategoryDoc[] = [
    { id: '1', slug: 'cooking-classes', label: 'Cooking Classes', order: 1, isVisible: true, createdAt: null },
    { id: '2', slug: 'personal-gallery', label: 'Personal Gallery', order: 2, isVisible: true, createdAt: null },
];

describe('GalleryClient category tabs', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetDocs.mockResolvedValue({ docs: DOCS });
        mockFetchCategories.mockResolvedValue(DEFAULT_CATEGORIES);
    });

    it('renders All Photos, Cooking Classes, and Personal Gallery tabs', async () => {
        render(<GalleryClient />);
        expect(await screen.findByRole('button', { name: /all photos/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /cooking classes/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /personal gallery/i })).toBeInTheDocument();
    });

    it('does not render legacy category tabs', async () => {
        render(<GalleryClient />);
        await screen.findByRole('button', { name: /all photos/i });
        expect(screen.queryByRole('button', { name: /^cakes$/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /^cookies$/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /^breads$/i })).not.toBeInTheDocument();
    });

    it('shows all images belonging to visible categories by default (All Photos tab active)', async () => {
        render(<GalleryClient />);
        await screen.findByRole('button', { name: /all photos/i });
        expect(screen.getByAltText('class photo')).toBeInTheDocument();
        expect(screen.getByAltText('cake photo')).toBeInTheDocument();
        expect(screen.getByAltText('cookies photo')).toBeInTheDocument();
        expect(screen.getByAltText('personal photo')).toBeInTheDocument();
    });

    it('Cooking Classes tab shows only class images', async () => {
        render(<GalleryClient />);
        fireEvent.click(await screen.findByRole('button', { name: /cooking classes/i }));
        expect(screen.getByAltText('class photo')).toBeInTheDocument();
        expect(screen.queryByAltText('cake photo')).not.toBeInTheDocument();
        expect(screen.queryByAltText('cookies photo')).not.toBeInTheDocument();
        expect(screen.queryByAltText('personal photo')).not.toBeInTheDocument();
    });

    it('Personal Gallery tab shows legacy cakes/cookies and personal-gallery items', async () => {
        render(<GalleryClient />);
        fireEvent.click(await screen.findByRole('button', { name: /personal gallery/i }));
        expect(screen.queryByAltText('class photo')).not.toBeInTheDocument();
        expect(screen.getByAltText('cake photo')).toBeInTheDocument();
        expect(screen.getByAltText('cookies photo')).toBeInTheDocument();
        expect(screen.getByAltText('personal photo')).toBeInTheDocument();
    });

    it('shows all images without tabs when categories fetch fails', async () => {
        mockFetchCategories.mockRejectedValue(new Error('Network error'));
        render(<GalleryClient />);
        // Wait for loading to finish
        await screen.findByAltText('class photo');
        // No tabs should be rendered
        expect(screen.queryByRole('button', { name: /all photos/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /cooking classes/i })).not.toBeInTheDocument();
        // All images should still be displayed
        expect(screen.getByAltText('class photo')).toBeInTheDocument();
        expect(screen.getByAltText('cake photo')).toBeInTheDocument();
        expect(screen.getByAltText('cookies photo')).toBeInTheDocument();
        expect(screen.getByAltText('personal photo')).toBeInTheDocument();
        // Error banner should be visible
        expect(screen.getByText(/could not load categories/i)).toBeInTheDocument();
    });

    it('shows all images without tabs when no visible categories exist', async () => {
        mockFetchCategories.mockResolvedValue([]);
        render(<GalleryClient />);
        await screen.findByAltText('class photo');
        expect(screen.queryByRole('button', { name: /all photos/i })).not.toBeInTheDocument();
        expect(screen.getByAltText('class photo')).toBeInTheDocument();
        expect(screen.getByAltText('cake photo')).toBeInTheDocument();
    });

    it('renders dynamic categories in order', async () => {
        const customCategories: GalleryCategoryDoc[] = [
            { id: '1', slug: 'appetizers', label: 'Appetizers', order: 1, isVisible: true, createdAt: null },
            { id: '2', slug: 'desserts', label: 'Desserts', order: 2, isVisible: true, createdAt: null },
            { id: '3', slug: 'mains', label: 'Main Courses', order: 3, isVisible: true, createdAt: null },
        ];
        mockFetchCategories.mockResolvedValue(customCategories);
        render(<GalleryClient />);
        const allPhotosBtn = await screen.findByRole('button', { name: /all photos/i });
        const appetizersBtn = screen.getByRole('button', { name: /appetizers/i });
        const dessertsBtn = screen.getByRole('button', { name: /desserts/i });
        const mainsBtn = screen.getByRole('button', { name: /main courses/i });
        // Verify ordering: All Photos first, then by order field
        const buttons = screen.getAllByRole('button');
        expect(buttons.indexOf(allPhotosBtn)).toBeLessThan(buttons.indexOf(appetizersBtn));
        expect(buttons.indexOf(appetizersBtn)).toBeLessThan(buttons.indexOf(dessertsBtn));
        expect(buttons.indexOf(dessertsBtn)).toBeLessThan(buttons.indexOf(mainsBtn));
    });
});
