import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BTClass } from '@/types';

vi.mock('next/link', () => ({
    default: ({ children, href, className, ...props }: any) => (
        <a href={href} className={className} {...props}>{children}</a>
    ),
}));

import TermClassCard from '@/components/sessions/TermClassCard';

function makeTermClass(overrides: Partial<BTClass> = {}): BTClass {
    return {
        id: 'class-1',
        type: 'kidsAfterSchool',
        name: 'Baking Basics',
        dayOfWeek: 'Monday',
        startTime: '15:30',
        endTime: '16:30',
        ageMin: 5,
        ageMax: 12,
        maxSize: 10,
        instructor: 'Chef Alice',
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

describe('TermClassCard', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it('renders the class name', () => {
        render(<TermClassCard termClass={makeTermClass()} />);
        expect(screen.getByText('Baking Basics')).toBeInTheDocument();
    });

    it('renders the "Term" badge', () => {
        render(<TermClassCard termClass={makeTermClass()} />);
        expect(screen.getByText('Term')).toBeInTheDocument();
    });

    it('formats and displays recurrence days', () => {
        render(<TermClassCard termClass={makeTermClass()} />);
        expect(screen.getByText('Every Mon, Wed, Fri')).toBeInTheDocument();
    });

    it('displays the term period formatted when recurrenceDays is populated', () => {
        render(<TermClassCard termClass={makeTermClass()} />);
        expect(screen.getByText('6 Jan 2025 – 28 Mar 2025')).toBeInTheDocument();
    });

    it('displays fallback programme description when recurrenceDays is empty', () => {
        render(<TermClassCard termClass={makeTermClass({ recurrenceDays: [] })} />);
        // formatProgrammeDescription shows "{startDate} – {endDate}" without year on start when same year
        expect(screen.getByText('6 Jan – 28 Mar 2025')).toBeInTheDocument();
    });

    it('does not display separate term period row when recurrenceDays is empty', () => {
        const { container } = render(<TermClassCard termClass={makeTermClass({ recurrenceDays: [] })} />);
        // The fallback description is shown in the recurrence row, and there's no duplicate period row
        const calendarRows = container.querySelectorAll('[class*="detailRow"]');
        // With no recurrenceDays: recurrence (fallback), time, venue, spots = 4 rows
        expect(calendarRows.length).toBe(4);
    });

    it('displays both recurrence and term period rows when recurrenceDays is populated', () => {
        const { container } = render(<TermClassCard termClass={makeTermClass()} />);
        const calendarRows = container.querySelectorAll('[class*="detailRow"]');
        // With recurrenceDays: recurrence, term period, time, venue, spots = 5 rows
        expect(calendarRows.length).toBe(5);
    });

    it('displays the time slot formatted', () => {
        render(<TermClassCard termClass={makeTermClass()} />);
        expect(screen.getByText('3:30 pm–4:30 pm')).toBeInTheDocument();
    });

    it('displays the venue name', () => {
        render(<TermClassCard termClass={makeTermClass()} />);
        expect(screen.getByText('Community Hall')).toBeInTheDocument();
    });

    it('displays the term price formatted', () => {
        render(<TermClassCard termClass={makeTermClass()} />);
        expect(screen.getByText('£120.00 for the programme')).toBeInTheDocument();
    });

    it('displays spots remaining when available', () => {
        render(<TermClassCard termClass={makeTermClass({ spotsAvailable: 5 })} />);
        expect(screen.getByText('5 spots remaining')).toBeInTheDocument();
    });

    it('uses singular "spot" when only 1 remaining', () => {
        render(<TermClassCard termClass={makeTermClass({ spotsAvailable: 1 })} />);
        expect(screen.getByText('1 spot remaining')).toBeInTheDocument();
    });

    it('shows "Full" badge and disables booking when spotsAvailable is 0', () => {
        render(<TermClassCard termClass={makeTermClass({ spotsAvailable: 0 })} />);
        expect(screen.getByText('Full', { selector: 'span' })).toBeInTheDocument();
        const fullButton = screen.getByRole('button', { name: 'Full' });
        expect(fullButton).toBeDisabled();
    });

    it('renders "Book Now" link to correct URL when spots available', () => {
        render(<TermClassCard termClass={makeTermClass({ id: 'term-abc' })} />);
        const link = screen.getByRole('link', { name: 'Book Now' });
        expect(link).toHaveAttribute('href', '/book-term/term-abc/student');
    });

    it('does not render "Book Now" link when full', () => {
        render(<TermClassCard termClass={makeTermClass({ spotsAvailable: 0 })} />);
        expect(screen.queryByRole('link', { name: 'Book Now' })).not.toBeInTheDocument();
    });

    it('renders "View Schedule" button when onViewSchedule is provided', () => {
        const handler = vi.fn();
        render(<TermClassCard termClass={makeTermClass()} onViewSchedule={handler} />);
        expect(screen.getByRole('button', { name: 'View Schedule' })).toBeInTheDocument();
    });

    it('calls onViewSchedule with classId when clicked', async () => {
        const handler = vi.fn();
        render(<TermClassCard termClass={makeTermClass({ id: 'class-xyz' })} onViewSchedule={handler} />);
        await userEvent.click(screen.getByRole('button', { name: 'View Schedule' }));
        expect(handler).toHaveBeenCalledWith('class-xyz');
    });

    it('does not render "View Schedule" button when onViewSchedule is not provided', () => {
        render(<TermClassCard termClass={makeTermClass()} />);
        expect(screen.queryByRole('button', { name: 'View Schedule' })).not.toBeInTheDocument();
    });

    it('shows "Venue TBC" when venueName is not set', () => {
        render(<TermClassCard termClass={makeTermClass({ venueName: undefined })} />);
        expect(screen.getByText('Venue TBC')).toBeInTheDocument();
    });
});
