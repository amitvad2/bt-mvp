'use client';

/**
 * Guest Express Term Checkout — Confirmation Client Component
 *
 * Reads paymentIntentId and classId from sessionStorage (set during payment).
 * Polls GET /api/guest-booking-status?pi={piId}&class={classId} every 2.5s.
 * Displays pending message while waiting, then booking summary when confirmed.
 * Clears sessionStorage guest term booking state on successful display.
 */

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { CheckCircle, Calendar, MapPin, ChefHat, Clock, ShieldCheck, Repeat } from 'lucide-react';
import styles from './Confirmation.module.css';

interface TermBookingSummary {
  reference: string;
  childFirstName: string;
  className: string;
  termStartDate: string;
  termEndDate: string;
  startTime: string;
  endTime: string;
  venueName: string;
  recurrenceDays: string[];
  amountPaid: number; // pence
}

type ConfirmationStatus = 'loading' | 'pending' | 'confirmed' | 'error' | 'no-data';

const POLL_INTERVAL_MS = 2500;
const MAX_POLL_ATTEMPTS = 30; // ~75 seconds total

interface ConfirmationClientProps {
  classId: string;
}

export default function ConfirmationClient({ classId }: ConfirmationClientProps) {
  const [status, setStatus] = useState<ConfirmationStatus>('loading');
  const [booking, setBooking] = useState<TermBookingSummary | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const pollCountRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);
  const hasStartedRef = useRef(false);

  useEffect(() => {
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;

    cancelledRef.current = false;
    pollCountRef.current = 0;

    let piId: string | null = null;
    let storedClassId: string | null = null;

    try {
      piId = sessionStorage.getItem('guest_term_paymentIntentId');
      storedClassId = sessionStorage.getItem('guest_term_classId');
    } catch (e) {
      console.error('[term-confirmation] sessionStorage unavailable:', e);
    }

    if (!piId || !storedClassId) {
      queueMicrotask(() => setStatus('no-data'));
      return;
    }

    const clearGuestState = () => {
      try {
        sessionStorage.removeItem('guest_term_paymentIntentId');
        sessionStorage.removeItem('guest_term_classId');
        sessionStorage.removeItem(`guest_term_booking_${classId}`);
      } catch (e) {
        console.error('[term-confirmation] Error clearing sessionStorage:', e);
      }
    };

    const poll = async () => {
      if (cancelledRef.current) return;

      pollCountRef.current += 1;

      try {
        const res = await fetch(
          `/api/guest-booking-status?pi=${encodeURIComponent(piId!)}&class=${encodeURIComponent(storedClassId!)}`
        );

        if (cancelledRef.current) return;

        if (!res.ok) {
          if (res.status === 429 && pollCountRef.current < MAX_POLL_ATTEMPTS) {
            timerRef.current = setTimeout(poll, POLL_INTERVAL_MS * 2);
            return;
          }
          setStatus('error');
          setErrorMessage('Unable to retrieve booking status. Please check your email for confirmation.');
          return;
        }

        const data = await res.json();

        if (data.status === 'pending') {
          setStatus('pending');
          if (pollCountRef.current < MAX_POLL_ATTEMPTS) {
            timerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
          }
          return;
        }

        if (data.status === 'confirmed') {
          setBooking({
            reference: data.reference,
            childFirstName: data.childFirstName,
            className: data.className,
            termStartDate: data.termStartDate || '',
            termEndDate: data.termEndDate || '',
            startTime: data.startTime || '',
            endTime: data.endTime || '',
            venueName: data.venueName,
            recurrenceDays: data.recurrenceDays || [],
            amountPaid: data.amountPaid,
          });
          setStatus('confirmed');
          clearGuestState();
          return;
        }

        setStatus('error');
        setErrorMessage('Unexpected booking status. Please check your email for confirmation.');
      } catch (err) {
        console.error('[term-confirmation] Poll error:', err);
        if (!cancelledRef.current && pollCountRef.current < MAX_POLL_ATTEMPTS) {
          timerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
        } else if (!cancelledRef.current) {
          setStatus('error');
          setErrorMessage('Network error. Please check your email for confirmation.');
        }
      }
    };

    poll();

    return () => {
      cancelledRef.current = true;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [classId]);

  const formatPrice = (pence: number) => `£${(pence / 100).toFixed(2)}`;

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  // No sessionStorage data
  if (status === 'no-data') {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <div className={styles.iconWrap}>
            <Clock size={48} />
          </div>
          <h1 className={styles.title}>No Booking Found</h1>
          <p className={styles.subtitle}>
            We couldn&apos;t find payment details for this programme. If you&apos;ve just completed
            a payment, please check your email for a confirmation.
          </p>
        </div>
      </div>
    );
  }

  // Loading / Pending
  if (status === 'loading' || status === 'pending') {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <div className={styles.iconWrap}>
            <div className={styles.spinner} />
          </div>
          <h1 className={styles.title}>Payment received. We are finalising your enrolment.</h1>
          <p className={styles.subtitle}>
            This usually takes a few seconds. Please don&apos;t close this page.
          </p>
        </div>
      </div>
    );
  }

  // Error state
  if (status === 'error') {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <div className={`${styles.iconWrap} ${styles.iconWrapWarning}`}>
            <Clock size={48} />
          </div>
          <h1 className={styles.title}>Booking Processing</h1>
          <p className={styles.subtitle}>{errorMessage}</p>
        </div>
      </div>
    );
  }

  // Confirmed
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={`${styles.iconWrap} ${styles.iconWrapSuccess}`}>
          <CheckCircle size={48} />
        </div>
        <h1 className={styles.title}>Programme Booking Confirmed!</h1>
        <p className={styles.subtitle}>
          Thank you for booking with Blooming Tastebuds. We can&apos;t wait to see{' '}
          {booking?.childFirstName || 'your child'} in the kitchen!
        </p>
      </div>

      {booking && (
        <div className={styles.detailsCard}>
          <div className={styles.bookingRef}>
            <span>Booking Reference</span>
            <strong>{booking.reference.toUpperCase()}</strong>
          </div>

          <div className={styles.grid}>
            <div className={styles.detail}>
              <ChefHat size={18} />
              <div>
                <strong>Programme</strong>
                <p>{booking.className}</p>
              </div>
            </div>
            <div className={styles.detail}>
              <Calendar size={18} />
              <div>
                <strong>Period</strong>
                <p>{formatDate(booking.termStartDate)} – {formatDate(booking.termEndDate)}</p>
              </div>
            </div>
            {booking.recurrenceDays.length > 0 && (
              <div className={styles.detail}>
                <Repeat size={18} />
                <div>
                  <strong>Schedule</strong>
                  <p>{booking.recurrenceDays.join(', ')}</p>
                </div>
              </div>
            )}
            <div className={styles.detail}>
              <Clock size={18} />
              <div>
                <strong>Time</strong>
                <p>{booking.startTime} – {booking.endTime}</p>
              </div>
            </div>
            <div className={styles.detail}>
              <MapPin size={18} />
              <div>
                <strong>Venue</strong>
                <p>{booking.venueName}</p>
              </div>
            </div>
          </div>

          <div className={styles.totalRow}>
            <span>Amount Paid</span>
            <strong>{formatPrice(booking.amountPaid)}</strong>
          </div>
        </div>
      )}

      <div className={styles.safetyMessage}>
        <ShieldCheck size={20} />
        <p>Your safety information has been received and will be reviewed before the programme starts.</p>
      </div>

      <div className={styles.infoBox}>
        <p>
          A confirmation email has been sent to you with your booking details and programme schedule.
          Please arrive 5 minutes before the session start time on your first day.
        </p>
      </div>

      <div className={styles.backLink}>
        <Link href="/">← Back to Blooming Tastebuds</Link>
      </div>
    </div>
  );
}
