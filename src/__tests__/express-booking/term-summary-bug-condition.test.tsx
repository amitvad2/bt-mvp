/**
 * Bug Condition Exploration Test — Term Sessions Missing Recurring Class Information
 *
 * This property-based test validates that when a session has sessionType === 'term'
 * with all required term fields (dayOfWeek, termStartDate, termEndDate), the
 * SessionInfoStep component displays:
 *   - Recurrence pattern (e.g., "Every Saturday")
 *   - Term date range (e.g., "5 Sep – 26 Sep 2026")
 *   - Session count (e.g., "4 sessions")
 *   - Programme price (e.g., "£100.00 for the programme")
 *
 * EXPECTED: This test FAILS on unfixed code — confirming the bug exists.
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import * as fc from 'fast-check';
import { GuestSessionInfo } from '@/types';
import { formatRecurrenceDays, formatTermPrice } from '@/lib/term-utils';

// --- Inline helper: countTermSessions ---
// Counts occurrences of dayOfWeek between termStartDate and termEndDate inclusive.
// (The utility doesn't exist yet in term-utils — it will be added in task 3.1)
function countTermSessions(
  termStartDate: string,
  termEndDate: string,
  dayOfWeek: string
): number {
  const start = new Date(termStartDate + 'T00:00:00');
  const end = new Date(termEndDate + 'T00:00:00');
  let count = 0;
  const current = new Date(start);
  while (current <= end) {
    const dayName = current.toLocaleDateString('en-GB', { weekday: 'long' });
    if (dayName === dayOfWeek) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }
  return count;
}

// --- Inline helper: formatTermDateRange ---
// Formats as "{startDay} {startMonth} – {endDay} {endMonth} {endYear}"
// Year on start date only if years differ.
// (The utility doesn't exist yet in term-utils — it will be added in task 3.2)
function formatTermDateRange(termStartDate: string, termEndDate: string): string {
  const start = new Date(termStartDate + 'T00:00:00');
  const end = new Date(termEndDate + 'T00:00:00');

  const startYear = start.getFullYear();
  const endYear = end.getFullYear();

  const startOptions: Intl.DateTimeFormatOptions = {
    day: 'numeric',
    month: 'short',
    ...(startYear !== endYear && { year: 'numeric' }),
  };

  const endOptions: Intl.DateTimeFormatOptions = {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  };

  const formattedStart = start.toLocaleDateString('en-GB', startOptions);
  const formattedEnd = end.toLocaleDateString('en-GB', endOptions);

  return `${formattedStart} – ${formattedEnd}`;
}

// --- Mutable session holder for the mock ---
const holder: { session: GuestSessionInfo | undefined } = { session: undefined };

vi.mock('@/app/express-booking/[sessionId]/GuestBookingContext', () => ({
  useGuestBooking: () => ({
    state: {
      sessionId: 'session-term-test',
      session: holder.session,
      currentStep: 0,
    },
    loading: false,
    goToStep: vi.fn(),
  }),
}));

import SessionInfoStep from '@/app/express-booking/[sessionId]/steps/SessionInfoStep';

// --- fast-check arbitraries ---
const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

const dayOfWeekArb = fc.constantFrom(...daysOfWeek);

// Generate a date string YYYY-MM-DD within 2024-2030
const dateArb = fc
  .tuple(
    fc.integer({ min: 2024, max: 2030 }), // year
    fc.integer({ min: 1, max: 12 }), // month
    fc.integer({ min: 1, max: 28 }) // day (use 28 to avoid invalid dates)
  )
  .map(([year, month, day]) => {
    const m = String(month).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    return `${year}-${m}-${d}`;
  });

// Generate a start/end date pair where end >= start
const dateRangeArb = fc
  .tuple(dateArb, fc.integer({ min: 7, max: 90 })) // start date + offset in days
  .map(([startStr, offset]) => {
    const start = new Date(startStr + 'T00:00:00');
    const end = new Date(start);
    end.setDate(end.getDate() + offset);
    const endStr = end.toISOString().split('T')[0];
    return { termStartDate: startStr, termEndDate: endStr };
  });

// Price in pence (positive integer, reasonable range)
const priceArb = fc.integer({ min: 100, max: 50000 });

// Full term session arbitrary
const termSessionArb = fc
  .tuple(dayOfWeekArb, dateRangeArb, priceArb)
  .map(([dayOfWeek, { termStartDate, termEndDate }, price]) => ({
    id: 'term-session-pbt',
    className: 'After School Cooking Club',
    classType: 'kidsAfterSchool',
    date: termStartDate, // Use termStartDate as fallback date
    startTime: '15:30',
    endTime: '16:30',
    venueName: 'Community Hall',
    ageMin: 5,
    ageMax: 12,
    price,
    spotsAvailable: 8,
    status: 'open',
    sessionType: 'term' as const,
    dayOfWeek,
    termStartDate,
    termEndDate,
  }));

describe('Bug Condition Exploration: Term Sessions Missing Recurring Class Information', () => {
  it('term sessions should display recurrence pattern, date range, session count, and programme price', () => {
    fc.assert(
      fc.property(termSessionArb, (termSession) => {
        holder.session = termSession;

        const { unmount } = render(<SessionInfoStep />);

        // Expected values
        const expectedRecurrence = formatRecurrenceDays([termSession.dayOfWeek!]);
        const expectedDateRange = formatTermDateRange(
          termSession.termStartDate!,
          termSession.termEndDate!
        );
        const sessionCount = countTermSessions(
          termSession.termStartDate!,
          termSession.termEndDate!,
          termSession.dayOfWeek!
        );
        const expectedSessions = `${sessionCount} sessions`;
        const expectedPrice = formatTermPrice(termSession.price);

        // Assert recurrence pattern is present (e.g., "Every Saturday")
        const recurrenceEl = screen.queryByText(expectedRecurrence);
        expect(recurrenceEl).not.toBeNull();

        // Assert date range is present (e.g., "5 Sep – 26 Sep 2026")
        const dateRangeEl = screen.queryByText(expectedDateRange);
        expect(dateRangeEl).not.toBeNull();

        // Assert session count is present (e.g., "4 sessions")
        const sessionsEl = screen.queryByText(expectedSessions);
        expect(sessionsEl).not.toBeNull();

        // Assert programme price is present (e.g., "£100.00 for the programme")
        const priceEl = screen.queryByText(expectedPrice);
        expect(priceEl).not.toBeNull();

        unmount();
      }),
      { numRuns: 20 } // Limit runs for render-based tests
    );
  });
});
