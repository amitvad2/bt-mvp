import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  getCommitmentBannerText,
  formatTermPrice,
  formatSessionDates,
} from '@/components/sessions/term-card-utils';
import type { ScheduleEntry } from '@/types';

/**
 * Generator for a valid YYYY-MM-DD date string within a plausible range.
 */
const arbDate = fc
  .integer({ min: 0, max: 1095 }) // 0–1095 days from 2024-01-01 (~3 years)
  .map((offset) => {
    const base = new Date('2024-01-01T00:00:00Z');
    base.setUTCDate(base.getUTCDate() + offset);
    const year = base.getUTCFullYear();
    const month = String(base.getUTCMonth() + 1).padStart(2, '0');
    const day = String(base.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  });

/**
 * Generator for a ScheduleEntry with random date and status.
 */
const arbScheduleEntry = fc.record({
  date: arbDate,
  recipeId: fc.string({ minLength: 1, maxLength: 8 }),
  recipeName: fc.string({ minLength: 1, maxLength: 20 }),
  recipePhotoUrl: fc.constant(''),
  status: fc.constantFrom('active' as const, 'skipped' as const),
});

/**
 * Generator for a schedule array with 1–12 entries containing a mix of statuses.
 */
const arbScheduleWithMix = fc.array(arbScheduleEntry, { minLength: 1, maxLength: 12 });

/**
 * Generator for a date on a specific weekday (0=Sun, 1=Mon, ..., 6=Sat).
 * Picks a base date that falls on the target weekday, then adds multiples of 7.
 */
function arbDateOnWeekday(weekday: number): fc.Arbitrary<string> {
  // Find the first date in 2024 that falls on the given weekday
  // 2024-01-01 is a Monday (weekday 1)
  const baseOffset = (weekday - 1 + 7) % 7; // offset from 2024-01-01 to reach target weekday
  return fc.integer({ min: 0, max: 51 }).map((weekIndex) => {
    const totalOffset = baseOffset + weekIndex * 7;
    const base = new Date('2024-01-01T00:00:00Z');
    base.setUTCDate(base.getUTCDate() + totalOffset);
    const year = base.getUTCFullYear();
    const month = String(base.getUTCMonth() + 1).padStart(2, '0');
    const day = String(base.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  });
}

/**
 * Generator for a schedule where all active entries share the same weekday.
 */
const arbSameWeekdaySchedule = fc
  .integer({ min: 0, max: 6 })
  .chain((weekday) =>
    fc
      .array(
        fc.record({
          date: arbDateOnWeekday(weekday),
          recipeId: fc.string({ minLength: 1, maxLength: 8 }),
          recipeName: fc.string({ minLength: 1, maxLength: 20 }),
          recipePhotoUrl: fc.constant(''),
          status: fc.constant('active' as const),
        }),
        { minLength: 1, maxLength: 8 }
      )
  );

/**
 * Generator for a schedule where active entries span multiple weekdays.
 */
const arbMultiWeekdaySchedule = fc
  .tuple(
    fc.integer({ min: 0, max: 6 }),
    fc.integer({ min: 0, max: 6 })
  )
  .filter(([a, b]) => a !== b)
  .chain(([weekdayA, weekdayB]) =>
    fc.tuple(
      fc.array(
        fc.record({
          date: arbDateOnWeekday(weekdayA),
          recipeId: fc.string({ minLength: 1, maxLength: 8 }),
          recipeName: fc.string({ minLength: 1, maxLength: 20 }),
          recipePhotoUrl: fc.constant(''),
          status: fc.constant('active' as const),
        }),
        { minLength: 1, maxLength: 4 }
      ),
      fc.array(
        fc.record({
          date: arbDateOnWeekday(weekdayB),
          recipeId: fc.string({ minLength: 1, maxLength: 8 }),
          recipeName: fc.string({ minLength: 1, maxLength: 20 }),
          recipePhotoUrl: fc.constant(''),
          status: fc.constant('active' as const),
        }),
        { minLength: 1, maxLength: 4 }
      )
    ).map(([a, b]) => [...a, ...b])
  );

// Feature: term-card-redesign, Property 1: Banner text adapts to schedule weekday pattern
describe('getCommitmentBannerText — Property Tests', () => {
  describe('Property 1: Banner text adapts to schedule weekday pattern', () => {
    /**
     * Validates: Requirements 1.3
     *
     * For any non-empty schedule of active sessions where all active session dates
     * fall on the same weekday, the commitment banner text SHALL contain that weekday name.
     */
    it('same-weekday schedules include the weekday name in the banner', () => {
      fc.assert(
        fc.property(arbSameWeekdaySchedule, arbDate, (schedule, termStartDate) => {
          const result = getCommitmentBannerText(schedule, termStartDate);

          // Get the weekday name from the first active entry
          const firstActiveDate = schedule.find((e) => e.status === 'active')!.date;
          const weekdayName = new Date(firstActiveDate).toLocaleDateString('en-GB', {
            weekday: 'long',
          });

          expect(result).toContain(weekdayName);
        }),
        { numRuns: 100 }
      );
    });

    /**
     * Validates: Requirements 1.3
     *
     * For any non-empty schedule of active sessions spanning multiple different weekdays,
     * the commitment banner text SHALL NOT contain any weekday name.
     */
    it('multi-weekday schedules do NOT include any weekday name in the banner', () => {
      const allWeekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

      fc.assert(
        fc.property(arbMultiWeekdaySchedule, arbDate, (schedule, termStartDate) => {
          const result = getCommitmentBannerText(schedule, termStartDate);

          for (const day of allWeekdays) {
            expect(result).not.toContain(day);
          }
        }),
        { numRuns: 100 }
      );
    });
  });
});

// Feature: term-card-redesign, Property 2: Price row format reflects active count
describe('formatTermPrice — Property Tests', () => {
  describe('Property 2: Price row format reflects active count', () => {
    /**
     * Validates: Requirements 2.1, 2.4, 2.5
     *
     * For any activeCount > 0 and valid priceInPence, the output SHALL match
     * "All {activeCount} sessions · £{(price/100).toFixed(2)}".
     */
    it('activeCount > 0 produces "All {n} sessions · £{formatted}" pattern', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 100 }),
          fc.integer({ min: 0, max: 999999 }),
          (activeCount, priceInPence) => {
            const result = formatTermPrice(activeCount, priceInPence);
            const expectedPrice = `\u00A3${(priceInPence / 100).toFixed(2)}`;
            const expected = `All ${activeCount} sessions \u00B7 ${expectedPrice}`;
            expect(result).toBe(expected);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Validates: Requirements 2.4, 2.5
     *
     * For activeCount === 0, the output SHALL match "£{formatted}" with no session count prefix.
     */
    it('activeCount === 0 produces "£{formatted}" with no "sessions" prefix', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 999999 }),
          (priceInPence) => {
            const result = formatTermPrice(0, priceInPence);
            const expectedPrice = `\u00A3${(priceInPence / 100).toFixed(2)}`;
            expect(result).toBe(expectedPrice);
            expect(result).not.toContain('sessions');
            expect(result.startsWith('\u00A3')).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});

describe('formatSessionDates — Property Tests', () => {
  // Feature: term-card-redesign, Property 3: Session dates contain only active entries in chronological order
  describe('Property 3: Session dates contain only active entries in chronological order', () => {
    /**
     * Validates: Requirements 5.2, 5.3
     *
     * For any schedule array containing a mix of active and skipped entries,
     * the formatted session dates string SHALL contain only dates from entries
     * with status === 'active', and those dates SHALL appear in ascending
     * chronological order.
     */
    it('output contains only active dates in ascending chronological order', () => {
      fc.assert(
        fc.property(arbScheduleWithMix, (schedule: ScheduleEntry[]) => {
          const result = formatSessionDates(schedule);

          const activeEntries = schedule
            .filter((entry) => entry.status === 'active')
            .sort((a, b) => a.date.localeCompare(b.date));

          // If no active entries, the result should be empty
          if (activeEntries.length === 0) {
            expect(result).toBe('');
            return;
          }

          // Format active dates for comparison using the same formatter
          const formatter = new Intl.DateTimeFormat('en-GB', {
            day: 'numeric',
            month: 'short',
          });

          const expectedFormattedDates = activeEntries.map((entry) =>
            formatter.format(new Date(entry.date))
          );

          // The result may be truncated, so extract the visible dates
          // Handle truncation case: "5 Sept, 12 Sept… +2 more"
          const truncationMatch = result.match(/^(.+)\u2026 \+(\d+) more$/);

          let visibleDatesStr: string;
          let remainingCount: number;

          if (truncationMatch) {
            visibleDatesStr = truncationMatch[1];
            remainingCount = parseInt(truncationMatch[2], 10);
          } else {
            visibleDatesStr = result;
            remainingCount = 0;
          }

          // Split visible dates
          const visibleDates = visibleDatesStr
            .split(', ')
            .map((d) => d.trim())
            .filter((d) => d.length > 0);

          // All visible dates should be from the expected active dates in order
          const visibleCount = visibleDates.length;
          expect(visibleCount + remainingCount).toBe(expectedFormattedDates.length);

          // Verify visible dates match the first N expected dates (chronological order)
          for (let i = 0; i < visibleCount; i++) {
            expect(visibleDates[i]).toBe(expectedFormattedDates[i]);
          }
        }),
        { numRuns: 100 }
      );
    });

    /**
     * Validates: Requirements 5.3
     *
     * No date from a skipped entry shall appear in the output string.
     * We verify this by checking that the set of ISO dates that contributed
     * to the output contains no skipped-only dates.
     */
    it('no skipped entry date appears in the output', () => {
      fc.assert(
        fc.property(arbScheduleWithMix, (schedule: ScheduleEntry[]) => {
          const result = formatSessionDates(schedule);

          if (result === '') {
            return; // Empty output means nothing rendered — trivially correct
          }

          // Collect dates that are ONLY skipped (no active entry shares the same date)
          const activeDates = new Set(
            schedule
              .filter((entry) => entry.status === 'active')
              .map((entry) => entry.date)
          );

          const skippedOnlyDates = schedule
            .filter((entry) => entry.status === 'skipped' && !activeDates.has(entry.date))
            .map((entry) => entry.date);

          if (skippedOnlyDates.length === 0) {
            return; // All skipped dates coincide with active dates — nothing to check
          }

          // Format each skipped-only date the same way the function does
          const formatter = new Intl.DateTimeFormat('en-GB', {
            day: 'numeric',
            month: 'short',
          });

          // Build set of formatted active dates for comparison
          const formattedActiveDates = new Set(
            [...activeDates].map((d) => formatter.format(new Date(d)))
          );

          // For each skipped-only date, verify its formatted form does NOT appear
          // in the output — but only if no active date produces the same formatted string
          // (e.g. same day+month but different year)
          for (const skippedDate of skippedOnlyDates) {
            const formattedSkipped = formatter.format(new Date(skippedDate));

            // If an active date happens to format identically (same day+month, different year),
            // then it's expected to appear in the output. Only assert exclusion when no
            // active date shares the same formatted representation.
            if (!formattedActiveDates.has(formattedSkipped)) {
              const resultDates = result.replace(/\u2026 \+\d+ more$/, '').split(', ');
              expect(resultDates).not.toContain(formattedSkipped);
            }
          }
        }),
        { numRuns: 100 }
      );
    });
  });

  // Feature: term-card-redesign, Property 4: Session dates truncation respects 60-character limit
  describe('Property 4: Session dates truncation respects 60-character limit', () => {
    /**
     * Generator for a schedule with 6–12 active entries spread across different months
     * to ensure the formatted string exceeds 60 characters.
     */
    const arbLargeActiveSchedule = fc
      .integer({ min: 6, max: 12 })
      .chain((count) =>
        fc.array(
          fc.record({
            // Use dates spread across different months to get longer formatted strings
            date: fc.integer({ min: 0, max: 364 }).map((offset) => {
              // Spread entries across months by using larger offsets
              const spreadOffset = offset;
              const base = new Date('2024-01-01T00:00:00Z');
              base.setUTCDate(base.getUTCDate() + spreadOffset);
              const year = base.getUTCFullYear();
              const month = String(base.getUTCMonth() + 1).padStart(2, '0');
              const day = String(base.getUTCDate()).padStart(2, '0');
              return `${year}-${month}-${day}`;
            }),
            recipeId: fc.constant('r1'),
            recipeName: fc.constant('Recipe'),
            recipePhotoUrl: fc.constant(''),
            status: fc.constant('active' as const),
          }),
          { minLength: count, maxLength: count }
        )
      );

    /**
     * Validates: Requirements 5.5
     *
     * For any list of active session dates where the full comma-separated string
     * exceeds 60 characters, the visible portion SHALL be ≤ 60 characters (excluding suffix).
     */
    it('visible portion is ≤ 60 characters when truncation occurs', () => {
      fc.assert(
        fc.property(arbLargeActiveSchedule, (schedule: ScheduleEntry[]) => {
          const result = formatSessionDates(schedule);

          // Check if truncation occurred
          const truncationMatch = result.match(/^(.+)\u2026 \+(\d+) more$/);
          if (!truncationMatch) {
            // No truncation — full string must be ≤ 60 chars
            expect(result.length).toBeLessThanOrEqual(60);
            return;
          }

          // The visible portion (before the ellipsis) must be ≤ 60 characters
          const visiblePortion = truncationMatch[1];
          expect(visiblePortion.length).toBeLessThanOrEqual(60);
        }),
        { numRuns: 100 }
      );
    });

    /**
     * Validates: Requirements 5.5
     *
     * The suffix SHALL match "… +{n} more" where n equals the count of
     * undisplayed active sessions.
     */
    it('suffix matches "… +{n} more" with correct count of undisplayed sessions', () => {
      fc.assert(
        fc.property(arbLargeActiveSchedule, (schedule: ScheduleEntry[]) => {
          const result = formatSessionDates(schedule);

          const truncationMatch = result.match(/^(.+)\u2026 \+(\d+) more$/);
          if (!truncationMatch) {
            // No truncation — nothing to validate about suffix
            return;
          }

          const visiblePortion = truncationMatch[1];
          const reportedRemaining = parseInt(truncationMatch[2], 10);

          // Count visible dates
          const visibleDates = visiblePortion
            .split(', ')
            .map((d) => d.trim())
            .filter((d) => d.length > 0);

          // Total active entries
          const totalActive = schedule.filter((e) => e.status === 'active').length;

          // n must equal total active minus visible count
          expect(reportedRemaining).toBe(totalActive - visibleDates.length);
          expect(reportedRemaining).toBeGreaterThan(0);
        }),
        { numRuns: 100 }
      );
    });

    /**
     * Validates: Requirements 5.5
     *
     * The visible portion SHALL end with a complete formatted date — no partial dates
     * like "5 Se" cut off mid-word.
     */
    it('visible portion ends with a complete date (no partial dates)', () => {
      fc.assert(
        fc.property(arbLargeActiveSchedule, (schedule: ScheduleEntry[]) => {
          const result = formatSessionDates(schedule);

          const truncationMatch = result.match(/^(.+)\u2026 \+(\d+) more$/);
          if (!truncationMatch) {
            return; // No truncation — nothing to validate
          }

          const visiblePortion = truncationMatch[1];

          // Format all active dates the same way the function does
          const formatter = new Intl.DateTimeFormat('en-GB', {
            day: 'numeric',
            month: 'short',
          });

          const activeEntries = schedule
            .filter((entry) => entry.status === 'active')
            .sort((a, b) => a.date.localeCompare(b.date));

          const formattedDates = activeEntries.map((entry) =>
            formatter.format(new Date(entry.date))
          );

          // The visible portion should be exactly the first N dates joined with ", "
          // (i.e., it must end on a complete date boundary)
          const visibleDates = visiblePortion.split(', ');
          const lastVisibleDate = visibleDates[visibleDates.length - 1];

          // The last visible date must be one of the known fully-formatted dates
          expect(formattedDates).toContain(lastVisibleDate);

          // Additionally, reconstructing from the visible dates should match the visible portion
          expect(visibleDates.join(', ')).toBe(visiblePortion);
        }),
        { numRuns: 100 }
      );
    });
  });
});
