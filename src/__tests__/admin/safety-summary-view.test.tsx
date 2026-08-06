import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { User } from 'firebase/auth';
import { Booking } from '@/types';

// --- Hoisted mock for useAuth ---
const mockUseAuth = vi.hoisted(() => vi.fn());

vi.mock('@/context/AuthContext', () => ({
    useAuth: mockUseAuth,
}));

vi.mock('@/lib/firebase', () => ({ db: {} }));

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: vi.fn() }),
    usePathname: () => '/admin/bookings',
}));

import SafetySummaryView from '@/app/admin/bookings/SafetySummaryView';

// --- Test Data ---
const mockGuestBooking: Booking = {
    id: 'pi_test_123456789',
    sessionId: 'session-1',
    sessionDate: '2025-02-15',
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
        stripePaymentIntentId: 'pi_test_123456789',
        amount: 2500,
        currency: 'gbp',
        status: 'paid',
    },
    createdAt: null,
    bookingMode: 'guest',
    bookingSource: 'whatsapp_express',
    safetyReviewStatus: 'pending',
    safetyReviewNotes: 'Parent to bring EpiPen on the day.',
    childSnapshot: {
        firstName: 'Emma',
        lastName: 'Smith',
        dateOfBirth: '2017-05-10',
    },
    medicalSnapshot: {
        foodAllergies: true,
        dietaryRequirements: 'Vegetarian',
        airborneAllergies: true,
        allergenDetails: 'Peanuts, tree nuts',
        knownReactions: 'Anaphylaxis',
        symptoms: 'Swelling, difficulty breathing',
        epipenRequired: true,
        epipenDetails: 'EpiPen Jr 0.15mg - left pocket of bag',
        medicationDetails: 'Antihistamine as needed',
        respiratoryProblems: false,
        medicalConditions: 'Nut allergy - severe',
        recentOperations: '',
        visionImpairment: false,
        hearingImpairment: false,
        additionalSupportNeeds: 'Needs supervision during food prep',
        otherSafetyInfo: 'Allergic reaction plan in school bag',
    },
    allergyDietarySnapshot: {
        foodAllergies: ['Peanuts', 'Tree nuts', 'Sesame'],
        dietaryRequirements: ['Vegetarian'],
        airborneAllergies: ['Nut dust'],
        allergenDetails: 'Severe nut allergy',
        reactionDetails: 'Anaphylaxis within minutes',
        symptoms: 'Swelling, hives, breathing difficulty',
    },
    emergencyContactSnapshot: {
        name: 'John Smith',
        relationship: 'Father',
        mobile: '07700900123',
        alternativePhone: '02012345678',
        email: 'john.smith@example.com',
    },
    authorisedCollectorSnapshot: {
        name: 'Jane Smith',
        relationship: 'Mother',
        phone: '07700900456',
        sameAsParent: false,
    },
    guestContact: {
        firstName: 'Sarah',
        lastName: 'Smith',
        email: 'sarah@example.com',
        telephone: '07700900789',
    },
};

