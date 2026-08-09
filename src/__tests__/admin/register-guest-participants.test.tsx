/**
 * Unit tests for Session Register — guest and social-origin participant display.
 *
 * Validates that the register correctly displays participants from bookings
 * without bookedByUid, using guestContact/childSnapshot fields for names,
 * and shows booking source badges for different channels.
 *
 * Requirements: 14.3, 14.4, 14.5
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { User } from 'firebase/auth';
import type { Booking, BTClass, Session } from '@/types';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const { mockGetDocs, mockAddDoc, mockUpdateDoc, mockDeleteDoc } = vi.hoisted(() => ({
  mockGetDocs: vi.fn(),
  mockAddDoc: vi.fn(),
  mockUpdateDoc: vi.fn(),
  mockDeleteDoc: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  query: vi.fn(),
  getDocs: mockGetDocs,
  addDoc: mockAddDoc,
  updateDoc: mockUpdateDoc,
  deleteDoc: mockDeleteDoc,
  doc: vi.fn(() => 'mock-doc-ref'),
  serverTimestamp: vi.fn(),
  orderBy: vi.fn(),
  where: vi.fn(),
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
  usePathname: () => '/admin/sessions',
}));

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('@/lib/feature-flags', () => ({
  isGuestCheckoutEnabled: () => true,
}));

import AdminSessions from '@/app/admin/sessions/page';

// ─── Test Helpers ─────────────────────────────────────────────────────────────

function makeFirestoreDoc(data: Record<string, unknown>, id: string) {
  return { id, data: () => data };
}

function makeTermClass(): Record<string, unknown> {
  return {
    id: 'class_term_001',
    name: 'Holiday Workshop',
    type: 'kidsAfterSchool',
    commitment: 'term',
    dayOfWeek: 'Monday',
    startTime: '10:00',
    endTime: '12:00',
    ageMin: 5,
    ageMax: 11,
    maxSize: 10,
    spotsAvailable: 8,
    termStartDate: '2025-08-24',
    termEndDate: '2025-08-28',
    termPrice: 6000,
    recurrenceDays: [],
    instructor: 'Chef Amy',
    venueId: 'venue_001',
    venueName: 'BT Kitchen',
    createdAt: { toDate: () => new Date('2025-01-01') },
  };
}

function makeTermSession(): Record<string, unknown> {
  return {
    id: 'session_term_001',
    classId: 'class_term_001',
    className: 'Holiday Workshop',
    classType: 'kidsAfterSchool',
    date: '2025-08-25',
    spotsAvailable: 10,
    spotsTotal: 10,
    status: 'open',
    venueId: 'venue_001',
    venueName: 'BT Kitchen',
    startTime: '10:00',
    endTime: '12:00',
    ageMin: 5,
    ageMax: 11,
    price: 0,
    createdAt: { toDate: () => new Date('2025-01-01') },
  };
}

function makeGuestTermBooking(source: string, overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    id: `booking_guest_${source}`,
    bookingType: 'term',
    classId: 'class_term_001',
    sessionId: '',
    sessionDate: '',
    className: 'Holiday Workshop',
    venueName: 'BT Kitchen',
    bookedByUid: '', // Guest — no uid
    bookedByName: '',
    studentId: '',
    studentName: '',
    status: 'confirmed',
    bookingMode: 'guest',
    bookingSource: source,
    guestContact: {
      firstName: 'Jane',
      lastName: 'Smith',
      email: 'jane@example.com',
      mobile: '07700123456',
      alternativePhone: '',
      relationship: 'Mother',
    },
    childSnapshot: {
      firstName: 'Oliver',
      lastName: 'Smith',
      dateOfBirth: '2018-03-15',
    },
    medicalSnapshot: {
      foodAllergies: true,
      dietaryRequirements: 'Nut-free',
      airborneAllergies: false,
      allergenDetails: 'Tree nuts, peanuts',
      knownReactions: '',
      symptoms: 'Anaphylaxis',
      epipenRequired: true,
      epipenDetails: 'Kept in bag',
      medicationDetails: '',
      respiratoryProblems: false,
      medicalConditions: '',
      recentOperations: '',
      visionImpairment: false,
      hearingImpairment: false,
      additionalSupportNeeds: '',
      otherSafetyInfo: '',
    },
    emergencyContactSnapshot: {
      name: 'John Smith',
      relationship: 'Father',
      mobile: '07700654321',
      alternativePhone: '',
      email: 'john@example.com',
    },
    authorisedCollectorSnapshot: {
      name: 'Jane Smith',
      relationship: 'Mother',
      phone: '07700123456',
      sameAsParent: true,
    },
    payment: { amount: 6000, currency: 'gbp', status: 'paid', stripePaymentIntentId: `pi_guest_${source}` },
    termsAccepted: true,
    termsAcceptedAt: { toDate: () => new Date() },
    createdAt: { toDate: () => new Date('2025-08-20') },
    ...overrides,
  };
}

/**
 * Mock getDocs responses for:
 * 1. Initial sessions load (ordered by date)
 * 2. Classes load
 * 3. Recipes load
 * 4. Instructors load
 * 5. ClassTypes load
 * Then for register open:
 * 6. Per-session bookings query
 * 7. Term bookings query
 */
