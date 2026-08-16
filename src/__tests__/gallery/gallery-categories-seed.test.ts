import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock firebase-admin before importing the route
const mockGet = vi.fn();
const mockDoc = vi.fn();
const mockSet = vi.fn();
const mockCommit = vi.fn();
const mockBatch = vi.fn(() => ({
    set: mockSet,
    commit: mockCommit,
}));
const mockOrderBy = vi.fn(() => ({ get: mockGet }));
const mockCollection = vi.fn((_name?: string) => ({
    get: mockGet,
    doc: mockDoc,
    orderBy: mockOrderBy,
}));

vi.mock('@/lib/firebase-admin', () => ({
    adminDb: {
        collection: (name: string) => mockCollection(name),
        batch: () => mockBatch(),
    },
    adminAuth: {
        verifyIdToken: vi.fn(),
    },
    adminInitError: null,
}));

vi.mock('firebase-admin/firestore', () => ({
    FieldValue: {
        serverTimestamp: () => 'SERVER_TIMESTAMP',
    },
}));

import { GET } from '@/app/api/gallery-categories/route';

describe('GET /api/gallery-categories — seed logic', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockDoc.mockReturnValue({ id: 'new-doc-id' });
    });

    it('seeds default categories when collection is empty', async () => {
        // First call (seedDefaultCategories check) — empty
        mockGet.mockResolvedValueOnce({ empty: true, docs: [] });
        // Second call (after seeding, read ordered) — returns seeded docs
        mockGet.mockResolvedValueOnce({
            docs: [
                {
                    id: 'doc-1',
                    data: () => ({
                        slug: 'cooking-classes',
                        label: 'Cooking Classes',
                        order: 1,
                        isVisible: true,
                        createdAt: null,
                    }),
                },
                {
                    id: 'doc-2',
                    data: () => ({
                        slug: 'personal-gallery',
                        label: 'Personal Gallery',
                        order: 2,
                        isVisible: true,
                        createdAt: null,
                    }),
                },
            ],
            size: 2,
        });

        const response = await GET();
        const data = await response.json();

        // Verify batch was created and categories were written
        expect(mockBatch).toHaveBeenCalled();
        expect(mockSet).toHaveBeenCalledTimes(2);
        expect(mockCommit).toHaveBeenCalled();

        // Verify the first set call has the right data
        expect(mockSet).toHaveBeenCalledWith(
            { id: 'new-doc-id' },
            expect.objectContaining({
                slug: 'cooking-classes',
                label: 'Cooking Classes',
                order: 1,
                isVisible: true,
                createdAt: 'SERVER_TIMESTAMP',
            })
        );

        // Verify the second set call
        expect(mockSet).toHaveBeenCalledWith(
            { id: 'new-doc-id' },
            expect.objectContaining({
                slug: 'personal-gallery',
                label: 'Personal Gallery',
                order: 2,
                isVisible: true,
                createdAt: 'SERVER_TIMESTAMP',
            })
        );

        // Verify response contains categories
        expect(response.status).toBe(200);
        expect(data.categories).toHaveLength(2);
        expect(data.categories[0].slug).toBe('cooking-classes');
        expect(data.categories[1].slug).toBe('personal-gallery');
    });

    it('does not seed when collection already has categories', async () => {
        // First call (seedDefaultCategories check) — not empty
        mockGet.mockResolvedValueOnce({
            empty: false,
            docs: [
                {
                    id: 'existing-1',
                    data: () => ({
                        slug: 'cooking-classes',
                        label: 'Cooking Classes',
                        order: 1,
                        isVisible: true,
                        createdAt: null,
                    }),
                },
            ],
        });
        // Second call (ordered read)
        mockGet.mockResolvedValueOnce({
            docs: [
                {
                    id: 'existing-1',
                    data: () => ({
                        slug: 'cooking-classes',
                        label: 'Cooking Classes',
                        order: 1,
                        isVisible: true,
                        createdAt: null,
                    }),
                },
                {
                    id: 'existing-2',
                    data: () => ({
                        slug: 'personal-gallery',
                        label: 'Personal Gallery',
                        order: 2,
                        isVisible: true,
                        createdAt: null,
                    }),
                },
                {
                    id: 'existing-3',
                    data: () => ({
                        slug: 'desserts',
                        label: 'Desserts',
                        order: 3,
                        isVisible: true,
                        createdAt: null,
                    }),
                },
            ],
            size: 3,
        });

        const response = await GET();
        const data = await response.json();

        // Batch should NOT have been called
        expect(mockBatch).not.toHaveBeenCalled();
        expect(mockSet).not.toHaveBeenCalled();
        expect(mockCommit).not.toHaveBeenCalled();

        // Verify response contains all 3 categories
        expect(response.status).toBe(200);
        expect(data.categories).toHaveLength(3);
    });

    it('returns 500 when an error occurs', async () => {
        mockGet.mockRejectedValueOnce(new Error('Firestore unavailable'));

        const response = await GET();
        const data = await response.json();

        expect(response.status).toBe(500);
        expect(data.error).toBe('Failed to fetch categories');
        expect(data.detail).toBe('Firestore unavailable');
    });
});
