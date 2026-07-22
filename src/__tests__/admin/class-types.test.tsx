import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { User } from 'firebase/auth';

// --- Hoisted mocks ---
const { mockGetDocs, mockAddDoc, mockUpdateDoc, mockDeleteDoc } = vi.hoisted(() => ({
    mockGetDocs: vi.fn(),
    mockAddDoc: vi.fn(),
    mockUpdateDoc: vi.fn(),
    mockDeleteDoc: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
    collection: vi.fn(),
    query: vi.fn(),
    getDocs: mockGetDocs,
    addDoc: mockAddDoc,
    updateDoc: mockUpdateDoc,
    deleteDoc: mockDeleteDoc,
    doc: vi.fn(() => 'mock-doc-ref'),
    orderBy: vi.fn(),
    where: vi.fn(),
    serverTimestamp: vi.fn(() => 'SERVER_TS'),
}));

vi.mock('@/lib/firebase', () => ({ db: {} }));

vi.mock('@/context/AuthContext', () => ({
    useAuth: () => ({
        user: { uid: 'admin-uid' } as User,
        btUser: { role: 'admin', firstName: 'Admin' },
        loading: false,
        logOut: vi.fn(),
    }),
}));

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: vi.fn() }),
    usePathname: () => '/admin/class-types',
}));

