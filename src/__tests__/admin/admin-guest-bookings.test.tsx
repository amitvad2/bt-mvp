import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ============================================================
// Mocks
// ============================================================

// Mock Firebase client
vi.mock('@/lib/firebase', () => ({
    db: {},
}));

// Mock firebase/firestore
const mockGetDocs = vi.fn();
vi.mock('firebase/firestore', () => ({
    collection: vi.fn(),
    query: vi.fn(),
    getDocs: (...args: any[]) => mockGetDocs(...args),
    where: vi.fn(),
    orderBy: vi.fn(),
    deleteDoc: vi.fn(),
    updateDoc: vi.fn(),
    doc: vi.fn(),
    serverTimestamp: vi.fn(() => 'server-timestamp'),
}));

// Mock next/navigation
vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: vi.fn() }),
    usePathname: () => '/admin/bookings',
}));

// Mock lucide-react icons as simple spans
vi.mock('lucide-react', () => ({
    Trash2: () => <span data-testid="icon-trash" />,
    Search: () => <span data-testid="icon-search" />,
    Filter: () => <span data-testid="icon-filter" />,
    Calendar: () => <span data-testid="icon-calendar" />,
    ShieldAlert: () => <span data-testid="icon-shield" />,
    Plus: () => <span data-testid="icon-plus" />,
    Edit2: () => <span data-testid="icon-edit" />,
    X: () => <span data-testid="icon-x" />,
    Clock: () => <span data-testid="icon-clock" />,
    ChefHat: () => <span data-testid="icon-chef" />,
    MapPin: () => <span data-testid="icon-map" />,
    UserCheck: () => <span data-testid="icon-usercheck" />,
    ClipboardList: () => <span data-testid="icon-clipboard" />,
    Link: () => <span data-testid="icon-link" />,
    MessageCircle: () => <span data-testid="icon-message" />,
}));

// ============================================================
// Test Data Fixtures
// ============================================================

/** A guest booking with no bookedByUid and embedded snapshots */
function createGuestBooking(overrides = {}) {
    return {
        id: 'pi_guest_001',
        sessionId: 'sess-1',
        sessionDate: '2025-03-15',
        className: 'Kids After School Club',
        venueName: 'Community Hall',
        bookedByUid: '',
        bookedByName: '',
        studentId: '',
        studentName: '',
        status: 'confirmed',
        bookingMode: 'guest' as const,
        bookingSource: 'whatsapp_express' as const,
        safetyReviewStatus: 'pending' as const,
        guestContact: {
            firstName: 'Sarah',
            lastName: 'Connor',
            email: 'sarah@example.com',
            telephone: '07700900123',
        },
        childSnapshot: {
            firstName: 'John',
            lastName: 'Connor',
            dateOfBirth: '2018-06-15',
        },
        medicalSnapshot: {
            foodAllergies: true,
            dietaryRequirements: 'No nuts',
            airborneAllergies: false,
            allergenDetails: 'Peanuts, tree nuts',
            knownReactions: 'Anaphylaxis',
            symptoms: 'Swelling, difficulty breathing',
            epipenRequired: true,
            epipenDetails: 'EpiPen Jr in bag',
            medicationDetails: '',
            respiratoryProblems: false,
            medicalConditions: '',
            recentOperations: '',
            visionImpairment: false,
            hearingImpairment: false,
            additionalSupportNeeds: '',
            otherSafetyInfo: '',
        },
        payment: {
            stripePaymentIntentId: 'pi_guest_001',
            amount: 2500,
            currency: 'gbp',
            status: 'paid',
        },
        createdAt: { toDate: () => new Date('2025-03-10T10:00:00Z') },
        ...overrides,
    };
}

/** A standard account booking with bookedByUid */
function createAccountBooking(overrides = {}) {
    return {
        id: 'pi_account_001',
        sessionId: 'sess-2',
        sessionDate: '2025-03-16',
        className: 'Weekend Workshop',
        venueName: 'Kitchen Studio',
        bookedByUid: 'uid-abc-123',
        bookedByName: 'Jane Smith',
        studentId: 'student-1',
        studentName: 'Tom Smith',
        status: 'confirmed',
        bookingMode: 'account' as const,
        bookingSource: 'website' as const,
        safetyReviewStatus: 'not_required' as const,
        payment: {
            stripePaymentIntentId: 'pi_account_001',
            amount: 3500,
            currency: 'gbp',
            status: 'paid',
        },
        createdAt: { toDate: () => new Date('2025-03-11T10:00:00Z') },
        ...overrides,
    };
}

// ============================================================
// Tests: Admin Bookings List (src/app/admin/bookings/page.tsx)
// ============================================================

