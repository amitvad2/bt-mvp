'use client';

import { useState, useEffect } from 'react';
import { collection, query, where, getDocs, orderBy, doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { Booking, Session } from '@/types';
import { Calendar, Clock, MapPin, ChefHat, AlertCircle, XCircle, CheckCircle } from 'lucide-react';
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
                    where('bookedByUid', '==', user.uid),
                    orderBy('createdAt', 'desc')
                );
                const snap = await getDocs(q);
                const bookingData = snap.docs.map(d => ({ id: d.id, ...d.data() } as Booking));
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
            setBookings(prev => prev.map(b => b.id === booking.id ? { ...b, status: 'cancelled' } : b));
            alert('Booking cancelled successfully.');
        } catch (e) {
            console.error(e);
            alert('Error cancelling booking. Please contact support.');
        }
    };

    const upcomingBookings = bookings.filter(b => b.status === 'confirmed' && new Date(b.sessionDate!) >= new Date());
    const pastBookings = bookings.filter(b => b.status === 'cancelled' || new Date(b.sessionDate!) < new Date());

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
                    <p>You haven't booked any classes yet. Head over to class discovery to find your first session!</p>
                    <button className="btn btn-primary" onClick={() => window.location.href = '/portal/find-class'}>
                        Find a Class
                    </button>
                </div>
            ) : (
                <div className={styles.sections}>
                    {/* Upcoming */}
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

                    {/* Past / Cancelled */}
                    <section className={styles.section}>
                        <h2 className={styles.sectionTitle}>Past & Cancelled</h2>
                        <div className={styles.list}>
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
