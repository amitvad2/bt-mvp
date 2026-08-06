import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GuestSessionInfo } from '@/types';

const mockGoToStep = vi.fn();
const mockSetParentDetails = vi.fn();
const mockSetChildDetails = vi.fn();

const baseSession: GuestSessionInfo = {
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
};

const holder: {
  session: GuestSessionInfo | undefined;
  parentDetails: any;
  childDetails: any;
} = {
  session: baseSession,
  parentDetails: undefined,
  childDetails: undefined,
};

vi.mock('@/app/express-booking/[sessionId]/GuestBookingContext', () => ({
  useGuestBooking: () => ({
    state: {
      sessionId: 'session-123',
      session: holder.session,
      currentStep: 1,
      parentDetails: holder.parentDetails,
      childDetails: holder.childDetails,
    },
    loading: false,
    goToStep: mockGoToStep,
    setParentDetails: mockSetParentDetails,
    setChildDetails: mockSetChildDetails,
  }),
}));

vi.mock('@/lib/guest-validation', () => ({
  validateChildAge: (dob: string, sessionDate: string, ageMin: number, ageMax: number) => {
    const dobDate = new Date(dob);
    const session = new Date(sessionDate);
    let age = session.getFullYear() - dobDate.getFullYear();
    const monthDiff = session.getMonth() - dobDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && session.getDate() < dobDate.getDate())) {
      age--;
    }
    return age >= ageMin && age <= ageMax;
  },
}));

import ParentChildStep from '@/app/express-booking/[sessionId]/steps/ParentChildStep';

describe('ParentChildStep', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    holder.session = baseSession;
    holder.parentDetails = undefined;
    holder.childDetails = undefined;
  });

  it('renders parent and child form sections', () => {
    render(<ParentChildStep />);
    expect(screen.getByText('Parent / Guardian Details')).toBeInTheDocument();
    expect(screen.getByText('Child Details')).toBeInTheDocument();
  });

  it('renders all required input fields', () => {
    render(<ParentChildStep />);
    // Multiple "First Name" and "Last Name" fields (parent + child)
    expect(screen.getAllByLabelText(/First Name/i)).toHaveLength(2);
    expect(screen.getAllByLabelText(/Last Name/i)).toHaveLength(2);
    expect(screen.getByLabelText(/Phone Number/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Email Address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Date of Birth/i)).toBeInTheDocument();
  });

  it('accepts a child within the age range (age 7 for 5-12 range)', async () => {
    render(<ParentChildStep />);
    const user = userEvent.setup();

    // Set date of birth - child is 7 on session date (2025-09-15)
    const dobInput = screen.getByLabelText(/Date of Birth/i);
    await user.type(dobInput, '2018-03-10');

    // No age error banner should be shown for a valid age
    expect(screen.queryByText(/must be between 5 and 12 years old/i)).not.toBeInTheDocument();
    // Next button should be enabled
    const nextBtn = screen.getByRole('button', { name: /next/i });
    expect(nextBtn).not.toBeDisabled();
  });

  it('rejects a child who is too young (age 3 for 5-12 range)', async () => {
    render(<ParentChildStep />);
    const user = userEvent.setup();

    // Set DOB making child age 3 on session date 2025-09-15
    const dobInput = screen.getByLabelText(/Date of Birth/i);
    await user.type(dobInput, '2022-01-15');

    await waitFor(() => {
      expect(screen.getByText(/must be between 5 and 12 years old/i)).toBeInTheDocument();
    });
  });

  it('rejects a child who is too old (age 14 for 5-12 range)', async () => {
    render(<ParentChildStep />);
    const user = userEvent.setup();

    // Set DOB making child age 14 on session date 2025-09-15
    const dobInput = screen.getByLabelText(/Date of Birth/i);
    await user.type(dobInput, '2011-01-01');

    await waitFor(() => {
      expect(screen.getByText(/must be between 5 and 12 years old/i)).toBeInTheDocument();
    });
  });

  it('disables the Next button when age validation fails', async () => {
    render(<ParentChildStep />);
    const user = userEvent.setup();

    // Set DOB making child too young
    const dobInput = screen.getByLabelText(/Date of Birth/i);
    await user.type(dobInput, '2022-06-01');

    await waitFor(() => {
      const nextBtn = screen.getByRole('button', { name: /next/i });
      expect(nextBtn).toBeDisabled();
    });
  });

  it('navigates back to step 0 when Back is clicked', async () => {
    render(<ParentChildStep />);
    const user = userEvent.setup();

    const backBtn = screen.getByRole('button', { name: /back/i });
    await user.click(backBtn);
    expect(mockGoToStep).toHaveBeenCalledWith(0);
  });

  it('preserves previously entered data from context', () => {
    holder.parentDetails = {
      firstName: 'Sarah',
      lastName: 'Johnson',
      email: 'sarah@example.com',
      telephone: '07700900123',
    };
    holder.childDetails = {
      firstName: 'Oliver',
      lastName: 'Johnson',
      dateOfBirth: '2018-03-10',
    };

    render(<ParentChildStep />);

    const firstNameFields = screen.getAllByLabelText('First Name', { exact: false });
    expect(firstNameFields[0]).toHaveValue('Sarah');
    expect(firstNameFields[1]).toHaveValue('Oliver');
  });

  it('calls setParentDetails and setChildDetails on valid submit', async () => {
    render(<ParentChildStep />);
    const user = userEvent.setup();

    const firstNameFields = screen.getAllByLabelText('First Name', { exact: false });
    const lastNameFields = screen.getAllByLabelText('Last Name', { exact: false });

    await user.type(firstNameFields[0], 'Sarah');
    await user.type(lastNameFields[0], 'Johnson');
    await user.type(screen.getByLabelText(/Email Address/i), 'sarah@example.com');
    await user.type(screen.getByLabelText(/Phone Number/i), '07700900123');
    await user.type(firstNameFields[1], 'Oliver');
    await user.type(lastNameFields[1], 'Johnson');

    const dobInput = screen.getByLabelText(/Date of Birth/i);
    await user.type(dobInput, '2018-03-10');

    const nextBtn = screen.getByRole('button', { name: /next/i });
    await user.click(nextBtn);

    await waitFor(() => {
      expect(mockSetParentDetails).toHaveBeenCalledWith(
        expect.objectContaining({
          firstName: 'Sarah',
          lastName: 'Johnson',
          email: 'sarah@example.com',
          telephone: '07700900123',
        })
      );
      expect(mockSetChildDetails).toHaveBeenCalledWith(
        expect.objectContaining({
          firstName: 'Oliver',
          lastName: 'Johnson',
          dateOfBirth: '2018-03-10',
        })
      );
      expect(mockGoToStep).toHaveBeenCalledWith(2);
    });
  });
});
