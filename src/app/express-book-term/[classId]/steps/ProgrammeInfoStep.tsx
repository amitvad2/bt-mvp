'use client';

/**
 * ProgrammeInfoStep (Step 0) — Displays term class/programme details and a
 * prominent "no account required" message. Allows the parent to continue to Step 1.
 *
 * Shows: programme name, schedule (recurrence days or term period), time slot,
 * venue, age range, term price, spots remaining.
 */

import React from 'react';
import { useGuestTermBooking } from '../GuestTermBookingContext';
import { formatRecurrenceDays, formatTermPrice } from '@/lib/term-utils';
import styles from '../styles/GuestTermBooking.module.css';
import stepStyles from '../styles/Steps.module.css';

export default function ProgrammeInfoStep() {
  const { state, goToStep } = useGuestTermBooking();
  const termClass = state.termClass;

  if (!termClass) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner} />
        <p>Loading programme information...</p>
      </div>
    );
  }

  const formattedStartDate = new Date(termClass.termStartDate + 'T00:00:00').toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const formattedEndDate = new Date(termClass.termEndDate + 'T00:00:00').toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const scheduleDescription = termClass.recurrenceDays.length > 0
    ? formatRecurrenceDays(termClass.recurrenceDays)
    : `${formattedStartDate} – ${formattedEndDate}`;

  const spotsLabel = termClass.spotsAvailable === 1 ? 'spot' : 'spots';
  const isLowAvailability = termClass.spotsAvailable <= 3;

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

      {/* Programme header */}
      <div className={styles.formHeader}>
        <div>
          <h2 className={styles.formTitle}>{termClass.name}</h2>
        </div>
      </div>

      {/* Programme details card */}
      <div className={styles.sessionCard}>
        <div className={styles.sessionDetails}>
          <div className={styles.sessionDetail}>
            <span className={styles.sessionDetailLabel}>Schedule</span>
            <span className={styles.sessionDetailValue}>{scheduleDescription}</span>
          </div>
          <div className={styles.sessionDetail}>
            <span className={styles.sessionDetailLabel}>Period</span>
            <span className={styles.sessionDetailValue}>
              {formattedStartDate} – {formattedEndDate}
            </span>
          </div>
          <div className={styles.sessionDetail}>
            <span className={styles.sessionDetailLabel}>Time</span>
            <span className={styles.sessionDetailValue}>
              {termClass.startTime} – {termClass.endTime}
            </span>
          </div>
          <div className={styles.sessionDetail}>
            <span className={styles.sessionDetailLabel}>Venue</span>
            <span className={styles.sessionDetailValue}>{termClass.venueName}{termClass.venuePostcode ? `, ${termClass.venuePostcode}` : ''}</span>
          </div>
          <div className={styles.sessionDetail}>
            <span className={styles.sessionDetailLabel}>Ages</span>
            <span className={styles.sessionDetailValue}>
              {termClass.ageMin}–{termClass.ageMax} years
            </span>
          </div>
          <div className={styles.sessionDetail}>
            <span className={styles.sessionDetailLabel}>Programme Price</span>
            <span className={styles.sessionPrice}>
              {formatTermPrice(termClass.termPrice)}
            </span>
          </div>
          <div className={styles.sessionDetail}>
            <span className={styles.sessionDetailLabel}>Availability</span>
            <span className={isLowAvailability ? styles.sessionAvailabilityLow : styles.sessionAvailability}>
              {termClass.spotsAvailable} {spotsLabel} remaining
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
