/**
 * Unit tests for admin bookings page — source attribution badges and filtering.
 *
 * Tests that each BookingSource renders the correct badge label and that the
 * source filter dropdown correctly filters the bookings list.
 *
 * Requirements: 8.5, 8.6, 17.1, 17.2
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { User } from 'firebase/auth';
import type { Booking, BookingSource } from '@/types';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const { mockGetDocs, mockDeleteDoc } = vi.hoisted(() => ({
  mockGetDocs: vi.fn(),
  mockDeleteDoc: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  query: vi.fn(),
  getDocs: mockGetDocs,
  orderBy: vi.fn(),
  deleteDoc: mockDeleteDoc,
  doc: vi.fn(() => 'mock-doc-ref'),
}));

vi.mock('@/lib/firebase', () => ({ db: {} }));

vi.mock('@/context/AuthContext', () => ({
  useAuth: vi.fn(() => ({
    user: { uid: 'admin-1' } as User,
    btUser: { role: 'admin', firstName: 'Admin' },
    loading: false,
    logOut: vi.fn(),
  })),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/admin/bookings',
}));

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

import AdminBookings from '@/app/admin/bookings/page';

// ─── Test Helpers ─────────────────────────────────────────────────────────────

function makeBookingDoc(overrides: Partial<Booking> & { id: string }) {
  const base: Record<string, unknown> = {
    sessionId: 'session_001',
    className: 'Kids After School Cooking',
    venueName: 'Blooming Kitchen HQ',
    sessionDate: '2025-07-21',
    bookedByUid: 'user_001',
    bookedByName: 'John Doe',
    studentName: 'Alice Doe',
    status: 'confirmed',
    bookingMode: 'account',
    bookingSource: 'website',
    payment: { amount: 1500, currency: 'gbp', status: 'paid' },
    createdAt: { toDate: () => new Date('2025-07-20') },
    ...overrides,
  };

  return {
    id: overrides.id,
    data: () => base,
  };
}

/** Create a set of bookings covering each source */
function makeSourceBookingDocs() {
  return [
    makeBookingDoc({
      id: 'pi_whatsapp_001',
      bookingSource: 'whatsapp_express',
      studentName: 'WhatsApp Student',
      acquisition: {
        bookingSource: 'whatsapp_express',
        campaign: { source: 'wa', medium: 'social', campaign: 'summer-promo' },
        socialBookingSessionId: 'sbs_001',
      },
    }),
    makeBookingDoc({
      id: 'pi_instagram_001',
      bookingSource: 'instagram_express',
      studentName: 'Instagram Student',
    }),
    makeBookingDoc({
      id: 'pi_messenger_001',
      bookingSource: 'facebook_express',
      studentName: 'Messenger Student',
    }),
    makeBookingDoc({
      id: 'pi_website_001',
      bookingSource: 'website',
      studentName: 'Website Student',
    }),
    makeBookingDoc({
      id: 'pi_website_guest_001',
      bookingSource: 'website_express',
      studentName: 'Website Guest Student',
      bookingMode: 'guest',
      bookedByUid: null,
      guestContact: { firstName: 'Guest', lastName: 'Parent', email: 'guest@test.com', phone: '07777000000' },
      childSnapshot: { firstName: 'Website Guest', lastName: 'Student' },
    }),
  ];
}

// ─── Tests: Source Badge Labels ───────────────────────────────────────────────

