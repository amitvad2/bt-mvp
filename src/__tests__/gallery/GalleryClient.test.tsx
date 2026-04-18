import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const { mockGetDocs } = vi.hoisted(() => ({
    mockGetDocs: vi.fn(),
}));

vi.mock('@/lib/firebase', () => ({ db: {} }));

vi.mock('firebase/firestore', () => ({
    collection: vi.fn(),
    query: vi.fn(),
    getDocs: mockGetDocs,
    orderBy: vi.fn(),
}));

import GalleryClient from '@/app/(public)/gallery/GalleryClient';

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

describe('GalleryClient category tabs', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetDocs.mockResolvedValue({ docs: DOCS });
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

    it('shows all images by default (All Photos tab active)', async () => {
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
});
