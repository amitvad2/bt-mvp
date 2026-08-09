'use client';

import { useState, useEffect, useMemo } from 'react';
import { collection, query, where, getDocs, doc, updateDoc, increment } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { Booking } from '@/types';
import { Calendar, Clock, MapPin, XCircle, Repeat } from 'lucide-react';
import BundleGroupCard from '@/components/portal/BundleGroupCard';
import { formatRecurrenceDays } from '@/lib/term-utils';
import styles from './page.module.css';

export default function MyClassesPage() {
    const { user } = useAuth();
    const [bookings, setBookings] = useState<Booking[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user) return;
        const fetchBookings = async () => {
            try {
                const q = query(
                    collection(db, 'bookings'),
                    where('bookedByUid', '==', user.uid)
                );
                const snap = await getDocs(q);
                const bookingData = snap.docs.map(d => ({ id: d.id, ...d.data() } as Booking));

                // Client-side sort by createdAt desc
                bookingData.sort((a, b) => {
                    const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : new Date(a.createdAt).getTime();
                    const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : new Date(b.createdAt).getTime();
                    return timeB - timeA;
                });

                setBookings(bookingData);
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        fetchBookings();
    }, [user]);

    const handleCancel = async (booking: Booking) => {
        if (!confirm('Are you sure you want to cancel this booking? This action is subject to our cancellation policy.')) return;

        try {
            await updateDoc(doc(db, 'bookings', booking.id), {
                status: 'cancelled',
                cancelledAt: new Date()
            });

            // Trigger Cancellation Email
            user?.getIdToken().then(idToken =>
                fetch('/api/emails/send', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${idToken}`,
                    },
                    body: JSON.stringify({
                        to: user?.email,
                        subject: `Booking Cancelled: ${booking.className}`,
                        type: 'cancellation',
                        data: {
                            className: booking.className,
                            sessionDate: booking.sessionDate ? new Date(booking.sessionDate).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }) : 'N/A',
                            venueName: booking.venueName,
                        }
                    })
                })
            ).catch(err => console.error('Failed to send cancellation email:', err));

            setBookings(prev => prev.map(b => b.id === booking.id ? { ...b, status: 'cancelled' } : b));
            alert('Booking cancelled successfully.');
        } catch (e) {
            console.error(e);
            alert('Error cancelling booking. Please contact support.');
        }
    };

    const handleTermCancel = async (booking: Booking) => {
        if (!confirm('Are you sure you want to cancel this term booking? This action is subject to our cancellation policy.')) return;

        try {
            // Update booking status to 'cancelled'
            await updateDoc(doc(db, 'bookings', booking.id), {
                status: 'cancelled',
                cancelledAt: new Date()
            });

            // Increment spotsAvailable on the class document
            if (booking.classId) {
                await updateDoc(doc(db, 'classes', booking.classId), {
                    spotsAvailable: increment(1)
                });
            }

            // Send cancellation email
            const startTime = (booking as Booking & { startTime?: string }).startTime || '';
            const endTime = (booking as Booking & { endTime?: string }).endTime || '';
            const scheduleDesc = booking.recurrenceDays && booking.recurrenceDays.length > 0
                ? `${formatRecurrenceDays(booking.recurrenceDays)} — ${startTime}–${endTime}`
                : '';

            user?.getIdToken().then(idToken =>
                fetch('/api/emails/send', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${idToken}`,
                    },
                    body: JSON.stringify({
                        to: user?.email,
                        subject: `Term Booking Cancelled: ${booking.className}`,
                        type: 'cancellation',
                        data: {
                            className: booking.className,
                            sessionDate: scheduleDesc || `${booking.termStartDate} to ${booking.termEndDate}`,
                            venueName: booking.venueName,
                        }
                    })
                })
            ).catch(err => console.error('Failed to send term cancellation email:', err));

            setBookings(prev => prev.map(b => b.id === booking.id ? { ...b, status: 'cancelled' } : b));
            alert('Term booking cancelled successfully.');
        } catch (e) {
            console.error(e);
            alert('Error cancelling term booking. Please contact support.');
        }
    };

    const handleBundleCancel = async (bundleId: string) => {
        const bundleBookingsToCancel = bookings.filter(b => b.bundleId === bundleId && b.status !== 'cancelled');

        if (bundleBookingsToCancel.length === 0) return;

        const bundleName = bundleBookingsToCancel[0]?.bundleName || 'Bundle';

        if (!confirm(`Are you sure you want to cancel the entire "${bundleName}" bundle? This will cancel all ${bundleBookingsToCancel.length} session(s) in this bundle.`)) return;

        try {
            const cancelPromises = bundleBookingsToCancel.map(booking =>
                updateDoc(doc(db, 'bookings', booking.id), {
                    status: 'cancelled',
                    cancelledAt: new Date()
                })
            );

            await Promise.all(cancelPromises);

            setBookings(prev => prev.map(b =>
                b.bundleId === bundleId ? { ...b, status: 'cancelled' as const } : b
            ));

            const sortedCancelledBookings = [...bundleBookingsToCancel].sort((a, b) =>
                a.sessionDate.localeCompare(b.sessionDate)
            );

            const sessionsData = sortedCancelledBookings.map(b => ({
                date: b.sessionDate ? new Date(b.sessionDate).toLocaleDateString('en-GB', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric'
                }) : 'N/A',
                startTime: (b as Booking & { startTime?: string }).startTime || '',
                endTime: (b as Booking & { endTime?: string }).endTime || '',
                venueName: b.venueName || ''
            }));

            user?.getIdToken().then(idToken =>
                fetch('/api/emails/send', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${idToken}`,
                    },
                    body: JSON.stringify({
                        to: user?.email,
                        subject: `Bundle Cancelled: ${bundleName}`,
                        type: 'bundle-cancellation',
                        data: {
                            bundleName,
                            studentName: bundleBookingsToCancel[0]?.studentName || 'Self',
                            sessions: sessionsData
                        }
                    })
                })
            ).catch(err => console.error('Failed to send bundle cancellation email:', err));

            alert('Bundle cancelled successfully. All sessions in this bundle have been cancelled.');
        } catch (e) {
            console.error('Bundle cancellation failed:', e);
            alert('Error cancelling bundle. Please try again or contact support.');
        }
    };

    /**
     * Formats a term booking into a human-readable schedule description.
     * E.g. "Every Mon, Wed, Fri — 3:30–4:30 pm, 6 Jan – 28 Mar 2025"
     */
    const formatTermSchedule = (booking: Booking): string => {
        const days = booking.recurrenceDays || [];
        const startTime = (booking as Booking & { startTime?: string }).startTime || '';
        const endTime = (booking as Booking & { endTime?: string }).endTime || '';

        const daysStr = formatRecurrenceDays(days);
        const timeStr = startTime && endTime ? `${startTime}–${endTime}` : '';

        const formatDate = (dateStr?: string) => {
            if (!dateStr) return '';
            const d = new Date(dateStr + 'T00:00:00');
            return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
        };

        const periodStr = booking.termStartDate && booking.termEndDate
            ? `${formatDate(booking.termStartDate)} – ${formatDate(booking.termEndDate)}`
            : '';

        const parts = [daysStr, timeStr, periodStr].filter(Boolean);
        return parts.join(' — ');
    };

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Separate term bookings from other bookings
    const termBookings = bookings.filter(b => b.bookingType === 'term');
    const nonTermBookings = bookings.filter(b => b.bookingType !== 'term');

    // Separate bundle bookings from individual bookings (only non-term)
    const bundleBookings = nonTermBookings.filter(b => !!b.bundleId);
    const individualBookings = nonTermBookings.filter(b => !b.bundleId);

    // Term bookings: active vs past/cancelled
    const activeTermBookings = termBookings.filter(b => b.status === 'confirmed');
    const pastTermBookings = termBookings.filter(b => b.status === 'cancelled');

    // Group bundle bookings by bundleId
    const bundleGroups = useMemo(() => {
        const groups = new Map<string, Booking[]>();
        for (const booking of bundleBookings) {
            const key = booking.bundleId!;
            if (!groups.has(key)) {
                groups.set(key, []);
            }
            groups.get(key)!.push(booking);
        }
        return groups;
    }, [bundleBookings]);

    // Separate upcoming/active bundle groups from past/cancelled ones
    const upcomingBundleGroups = useMemo(() => {
        const result: Map<string, Booking[]> = new Map();
        for (const [bundleId, group] of bundleGroups) {
            const hasUpcoming = group.some(b => b.status === 'confirmed' && new Date(b.sessionDate!) >= today);
            if (hasUpcoming) {
                result.set(bundleId, group);
            }
        }
        return result;
    }, [bundleGroups, today]);

    const pastBundleGroups = useMemo(() => {
        const result: Map<string, Booking[]> = new Map();
        for (const [bundleId, group] of bundleGroups) {
            const hasUpcoming = group.some(b => b.status === 'confirmed' && new Date(b.sessionDate!) >= today);
            if (!hasUpcoming) {
                result.set(bundleId, group);
            }
        }
        return result;
    }, [bundleGroups, today]);

    const upcomingBookings = individualBookings.filter(b => b.status === 'confirmed' && new Date(b.sessionDate!) >= today);
    const pastBookings = individualBookings.filter(b => b.status === 'cancelled' || new Date(b.sessionDate!) < today);

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <h1>My Classes</h1>
                <p>View and manage your upcoming and past cooking sessions.</p>
            </div>

            {loading ? (
                <div className="loading-screen">
                    <div className="spinner" />
                    <p>Loading your classes...</p>
                </div>
            ) : bookings.length === 0 ? (
                <div className={styles.empty}>
                    <Calendar size={48} />
                    <h3>No bookings found</h3>
                    <p>You haven&apos;t booked any classes yet. Head over to class discovery to find your first session!</p>
                    <button className="btn btn-primary" onClick={() => window.location.href = '/portal/find-class'}>
                        Find a Class
                    </button>
                </div>
            ) : (
                <div className={styles.sections}>
                    {/* Active Term Bookings */}
                    {activeTermBookings.length > 0 && (
                        <section className={styles.section}>
                            <h2 className={styles.sectionTitle}>Term Enrolments</h2>
                            <div className={styles.list}>
                                {activeTermBookings.map(booking => (
                                    <div key={booking.id} className={`card ${styles.bookingCard} ${styles.termCard}`}>
                                        <div className={styles.cardInfo}>
                                            <div className={styles.termIcon}>
                                                <Repeat size={24} />
                                            </div>
                                            <div className={styles.details}>
                                                <div className={styles.termHeader}>
                                                    <h3>{booking.className}</h3>
                                                    <span className="badge badge-indigo">Term</span>
                                                </div>
                                                <p className={styles.studentName}>
                                                    Participant: <strong>{booking.studentName || 'Self'}</strong>
                                                </p>
                                                <p className={styles.termSchedule}>
                                                    <Clock size={14} /> {formatTermSchedule(booking)}
                                                </p>
                                                <div className={styles.meta}>
                                                    <span><MapPin size={14} /> {booking.venueName}</span>
                                                    <span className="badge badge-green">Active</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className={styles.cardActions}>
                                            <button className="btn btn-ghost btn-sm text-danger" onClick={() => handleTermCancel(booking)}>
                                                <XCircle size={16} /> Cancel
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}

                    {/* Upcoming Bundle Bookings */}
                    {upcomingBundleGroups.size > 0 && (
                        <section className={styles.section}>
                            <h2 className={styles.sectionTitle}>Bundle Bookings</h2>
                            <div className={styles.list}>
                                {Array.from(upcomingBundleGroups.entries()).map(([bundleId, group]) => (
                                    <BundleGroupCard
                                        key={bundleId}
                                        bookings={group}
                                        onCancel={handleBundleCancel}
                                    />
                                ))}
                            </div>
                        </section>
                    )}

                    {/* Upcoming Individual Sessions */}
                    <section className={styles.section}>
                        <h2 className={styles.sectionTitle}>Upcoming Sessions</h2>
                        {upcomingBookings.length > 0 ? (
                            <div className={styles.list}>
                                {upcomingBookings.map(booking => (
                                    <div key={booking.id} className={`card ${styles.bookingCard}`}>
                                        <div className={styles.cardInfo}>
                                            <div className={styles.dateBox}>
                                                <span className={styles.month}>
                                                    {booking.sessionDate ? new Date(booking.sessionDate).toLocaleDateString('en-GB', { month: 'short' }) : 'N/A'}
                                                </span>
                                                <span className={styles.day}>
                                                    {booking.sessionDate ? new Date(booking.sessionDate).toLocaleDateString('en-GB', { day: 'numeric' }) : '??'}
                                                </span>
                                            </div>
                                            <div className={styles.details}>
                                                <h3>{booking.className}</h3>
                                                <p className={styles.studentName}>
                                                    Participant: <strong>{booking.studentName || 'Self'}</strong>
                                                </p>
                                                <div className={styles.meta}>
                                                    <span><MapPin size={14} /> {booking.venueName}</span>
                                                    <span className="badge badge-green">Confirmed</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className={styles.cardActions}>
                                            <button className="btn btn-ghost btn-sm text-danger" onClick={() => handleCancel(booking)}>
                                                <XCircle size={16} /> Cancel
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className={styles.noItems}>No upcoming sessions. <a href="/portal/find-class">Book one now!</a></p>
                        )}
                    </section>

                    {/* Past & Cancelled */}
                    <section className={styles.section}>
                        <h2 className={styles.sectionTitle}>Past & Cancelled</h2>
                        <div className={styles.list}>
                            {/* Past/cancelled term bookings */}
                            {pastTermBookings.map(booking => (
                                <div key={booking.id} className={`card ${styles.bookingCard} ${styles.pastCard}`}>
                                    <div className={styles.cardInfo}>
                                        <div className={styles.termIcon}>
                                            <Repeat size={24} />
                                        </div>
                                        <div className={styles.details}>
                                            <div className={styles.termHeader}>
                                                <h3>{booking.className}</h3>
                                                <span className="badge badge-indigo">Term</span>
                                            </div>
                                            <p className={styles.studentName}>Participant: {booking.studentName || 'Self'}</p>
                                            <p className={styles.termSchedule}>
                                                <Clock size={14} /> {formatTermSchedule(booking)}
                                            </p>
                                            <div className={styles.meta}>
                                                <span className="badge badge-red">Cancelled</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {/* Past/cancelled bundle groups */}
                            {Array.from(pastBundleGroups.entries()).map(([bundleId, group]) => (
                                <BundleGroupCard
                                    key={bundleId}
                                    bookings={group}
                                    onCancel={handleBundleCancel}
                                />
                            ))}
                            {/* Individual past/cancelled bookings */}
                            {pastBookings.map(booking => (
                                <div key={booking.id} className={`card ${styles.bookingCard} ${styles.pastCard}`}>
                                    <div className={styles.cardInfo}>
                                        <div className={styles.dateBox}>
                                            <span className={styles.month}>
                                                {booking.sessionDate ? new Date(booking.sessionDate).toLocaleDateString('en-GB', { month: 'short' }) : 'N/A'}
                                            </span>
                                            <span className={styles.day}>
                                                {booking.sessionDate ? new Date(booking.sessionDate).toLocaleDateString('en-GB', { day: 'numeric' }) : '??'}
                                            </span>
                                        </div>
                                        <div className={styles.details}>
                                            <h3>{booking.className}</h3>
                                            <p className={styles.studentName}>Participant: {booking.studentName || 'Self'}</p>
                                            <div className={styles.meta}>
                                                <span className={`badge ${booking.status === 'cancelled' ? 'badge-red' : 'badge-gray'}`}>
                                                    {booking.status === 'cancelled' ? 'Cancelled' : 'Completed'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                </div>
            )}
        </div>
    );
}
