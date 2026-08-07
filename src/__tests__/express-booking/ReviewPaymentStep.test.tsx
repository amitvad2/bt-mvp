import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const mockGoToStep = vi.fn();

const holder: { state: any } = {
  state: {},
};

vi.mock('@/app/express-booking/[sessionId]/GuestBookingContext', () => ({
  useGuestBooking: () => ({
    state: holder.state,
    loading: false,
    goToStep: mockGoToStep,
  }),
}));

// Mock Stripe modules to prevent real Stripe loading
vi.mock('@stripe/stripe-js', () => ({
  loadStripe: vi.fn(() => Promise.resolve(null)),
}));

vi.mock('@stripe/react-stripe-js', () => ({
  Elements: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PaymentElement: () => <div data-testid="payment-element" />,
  useStripe: () => null,
  useElements: () => null,
}));

import ReviewPaymentStep from '@/app/express-booking/[sessionId]/steps/ReviewPaymentStep';

describe('ReviewPaymentStep', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    holder.state = {
      sessionId: 'session-123',
      session: {
        id: 'session-123',
        className: 'After School Cooking Club',
        classType: 'kidsAfterSchool',
        date: '2025-09-15',
        startTime: '15:30',
        endTime: '16:30',
        venueName: 'Community Hall',
        ageMin: 5,
        ageMax: 12,
        price: 1500,
        spotsAvailable: 8,
        status: 'open',
      },
      currentStep: 5,
      parentDetails: {
        firstName: 'Sarah',
        lastName: 'Johnson',
        email: 'sarah@example.com',
        telephone: '07700900123',
      },
      childDetails: {
        firstName: 'Oliver',
        lastName: 'Johnson',
        dateOfBirth: '2018-03-10',
      },
      medicalInfo: {
        foodAllergies: false,
        dietaryRequirements: '',
        airborneAllergies: false,
        allergenDetails: '',
        knownReactions: '',
        symptoms: '',
        epipenRequired: false,
        epipenDetails: '',
        medicationDetails: '',
        respiratoryProblems: false,
        medicalConditions: '',
        recentOperations: '',
        visionImpairment: false,
        hearingImpairment: false,
        additionalSupportNeeds: '',
        otherSafetyInfo: '',
      },
      allergyDietaryInfo: {
        foodAllergies: [],
        dietaryRequirements: [],
        airborneAllergies: [],
        allergenDetails: '',
        reactionDetails: '',
        symptoms: '',
      },
      emergencyContact: {
        name: 'Gran Smith',
        relationship: 'Grandmother',
        mobile: '07700900456',
        alternativePhone: '',
        email: 'gran@example.com',
      },
      authorisedCollector: {
        name: 'Sarah Johnson',
        relationship: 'Parent',
        phone: '07700900123',
        sameAsParent: true,
      },
      consents: {
        parentGuardianAuthority: true,
        accuracyOfInformation: true,
        healthSafetyDataProcessing: true,
        emergencyAssistanceAuthorisation: true,
        termsAndCancellationPolicy: true,
        privacyNoticeAcknowledgement: true,
        photographyPromotionalUse: false,
        emailMarketing: false,
        whatsappMarketing: false,
      },
      source: 'website_express',
    };
  });

  it('displays the total amount from session price', () => {
    render(<ReviewPaymentStep />);
    expect(screen.getByText('£15.00')).toBeInTheDocument();
  });

  it('displays the review summary with parent, child, and session details', () => {
    render(<ReviewPaymentStep />);
    // "Sarah Johnson" appears in both parent and authorised collector sections
    expect(screen.getAllByText('Sarah Johnson').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Oliver Johnson')).toBeInTheDocument();
    expect(screen.getByText('After School Cooking Club')).toBeInTheDocument();
    expect(screen.getByText('Community Hall')).toBeInTheDocument();
  });

  it('shows Pay Now button when all gating conditions are met', () => {
    render(<ReviewPaymentStep />);
    expect(screen.getByRole('button', { name: /pay now/i })).toBeInTheDocument();
    // Should NOT show payment blocked message
    expect(screen.queryByText(/payment is not available yet/i)).not.toBeInTheDocument();
  });

  it('blocks payment when parent details are missing', () => {
    holder.state = { ...holder.state, parentDetails: undefined };
    render(<ReviewPaymentStep />);
    expect(screen.getByText(/payment is not available yet/i)).toBeInTheDocument();
    expect(screen.getByText(/parent details are incomplete/i)).toBeInTheDocument();
  });

  it('blocks payment when child details are missing', () => {
    holder.state = { ...holder.state, childDetails: undefined };
    render(<ReviewPaymentStep />);
    expect(screen.getByText(/payment is not available yet/i)).toBeInTheDocument();
    expect(screen.getByText(/child details are incomplete/i)).toBeInTheDocument();
  });

  it('blocks payment when medical info is missing', () => {
    holder.state = { ...holder.state, medicalInfo: undefined };
    render(<ReviewPaymentStep />);
    expect(screen.getByText(/payment is not available yet/i)).toBeInTheDocument();
    expect(screen.getByText(/medical information has not been provided/i)).toBeInTheDocument();
  });

  it('blocks payment when consents are missing', () => {
    holder.state = { ...holder.state, consents: undefined };
    render(<ReviewPaymentStep />);
    expect(screen.getByText(/payment is not available yet/i)).toBeInTheDocument();
    expect(screen.getByText(/consents have not been provided/i)).toBeInTheDocument();
  });

  it('blocks payment when mandatory consents are not all accepted', () => {
    holder.state = {
      ...holder.state,
      consents: {
        ...holder.state.consents,
        termsAndCancellationPolicy: false,
      },
    };
    render(<ReviewPaymentStep />);
    expect(screen.getByText(/payment is not available yet/i)).toBeInTheDocument();
    expect(screen.getByText(/not all mandatory consents have been accepted/i)).toBeInTheDocument();
  });

  it('blocks payment when session is no longer open', () => {
    holder.state = {
      ...holder.state,
      session: { ...holder.state.session, status: 'closed' },
    };
    render(<ReviewPaymentStep />);
    expect(screen.getByText(/payment is not available yet/i)).toBeInTheDocument();
    expect(screen.getByText(/no longer open for bookings/i)).toBeInTheDocument();
  });

  it('blocks payment when session has no spots available', () => {
    holder.state = {
      ...holder.state,
      session: { ...holder.state.session, spotsAvailable: 0 },
    };
    render(<ReviewPaymentStep />);
    expect(screen.getByText(/payment is not available yet/i)).toBeInTheDocument();
    expect(screen.getByText(/fully booked/i)).toBeInTheDocument();
  });

  it('blocks payment when child age is outside eligible range', () => {
    holder.state = {
      ...holder.state,
      childDetails: {
        firstName: 'Oliver',
        lastName: 'Johnson',
        dateOfBirth: '2022-01-01', // age 3 on session date 2025-09-15
      },
    };
    render(<ReviewPaymentStep />);
    expect(screen.getByText(/payment is not available yet/i)).toBeInTheDocument();
    expect(screen.getByText(/age.*outside the eligible range/i)).toBeInTheDocument();
  });

  it('blocks payment when emergency contact is missing', () => {
    holder.state = { ...holder.state, emergencyContact: undefined };
    render(<ReviewPaymentStep />);
    expect(screen.getByText(/payment is not available yet/i)).toBeInTheDocument();
    expect(screen.getByText(/emergency contact details are incomplete/i)).toBeInTheDocument();
  });

  it('blocks payment when authorised collector is missing', () => {
    holder.state = { ...holder.state, authorisedCollector: undefined };
    render(<ReviewPaymentStep />);
    expect(screen.getByText(/payment is not available yet/i)).toBeInTheDocument();
    expect(screen.getByText(/authorised collector details are incomplete/i)).toBeInTheDocument();
  });

  it('provides a "Go back and fix" link in the blocked state', () => {
    holder.state = { ...holder.state, parentDetails: undefined };
    render(<ReviewPaymentStep />);
    expect(screen.getByText(/go back and fix/i)).toBeInTheDocument();
  });

  it('displays consent summary in review section', () => {
    render(<ReviewPaymentStep />);
    expect(screen.getByText('Parent/Guardian Authority')).toBeInTheDocument();
    expect(screen.getByText('Terms & Cancellation')).toBeInTheDocument();
    expect(screen.getByText('Photography Use')).toBeInTheDocument();
  });

  it('displays the security note about Stripe', () => {
    render(<ReviewPaymentStep />);
    expect(
      screen.getByText(/processed securely by Stripe/i)
    ).toBeInTheDocument();
  });
});
