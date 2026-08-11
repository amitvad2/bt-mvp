import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ─── Mock firebase/firestore ───────────────────────────────────────────────────
const mockGetDocs = vi.fn();
const mockGetDoc = vi.fn();
const mockUpdateDoc = vi.fn();

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  getDocs: (...args: unknown[]) => mockGetDocs(...args),
  getDoc: (...args: unknown[]) => mockGetDoc(...args),
  doc: vi.fn((_db: unknown, _col: string, _id: string) => ({ path: `${_col}/${_id}` })),
  query: vi.fn(),
  where: vi.fn(),
  updateDoc: (...args: unknown[]) => mockUpdateDoc(...args),
  increment: vi.fn(),
}));

vi.mock('@/lib/firebase', () => ({ db: {} }));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    user: { uid: 'user-001', email: 'jane@example.com', getIdToken: vi.fn().mockResolvedValue('mock-token') },
    btUser: { firstName: 'Jane', lastName: 'Smith' },
    loading: false,
  }),
}));

// Mock the TermScheduleView component to simplify assertions
vi.mock('@/components/sessions/TermScheduleView', () => ({
  default: ({ schedule }: { schedule: unknown[] }) => (
    <div data-testid="term-schedule-view">Schedule: {schedule.length} entries</div>
  ),
}));

// Mock BundleGroupCard
vi.mock('@/components/portal/BundleGroupCard', () => ({
  default: () => <div data-testid="bundle-group-card">Bundle</div>,
}));

import MyClassesPage from '@/app/portal/my-classes/page';

// ─── Mock Data ─────────────────────────────────────────────────────────────────
const termBooking = {
  id: 'pi_term_001',
  bookingType: 'term' as const,
  sessionId: 'session-term-001',
  sessionDate: '2025-09-08',
  className: 'After School Club',
  venueName: 'Bloomsbury Kitchen',
  bookedByUid: 'user-001',
  bookedByName: 'Jane Smith',
  studentId: 'stu-001',
  studentName: 'Oliver Smith',
  status: 'confirmed' as const,
  termStartDate: '2025-09-08',
  termEndDate: '2025-12-15',
  recurrenceDays: ['Monday'],
  payment: { stripePaymentIntentId: 'pi_term_001', amount: 18000, currency: 'gbp', status: 'paid' },
  createdAt: { toMillis: () => Date.now() },
};

const perSessionBooking = {
  id: 'pi_session_001',
  sessionId: 'session-single-001',
  sessionDate: '2025-10-01',
  className: 'Weekend Baking',
  venueName: 'Islington Kitchen',
  bookedByUid: 'user-001',
  bookedByName: 'Jane Smith',
  studentId: 'stu-002',
  studentName: 'Emma Smith',
  status: 'confirmed' as const,
  payment: { stripePaymentIntentId: 'pi_session_001', amount: 2500, currency: 'gbp', status: 'paid' },
  createdAt: { toMillis: () => Date.now() - 1000 },
};

const termScheduleData = [
  { date: '2025-09-08', recipeId: 'rec_001', recipeName: 'Pasta Shapes', recipePhotoUrl: '', status: 'active' },
  { date: '2025-09-15', recipeId: '', recipeName: '', recipePhotoUrl: '', status: 'active' },
  { date: '2025-09-22', recipeId: '', recipeName: '', recipePhotoUrl: '', status: 'skipped' },
  { date: '2025-09-29', recipeId: 'rec_003', recipeName: 'Mini Pizzas', recipePhotoUrl: '', status: 'active' },
];

// ─── Helpers ───────────────────────────────────────────────────────────────────
function setupMocks(bookings: unknown[]) {
  mockGetDocs.mockResolvedValue({
    docs: bookings.map(b => ({
      id: (b as { id: string }).id,
      data: () => b,
    })),
  });
}

