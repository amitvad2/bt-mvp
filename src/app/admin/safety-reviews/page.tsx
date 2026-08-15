'use client';

/**
 * Admin Safety Review Queue — lists all guest bookings requiring medical/allergy review.
 *
 * Displays bookings where `safetyReviewStatus` is 'pending' or 'contact_parent'.
 * Admin can update status and add operational notes directly from this view.
 *
 * Requirements: GUEST-FR-013 (13.3–13.5)
 */

import { useState, useEffect } from 'react';
import { collection, query, getDocs, where, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Booking, SafetyReviewStatus } from '@/types';
import { ShieldAlert } from 'lucide-react';
import styles from './page.module.css';

/** Derive child name from guest or account booking */
function getChildName(booking: Booking): string {
    if (booking.childSnapshot) {
        return `${booking.childSnapshot.firstName} ${booking.childSnapshot.lastName}`;
    }
    return booking.studentName || '—';
}

/** Derive parent name from guest or account booking */
function getParentName(booking: Booking): string {
    if (booking.guestContact) {
        return `${booking.guestContact.firstName} ${booking.guestContact.lastName}`;
    }
    return booking.bookedByName || '—';
}

/** Derive parent contact info */
function getParentContact(booking: Booking): { email: string; phone: string } {
    if (booking.guestContact) {
        return { email: booking.guestContact.email, phone: booking.guestContact.telephone };
    }
    return { email: booking.bookedByEmail || '', phone: '' };
}

/** Build a list of key medical flags for summary display */
function getMedicalFlags(booking: Booking): string[] {
    const flags: string[] = [];
    const medical = booking.medicalSnapshot || booking.medicalInfo;
    if (!medical) return flags;

    // Guest medical info fields (GuestMedicalInfo shape)
    if (medical.foodAllergies) flags.push('Food Allergies');
    if (medical.airborneAllergies) flags.push('Airborne Allergies');
    if (medical.epipenRequired) flags.push('EpiPen Required');
    if (medical.medicalConditions && medical.medicalConditions.trim().length > 0) flags.push('Medical Conditions');
    // Authenticated medical info fields (MedicalInfo shape)
    if (medical.allergies) flags.push('Allergies');
    if (medical.conditions) flags.push('Medical Conditions');
    // Shared / both shapes
    if (medical.respiratoryProblems) flags.push('Respiratory');
    if (medical.visionImpairment) flags.push('Vision Impairment');
    if (medical.hearingImpairment) flags.push('Hearing Impairment');
    if (medical.additionalSupportNeeds && medical.additionalSupportNeeds.trim().length > 0) flags.push('Additional Needs');

    return flags;
}

/** Actionable status options for admin */
const ACTION_STATUSES: { value: SafetyReviewStatus; label: string }[] = [
    { value: 'pending', label: 'Pending Review' },
    { value: 'reviewed', label: 'Reviewed ✓' },
    { value: 'contact_parent', label: 'Contact Parent' },
    { value: 'cannot_accommodate', label: 'Cannot Accommodate' },
];

