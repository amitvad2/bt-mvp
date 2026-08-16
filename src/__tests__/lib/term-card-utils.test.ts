/**
 * Bug Condition Exploration Test — Term Card Display Text Generation
 *
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.5, 2.7, 2.8**
 *
 * This property-based test is written BEFORE the fix is implemented.
 * It encodes the EXPECTED behaviour for term card utility functions.
 *
 * EXPECTED OUTCOME: This test FAILS on unfixed code because the utility
 * module `src/lib/term-card-utils.ts` does not exist yet — imports will fail,
 * confirming that term sessions currently lack dedicated display text utilities.
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  formatProgrammeSummary,
  formatScheduleLabel,
  formatCtaText,
  formatProgrammePrice,
  formatInlineDates,
} from '@/lib/term-card-utils';

// ============================================================
// Generators
// ============================================================

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

const dayOfWeekArb = fc.constantFrom(...WEEKDAYS);

const activeCountArb = fc.integer({ min: 1, max: 20 });

const ageRangeArb = fc.record({
  ageMin: fc.integer({ min: 3, max: 12 }),
  ageMax: fc.integer({ min: 8, max: 18 }),
}).filter(({ ageMin, ageMax }) => ageMin < ageMax);

const priceInPenceArb = fc.integer({ min: 100, max: 50000 });

const spotsAvailableArb = fc.integer({ min: 0, max: 30 });

const allSameWeekdayArb = fc.boolean();

/**
 * Generate a valid YYYY-MM-DD date string within a reasonable range.
 */
const dateStringArb = fc
  .record({
    year: fc.constantFrom(2025, 2026),
    month: fc.integer({ min: 1, max: 12 }),
    day: fc.integer({ min: 1, max: 28 }), // Stay safe with all months
  })
  .map(({ year, month, day }) => {
    const m = String(month).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    return `${year}-${m}-${d}`;
  });

/**
 * Generate schedule arrays of { date, status } entries.
 * Active count is between 1 and 20, with some entries potentially skipped.
 */
const scheduleEntryArb = fc.record({
  date: dateStringArb,
  recipeId: fc.constant(''),
  recipeName: fc.constant(''),
  recipePhotoUrl: fc.constant(''),
  status: fc.constantFrom('active' as const, 'skipped' as const),
});

const scheduleArrayArb = fc
  .array(scheduleEntryArb, { minLength: 1, maxLength: 25 })
  .filter((entries) => entries.some((e) => e.status === 'active'));

/**
 * Generate term session inputs for property-based testing.
 */
const termSessionInputArb = fc.record({
  activeCount: activeCountArb,
  dayOfWeek: dayOfWeekArb,
  ageMin: fc.integer({ min: 3, max: 12 }),
  ageMax: fc.integer({ min: 8, max: 18 }),
  priceInPence: priceInPenceArb,
  spotsAvailable: spotsAvailableArb,
  allSameWeekday: allSameWeekdayArb,
}).filter(({ ageMin, ageMax }) => ageMin < ageMax);

// ============================================================
// Property Tests
// ============================================================

