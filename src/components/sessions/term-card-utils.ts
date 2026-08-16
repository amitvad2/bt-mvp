import type { ScheduleEntry } from '@/types';

/**
 * Computes the commitment banner sentence based on the schedule pattern.
 *
 * If all active sessions fall on the same weekday, includes the day name.
 * If active sessions span multiple weekdays, uses a generic phrasing.
 */
export function getCommitmentBannerText(
  schedule: ScheduleEntry[],
  termStartDate: string
): string {
  const activeEntries = schedule.filter((entry) => entry.status === 'active');
  const n = activeEntries.length;

  const month = new Date(termStartDate).toLocaleDateString('en-GB', {
    month: 'long',
  });

  const weekdays = activeEntries.map((entry) =>
    new Date(entry.date).toLocaleDateString('en-GB', { weekday: 'long' })
  );

  const allSameWeekday = weekdays.every((day) => day === weekdays[0]);

  if (allSameWeekday && weekdays.length > 0) {
    const dayName = weekdays[0];
    return `Book all ${n} ${dayName} sessions for the full ${month} term \u2014 one upfront payment.`;
  }

  return `Book all ${n} sessions for the full ${month} term \u2014 one upfront payment.`;
}

/**
 * Formats active session dates into a comma-separated display string with truncation.
 *
 * Filters to active entries, sorts chronologically, formats each date as "{day} {month}"
 * using en-GB locale. If the joined string exceeds 60 characters, truncates after the
 * last complete date that fits and appends "… +{n} more".
 */
export function formatSessionDates(schedule: ScheduleEntry[]): string {
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

  const fullString = formattedDates.join(', ');

  if (fullString.length <= 60) {
    return fullString;
  }

  // Find the last complete date that fits within 60 chars
  let visibleCount = 0;
  let currentLength = 0;

  for (let i = 0; i < formattedDates.length; i++) {
    const addition = i === 0 ? formattedDates[i].length : formattedDates[i].length + 2; // +2 for ", "
    if (currentLength + addition > 60) {
      break;
    }
    currentLength += addition;
    visibleCount++;
  }

  const remaining = formattedDates.length - visibleCount;
  const visiblePortion = formattedDates.slice(0, visibleCount).join(', ');

  return `${visiblePortion}\u2026 +${remaining} more`;
}

/**
 * Formats the price row display text for a term card.
 *
 * When there are active sessions, shows "All {n} sessions · £X.XX".
 * When there are no active sessions (schedule missing/empty), shows just "£X.XX".
 */
export function formatTermPrice(
  activeCount: number,
  priceInPence: number
): string {
  const formattedPrice = `\u00A3${(priceInPence / 100).toFixed(2)}`;

  if (activeCount > 0) {
    return `All ${activeCount} sessions \u00B7 ${formattedPrice}`;
  }

  return formattedPrice;
}
