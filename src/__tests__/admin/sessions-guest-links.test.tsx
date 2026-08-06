import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Mock Firebase
vi.mock('@/lib/firebase', () => ({
    db: {},
}));

const mockGetDocs = vi.fn().mockResolvedValue({ docs: [] });

vi.mock('firebase/firestore', () => ({
    collection: vi.fn(),
    query: vi.fn(),
    getDocs: (...args: unknown[]) => mockGetDocs(...args),
    addDoc: vi.fn(),
    updateDoc: vi.fn(),
    deleteDoc: vi.fn(),
    doc: vi.fn(),
    serverTimestamp: vi.fn(),
    orderBy: vi.fn(),
    where: vi.fn(),
}));

// Feature flag mock — we control this per test
const mockFeatureFlag = vi.fn();
vi.mock('@/lib/feature-flags', () => ({
    isGuestCheckoutEnabled: () => mockFeatureFlag(),
}));

import AdminSessions from '@/app/admin/sessions/page';

// Helpers
const mockClipboard = { writeText: vi.fn().mockResolvedValue(undefined) };

const openSession = {
    id: 'session-open-1',
    data: () => ({
        classId: 'class1',
        className: 'Kids After School',
        classType: 'kidsAfterSchool',
        date: '2025-07-15',
        startTime: '15:30',
        endTime: '16:30',
        venueId: 'v1',
        venueName: 'Main Kitchen',
        spotsAvailable: 10,
        spotsTotal: 15,
        status: 'open',
        price: 1500,
        ageMin: 5,
        ageMax: 12,
    }),
};

const cancelledSession = {
    id: 'session-cancelled-2',
    data: () => ({
        classId: 'class1',
        className: 'Kids After School',
        classType: 'kidsAfterSchool',
        date: '2025-07-20',
        startTime: '15:30',
        endTime: '16:30',
        venueId: 'v1',
        venueName: 'Main Kitchen',
        spotsAvailable: 5,
        spotsTotal: 15,
        status: 'cancelled',
        price: 1500,
        ageMin: 5,
        ageMax: 12,
    }),
};

