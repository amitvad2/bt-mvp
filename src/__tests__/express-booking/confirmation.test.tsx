import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import ConfirmationClient from '@/app/express-booking/[sessionId]/confirmation/ConfirmationClient';

/**
 * Unit tests for the guest express checkout confirmation page.
 *
 * Validates:
 * - GUEST-FR-010: Confirmation page states, polling, and display
 * - GUEST-SEC-004: No medical/allergy/emergency data exposed to client
 */

// --- sessionStorage mock ---

const mockStorage: Record<string, string> = {};

const sessionStorageMock = {
  getItem: vi.fn((key: string) => mockStorage[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    mockStorage[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    delete mockStorage[key];
  }),
  clear: vi.fn(() => {
    Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
  }),
  get length() {
    return Object.keys(mockStorage).length;
  },
  key: vi.fn((index: number) => Object.keys(mockStorage)[index] ?? null),
};

// --- Test data ---

const confirmedBookingResponse = {
  status: 'confirmed',
  reference: 'ref12345',
  childFirstName: 'Olivia',
  className: 'After School Cooking Club',
  date: '2025-06-15',
  startTime: '15:30',
  endTime: '16:30',
  venueName: 'Sunnydale Community Hall',
  amountPaid: 2500,
};

const pendingResponse = { status: 'pending' };

// --- Setup / Teardown ---

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();

  // Reset mock storage
  Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);

  // Default: valid sessionStorage values
  mockStorage['guest_paymentIntentId'] = 'pi_test_xyz789';
  mockStorage['guest_sessionId'] = 'sess-001';

  Object.defineProperty(window, 'sessionStorage', {
    value: sessionStorageMock,
    writable: true,
  });

  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// --- Tests ---

describe('ConfirmationClient — confirmation.test.tsx', () => {
  describe('pending state displays waiting message (GUEST-FR-010 AC 10.8)', () => {
    it('shows "Payment received. We are finalising your booking." while polling returns pending', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify(pendingResponse), { status: 200 })
      );

      await act(async () => {
        render(<ConfirmationClient sessionId="sess-001" />);
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(
        screen.getByText('Payment received. We are finalising your booking.')
      ).toBeInTheDocument();
      expect(
        screen.getByText(/This usually takes a few seconds/i)
      ).toBeInTheDocument();
    });

    it('shows the same waiting message during initial loading before first poll completes', async () => {
      // fetch never resolves — component stays in loading state
      vi.mocked(fetch).mockReturnValueOnce(new Promise(() => {}));

      await act(async () => {
        render(<ConfirmationClient sessionId="sess-001" />);
      });

      expect(
        screen.getByText('Payment received. We are finalising your booking.')
      ).toBeInTheDocument();
    });
  });

  describe('confirmed state displays booking summary (GUEST-FR-010 AC 10.6)', () => {
    it('renders booking reference, child name, class, date, time, venue, and amount', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify(confirmedBookingResponse), { status: 200 })
      );

      await act(async () => {
        render(<ConfirmationClient sessionId="sess-001" />);
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      // Heading
      expect(screen.getByText('Booking Confirmed!')).toBeInTheDocument();

      // Booking reference (displayed uppercased)
      expect(screen.getByText('REF12345')).toBeInTheDocument();

      // Child first name in the thank-you message
      expect(screen.getByText(/Olivia/)).toBeInTheDocument();

      // Class name
      expect(screen.getByText('After School Cooking Club')).toBeInTheDocument();

      // Time range
      expect(screen.getByText(/15:30/)).toBeInTheDocument();
      expect(screen.getByText(/16:30/)).toBeInTheDocument();

      // Venue
      expect(screen.getByText('Sunnydale Community Hall')).toBeInTheDocument();

      // Amount formatted from pence to pounds
      expect(screen.getByText('£25.00')).toBeInTheDocument();
    });

    it('displays "Your safety information has been received." message', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify(confirmedBookingResponse), { status: 200 })
      );

      await act(async () => {
        render(<ConfirmationClient sessionId="sess-001" />);
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(
        screen.getByText('Your safety information has been received.')
      ).toBeInTheDocument();
    });
  });

  describe('no medical data displayed (GUEST-SEC-004)', () => {
    it('does not render medical, allergy, or emergency details even if present in API response', async () => {
      const responseWithLeakedSensitiveFields = {
        ...confirmedBookingResponse,
        // These fields should never be rendered on the confirmation page
        medicalConditions: 'Type 1 diabetes, epilepsy',
        allergyDetails: 'Severe nut allergy - carries EpiPen',
        emergencyContactName: 'Sarah Williams',
        emergencyContactPhone: '07712345678',
        epipenRequired: true,
        dietaryRequirements: 'Gluten-free, dairy-free',
      };

      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify(responseWithLeakedSensitiveFields), { status: 200 })
      );

      await act(async () => {
        render(<ConfirmationClient sessionId="sess-001" />);
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      // Verify sensitive medical data is NOT in the DOM
      expect(screen.queryByText(/Type 1 diabetes/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/epilepsy/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/nut allergy/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/EpiPen/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Sarah Williams/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/07712345678/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Gluten-free/i)).not.toBeInTheDocument();

      // Verify no medical/allergy-related headings exist
      expect(screen.queryByText(/medical/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/allerg/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/emergency contact/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/dietary/i)).not.toBeInTheDocument();
    });

    it('only shows the allowed non-sensitive fields per GUEST-SEC-004 AC 25.3', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify(confirmedBookingResponse), { status: 200 })
      );

      await act(async () => {
        render(<ConfirmationClient sessionId="sess-001" />);
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      // These are the ONLY data fields that should be visible
      expect(screen.getByText('REF12345')).toBeInTheDocument();
      expect(screen.getByText(/Olivia/)).toBeInTheDocument();
      expect(screen.getByText('After School Cooking Club')).toBeInTheDocument();
      expect(screen.getByText('Sunnydale Community Hall')).toBeInTheDocument();
      expect(screen.getByText('£25.00')).toBeInTheDocument();
    });
  });

  describe('sessionStorage cleared on confirmation display', () => {
    it('removes guest_paymentIntentId, guest_sessionId, and wizard state on confirmed', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify(confirmedBookingResponse), { status: 200 })
      );

      await act(async () => {
        render(<ConfirmationClient sessionId="sess-001" />);
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(sessionStorageMock.removeItem).toHaveBeenCalledWith('guest_paymentIntentId');
      expect(sessionStorageMock.removeItem).toHaveBeenCalledWith('guest_sessionId');
      expect(sessionStorageMock.removeItem).toHaveBeenCalledWith('guest_booking_sess-001');
    });

    it('does NOT clear sessionStorage while status is still pending', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify(pendingResponse), { status: 200 })
      );

      await act(async () => {
        render(<ConfirmationClient sessionId="sess-001" />);
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(sessionStorageMock.removeItem).not.toHaveBeenCalled();
    });

    it('does NOT clear sessionStorage on error response', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'Server error' }), { status: 500 })
      );

      await act(async () => {
        render(<ConfirmationClient sessionId="sess-001" />);
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(sessionStorageMock.removeItem).not.toHaveBeenCalled();
    });
  });
});
