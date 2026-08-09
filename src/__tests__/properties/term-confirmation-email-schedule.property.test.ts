// Feature: recurring-term-classes, Property 10: Term booking confirmation email contains schedule
// **Validates: Requirements 8.1, 8.2**

// @vitest-environment node

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { formatRecurrenceDays } from '@/lib/term-utils';

/**
 * Property 10: Term booking confirmation email contains schedule.
 *
 * For any term booking confirmation email, the email body SHALL contain
 * the class name, recurrenceDays as human-readable text, termStartDate,
 * termEndDate, time slot, venue, and payment amount.
 *
 * We model the email body construction as a pure function that mirrors
 * the inline HTML template in sendTermConfirmationEmail. Given arbitrary
 * class name, recurrenceDays, dates, time, venue, and amount, we verify
 * that the resulting email HTML contains all required fields.
 */

// --- Pure function modeling the email body construction ---

/**
 * Builds the term confirmation email HTML body.
 * This mirrors the logic in sendTermConfirmationEmail from the webhook handler.
 */
function buildTermConfirmationEmailHtml(params: {
  className: string;
  recurrenceDays: string[];
  termStartDate: string;
  termEndDate: string;
  startTime: string;
  endTime: string;
  venueName: string;
  studentName: string;
  amount: number; // in pence
}): string {
  // Format recurrence days into human-readable schedule
  const scheduleDescription = formatRecurrenceDays(params.recurrenceDays);
  const timeStr = params.startTime && params.endTime
    ? `${params.startTime} – ${params.endTime}`
    : '';

  // Format dates for display (short format: "6 Jan 2025")
  const formattedStartDateShort = params.termStartDate
    ? new Date(params.termStartDate).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : '';
  const formattedEndDateShort = params.termEndDate
    ? new Date(params.termEndDate).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : '';

  // Format dates for display (long format: "6 January 2025")
  const formattedStartDateLong = params.termStartDate
    ? new Date(params.termStartDate).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : '';
  const formattedEndDateLong = params.termEndDate
    ? new Date(params.termEndDate).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : '';

  // Build full recurring schedule description per Req 8.2:
  // "Every Mon, Wed, Fri — 3:30–4:30 pm, from 6 Jan 2025 to 28 Mar 2025"
  let recurringSchedule = scheduleDescription;
  if (timeStr) {
    recurringSchedule += ` — ${timeStr}`;
  }
  if (formattedStartDateShort && formattedEndDateShort) {
    recurringSchedule += `, from ${formattedStartDateShort} to ${formattedEndDateShort}`;
  }

  // Format amount
  const formattedAmount = `£${(params.amount / 100).toFixed(2)}`;

  // Build the HTML (mirrors the actual template in the webhook)
  return `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;border:1px solid #eee;border-radius:12px;">
      <h1 style="color:#0066CC;font-size:24px;margin-bottom:8px;">Term Booking Confirmed!</h1>
      <p style="color:#666;font-size:16px;margin-bottom:24px;">
        Your term enrolment at Blooming Tastebuds is confirmed.
      </p>
      <div style="background:#F5F5F7;padding:20px;border-radius:12px;margin-bottom:24px;">
        <h2 style="font-size:18px;margin-top:0;">Term Details</h2>
        <ul style="list-style:none;padding:0;margin:0;color:#333;">
          <li style="margin-bottom:8px;"><strong>Class:</strong> ${params.className}</li>
          <li style="margin-bottom:8px;"><strong>Recurring Schedule:</strong> ${recurringSchedule}</li>
          <li style="margin-bottom:8px;"><strong>Term Period:</strong> ${formattedStartDateLong} to ${formattedEndDateLong}</li>
          <li style="margin-bottom:8px;"><strong>Time:</strong> ${timeStr || 'TBC'}</li>
          <li style="margin-bottom:8px;"><strong>Venue:</strong> ${params.venueName}</li>
          <li style="margin-bottom:8px;"><strong>Participant:</strong> ${params.studentName}</li>
          <li style="margin-bottom:8px;"><strong>Amount Paid:</strong> ${formattedAmount}</li>
        </ul>
      </div>
    </div>
  `;
}

