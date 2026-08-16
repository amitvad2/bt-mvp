/**
 * Unit tests for Commitment Banner rendering in term cards.
 *
 * Validates: Requirements 1.1, 1.2, 1.4, 1.5
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

// --- Mocks (must be before component import) ---

const mockGetDocs = vi.fn();

vi.mock('next/navigation', () => {
    const params = new URLSearchParams();
    return {
        useSearchParams: () => params,
        useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
        ReadonlyURLSearchParams: URLSearchParams,
    };
});

vi.mock('next/link', () => ({
    default: ({ children, href, ...props }: any) => <a href={href} {...props}>{children}</a>,
}));

vi.mock('@/lib/firebase', () => ({ db: {} }));

vi.mock('firebase/firestore', () => ({
    collection: vi.fn(),
    query: vi.fn(),
    getDocs: (...args: any[]) => mockGetDocs(...args),
    where: vi.fn(),
    orderBy: vi.fn(),
}));

vi.mock('@/components/home/SessionMapSection', () => ({
    default: () => null,
}));

vi.mock('@/components/sessions/BundleBrowser', () => ({
    default: () => null,
}));

vi.mock('@/components/sessions/TermScheduleView', () => ({
    default: () => <div data-testid="term-schedule-view">TermScheduleView</div>,
}));

vi.mock('@/lib/term-schedule-utils', () => ({
    getActiveSessionCount: (schedule: any[]) =>
        schedule.filter((e: any) => e.status === 'active').length,
}));

import SessionBrowser from '@/components/sessions/SessionBrowser';

// --- Helpers ---

function setupMockSessions(sessions: any[]) {
    mockGetDocs.mockResolvedValue({
        docs: sessions.map(s => ({ id: s.id, data: () => s })),
    });
}

function createTermSession(overrides: Partial<any> = {}): any {
    return {
        id: overrides.id ?? 'term-1',
        classId: 'class-1',
        className: overrides.className ?? 'Kids Cooking',
        classType: 'kidsAfterSchool',
        date: '2027-09-04',
        recipeId: '',
        spotsAvailable: overrides.spotsAvailable ?? 5,
        spotsTotal: 10,
        status: 'open',
        venueId: 'v1',
        venueName: 'Kitchen Studio',
        instructorId: 'instr-1',
        instructorName: 'Chef Alex',
        startTime: '10:00',
        endTime: '12:00',
        ageMin: 5,
        ageMax: 12,
        price: 6000,
        sessionType: 'term' as const,
        termStartDate: overrides.termStartDate,
        termEndDate: overrides.termEndDate ?? '2027-09-25',
        dayOfWeek: 'Saturday',
        schedule: overrides.schedule,
        createdAt: { toDate: () => new Date() },
    };
}

// --- Tests ---

describe('Commitment Banner rendering', () => {
    const onBook = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        mockGetDocs.mockResolvedValue({ docs: [] });
    });

    it('renders banner with correct text when activeCount > 0 and termStartDate is defined', async () => {
        const termSession = createTermSession({
            termStartDate: '2027-09-04',
            schedule: [
                { date: '2027-09-04', recipeId: 'r1', recipeName: 'Pasta', recipePhotoUrl: '', status: 'active' },
                { date: '2027-09-11', recipeId: 'r2', recipeName: 'Pizza', recipePhotoUrl: '', status: 'active' },
                { date: '2027-09-18', recipeId: 'r3', recipeName: 'Soup', recipePhotoUrl: '', status: 'active' },
                { date: '2027-09-25', recipeId: 'r4', recipeName: 'Cake', recipePhotoUrl: '', status: 'active' },
            ],
        });
        setupMockSessions([termSession]);

        render(<SessionBrowser onBook={onBook} />);

        await waitFor(() => {
            expect(
                screen.getByText(/Book all 4 Saturday sessions for the full September term/)
            ).toBeInTheDocument();
        });
    });

    it('does NOT render banner when activeCount === 0 (all sessions skipped)', async () => {
        const termSession = createTermSession({
            termStartDate: '2027-09-04',
            schedule: [
                { date: '2027-09-04', recipeId: 'r1', recipeName: 'Pasta', recipePhotoUrl: '', status: 'skipped' },
                { date: '2027-09-11', recipeId: 'r2', recipeName: 'Pizza', recipePhotoUrl: '', status: 'skipped' },
                { date: '2027-09-18', recipeId: 'r3', recipeName: 'Soup', recipePhotoUrl: '', status: 'skipped' },
                { date: '2027-09-25', recipeId: 'r4', recipeName: 'Cake', recipePhotoUrl: '', status: 'skipped' },
            ],
        });
        setupMockSessions([termSession]);

        render(<SessionBrowser onBook={onBook} />);

        // Wait for the term card to render (class name should appear)
        await waitFor(() => {
            expect(screen.getByText('Kids Cooking')).toBeInTheDocument();
        });

        // Banner should NOT be present
        expect(screen.queryByText(/Book all/)).not.toBeInTheDocument();
        expect(screen.queryByText(/one upfront payment/)).not.toBeInTheDocument();
    });

    it('does NOT render banner when termStartDate is undefined', async () => {
        const termSession = createTermSession({
            termStartDate: undefined,
            schedule: [
                { date: '2027-09-04', recipeId: 'r1', recipeName: 'Pasta', recipePhotoUrl: '', status: 'active' },
                { date: '2027-09-11', recipeId: 'r2', recipeName: 'Pizza', recipePhotoUrl: '', status: 'active' },
                { date: '2027-09-18', recipeId: 'r3', recipeName: 'Soup', recipePhotoUrl: '', status: 'active' },
                { date: '2027-09-25', recipeId: 'r4', recipeName: 'Cake', recipePhotoUrl: '', status: 'active' },
            ],
        });
        setupMockSessions([termSession]);

        render(<SessionBrowser onBook={onBook} />);

        // Wait for the term card to render (class name should appear)
        await waitFor(() => {
            expect(screen.getByText('Kids Cooking')).toBeInTheDocument();
        });

        // Banner should NOT be present
        expect(screen.queryByText(/Book all/)).not.toBeInTheDocument();
        expect(screen.queryByText(/one upfront payment/)).not.toBeInTheDocument();
    });

    it('banner contains "Term" badge', async () => {
        const termSession = createTermSession({
            termStartDate: '2027-09-04',
            schedule: [
                { date: '2027-09-04', recipeId: 'r1', recipeName: 'Pasta', recipePhotoUrl: '', status: 'active' },
                { date: '2027-09-11', recipeId: 'r2', recipeName: 'Pizza', recipePhotoUrl: '', status: 'active' },
                { date: '2027-09-18', recipeId: 'r3', recipeName: 'Soup', recipePhotoUrl: '', status: 'active' },
                { date: '2027-09-25', recipeId: 'r4', recipeName: 'Cake', recipePhotoUrl: '', status: 'active' },
            ],
        });
        setupMockSessions([termSession]);

        render(<SessionBrowser onBook={onBook} />);

        await waitFor(() => {
            expect(screen.getByText('Term')).toBeInTheDocument();
        });

        const termBadge = screen.getByText('Term');
        expect(termBadge.tagName.toLowerCase()).toBe('span');
        expect(termBadge.className).toContain('badge');
    });
});
