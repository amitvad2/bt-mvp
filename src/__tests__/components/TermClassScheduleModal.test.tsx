import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BTClass, Session } from '@/types';

// Mock next/navigation
vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
}));

// Mock next/link
vi.mock('next/link', () => ({
    default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
        <a href={href} {...props}>{children}</a>
    ),
}));

// Mock next/image
vi.mock('next/image', () => ({
    default: ({ src, alt, width, height, className }: { src: string; alt: string; width: number; height: number; className?: string }) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} width={width} height={height} className={className} />
    ),
}));

// Mock Firebase
const mockGetDocs = vi.fn();
vi.mock('firebase/firestore', () => ({
    collection: vi.fn(),
    query: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    getDocs: (...args: unknown[]) => mockGetDocs(...args),
}));
vi.mock('@/lib/firebase', () => ({
    db: {},
}));

import TermClassScheduleModal from '@/components/sessions/TermClassScheduleModal';

function makeTermClass(overrides: Partial<BTClass> = {}): BTClass {
    return {
        id: 'term-class-1',
        type: 'kidsAfterSchool',
        name: 'Baking Basics',
        dayOfWeek: 'Monday',
        startTime: '15:30',
        endTime: '16:30',
        ageMin: 5,
        ageMax: 12,
        maxSize: 12,
        instructor: 'Chef Sarah',
        venueId: 'venue-1',
        venueName: 'Community Hall',
        commitment: 'term',
        price: 1500,
        termStartDate: '2025-01-06',
        termEndDate: '2025-03-28',
        termPrice: 12000,
        recurrenceDays: ['Monday', 'Wednesday', 'Friday'],
        spotsAvailable: 5,
        createdAt: null,
        ...overrides,
    };
}

function makeSession(overrides: Partial<Session> = {}): Session {
    return {
        id: 'session-1',
        classId: 'term-class-1',
        className: 'Baking Basics',
        classType: 'kidsAfterSchool',
        date: '2025-01-06',
        recipeId: 'recipe-1',
        recipeName: 'Chocolate Cake',
        recipePhotoUrl: 'https://example.com/chocolate-cake.jpg',
        spotsAvailable: 12,
        spotsTotal: 12,
        status: 'open',
        venueId: 'venue-1',
        venueName: 'Community Hall',
        startTime: '15:30',
        endTime: '16:30',
        ageMin: 5,
        ageMax: 12,
        price: 1500,
        createdAt: null,
        ...overrides,
    };
}

function mockFirestoreResponse(sessions: Session[]) {
    mockGetDocs.mockResolvedValue({
        docs: sessions.map(s => ({
            id: s.id,
            data: () => {
                const { id: _id, ...rest } = s;
                return rest;
            },
        })),
    });
}