export default function AdminSafetyReviews() {
    const [bookings, setBookings] = useState<Booking[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'contact_parent'>('all');
    const [notesState, setNotesState] = useState<Record<string, string>>({});
    const [savingNotes, setSavingNotes] = useState<Record<string, boolean>>({});
    const [updatingStatus, setUpdatingStatus] = useState<Record<string, boolean>>({});

    useEffect(() => {
        const fetchBookings = async () => {
            try {
                // Query bookings with safety review status 'pending' or 'contact_parent'
                const pendingQuery = query(
                    collection(db, 'bookings'),
                    where('safetyReviewStatus', 'in', ['pending', 'contact_parent'])
                );
                const snap = await getDocs(pendingQuery);
                const results = snap.docs.map(d => ({ id: d.id, ...d.data() } as Booking));
                setBookings(results);

                // Initialise notes state from existing data
                const initialNotes: Record<string, string> = {};
                results.forEach(b => {
                    initialNotes[b.id] = b.safetyReviewNotes || '';
                });
                setNotesState(initialNotes);
            } catch (e) {
                console.error('Failed to fetch safety review bookings:', e);
            } finally {
                setLoading(false);
            }
        };
        fetchBookings();
    }, []);

    /** Update the safety review status for a booking */
    const handleStatusChange = async (bookingId: string, newStatus: SafetyReviewStatus) => {
        setUpdatingStatus(prev => ({ ...prev, [bookingId]: true }));
        try {
            await updateDoc(doc(db, 'bookings', bookingId), {
                safetyReviewStatus: newStatus,
                safetyReviewedAt: serverTimestamp(),
            });
            setBookings(prev =>
                prev.map(b => b.id === bookingId ? { ...b, safetyReviewStatus: newStatus } : b)
            );
        } catch (e) {
            console.error('Failed to update safety review status:', e);
        } finally {
            setUpdatingStatus(prev => ({ ...prev, [bookingId]: false }));
        }
    };

    /** Save operational notes for a booking */
    const handleSaveNotes = async (bookingId: string) => {
        setSavingNotes(prev => ({ ...prev, [bookingId]: true }));
        try {
            await updateDoc(doc(db, 'bookings', bookingId), {
                safetyReviewNotes: notesState[bookingId] || '',
            });
            setBookings(prev =>
                prev.map(b => b.id === bookingId ? { ...b, safetyReviewNotes: notesState[bookingId] } : b)
            );
        } catch (e) {
            console.error('Failed to save safety review notes:', e);
        } finally {
            setSavingNotes(prev => ({ ...prev, [bookingId]: false }));
        }
    };

    /** Filter bookings by selected status */
    const filteredBookings = filterStatus === 'all'
        ? bookings
        : bookings.filter(b => b.safetyReviewStatus === filterStatus);

    const pendingCount = bookings.filter(b => b.safetyReviewStatus === 'pending').length;
    const contactCount = bookings.filter(b => b.safetyReviewStatus === 'contact_parent').length;

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <div>
                    <h1>Safety Review Queue</h1>
                    <p>Review medical and allergy declarations from guest bookings.</p>
                </div>
                {(pendingCount > 0 || contactCount > 0) && (
                    <span className={styles.pendingCount}>
                        {pendingCount} pending{contactCount > 0 ? `, ${contactCount} to contact` : ''}
                    </span>
                )}
            </div>

            <div className={styles.toolbar}>
                <span className={styles.toolbarLabel}>Filter:</span>
                {(['all', 'pending', 'contact_parent'] as const).map(s => (
                    <button
                        key={s}
                        className={`${styles.filterBtn} ${filterStatus === s ? styles.filterActive : ''}`}
                        onClick={() => setFilterStatus(s)}
                    >
                        {s === 'all' ? 'All' : s === 'pending' ? 'Pending' : 'Contact Parent'}
                    </button>
                ))}
            </div>

            {loading ? (
                <div className="spinner" />
            ) : filteredBookings.length === 0 ? (
                <div className={styles.empty}>
                    <ShieldAlert size={40} strokeWidth={1} />
                    <p>
                        {filterStatus === 'all'
                            ? 'No bookings require safety review at this time.'
                            : `No bookings with status "${filterStatus === 'pending' ? 'Pending' : 'Contact Parent'}".`}
                    </p>
                </div>
            ) : (
                <div className={`card ${styles.tableCard}`}>
                    <div className="table-wrapper">
                        <table>
                            <thead>
                                <tr>
                                    <th>Child</th>
                                    <th>Parent</th>
                                    <th>Contact</th>
                                    <th>Medical Summary</th>
                                    <th>Status</th>
                                    <th>Notes</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredBookings.map(booking => {
                                    const childName = getChildName(booking);
                                    const parentName = getParentName(booking);
                                    const contact = getParentContact(booking);
                                    const flags = getMedicalFlags(booking);
                                    const currentStatus = booking.safetyReviewStatus || 'pending';

                                    return (
                                        <tr key={booking.id}>
                                            <td>
                                                <div className={styles.nameCell}>
                                                    <strong>{childName}</strong>
                                                    <span>{booking.className || '—'}</span>
                                                </div>
                                            </td>
                                            <td>
                                                <div className={styles.nameCell}>
                                                    <strong>{parentName}</strong>
                                                </div>
                                            </td>
                                            <td>
                                                <div className={styles.contactCell}>
                                                    {contact.email && (
                                                        <a href={`mailto:${contact.email}`}>{contact.email}</a>
                                                    )}
                                                    {contact.phone && (
                                                        <span>{contact.phone}</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td>
                                                <div className={styles.medicalSummary}>
                                                    {flags.length > 0 ? (
                                                        flags.map(flag => (
                                                            <span key={flag} className={styles.medicalFlag}>
                                                                {flag}
                                                            </span>
                                                        ))
                                                    ) : (
                                                        <span style={{ color: 'var(--bt-gray-400)', fontSize: '0.85rem' }}>
                                                            No flags
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td>
                                                <select
                                                    className={styles.statusSelect}
                                                    value={currentStatus}
                                                    onChange={e => handleStatusChange(booking.id, e.target.value as SafetyReviewStatus)}
                                                    disabled={updatingStatus[booking.id]}
                                                    aria-label={`Safety review status for ${childName}`}
                                                >
                                                    {ACTION_STATUSES.map(({ value, label }) => (
                                                        <option key={value} value={value}>{label}</option>
                                                    ))}
                                                </select>
                                            </td>
                                            <td>
                                                <div className={styles.notesSection}>
                                                    <textarea
                                                        className={styles.notesTextarea}
                                                        value={notesState[booking.id] || ''}
                                                        onChange={e => setNotesState(prev => ({ ...prev, [booking.id]: e.target.value }))}
                                                        placeholder="Add operational notes..."
                                                        aria-label={`Notes for ${childName}`}
                                                    />
                                                    <button
                                                        className={styles.notesSaveBtn}
                                                        onClick={() => handleSaveNotes(booking.id)}
                                                        disabled={savingNotes[booking.id] || notesState[booking.id] === (booking.safetyReviewNotes || '')}
                                                    >
                                                        {savingNotes[booking.id] ? 'Saving...' : 'Save Notes'}
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