function setupMocks(options?: { termBookings?: Record<string, unknown>[] }) {
  const termBookings = options?.termBookings ?? [
    makeGuestTermBooking('website_express'),
    makeGuestTermBooking('whatsapp_express', {
      id: 'booking_guest_whatsapp',
      guestContact: { firstName: 'Sarah', lastName: 'Jones', email: 'sarah@example.com', mobile: '07700111222', alternativePhone: '', relationship: 'Mother' },
      childSnapshot: { firstName: 'Mia', lastName: 'Jones', dateOfBirth: '2017-05-20' },
    }),
    makeGuestTermBooking('instagram_express', {
      id: 'booking_guest_insta',
      guestContact: { firstName: 'Emily', lastName: 'Taylor', email: 'emily@example.com', mobile: '07700333444', alternativePhone: '', relationship: 'Mother' },
      childSnapshot: { firstName: 'Liam', lastName: 'Taylor', dateOfBirth: '2019-01-10' },
    }),
    makeGuestTermBooking('facebook_express', {
      id: 'booking_guest_fb',
      guestContact: { firstName: 'Claire', lastName: 'Brown', email: 'claire@example.com', mobile: '07700555666', alternativePhone: '', relationship: 'Grandmother' },
      childSnapshot: { firstName: 'Noah', lastName: 'Brown', dateOfBirth: '2016-11-08' },
    }),
  ];

  // Initial data load (5 queries: sessions, classes, recipes, instructors, classTypes)
  mockGetDocs
    .mockResolvedValueOnce({ docs: [makeFirestoreDoc(makeTermSession(), 'session_term_001')] }) // sessions
    .mockResolvedValueOnce({ docs: [makeFirestoreDoc(makeTermClass(), 'class_term_001')] })     // classes
    .mockResolvedValueOnce({ docs: [] })                                                          // recipes
    .mockResolvedValueOnce({ docs: [] })                                                          // instructors
    .mockResolvedValueOnce({ docs: [] })                                                          // classTypes
    // Register open queries:
    .mockResolvedValueOnce({ docs: [] })                                                          // per-session bookings
    .mockResolvedValueOnce({ docs: termBookings.map(b => makeFirestoreDoc(b, b.id as string)) }); // term bookings
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Session Register — Guest & Social-Origin Participants', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('displays participant name from childSnapshot for guest bookings without bookedByUid', async () => {
    setupMocks();
    render(<AdminSessions />);

    // Wait for sessions list to load
    await waitFor(() => {
      expect(screen.getByText('Holiday Workshop')).toBeInTheDocument();
    });

    // Click register button
    const registerBtn = screen.getByTitle('View Register');
    fireEvent.click(registerBtn);

    // Wait for register to load and display guest participants
    await waitFor(() => {
      expect(screen.getByText('Oliver Smith')).toBeInTheDocument();
      expect(screen.getByText('Mia Jones')).toBeInTheDocument();
      expect(screen.getByText('Liam Taylor')).toBeInTheDocument();
      expect(screen.getByText('Noah Brown')).toBeInTheDocument();
    });
  });

  test('displays parent name from guestContact for guest bookings', async () => {
    setupMocks();
    render(<AdminSessions />);

    await waitFor(() => {
      expect(screen.getByText('Holiday Workshop')).toBeInTheDocument();
    });

    const registerBtn = screen.getByTitle('View Register');
    fireEvent.click(registerBtn);

    await waitFor(() => {
      expect(screen.getByText('Parent: Jane Smith')).toBeInTheDocument();
      expect(screen.getByText('Parent: Sarah Jones')).toBeInTheDocument();
      expect(screen.getByText('Parent: Emily Taylor')).toBeInTheDocument();
      expect(screen.getByText('Parent: Claire Brown')).toBeInTheDocument();
    });
  });

  test('shows booking source badges for different channels', async () => {
    setupMocks();
    render(<AdminSessions />);

    await waitFor(() => {
      expect(screen.getByText('Holiday Workshop')).toBeInTheDocument();
    });

    const registerBtn = screen.getByTitle('View Register');
    fireEvent.click(registerBtn);

    await waitFor(() => {
      expect(screen.getByText('Website (Guest)')).toBeInTheDocument();
      expect(screen.getByText('WhatsApp')).toBeInTheDocument();
      expect(screen.getByText('Instagram')).toBeInTheDocument();
      expect(screen.getByText('Messenger')).toBeInTheDocument();
    });
  });

  test('shows "Guest" mode badge for all guest bookings', async () => {
    setupMocks();
    render(<AdminSessions />);

    await waitFor(() => {
      expect(screen.getByText('Holiday Workshop')).toBeInTheDocument();
    });

    const registerBtn = screen.getByTitle('View Register');
    fireEvent.click(registerBtn);

    await waitFor(() => {
      const guestBadges = screen.getAllByText('Guest');
      expect(guestBadges.length).toBe(4);
    });
  });

  test('shows medical flag icon for bookings with medical declarations', async () => {
    setupMocks();
    render(<AdminSessions />);

    await waitFor(() => {
      expect(screen.getByText('Holiday Workshop')).toBeInTheDocument();
    });

    const registerBtn = screen.getByTitle('View Register');
    fireEvent.click(registerBtn);

    await waitFor(() => {
      // All 4 guest bookings have medicalSnapshot with foodAllergies=true
      const medicalButtons = screen.getAllByTitle('View medical details');
      expect(medicalButtons.length).toBe(4);
    });
  });

  test('shows emergency contact flag for bookings with emergency contact snapshot', async () => {
    setupMocks();
    render(<AdminSessions />);

    await waitFor(() => {
      expect(screen.getByText('Holiday Workshop')).toBeInTheDocument();
    });

    const registerBtn = screen.getByTitle('View Register');
    fireEvent.click(registerBtn);

    await waitFor(() => {
      const emergencyButtons = screen.getAllByTitle('View emergency contact');
      expect(emergencyButtons.length).toBe(4);
    });
  });

  test('expands medical/emergency details when flag is clicked', async () => {
    setupMocks();
    render(<AdminSessions />);

    await waitFor(() => {
      expect(screen.getByText('Holiday Workshop')).toBeInTheDocument();
    });

    const registerBtn = screen.getByTitle('View Register');
    fireEvent.click(registerBtn);

    await waitFor(() => {
      expect(screen.getByText('Oliver Smith')).toBeInTheDocument();
    });

    // Click the medical detail button for Oliver Smith
    const medicalBtn = screen.getByLabelText('View medical details for Oliver Smith');
    fireEvent.click(medicalBtn);

    // Should show expanded detail row with medical info
    await waitFor(() => {
      expect(screen.getByText('Medical / Dietary')).toBeInTheDocument();
      expect(screen.getByText('Food allergies')).toBeInTheDocument();
      expect(screen.getByText(/Allergens: Tree nuts, peanuts/)).toBeInTheDocument();
      expect(screen.getByText(/EpiPen required — Kept in bag/)).toBeInTheDocument();
    });

    // Should also show emergency contact details
    expect(screen.getByText('Emergency Contact')).toBeInTheDocument();
    expect(screen.getByText(/John Smith/)).toBeInTheDocument();
    expect(screen.getByText(/Father/)).toBeInTheDocument();
  });

  test('collapses detail row when clicked again', async () => {
    setupMocks();
    render(<AdminSessions />);

    await waitFor(() => {
      expect(screen.getByText('Holiday Workshop')).toBeInTheDocument();
    });

    const registerBtn = screen.getByTitle('View Register');
    fireEvent.click(registerBtn);

    await waitFor(() => {
      expect(screen.getByText('Oliver Smith')).toBeInTheDocument();
    });

    // Expand
    const medicalBtn = screen.getByLabelText('View medical details for Oliver Smith');
    fireEvent.click(medicalBtn);

    await waitFor(() => {
      expect(screen.getByText('Medical / Dietary')).toBeInTheDocument();
    });

    // Collapse
    fireEvent.click(medicalBtn);

    await waitFor(() => {
      expect(screen.queryByText('Medical / Dietary')).not.toBeInTheDocument();
    });
  });

  test('calculates age from childSnapshot.dateOfBirth for guest bookings', async () => {
    setupMocks();
    render(<AdminSessions />);

    await waitFor(() => {
      expect(screen.getByText('Holiday Workshop')).toBeInTheDocument();
    });

    const registerBtn = screen.getByTitle('View Register');
    fireEvent.click(registerBtn);

    // Oliver Smith born 2018-03-15, session date 2025-08-25 → age 7
    await waitFor(() => {
      expect(screen.getByText('7')).toBeInTheDocument();
    });
  });
});