describe('Admin Bookings - Source Badges', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('1. renders "WhatsApp" badge for bookingSource whatsapp_express', async () => {
    mockGetDocs.mockResolvedValueOnce({
      docs: [makeBookingDoc({ id: 'pi_wa_001', bookingSource: 'whatsapp_express' })],
    });
    render(<AdminBookings />);

    await waitFor(() => {
      expect(screen.getByText('WhatsApp')).toBeInTheDocument();
    });
  });

  test('2. renders "Instagram" badge for bookingSource instagram_express', async () => {
    mockGetDocs.mockResolvedValueOnce({
      docs: [makeBookingDoc({ id: 'pi_ig_001', bookingSource: 'instagram_express' })],
    });
    render(<AdminBookings />);

    await waitFor(() => {
      expect(screen.getByText('Instagram')).toBeInTheDocument();
    });
  });

  test('3. renders "Messenger" badge for bookingSource facebook_express', async () => {
    mockGetDocs.mockResolvedValueOnce({
      docs: [makeBookingDoc({ id: 'pi_fb_001', bookingSource: 'facebook_express' })],
    });
    render(<AdminBookings />);

    await waitFor(() => {
      expect(screen.getByText('Messenger')).toBeInTheDocument();
    });
  });

  test('4. renders "Website" badge for bookingSource website', async () => {
    mockGetDocs.mockResolvedValueOnce({
      docs: [makeBookingDoc({ id: 'pi_web_001', bookingSource: 'website' })],
    });
    render(<AdminBookings />);

    await waitFor(() => {
      expect(screen.getByText('Website')).toBeInTheDocument();
    });
  });

  test('5. renders "Website (Guest)" badge for bookingSource website_express', async () => {
    mockGetDocs.mockResolvedValueOnce({
      docs: [makeBookingDoc({ id: 'pi_wg_001', bookingSource: 'website_express' })],
    });
    render(<AdminBookings />);

    await waitFor(() => {
      expect(screen.getByText('Website (Guest)')).toBeInTheDocument();
    });
  });
});

// ─── Tests: Source Filtering ──────────────────────────────────────────────────

describe('Admin Bookings - Source Filtering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('6. filtering by whatsapp_express shows only WhatsApp bookings', async () => {
    mockGetDocs.mockResolvedValueOnce({ docs: makeSourceBookingDocs() });
    const user = userEvent.setup();
    render(<AdminBookings />);

    // Wait for bookings to load
    await waitFor(() => {
      expect(screen.getByText('WhatsApp Student')).toBeInTheDocument();
    });

    // Select WhatsApp source filter
    const sourceSelect = screen.getAllByRole('combobox').find(
      (el) => el.querySelector('option[value="whatsapp_express"]')
    ) as HTMLSelectElement;
    expect(sourceSelect).toBeDefined();

    await user.selectOptions(sourceSelect, 'whatsapp_express');

    // Only WhatsApp booking should be visible
    expect(screen.getByText('WhatsApp Student')).toBeInTheDocument();
    expect(screen.queryByText('Instagram Student')).not.toBeInTheDocument();
    expect(screen.queryByText('Messenger Student')).not.toBeInTheDocument();
    expect(screen.queryByText('Website Student')).not.toBeInTheDocument();
    expect(screen.queryByText('Website Guest Student')).not.toBeInTheDocument();
  });

  test('7. filtering by "all" shows all bookings', async () => {
    mockGetDocs.mockResolvedValueOnce({ docs: makeSourceBookingDocs() });
    const user = userEvent.setup();
    render(<AdminBookings />);

    // Wait for bookings to load
    await waitFor(() => {
      expect(screen.getByText('WhatsApp Student')).toBeInTheDocument();
    });

    // First filter to a specific source
    const sourceSelect = screen.getAllByRole('combobox').find(
      (el) => el.querySelector('option[value="whatsapp_express"]')
    ) as HTMLSelectElement;
    expect(sourceSelect).toBeDefined();

    await user.selectOptions(sourceSelect, 'whatsapp_express');

    // Confirm it filtered
    expect(screen.queryByText('Instagram Student')).not.toBeInTheDocument();

    // Now switch back to "All Sources"
    await user.selectOptions(sourceSelect, 'all');

    // All bookings should be visible again
    expect(screen.getByText('WhatsApp Student')).toBeInTheDocument();
    expect(screen.getByText('Instagram Student')).toBeInTheDocument();
    expect(screen.getByText('Messenger Student')).toBeInTheDocument();
    expect(screen.getByText('Website Student')).toBeInTheDocument();
  });

  test('8. campaign name is displayed when booking has acquisition.campaign.campaign', async () => {
    mockGetDocs.mockResolvedValueOnce({
      docs: [
        makeBookingDoc({
          id: 'pi_campaign_001',
          bookingSource: 'whatsapp_express',
          acquisition: {
            bookingSource: 'whatsapp_express',
            campaign: { source: 'wa', medium: 'social', campaign: 'summer-promo' },
            socialBookingSessionId: 'sbs_001',
          },
        }),
      ],
    });
    render(<AdminBookings />);

    await waitFor(() => {
      expect(screen.getByText('summer-promo')).toBeInTheDocument();
    });
  });
});