describe('TermClassScheduleModal', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders the class name as heading', async () => {
        mockFirestoreResponse([]);
        render(<TermClassScheduleModal termClass={makeTermClass()} onClose={vi.fn()} />);
        expect(screen.getByRole('heading', { name: 'Baking Basics' })).toBeInTheDocument();
    });

    it('renders the "Term" badge', async () => {
        mockFirestoreResponse([]);
        render(<TermClassScheduleModal termClass={makeTermClass()} onClose={vi.fn()} />);
        expect(screen.getByText('Term')).toBeInTheDocument();
    });

    it('displays recurrence days formatted', async () => {
        mockFirestoreResponse([]);
        render(<TermClassScheduleModal termClass={makeTermClass()} onClose={vi.fn()} />);
        expect(screen.getByText('Every Mon, Wed, Fri')).toBeInTheDocument();
    });

    it('hides recurrence text when recurrenceDays is empty', async () => {
        mockFirestoreResponse([]);
        render(<TermClassScheduleModal termClass={makeTermClass({ recurrenceDays: [] })} onClose={vi.fn()} />);
        expect(screen.queryByText('Every Mon, Wed, Fri')).not.toBeInTheDocument();
    });

    it('displays programme period with session count when recurrenceDays is empty and sessions loaded', async () => {
        const sessions = [
            makeSession({ id: 's1', date: '2025-08-24' }),
            makeSession({ id: 's2', date: '2025-08-25' }),
            makeSession({ id: 's3', date: '2025-08-26' }),
            makeSession({ id: 's4', date: '2025-08-27' }),
            makeSession({ id: 's5', date: '2025-08-28' }),
        ];
        mockFirestoreResponse(sessions);

        render(
            <TermClassScheduleModal
                termClass={makeTermClass({
                    recurrenceDays: [],
                    termStartDate: '2025-08-24',
                    termEndDate: '2025-08-28',
                })}
                onClose={vi.fn()}
            />
        );

        await waitFor(() => {
            expect(screen.getByText('5-Day Programme, 24 Aug – 28 Aug 2025')).toBeInTheDocument();
        });
    });

    it('displays the term period', async () => {
        mockFirestoreResponse([]);
        render(<TermClassScheduleModal termClass={makeTermClass()} onClose={vi.fn()} />);
        expect(screen.getByText('6 Jan 2025 – 28 Mar 2025')).toBeInTheDocument();
    });

    it('displays the time slot', async () => {
        mockFirestoreResponse([]);
        render(<TermClassScheduleModal termClass={makeTermClass()} onClose={vi.fn()} />);
        expect(screen.getByText('3:30 pm–4:30 pm')).toBeInTheDocument();
    });

    it('displays the venue', async () => {
        mockFirestoreResponse([]);
        render(<TermClassScheduleModal termClass={makeTermClass()} onClose={vi.fn()} />);
        expect(screen.getByText('Community Hall')).toBeInTheDocument();
    });

    it('displays the term price', async () => {
        mockFirestoreResponse([]);
        render(<TermClassScheduleModal termClass={makeTermClass()} onClose={vi.fn()} />);
        expect(screen.getByText('£120.00 for the programme')).toBeInTheDocument();
    });

    it('shows loading state initially', () => {
        mockGetDocs.mockReturnValue(new Promise(() => {})); // Never resolves
        render(<TermClassScheduleModal termClass={makeTermClass()} onClose={vi.fn()} />);
        expect(screen.getByText('Loading schedule...')).toBeInTheDocument();
    });

    it('displays sessions with recipe name and photo after loading', async () => {
        const sessions = [
            makeSession({ id: 's1', date: '2025-01-06', recipeName: 'Chocolate Cake', recipePhotoUrl: 'https://example.com/cake.jpg' }),
            makeSession({ id: 's2', date: '2025-01-08', recipeName: 'Pasta Bake', recipePhotoUrl: 'https://example.com/pasta.jpg' }),
        ];
        mockFirestoreResponse(sessions);

        render(<TermClassScheduleModal termClass={makeTermClass()} onClose={vi.fn()} />);

        await waitFor(() => {
            expect(screen.getByText('Chocolate Cake')).toBeInTheDocument();
        });
        expect(screen.getByText('Pasta Bake')).toBeInTheDocument();
    });

    it('displays recipe photo with proper alt text', async () => {
        mockFirestoreResponse([
            makeSession({ recipeName: 'Banana Bread', recipePhotoUrl: 'https://example.com/bread.jpg' }),
        ]);

        render(<TermClassScheduleModal termClass={makeTermClass()} onClose={vi.fn()} />);

        await waitFor(() => {
            const img = screen.getByAltText('Photo of Banana Bread');
            expect(img).toBeInTheDocument();
            expect(img).toHaveAttribute('src', 'https://example.com/bread.jpg');
            expect(img).toHaveAttribute('width', '60');
            expect(img).toHaveAttribute('height', '60');
        });
    });

    it('displays "To be announced" for sessions without a recipe', async () => {
        mockFirestoreResponse([
            makeSession({ recipeName: undefined, recipePhotoUrl: undefined, recipeId: '' }),
        ]);

        render(<TermClassScheduleModal termClass={makeTermClass()} onClose={vi.fn()} />);

        await waitFor(() => {
            expect(screen.getByText('To be announced')).toBeInTheDocument();
        });
    });

    it('displays the date and day of week for each session', async () => {
        mockFirestoreResponse([
            makeSession({ date: '2025-01-06' }),
        ]);

        render(<TermClassScheduleModal termClass={makeTermClass()} onClose={vi.fn()} />);

        await waitFor(() => {
            expect(screen.getByText('6 Jan 2025')).toBeInTheDocument();
            expect(screen.getByText('Monday')).toBeInTheDocument();
        });
    });

    it('renders "Book This Term" link when spots available', async () => {
        mockFirestoreResponse([]);
        render(<TermClassScheduleModal termClass={makeTermClass({ id: 'abc-123', spotsAvailable: 3 })} onClose={vi.fn()} />);

        await waitFor(() => {
            expect(screen.queryByText('Loading schedule...')).not.toBeInTheDocument();
        });

        const link = screen.getByRole('link', { name: 'Book This Term' });
        expect(link).toHaveAttribute('href', '/book-term/abc-123/student');
    });

    it('renders disabled "Full" button when no spots available', async () => {
        mockFirestoreResponse([]);
        render(<TermClassScheduleModal termClass={makeTermClass({ spotsAvailable: 0 })} onClose={vi.fn()} />);

        await waitFor(() => {
            expect(screen.queryByText('Loading schedule...')).not.toBeInTheDocument();
        });

        const fullButton = screen.getByRole('button', { name: 'Full' });
        expect(fullButton).toBeDisabled();
        expect(screen.queryByRole('link', { name: 'Book This Term' })).not.toBeInTheDocument();
    });

    it('calls onClose when close button is clicked', async () => {
        mockFirestoreResponse([]);
        const handleClose = vi.fn();
        render(<TermClassScheduleModal termClass={makeTermClass()} onClose={handleClose} />);

        await userEvent.click(screen.getByLabelText('Close schedule'));
        expect(handleClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when Escape key is pressed', async () => {
        mockFirestoreResponse([]);
        const handleClose = vi.fn();
        render(<TermClassScheduleModal termClass={makeTermClass()} onClose={handleClose} />);

        await userEvent.keyboard('{Escape}');
        expect(handleClose).toHaveBeenCalledTimes(1);
    });

    it('displays "No sessions" message when schedule is empty', async () => {
        mockFirestoreResponse([]);
        render(<TermClassScheduleModal termClass={makeTermClass()} onClose={vi.fn()} />);

        await waitFor(() => {
            expect(screen.getByText('No sessions have been scheduled yet.')).toBeInTheDocument();
        });
    });

    it('has proper modal accessibility attributes', () => {
        mockFirestoreResponse([]);
        render(<TermClassScheduleModal termClass={makeTermClass()} onClose={vi.fn()} />);

        const dialog = screen.getByRole('dialog');
        expect(dialog).toHaveAttribute('aria-modal', 'true');
        expect(dialog).toHaveAttribute('aria-labelledby', 'schedule-modal-title');
    });

    it('shows "Venue TBC" when venue is not set', async () => {
        mockFirestoreResponse([]);
        render(<TermClassScheduleModal termClass={makeTermClass({ venueName: undefined })} onClose={vi.fn()} />);
        expect(screen.getByText('Venue TBC')).toBeInTheDocument();
    });

    it('displays skills below the recipe name when skills are assigned', async () => {
        mockFirestoreResponse([
            makeSession({
                id: 's-skills',
                date: '2025-01-06',
                recipeName: 'Rainbow Fruit Salad',
                skills: ['chopping', 'mixing', 'creative plating'],
            }),
        ]);

        render(<TermClassScheduleModal termClass={makeTermClass()} onClose={vi.fn()} />);

        await waitFor(() => {
            expect(screen.getByText('Skills: chopping, mixing, creative plating')).toBeInTheDocument();
        });
    });

    it('does not display skills line when skills array is empty', async () => {
        mockFirestoreResponse([
            makeSession({
                id: 's-no-skills',
                date: '2025-01-08',
                recipeName: 'Pasta Bake',
                skills: [],
            }),
        ]);

        render(<TermClassScheduleModal termClass={makeTermClass()} onClose={vi.fn()} />);

        await waitFor(() => {
            expect(screen.getByText('Pasta Bake')).toBeInTheDocument();
        });
        expect(screen.queryByText(/^Skills:/)).not.toBeInTheDocument();
    });

    it('does not display skills line when skills is undefined', async () => {
        mockFirestoreResponse([
            makeSession({
                id: 's-undef-skills',
                date: '2025-01-10',
                recipeName: 'Banana Bread',
                skills: undefined,
            }),
        ]);

        render(<TermClassScheduleModal termClass={makeTermClass()} onClose={vi.fn()} />);

        await waitFor(() => {
            expect(screen.getByText('Banana Bread')).toBeInTheDocument();
        });
        expect(screen.queryByText(/^Skills:/)).not.toBeInTheDocument();
    });

    it('displays session-specific time when it differs from class default', async () => {
        mockFirestoreResponse([
            makeSession({
                id: 's-custom-time',
                date: '2025-01-06',
                recipeName: 'Rainbow Fruit Salad',
                startTime: '11:00',
                endTime: '12:15',
            }),
        ]);

        render(<TermClassScheduleModal termClass={makeTermClass()} onClose={vi.fn()} />);

        await waitFor(() => {
            expect(screen.getByText('Rainbow Fruit Salad')).toBeInTheDocument();
        });
        expect(screen.getByText('11:00 am–12:15 pm')).toBeInTheDocument();
    });

    it('does not display session time when it matches the class default', async () => {
        mockFirestoreResponse([
            makeSession({
                id: 's-default-time',
                date: '2025-01-06',
                recipeName: 'Pasta Bake',
                startTime: '15:30',
                endTime: '16:30',
            }),
        ]);

        render(<TermClassScheduleModal termClass={makeTermClass()} onClose={vi.fn()} />);

        await waitFor(() => {
            expect(screen.getByText('Pasta Bake')).toBeInTheDocument();
        });
        // The header already shows the default time; individual session rows should not repeat it
        const sessionRows = screen.getAllByText('Pasta Bake');
        expect(sessionRows).toHaveLength(1);
        // There should be no inline time text like "3:30 pm–4:30 pm" in the session info
        expect(screen.queryByText('3:30 pm–4:30 pm', { selector: '.sessionTime' })).not.toBeInTheDocument();
    });

    it('displays session-specific time only for sessions with overridden times', async () => {
        mockFirestoreResponse([
            makeSession({
                id: 's1',
                date: '2025-01-06',
                recipeName: 'Chocolate Cake',
                startTime: '15:30',
                endTime: '16:30',
            }),
            makeSession({
                id: 's2',
                date: '2025-01-08',
                recipeName: 'Fruit Salad',
                startTime: '10:00',
                endTime: '11:30',
            }),
        ]);

        render(<TermClassScheduleModal termClass={makeTermClass()} onClose={vi.fn()} />);

        await waitFor(() => {
            expect(screen.getByText('Chocolate Cake')).toBeInTheDocument();
            expect(screen.getByText('Fruit Salad')).toBeInTheDocument();
        });
        // Only the second session has a custom time
        expect(screen.getByText('10:00 am–11:30 am')).toBeInTheDocument();
    });
});
