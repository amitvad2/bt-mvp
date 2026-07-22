import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ─── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('@/context/AuthContext', () => ({
    useAuth: () => ({
        user: { uid: 'admin-uid' },
        btUser: { role: 'admin', firstName: 'Admin' },
        loading: false,
        logOut: vi.fn(),
    }),
}));

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: vi.fn() }),
    usePathname: () => '/admin/classes',
}));

vi.mock('@/lib/firebase', () => ({ db: {} }));

const mockGetDocs = vi.fn();
const mockAddDoc = vi.fn();
const mockUpdateDoc = vi.fn();
const mockDeleteDoc = vi.fn();

vi.mock('firebase/firestore', () => ({
    collection: vi.fn((_db: unknown, name: string) => ({ _name: name })),
    query: vi.fn((...args: unknown[]) => args[0]),
    orderBy: vi.fn(),
    getDocs: (...args: unknown[]) => mockGetDocs(...args),
    addDoc: (...args: unknown[]) => mockAddDoc(...args),
    updateDoc: (...args: unknown[]) => mockUpdateDoc(...args),
    deleteDoc: (...args: unknown[]) => mockDeleteDoc(...args),
    doc: vi.fn(),
    serverTimestamp: vi.fn(() => 'mock-timestamp'),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────

const classTypesDocs = [
    {
        id: 'ct1',
        data: () => ({
            slug: 'kidsAfterSchool',
            displayName: 'Kids After School Club',
            shortLabel: 'Kids',
            badgeColor: 'amber',
            order: 1,
        }),
    },
];

const classesDocs = [
    {
        id: 'c1',
        data: () => ({
            type: 'kidsAfterSchool',
            dayOfWeek: 'Monday',
            startTime: '15:30',
            endTime: '16:30',
            ageMin: 5,
            ageMax: 12,
            maxSize: 15,
            instructor: 'Chef',
            venueId: 'v1',
            venueName: 'Community Hall',
            price: 1500,
        }),
    },
];

const venuesDocs = [
    {
        id: 'v1',
        data: () => ({ name: 'Community Hall' }),
    },
];

function createSuccessfulMockGetDocs() {
    return vi.fn((ref: { _name?: string }) => {
        const name = ref?._name;
        if (name === 'classes') {
            return Promise.resolve({ docs: classesDocs });
        }
        if (name === 'venues') {
            return Promise.resolve({ docs: venuesDocs });
        }
        if (name === 'class_types') {
            return Promise.resolve({ docs: classTypesDocs });
        }
        return Promise.resolve({ docs: [] });
    });
}

// ─── Import component under test ────────────────────────────────────────────

import AdminClasses from '@/app/admin/classes/page';

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Admin Classes Page — Dynamic Dropdown (Requirements 5.1, 5.2, 5.3, 5.4, 10.1)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders class type dropdown options from fetched class types (Req 5.1, 5.2)', async () => {
        mockGetDocs.mockImplementation(createSuccessfulMockGetDocs());

        render(<AdminClasses />);

        // Wait for loading to complete and the "Add Class Type" button to appear
        await waitFor(() => {
            expect(screen.getByText('Add Class Type')).toBeInTheDocument();
        });

        // Open the modal to see the dropdown
        await userEvent.click(screen.getByText('Add Class Type'));

        // The dropdown should contain "Kids After School Club" as an option
        await waitFor(() => {
            expect(screen.getByRole('option', { name: 'Kids After School Club' })).toBeInTheDocument();
        });
    });

    it('stores slug value on class type selection (Req 5.3)', async () => {
        mockGetDocs.mockImplementation(createSuccessfulMockGetDocs());
        mockAddDoc.mockResolvedValue({ id: 'new-class-1' });

        render(<AdminClasses />);

        await waitFor(() => {
            expect(screen.getByText('Add Class Type')).toBeInTheDocument();
        });

        // Open modal
        await userEvent.click(screen.getByText('Add Class Type'));

        // Find the Type select and choose the class type
        const typeSelect = screen.getAllByRole('combobox').find(
            (el) => el.closest('.form-group')?.querySelector('.form-label')?.textContent === 'Type'
        );
        expect(typeSelect).toBeDefined();

        await userEvent.selectOptions(typeSelect!, 'kidsAfterSchool');

        // Verify the select value is the slug
        expect((typeSelect as HTMLSelectElement).value).toBe('kidsAfterSchool');
    });

    it('shows error and disables dropdown on class_types fetch failure (Req 5.4)', async () => {
        mockGetDocs.mockImplementation((ref: { _name?: string }) => {
            const name = ref?._name;
            if (name === 'classes') {
                return Promise.resolve({ docs: classesDocs });
            }
            if (name === 'venues') {
                return Promise.resolve({ docs: venuesDocs });
            }
            if (name === 'class_types') {
                return Promise.reject(new Error('Network error'));
            }
            return Promise.resolve({ docs: [] });
        });

        render(<AdminClasses />);

        // Wait for loading to complete
        await waitFor(() => {
            expect(screen.getByText('Add Class Type')).toBeInTheDocument();
        });

        // Open modal to see the type field
        await userEvent.click(screen.getByText('Add Class Type'));

        // The error state should show a disabled select with "Unable to load class types"
        await waitFor(() => {
            expect(screen.getByText('Unable to load class types')).toBeInTheDocument();
        });

        // The select containing that text should be disabled
        const disabledSelect = screen.getByText('Unable to load class types').closest('select');
        expect(disabledSelect).toBeDisabled();

        // The error message text should be visible
        expect(screen.getByText(/Failed to load class types/i)).toBeInTheDocument();
    });

    it('renders badge with dynamic shortLabel and badgeColor (Req 10.1)', async () => {
        mockGetDocs.mockImplementation(createSuccessfulMockGetDocs());

        render(<AdminClasses />);

        // Wait for loading to complete and class cards to render
        await waitFor(() => {
            expect(screen.getByText('Add Class Type')).toBeInTheDocument();
        });

        // The badge should show "Kids" (shortLabel from class type)
        await waitFor(() => {
            const badge = screen.getByText('Kids');
            expect(badge).toBeInTheDocument();
            // Check that badge uses the dynamic badge color class
            expect(badge.className).toContain('badge-amber');
        });
    });
});
