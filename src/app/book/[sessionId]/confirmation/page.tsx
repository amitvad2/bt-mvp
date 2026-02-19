'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useBooking } from '@/context/BookingContext';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Booking } from '@/types';
import { CheckCircle, Calendar, MapPin, ChefHat, ArrowRight, Download } from 'lucide-react';
import styles from './page.module.css';

export default function ConfirmationPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const bookingId = searchParams.get('bookingId');
    const { clearState } = useBooking();
    const [booking, setBooking] = useState<Booking | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Clear the wizard state as we've finished the booking
        clearState();

        if (!bookingId) {
            setLoading(false);
            return;
        }

        const fetchBooking = async () => {
            try {
                const snap = await getDoc(doc(db, 'bookings', bookingId));
                if (snap.exists()) {
                    setBooking({ id: snap.id, ...snap.data() } as Booking);
                }
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        fetchBooking();
    }, [bookingId, clearState]);

    if (loading) return <div className="spinner" />;

    return (
        <div className={styles.container}>
            <div className={styles.successHeader}>
                <div className={styles.checkIcon}><CheckCircle size={48} /></div>
                <h1>Booking Confirmed!</h1>
                <p>Thank you for booking with Blooming Tastebuds. We can't wait to see you in the kitchen!</p>
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
                                <strong>Date & Time</strong>
                                <p>{new Date(booking.sessionDate || '').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
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

            <div className={styles.infoBox}>
                <p>A confirmation email has been sent to your registered address. You can also view and manage this booking in your portal.</p>
            </div>

            <div className={styles.actions}>
                <button className="btn btn-outline" onClick={() => router.push('/portal/dashboard')}>
                    Back to Dashboard
                </button>
                <button className="btn btn-primary" onClick={() => router.push('/portal/my-classes')}>
                    View My Classes <ArrowRight size={16} />
                </button>
            </div>
        </div>
    );
}
