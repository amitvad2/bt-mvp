'use client';

/**
 * SessionInfoStep (Step 0) — Displays session details and a prominent
 * "no account required" message. Allows the parent to continue to Step 1.
 *
 * Validates: GUEST-FR-001 (1.3), GUEST-UX-002 (29.1)
 */

import React from 'react';
import { useGuestBooking } from '../GuestBookingContext';
import { formatRecurrenceDays, formatTermPrice, countTermSessions, formatTermDateRange } from '@/lib/term-utils';
import styles from '../styles/GuestBooking.module.css';
import stepStyles from '../styles/Steps.module.css';

export default function SessionInfoStep() {
  const { state, goToStep } = useGuestBooking();
  const session = state.session;

  if (!session) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner} />
        <p>Loading session information...</p>
      </div>
    );
  }

  const isTermWithFullData =
    session.sessionType === 'term' &&
    !!session.dayOfWeek &&
    !!session.termStartDate &&
    !!session.termEndDate;

  const formattedDate = new Date(session.date + 'T00:00:00').toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const spotsLabel = session.spotsAvailable === 1 ? 'spot' : 'spots';
  const isLowAvailability = session.spotsAvailable <= 3;

  return (
    <div>
      {/* Guest badge */}
      <div className={styles.guestBadge}>
        <span aria-hidden="true">✨</span>
        <span>Express Booking</span>
      </div>

      {/* No account required — prominent message */}
      <div className={styles.noAccountMessage} role="status">
        <span aria-hidden="true">🔓</span>
        <span>No account required — book in minutes</span>
      </div>

      {/* Session header */}
      <div className={styles.formHeader}>
        <div>
          <h2 className={styles.formTitle}>{session.className}</h2>
          <p className={styles.formSubtitle}>{session.classType}</p>
        </div>
      </div>

      {/* Session details card */}
      <div className={styles.sessionCard}>
        <div className={styles.sessionDetails}>
          {isTermWithFullData ? (
            <>
              <div className={styles.sessionDetail}>
                <span className={styles.sessionDetailLabel}>Schedule</span>
                <span className={styles.sessionDetailValue}>{formatRecurrenceDays([session.dayOfWeek!])}</span>
              </div>
              <div className={styles.sessionDetail}>
                <span className={styles.sessionDetailLabel}>Dates</span>
                <span className={styles.sessionDetailValue}>{formatTermDateRange(session.termStartDate!, session.termEndDate!)}</span>
              </div>
              <div className={styles.sessionDetail}>
                <span className={styles.sessionDetailLabel}>Sessions</span>
                <span className={styles.sessionDetailValue}>{countTermSessions(session.termStartDate!, session.termEndDate!, session.dayOfWeek!)} sessions</span>
              </div>
            </>
          ) : (
            <div className={styles.sessionDetail}>
              <span className={styles.sessionDetailLabel}>Date</span>
              <span className={styles.sessionDetailValue}>{formattedDate}</span>
            </div>
          )}
          <div className={styles.sessionDetail}>
            <span className={styles.sessionDetailLabel}>Time</span>
            <span className={styles.sessionDetailValue}>
              {session.startTime} – {session.endTime}
            </span>
          </div>
          <div className={styles.sessionDetail}>
            <span className={styles.sessionDetailLabel}>Venue</span>
            <span className={styles.sessionDetailValue}>{session.venueName}</span>
          </div>
          <div className={styles.sessionDetail}>
            <span className={styles.sessionDetailLabel}>Ages</span>
            <span className={styles.sessionDetailValue}>
              {session.ageMin}–{session.ageMax} years
            </span>
          </div>
          <div className={styles.sessionDetail}>
            <span className={styles.sessionDetailLabel}>Price</span>
            <span className={styles.sessionPrice}>
              {isTermWithFullData
                ? formatTermPrice(session.price)
                : `£${(session.price / 100).toFixed(2)}`}
            </span>
          </div>
          <div className={styles.sessionDetail}>
            <span className={styles.sessionDetailLabel}>Availability</span>
            <span className={isLowAvailability ? styles.sessionAvailabilityLow : styles.sessionAvailability}>
              {session.spotsAvailable} {spotsLabel} remaining
            </span>
          </div>
        </div>
      </div>

      {/* Continue button */}
      <div className={styles.actions}>
        <div />
        <button
          className={styles.btnPrimary}
          onClick={() => goToStep(1)}
          type="button"
        >
          Continue →
        </button>
      </div>
    </div>
  );
}
