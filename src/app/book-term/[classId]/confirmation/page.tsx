'use client';

/**
 * Term Booking Confirmation Page
 *
 * Accepts URL param:
 *   ?payment_intent=pi_xxx  — PaymentIntent ID = booking doc ID
 *
 * Polls Firestore for the booking document created by the webhook.
 * For term bookings, the booking doc has `bookingType: 'term'` and
 * references a `classId` rather than a single `sessionId`.
 */

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTermBooking } from '@/context/TermBookingContext';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Booking } from '@/types';
import { formatRecurrenceDays } from '@/lib/term-utils';
import {
    CheckCircle,
    Calendar,
    MapPin,
    ChefHat,
    ArrowRight,
    Clock,
    Repeat,
} from 'lucide-react';
import styles from './page.module.css';

const MAX_ATTEMPTS = 8;
const POLL_INTERVAL_MS = 1500;

export default function TermConfirmationPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { clearState, termClass } = useTermBooking();

    const paymentIntentId = searchParams.get('payment_intent');
    const redirectStatus = searchParams.get('redirect_status');
    const paymentFailed = redirectStatus !== null && redirectStatus !== 'succeeded';

    const [booking, setBooking] = useState<Booking | null>(null);
    const [loading, setLoading] = useState(true);
    const [pollExhausted, setPollExhausted] = useState(false);

    useEffect(() => {
        clearState();

        if (!paymentIntentId) {
            setLoading(false);
            return;
        }

        let cancelled = false;
        let attempt = 0;

        const poll = async () => {
            while (attempt < MAX_ATTEMPTS && !cancelled) {
                attempt++;
                try {
                    const snap = await getDoc(doc(db, 'bookings', paymentIntentId));
                    if (snap.exists()) {
                        if (!cancelled) {
                            setBooking({ id: snap.id, ...snap.data() } as Booking);
                        }
                        break;
                    }
                } catch (e) {
                    console.error('[term-confirmation] Firestore error:', e);
                    break;
                }

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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [paymentIntentId]);

    // Payment failed
    if (paymentFailed) {
        return (
            <div className={styles.container}>
                <div className={styles.successHeader}>
                    <div className={styles.checkIcon} style={{ background: '#FEF2F2', color: '#DC2626' }}>
                        <Clock size={48} />
                    </div>
                    <h1>Payment Not Completed</h1>
                    <p>
                        Your payment was not completed. This may be because you cancelled on the payment
                        provider&apos;s page, or the payment was declined.
                    </p>
                </div>
                <div className={styles.infoBox}>
                    <p>No charge has been made. You can try again or choose a different payment method.</p>
                </div>
                <div className={styles.actions}>
                    <button
                        className="btn btn-outline"
                        onClick={() => router.push('/portal/find-class')}
                    >
                        Find a Class
                    </button>
                    <button
                        className="btn btn-primary"
                        onClick={() => router.back()}
                    >
                        Try Again
                    </button>
                </div>
            </div>
        );
    }

    // Loading state
    if (loading) {
        return (
            <div className={styles.container}>
                <div className={styles.successHeader}>
                    <div className={styles.checkIcon}>
                        <div className="spinner" />
                    </div>
                    <h1>Confirming Your Term Booking...</h1>
                    <p>Your payment was successful. We&apos;re just confirming your enrolment — this takes a few seconds.</p>
                </div>
            </div>
        );
    }

    // Webhook took too long
    if (pollExhausted && !booking) {
        return (
            <div className={styles.container}>
                <div className={styles.successHeader}>
                    <div className={styles.checkIcon}><CheckCircle size={48} /></div>
                    <h1>Payment Received!</h1>
                    <p>
                        Your payment was successful. Your term enrolment is being confirmed and will
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

    // Success with booking data
    const schedule = booking?.recurrenceDays
        ? formatRecurrenceDays(booking.recurrenceDays)
        : termClass?.recurrenceDays
            ? formatRecurrenceDays(termClass.recurrenceDays)
            : '';

    const termPeriod = (booking?.termStartDate && booking?.termEndDate)
        ? `${new Date(booking.termStartDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} – ${new Date(booking.termEndDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
        : termClass?.termStartDate && termClass?.termEndDate
            ? `${new Date(termClass.termStartDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} – ${new Date(termClass.termEndDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
            : '';

    return (
        <div className={styles.container}>
            <div className={styles.successHeader}>
                <div className={styles.checkIcon}><CheckCircle size={48} /></div>
                <h1>Term Booking Confirmed!</h1>
                <p>Thank you for enrolling with Blooming Tastebuds. We can&apos;t wait to see you in the kitchen every week!</p>
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
                            <Repeat size={18} />
                            <div>
                                <strong>Schedule</strong>
                                <p>{schedule}</p>
                            </div>
                        </div>
                        <div className={styles.detail}>
                            <Calendar size={18} />
                            <div>
                                <strong>Term Period</strong>
                                <p>{termPeriod}</p>
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

            {!booking && !paymentIntentId && (
                <div className={styles.infoBox}>
                    <p>Your term booking has been submitted. Check your email for a confirmation.</p>
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