vi.mock('next/link', () => ({
    default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

import AdminClassTypes from '@/app/admin/class-types/page';
import { classTypeSchema } from '@/app/admin/class-types/schema';

// --- Helpers ---
const makeClassTypeDoc = (overrides: Record<string, any> = {}) => ({
    id: 'ct-1',
    data: () => ({
        slug: 'kids-after-school',
        displayName: 'Kids After School Club',
        shortLabel: 'Kids',
        badgeColor: 'amber',
        skipQuestionnaire: false,
        requireEmergencyContact: true,
        defaultAgeMin: 5,
        defaultAgeMax: 12,
        defaultMaxSize: 15,
        defaultPrice: 1500,
        order: 1,
        createdAt: { toDate: () => new Date('2025-01-01') },
        ...overrides,
    }),
});

const makeSecondClassTypeDoc = () => ({
    id: 'ct-2',
    data: () => ({
        slug: 'young-adult-weekend',
        displayName: 'Weekend Workshop',
        shortLabel: 'Young Adult',
        badgeColor: 'green',
        skipQuestionnaire: true,
        requireEmergencyContact: false,
        defaultAgeMin: 18,
        defaultAgeMax: 25,
        defaultMaxSize: 15,
        defaultPrice: 2500,
        order: 2,
        createdAt: { toDate: () => new Date('2025-01-01') },
    }),
});

describe('AdminClassTypes CRUD Page', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockAddDoc.mockResolvedValue({ id: 'new-ct-id' });
        mockUpdateDoc.mockResolvedValue(undefined);
        mockDeleteDoc.mockResolvedValue(undefined);
    });

    // --- Schema Validation Tests ---
    describe('Zod schema validation (slug format, required fields)', () => {
        it('accepts a valid slug with lowercase letters, numbers, and hyphens', () => {
            const result = classTypeSchema.shape.slug.safeParse('kids-after-school');
            expect(result.success).toBe(true);
        });

        it('rejects a slug with uppercase letters', () => {
            const result = classTypeSchema.shape.slug.safeParse('Kids-After');
            expect(result.success).toBe(false);
        });

        it('rejects a slug with spaces', () => {
            const result = classTypeSchema.shape.slug.safeParse('kids after school');
            expect(result.success).toBe(false);
        });

        it('rejects a slug with special characters', () => {
            const result = classTypeSchema.shape.slug.safeParse('kids_after@school');
            expect(result.success).toBe(false);
        });

        it('rejects an empty slug', () => {
            const result = classTypeSchema.shape.slug.safeParse('');
            expect(result.success).toBe(false);
        });

        it('requires displayName to be non-empty', () => {
            const result = classTypeSchema.shape.displayName.safeParse('');
            expect(result.success).toBe(false);
        });

        it('requires shortLabel to be non-empty', () => {
            const result = classTypeSchema.shape.shortLabel.safeParse('');
            expect(result.success).toBe(false);
        });

        it('rejects shortLabel longer than 20 characters', () => {
            const result = classTypeSchema.shape.shortLabel.safeParse('a'.repeat(21));
            expect(result.success).toBe(false);
        });

        it('accepts shortLabel of exactly 20 characters', () => {
            const result = classTypeSchema.shape.shortLabel.safeParse('a'.repeat(20));
            expect(result.success).toBe(true);
        });

        it('accepts valid badgeColor values', () => {
            for (const color of ['amber', 'green', 'indigo', 'red', 'gray']) {
                const result = classTypeSchema.shape.badgeColor.safeParse(color);
                expect(result.success).toBe(true);
            }
        });

        it('rejects invalid badgeColor values', () => {
            const result = classTypeSchema.shape.badgeColor.safeParse('blue');
            expect(result.success).toBe(false);
        });

        it('rejects negative defaultPrice', () => {
            const result = classTypeSchema.shape.defaultPrice.safeParse(-1);
            expect(result.success).toBe(false);
        });
    });

    // --- Rendering Tests ---
    describe('Rendering and loading state', () => {
        it('renders the page heading and Add button', async () => {
            mockGetDocs.mockResolvedValueOnce({ docs: [makeClassTypeDoc()] });
            render(<AdminClassTypes />);
            await waitFor(() => {
                expect(screen.getByRole('heading', { name: /class types/i })).toBeInTheDocument();
            });
            expect(screen.getByRole('button', { name: /add class type/i })).toBeInTheDocument();
        });

        it('renders class type cards after loading', async () => {
            mockGetDocs.mockResolvedValueOnce({ docs: [makeClassTypeDoc(), makeSecondClassTypeDoc()] });
            render(<AdminClassTypes />);
            await waitFor(() => {
                expect(screen.getByText('Kids After School Club')).toBeInTheDocument();
                expect(screen.getByText('Weekend Workshop')).toBeInTheDocument();
            });
        });

        it('renders empty state when no class types exist', async () => {
            mockGetDocs.mockResolvedValueOnce({ docs: [] });
            render(<AdminClassTypes />);
            await waitFor(() => {
                expect(screen.getByText(/no class types found/i)).toBeInTheDocument();
            });
        });
    });

    // --- Modal Open/Close ---
    describe('Modal open/close state', () => {
        it('opens modal when Add Class Type button is clicked', async () => {
            mockGetDocs.mockResolvedValueOnce({ docs: [makeClassTypeDoc()] });
            render(<AdminClassTypes />);
            await waitFor(() => screen.getByText('Kids After School Club'));

            await userEvent.click(screen.getByRole('button', { name: /add class type/i }));
            expect(screen.getByRole('heading', { name: /add new class type/i })).toBeInTheDocument();
        });

        it('closes modal when Cancel button is clicked', async () => {
            mockGetDocs.mockResolvedValueOnce({ docs: [makeClassTypeDoc()] });
            render(<AdminClassTypes />);
            await waitFor(() => screen.getByText('Kids After School Club'));

            await userEvent.click(screen.getByRole('button', { name: /add class type/i }));
            expect(screen.getByRole('heading', { name: /add new class type/i })).toBeInTheDocument();

            await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
            expect(screen.queryByRole('heading', { name: /add new class type/i })).not.toBeInTheDocument();
        });

        it('opens edit modal with pre-populated title when edit button is clicked', async () => {
            mockGetDocs.mockResolvedValueOnce({ docs: [makeClassTypeDoc()] });
            render(<AdminClassTypes />);
            await waitFor(() => screen.getByText('Kids After School Club'));

            // There should be edit buttons (one per card)
            const editButtons = screen.getAllByRole('button').filter(btn =>
                btn.querySelector('svg') && btn.className.includes('ghost')
            );
            // Click the first edit-like button (Edit2 icon)
            await userEvent.click(editButtons[0]);
            expect(screen.getByRole('heading', { name: /edit class type/i })).toBeInTheDocument();
        });
    });

    // --- Create Flow ---
    describe('Create flow', () => {
        it('calls addDoc when a valid form is submitted', async () => {
            mockGetDocs.mockResolvedValueOnce({ docs: [] });
            render(<AdminClassTypes />);
            await waitFor(() => screen.getByText(/no class types found/i));

            await userEvent.click(screen.getByRole('button', { name: /add class type/i }));

            // Fill the form
            const slugInput = screen.getByPlaceholderText('e.g. kids-after-school');
            const displayNameInput = screen.getByPlaceholderText('e.g. Kids After School Club');
            const shortLabelInput = screen.getByPlaceholderText('e.g. Kids');

            await userEvent.clear(slugInput);
            await userEvent.type(slugInput, 'new-class-type');
            await userEvent.clear(displayNameInput);
            await userEvent.type(displayNameInput, 'New Class Type');
            await userEvent.clear(shortLabelInput);
            await userEvent.type(shortLabelInput, 'New');

            await userEvent.click(screen.getByRole('button', { name: /create class type/i }));

            await waitFor(() => {
                expect(mockAddDoc).toHaveBeenCalled();
            });
        });

        it('displays the new class type in the list after creation (optimistic update)', async () => {
            mockGetDocs.mockResolvedValueOnce({ docs: [] });
            render(<AdminClassTypes />);
            await waitFor(() => screen.getByText(/no class types found/i));

            await userEvent.click(screen.getByRole('button', { name: /add class type/i }));

            const slugInput = screen.getByPlaceholderText('e.g. kids-after-school');
            const displayNameInput = screen.getByPlaceholderText('e.g. Kids After School Club');
            const shortLabelInput = screen.getByPlaceholderText('e.g. Kids');

            await userEvent.clear(slugInput);
            await userEvent.type(slugInput, 'new-type');
            await userEvent.clear(displayNameInput);
            await userEvent.type(displayNameInput, 'New Type Display');
            await userEvent.clear(shortLabelInput);
            await userEvent.type(shortLabelInput, 'New');

            await userEvent.click(screen.getByRole('button', { name: /create class type/i }));

            await waitFor(() => {
                expect(screen.getByText('New Type Display')).toBeInTheDocument();
            });
        });
    });

    // --- Edit Flow ---
    describe('Edit flow', () => {
        it('calls updateDoc when editing an existing class type', async () => {
            mockGetDocs.mockResolvedValueOnce({ docs: [makeClassTypeDoc()] });
            render(<AdminClassTypes />);
            await waitFor(() => screen.getByText('Kids After School Club'));

            // Click edit button
            const editButtons = screen.getAllByRole('button').filter(btn =>
                btn.querySelector('svg') && btn.className.includes('ghost')
            );
            await userEvent.click(editButtons[0]);

            // Modify displayName
            const displayNameInput = screen.getByPlaceholderText('e.g. Kids After School Club');
            await userEvent.clear(displayNameInput);
            await userEvent.type(displayNameInput, 'Updated Kids Club');

            await userEvent.click(screen.getByRole('button', { name: /update class type/i }));

            await waitFor(() => {
                expect(mockUpdateDoc).toHaveBeenCalled();
            });
        });
    });

    // --- Slug Uniqueness Check ---
    describe('Slug uniqueness check', () => {
        it('shows validation error when creating with a duplicate slug', async () => {
            mockGetDocs.mockResolvedValueOnce({ docs: [makeClassTypeDoc()] });
            render(<AdminClassTypes />);
            await waitFor(() => screen.getByText('Kids After School Club'));

            await userEvent.click(screen.getByRole('button', { name: /add class type/i }));

            const slugInput = screen.getByPlaceholderText('e.g. kids-after-school');
            const displayNameInput = screen.getByPlaceholderText('e.g. Kids After School Club');
            const shortLabelInput = screen.getByPlaceholderText('e.g. Kids');

            // Use the same slug as the existing class type
            await userEvent.clear(slugInput);
            await userEvent.type(slugInput, 'kids-after-school');
            await userEvent.clear(displayNameInput);
            await userEvent.type(displayNameInput, 'Duplicate Type');
            await userEvent.clear(shortLabelInput);
            await userEvent.type(shortLabelInput, 'Dup');

            await userEvent.click(screen.getByRole('button', { name: /create class type/i }));

            await waitFor(() => {
                expect(screen.getByText(/slug is already in use/i)).toBeInTheDocument();
            });
            // Should NOT call addDoc
            expect(mockAddDoc).not.toHaveBeenCalled();
        });
    });

    // --- Delete Flow ---
    describe('Delete flow', () => {
        it('blocks deletion when the class type is the last one', async () => {
            const alertMock = vi.spyOn(window, 'alert').mockImplementation(() => {});
            mockGetDocs.mockResolvedValueOnce({ docs: [makeClassTypeDoc()] });
            render(<AdminClassTypes />);
            await waitFor(() => screen.getByText('Kids After School Club'));

            // Click the delete button (second ghost button)
            const ghostButtons = screen.getAllByRole('button').filter(btn =>
                btn.querySelector('svg') && btn.className.includes('ghost')
            );
            // Delete button is typically the second ghost button
            await userEvent.click(ghostButtons[1]);

            expect(alertMock).toHaveBeenCalledWith(
                expect.stringMatching(/cannot delete the last class type/i)
            );
            expect(mockDeleteDoc).not.toHaveBeenCalled();
            alertMock.mockRestore();
        });

        it('blocks deletion when the class type is referenced by classes', async () => {
            const alertMock = vi.spyOn(window, 'alert').mockImplementation(() => {});
            // Two class types so it's not the "last one" guard
            mockGetDocs
                .mockResolvedValueOnce({ docs: [makeClassTypeDoc(), makeSecondClassTypeDoc()] })
                // Second getDocs call is for class references check
                .mockResolvedValueOnce({ empty: false, docs: [{ id: 'class-1', data: () => ({ name: 'Monday Kids' }) }] });

            render(<AdminClassTypes />);
            await waitFor(() => screen.getByText('Kids After School Club'));

            // Click the delete button for the first card
            const ghostButtons = screen.getAllByRole('button').filter(btn =>
                btn.querySelector('svg') && btn.className.includes('ghost')
            );
            await userEvent.click(ghostButtons[1]);

            await waitFor(() => {
                expect(alertMock).toHaveBeenCalledWith(
                    expect.stringMatching(/cannot delete/i)
                );
            });
            expect(mockDeleteDoc).not.toHaveBeenCalled();
            alertMock.mockRestore();
        });

        it('calls deleteDoc and removes the item when deletion is confirmed', async () => {
            const confirmMock = vi.spyOn(window, 'confirm').mockReturnValue(true);
            // Two class types
            mockGetDocs
                .mockResolvedValueOnce({ docs: [makeClassTypeDoc(), makeSecondClassTypeDoc()] })
                // No class references
                .mockResolvedValueOnce({ empty: true, docs: [] });

            render(<AdminClassTypes />);
            await waitFor(() => screen.getByText('Kids After School Club'));

            // Click the delete button for the first card
            const ghostButtons = screen.getAllByRole('button').filter(btn =>
                btn.querySelector('svg') && btn.className.includes('ghost')
            );
            await userEvent.click(ghostButtons[1]);

            await waitFor(() => {
                expect(mockDeleteDoc).toHaveBeenCalled();
            });

            // After deletion, the card should be removed (optimistic update)
            await waitFor(() => {
                expect(screen.queryByText('Kids After School Club')).not.toBeInTheDocument();
            });
            confirmMock.mockRestore();
        });
    });
});
