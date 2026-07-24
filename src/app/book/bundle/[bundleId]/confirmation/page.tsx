'use client';

/**
 * Bundle Booking Confirmation Page
 *
 * After Stripe payment succeeds, the webhook creates one booking document per
 * session in the bundle. This page polls Firestore every 2 seconds until all
 * expected booking documents appear (matching bundleId + bookedByUid), then
 * displays a success state with all session dates in chronological order.
 */

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useBundleBooking } from '@/context/BundleBookingContext';
import { useAuth } from '@/context/AuthContext';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Booking } from '@/types';
import {
    CheckCircle,
    Calendar,
    ArrowRight,
    Clock,
    Package,
} from 'lucide-react';
import styles from './page.module.css';

const POLL_INTERVAL_MS = 2000;
const MAX_ATTEMPTS = 10; // 10 attempts × 2s = up to ~20s total wait

export default function BundleConfirmationPage() {
    const router = useRouter();
    const { state, clearState } = useBundleBooking();
    const { user } = useAuth();

    const [bookings, setBookings] = useState<Booking[]>([]);
    const [loading, setLoading] = useState(true);
    const [pollExhausted, setPollExhausted] = useState(false);
    const clearedRef = useRef(false);

    const expectedCount = state.bundle?.sessionIds?.length ?? 0;

    useEffect(() => {
        if (!state.bundleId || !user?.uid) {
            setLoading(false);
            return;
        }

        let cancelled = false;
        let attempt = 0;

        const poll = async () => {
            while (attempt < MAX_ATTEMPTS && !cancelled) {
                attempt++;
                try {
                    const q = query(
                        collection(db, 'bookings'),
                        where('bundleId', '==', state.bundleId),
                        where('bookedByUid', '==', user.uid)
                    );
                    const snapshot = await getDocs(q);
                    const docs = snapshot.docs.map(doc => ({
                        id: doc.id,
                        ...doc.data(),
                    })) as Booking[];

                    if (docs.length >= expectedCount && expectedCount > 0) {
                        if (!cancelled) {
                            setBookings(docs);
                            setLoading(false);
                            // Clear wizard state once confirmed
                            if (!clearedRef.current) {
                                clearedRef.current = true;
                                clearState();
                            }
                        }
                        return;
                    }
                } catch (e) {
                    console.error('[bundle-confirmation] Firestore error:', e);
                    break;
                }

                // Not all bookings confirmed yet — wait before retrying
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
                    // Still clear wizard state — payment was successful
                    if (!clearedRef.current) {
                        clearedRef.current = true;
                        clearState();
                    }
                }
            }
        };

        poll();
        return () => {
            cancelled = true;
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state.bundleId, user?.uid, expectedCount]);

    // Sort bookings by session date chronologically
    const sortedBookings = [...bookings].sort((a, b) =>
        a.sessionDate.localeCompare(b.sessionDate)
    );

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
                    <h1>Confirming Your Bundle Booking...</h1>
                    <p>Your payment was successful. We&apos;re confirming all your sessions — this takes a few seconds.</p>
                </div>
            </div>
        );
    }

    // -----------------------------------------------------------------------
    // Webhook took too long — payment succeeded but bookings not yet visible
    // -----------------------------------------------------------------------
    if (pollExhausted && bookings.length < expectedCount) {
        return (
            <div className={styles.container}>
                <div className={styles.successHeader}>
                    <div className={styles.checkIcon}><CheckCircle size={48} /></div>
                    <h1>Payment Received!</h1>
                    <p>
                        Your payment was successful. Your bundle booking is being confirmed and will
                        appear in your dashboard within a few minutes. A confirmation email
                        will be sent to you shortly.
                    </p>
                </div>
                <div className={styles.infoBox}>
                    <Clock size={18} style={{ flexShrink: 0 }} />
                    <p>
                        If your bookings don&apos;t appear in&nbsp;
                        <a href="/portal/my-classes">My Classes</a> within 5 minutes,
                        please contact us.
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
    // Success with all bookings confirmed
    // -----------------------------------------------------------------------
    return (
        <div className={styles.container}>
            <div className={styles.successHeader}>
                <div className={styles.checkIcon}><CheckCircle size={48} /></div>
                <h1>Bundle Booking Confirmed!</h1>
                <p>Thank you for booking with Blooming Tastebuds. All your sessions are confirmed!</p>
            </div>

            <div className={styles.detailsCard}>
                <div className={styles.bundleHeader}>
                    <Package size={20} />
                    <div>
                        <strong className={styles.bundleName}>{state.bundle?.name || sortedBookings[0]?.bundleName || 'Bundle'}</strong>
                        <span className={styles.bundleSessions}>{sortedBookings.length} sessions booked</span>
                    </div>
                </div>

                <div className={styles.sessionList}>
                    {sortedBookings.map((booking) => {
                        const date = new Date(booking.sessionDate);
                        return (
                            <div key={booking.id} className={styles.sessionItem}>
                                <Calendar size={16} />
                                <div className={styles.sessionInfo}>
                                    <span className={styles.sessionDate}>
                                        {date.toLocaleDateString('en-GB', {
                                            weekday: 'long',
                                            day: 'numeric',
                                            month: 'long',
                                            year: 'numeric',
                                        })}
                                    </span>
                                    <span className={styles.sessionTime}>
                                        {booking.sessionDate && state.sessions
                                            ? (() => {
                                                const session = state.sessions.find(s => s.id === booking.sessionId);
                                                return session ? `${session.startTime} – ${session.endTime}` : '';
                                            })()
                                            : ''}
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div className={styles.totalPaid}>
                    <span>Total Paid</span>
                    <strong>£{state.bundle ? (state.bundle.bundlePrice / 100).toFixed(2) : sortedBookings.length > 0 ? ((sortedBookings[0].payment.amount * sortedBookings.length) / 100).toFixed(2) : '0.00'}</strong>
                </div>
            </div>

            <div className={styles.infoBox}>
                <p>
                    A confirmation email has been sent to your registered address.
                    You can view and manage all your bundle sessions in your portal.
                </p>
            </div>

            <div className={styles.actions}>
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
