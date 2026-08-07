'use client';

/**
 * Admin bookings list — read-only view of all confirmed bookings.
 *
 * All booking documents are created exclusively by the Stripe webhook handler
 * (/api/webhooks/stripe). No booking is ever created client-side.
 *
 * Booking document IDs are Stripe PaymentIntent IDs (pi_xxx…), which allows
 * direct cross-referencing with the Stripe Dashboard.
 *
 * Supports both authenticated (account) bookings and guest express bookings.
 * Guest bookings have no `bookedByUid` — the booker name is derived from
 * `guestContact.firstName + guestContact.lastName` instead.
 *
 * Deleting a record here removes the Firestore document only — it does NOT
 * cancel the session spot or issue a Stripe refund. Refunds must be processed
 * separately in the Stripe Dashboard.
 */

import { useState, useEffect } from 'react';
import { collection, query, getDocs, orderBy, deleteDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Booking, BookingMode, BookingSource } from '@/types';
import { Trash2, Search, Filter, Calendar } from 'lucide-react';
import styles from './page.module.css';

/** Map BookingSource values to user-friendly display labels */
function getSourceLabel(source?: BookingSource): string {
    switch (source) {
        case 'whatsapp_express': return 'WhatsApp';
        case 'facebook_express': return 'Facebook';
        case 'instagram_express': return 'Instagram';
        case 'qr_express': return 'QR Code';
        case 'google_express': return 'Google';
        case 'website_express': return 'Website (Express)';
        case 'website': return 'Website';
        case 'unknown': return 'Unknown';
        default: return '—';
    }
}

/** Derive the booker/parent name for display */
function getBookerName(booking: Booking): string {
    // Guest bookings: use guestContact embedded snapshot
    if (!booking.bookedByUid && booking.guestContact) {
        return `${booking.guestContact.firstName} ${booking.guestContact.lastName}`;
    }
    // Account bookings: use bookedByName
    return booking.bookedByName || '—';
}

/** Derive the student/participant name for display */
function getStudentName(booking: Booking): string {
    // Guest bookings: use childSnapshot embedded snapshot
    if (!booking.bookedByUid && booking.childSnapshot) {
        return `${booking.childSnapshot.firstName} ${booking.childSnapshot.lastName}`;
    }
    // Account bookings: use studentName
    return booking.studentName || '—';
}

export default function AdminBookings() {
    const [bookings, setBookings] = useState<Booking[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterType, setFilterType] = useState('all');
    const [filterMode, setFilterMode] = useState<'all' | 'account' | 'guest'>('all');
    const [filterSource, setFilterSource] = useState<string>('all');

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
        const studentName = getStudentName(b);
        const bookerName = getBookerName(b);
        const bookingId = b.id || '';
        const className = b.className || '';

        const matchesSearch =
            studentName.toLowerCase().includes(searchTerm.toLowerCase()) ||
            bookerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
            bookingId.toLowerCase().includes(searchTerm.toLowerCase());

        const matchesClassFilter = filterType === 'all' ||
            (filterType === 'kids' && className.toLowerCase().includes('kids')) ||
            (filterType === 'weekend' && className.toLowerCase().includes('weekend'));

        // Booking mode filter
        const effectiveMode: BookingMode = b.bookingMode || 'account';
        const matchesModeFilter = filterMode === 'all' || effectiveMode === filterMode;

        // Source filter
        const matchesSourceFilter = filterSource === 'all' || b.bookingSource === filterSource;

        return matchesSearch && matchesClassFilter && matchesModeFilter && matchesSourceFilter;
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
                    <select value={filterMode} onChange={e => setFilterMode(e.target.value as 'all' | 'account' | 'guest')}>
                        <option value="all">All Booking Modes</option>
                        <option value="account">Account</option>
                        <option value="guest">Guest</option>
                    </select>
                    <select value={filterSource} onChange={e => setFilterSource(e.target.value)}>
                        <option value="all">All Sources</option>
                        <option value="website">Website</option>
                        <option value="website_express">Website (Express)</option>
                        <option value="whatsapp_express">WhatsApp</option>
                        <option value="facebook_express">Facebook</option>
                        <option value="instagram_express">Instagram</option>
                        <option value="qr_express">QR Code</option>
                        <option value="google_express">Google</option>
                        <option value="unknown">Unknown</option>
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
                                    <th>Mode</th>
                                    <th>Source</th>
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
                                    const effectiveMode: BookingMode = b.bookingMode || 'account';
                                    const studentName = getStudentName(b);
                                    const bookerName = getBookerName(b);

                                    return (
                                        <tr key={b.id}>
                                            <td className={styles.idCell}>
                                                <code>{(b.id || '').slice(-8).toUpperCase()}</code>
                                            </td>
                                            <td>
                                                <div className={styles.nameCell}>
                                                    <strong>{studentName}</strong>
                                                    <span>By: {bookerName}</span>
                                                </div>
                                            </td>
                                            <td>
                                                <span className={`badge ${effectiveMode === 'guest' ? 'badge-berry' : 'badge-sky'}`}>
                                                    {effectiveMode === 'guest' ? 'Guest' : 'Account'}
                                                </span>
                                            </td>
                                            <td>
                                                <span className={styles.sourceLabel}>
                                                    {getSourceLabel(b.bookingSource)}
                                                </span>
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
