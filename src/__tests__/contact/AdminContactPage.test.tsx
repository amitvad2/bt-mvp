import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { User } from 'firebase/auth';

const { mockGetDocs, mockUpdateDoc } = vi.hoisted(() => ({
    mockGetDocs: vi.fn(),
    mockUpdateDoc: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
    collection: vi.fn(),
    query: vi.fn(),
    getDocs: mockGetDocs,
    orderBy: vi.fn(),
    updateDoc: mockUpdateDoc,
    doc: vi.fn(() => 'mock-doc-ref'),
    serverTimestamp: vi.fn(() => 'SERVER_TS'),
}));

vi.mock('@/lib/firebase', () => ({ db: {} }));

vi.mock('@/context/AuthContext', () => ({
    useAuth: vi.fn(() => ({
        user: { uid: 'admin-1' } as User,
        btUser: { role: 'admin', firstName: 'Admin' },
        loading: false,
        logOut: vi.fn(),
    })),
}));

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: vi.fn() }),
    usePathname: () => '/admin/contact',
}));

vi.mock('next/link', () => ({
    default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

import AdminContactPage from '@/app/admin/contact/page';

const makeDoc = (overrides: Record<string, any> = {}) => ({
    id: 'msg-1',
    data: () => ({
        name: 'Jane Smith',
        email: 'jane@example.com',
        category: 'general',
        message: 'Hello, I need help with booking.',
        consentToReply: true,
        source: 'contact-page',
        status: 'new',
        createdAt: { toDate: () => new Date('2026-04-18') },
        ...overrides,
    }),
});

describe('AdminContactPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockUpdateDoc.mockResolvedValue(undefined);
    });

    it('renders empty state when there are no messages', async () => {
        mockGetDocs.mockResolvedValueOnce({ docs: [] });
        render(<AdminContactPage />);
        await waitFor(() => {
            expect(screen.getByText(/no messages/i)).toBeInTheDocument();
        });
    });

    it('renders message rows when data exists', async () => {
        mockGetDocs.mockResolvedValueOnce({ docs: [makeDoc()] });
        render(<AdminContactPage />);
        await waitFor(() => {
            expect(screen.getByText('Jane Smith')).toBeInTheDocument();
            expect(screen.getByText('jane@example.com')).toBeInTheDocument();
        });
    });

    it('shows "new" badge count for unread messages', async () => {
        mockGetDocs.mockResolvedValueOnce({
            docs: [makeDoc(), makeDoc({ id: 'msg-2', status: 'read' })],
        });
        render(<AdminContactPage />);
        await waitFor(() => {
            expect(screen.getByText('1 new')).toBeInTheDocument();
        });
    });

    it('expands full message on chevron click', async () => {
        mockGetDocs.mockResolvedValueOnce({ docs: [makeDoc()] });
        render(<AdminContactPage />);
        await waitFor(() => screen.getByText('Jane Smith'));

        await userEvent.click(screen.getByRole('button', { name: /view message/i }));
        expect(screen.getByText('Hello, I need help with booking.')).toBeInTheDocument();
    });

    it('calls updateDoc when status is changed', async () => {
        mockGetDocs.mockResolvedValueOnce({ docs: [makeDoc()] });
        render(<AdminContactPage />);
        await waitFor(() => screen.getByText('Jane Smith'));

        const select = screen.getByRole('combobox', { name: /status for message from jane smith/i });
        await userEvent.selectOptions(select, 'read');

        expect(mockUpdateDoc).toHaveBeenCalledWith(
            'mock-doc-ref',
            expect.objectContaining({ status: 'read' })
        );
    });
});