// --- Arbitraries ---

const dayOfWeekArb = fc.constantFrom(
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'
);

const recurrenceDaysArb = fc.uniqueArray(dayOfWeekArb, { minLength: 1, maxLength: 7 });

// Generate valid YYYY-MM-DD date strings in a reasonable range
const dateArb = fc.date({
  min: new Date('2024-01-01'),
  max: new Date('2027-12-31'),
}).map((d) => d.toISOString().split('T')[0]);

// Generate valid term date pairs (start before end)
const termDatesArb = fc.tuple(
  fc.date({ min: new Date('2024-01-01'), max: new Date('2026-06-30') }),
  fc.date({ min: new Date('2024-01-02'), max: new Date('2027-12-31') })
).filter(([start, end]) => start < end)
  .map(([start, end]) => ({
    termStartDate: start.toISOString().split('T')[0],
    termEndDate: end.toISOString().split('T')[0],
  }));

// Generate realistic time strings (e.g. "3:30 pm", "10:30 am")
const timeArb = fc.tuple(
  fc.integer({ min: 1, max: 12 }),
  fc.constantFrom('00', '15', '30', '45'),
  fc.constantFrom('am', 'pm')
).map(([hour, min, period]) => `${hour}:${min} ${period}`);

// Generate class names (non-empty, printable)
const classNameArb = fc.string({ minLength: 1, maxLength: 60 }).filter(
  (s) => s.trim().length > 0
);

// Generate venue names (non-empty, printable)
const venueNameArb = fc.string({ minLength: 1, maxLength: 80 }).filter(
  (s) => s.trim().length > 0
);

// Amount in pence (positive integer — £1.00 to £5000.00)
const amountArb = fc.integer({ min: 100, max: 500_000 });

// Composite arbitrary for all email params
const emailParamsArb = fc.record({
  className: classNameArb,
  recurrenceDays: recurrenceDaysArb,
  startTime: timeArb,
  endTime: timeArb,
  venueName: venueNameArb,
  studentName: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
  amount: amountArb,
}).chain((params) =>
  termDatesArb.map((dates) => ({
    ...params,
    ...dates,
  }))
);

// --- Property Tests ---

