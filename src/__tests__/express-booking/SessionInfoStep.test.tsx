import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GuestSessionInfo } from '@/types';

const mockGoToStep = vi.fn();

const baseSession: GuestSessionInfo = {
  id: 'session-123',
  className: 'After School Cooking Club',
  classType: 'kidsAfterSchool',
  date: '2025-03-15',
  startTime: '15:30',
  endTime: '16:30',
  venueName: 'Community Hall',
  ageMin: 5,
  ageMax: 12,
  price: 1500,
  spotsAvailable: 8,
  status: 'open',
};

// Use a mutable holder so tests can swap session data
const holder: { session: GuestSessionInfo | undefined } = { session: baseSession };

vi.mock('@/app/express-booking/[sessionId]/GuestBookingContext', () => ({
  useGuestBooking: () => ({
    state: {
      sessionId: 'session-123',
      session: holder.session,
      currentStep: 0,
    },
    loading: false,
    goToStep: mockGoToStep,
  }),
}));

import SessionInfoStep from '@/app/express-booking/[sessionId]/steps/SessionInfoStep';

describe('SessionInfoStep', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    holder.session = baseSession;
  });

  it('displays the class name and type', () => {
    render(<SessionInfoStep />);
    expect(screen.getByText('After School Cooking Club')).toBeInTheDocument();
    expect(screen.getByText('kidsAfterSchool')).toBeInTheDocument();
  });

  it('displays the "No account required" message prominently', () => {
    render(<SessionInfoStep />);
    expect(screen.getByText('No account required — book in minutes')).toBeInTheDocument();
  });

  it('displays the Express Booking badge', () => {
    render(<SessionInfoStep />);
    expect(screen.getByText('Express Booking')).toBeInTheDocument();
  });

  it('displays the session date formatted in en-GB locale', () => {
    render(<SessionInfoStep />);
    expect(screen.getByText(/Saturday, 15 March 2025/i)).toBeInTheDocument();
  });

  it('displays the session time range', () => {
    render(<SessionInfoStep />);
    expect(screen.getByText(/15:30/)).toBeInTheDocument();
    expect(screen.getByText(/16:30/)).toBeInTheDocument();
  });

  it('displays the venue name', () => {
    render(<SessionInfoStep />);
    expect(screen.getByText('Community Hall')).toBeInTheDocument();
  });

  it('displays the age range', () => {
    render(<SessionInfoStep />);
    expect(screen.getByText(/5–12 years/)).toBeInTheDocument();
  });

  it('displays the price formatted in pounds', () => {
    render(<SessionInfoStep />);
    expect(screen.getByText(/£15\.00/)).toBeInTheDocument();
  });

  it('displays the availability with correct plural', () => {
    render(<SessionInfoStep />);
    expect(screen.getByText(/8\s*spots\s*remaining/)).toBeInTheDocument();
  });

  it('displays singular "spot" when only 1 spot available', () => {
    holder.session = { ...baseSession, spotsAvailable: 1 };
    render(<SessionInfoStep />);
    expect(screen.getByText(/1\s*spot\s*remaining/)).toBeInTheDocument();
  });

  it('has a Continue button that advances to step 1', async () => {
    render(<SessionInfoStep />);
    const continueBtn = screen.getByRole('button', { name: /continue/i });
    expect(continueBtn).toBeInTheDocument();
    await userEvent.click(continueBtn);
    expect(mockGoToStep).toHaveBeenCalledWith(1);
  });
});