describe('MyClassesPage — Term Booking Display', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Stub global fetch (used for cancellation emails)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    // Stub window.confirm
    vi.stubGlobal('confirm', vi.fn(() => true));
    // Stub window.alert
    vi.stubGlobal('alert', vi.fn());
  });

  it('renders term bookings with class name and "Term" badge', async () => {
    setupMocks([termBooking]);

    render(<MyClassesPage />);

    await waitFor(() => {
      expect(screen.getByText('After School Club')).toBeInTheDocument();
    });

    // The "Term" badge should be present
    expect(screen.getByText('Term')).toBeInTheDocument();
  });

  it('shows term date range for term bookings', async () => {
    setupMocks([termBooking]);

    render(<MyClassesPage />);

    await waitFor(() => {
      expect(screen.getByText('After School Club')).toBeInTheDocument();
    });

    // The formatTermSchedule function includes date range formatted via toLocaleDateString
    // e.g. "Every Monday — 8 Sept 2025 – 15 Dec 2025"
    // Check that both start and end date portions appear in the rendered text
    const allText = document.body.textContent || '';
    expect(allText).toMatch(/8 Sep/i);
    expect(allText).toMatch(/15 Dec/i);
  });

  it('shows "View Schedule" button for active term bookings', async () => {
    setupMocks([termBooking]);

    render(<MyClassesPage />);

    await waitFor(() => {
      expect(screen.getByText('After School Club')).toBeInTheDocument();
    });

    const viewScheduleBtn = screen.getByRole('button', { name: /view schedule/i });
    expect(viewScheduleBtn).toBeInTheDocument();
  });

  it('renders per-session bookings without "Term" badge (backward compatibility)', async () => {
    setupMocks([perSessionBooking]);

    render(<MyClassesPage />);

    await waitFor(() => {
      expect(screen.getByText('Weekend Baking')).toBeInTheDocument();
    });

    // There should be no "Term" badge for per-session bookings
    expect(screen.queryByText('Term')).not.toBeInTheDocument();
  });

  it('shows participant name on term booking card', async () => {
    setupMocks([termBooking]);

    render(<MyClassesPage />);

    await waitFor(() => {
      expect(screen.getByText('After School Club')).toBeInTheDocument();
    });

    // Participant line should show the student's name
    expect(screen.getByText('Oliver Smith')).toBeInTheDocument();
  });

  it('loads and displays TermScheduleView when "View Schedule" is clicked', async () => {
    setupMocks([termBooking]);

    // Mock getDoc for fetching the term session schedule
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ schedule: termScheduleData }),
    });

    const user = userEvent.setup();
    render(<MyClassesPage />);

    await waitFor(() => {
      expect(screen.getByText('After School Club')).toBeInTheDocument();
    });

    const viewScheduleBtn = screen.getByRole('button', { name: /view schedule/i });
    await user.click(viewScheduleBtn);

    await waitFor(() => {
      expect(screen.getByTestId('term-schedule-view')).toBeInTheDocument();
    });
  });

  it('displays next upcoming session date after schedule is loaded', async () => {
    // Create a schedule with a future date
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 7);
    const futureDateStr = futureDate.toISOString().split('T')[0];

    const futureSchedule = [
      { date: futureDateStr, recipeId: 'rec_001', recipeName: 'Pasta Shapes', recipePhotoUrl: '', status: 'active' as const },
    ];

    setupMocks([termBooking]);

    // Mock getDoc to return a schedule with a future date
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ schedule: futureSchedule }),
    });

    const user = userEvent.setup();
    render(<MyClassesPage />);

    await waitFor(() => {
      expect(screen.getByText('After School Club')).toBeInTheDocument();
    });

    // Click View Schedule to load it — this caches the schedule and triggers next upcoming display
    const viewScheduleBtn = screen.getByRole('button', { name: /view schedule/i });
    await user.click(viewScheduleBtn);

    await waitFor(() => {
      // After schedule is loaded, the next session info should appear
      expect(screen.getByText(/Next session:/i)).toBeInTheDocument();
    });
  });
});
