'use client';

import { useState, useEffect } from 'react';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { Booking } from '@/types';
import { CreditCard, Download, ExternalLink, CheckCircle, Clock, XCircle } from 'lucide-react';
import styles from './page.module.css';

export default function MyPaymentsPage() {
    const { user } = useAuth();
    const [bookings, setBookings] = useState<Booking[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user) return;
        const fetchPayments = async () => {
            try {
                const q = query(
                    collection(db, 'bookings'),
                    where('bookedByUid', '==', user.uid)
                );
                const snap = await getDocs(q);
                const payments = snap.docs.map(d => ({ id: d.id, ...d.data() } as Booking));

                // Client-side sort by createdAt desc
                payments.sort((a, b) => {
                    const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : new Date(a.createdAt).getTime();
                    const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : new Date(b.createdAt).getTime();
                    return timeB - timeA;
                });

                setBookings(payments);
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        fetchPayments();
    }, [user]);

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(amount / 100);
    };

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <h1>My Payments</h1>
                <p>View your payment history and download receipts.</p>
            </div>

            {loading ? (
                <div className="loading-screen">
                    <div className="spinner" />
                    <p>Loading payment history...</p>
                </div>
            ) : bookings.length === 0 ? (
                <div className={styles.empty}>
                    <CreditCard size={48} />
                    <h3>No payments found</h3>
                    <p>Your payment history will appear here once you book a session.</p>
                </div>
            ) : (
                <div className={`card ${styles.tableCard}`}>
                    <div className="table-wrapper">
                        <table>
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Description</th>
                                    <th>Amount</th>
                                    <th>Status</th>
                                    <th>Reference</th>
                                    <th>Receipt</th>
                                </tr>
                            </thead>
                            <tbody>
                                {bookings.map(booking => (
                                    <tr key={booking.id}>
                                        <td>
                                            {booking.createdAt?.toDate
                                                ? new Date(booking.createdAt.toDate()).toLocaleDateString('en-GB')
                                                : new Date(booking.createdAt).toLocaleDateString('en-GB')}
                                        </td>
                                        <td>
                                            <div className={styles.desc}>
                                                <strong>{booking.className}</strong>
                                                <span>For: {booking.studentName || 'Self'}</span>
                                            </div>
                                        </td>
                                        <td className={styles.amount}>{formatCurrency(booking.payment.amount)}</td>
                                        <td>
                                            <span className={`badge ${booking.payment.status === 'paid' ? 'badge-green' :
                                                booking.payment.status === 'pending' ? 'badge-amber' : 'badge-red'
                                                }`}>
                                                {booking.payment.status}
                                            </span>
                                        </td>
                                        <td className={styles.ref}>{booking.payment.stripePaymentIntentId.slice(-8)}</td>
                                        <td>
                                            {booking.payment.receiptUrl ? (
                                                <a href={booking.payment.receiptUrl} target="_blank" rel="noopener noreferrer" className={styles.receiptLink}>
                                                    <Download size={16} /> Receipt
                                                </a>
                                            ) : (
                                                <span className={styles.noReceipt}>N/A</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