describe('Term Card Utils — Bug Condition Exploration (Property 1)', () => {
  describe('formatProgrammeSummary', () => {
    it('should produce "{count} {DayName}s • Ages {ageMin}–{ageMax}" when allSameWeekday=true', () => {
      fc.assert(
        fc.property(
          termSessionInputArb.filter(({ allSameWeekday }) => allSameWeekday),
          ({ activeCount, dayOfWeek, ageMin, ageMax, allSameWeekday }) => {
            const result = formatProgrammeSummary(activeCount, dayOfWeek, ageMin, ageMax, allSameWeekday);
            const expected = `${activeCount} ${dayOfWeek}s • Ages ${ageMin}–${ageMax}`;
            expect(result).toBe(expected);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('should produce "{count}-session programme • Ages {ageMin}–{ageMax}" when allSameWeekday=false', () => {
      fc.assert(
        fc.property(
          termSessionInputArb.filter(({ allSameWeekday }) => !allSameWeekday),
          ({ activeCount, dayOfWeek, ageMin, ageMax, allSameWeekday }) => {
            const result = formatProgrammeSummary(activeCount, dayOfWeek, ageMin, ageMax, allSameWeekday);
            const expected = `${activeCount}-session programme • Ages ${ageMin}–${ageMax}`;
            expect(result).toBe(expected);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe('formatScheduleLabel', () => {
    it('should produce "Every {DayName} in {Month}" when same month and allSameWeekday=true', () => {
      fc.assert(
        fc.property(
          fc.record({
            month: fc.integer({ min: 1, max: 12 }),
            dayStart: fc.integer({ min: 1, max: 14 }),
            dayEnd: fc.integer({ min: 15, max: 28 }),
            dayOfWeek: dayOfWeekArb,
          }),
          ({ month, dayStart, dayEnd, dayOfWeek }) => {
            const m = String(month).padStart(2, '0');
            const termStartDate = `2025-${m}-${String(dayStart).padStart(2, '0')}`;
            const termEndDate = `2025-${m}-${String(dayEnd).padStart(2, '0')}`;
            const result = formatScheduleLabel(termStartDate, termEndDate, dayOfWeek, true);
            const monthName = MONTHS[month - 1];
            const expected = `Every ${dayOfWeek} in ${monthName}`;
            expect(result).toBe(expected);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('should produce "{DayName} Programme • {StartMonth}–{EndMonth}" when cross-month and allSameWeekday=true', () => {
      fc.assert(
        fc.property(
          fc.record({
            startMonth: fc.integer({ min: 1, max: 11 }),
            endMonth: fc.integer({ min: 2, max: 12 }),
            dayOfWeek: dayOfWeekArb,
          }).filter(({ startMonth, endMonth }) => startMonth < endMonth),
          ({ startMonth, endMonth, dayOfWeek }) => {
            const termStartDate = `2025-${String(startMonth).padStart(2, '0')}-05`;
            const termEndDate = `2025-${String(endMonth).padStart(2, '0')}-20`;
            const result = formatScheduleLabel(termStartDate, termEndDate, dayOfWeek, true);
            const startMonthName = MONTHS[startMonth - 1];
            const endMonthName = MONTHS[endMonth - 1];
            const expected = `${dayOfWeek} Programme • ${startMonthName}–${endMonthName}`;
            expect(result).toBe(expected);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('should produce "Programme • {Month}" when same month and allSameWeekday=false', () => {
      fc.assert(
        fc.property(
          fc.record({
            month: fc.integer({ min: 1, max: 12 }),
            dayStart: fc.integer({ min: 1, max: 14 }),
            dayEnd: fc.integer({ min: 15, max: 28 }),
            dayOfWeek: dayOfWeekArb,
          }),
          ({ month, dayStart, dayEnd, dayOfWeek }) => {
            const m = String(month).padStart(2, '0');
            const termStartDate = `2025-${m}-${String(dayStart).padStart(2, '0')}`;
            const termEndDate = `2025-${m}-${String(dayEnd).padStart(2, '0')}`;
            const result = formatScheduleLabel(termStartDate, termEndDate, dayOfWeek, false);
            const monthName = MONTHS[month - 1];
            const expected = `Programme • ${monthName}`;
            expect(result).toBe(expected);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('should produce "Programme • {StartMonth}–{EndMonth}" when cross-month and allSameWeekday=false', () => {
      fc.assert(
        fc.property(
          fc.record({
            startMonth: fc.integer({ min: 1, max: 11 }),
            endMonth: fc.integer({ min: 2, max: 12 }),
            dayOfWeek: dayOfWeekArb,
          }).filter(({ startMonth, endMonth }) => startMonth < endMonth),
          ({ startMonth, endMonth, dayOfWeek }) => {
            const termStartDate = `2025-${String(startMonth).padStart(2, '0')}-05`;
            const termEndDate = `2025-${String(endMonth).padStart(2, '0')}-20`;
            const result = formatScheduleLabel(termStartDate, termEndDate, dayOfWeek, false);
            const startMonthName = MONTHS[startMonth - 1];
            const endMonthName = MONTHS[endMonth - 1];
            const expected = `Programme • ${startMonthName}–${endMonthName}`;
            expect(result).toBe(expected);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe('formatCtaText', () => {
    it('should return "Full" when spotsAvailable === 0 regardless of other inputs', () => {
      fc.assert(
        fc.property(
          activeCountArb,
          dayOfWeekArb,
          allSameWeekdayArb,
          (activeCount, dayOfWeek, allSameWeekday) => {
            const result = formatCtaText(activeCount, dayOfWeek, 0, allSameWeekday);
            expect(result).toBe('Full');
          },
        ),
        { numRuns: 100 },
      );
    });

    it('should return "Book All {count} {DayName}s" when allSameWeekday=true and spots > 0', () => {
      fc.assert(
        fc.property(
          activeCountArb,
          dayOfWeekArb,
          fc.integer({ min: 1, max: 30 }),
          (activeCount, dayOfWeek, spotsAvailable) => {
            const result = formatCtaText(activeCount, dayOfWeek, spotsAvailable, true);
            const expected = `Book All ${activeCount} ${dayOfWeek}s`;
            expect(result).toBe(expected);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('should return "Book Full Programme" when allSameWeekday=false and spots > 0', () => {
      fc.assert(
        fc.property(
          activeCountArb,
          dayOfWeekArb,
          fc.integer({ min: 1, max: 30 }),
          (activeCount, dayOfWeek, spotsAvailable) => {
            const result = formatCtaText(activeCount, dayOfWeek, spotsAvailable, false);
            expect(result).toBe('Book Full Programme');
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe('formatProgrammePrice', () => {
    it('should produce "{count}-session programme / £{price} for all {count} sessions" with correct formatting', () => {
      fc.assert(
        fc.property(
          priceInPenceArb,
          activeCountArb,
          (priceInPence, activeCount) => {
            const result = formatProgrammePrice(priceInPence, activeCount);
            const formattedPrice = (priceInPence / 100).toFixed(2);
            const expected = `${activeCount}-session programme / £${formattedPrice} for all ${activeCount} sessions`;
            expect(result).toBe(expected);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe('formatInlineDates', () => {
    it('should output exactly the active entries in chronological order, separated by " • "', () => {
      fc.assert(
        fc.property(scheduleArrayArb, (schedule) => {
          const result = formatInlineDates(schedule);

          // Get active entries sorted chronologically
          const activeEntries = schedule
            .filter((e) => e.status === 'active')
            .sort((a, b) => a.date.localeCompare(b.date));

          // Result should contain exactly as many bullet-separated parts as active entries
          const parts = result.split(' • ');
          expect(parts.length).toBe(activeEntries.length);

          // Each part should be a formatted date (e.g. "5 Sep") corresponding to the active entry
          activeEntries.forEach((entry, idx) => {
            const dateObj = new Date(entry.date + 'T00:00:00');
            const day = dateObj.getDate();
            const monthAbbr = dateObj.toLocaleDateString('en-GB', { month: 'short' });
            const expectedDateStr = `${day} ${monthAbbr}`;
            expect(parts[idx]).toBe(expectedDateStr);
          });
        }),
        { numRuns: 100 },
      );
    });
  });
});
