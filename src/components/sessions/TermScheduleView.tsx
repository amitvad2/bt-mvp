'use client';

import { ChefHat } from 'lucide-react';
import { ScheduleEntry } from '@/types';
import { getDisplaySchedule, getActiveSessionCount } from '@/lib/term-schedule-utils';
import styles from './TermScheduleView.module.css';

interface TermScheduleViewProps {
  schedule: ScheduleEntry[];
}

/**
 * Formats a YYYY-MM-DD date string to "Mon 8 Sep 2025" format.
 */
function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Shared component for displaying the term schedule.
 * Used in both public pages and the portal (My Classes).
 *
 * - Filters out skipped entries via getDisplaySchedule()
 * - Shows recipe photo with ChefHat fallback
 * - Displays "Recipe to be announced" for unassigned dates
 * - Shows total active session count
 * - Handles empty schedules gracefully
 */
export default function TermScheduleView({ schedule }: TermScheduleViewProps) {
  if (!schedule || schedule.length === 0) {
    return (
      <div className={styles.emptyState}>
        <ChefHat size={32} aria-hidden="true" />
        <p className={styles.emptyText}>Schedule coming soon</p>
      </div>
    );
  }

  const displayEntries = getDisplaySchedule(schedule);
  const activeCount = getActiveSessionCount(schedule);

  if (displayEntries.length === 0) {
    return (
      <div className={styles.emptyState}>
        <ChefHat size={32} aria-hidden="true" />
        <p className={styles.emptyText}>Schedule coming soon</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <p className={styles.sessionCount}>
        {activeCount} session{activeCount !== 1 ? 's' : ''}
      </p>

      <ul className={styles.scheduleList} role="list">
        {displayEntries.map((entry) => (
          <li key={entry.date} className={styles.entryRow}>
            <div className={styles.entryDate}>
              <span className={styles.dateText}>{formatDate(entry.date)}</span>
            </div>

            <div className={styles.entryRecipe}>
              {entry.recipePhotoUrl ? (
                <img
                  src={entry.recipePhotoUrl}
                  alt={`Photo of ${entry.recipeName}`}
                  className={styles.recipePhoto}
                />
              ) : (
                <div className={styles.photoFallback} aria-hidden="true">
                  <ChefHat size={20} />
                </div>
              )}
              <span
                className={
                  entry.recipeName === 'Recipe to be announced'
                    ? styles.recipeTba
                    : styles.recipeName
                }
              >
                {entry.recipeName}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