describe('AdminSessions — Guest Link Management', () => {
    const originalEnv = process.env.NEXT_PUBLIC_GUEST_CHECKOUT_ENABLED;

    beforeEach(() => {
        vi.clearAllMocks();
        Object.assign(navigator, { clipboard: mockClipboard });

        // The component calls getDocs 5 times: sessions, classes, recipes, instructors, classTypes
        // First call returns sessions, rest return empty
        let callCount = 0;
        mockGetDocs.mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
                // sessions (first query with orderBy)
                return Promise.resolve({ docs: [openSession, cancelledSession] });
            }
            // classes, recipes, instructors, classTypes — return empty
            return Promise.resolve({ docs: [] });
        });
    });

    afterEach(() => {
        if (originalEnv === undefined) {
            delete process.env.NEXT_PUBLIC_GUEST_CHECKOUT_ENABLED;
        } else {
            process.env.NEXT_PUBLIC_GUEST_CHECKOUT_ENABLED = originalEnv;
        }
    });

    it('shows guest link buttons for open sessions when feature flag is enabled', async () => {
        mockFeatureFlag.mockReturnValue(true);
        render(<AdminSessions />);

        await waitFor(() => {
            expect(screen.getAllByText('Kids After School').length).toBeGreaterThan(0);
        });

        // Should show guest link button for the open session
        const guestLinkBtn = screen.getByLabelText(/copy guest booking link for session on 2025-07-15/i);
        expect(guestLinkBtn).toBeInTheDocument();

        const whatsappBtn = screen.getByLabelText(/copy whatsapp guest booking link for session on 2025-07-15/i);
        expect(whatsappBtn).toBeInTheDocument();
    });

    it('hides guest link buttons when feature flag is disabled', async () => {
        mockFeatureFlag.mockReturnValue(false);
        render(<AdminSessions />);

        await waitFor(() => {
            expect(screen.getAllByText('Kids After School').length).toBeGreaterThan(0);
        });

        expect(screen.queryByLabelText(/copy guest booking link/i)).not.toBeInTheDocument();
        expect(screen.queryByLabelText(/copy whatsapp guest booking link/i)).not.toBeInTheDocument();
    });

    it('does not show guest link buttons for non-open sessions', async () => {
        mockFeatureFlag.mockReturnValue(true);
        render(<AdminSessions />);

        await waitFor(() => {
            expect(screen.getAllByText('Kids After School').length).toBeGreaterThan(0);
        });

        // Should NOT show buttons for cancelled session
        expect(screen.queryByLabelText(/copy guest booking link for session on 2025-07-20/i)).not.toBeInTheDocument();
        expect(screen.queryByLabelText(/copy whatsapp guest booking link for session on 2025-07-20/i)).not.toBeInTheDocument();
    });

    it('copies correct guest link URL to clipboard', async () => {
        mockFeatureFlag.mockReturnValue(true);
        render(<AdminSessions />);

        await waitFor(() => {
            expect(screen.getByLabelText(/copy guest booking link for session on 2025-07-15/i)).toBeInTheDocument();
        });

        const guestLinkBtn = screen.getByLabelText(/copy guest booking link for session on 2025-07-15/i);
        fireEvent.click(guestLinkBtn);

        expect(mockClipboard.writeText).toHaveBeenCalledWith(
            `${window.location.origin}/express-booking/session-open-1?source=website_express`
        );
    });

    it('copies correct WhatsApp link URL to clipboard', async () => {
        mockFeatureFlag.mockReturnValue(true);
        render(<AdminSessions />);

        await waitFor(() => {
            expect(screen.getByLabelText(/copy whatsapp guest booking link for session on 2025-07-15/i)).toBeInTheDocument();
        });

        const whatsappBtn = screen.getByLabelText(/copy whatsapp guest booking link for session on 2025-07-15/i);
        fireEvent.click(whatsappBtn);

        const expectedGuestUrl = `${window.location.origin}/express-booking/session-open-1?source=whatsapp_express`;
        const formattedDate = new Date('2025-07-15').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
        const expectedMessage = `Book your child into Kids After School on ${formattedDate} — no account required! ${expectedGuestUrl}`;
        const expectedWhatsappUrl = `https://wa.me/?text=${encodeURIComponent(expectedMessage)}`;

        expect(mockClipboard.writeText).toHaveBeenCalledWith(expectedWhatsappUrl);
    });

    it('shows "Copied!" tooltip after copying guest link', async () => {
        mockFeatureFlag.mockReturnValue(true);
        render(<AdminSessions />);

        await waitFor(() => {
            expect(screen.getByLabelText(/copy guest booking link for session on 2025-07-15/i)).toBeInTheDocument();
        });

        const guestLinkBtn = screen.getByLabelText(/copy guest booking link for session on 2025-07-15/i);
        fireEvent.click(guestLinkBtn);

        await waitFor(() => {
            expect(screen.getByText('Copied!')).toBeInTheDocument();
        });
    });

    it('guest link contains no PII — only session ID and source', async () => {
        mockFeatureFlag.mockReturnValue(true);
        render(<AdminSessions />);

        await waitFor(() => {
            expect(screen.getByLabelText(/copy guest booking link for session on 2025-07-15/i)).toBeInTheDocument();
        });

        const guestLinkBtn = screen.getByLabelText(/copy guest booking link for session on 2025-07-15/i);
        fireEvent.click(guestLinkBtn);

        const copiedUrl = mockClipboard.writeText.mock.calls[0][0] as string;
        const url = new URL(copiedUrl);

        // Only has source param
        expect(url.searchParams.get('source')).toBe('website_express');
        expect(url.searchParams.toString()).toBe('source=website_express');

        // Path contains only sessionId
        expect(url.pathname).toBe('/express-booking/session-open-1');
    });
});
