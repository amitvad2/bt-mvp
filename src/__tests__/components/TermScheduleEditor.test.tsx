import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ScheduleEntry } from '@/types';

vi.mock('@/lib/firebase', () => ({ db: {} }));

const mockGetDocs = vi.fn();
const mockUpdateDoc = vi.fn();
const mockDoc = vi.fn();
const mockCollection = vi.fn();

vi.mock('firebase/firestore', () => ({
  collection: (...args: unknown[]) => mockCollection(...args),
  getDocs: (...args: unknown[]) => mockGetDocs(...args),
  doc: (...args: unknown[]) => mockDoc(...args),
  updateDoc: (...args: unknown[]) => mockUpdateDoc(...args),
}));

import TermScheduleEditor from '@/app/admin/sessions/TermScheduleEditor';

function makeEntry(overrides: Partial<ScheduleEntry> = {}): ScheduleEntry {
  return {
    date: '2025-09-08',
    recipeId: '',
    recipeName: '',
    recipePhotoUrl: '',
    status: 'active',
    ...overrides,
  };
}

const mockRecipes = [
  { id: 'rec_001', name: 'Pasta Shapes', description: 'Learn to make pasta', photoUrl: 'https://example.com/pasta.jpg', createdAt: null },
  { id: 'rec_002', name: 'Mini Pizzas', description: 'Pizza making fun', photoUrl: 'https://example.com/pizza.jpg', createdAt: null },
];

describe('TermScheduleEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDocs.mockResolvedValue({
      docs: mockRecipes.map((r) => ({ id: r.id, data: () => r })),
    });
    mockUpdateDoc.mockResolvedValue(undefined);
    mockDoc.mockReturnValue({ id: 'session_123' });
    mockCollection.mockReturnValue({ id: 'recipes' });
  });

  it('renders all schedule entries showing formatted dates', async () => {
    const schedule: ScheduleEntry[] = [
      makeEntry({ date: '2025-09-08' }),
      makeEntry({ date: '2025-09-15' }),
      makeEntry({ date: '2025-09-22' }),
    ];

    render(<TermScheduleEditor sessionId="session_123" schedule={schedule} />);

    // Dates are formatted as "Mon, 8 Sept 2025" style (en-GB short weekday)
    expect(screen.getByText(/8 Sept? 2025/i)).toBeInTheDocument();
    expect(screen.getByText(/15 Sept? 2025/i)).toBeInTheDocument();
    expect(screen.getByText(/22 Sept? 2025/i)).toBeInTheDocument();
  });

  it('shows recipe selector for active entries', async () => {
    const schedule: ScheduleEntry[] = [
      makeEntry({ date: '2025-09-08', status: 'active' }),
    ];

    render(<TermScheduleEditor sessionId="session_123" schedule={schedule} />);

    // Wait for recipes to be fetched and dropdowns to populate
    await waitFor(() => {
      expect(screen.getByLabelText('Select recipe for 2025-09-08')).toBeInTheDocument();
    });
  });

  it('shows "Skipped" badge and no recipe selector for skipped entries', async () => {
    const schedule: ScheduleEntry[] = [
      makeEntry({ date: '2025-09-08', status: 'skipped' }),
      makeEntry({ date: '2025-09-15', status: 'active' }),
    ];

    render(<TermScheduleEditor sessionId="session_123" schedule={schedule} />);

    expect(screen.getByText('Skipped')).toBeInTheDocument();
    // Skipped entry should NOT have a recipe select dropdown
    expect(screen.queryByLabelText('Select recipe for 2025-09-08')).not.toBeInTheDocument();
    // Active entry should still have recipe selector
    await waitFor(() => {
      expect(screen.getByLabelText('Select recipe for 2025-09-15')).toBeInTheDocument();
    });
  });

  it('shows active session count (e.g. "3 active sessions of 5 total")', () => {
    const schedule: ScheduleEntry[] = [
      makeEntry({ date: '2025-09-08', status: 'active' }),
      makeEntry({ date: '2025-09-15', status: 'active' }),
      makeEntry({ date: '2025-09-22', status: 'skipped' }),
      makeEntry({ date: '2025-09-29', status: 'active' }),
      makeEntry({ date: '2025-10-06', status: 'skipped' }),
    ];

    render(<TermScheduleEditor sessionId="session_123" schedule={schedule} />);

    expect(screen.getByText(/3 active sessions of 5 total/)).toBeInTheDocument();
  });

  it('calls updateDoc when a recipe is selected from the dropdown', async () => {
    const user = userEvent.setup();
    const schedule: ScheduleEntry[] = [
      makeEntry({ date: '2025-09-08', status: 'active' }),
    ];

    render(<TermScheduleEditor sessionId="session_123" schedule={schedule} />);

    // Wait for recipes to load
    await waitFor(() => {
      expect(screen.getByLabelText('Select recipe for 2025-09-08')).toBeInTheDocument();
    });

    const select = screen.getByLabelText('Select recipe for 2025-09-08');
    await user.selectOptions(select, 'rec_001');

    await waitFor(() => {
      expect(mockUpdateDoc).toHaveBeenCalledTimes(1);
    });

    // Verify the updateDoc was called with the updated schedule containing the recipe
    const updateCall = mockUpdateDoc.mock.calls[0];
    expect(updateCall[1]).toEqual({
      schedule: [
        expect.objectContaining({
          date: '2025-09-08',
          recipeId: 'rec_001',
          recipeName: 'Pasta Shapes',
          recipePhotoUrl: 'https://example.com/pasta.jpg',
        }),
      ],
    });
  });

  it('calls updateDoc when skip button is clicked (toggles status)', async () => {
    const user = userEvent.setup();
    const schedule: ScheduleEntry[] = [
      makeEntry({ date: '2025-09-08', status: 'active' }),
    ];

    render(<TermScheduleEditor sessionId="session_123" schedule={schedule} />);

    const skipButton = screen.getByLabelText('Skip 2025-09-08');
    await user.click(skipButton);

    await waitFor(() => {
      expect(mockUpdateDoc).toHaveBeenCalledTimes(1);
    });

    // Verify the schedule was updated with 'skipped' status
    const updateCall = mockUpdateDoc.mock.calls[0];
    expect(updateCall[1]).toEqual({
      schedule: [
        expect.objectContaining({
          date: '2025-09-08',
          status: 'skipped',
        }),
      ],
    });
  });

  it('shows the "Add Make-up Date" section with a date input and Add button', () => {
    const schedule: ScheduleEntry[] = [
      makeEntry({ date: '2025-09-08' }),
    ];

    render(<TermScheduleEditor sessionId="session_123" schedule={schedule} />);

    expect(screen.getByText('Add Make-up Date')).toBeInTheDocument();
    expect(screen.getByLabelText('Make-up date')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add/i })).toBeInTheDocument();
  });
});
