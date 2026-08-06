import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockGoToStep = vi.fn();
const mockSetEmergencyContact = vi.fn();
const mockSetAuthorisedCollector = vi.fn();

const holder: {
  parentDetails: any;
  emergencyContact: any;
  authorisedCollector: any;
} = {
  parentDetails: {
    firstName: 'Sarah',
    lastName: 'Johnson',
    email: 'sarah@example.com',
    telephone: '07700900123',
  },
  emergencyContact: undefined,
  authorisedCollector: undefined,
};

vi.mock('@/app/express-booking/[sessionId]/GuestBookingContext', () => ({
  useGuestBooking: () => ({
    state: {
      sessionId: 'session-123',
      currentStep: 3,
      parentDetails: holder.parentDetails,
      emergencyContact: holder.emergencyContact,
      authorisedCollector: holder.authorisedCollector,
    },
    loading: false,
    goToStep: mockGoToStep,
    setEmergencyContact: mockSetEmergencyContact,
    setAuthorisedCollector: mockSetAuthorisedCollector,
  }),
}));

import EmergencyContactStep from '@/app/express-booking/[sessionId]/steps/EmergencyContactStep';

describe('EmergencyContactStep', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    holder.parentDetails = {
      firstName: 'Sarah',
      lastName: 'Johnson',
      email: 'sarah@example.com',
      telephone: '07700900123',
    };
    holder.emergencyContact = undefined;
    holder.authorisedCollector = undefined;
  });

  it('renders emergency contact and authorised collector sections', () => {
    render(<EmergencyContactStep />);
    expect(screen.getByText('Emergency Contact')).toBeInTheDocument();
    expect(screen.getByText('Authorised Collector')).toBeInTheDocument();
  });

  it('renders the same-as-parent checkbox', () => {
    render(<EmergencyContactStep />);
    expect(
      screen.getByLabelText(/same as parent/i)
    ).toBeInTheDocument();
  });

  it('auto-fills collector fields when same-as-parent is checked', async () => {
    render(<EmergencyContactStep />);
    const user = userEvent.setup();

    const sameAsParentCheckbox = screen.getByLabelText(/same as parent/i);
    await user.click(sameAsParentCheckbox);

    await waitFor(() => {
      const collectorNameInput = screen.getByLabelText(/Collector Name/i);
      expect(collectorNameInput).toHaveValue('Sarah Johnson');
    });

    const collectorPhoneInput = screen.getByLabelText(/Phone Number/i, {
      selector: '#collectorPhone',
    });
    expect(collectorPhoneInput).toHaveValue('07700900123');

    const collectorRelationInput = screen.getByLabelText(/Relationship to Child/i, {
      selector: '#collectorRelationship',
    });
    expect(collectorRelationInput).toHaveValue('Parent');
  });

  it('makes collector fields read-only when same-as-parent is checked', async () => {
    render(<EmergencyContactStep />);
    const user = userEvent.setup();

    const sameAsParentCheckbox = screen.getByLabelText(/same as parent/i);
    await user.click(sameAsParentCheckbox);

    await waitFor(() => {
      const collectorNameInput = screen.getByLabelText(/Collector Name/i);
      expect(collectorNameInput).toHaveAttribute('readonly');
    });
  });

  it('clears auto-fill when same-as-parent is unchecked', async () => {
    render(<EmergencyContactStep />);
    const user = userEvent.setup();

    const sameAsParentCheckbox = screen.getByLabelText(/same as parent/i);
    // Check then uncheck
    await user.click(sameAsParentCheckbox);
    await waitFor(() => {
      expect(screen.getByLabelText(/Collector Name/i)).toHaveValue('Sarah Johnson');
    });

    await user.click(sameAsParentCheckbox);

    await waitFor(() => {
      const collectorNameInput = screen.getByLabelText(/Collector Name/i);
      expect(collectorNameInput).not.toHaveAttribute('readonly');
    });
  });

  it('saves collector as sameAsParent=true with parent data on submit', async () => {
    render(<EmergencyContactStep />);
    const user = userEvent.setup();

    // Fill emergency contact details
    await user.type(screen.getByLabelText(/Contact Name/i), 'Gran Smith');
    const relationFields = screen.getAllByLabelText(/Relationship to Child/i);
    await user.type(relationFields[0], 'Grandmother');
    await user.type(screen.getByLabelText(/Mobile Phone/i), '07700900456');
    await user.type(screen.getByLabelText(/Email Address/i), 'gran@example.com');

    // Check same-as-parent
    const sameAsParentCheckbox = screen.getByLabelText(/same as parent/i);
    await user.click(sameAsParentCheckbox);

    // Wait for auto-fill
    await waitFor(() => {
      expect(screen.getByLabelText(/Collector Name/i)).toHaveValue('Sarah Johnson');
    });

    // Submit
    const continueBtn = screen.getByRole('button', { name: /continue/i });
    await user.click(continueBtn);

    await waitFor(() => {
      expect(mockSetAuthorisedCollector).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Sarah Johnson',
          relationship: 'Parent',
          phone: '07700900123',
          sameAsParent: true,
        })
      );
      expect(mockGoToStep).toHaveBeenCalledWith(4);
    });
  });

  it('navigates back to step 2 when Back is clicked', async () => {
    render(<EmergencyContactStep />);
    const user = userEvent.setup();

    const backBtn = screen.getByRole('button', { name: /back/i });
    await user.click(backBtn);
    expect(mockGoToStep).toHaveBeenCalledWith(2);
  });

  it('preserves previously entered data from context', () => {
    holder.emergencyContact = {
      name: 'Gran Smith',
      relationship: 'Grandmother',
      mobile: '07700900456',
      alternativePhone: '',
      email: 'gran@example.com',
    };
    holder.authorisedCollector = {
      name: 'Sarah Johnson',
      relationship: 'Parent',
      phone: '07700900123',
      sameAsParent: true,
    };

    render(<EmergencyContactStep />);
    expect(screen.getByLabelText(/Contact Name/i)).toHaveValue('Gran Smith');
    expect(screen.getByLabelText(/Collector Name/i)).toHaveValue('Sarah Johnson');
  });
});
