'use client';

/**
 * Booking Confirmation Page
 *
 * Accepts two URL params (both optional, in priority order):
 *   ?payment_intent=pi_xxx  — new webhook flow (PaymentIntent ID = booking doc ID)
 *   ?bookingId=xxx          — legacy fallback (should not occur after webhook refactor)
 *
 * Because booking creation now happens asynchronously in the Stripe webhook,
 * the document may not yet exist when the page first loads. The page polls
 * Firestore up to MAX_ATTEMPTS times with POLL_INTERVAL_MS delays before
 * giving up and showing a "processing" message.
 */

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useBooking } from '@/context/BookingContext';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Booking } from '@/types';
import {
    CheckCircle,
    Calendar,
    MapPin,
    ChefHat,
    ArrowRight,
    Clock,
} from 'lucide-react';
import styles from './page.module.css';

const MAX_ATTEMPTS = 8;      // Poll up to 8 times …
const POLL_INTERVAL_MS = 1500; // … every 1.5 s  = up to ~12 s total wait

export default function ConfirmationPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { clearState } = useBooking();

    // Prefer ?payment_intent (new flow); fall back to ?bookingId (legacy)
    const paymentIntentId = searchParams.get('payment_intent');
    const legacyBookingId = searchParams.get('bookingId');
    const lookupId = paymentIntentId ?? legacyBookingId;

    const [booking, setBooking] = useState<Booking | null>(null);
    const [loading, setLoading] = useState(true);
    const [pollExhausted, setPollExhausted] = useState(false);

    useEffect(() => {
        // Clear wizard state — user has finished the booking flow
        clearState();

        if (!lookupId) {
            setLoading(false);
            return;
        }

        let cancelled = false;
        let attempt = 0;

        const poll = async () => {
            while (attempt < MAX_ATTEMPTS && !cancelled) {
                attempt++;
                try {
                    const snap = await getDoc(doc(db, 'bookings', lookupId));
                    if (snap.exists()) {
                        if (!cancelled) {
                            setBooking({ id: snap.id, ...snap.data() } as Booking);
                        }
                        break;
                    }
                } catch (e) {
                    console.error('[confirmation] Firestore error:', e);
                    break;
                }

                // Booking not yet created — wait before retrying
                if (attempt < MAX_ATTEMPTS && !cancelled) {
                    await new Promise((resolve) =>
                        setTimeout(resolve, POLL_INTERVAL_MS)
                    );
                }
            }

            if (!cancelled) {
                setLoading(false);
                if (attempt >= MAX_ATTEMPTS) {
                    setPollExhausted(true);
                }
            }
        };

        poll();
        return () => {
            cancelled = true;
        };
    // clearState is stable (useCallback), lookupId is stable for the lifetime of this page load
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lookupId]);

    // -----------------------------------------------------------------------
    // Loading state — show spinner while polling
    // -----------------------------------------------------------------------
    if (loading) {
        return (
            <div className={styles.container}>
                <div className={styles.successHeader}>
                    <div className={styles.checkIcon}>
                        <div className="spinner" />
                    </div>
                    <h1>Confirming Your Booking...</h1>
                    <p>Your payment was successful. We&apos;re just confirming your booking — this takes a few seconds.</p>
                </div>
            </div>
        );
    }

    // -----------------------------------------------------------------------
    // Webhook took too long — payment succeeded but booking not yet visible
    // -----------------------------------------------------------------------
    if (pollExhausted && !booking) {
        return (
            <div className={styles.container}>
                <div className={styles.successHeader}>
                    <div className={styles.checkIcon}><CheckCircle size={48} /></div>
                    <h1>Payment Received!</h1>
                    <p>
                        Your payment was successful. Your booking is being confirmed and will
                        appear in your dashboard within a few minutes. A confirmation email
                        will be sent to you shortly.
                    </p>
                </div>
                <div className={styles.infoBox}>
                    <Clock size={18} style={{ flexShrink: 0 }} />
                    <p>
                        If your booking doesn&apos;t appear in&nbsp;
                        <a href="/portal/my-classes">My Classes</a> within 5 minutes,
                        please contact us quoting your payment reference:&nbsp;
                        <strong>{paymentIntentId?.slice(-12).toUpperCase()}</strong>
                    </p>
                </div>
                <div className={styles.actions}>
                    <button
                        className="btn btn-outline"
                        onClick={() => router.push('/portal/dashboard')}
                    >
                        Back to Dashboard
                    </button>
                    <button
                        className="btn btn-primary"
                        onClick={() => router.push('/portal/my-classes')}
                    >
                        View My Classes <ArrowRight size={16} />
                    </button>
                </div>
            </div>
        );
    }

    // -----------------------------------------------------------------------
    // Success with booking data
    // -----------------------------------------------------------------------
    return (
        <div className={styles.container}>
            <div className={styles.successHeader}>
                <div className={styles.checkIcon}><CheckCircle size={48} /></div>
                <h1>Booking Confirmed!</h1>
                <p>Thank you for booking with Blooming Tastebuds. We can&apos;t wait to see you in the kitchen!</p>
            </div>

            {booking && (
                <div className={styles.detailsCard}>
                    <div className={styles.bookingRef}>
                        <span>Booking Reference:</span>
                        <strong>{booking.id.slice(-8).toUpperCase()}</strong>
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
                                <strong>Date &amp; Time</strong>
                                <p>
                                    {booking.sessionDate
                                        ? new Date(booking.sessionDate).toLocaleDateString('en-GB', {
                                            weekday: 'long',
                                            day: 'numeric',
                                            month: 'long',
                                        })
                                        : 'Date not available'}
                                </p>
                            </div>
                        </div>
                        <div className={styles.detail}>
                            <MapPin size={18} />
                            <div>
                                <strong>Venue</strong>
                                <p>{booking.venueName}</p>
                            </div>
                        </div>
                        <div className={styles.detail}>
                            <CheckCircle size={18} />
                            <div>
                                <strong>Participant</strong>
                                <p>{booking.studentName}</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {!booking && !lookupId && (
                <div className={styles.infoBox}>
                    <p>Your booking has been submitted. Check your email for a confirmation.</p>
                </div>
            )}

            <div className={styles.infoBox}>
                <p>
                    A confirmation email has been sent to your registered address.
                    You can view and manage this booking in your portal.
                </p>
            </div>

            <div className={styles.actions}>
                <button
                    className="btn btn-outline"
                    onClick={() => router.push('/portal/dashboard')}
                >
                    Back to Dashboard
                </button>
                <button
                    className="btn btn-primary"
                    onClick={() => router.push('/portal/my-classes')}
                >
                    View My Classes <ArrowRight size={16} />
                </button>
            </div>
        </div>
    );
}
