/**
 * Property 2: Preservation — Single-Session Card Unchanged
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8
 *
 * These tests observe and assert the current DOM structure of single-session cards
 * rendered by SessionBrowser on UNFIXED code. They serve as a regression baseline
 * ensuring that single-session cards remain pixel-identical after the term card refactor.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as fc from 'fast-check';

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
    default: () => <div data-testid="session-map">Map</div>,
}));

vi.mock('@/components/sessions/BundleBrowser', () => ({
    default: () => <div data-testid="bundle-browser" />,
}));

vi.mock('@/components/sessions/TermScheduleView', () => ({
    default: ({ schedule }: any) => (
        <div data-testid="term-schedule-view">
            TermScheduleView ({schedule?.length} entries)
        </div>
    ),
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

function createSingleSession(overrides: Partial<any> = {}): any {
    return {
        id: overrides.id ?? 'session-1',
        classId: 'class-1',
        className: overrides.className ?? 'Kids After School',
        classType: overrides.classType ?? 'kidsAfterSchool',
        date: overrides.date ?? '2027-09-15',
        recipeId: 'recipe-1',
        recipeName: overrides.recipeName ?? undefined,
        spotsAvailable: overrides.spotsAvailable ?? 8,
        spotsTotal: 12,
        status: 'open',
        venueId: 'venue-1',
        venueName: overrides.venueName ?? 'Community Hall',
        instructorId: 'instr-1',
        instructorName: overrides.instructorName ?? 'Chef Alex',
        startTime: overrides.startTime ?? '15:30',
        endTime: overrides.endTime ?? '16:30',
        ageMin: overrides.ageMin ?? 5,
        ageMax: overrides.ageMax ?? 11,
        price: overrides.price ?? 1500,
        sessionType: overrides.sessionType, // undefined or 'single'
        createdAt: { toDate: () => new Date() },
    };
}

function createTermSession(overrides: Partial<any> = {}): any {
    return {
        id: overrides.id ?? 'term-session-1',
        classId: 'class-term-1',
        className: overrides.className ?? 'Saturday Baking Club',
        classType: 'kidsAfterSchool',
        date: '2027-09-06',
        recipeId: '',
        spotsAvailable: overrides.spotsAvailable ?? 6,
        spotsTotal: 12,
        status: 'open',
        venueId: 'venue-1',
        venueName: 'Community Hall',
        instructorId: 'instr-1',
        instructorName: 'Chef Alex',
        startTime: '10:30',
        endTime: '12:30',
        ageMin: 5,
        ageMax: 11,
        price: 9000,
        sessionType: 'term' as const,
        termStartDate: '2027-09-06',
        termEndDate: '2027-09-27',
        dayOfWeek: 'Saturday',
        schedule: [
            { date: '2027-09-06', recipeId: 'r1', recipeName: 'Pasta', recipePhotoUrl: '', status: 'active' },
            { date: '2027-09-13', recipeId: 'r2', recipeName: 'Pizza', recipePhotoUrl: '', status: 'active' },
            { date: '2027-09-20', recipeId: 'r3', recipeName: 'Salad', recipePhotoUrl: '', status: 'active' },
            { date: '2027-09-27', recipeId: 'r4', recipeName: 'Cake', recipePhotoUrl: '', status: 'active' },
        ],
        createdAt: { toDate: () => new Date() },
    };
}

// --- Tests ---

describe('Preservation: Single-Session Card Unchanged', () => {
    const onBook = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        onBook.mockClear();
        mockGetDocs.mockResolvedValue({ docs: [] });
    });

    describe('Observation: DOM structure of single-session cards', () => {
        it('renders date badge with day number and month abbreviation', async () => {
            setupMockSessions([createSingleSession({ date: '2027-09-15' })]);

            render(<SessionBrowser onBook={onBook} />);

            await waitFor(() => {
                expect(screen.getByText('15')).toBeInTheDocument();
            });
            expect(screen.getByText('SEPT')).toBeInTheDocument();
        });

        it('renders "Book Now" CTA text for available session', async () => {
            setupMockSessions([createSingleSession()]);

            render(<SessionBrowser onBook={onBook} />);

            await waitFor(() => {
                expect(screen.getByRole('button', { name: /book now/i })).toBeInTheDocument();
            });
        });

        it('renders stats strip with time and spaces', async () => {
            setupMockSessions([createSingleSession({ date: '2027-09-15', startTime: '15:30' })]);

            render(<SessionBrowser onBook={onBook} />);

            await waitFor(() => {
                expect(screen.getByText('3:30')).toBeInTheDocument();
            });
            expect(screen.getByText('spaces')).toBeInTheDocument();
        });

        it('renders detail rows (venue, instructor)', async () => {
            setupMockSessions([createSingleSession({
                venueName: 'Community Hall',
                instructorName: 'Chef Alex',
            })]);

            render(<SessionBrowser onBook={onBook} />);

            await waitFor(() => {
                expect(screen.getByText('Community Hall')).toBeInTheDocument();
            });
            expect(screen.getByText('Chef Alex')).toBeInTheDocument();
        });

        it('renders price row with £{amount} formatting', async () => {
            setupMockSessions([createSingleSession({ price: 1500 })]);

            render(<SessionBrowser onBook={onBook} />);

            await waitFor(() => {
                expect(screen.getByText('£15.00')).toBeInTheDocument();
            });
        });
    });

    describe('Property-based: Single-session card rendering invariants', () => {
        /**
         * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**
         *
         * For any single-session object (sessionType undefined or 'single'), the card:
         * - Renders a date badge with correct day number and month abbreviation
         * - Displays "Book Now" CTA (never programme-specific text)
         * - Contains no programme-specific elements
         * - onBook callback is wired to the CTA
         * - When spotsAvailable === 0, CTA shows "Full" and is disabled
         * - When spotsAvailable <= 3 && > 0, urgency message is present
         */
        it('always renders date badge with correct day and month for single sessions', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.record({
                        sessionType: fc.constantFrom(undefined, 'single' as const),
                        month: fc.integer({ min: 1, max: 12 }),
                        day: fc.integer({ min: 1, max: 28 }),
                        price: fc.integer({ min: 100, max: 50000 }),
                        spotsAvailable: fc.integer({ min: 1, max: 30 }),
                        ageMin: fc.integer({ min: 3, max: 10 }),
                        ageMax: fc.integer({ min: 11, max: 18 }),
                    }),
                    async ({ sessionType, month, day, price, spotsAvailable, ageMin, ageMax }) => {
                        const dateStr = `2027-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                        setupMockSessions([createSingleSession({
                            id: `pbt-${dateStr}`,
                            date: dateStr,
                            price,
                            spotsAvailable,
                            ageMin,
                            ageMax,
                            sessionType,
                        })]);

                        const { unmount } = render(<SessionBrowser onBook={onBook} />);

                        await waitFor(() => {
                            expect(screen.getByText(String(day))).toBeInTheDocument();
                        });

                        // Date badge: month abbreviation (uppercase)
                        const expectedDate = new Date(`${dateStr}T00:00:00`);
                        const expectedMonth = expectedDate
                            .toLocaleDateString('en-GB', { month: 'short' })
                            .toUpperCase();
                        expect(screen.getByText(expectedMonth)).toBeInTheDocument();

                        unmount();
                    }
                ),
                { numRuns: 10 }
            );
        });

        it('"Book Now" is always present for single sessions with available spots (never programme-specific CTA)', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.record({
                        sessionType: fc.constantFrom(undefined, 'single' as const),
                        spotsAvailable: fc.integer({ min: 1, max: 30 }),
                    }),
                    async ({ sessionType, spotsAvailable }) => {
                        setupMockSessions([createSingleSession({
                            id: `pbt-cta-${spotsAvailable}`,
                            date: '2027-06-15',
                            spotsAvailable,
                            sessionType,
                        })]);

                        const { unmount } = render(<SessionBrowser onBook={onBook} />);

                        await waitFor(() => {
                            expect(screen.getByRole('button', { name: /book now/i })).toBeInTheDocument();
                        });

                        // No programme-specific CTA text
                        expect(screen.queryByText(/book all/i)).not.toBeInTheDocument();
                        expect(screen.queryByText(/book full programme/i)).not.toBeInTheDocument();

                        unmount();
                    }
                ),
                { numRuns: 8 }
            );
        });

        it('no programme-specific elements appear in single-session cards', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.record({
                        sessionType: fc.constantFrom(undefined, 'single' as const),
                        spotsAvailable: fc.integer({ min: 1, max: 30 }),
                    }),
                    async ({ sessionType, spotsAvailable }) => {
                        setupMockSessions([createSingleSession({
                            id: `pbt-no-prog-${spotsAvailable}`,
                            date: '2027-07-10',
                            spotsAvailable,
                            sessionType,
                        })]);

                        const { unmount } = render(<SessionBrowser onBook={onBook} />);

                        await waitFor(() => {
                            expect(screen.getByRole('button', { name: /book now/i })).toBeInTheDocument();
                        });

                        // No programme-specific elements
                        expect(screen.queryByText(/programme/i)).not.toBeInTheDocument();
                        expect(screen.queryByText(/session programme/i)).not.toBeInTheDocument();

                        unmount();
                    }
                ),
                { numRuns: 8 }
            );
        });

        it('onBook callback is wired to the CTA button', async () => {
            setupMockSessions([createSingleSession({ id: 'wire-test', date: '2027-03-20', spotsAvailable: 5 })]);

            render(<SessionBrowser onBook={onBook} />);

            await waitFor(() => {
                expect(screen.getByRole('button', { name: /book now/i })).toBeInTheDocument();
            });

            await userEvent.click(screen.getByRole('button', { name: /book now/i }));
            expect(onBook).toHaveBeenCalledWith('wire-test');
        });

        it('when spotsAvailable === 0, CTA shows "Full" and is disabled', async () => {
            setupMockSessions([createSingleSession({ id: 'full-test', date: '2027-04-12', spotsAvailable: 0 })]);

            render(<SessionBrowser onBook={onBook} />);

            await waitFor(() => {
                const btn = screen.getByRole('button', { name: /full/i });
                expect(btn).toBeInTheDocument();
                expect(btn).toBeDisabled();
            });

            expect(screen.queryByRole('button', { name: /book now/i })).not.toBeInTheDocument();
        });

        it('when spotsAvailable <= 3 && > 0, urgency message is present', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.integer({ min: 1, max: 3 }),
                    async (spots) => {
                        setupMockSessions([createSingleSession({
                            id: `urgency-${spots}`,
                            date: '2027-05-01',
                            spotsAvailable: spots,
                        })]);

                        const { unmount } = render(<SessionBrowser onBook={onBook} />);

                        await waitFor(() => {
                            const expectedText = spots === 1
                                ? 'Only 1 spot left!'
                                : `Only ${spots} spots left!`;
                            expect(screen.getByText(expectedText)).toBeInTheDocument();
                        });

                        unmount();
                    }
                ),
                { numRuns: 3 }
            );
        });
    });

    describe('Additional preservation assertions', () => {
        it('TermScheduleView expand/collapse continues to mount for term sessions', async () => {
            setupMockSessions([createTermSession()]);

            render(<SessionBrowser onBook={onBook} />);

            await waitFor(() => {
                expect(screen.getByText(/see what they.+cook/i)).toBeInTheDocument();
            });

            // Click to expand
            await userEvent.click(screen.getByText(/see what they.+cook/i));
            expect(screen.getByTestId('term-schedule-view')).toBeInTheDocument();

            // Click to collapse
            await userEvent.click(screen.getByText(/see what they.+cook/i));
            expect(screen.queryByTestId('term-schedule-view')).not.toBeInTheDocument();
        });

        it('guest checkout link appears when showGuestOption is true and spots are available', async () => {
            setupMockSessions([createSingleSession({ id: 'guest-test', date: '2027-08-20', spotsAvailable: 5 })]);

            render(<SessionBrowser onBook={onBook} showGuestOption={true} />);

            await waitFor(() => {
                expect(screen.getByText('Book as a Guest')).toBeInTheDocument();
            });

            const guestLink = screen.getByText('Book as a Guest');
            expect(guestLink).toHaveAttribute('href', '/express-booking/guest-test?source=website_express');
        });

        it('guest checkout link does NOT appear when spotsAvailable === 0', async () => {
            setupMockSessions([createSingleSession({ id: 'no-guest', date: '2027-08-21', spotsAvailable: 0 })]);

            render(<SessionBrowser onBook={onBook} showGuestOption={true} />);

            await waitFor(() => {
                expect(screen.getByRole('button', { name: /full/i })).toBeInTheDocument();
            });

            expect(screen.queryByText('Book as a Guest')).not.toBeInTheDocument();
        });
    });
});