describe('AdminBookings — Guest Booking Rendering', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders guest booking without errors when bookedByUid is absent', async () => {
        const guestBooking = createGuestBooking();
        mockGetDocs.mockResolvedValueOnce({
            docs: [{ id: guestBooking.id, data: () => guestBooking }],
        });

        const AdminBookings = (await import('@/app/admin/bookings/page')).default;
        render(<AdminBookings />);

        await waitFor(() => {
            // Guest contact name should be displayed (inside "By: Sarah Connor" span)
            expect(screen.getByText(/Sarah Connor/)).toBeInTheDocument();
        });

        // Child name should also be displayed
        expect(screen.getByText('John Connor')).toBeInTheDocument();
    });

    it('displays guest contact name when bookedByUid is empty', async () => {
        const guestBooking = createGuestBooking({ bookedByUid: '' });
        mockGetDocs.mockResolvedValueOnce({
            docs: [{ id: guestBooking.id, data: () => guestBooking }],
        });

        const AdminBookings = (await import('@/app/admin/bookings/page')).default;
        render(<AdminBookings />);

        await waitFor(() => {
            expect(screen.getByText(/Sarah Connor/)).toBeInTheDocument();
        });
    });

    it('displays "Guest" badge for guest bookings', async () => {
        const guestBooking = createGuestBooking();
        mockGetDocs.mockResolvedValueOnce({
            docs: [{ id: guestBooking.id, data: () => guestBooking }],
        });

        const AdminBookings = (await import('@/app/admin/bookings/page')).default;
        render(<AdminBookings />);

        await waitFor(() => {
            expect(screen.getByText('Guest')).toBeInTheDocument();
        });
    });

    it('displays "Account" badge for regular bookings', async () => {
        const accountBooking = createAccountBooking();
        mockGetDocs.mockResolvedValueOnce({
            docs: [{ id: accountBooking.id, data: () => accountBooking }],
        });

        const AdminBookings = (await import('@/app/admin/bookings/page')).default;
        render(<AdminBookings />);

        await waitFor(() => {
            expect(screen.getByText('Account')).toBeInTheDocument();
        });
    });

    it('displays "WhatsApp" source label for whatsapp_express source', async () => {
        const guestBooking = createGuestBooking({ bookingSource: 'whatsapp_express' });
        mockGetDocs.mockResolvedValueOnce({
            docs: [{ id: guestBooking.id, data: () => guestBooking }],
        });

        const AdminBookings = (await import('@/app/admin/bookings/page')).default;
        render(<AdminBookings />);

        await waitFor(() => {
            expect(screen.getByText('WhatsApp')).toBeInTheDocument();
        });
    });

    it('displays correct source labels for various booking sources', async () => {
        const bookings = [
            createGuestBooking({ id: 'pi_1', bookingSource: 'facebook_express' }),
            createGuestBooking({ id: 'pi_2', bookingSource: 'qr_express' }),
            createGuestBooking({ id: 'pi_3', bookingSource: 'instagram_express' }),
        ];
        mockGetDocs.mockResolvedValueOnce({
            docs: bookings.map(b => ({ id: b.id, data: () => b })),
        });

        const AdminBookings = (await import('@/app/admin/bookings/page')).default;
        const { container } = render(<AdminBookings />);

        await waitFor(() => {
            // Verify badges render with correct text for each booking source
            const badges = container.querySelectorAll('.badge');
            const badgeTexts = Array.from(badges).map(b => b.textContent);
            expect(badgeTexts).toContain('Messenger');
            expect(badgeTexts).toContain('QR Code');
            expect(badgeTexts).toContain('Instagram');
        });
    });
});

// ============================================================
// Tests: Safety Review Queue (src/app/admin/safety-reviews/page.tsx)
// ============================================================

