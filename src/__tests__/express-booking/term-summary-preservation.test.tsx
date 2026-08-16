/**
 * Preservation Property Tests — Single/Non-Term Sessions Render Unchanged
 *
 * These tests observe and lock in the current rendering behavior of
 * SessionInfoStep for non-term sessions. They MUST PASS on the unfixed code
 * and continue to pass after the fix is applied, guaranteeing no regressions.
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.5, 2.5**
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import * as fc from 'fast-check';
import { GuestSessionInfo } from '@/types';

const mockGoToStep = vi.fn();

const baseSession: GuestSessionInfo = {
  id: 'session-123',
  className: 'After School Cooking Club',
  classType: 'kidsAfterSchool',
  date: '2025-03-15',
  startTime: '15:30',
  endTime: '16:30',
  venueName: 'Community Hall',
  ageMin: 5,
  ageMax: 12,
  price: 1500,
  spotsAvailable: 8,
  status: 'open',
};

// Use a mutable holder so tests can swap session data
const holder: { session: GuestSessionInfo | undefined } = { session: baseSession };

vi.mock('@/app/express-booking/[sessionId]/GuestBookingContext', () => ({
  useGuestBooking: () => ({
    state: {
      sessionId: 'session-123',
      session: holder.session,
      currentStep: 0,
    },
    loading: false,
    goToStep: mockGoToStep,
  }),
}));

import SessionInfoStep from '@/app/express-booking/[sessionId]/steps/SessionInfoStep';

// ---------- Generators ----------

/** Generates a valid YYYY-MM-DD date string between 2024 and 2030 */
const arbDateString = fc
  .date({
    min: new Date('2024-01-01T00:00:00'),
    max: new Date('2030-12-31T00:00:00'),
  })
  .map((d) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  });

/** Generates a price in pence (1 to 100000) */
const arbPrice = fc.integer({ min: 1, max: 100000 });

/** Generates a non-term sessionType (single, undefined, or unrecognised) */
const arbNonTermSessionType = fc.oneof(
  fc.constant('single' as string),
  fc.constant(undefined as string | undefined),
  fc.constant('workshop' as string),
  fc.constant('camp' as string),
  fc.constant('' as string)
);

/** Generates a simple alphabetical string for class/venue names */
const arbName = fc
  .string({ minLength: 1, maxLength: 30 })
  .map((s) => s.replace(/[^a-zA-Z ]/g, 'A'))
  .filter((s) => s.trim().length > 0);

/** Generates a time string like "09:30" */
const arbTime = fc
  .tuple(fc.integer({ min: 0, max: 23 }), fc.integer({ min: 0, max: 59 }))
  .map(([h, m]) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);

/** Generates a random non-term GuestSessionInfo */
const arbNonTermSession: fc.Arbitrary<GuestSessionInfo> = fc
  .tuple(arbDateString, arbPrice, arbNonTermSessionType, arbName, arbName, arbTime, arbTime)
  .map(([date, price, sessionType, className, venueName, startTime, endTime]) => {
    const session: Record<string, unknown> = {
      id: 'test-session',
      className,
      classType: 'kidsAfterSchool',
      date,
      startTime,
      endTime,
      venueName,
      ageMin: 5,
      ageMax: 12,
      price,
      spotsAvailable: 5,
      status: 'open',
    };
    if (sessionType !== undefined) {
      session.sessionType = sessionType;
    }
    return session as unknown as GuestSessionInfo;
  });

/** Days of the week for term sessions */
const arbDayOfWeek = fc.constantFrom(
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'
);

/**
 * Generates a term session with INCOMPLETE data (missing one or more of
 * dayOfWeek, termStartDate, termEndDate). This should fall back to single-date format.
 */
const arbIncompleteTermSession: fc.Arbitrary<GuestSessionInfo> = fc
  .tuple(
    arbDateString,
    arbPrice,
    // Which fields to include (at least one must be missing)
    fc.tuple(fc.boolean(), fc.boolean(), fc.boolean()).filter(
      ([hasDow, hasStart, hasEnd]) => !(hasDow && hasStart && hasEnd)
    ),
    arbDayOfWeek,
    arbDateString,
    arbDateString
  )
  .map(([date, price, [hasDow, hasStart, hasEnd], dayOfWeek, termStart, termEnd]) => {
    const session: Record<string, unknown> = {
      id: 'test-session',
      className: 'Term Class',
      classType: 'kidsAfterSchool',
      date,
      startTime: '10:00',
      endTime: '11:00',
      venueName: 'Test Venue',
      ageMin: 5,
      ageMax: 12,
      price,
      spotsAvailable: 5,
      status: 'open',
      sessionType: 'term',
    };
    if (hasDow) session.dayOfWeek = dayOfWeek;
    if (hasStart) session.termStartDate = termStart;
    if (hasEnd) session.termEndDate = termEnd;
    return session as unknown as GuestSessionInfo;
  });

