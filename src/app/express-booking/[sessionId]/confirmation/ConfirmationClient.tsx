'use client';

/**
 * Guest Express Checkout — Confirmation Client Component
 *
 * Reads paymentIntentId and sessionId from sessionStorage (set during payment).
 * Polls GET /api/guest-booking-status?pi={piId}&session={sessionId} every 2.5s.
 * Displays pending message while waiting, then booking summary when confirmed.
 * Clears sessionStorage guest booking state on successful display.
 * Never displays medical/allergy/emergency details.
 *
 * Requirements: GUEST-FR-010 (10.1–10.8), GUEST-SEC-004 (25.1–25.4)
 */

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { CheckCircle, Calendar, MapPin, ChefHat, Clock, ShieldCheck } from 'lucide-react';
import styles from './Confirmation.module.css';

interface BookingSummary {
  reference: string;
  childFirstName: string;
  className: string;
  date: string;
  startTime: string;
  endTime: string;
  venueName: string;
  amountPaid: number; // pence
}

type ConfirmationStatus = 'loading' | 'pending' | 'confirmed' | 'error' | 'no-data';

const POLL_INTERVAL_MS = 2500; // 2.5 seconds
const MAX_POLL_ATTEMPTS = 30; // ~75 seconds total

interface ConfirmationClientProps {
  sessionId: string;
}

export default function ConfirmationClient({ sessionId }: ConfirmationClientProps) {
  const [status, setStatus] = useState<ConfirmationStatus>('loading');
  const [booking, setBooking] = useState<BookingSummary | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const pollCountRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);
  const hasStartedRef = useRef(false);

  useEffect(() => {
    // Prevent double-start in strict mode
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;

    cancelledRef.current = false;
    pollCountRef.current = 0;

    // Read payment data from sessionStorage
    let piId: string | null = null;
    let sessId: string | null = null;

    try {
      piId = sessionStorage.getItem('guest_paymentIntentId');
      sessId = sessionStorage.getItem('guest_sessionId');
    } catch (e) {
      console.error('[confirmation] sessionStorage unavailable:', e);
    }

    if (!piId || !sessId) {
      // Use a microtask to avoid synchronous setState in effect body
      queueMicrotask(() => setStatus('no-data'));
      return;
    }

    const clearGuestState = () => {
      try {
        sessionStorage.removeItem('guest_paymentIntentId');
        sessionStorage.removeItem('guest_sessionId');
        sessionStorage.removeItem(`guest_booking_${sessionId}`);
      } catch (e) {
        console.error('[confirmation] Error clearing sessionStorage:', e);
      }
    };

    const poll = async () => {
      if (cancelledRef.current) return;

      pollCountRef.current += 1;

      try {
        const res = await fetch(
          `/api/guest-booking-status?pi=${encodeURIComponent(piId!)}&session=${encodeURIComponent(sessId!)}`
        );

        if (cancelledRef.current) return;

        if (!res.ok) {
          // Rate limited or server error — wait and retry
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
            date: data.date,
            startTime: data.startTime,
            endTime: data.endTime,
            venueName: data.venueName,
            amountPaid: data.amountPaid,
          });
          setStatus('confirmed');
          clearGuestState();
          return;
        }

        // Unexpected status
        setStatus('error');
        setErrorMessage('Unexpected booking status. Please check your email for confirmation.');
      } catch (err) {
        console.error('[confirmation] Poll error:', err);
        if (!cancelledRef.current && pollCountRef.current < MAX_POLL_ATTEMPTS) {
          timerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
        } else if (!cancelledRef.current) {
          setStatus('error');
          setErrorMessage('Network error. Please check your email for confirmation.');
        }
      }
    };

    // Start polling
    poll();

    return () => {
      cancelledRef.current = true;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [sessionId]);

  // Format price from pence to £XX.XX
  const formatPrice = (pence: number) => `£${(pence / 100).toFixed(2)}`;

  // Format date string to readable format
  const formatDate = (dateStr: string) => {
    if (!dateStr) return 'Date not available';
    try {
      return new Date(dateStr).toLocaleDateString('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  // -------------------------------------------------------------------------
  // No sessionStorage data — user arrived directly without completing payment
  // -------------------------------------------------------------------------
  if (status === 'no-data') {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <div className={styles.iconWrap}>
            <Clock size={48} />
          </div>
          <h1 className={styles.title}>No Booking Found</h1>
          <p className={styles.subtitle}>
            We couldn&apos;t find payment details for this session. If you&apos;ve just completed
            a payment, please check your email for a confirmation.
          </p>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Loading / Pending — payment received, waiting for webhook confirmation
  // -------------------------------------------------------------------------
  if (status === 'loading' || status === 'pending') {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <div className={styles.iconWrap}>
            <div className={styles.spinner} />
          </div>
          <h1 className={styles.title}>Payment received. We are finalising your booking.</h1>
          <p className={styles.subtitle}>
            This usually takes a few seconds. Please don&apos;t close this page.
          </p>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Error state
  // -------------------------------------------------------------------------
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

  // -------------------------------------------------------------------------
  // Confirmed — display booking summary
  // -------------------------------------------------------------------------
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={`${styles.iconWrap} ${styles.iconWrapSuccess}`}>
          <CheckCircle size={48} />
        </div>
        <h1 className={styles.title}>Booking Confirmed!</h1>
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
                <strong>Class</strong>
                <p>{booking.className}</p>
              </div>
            </div>
            <div className={styles.detail}>
              <Calendar size={18} />
              <div>
                <strong>Date</strong>
                <p>{formatDate(booking.date)}</p>
              </div>
            </div>
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
        <p>Your safety information has been received.</p>
      </div>

      <div className={styles.infoBox}>
        <p>
          A confirmation email has been sent to you with your booking details.
          Please arrive 5 minutes before the session start time.
        </p>
      </div>

      <div className={styles.backLink}>
        <Link href="/">← Back to Blooming Tastebuds</Link>
      </div>
    </div>
  );
}