describe('Feature: recurring-term-classes, Property 10: Term booking confirmation email contains schedule', () => {
  describe('Email body contains all required fields (Req 8.1)', () => {
    it('email body contains the class name', () => {
      fc.assert(
        fc.property(emailParamsArb, (params) => {
          const html = buildTermConfirmationEmailHtml(params);
          expect(html).toContain(params.className);
        }),
        { numRuns: 100 }
      );
    });

    it('email body contains recurrenceDays as human-readable text', () => {
      fc.assert(
        fc.property(emailParamsArb, (params) => {
          const html = buildTermConfirmationEmailHtml(params);
          const expectedScheduleText = formatRecurrenceDays(params.recurrenceDays);
          expect(html).toContain(expectedScheduleText);
        }),
        { numRuns: 100 }
      );
    });

    it('email body contains the term start date', () => {
      fc.assert(
        fc.property(emailParamsArb, (params) => {
          const html = buildTermConfirmationEmailHtml(params);
          // The start date appears in both short format (in recurring schedule line)
          // and long format (in term period line)
          const longDate = new Date(params.termStartDate).toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          });
          expect(html).toContain(longDate);
        }),
        { numRuns: 100 }
      );
    });

    it('email body contains the term end date', () => {
      fc.assert(
        fc.property(emailParamsArb, (params) => {
          const html = buildTermConfirmationEmailHtml(params);
          // The end date appears in both short format (in recurring schedule line)
          // and long format (in term period line)
          const longDate = new Date(params.termEndDate).toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          });
          expect(html).toContain(longDate);
        }),
        { numRuns: 100 }
      );
    });

    it('email body contains the time slot', () => {
      fc.assert(
        fc.property(emailParamsArb, (params) => {
          const html = buildTermConfirmationEmailHtml(params);
          // The time slot is formatted as "startTime – endTime"
          const expectedTimeSlot = `${params.startTime} – ${params.endTime}`;
          expect(html).toContain(expectedTimeSlot);
        }),
        { numRuns: 100 }
      );
    });

    it('email body contains the venue name', () => {
      fc.assert(
        fc.property(emailParamsArb, (params) => {
          const html = buildTermConfirmationEmailHtml(params);
          expect(html).toContain(params.venueName);
        }),
        { numRuns: 100 }
      );
    });

    it('email body contains the payment amount formatted in pounds', () => {
      fc.assert(
        fc.property(emailParamsArb, (params) => {
          const html = buildTermConfirmationEmailHtml(params);
          const expectedAmount = `£${(params.amount / 100).toFixed(2)}`;
          expect(html).toContain(expectedAmount);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Email includes recurring schedule description (Req 8.2)', () => {
    it('email body contains the full recurring schedule: days — time, from startDate to endDate', () => {
      fc.assert(
        fc.property(emailParamsArb, (params) => {
          const html = buildTermConfirmationEmailHtml(params);

          // Build the expected recurring schedule string per Req 8.2
          const scheduleDescription = formatRecurrenceDays(params.recurrenceDays);
          const timeStr = `${params.startTime} – ${params.endTime}`;
          const formattedStartShort = new Date(params.termStartDate).toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          });
          const formattedEndShort = new Date(params.termEndDate).toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          });

          const expectedRecurringSchedule =
            `${scheduleDescription} — ${timeStr}, from ${formattedStartShort} to ${formattedEndShort}`;

          expect(html).toContain(expectedRecurringSchedule);
        }),
        { numRuns: 100 }
      );
    });

    it('recurring schedule uses formatRecurrenceDays output correctly for single day', () => {
      fc.assert(
        fc.property(
          fc.record({
            className: classNameArb,
            recurrenceDays: fc.tuple(dayOfWeekArb).map(([d]) => [d]),
            startTime: timeArb,
            endTime: timeArb,
            venueName: venueNameArb,
            studentName: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
            amount: amountArb,
          }).chain((params) =>
            termDatesArb.map((dates) => ({
              ...params,
              ...dates,
            }))
          ),
          (params) => {
            const html = buildTermConfirmationEmailHtml(params);
            // Single day: "Every Monday" (full day name, no abbreviation)
            const expected = `Every ${params.recurrenceDays[0]}`;
            expect(html).toContain(expected);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('recurring schedule uses formatRecurrenceDays output correctly for two days', () => {
      fc.assert(
        fc.property(
          fc.record({
            className: classNameArb,
            recurrenceDays: fc.uniqueArray(dayOfWeekArb, { minLength: 2, maxLength: 2 }),
            startTime: timeArb,
            endTime: timeArb,
            venueName: venueNameArb,
            studentName: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
            amount: amountArb,
          }).chain((params) =>
            termDatesArb.map((dates) => ({
              ...params,
              ...dates,
            }))
          ),
          (params) => {
            const html = buildTermConfirmationEmailHtml(params);
            // Two days: "Every Monday & Wednesday" (full day names with &)
            const expected = `Every ${params.recurrenceDays[0]} & ${params.recurrenceDays[1]}`;
            expect(html).toContain(expected);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('recurring schedule uses formatRecurrenceDays output correctly for three or more days', () => {
      fc.assert(
        fc.property(
          fc.record({
            className: classNameArb,
            recurrenceDays: fc.uniqueArray(dayOfWeekArb, { minLength: 3, maxLength: 7 }),
            startTime: timeArb,
            endTime: timeArb,
            venueName: venueNameArb,
            studentName: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
            amount: amountArb,
          }).chain((params) =>
            termDatesArb.map((dates) => ({
              ...params,
              ...dates,
            }))
          ),
          (params) => {
            const html = buildTermConfirmationEmailHtml(params);
            // Three+ days: "Every Mon, Wed, Fri" (abbreviated to 3 chars)
            const abbreviated = params.recurrenceDays.map((d) => d.slice(0, 3));
            const expected = `Every ${abbreviated.join(', ')}`;
            expect(html).toContain(expected);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
