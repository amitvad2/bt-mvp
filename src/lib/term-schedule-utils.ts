/**
 * Pure utility functions for term session schedule management.
 * No side effects, no Firebase, no external dependencies.
 */

import type { ScheduleEntry } from '@/types';

/**
 * Resolves a session's type from its `sessionType` field.
 * Absent, undefined, or any value other than 'term' defaults to 'single'.
 * Only an explicit 'term' string resolves to 'term'.
 *
 * This is the canonical resolution logic — all components should
 * delegate to this function rather than inline the fallback.
 */
export function resolveSessionType(
  sessionType: string | undefined | null
): 'single' | 'term' {
  return sessionType === 'term' ? 'term' : 'single';
}

/**
 * Returns true only when the session is explicitly a term session.
 * Absent/undefined sessionType defaults to single-date behavior (returns false).
 */
export function isTermSession(
  sessionType: string | undefined | null
): boolean {
  return resolveSessionType(sessionType) === 'term';
}

/** Maps day name strings to JS Date day indices (0 = Sunday, 6 = Saturday) */
const DAY_INDEX: Record<string, number> = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
};

/**
 * Formats a Date object to a YYYY-MM-DD string.
 */
function toDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parses a YYYY-MM-DD string into a Date at midnight (local time avoided — uses UTC-safe approach).
 */
function parseDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Generates the term schedule array — one entry per occurrence of dayOfWeek
 * between startDate and endDate (inclusive).
 *
 * Algorithm:
 * 1. Parse startDate and endDate
 * 2. Find the first occurrence of dayOfWeek on or after startDate
 * 3. Iterate weekly until <= endDate
 * 4. Create a ScheduleEntry for each date with empty recipe fields and 'active' status
 */
export function generateSchedule(
  startDate: string,
  endDate: string,
  dayOfWeek: string
): ScheduleEntry[] {
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  const targetDay = DAY_INDEX[dayOfWeek];

  if (targetDay === undefined) {
    return [];
  }

  // Find first occurrence of dayOfWeek on or after startDate
  const currentDay = start.getDay();
  let daysUntilTarget = (targetDay - currentDay + 7) % 7;
  // If startDate itself is the target day, daysUntilTarget will be 0

  const firstOccurrence = new Date(start);
  firstOccurrence.setDate(firstOccurrence.getDate() + daysUntilTarget);

  const schedule: ScheduleEntry[] = [];
  const cursor = new Date(firstOccurrence);

  while (cursor <= end) {
    schedule.push({
      date: toDateString(cursor),
      recipeId: '',
      recipeName: '',
      recipePhotoUrl: '',
      status: 'active',
    });
    cursor.setDate(cursor.getDate() + 7);
  }

  return schedule;
}

/**
 * Generates the term schedule for multiple days of the week.
 * Calls generateSchedule for each day and merges results in chronological order.
 */
export function generateScheduleMultiDay(
  startDate: string,
  endDate: string,
  daysOfWeek: string[]
): ScheduleEntry[] {
  const allEntries: ScheduleEntry[] = [];
  for (const day of daysOfWeek) {
    allEntries.push(...generateSchedule(startDate, endDate, day));
  }
  // Sort chronologically
  allEntries.sort((a, b) => a.date.localeCompare(b.date));
  return allEntries;
}

/**
 * Validates term date inputs.
 * Checks:
 * - endDate must be after startDate
 * - The specified dayOfWeek must occur at least once in the range
 *
 * Returns { valid: true } or { valid: false, error: string }
 */
export function validateTermDates(
  startDate: string,
  endDate: string,
  dayOfWeek: string
): { valid: boolean; error?: string } {
  const start = parseDate(startDate);
  const end = parseDate(endDate);

  // Check endDate > startDate
  if (end <= start) {
    return { valid: false, error: 'End date must be after start date' };
  }

  // Check dayOfWeek is valid
  if (DAY_INDEX[dayOfWeek] === undefined) {
    return { valid: false, error: `Invalid day of week: ${dayOfWeek}` };
  }

  // Check that the day occurs at least once in the range
  const schedule = generateSchedule(startDate, endDate, dayOfWeek);
  if (schedule.length === 0) {
    return {
      valid: false,
      error: `No occurrences of ${dayOfWeek} found between ${startDate} and ${endDate}`,
    };
  }

  return { valid: true };
}

/**
 * Returns the count of schedule entries with status 'active'.
 */
export function getActiveSessionCount(schedule: ScheduleEntry[]): number {
  return schedule.filter((entry) => entry.status === 'active').length;
}

/**
 * Inserts a new date into the schedule at the correct chronological position.
 * The new entry has empty recipe fields and 'active' status.
 * Returns a new array (does not mutate the original).
 */
export function insertDate(
  schedule: ScheduleEntry[],
  newDate: string
): ScheduleEntry[] {
  const newEntry: ScheduleEntry = {
    date: newDate,
    recipeId: '',
    recipeName: '',
    recipePhotoUrl: '',
    status: 'active',
  };

  // Find insertion index to maintain chronological order
  const insertIndex = schedule.findIndex((entry) => entry.date > newDate);

  if (insertIndex === -1) {
    // New date is after all existing entries — append
    return [...schedule, newEntry];
  }

  // Insert at the correct position
  const result = [...schedule];
  result.splice(insertIndex, 0, newEntry);
  return result;
}

/**
 * Finds the next active schedule entry on or after the reference date.
 * Returns null if no such entry exists.
 */
export function getNextUpcoming(
  schedule: ScheduleEntry[],
  referenceDate: string
): ScheduleEntry | null {
  for (const entry of schedule) {
    if (entry.status === 'active' && entry.date >= referenceDate) {
      return entry;
    }
  }
  return null;
}

/**
 * Returns the display-ready schedule for public/portal views.
 * - Filters to only active entries
 * - Substitutes "Recipe to be announced" for unassigned recipes
 * - Returns simplified objects with date, recipeName, recipePhotoUrl, description, and skills
 */
export function getDisplaySchedule(
  schedule: ScheduleEntry[]
): Array<{ date: string; recipeName: string; recipePhotoUrl: string; recipeDescription: string; recipeSkills: string[] }> {
  return schedule
    .filter((entry) => entry.status === 'active')
    .map((entry) => ({
      date: entry.date,
      recipeName: entry.recipeId ? entry.recipeName : 'Recipe to be announced',
      recipePhotoUrl: entry.recipePhotoUrl,
      recipeDescription: entry.recipeId ? (entry.recipeDescription || '') : '',
      recipeSkills: entry.recipeId ? (entry.recipeSkills || []) : [],
    }));
}
