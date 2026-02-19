'use client';

import { useState, useEffect } from 'react';
import { collection, query, getDocs, orderBy, deleteDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Booking } from '@/types';
import { Users, Trash2, Search, Filter, ChefHat, Calendar, MapPin, CreditCard, ExternalLink } from 'lucide-react';
import styles from './page.module.css';

export default function AdminBookings() {
    const [bookings, setBookings] = useState<Booking[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterType, setFilterType] = useState('all');

    useEffect(() => {
        const fetchBookings = async () => {
            try {
                const snap = await getDocs(query(collection(db, 'bookings'), orderBy('createdAt', 'desc')));
                setBookings(snap.docs.map(d => ({ id: d.id, ...d.data() } as Booking)));
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        fetchBookings();
    }, []);

    const filteredBookings = bookings.filter(b => {
        const studentName = b.studentName || '';
        const bookedByName = b.bookedByName || '';
        const bookingId = b.id || '';
        const className = b.className || '';

        const matchesSearch =
            studentName.toLowerCase().includes(searchTerm.toLowerCase()) ||
            bookedByName.toLowerCase().includes(searchTerm.toLowerCase()) ||
            bookingId.toLowerCase().includes(searchTerm.toLowerCase());

        const matchesFilter = filterType === 'all' ||
            (filterType === 'kids' && className.toLowerCase().includes('kids')) ||
            (filterType === 'weekend' && className.toLowerCase().includes('weekend'));

        return matchesSearch && matchesFilter;
    });

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this booking record? This will NOT refund the customer via Stripe.')) return;
        try {
            await deleteDoc(doc(db, 'bookings', id));
            setBookings(prev => prev.filter(b => b.id !== id));
        } catch (e) {
            console.error(e);
        }
    };

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <div>
                    <h1>Booking Master List</h1>
                    <p>View and manage all participant bookings across all sessions.</p>
                </div>
            </div>

            <div className={styles.toolbar}>
                <div className={styles.searchBox}>
                    <Search size={18} />
                    <input
                        type="text"
                        placeholder="Search student, parent, or ID..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className={styles.filters}>
                    <Filter size={18} />
                    <select value={filterType} onChange={e => setFilterType(e.target.value)}>
                        <option value="all">All Class Types</option>
                        <option value="kids">Kids Classes</option>
                        <option value="weekend">Weekend Workshops</option>
                    </select>
                </div>
            </div>

            {loading ? (
                <div className="spinner" />
            ) : (
                <div className={`card ${styles.tableCard}`}>
                    <div className="table-wrapper">
                        <table>
                            <thead>
                                <tr>
                                    <th>Booking ID</th>
                                    <th>Student / Participant</th>
                                    <th>Class / Venue</th>
                                    <th>Session Date</th>
                                    <th>Amount</th>
                                    <th>Status</th>
                                    <th style={{ textAlign: 'right' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredBookings.map(b => {
                                    const sessionDate = b.sessionDate ? new Date(b.sessionDate) : null;
                                    const amount = (b.payment?.amount || 0) / 100;

                                    return (
                                        <tr key={b.id}>
                                            <td className={styles.idCell}>
                                                <code>{(b.id || '').slice(-8).toUpperCase()}</code>
                                            </td>
                                            <td>
                                                <div className={styles.nameCell}>
                                                    <strong>{b.studentName}</strong>
                                                    <span>By: {b.bookedByName}</span>
                                                </div>
                                            </td>
                                            <td>
                                                <div className={styles.classCell}>
                                                    <strong>{b.className}</strong>
                                                    <span>{b.venueName}</span>
                                                </div>
                                            </td>
                                            <td>
                                                <div className={styles.dateCell}>
                                                    <Calendar size={14} />
                                                    {sessionDate ? sessionDate.toLocaleDateString('en-GB') : 'N/A'}
                                                </div>
                                            </td>
                                            <td>
                                                <strong>£{amount.toFixed(2)}</strong>
                                            </td>
                                            <td>
                                                <span className={`badge ${b.status === 'confirmed' ? 'badge-green' : 'badge-red'}`}>
                                                    {b.status}
                                                </span>
                                            </td>
                                            <td style={{ textAlign: 'right' }}>
                                                <button className="btn btn-ghost btn-sm text-danger" onClick={() => handleDelete(b.id)}>
                                                    <Trash2 size={16} />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                        {filteredBookings.length === 0 && (
                            <div className={styles.empty}>No bookings match your search filters.</div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
