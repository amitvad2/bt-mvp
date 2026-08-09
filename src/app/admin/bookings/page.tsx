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
import { collection, query, getDocs, orderBy, deleteDoc, doc, updateDoc, increment } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Booking, BookingMode, BookingSource } from '@/types';
import { Trash2, Search, Filter, Calendar, XCircle, Repeat } from 'lucide-react';
import Link from 'next/link';
import { formatRecurrenceDays } from '@/lib/term-utils';
import styles from './page.module.css';

/** Map BookingSource values to user-friendly display labels */
function getSourceLabel(source?: BookingSource): string {
    switch (source) {
        case 'whatsapp_express': return 'WhatsApp';
        case 'facebook_express': return 'Messenger';
        case 'instagram_express': return 'Instagram';
        case 'qr_express': return 'QR Code';
        case 'google_express': return 'Google';
        case 'website_express': return 'Website (Guest)';
        case 'website': return 'Website';
        case 'unknown': return 'Unknown';
        default: return '—';
    }
}

/** Map BookingSource values to a global badge colour class */
function getSourceBadgeClass(source?: BookingSource): string {
    switch (source) {
        case 'whatsapp_express': return 'badge-green';
        case 'facebook_express': return 'badge-indigo';
        case 'instagram_express': return 'badge-berry';
        case 'website_express': return 'badge-orange';
        case 'website': return 'badge-sky';
        case 'qr_express': return 'badge-citrus';
        case 'google_express': return 'badge-amber';
        case 'unknown': return 'badge-gray';
        default: return 'badge-gray';
    }
}

/** Get the campaign name from booking acquisition metadata */
function getCampaignName(booking: Booking): string | null {
    return booking.acquisition?.campaign?.campaign || null;
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
            (filterType === 'weekend' && className.toLowerCase().includes('weekend')) ||
            (filterType === 'term' && b.bookingType === 'term');

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

    const handleCancelTermBooking = async (booking: Booking) => {
        if (!confirm('Are you sure you want to cancel this term booking? This will update the booking status and free up a spot on the class.')) return;
        try {
            await updateDoc(doc(db, 'bookings', booking.id), {
                status: 'cancelled',
                cancelledAt: new Date()
            });

            if (booking.classId) {
                await updateDoc(doc(db, 'classes', booking.classId), {
                    spotsAvailable: increment(1)
                });
            }

            setBookings(prev => prev.map(b => b.id === booking.id ? { ...b, status: 'cancelled' as const } : b));
        } catch (e) {
            console.error('Error cancelling term booking:', e);
            alert('Error cancelling term booking. Please try again.');
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
                        <option value="term">Term Bookings</option>
                    </select>
                    <select value={filterMode} onChange={e => setFilterMode(e.target.value as 'all' | 'account' | 'guest')}>
                        <option value="all">All Booking Modes</option>
                        <option value="account">Account</option>
                        <option value="guest">Guest</option>
                    </select>
                    <select value={filterSource} onChange={e => setFilterSource(e.target.value)}>
                        <option value="all">All Sources</option>
                        <option value="website">Website</option>
                        <option value="website_express">Website (Guest)</option>
                        <option value="whatsapp_express">WhatsApp</option>
                        <option value="instagram_express">Instagram</option>
                        <option value="facebook_express">Messenger</option>
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
                                    <th>Type</th>
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
                                    const isTermBooking = b.bookingType === 'term';

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
                                                {isTermBooking ? (
                                                    <span className="badge badge-indigo">
                                                        <Repeat size={12} /> Term
                                                    </span>
                                                ) : (
                                                    <span className="badge badge-gray">Per Session</span>
                                                )}
                                            </td>
                                            <td>
                                                <span className={`badge ${effectiveMode === 'guest' ? 'badge-berry' : 'badge-sky'}`}>
                                                    {effectiveMode === 'guest' ? 'Guest' : 'Account'}
                                                </span>
                                            </td>
                                            <td>
                                                <div className={styles.sourceCell}>
                                                    <span className={`badge ${getSourceBadgeClass(b.bookingSource)}`}>
                                                        {getSourceLabel(b.bookingSource)}
                                                    </span>
                                                    {getCampaignName(b) && (
                                                        <span className={styles.campaignLabel}>
                                                            {getCampaignName(b)}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td>
                                                <div className={styles.classCell}>
                                                    {isTermBooking && b.classId ? (
                                                        <>
                                                            <Link href={`/admin/classes`} className={styles.classLink}>
                                                                <strong>{b.className}</strong>
                                                            </Link>
                                                            <span>{b.venueName}</span>
                                                            {b.recurrenceDays && b.recurrenceDays.length > 0 && (
                                                                <span className={styles.recurrenceLabel}>
                                                                    {formatRecurrenceDays(b.recurrenceDays)}
                                                                </span>
                                                            )}
                                                        </>
                                                    ) : (
                                                        <>
                                                            <strong>{b.className}</strong>
                                                            <span>{b.venueName}</span>
                                                        </>
                                                    )}
                                                </div>
                                            </td>
                                            <td>
                                                <div className={styles.dateCell}>
                                                    <Calendar size={14} />
                                                    {isTermBooking ? (
                                                        <span>
                                                            {b.termStartDate && b.termEndDate
                                                                ? `${new Date(b.termStartDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${new Date(b.termEndDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
                                                                : 'Term'}
                                                        </span>
                                                    ) : (
                                                        <span>{sessionDate ? sessionDate.toLocaleDateString('en-GB') : 'N/A'}</span>
                                                    )}
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
                                                <div className={styles.actionsCell}>
                                                    {isTermBooking && b.status === 'confirmed' && (
                                                        <button
                                                            className="btn btn-ghost btn-sm text-danger"
                                                            onClick={() => handleCancelTermBooking(b)}
                                                            title="Cancel term booking"
                                                        >
                                                            <XCircle size={16} />
                                                        </button>
                                                    )}
                                                    <button className="btn btn-ghost btn-sm text-danger" onClick={() => handleDelete(b.id)}>
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
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
