import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GuestConsentRecord } from '@/types';

const mockGoToStep = vi.fn();
const mockSetConsents = vi.fn();

const holder: { consents: GuestConsentRecord | undefined } = { consents: undefined };

vi.mock('@/app/express-booking/[sessionId]/GuestBookingContext', () => ({
  useGuestBooking: () => ({
    state: {
      sessionId: 'session-123',
      currentStep: 4,
      consents: holder.consents,
    },
    loading: false,
    goToStep: mockGoToStep,
    setConsents: mockSetConsents,
  }),
}));

import ConsentStep from '@/app/express-booking/[sessionId]/steps/ConsentStep';

describe('ConsentStep', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    holder.consents = undefined;
  });

  it('renders all 6 mandatory consent checkboxes', () => {
    render(<ConsentStep />);
    const checkboxes = screen.getAllByRole('checkbox');
    // 6 mandatory + 3 optional = 9 total
    expect(checkboxes).toHaveLength(9);
  });

  it('renders the required consents section title', () => {
    render(<ConsentStep />);
    expect(screen.getByText('Required Consents')).toBeInTheDocument();
  });

  it('renders the optional consents section title', () => {
    render(<ConsentStep />);
    expect(screen.getByText('Optional Consents')).toBeInTheDocument();
  });

  it('renders mandatory consent labels', () => {
    render(<ConsentStep />);
    expect(screen.getByText(/parent or legal guardian/i)).toBeInTheDocument();
    expect(screen.getByText(/accurate and complete/i)).toBeInTheDocument();
    expect(screen.getByText(/health and safety information/i)).toBeInTheDocument();
    expect(screen.getByText(/emergency medical assistance/i)).toBeInTheDocument();
    expect(screen.getByText(/Terms & Conditions and Cancellation Policy/i)).toBeInTheDocument();
    expect(screen.getByText(/Privacy Notice/i)).toBeInTheDocument();
  });

  it('renders optional consent labels', () => {
    render(<ConsentStep />);
    expect(screen.getByText(/photographs of my child/i)).toBeInTheDocument();
    expect(screen.getByText(/email communications/i)).toBeInTheDocument();
    expect(screen.getByText(/WhatsApp messages/i)).toBeInTheDocument();
  });

  it('all checkboxes are unticked by default (never pre-ticked)', () => {
    render(<ConsentStep />);
    const checkboxes = screen.getAllByRole('checkbox');
    checkboxes.forEach((checkbox) => {
      expect(checkbox).not.toBeChecked();
    });
  });

  it('optional consents are never pre-ticked even when mandatory are provided', () => {
    holder.consents = {
      parentGuardianAuthority: true,
      accuracyOfInformation: true,
      healthSafetyDataProcessing: true,
      emergencyAssistanceAuthorisation: true,
      termsAndCancellationPolicy: true,
      privacyNoticeAcknowledgement: true,
      photographyPromotionalUse: false,
      emailMarketing: false,
      whatsappMarketing: false,
    };
    render(<ConsentStep />);
    // Find optional checkboxes — they should remain unchecked
    const photographyText = screen.getByText(/photographs of my child/i);
    const photographyCheckbox = photographyText.closest('label')?.querySelector('input[type="checkbox"]');
    expect(photographyCheckbox).not.toBeChecked();
  });

  it('prevents progression when any mandatory consent is unchecked', async () => {
    render(<ConsentStep />);
    const continueBtn = screen.getByRole('button', { name: /continue/i });
    await userEvent.click(continueBtn);

    // Should show error message
    expect(screen.getByText(/accept all required consents/i)).toBeInTheDocument();
    // Should NOT call goToStep
    expect(mockGoToStep).not.toHaveBeenCalled();
  });

  it('shows error banner when trying to continue with partial mandatory consents', async () => {
    render(<ConsentStep />);
    // Check only first checkbox
    const checkboxes = screen.getAllByRole('checkbox');
    await userEvent.click(checkboxes[0]);

    const continueBtn = screen.getByRole('button', { name: /continue/i });
    await userEvent.click(continueBtn);

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(mockGoToStep).not.toHaveBeenCalled();
  });

  it('allows progression when all mandatory consents are accepted', async () => {
    render(<ConsentStep />);
    const checkboxes = screen.getAllByRole('checkbox');

    // Check all 6 mandatory consent checkboxes
    for (let i = 0; i < 6; i++) {
      await userEvent.click(checkboxes[i]);
    }

    const continueBtn = screen.getByRole('button', { name: /continue/i });
    await userEvent.click(continueBtn);

    expect(mockSetConsents).toHaveBeenCalledWith(
      expect.objectContaining({
        parentGuardianAuthority: true,
        accuracyOfInformation: true,
        healthSafetyDataProcessing: true,
        emergencyAssistanceAuthorisation: true,
        termsAndCancellationPolicy: true,
        privacyNoticeAcknowledgement: true,
      })
    );
    expect(mockGoToStep).toHaveBeenCalledWith(5);
  });

  it('allows progression with mandatory accepted and optional unchecked', async () => {
    render(<ConsentStep />);
    const checkboxes = screen.getAllByRole('checkbox');

    // Check only the 6 mandatory checkboxes, leave optional unticked
    for (let i = 0; i < 6; i++) {
      await userEvent.click(checkboxes[i]);
    }

    const continueBtn = screen.getByRole('button', { name: /continue/i });
    await userEvent.click(continueBtn);

    expect(mockSetConsents).toHaveBeenCalledWith(
      expect.objectContaining({
        photographyPromotionalUse: false,
        emailMarketing: false,
        whatsappMarketing: false,
      })
    );
    expect(mockGoToStep).toHaveBeenCalledWith(5);
  });

  it('can toggle optional consents independently', async () => {
    render(<ConsentStep />);
    const checkboxes = screen.getAllByRole('checkbox');

    // Check all mandatory
    for (let i = 0; i < 6; i++) {
      await userEvent.click(checkboxes[i]);
    }
    // Check first optional (photography)
    await userEvent.click(checkboxes[6]);

    const continueBtn = screen.getByRole('button', { name: /continue/i });
    await userEvent.click(continueBtn);

    expect(mockSetConsents).toHaveBeenCalledWith(
      expect.objectContaining({
        photographyPromotionalUse: true,
        emailMarketing: false,
        whatsappMarketing: false,
      })
    );
  });

  it('navigates back to step 3 (Emergency Contact) when Back is clicked', async () => {
    render(<ConsentStep />);
    const backBtn = screen.getByRole('button', { name: /back/i });
    await userEvent.click(backBtn);
    expect(mockGoToStep).toHaveBeenCalledWith(3);
  });

  it('persists consent state when navigating back', async () => {
    render(<ConsentStep />);
    const checkboxes = screen.getAllByRole('checkbox');
    // Toggle one checkbox
    await userEvent.click(checkboxes[0]);

    const backBtn = screen.getByRole('button', { name: /back/i });
    await userEvent.click(backBtn);

    expect(mockSetConsents).toHaveBeenCalledWith(
      expect.objectContaining({
        parentGuardianAuthority: true,
      })
    );
  });

  it('restores previously saved consent state from context', () => {
    holder.consents = {
      parentGuardianAuthority: true,
      accuracyOfInformation: true,
      healthSafetyDataProcessing: false,
      emergencyAssistanceAuthorisation: false,
      termsAndCancellationPolicy: false,
      privacyNoticeAcknowledgement: false,
      photographyPromotionalUse: true,
      emailMarketing: false,
      whatsappMarketing: false,
    };
    render(<ConsentStep />);
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes[0]).toBeChecked(); // parentGuardianAuthority
    expect(checkboxes[1]).toBeChecked(); // accuracyOfInformation
    expect(checkboxes[2]).not.toBeChecked(); // healthSafetyDataProcessing
    expect(checkboxes[6]).toBeChecked(); // photographyPromotionalUse
  });

  it('displays "Optional" tags for optional consent items', () => {
    render(<ConsentStep />);
    const optionalTags = screen.getAllByText('Optional');
    expect(optionalTags).toHaveLength(3);
  });

  it('clears error banner when a checkbox is toggled', async () => {
    render(<ConsentStep />);
    // Try to continue without mandatory consents → error
    const continueBtn = screen.getByRole('button', { name: /continue/i });
    await userEvent.click(continueBtn);
    expect(screen.getByRole('alert')).toBeInTheDocument();

    // Toggle a checkbox → error should disappear
    const checkboxes = screen.getAllByRole('checkbox');
    await userEvent.click(checkboxes[0]);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
