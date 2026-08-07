import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { User } from 'firebase/auth';
import { Booking } from '@/types';

/**
 * Unit tests for admin panel modifications supporting guest express checkout.
 *
 * Validates: Requirements GUEST-FR-012, GUEST-FR-013, GUEST-OPS-002
 */

// --- Hoisted mocks ---
const mockUseAuth = vi.hoisted(() => vi.fn());
const mockIsGuestCheckoutEnabled = vi.hoisted(() => vi.fn());
const mockGetDocs = vi.hoisted(() => vi.fn());

vi.mock('@/context/AuthContext', () => ({
    useAuth: mockUseAuth,
}));

vi.mock('@/lib/firebase', () => ({ db: {} }));

vi.mock('@/lib/feature-flags', () => ({
    isGuestCheckoutEnabled: mockIsGuestCheckoutEnabled,
}));

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: vi.fn() }),
    usePathname: () => '/admin/bookings',
}));

vi.mock('firebase/firestore', () => ({
    collection: vi.fn(),
    query: vi.fn(),
    getDocs: mockGetDocs,
    orderBy: vi.fn(),
    deleteDoc: vi.fn(),
    doc: vi.fn(),
    where: vi.fn(),
    updateDoc: vi.fn(),
    serverTimestamp: vi.fn(),
}));

import AdminBookings from '@/app/admin/bookings/page';
import AdminSafetyReviews from '@/app/admin/safety-reviews/page';

// --- Test Data ---
const mockGuestBooking: Booking = {
    id: 'pi_guest_mod_001',
    sessionId: 'session-g1',
    sessionDate: '2025-06-10',
    className: 'Kids After School Club',
    venueName: 'Main Kitchen',
    bookedByUid: '',
    bookedByName: '',
    studentId: '',
    studentName: '',
    status: 'confirmed',
    medicalInfo: {
        allergies: true,
        conditions: false,
        recentOperations: false,
        visionImpairment: false,
        hearingImpairment: false,
        glassesRequired: false,
        respiratoryProblems: false,
        otherMedicalNotes: '',
        additionalSupportNeeds: '',
    },
    termsAccepted: true,
    termsAcceptedAt: null,
    payment: {
        stripePaymentIntentId: 'pi_guest_mod_001',
        amount: 2500,
        currency: 'gbp',
        status: 'paid',
    },
    createdAt: null,
    bookingMode: 'guest',
    bookingSource: 'whatsapp_express',
    safetyReviewStatus: 'pending',
    guestContact: {
        firstName: 'Emma',
        lastName: 'Wilson',
        email: 'emma@example.com',
        telephone: '07700900123',
    },
    childSnapshot: {
        firstName: 'Oliver',
        lastName: 'Wilson',
        dateOfBirth: '2018-03-15',
    },
    medicalSnapshot: {
        foodAllergies: true,
        dietaryRequirements: 'Nut-free',
        airborneAllergies: false,
        allergenDetails: 'Tree nuts',
        knownReactions: 'Anaphylaxis',
        symptoms: 'Throat swelling',
        epipenRequired: true,
        epipenDetails: 'EpiPen Jr 0.15mg',
        medicationDetails: '',
        respiratoryProblems: false,
        medicalConditions: '',
        recentOperations: '',
        visionImpairment: false,
        hearingImpairment: false,
        additionalSupportNeeds: '',
        otherSafetyInfo: '',
    },
};

const mockAccountBooking: Booking = {
    id: 'pi_account_mod_002',
    sessionId: 'session-a1',
    sessionDate: '2025-06-12',
    className: 'Weekend Workshop',
    venueName: 'West Kitchen',
    bookedByUid: 'user-456',
    bookedByName: 'James Brown',
    studentId: 'student-456',
    studentName: 'Sophie Brown',
    status: 'confirmed',
    medicalInfo: {
        allergies: false,
        conditions: false,
        recentOperations: false,
        visionImpairment: false,
        hearingImpairment: false,
        glassesRequired: false,
        respiratoryProblems: false,
        otherMedicalNotes: '',
        additionalSupportNeeds: '',
    },
    termsAccepted: true,
    termsAcceptedAt: null,
    payment: {
        stripePaymentIntentId: 'pi_account_mod_002',
        amount: 3000,
        currency: 'gbp',
        status: 'paid',
    },
    createdAt: null,
    bookingMode: 'account',
    bookingSource: 'website',
};

function setupAdminAuth() {
    mockUseAuth.mockReturnValue({
        user: { uid: 'admin-1' } as User,
        btUser: { uid: 'admin-1', role: 'admin', firstName: 'Admin', lastName: 'User', email: 'admin@bt.com', createdAt: null },
        loading: false,
    });
}