describe('AdminSafetyReviews — Safety Queue Filtering', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('displays only bookings with pending or contact_parent status', async () => {
        const pendingBooking = createGuestBooking({
            id: 'pi_pending',
            safetyReviewStatus: 'pending',
        });
        const contactBooking = createGuestBooking({
            id: 'pi_contact',
            safetyReviewStatus: 'contact_parent',
            guestContact: { firstName: 'Mike', lastName: 'Johnson', email: 'mike@example.com', telephone: '07700900456' },
            childSnapshot: { firstName: 'Emma', lastName: 'Johnson', dateOfBirth: '2017-01-20' },
        });

        // The component queries Firestore with where('safetyReviewStatus', 'in', ['pending', 'contact_parent'])
        // so only those docs should be returned by the mock
        mockGetDocs.mockResolvedValueOnce({
            docs: [
                { id: pendingBooking.id, data: () => pendingBooking },
                { id: contactBooking.id, data: () => contactBooking },
            ],
        });

        const AdminSafetyReviews = (await import('@/app/admin/safety-reviews/page')).default;
        render(<AdminSafetyReviews />);

        await waitFor(() => {
            // Both pending and contact_parent bookings should render
            expect(screen.getByText('John Connor')).toBeInTheDocument();
            expect(screen.getByText('Emma Johnson')).toBeInTheDocument();
        });
    });

    it('shows medical flags for bookings with allergy/EpiPen declarations', async () => {
        const booking = createGuestBooking({
            medicalSnapshot: {
                foodAllergies: true,
                epipenRequired: true,
                airborneAllergies: false,
                respiratoryProblems: false,
                medicalConditions: '',
                visionImpairment: false,
                hearingImpairment: false,
                additionalSupportNeeds: '',
                dietaryRequirements: '',
                allergenDetails: '',
                knownReactions: '',
                symptoms: '',
                epipenDetails: '',
                medicationDetails: '',
                recentOperations: '',
                otherSafetyInfo: '',
            },
        });

        mockGetDocs.mockResolvedValueOnce({
            docs: [{ id: booking.id, data: () => booking }],
        });

        const AdminSafetyReviews = (await import('@/app/admin/safety-reviews/page')).default;
        render(<AdminSafetyReviews />);

        await waitFor(() => {
            expect(screen.getByText('Food Allergies')).toBeInTheDocument();
            expect(screen.getByText('EpiPen Required')).toBeInTheDocument();
        });
    });

    it('shows empty message when no bookings require safety review', async () => {
        mockGetDocs.mockResolvedValueOnce({
            docs: [],
        });

        const AdminSafetyReviews = (await import('@/app/admin/safety-reviews/page')).default;
        render(<AdminSafetyReviews />);

        await waitFor(() => {
            expect(screen.getByText('No bookings require safety review at this time.')).toBeInTheDocument();
        });
    });
});

// ============================================================
// Tests: Guest Link Copy (src/app/admin/sessions/page.tsx)
// ============================================================

// We need a separate mock setup for the sessions page since it uses isGuestCheckoutEnabled
vi.mock('@/lib/feature-flags', () => ({
    isGuestCheckoutEnabled: vi.fn(),
}));

