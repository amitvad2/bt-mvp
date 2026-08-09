import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { formatProgrammeDescription, formatRecurrenceDays } from '@/lib/term-utils';

/**
 * Feature: recurring-term-classes, Property: Programmes with empty recurrenceDays display correctly
 *
 * For any programme class with empty recurrenceDays, the display logic SHALL
 * produce a correct description using the term period and session count
 * (e.g. "5-Day Programme, 24 Aug – 28 Aug 2025") instead of recurrence text.
 *
 * Validates: Requirements 1.7, 11.8, 11.9
 */

/**
 * Generates a YYYY-MM-DD date string from integer-based components.
 */
const arbDateStr = fc.tuple(
    fc.integer({ min: 2020, max: 2034 }),
    fc.integer({ min: 1, max: 12 }),
    fc.integer({ min: 1, max: 28 }),
).map(([year, month, day]) => {
    const m = String(month).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    return `${year}-${m}-${d}`;
});

/**
 * Generates a pair of dates where endDate > startDate.
 */
const arbValidDatePair = fc.tuple(
    arbDateStr,
    fc.integer({ min: 1, max: 90 })
).map(([start, dayOffset]) => {
    const startDate = new Date(start + 'T00:00:00');
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + dayOffset);
    const endStr = endDate.toISOString().slice(0, 10);
    return {
        termStartDate: start,
        termEndDate: endStr,
    };
});

describe('Feature: recurring-term-classes, Programme description display for empty recurrenceDays', () => {
    it('formatRecurrenceDays returns empty string for empty array', () => {
        const result = formatRecurrenceDays([]);
        expect(result).toBe('');
    });

    it('formatProgrammeDescription produces non-empty output for any valid date pair', () => {
        fc.assert(
            fc.property(
                arbValidDatePair,
                fc.option(fc.integer({ min: 1, max: 30 }), { nil: undefined }),
                ({ termStartDate, termEndDate }, sessionCount) => {
                    const result = formatProgrammeDescription(termStartDate, termEndDate, sessionCount);

                    // Must always produce a non-empty string
                    expect(result.length).toBeGreaterThan(0);

                    // Must contain the end date portion (year is always shown)
                    const endYear = termEndDate.slice(0, 4);
                    expect(result).toContain(endYear);
                }
            ),
            { numRuns: 100 }
        );
    });

    it('formatProgrammeDescription includes session count when provided', () => {
        fc.assert(
            fc.property(
                arbValidDatePair,
                fc.integer({ min: 1, max: 30 }),
                ({ termStartDate, termEndDate }, sessionCount) => {
                    const result = formatProgrammeDescription(termStartDate, termEndDate, sessionCount);

                    // Must include "{N}-Day Programme" format
                    expect(result).toContain(`${sessionCount}-Day Programme`);

                    // Must contain the dash separator
                    expect(result).toContain('–');
                }
            ),
            { numRuns: 100 }
        );
    });

    it('formatProgrammeDescription omits session count prefix when not provided', () => {
        fc.assert(
            fc.property(
                arbValidDatePair,
                ({ termStartDate, termEndDate }) => {
                    const result = formatProgrammeDescription(termStartDate, termEndDate);

                    // Must NOT include "-Day Programme" when no session count
                    expect(result).not.toContain('-Day Programme');

                    // Must still contain the dash separator for the date range
                    expect(result).toContain('–');
                }
            ),
            { numRuns: 100 }
        );
    });

    it('programmes with empty recurrenceDays use formatProgrammeDescription for display', () => {
        /**
         * Validates: Requirements 11.8, 11.9
         *
         * When recurrenceDays is empty/absent AND child sessions exist,
         * the display logic should fall back to formatProgrammeDescription
         * which shows "{N}-Day Programme, {startDate} – {endDate}".
         */
        fc.assert(
            fc.property(
                arbValidDatePair,
                fc.integer({ min: 1, max: 20 }),
                ({ termStartDate, termEndDate }, sessionCount) => {
                    const recurrenceDays: string[] = [];

                    // When recurrenceDays is empty, formatRecurrenceDays returns ''
                    const recurrenceText = formatRecurrenceDays(recurrenceDays);
                    expect(recurrenceText).toBe('');

                    // The fallback formatProgrammeDescription produces correct display
                    const description = formatProgrammeDescription(termStartDate, termEndDate, sessionCount);
                    expect(description).toContain(`${sessionCount}-Day Programme`);
                    expect(description.length).toBeGreaterThan(0);
                }
            ),
            { numRuns: 100 }
        );
    });
});