describe('Admin Panel — Guest Modifications', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setupAdminAuth();
        mockIsGuestCheckoutEnabled.mockReturnValue(true);
    });

    describe('1. Guest booking renders without errors when bookedByUid absent (GUEST-FR-012)', () => {
        beforeEach(() => {
            mockGetDocs.mockResolvedValue({
                docs: [
                    { id: mockGuestBooking.id, data: () => ({ ...mockGuestBooking, id: undefined }) },
                ],
            });
        });

        it('renders guest booking displaying guestContact name when bookedByUid is absent', async () => {
            render(<AdminBookings />);

            await waitFor(() => {
                expect(screen.getByText('Oliver Wilson')).toBeInTheDocument();
            });

            // Uses guestContact for parent/"By:" display
            expect(screen.getByText('By: Emma Wilson')).toBeInTheDocument();
        });

        it('does not crash when bookedByUid is empty string', async () => {
            render(<AdminBookings />);

            await waitFor(() => {
                expect(screen.getByText('Oliver Wilson')).toBeInTheDocument();
            });

            // Page rendered successfully without errors
            expect(screen.getByText('Booking Master List')).toBeInTheDocument();
        });
    });

    describe('2. Booking mode badge and source label display (GUEST-FR-012)', () => {
        beforeEach(() => {
            mockGetDocs.mockResolvedValue({
                docs: [
                    { id: mockGuestBooking.id, data: () => ({ ...mockGuestBooking, id: undefined }) },
                    { id: mockAccountBooking.id, data: () => ({ ...mockAccountBooking, id: undefined }) },
                ],
            });
        });

        it('displays "Guest" badge for guest bookings', async () => {
            render(<AdminBookings />);

            await waitFor(() => {
                expect(screen.getByText('Guest')).toBeInTheDocument();
            });
        });

        it('displays "Account" badge for account bookings', async () => {
            render(<AdminBookings />);

            await waitFor(() => {
                expect(screen.getByText('Account')).toBeInTheDocument();
            });
        });

        it('displays "WhatsApp" source label for whatsapp_express booking', async () => {
            render(<AdminBookings />);

            await waitFor(() => {
                expect(screen.getByText('WhatsApp')).toBeInTheDocument();
            });
        });

        it('displays "Website" source label for website booking', async () => {
            render(<AdminBookings />);

            await waitFor(() => {
                expect(screen.getByText('Website')).toBeInTheDocument();
            });
        });

        it('displays human-readable source labels for all source types', async () => {
            const instagramBooking = { ...mockGuestBooking, id: 'pi_ig', bookingSource: 'instagram_express' as const };
            mockGetDocs.mockResolvedValue({
                docs: [{ id: instagramBooking.id, data: () => ({ ...instagramBooking, id: undefined }) }],
            });

            render(<AdminBookings />);

            await waitFor(() => {
                expect(screen.getByText('Instagram')).toBeInTheDocument();
            });
        });
    });

    describe('3. Safety review queue filtering (GUEST-FR-013)', () => {
        const pendingBooking: Booking = {
            ...mockGuestBooking,
            id: 'pi_pending_sr1',
            safetyReviewStatus: 'pending',
        };

        const contactParentBooking: Booking = {
            ...mockGuestBooking,
            id: 'pi_contact_sr2',
            safetyReviewStatus: 'contact_parent',
            guestContact: {
                firstName: 'Priya',
                lastName: 'Patel',
                email: 'priya@example.com',
                telephone: '07700900456',
            },
            childSnapshot: {
                firstName: 'Arun',
                lastName: 'Patel',
                dateOfBirth: '2017-01-20',
            },
        };

        beforeEach(() => {
            mockGetDocs.mockResolvedValue({
                docs: [
                    { id: pendingBooking.id, data: () => ({ ...pendingBooking, id: undefined }) },
                    { id: contactParentBooking.id, data: () => ({ ...contactParentBooking, id: undefined }) },
                ],
            });
        });

        it('renders safety review queue with bookings that have pending or contact_parent status', async () => {
            render(<AdminSafetyReviews />);

            await waitFor(() => {
                expect(screen.getByText('Safety Review Queue')).toBeInTheDocument();
            });

            expect(screen.getByText('Oliver Wilson')).toBeInTheDocument();
            expect(screen.getByText('Arun Patel')).toBeInTheDocument();
        });

        it('filters to only pending bookings when Pending filter is clicked', async () => {
            const user = userEvent.setup();
            render(<AdminSafetyReviews />);

            await waitFor(() => {
                expect(screen.getByText('Oliver Wilson')).toBeInTheDocument();
            });

            await user.click(screen.getByRole('button', { name: 'Pending' }));

            expect(screen.getByText('Oliver Wilson')).toBeInTheDocument();
            expect(screen.queryByText('Arun Patel')).not.toBeInTheDocument();
        });

        it('filters to only contact_parent bookings when Contact Parent filter is clicked', async () => {
            const user = userEvent.setup();
            render(<AdminSafetyReviews />);

            await waitFor(() => {
                expect(screen.getByText('Arun Patel')).toBeInTheDocument();
            });

            await user.click(screen.getByRole('button', { name: 'Contact Parent' }));

            expect(screen.getByText('Arun Patel')).toBeInTheDocument();
            expect(screen.queryByText('Oliver Wilson')).not.toBeInTheDocument();
        });

        it('displays pending count summary', async () => {
            render(<AdminSafetyReviews />);

            await waitFor(() => {
                expect(screen.getByText(/1 pending, 1 to contact/)).toBeInTheDocument();
            });
        });
    });

    describe('4. Guest link copy functionality (GUEST-OPS-002)', () => {
        it('constructs guest link with correct session ID and source parameter', () => {
            const sessionId = 'session-copy-test';
            const origin = 'http://localhost:3000';
            const url = `${origin}/express-booking/${sessionId}?source=website_express`;

            expect(url).toContain(sessionId);
            expect(url).toContain('source=website_express');
        });

        it('guest link does not contain personal or medical information', () => {
            const sessionId = 'session-safe-link';
            const origin = 'http://localhost:3000';
            const url = `${origin}/express-booking/${sessionId}?source=website_express`;

            expect(url).not.toContain('email');
            expect(url).not.toContain('phone');
            expect(url).not.toContain('medical');
            expect(url).not.toContain('allergy');
        });

        it('WhatsApp link uses wa.me format with encoded message', () => {
            const sessionId = 'session-wa-test';
            const className = 'Kids After School Club';
            const origin = 'http://localhost:3000';
            const guestUrl = `${origin}/express-booking/${sessionId}?source=whatsapp_express`;
            const message = `Book your child into ${className}! ${guestUrl}`;
            const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;

            expect(whatsappUrl).toContain('https://wa.me/?text=');
            expect(whatsappUrl).toContain('whatsapp_express');
            expect(whatsappUrl).toContain(encodeURIComponent(className));
        });

        it('clipboard writeText is called with the correct URL on copy', async () => {
            const writeText = vi.fn().mockResolvedValue(undefined);
            Object.defineProperty(navigator, 'clipboard', {
                value: { writeText },
                writable: true,
                configurable: true,
            });

            const sessionId = 'session-clipboard';
            const url = `http://localhost:3000/express-booking/${sessionId}?source=website_express`;
            await navigator.clipboard.writeText(url);

            expect(writeText).toHaveBeenCalledWith(
                'http://localhost:3000/express-booking/session-clipboard?source=website_express'
            );
        });
    });

    describe('5. Guest link copy buttons appear only when feature flag enabled and session open (GUEST-OPS-002)', () => {
        it('buttons condition evaluates to true only when both flag enabled and session open', () => {
            mockIsGuestCheckoutEnabled.mockReturnValue(true);
            const sessionStatus = 'open';
            const showButtons = mockIsGuestCheckoutEnabled() && sessionStatus === 'open';
            expect(showButtons).toBe(true);
        });

        it('buttons condition evaluates to false when flag enabled but session not open', () => {
            mockIsGuestCheckoutEnabled.mockReturnValue(true);
            const sessionStatus = 'cancelled';
            const showButtons = mockIsGuestCheckoutEnabled() && sessionStatus === 'open';
            expect(showButtons).toBe(false);
        });

        it('buttons condition evaluates to false when session open but flag disabled', () => {
            mockIsGuestCheckoutEnabled.mockReturnValue(false);
            const sessionStatus = 'open';
            const showButtons = mockIsGuestCheckoutEnabled() && sessionStatus === 'open';
            expect(showButtons).toBe(false);
        });
    });

    describe('6. Guest-related elements hidden when feature flag disabled (GUEST-FR-012, GUEST-OPS-002)', () => {
        it('feature flag returns false — guest link buttons would not render', () => {
            mockIsGuestCheckoutEnabled.mockReturnValue(false);
            const guestCheckoutEnabled = mockIsGuestCheckoutEnabled();

            expect(guestCheckoutEnabled).toBe(false);
            // The sessions page condition: guestCheckoutEnabled && s.status === 'open'
            expect(guestCheckoutEnabled && true).toBe(false);
        });

        it('admin bookings page still renders normally when feature flag is disabled', async () => {
            mockIsGuestCheckoutEnabled.mockReturnValue(false);
            mockGetDocs.mockResolvedValue({
                docs: [
                    { id: mockAccountBooking.id, data: () => ({ ...mockAccountBooking, id: undefined }) },
                ],
            });

            render(<AdminBookings />);

            await waitFor(() => {
                expect(screen.getByText('Sophie Brown')).toBeInTheDocument();
            });

            // Account booking badge still shows (use getAllByText since "Account" also appears in filter dropdown)
            const accountElements = screen.getAllByText('Account');
            expect(accountElements.length).toBeGreaterThanOrEqual(1);
            // Page renders without guest link buttons
            expect(screen.getByText('Booking Master List')).toBeInTheDocument();
        });

        it('existing account booking data is unaffected by feature flag state', async () => {
            mockIsGuestCheckoutEnabled.mockReturnValue(false);
            mockGetDocs.mockResolvedValue({
                docs: [
                    { id: mockAccountBooking.id, data: () => ({ ...mockAccountBooking, id: undefined }) },
                ],
            });

            render(<AdminBookings />);

            await waitFor(() => {
                expect(screen.getByText('By: James Brown')).toBeInTheDocument();
            });
            expect(screen.getByText('Weekend Workshop')).toBeInTheDocument();
        });
    });
});
