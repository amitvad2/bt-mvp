/**
 * Utility functions for recurring term classes.
 * Used by public display components (TermClassCard) and booking flow validation.
 */

/**
 * Formats an array of day names into a human-readable schedule description.
 *
 * Examples:
 *  ['Monday'] → "Every Monday"
 *  ['Monday', 'Wednesday'] → "Every Monday & Wednesday"
 *  ['Monday', 'Wednesday', 'Friday'] → "Every Mon, Wed, Fri"
 */
export function formatRecurrenceDays(days: string[]): string {
  if (days.length === 0) return '';

  if (days.length === 1) {
    return `Every ${days[0]}`;
  }

  if (days.length === 2) {
    return `Every ${days[0]} & ${days[1]}`;
  }

  // For 3+ days, abbreviate to first 3 characters
  const abbreviated = days.map((day) => day.slice(0, 3));
  return `Every ${abbreviated.join(', ')}`;
}

/**
 * Formats a price in pence into a display string for programme classes.
 *
 * Example: 12000 → "£120.00 for the programme"
 */
export function formatTermPrice(pence: number): string {
  const pounds = (pence / 100).toFixed(2);
  return `£${pounds} for the programme`;
}

/**
 * Returns true if the term class is available for booking:
 * current date is on or before termEndDate AND spotsAvailable > 0.
 */
export function isTermClassActive(termEndDate: string, spotsAvailable: number): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const endDate = new Date(termEndDate + 'T00:00:00');

  return endDate >= today && spotsAvailable > 0;
}

/**
 * Returns true if the current date is past the termEndDate.
 * Date format is YYYY-MM-DD.
 */
export function isTermClassExpired(termEndDate: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const endDate = new Date(termEndDate + 'T00:00:00');

  return today > endDate;
}

/**
 * Formats a YYYY-MM-DD date string into a short display format.
 * E.g. "2025-08-24" → "24 Aug" or "24 Aug 2025" (includes year if includeYear is true).
 */
function formatShortDate(dateStr: string, includeYear: boolean): string {
  const date = new Date(dateStr + 'T00:00:00');
  const options: Intl.DateTimeFormatOptions = {
    day: 'numeric',
    month: 'short',
    ...(includeYear && { year: 'numeric' }),
  };
  return date.toLocaleDateString('en-GB', options);
}

/**
 * Formats a programme description for non-recurring programmes (no recurrenceDays).
 *
 * If sessionCount is provided: "{N}-Day Programme, {startDate} – {endDate}"
 *   e.g. "5-Day Programme, 24 Aug – 28 Aug 2025"
 *
 * If sessionCount is not provided: "{startDate} – {endDate}"
 *   e.g. "24 Aug – 28 Aug 2025"
 *
 * The year is only shown on the end date to avoid redundancy when both dates
 * share the same year.
 */
export function formatProgrammeDescription(
  termStartDate: string,
  termEndDate: string,
  sessionCount?: number
): string {
  const startYear = termStartDate.slice(0, 4);
  const endYear = termEndDate.slice(0, 4);

  // Only include year on start date if it differs from end date year
  const startIncludesYear = startYear !== endYear;
  const formattedStart = formatShortDate(termStartDate, startIncludesYear);
  const formattedEnd = formatShortDate(termEndDate, true);

  if (sessionCount != null && sessionCount > 0) {
    return `${sessionCount}-Day Programme, ${formattedStart} – ${formattedEnd}`;
  }

  return `${formattedStart} – ${formattedEnd}`;
}
