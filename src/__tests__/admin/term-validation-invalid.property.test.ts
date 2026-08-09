import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { classFormSchema } from '@/app/admin/classes/schema';

/**
 * Feature: recurring-term-classes, Property 2: Term class validation rejects invalid configurations
 *
 * For any term class form submission where termEndDate <= termStartDate,
 * OR termPrice <= 0, the submission SHALL be rejected and the class document
 * SHALL NOT be created.
 *
 * recurrenceDays is optional — an empty array is valid for consecutive-day
 * or explicit-date programmes (Requirements 1.7, 11.8, 11.9).
 *
 * Validates: Requirements 1.5, 1.6, 1.7
 */

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

/** Valid base data for non-term fields so we can isolate term validation failures */
const validBaseData = {
    type: 'kidsAfterSchool',
    dayOfWeek: 'Monday',
    startTime: '15:30',
    endTime: '16:30',
    ageMin: 5,
    ageMax: 12,
    maxSize: 15,
    instructor: 'Test',
    venueId: 'venue-1',
    price: 1500,
    commitment: 'term' as const,
};

/**
 * Generates a date string in YYYY-MM-DD format from integer components.
 * Uses day range 1-28 to avoid month-end edge cases.
 */
const arbDateString = fc.tuple(
    fc.integer({ min: 2020, max: 2034 }),
    fc.integer({ min: 1, max: 12 }),
    fc.integer({ min: 1, max: 28 }),
).map(([year, month, day]) => {
    const m = String(month).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    return `${year}-${m}-${d}`;
});

/**
 * Generates a non-empty subset of days of the week.
 */
const arbNonEmptyDays = fc.subarray([...DAYS_OF_WEEK], { minLength: 1, maxLength: 7 });

/**
 * Generates recurrenceDays that can be empty or non-empty (both are valid).
 */
const arbOptionalDays = fc.subarray([...DAYS_OF_WEEK], { minLength: 0, maxLength: 7 });

describe('Feature: recurring-term-classes, Property 2: Term class validation rejects invalid configurations', () => {
    it('rejects when termEndDate <= termStartDate (for any date pair where end is not after start)', () => {
        fc.assert(
            fc.property(
                arbDateString,
                arbDateString,
                fc.integer({ min: 1 }),
                arbOptionalDays,
                (dateA, dateB, termPrice, recurrenceDays) => {
                    // Ensure endDate <= startDate by picking the later as start, earlier/equal as end
                    const [startDate, endDate] = dateA >= dateB
                        ? [dateA, dateB]
                        : [dateB, dateA];

                    // Only test cases where endDate <= startDate
                    if (endDate > startDate) return; // skip — this shouldn't happen given our sort

                    const data = {
                        ...validBaseData,
                        termStartDate: startDate,
                        termEndDate: endDate,
                        termPrice,
                        recurrenceDays,
                    };

                    const result = classFormSchema.safeParse(data);
                    expect(result.success).toBe(false);
                }
            ),
            { numRuns: 100 }
        );
    });

    it('rejects when termPrice <= 0 (for any non-positive price)', () => {
        fc.assert(
            fc.property(
                fc.integer({ max: 0 }),
                arbDateString,
                arbOptionalDays,
                (termPrice, startDate, recurrenceDays) => {
                    // Generate a valid end date that is after start date
                    const endDateObj = new Date(startDate);
                    endDateObj.setDate(endDateObj.getDate() + 30);
                    const endDate = endDateObj.toISOString().slice(0, 10);

                    const data = {
                        ...validBaseData,
                        termStartDate: startDate,
                        termEndDate: endDate,
                        termPrice,
                        recurrenceDays,
                    };

                    const result = classFormSchema.safeParse(data);
                    expect(result.success).toBe(false);
                }
            ),
            { numRuns: 100 }
        );
    });

    it('accepts when recurrenceDays is empty with valid other fields (Requirement 1.7, 11.9)', () => {
        fc.assert(
            fc.property(
                arbDateString,
                fc.integer({ min: 1 }),
                (startDate, termPrice) => {
                    const endDateObj = new Date(startDate);
                    endDateObj.setDate(endDateObj.getDate() + 30);
                    const endDate = endDateObj.toISOString().slice(0, 10);

                    const data = {
                        ...validBaseData,
                        termStartDate: startDate,
                        termEndDate: endDate,
                        termPrice,
                        recurrenceDays: [], // empty array — should be ACCEPTED for explicit-date programmes
                    };

                    const result = classFormSchema.safeParse(data);
                    expect(result.success).toBe(true);
                }
            ),
            { numRuns: 100 }
        );
    });

    it('rejects when any combination of invalid date/price fields is present', () => {
        /**
         * Generator that always produces at least one invalid field:
         * - invalidDate: endDate <= startDate
         * - invalidPrice: price <= 0
         *
         * Note: recurrenceDays is no longer validated — empty is valid.
         */
        const arbInvalidTermConfig = fc.record({
            invalidDate: fc.boolean(),
            invalidPrice: fc.boolean(),
        }).filter(cfg => cfg.invalidDate || cfg.invalidPrice);

        fc.assert(
            fc.property(
                arbInvalidTermConfig,
                arbDateString,
                fc.integer({ min: 1, max: 100000 }),
                arbOptionalDays,
                (invalidConfig, baseDate, validPrice, recurrenceDays) => {
                    const startDate = baseDate;
                    const endDateObj = new Date(baseDate);
                    endDateObj.setDate(endDateObj.getDate() + 30);
                    let endDate = endDateObj.toISOString().slice(0, 10);
                    let termPrice = validPrice;

                    if (invalidConfig.invalidDate) {
                        // Make endDate <= startDate
                        endDate = startDate;
                    }

                    if (invalidConfig.invalidPrice) {
                        // Make price <= 0
                        termPrice = -Math.abs(validPrice);
                    }

                    const data = {
                        ...validBaseData,
                        termStartDate: startDate,
                        termEndDate: endDate,
                        termPrice,
                        recurrenceDays,
                    };

                    const result = classFormSchema.safeParse(data);
                    expect(result.success).toBe(false);
                }
            ),
            { numRuns: 100 }
        );
    });
});