describe('AdminSessions — Guest Link Copy Functionality', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('shows guest link copy buttons when feature flag is enabled and session is open', async () => {
        const { isGuestCheckoutEnabled } = await import('@/lib/feature-flags');
        vi.mocked(isGuestCheckoutEnabled).mockReturnValue(true);

        const session = {
            id: 'sess-open-1',
            classId: 'class-1',
            className: 'Kids After School Club',
            classType: 'kidsAfterSchool',
            date: '2025-04-01',
            startTime: '15:30',
            endTime: '16:30',
            venueName: 'Community Hall',
            venueId: 'venue-1',
            status: 'open',
            spotsAvailable: 10,
            spotsTotal: 15,
            ageMin: 5,
            ageMax: 12,
            price: 2500,
            createdAt: { toDate: () => new Date() },
        };

        // Mock for sessions fetch
        mockGetDocs.mockResolvedValueOnce({
            docs: [{ id: session.id, data: () => session }],
        });
        // Mock for classes fetch
        mockGetDocs.mockResolvedValueOnce({ docs: [] });
        // Mock for recipes fetch
        mockGetDocs.mockResolvedValueOnce({ docs: [] });
        // Mock for instructors fetch
        mockGetDocs.mockResolvedValueOnce({ docs: [] });
        // Mock for class_types fetch
        mockGetDocs.mockResolvedValueOnce({ docs: [] });

        const AdminSessions = (await import('@/app/admin/sessions/page')).default;
        render(<AdminSessions />);

        await waitFor(() => {
            const guestLinkBtn = screen.getByLabelText(/Copy guest booking link for session on 2025-04-01/i);
            expect(guestLinkBtn).toBeInTheDocument();
        });

        const whatsappLinkBtn = screen.getByLabelText(/Copy WhatsApp guest booking link for session on 2025-04-01/i);
        expect(whatsappLinkBtn).toBeInTheDocument();
    });

    it('copies guest link to clipboard when button is clicked', async () => {
        const { isGuestCheckoutEnabled } = await import('@/lib/feature-flags');
        vi.mocked(isGuestCheckoutEnabled).mockReturnValue(true);

        // Mock clipboard.writeText before render using fireEvent (userEvent.setup patches clipboard)
        const writeTextMock = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(window.navigator, 'clipboard', {
            value: { writeText: writeTextMock, readText: vi.fn() },
            writable: true,
            configurable: true,
        });

        const session = {
            id: 'sess-copy-1',
            classId: 'class-1',
            className: 'Kids After School Club',
            classType: 'kidsAfterSchool',
            date: '2025-04-01',
            startTime: '15:30',
            endTime: '16:30',
            venueName: 'Community Hall',
            venueId: 'venue-1',
            status: 'open',
            spotsAvailable: 10,
            spotsTotal: 15,
            ageMin: 5,
            ageMax: 12,
            price: 2500,
            createdAt: { toDate: () => new Date() },
        };

        mockGetDocs.mockResolvedValueOnce({
            docs: [{ id: session.id, data: () => session }],
        });
        mockGetDocs.mockResolvedValueOnce({ docs: [] }); // classes
        mockGetDocs.mockResolvedValueOnce({ docs: [] }); // recipes
        mockGetDocs.mockResolvedValueOnce({ docs: [] }); // instructors
        mockGetDocs.mockResolvedValueOnce({ docs: [] }); // class_types

        const { fireEvent } = await import('@testing-library/react');
        const AdminSessions = (await import('@/app/admin/sessions/page')).default;
        render(<AdminSessions />);

        await waitFor(() => {
            expect(screen.getByLabelText(/Copy guest booking link for session on 2025-04-01/i)).toBeInTheDocument();
        });

        const btn = screen.getByLabelText(/Copy guest booking link for session on 2025-04-01/i);
        fireEvent.click(btn);

        await waitFor(() => {
            expect(writeTextMock).toHaveBeenCalledWith(
                expect.stringContaining('/express-booking/sess-copy-1?source=website_express')
            );
        });
    });

    it('hides guest link buttons when feature flag is disabled', async () => {
        const { isGuestCheckoutEnabled } = await import('@/lib/feature-flags');
        vi.mocked(isGuestCheckoutEnabled).mockReturnValue(false);

        const session = {
            id: 'sess-disabled-1',
            classId: 'class-1',
            className: 'Kids After School Club',
            classType: 'kidsAfterSchool',
            date: '2025-04-01',
            startTime: '15:30',
            endTime: '16:30',
            venueName: 'Community Hall',
            venueId: 'venue-1',
            status: 'open',
            spotsAvailable: 10,
            spotsTotal: 15,
            ageMin: 5,
            ageMax: 12,
            price: 2500,
            createdAt: { toDate: () => new Date() },
        };

        mockGetDocs.mockResolvedValueOnce({
            docs: [{ id: session.id, data: () => session }],
        });
        mockGetDocs.mockResolvedValueOnce({ docs: [] });
        mockGetDocs.mockResolvedValueOnce({ docs: [] });
        mockGetDocs.mockResolvedValueOnce({ docs: [] });
        mockGetDocs.mockResolvedValueOnce({ docs: [] });

        const AdminSessions = (await import('@/app/admin/sessions/page')).default;
        render(<AdminSessions />);

        await waitFor(() => {
            expect(screen.getByText('Kids After School Club')).toBeInTheDocument();
        });

        // Guest link buttons should NOT be rendered
        expect(screen.queryByLabelText(/Copy guest booking link/i)).not.toBeInTheDocument();
        expect(screen.queryByLabelText(/Copy WhatsApp guest booking link/i)).not.toBeInTheDocument();
    });

    it('hides guest link buttons when session is not open (closed status)', async () => {
        const { isGuestCheckoutEnabled } = await import('@/lib/feature-flags');
        vi.mocked(isGuestCheckoutEnabled).mockReturnValue(true);

        const session = {
            id: 'sess-closed-1',
            classId: 'class-1',
            className: 'Kids After School Club',
            classType: 'kidsAfterSchool',
            date: '2025-04-01',
            startTime: '15:30',
            endTime: '16:30',
            venueName: 'Community Hall',
            venueId: 'venue-1',
            status: 'closed',
            spotsAvailable: 0,
            spotsTotal: 15,
            ageMin: 5,
            ageMax: 12,
            price: 2500,
            createdAt: { toDate: () => new Date() },
        };

        mockGetDocs.mockResolvedValueOnce({
            docs: [{ id: session.id, data: () => session }],
        });
        mockGetDocs.mockResolvedValueOnce({ docs: [] });
        mockGetDocs.mockResolvedValueOnce({ docs: [] });
        mockGetDocs.mockResolvedValueOnce({ docs: [] });
        mockGetDocs.mockResolvedValueOnce({ docs: [] });

        const AdminSessions = (await import('@/app/admin/sessions/page')).default;
        render(<AdminSessions />);

        await waitFor(() => {
            expect(screen.getByText('Kids After School Club')).toBeInTheDocument();
        });

        // Guest link buttons should NOT render for closed sessions
        expect(screen.queryByLabelText(/Copy guest booking link for session on 2025-04-01/i)).not.toBeInTheDocument();
        expect(screen.queryByLabelText(/Copy WhatsApp guest booking link for session on 2025-04-01/i)).not.toBeInTheDocument();
    });
});