// ---------- Helper ----------

/**
 * Compute the expected locale date string for a given YYYY-MM-DD date,
 * matching the component's formatting logic exactly.
 */
function expectedLocaleDateString(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

// ---------- Tests ----------

describe('Preservation: Single/Non-Term Sessions Render Unchanged', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    holder.session = baseSession;
  });

  describe('Observation tests (concrete examples)', () => {
    it('single session displays full locale date', () => {
      holder.session = { ...baseSession, sessionType: 'single' };
      render(<SessionInfoStep />);
      expect(screen.getByText('Saturday, 15 March 2025')).toBeInTheDocument();
    });

    it('single session displays flat price without programme label', () => {
      holder.session = { ...baseSession, sessionType: 'single', price: 10000 };
      render(<SessionInfoStep />);
      expect(screen.getByText(/£100\.00/)).toBeInTheDocument();
      expect(screen.queryByText(/for the programme/)).not.toBeInTheDocument();
    });

    it('session with absent sessionType renders in single-date format', () => {
      // baseSession has no sessionType defined
      const { sessionType, ...noType } = { ...baseSession } as Record<string, unknown>;
      holder.session = noType as unknown as GuestSessionInfo;
      render(<SessionInfoStep />);
      expect(screen.getByText('Saturday, 15 March 2025')).toBeInTheDocument();
      expect(screen.getByText(/£15\.00/)).toBeInTheDocument();
      expect(screen.queryByText(/for the programme/)).not.toBeInTheDocument();
    });

    it('session with unrecognised sessionType "workshop" renders in single-date format', () => {
      holder.session = { ...baseSession, sessionType: 'workshop' as unknown as 'single' | 'term' };
      render(<SessionInfoStep />);
      expect(screen.getByText('Saturday, 15 March 2025')).toBeInTheDocument();
      expect(screen.getByText(/£15\.00/)).toBeInTheDocument();
      expect(screen.queryByText(/for the programme/)).not.toBeInTheDocument();
    });

    it('term session with missing dayOfWeek/termStartDate/termEndDate renders in single-date format', () => {
      // sessionType is 'term' but no term data fields
      holder.session = { ...baseSession, sessionType: 'term' };
      render(<SessionInfoStep />);
      expect(screen.getByText('Saturday, 15 March 2025')).toBeInTheDocument();
      expect(screen.getByText(/£15\.00/)).toBeInTheDocument();
      expect(screen.queryByText(/for the programme/)).not.toBeInTheDocument();
    });

    it('term session with only dayOfWeek (missing termStartDate/termEndDate) renders single-date format', () => {
      holder.session = { ...baseSession, sessionType: 'term', dayOfWeek: 'Saturday' };
      render(<SessionInfoStep />);
      expect(screen.getByText('Saturday, 15 March 2025')).toBeInTheDocument();
      expect(screen.queryByText(/Every Saturday/)).not.toBeInTheDocument();
    });
  });

  describe('Property: non-term sessions display full locale date and flat price', () => {
    it('for all non-term sessions, rendered output contains locale date and £X.XX price without programme label', () => {
      fc.assert(
        fc.property(arbNonTermSession, (session) => {
          holder.session = session;
          const { unmount } = render(<SessionInfoStep />);

          const expectedDate = expectedLocaleDateString(session.date);
          const expectedPrice = `£${(session.price / 100).toFixed(2)}`;

          // The full locale date must appear in the document
          expect(screen.getByText(expectedDate)).toBeInTheDocument();

          // The price must appear
          expect(screen.getByText(new RegExp(expectedPrice.replace('.', '\\.')))).toBeInTheDocument();

          // "for the programme" must NOT appear
          expect(screen.queryByText(/for the programme/)).not.toBeInTheDocument();

          unmount();
        }),
        { numRuns: 50 }
      );
    });
  });

  describe('Property: term sessions with incomplete data fall back to single-date format', () => {
    it('for term sessions missing dayOfWeek/termStartDate/termEndDate, renders as single session', () => {
      fc.assert(
        fc.property(arbIncompleteTermSession, (session) => {
          holder.session = session;
          const { unmount } = render(<SessionInfoStep />);

          const expectedDate = expectedLocaleDateString(session.date);
          const expectedPrice = `£${(session.price / 100).toFixed(2)}`;

          // Falls back to full locale date
          expect(screen.getByText(expectedDate)).toBeInTheDocument();

          // Falls back to flat price
          expect(screen.getByText(new RegExp(expectedPrice.replace('.', '\\.')))).toBeInTheDocument();

          // No programme label present
          expect(screen.queryByText(/for the programme/)).not.toBeInTheDocument();

          unmount();
        }),
        { numRuns: 50 }
      );
    });
  });
});