describe('SafetySummaryView', () => {
    const mockOnClose = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('Role-based access control', () => {
        it('renders safety data when user has admin role', () => {
            mockUseAuth.mockReturnValue({
                user: { uid: 'admin-1' } as User,
                btUser: { uid: 'admin-1', role: 'admin', firstName: 'Admin', lastName: 'User', email: 'admin@test.com', createdAt: null },
                loading: false,
            });

            render(<SafetySummaryView booking={mockGuestBooking} onClose={mockOnClose} />);

            expect(screen.getByText('Safety Summary')).toBeInTheDocument();
            expect(screen.getByText('Emma Smith')).toBeInTheDocument();
        });

        it('renders safety data when user has instructor role', () => {
            mockUseAuth.mockReturnValue({
                user: { uid: 'instructor-1' } as User,
                btUser: { uid: 'instructor-1', role: 'instructor', firstName: 'Instructor', lastName: 'User', email: 'instructor@test.com', createdAt: null },
                loading: false,
            });

            render(<SafetySummaryView booking={mockGuestBooking} onClose={mockOnClose} />);

            expect(screen.getByText('Safety Summary')).toBeInTheDocument();
            expect(screen.getByText('Emma Smith')).toBeInTheDocument();
        });

        it('denies access when user has parent role', () => {
            mockUseAuth.mockReturnValue({
                user: { uid: 'parent-1' } as User,
                btUser: { uid: 'parent-1', role: 'parent', firstName: 'Parent', lastName: 'User', email: 'parent@test.com', createdAt: null },
                loading: false,
            });

            render(<SafetySummaryView booking={mockGuestBooking} onClose={mockOnClose} />);

            expect(screen.getByText('Access Restricted')).toBeInTheDocument();
            expect(screen.queryByText('Safety Summary')).not.toBeInTheDocument();
        });

        it('denies access when user has youngAdult role', () => {
            mockUseAuth.mockReturnValue({
                user: { uid: 'ya-1' } as User,
                btUser: { uid: 'ya-1', role: 'youngAdult', firstName: 'Young', lastName: 'Adult', email: 'ya@test.com', createdAt: null },
                loading: false,
            });

            render(<SafetySummaryView booking={mockGuestBooking} onClose={mockOnClose} />);

            expect(screen.getByText('Access Restricted')).toBeInTheDocument();
        });

        it('denies access when user is not authenticated', () => {
            mockUseAuth.mockReturnValue({
                user: null,
                btUser: null,
                loading: false,
            });

            render(<SafetySummaryView booking={mockGuestBooking} onClose={mockOnClose} />);

            expect(screen.getByText('Access Restricted')).toBeInTheDocument();
        });
    });

    describe('Data display', () => {
        beforeEach(() => {
            mockUseAuth.mockReturnValue({
                user: { uid: 'admin-1' } as User,
                btUser: { uid: 'admin-1', role: 'admin', firstName: 'Admin', lastName: 'User', email: 'admin@test.com', createdAt: null },
                loading: false,
            });
        });

        it('displays student name from childSnapshot', () => {
            render(<SafetySummaryView booking={mockGuestBooking} onClose={mockOnClose} />);

            expect(screen.getByText('Emma Smith')).toBeInTheDocument();
        });

        it('displays dietary requirements', () => {
            render(<SafetySummaryView booking={mockGuestBooking} onClose={mockOnClose} />);

            expect(screen.getByText('Vegetarian')).toBeInTheDocument();
        });

        it('displays food allergies from allergyDietarySnapshot', () => {
            render(<SafetySummaryView booking={mockGuestBooking} onClose={mockOnClose} />);

            expect(screen.getByText('Peanuts, Tree nuts, Sesame')).toBeInTheDocument();
        });

        it('displays airborne allergies', () => {
            render(<SafetySummaryView booking={mockGuestBooking} onClose={mockOnClose} />);

            expect(screen.getByText('Nut dust')).toBeInTheDocument();
        });

        it('displays EpiPen details', () => {
            render(<SafetySummaryView booking={mockGuestBooking} onClose={mockOnClose} />);

            expect(screen.getByText('EpiPen Jr 0.15mg - left pocket of bag')).toBeInTheDocument();
        });

        it('displays medication details', () => {
            render(<SafetySummaryView booking={mockGuestBooking} onClose={mockOnClose} />);

            expect(screen.getByText('Antihistamine as needed')).toBeInTheDocument();
        });

        it('displays medical conditions', () => {
            render(<SafetySummaryView booking={mockGuestBooking} onClose={mockOnClose} />);

            expect(screen.getByText('Nut allergy - severe')).toBeInTheDocument();
        });

        it('displays emergency contact details', () => {
            render(<SafetySummaryView booking={mockGuestBooking} onClose={mockOnClose} />);

            expect(screen.getByText('John Smith')).toBeInTheDocument();
            expect(screen.getByText('Father')).toBeInTheDocument();
            expect(screen.getByText('07700900123')).toBeInTheDocument();
        });

        it('displays authorised collector details', () => {
            render(<SafetySummaryView booking={mockGuestBooking} onClose={mockOnClose} />);

            expect(screen.getByText('Jane Smith')).toBeInTheDocument();
            expect(screen.getByText('Mother')).toBeInTheDocument();
            expect(screen.getByText('07700900456')).toBeInTheDocument();
        });

        it('displays safety review status as "Pending Review"', () => {
            render(<SafetySummaryView booking={mockGuestBooking} onClose={mockOnClose} />);

            expect(screen.getByText('Pending Review')).toBeInTheDocument();
        });

        it('displays operational notes', () => {
            render(<SafetySummaryView booking={mockGuestBooking} onClose={mockOnClose} />);

            expect(screen.getByText('Parent to bring EpiPen on the day.')).toBeInTheDocument();
        });

        it('displays medical flags for food allergies, airborne allergies, and EpiPen', () => {
            render(<SafetySummaryView booking={mockGuestBooking} onClose={mockOnClose} />);

            // These labels appear as both flag badges and field labels — use getAllByText
            expect(screen.getAllByText('Food Allergies').length).toBeGreaterThanOrEqual(1);
            expect(screen.getAllByText('Airborne Allergies').length).toBeGreaterThanOrEqual(1);
            expect(screen.getAllByText('EpiPen Required').length).toBeGreaterThanOrEqual(1);
        });
    });

    describe('Close interaction', () => {
        beforeEach(() => {
            mockUseAuth.mockReturnValue({
                user: { uid: 'admin-1' } as User,
                btUser: { uid: 'admin-1', role: 'admin', firstName: 'Admin', lastName: 'User', email: 'admin@test.com', createdAt: null },
                loading: false,
            });
        });

        it('calls onClose when close button is clicked', async () => {
            const user = userEvent.setup();
            render(<SafetySummaryView booking={mockGuestBooking} onClose={mockOnClose} />);

            const closeBtn = screen.getByLabelText('Close safety summary');
            await user.click(closeBtn);

            expect(mockOnClose).toHaveBeenCalledTimes(1);
        });

        it('calls onClose when overlay background is clicked', async () => {
            const user = userEvent.setup();
            render(<SafetySummaryView booking={mockGuestBooking} onClose={mockOnClose} />);

            const overlay = screen.getByRole('dialog');
            await user.click(overlay);

            expect(mockOnClose).toHaveBeenCalled();
        });
    });

    describe('Edge cases', () => {
        beforeEach(() => {
            mockUseAuth.mockReturnValue({
                user: { uid: 'admin-1' } as User,
                btUser: { uid: 'admin-1', role: 'admin', firstName: 'Admin', lastName: 'User', email: 'admin@test.com', createdAt: null },
                loading: false,
            });
        });

        it('handles booking without medical snapshot gracefully', () => {
            const bookingWithoutMedical: Booking = {
                ...mockGuestBooking,
                medicalSnapshot: undefined,
                allergyDietarySnapshot: undefined,
            };

            render(<SafetySummaryView booking={bookingWithoutMedical} onClose={mockOnClose} />);

            expect(screen.getByText('Safety Summary')).toBeInTheDocument();
            expect(screen.getByText('Emma Smith')).toBeInTheDocument();
        });

        it('shows "No operational notes recorded" when no notes exist', () => {
            const bookingWithoutNotes: Booking = {
                ...mockGuestBooking,
                safetyReviewNotes: undefined,
            };

            render(<SafetySummaryView booking={bookingWithoutNotes} onClose={mockOnClose} />);

            expect(screen.getByText('No operational notes recorded.')).toBeInTheDocument();
        });

        it('falls back to studentName when childSnapshot is absent', () => {
            const bookingWithoutChild: Booking = {
                ...mockGuestBooking,
                childSnapshot: undefined,
                studentName: 'Legacy Student',
            };

            render(<SafetySummaryView booking={bookingWithoutChild} onClose={mockOnClose} />);

            expect(screen.getByText('Legacy Student')).toBeInTheDocument();
        });

        it('displays "Not Required" status for non-medical bookings', () => {
            const lowRiskBooking: Booking = {
                ...mockGuestBooking,
                safetyReviewStatus: 'not_required',
            };

            render(<SafetySummaryView booking={lowRiskBooking} onClose={mockOnClose} />);

            expect(screen.getByText('Not Required')).toBeInTheDocument();
        });
    });
});
