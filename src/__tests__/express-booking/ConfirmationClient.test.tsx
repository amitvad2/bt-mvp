import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import ConfirmationClient from '@/app/express-booking/[sessionId]/confirmation/ConfirmationClient';

/**
 * Unit tests for ConfirmationClient component.
 *
 * Validates:
 * - GUEST-FR-010 (10.2, 10.6, 10.7, 10.8): Confirmation page states and display
 * - GUEST-SEC-004 (25.3, 25.4): No medical/allergy/emergency data displayed
 */

// --- Mocks ---

const mockSessionStorage: Record<string, string> = {};

const sessionStorageMock = {
  getItem: vi.fn((key: string) => mockSessionStorage[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    mockSessionStorage[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    delete mockSessionStorage[key];
  }),
  clear: vi.fn(() => {
    Object.keys(mockSessionStorage).forEach((key) => delete mockSessionStorage[key]);
  }),
  get length() {
    return Object.keys(mockSessionStorage).length;
  },
  key: vi.fn((index: number) => Object.keys(mockSessionStorage)[index] ?? null),
};

const confirmedResponse = {
  status: 'confirmed',
  reference: 'abc12345',
  childFirstName: 'Emma',
  className: 'After School Cooking Club',
  date: '2025-04-10',
  startTime: '15:30',
  endTime: '16:30',
  venueName: 'Community Hall',
  amountPaid: 1500,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();

  // Reset sessionStorage mock state
  Object.keys(mockSessionStorage).forEach((key) => delete mockSessionStorage[key]);

  // Set default sessionStorage values for most tests
  mockSessionStorage['guest_paymentIntentId'] = 'pi_test_abc123';
  mockSessionStorage['guest_sessionId'] = 'session-456';

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

describe('ConfirmationClient', () => {
  describe('pending state', () => {
    it('displays waiting message when booking is still pending', async () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'pending' }), { status: 200 })
      );

      await act(async () => {
        render(<ConfirmationClient sessionId="session-456" />);
      });

      // Allow microtask for initial poll
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

    it('displays loading/spinner state initially before first poll response', async () => {
      const fetchMock = vi.mocked(fetch);
      // Never resolve — keeps component in loading state
      fetchMock.mockReturnValueOnce(new Promise(() => {}));

      await act(async () => {
        render(<ConfirmationClient sessionId="session-456" />);
      });

      // The component starts in 'loading' which renders the same pending UI
      expect(
        screen.getByText('Payment received. We are finalising your booking.')
      ).toBeInTheDocument();
    });
  });

  describe('confirmed state', () => {
    it('displays booking summary when booking is confirmed', async () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify(confirmedResponse), { status: 200 })
      );

      await act(async () => {
        render(<ConfirmationClient sessionId="session-456" />);
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(screen.getByText('Booking Confirmed!')).toBeInTheDocument();
      expect(screen.getByText('ABC12345')).toBeInTheDocument();
      expect(screen.getByText(/Emma/)).toBeInTheDocument();
      expect(screen.getByText('After School Cooking Club')).toBeInTheDocument();
      expect(screen.getByText('Community Hall')).toBeInTheDocument();
      expect(screen.getByText(/15:30/)).toBeInTheDocument();
      expect(screen.getByText(/16:30/)).toBeInTheDocument();
      expect(screen.getByText('£15.00')).toBeInTheDocument();
    });

    it('displays safety information received message', async () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify(confirmedResponse), { status: 200 })
      );

      await act(async () => {
        render(<ConfirmationClient sessionId="session-456" />);
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
    it('never renders medical, allergy, or emergency contact details in confirmed state', async () => {
      // Simulate a response that might accidentally include sensitive data
      const responseWithSensitiveFields = {
        ...confirmedResponse,
        // These fields should NOT be rendered even if present in response
        medicalConditions: 'Severe asthma',
        allergyDetails: 'Peanut allergy - anaphylaxis risk',
        emergencyContactName: 'John Smith',
        emergencyContactPhone: '07700900000',
        epipenRequired: true,
      };

      const fetchMock = vi.mocked(fetch);
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify(responseWithSensitiveFields), { status: 200 })
      );

      await act(async () => {
        render(<ConfirmationClient sessionId="session-456" />);
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      // Verify none of the sensitive fields appear in the rendered output
      expect(screen.queryByText(/Severe asthma/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Peanut allergy/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/anaphylaxis/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/John Smith/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/07700900000/)).not.toBeInTheDocument();
      expect(screen.queryByText(/epipen/i)).not.toBeInTheDocument();
    });

    it('only displays non-sensitive summary fields as per GUEST-SEC-004 AC 25.3', async () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify(confirmedResponse), { status: 200 })
      );

      await act(async () => {
        render(<ConfirmationClient sessionId="session-456" />);
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      // Only these non-sensitive fields should be rendered
      expect(screen.getByText('ABC12345')).toBeInTheDocument(); // reference
      expect(screen.getByText(/Emma/)).toBeInTheDocument(); // childFirstName
      expect(screen.getByText('After School Cooking Club')).toBeInTheDocument(); // className
      expect(screen.getByText('Community Hall')).toBeInTheDocument(); // venueName
      expect(screen.getByText('£15.00')).toBeInTheDocument(); // amountPaid

      // Ensure no medical-related headings or sections exist
      expect(screen.queryByText(/medical/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/allerg/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/emergency contact/i)).not.toBeInTheDocument();
    });
  });

  describe('sessionStorage cleared on confirmation display', () => {
    it('clears guest sessionStorage keys when booking is confirmed', async () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify(confirmedResponse), { status: 200 })
      );

      await act(async () => {
        render(<ConfirmationClient sessionId="session-456" />);
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      // Verify sessionStorage.removeItem was called for all guest keys
      expect(sessionStorageMock.removeItem).toHaveBeenCalledWith('guest_paymentIntentId');
      expect(sessionStorageMock.removeItem).toHaveBeenCalledWith('guest_sessionId');
      expect(sessionStorageMock.removeItem).toHaveBeenCalledWith('guest_booking_session-456');
    });

    it('does NOT clear sessionStorage when booking is still pending', async () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'pending' }), { status: 200 })
      );

      await act(async () => {
        render(<ConfirmationClient sessionId="session-456" />);
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      // removeItem should NOT have been called (only getItem for reading)
      expect(sessionStorageMock.removeItem).not.toHaveBeenCalled();
    });
  });

  describe('no-data state', () => {
    it('displays "No Booking Found" when sessionStorage has no payment data', async () => {
      // Clear the session storage so no PI or session is available
      delete mockSessionStorage['guest_paymentIntentId'];
      delete mockSessionStorage['guest_sessionId'];

      await act(async () => {
        render(<ConfirmationClient sessionId="session-456" />);
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(screen.getByText('No Booking Found')).toBeInTheDocument();
    });
  });
});
