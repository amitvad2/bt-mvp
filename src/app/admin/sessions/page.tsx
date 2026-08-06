'use client';

import { useState, useEffect } from 'react';
import { collection, query, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, orderBy, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Session, BTClass, Recipe, Instructor, BTClassType, Booking, BookingSource } from '@/types';
import { Calendar, Plus, Edit2, Trash2, X, Clock, ChefHat, MapPin, UserCheck, ClipboardList, Link as LinkIcon, MessageCircle } from 'lucide-react';
import { isGuestCheckoutEnabled } from '@/lib/feature-flags';
import styles from './page.module.css';

// ============================================================
// Session Register — helper utilities
// ============================================================

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

/** Derive participant (child/student) name for register display */
function getParticipantName(booking: Booking): string {
    // Guest bookings: use childSnapshot
    if (booking.bookingMode === 'guest' && booking.childSnapshot) {
        return `${booking.childSnapshot.firstName} ${booking.childSnapshot.lastName}`;
    }
    // Account bookings: use studentName
    return booking.studentName || '—';
}

/** Derive parent/booker name for register display */
function getParentName(booking: Booking): string {
    // Guest bookings: use guestContact
    if (booking.bookingMode === 'guest' && booking.guestContact) {
        return `${booking.guestContact.firstName} ${booking.guestContact.lastName}`;
    }
    // Account bookings: use bookedByName
    return booking.bookedByName || '—';
}

/** Calculate age from date of birth string (YYYY-MM-DD) relative to a session date */
function calculateAge(dateOfBirth: string, sessionDate: string): number | null {
    if (!dateOfBirth) return null;
    const dob = new Date(dateOfBirth);
    const refDate = sessionDate ? new Date(sessionDate) : new Date();
    if (isNaN(dob.getTime()) || isNaN(refDate.getTime())) return null;
    let age = refDate.getFullYear() - dob.getFullYear();
    const monthDiff = refDate.getMonth() - dob.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && refDate.getDate() < dob.getDate())) {
        age--;
    }
    return age;
}

/** Get participant age for a booking */
function getParticipantAge(booking: Booking, sessionDate: string): number | null {
    // Guest bookings: use childSnapshot.dateOfBirth
    if (booking.bookingMode === 'guest' && booking.childSnapshot?.dateOfBirth) {
        return calculateAge(booking.childSnapshot.dateOfBirth, sessionDate);
    }
    // Account bookings: no direct DOB on booking, return null
    return null;
}

/** Check if booking has medical declarations worth flagging */
function hasMedicalFlag(booking: Booking): boolean {
    if (booking.bookingMode === 'guest' && booking.medicalSnapshot) {
        const m = booking.medicalSnapshot;
        return !!(
            m.foodAllergies ||
            m.epipenRequired ||
            m.respiratoryProblems ||
            m.airborneAllergies ||
            (m.medicalConditions && m.medicalConditions.trim().length > 0) ||
            m.visionImpairment ||
            m.hearingImpairment
        );
    }
    // Account bookings: check medicalInfo
    if (booking.medicalInfo) {
        const m = booking.medicalInfo;
        return !!(m.allergies || m.conditions || m.respiratoryProblems || m.visionImpairment || m.hearingImpairment);
    }
    return false;
}

/** Check if booking has emergency contact */
function hasEmergencyContact(booking: Booking): boolean {
    if (booking.bookingMode === 'guest') {
        return !!(booking.emergencyContactSnapshot?.name);
    }
    return !!(booking.emergencyContact?.name);
}

/** Get authorised collector name */
function getAuthorisedCollectorName(booking: Booking): string {
    if (booking.bookingMode === 'guest' && booking.authorisedCollectorSnapshot) {
        return booking.authorisedCollectorSnapshot.name || '—';
    }
    return '—';
}

export default function AdminSessions() {
    const [sessions, setSessions] = useState<Session[]>([]);
    const [classes, setClasses] = useState<BTClass[]>([]);
    const [recipes, setRecipes] = useState<Recipe[]>([]);
    const [instructors, setInstructors] = useState<Instructor[]>([]);
    const [classTypes, setClassTypes] = useState<BTClassType[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingSession, setEditingSession] = useState<Session | null>(null);

    // Session Register state
    const [registerSession, setRegisterSession] = useState<Session | null>(null);
    const [registerBookings, setRegisterBookings] = useState<Booking[]>([]);
    const [registerLoading, setRegisterLoading] = useState(false);
    const [signInTimes, setSignInTimes] = useState<Record<string, string>>({});
    const [signOutTimes, setSignOutTimes] = useState<Record<string, string>>({});

    // Guest link management
    const guestCheckoutEnabled = isGuestCheckoutEnabled();
    const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);

    const handleCopyGuestLink = async (sessionId: string) => {
        const url = `${window.location.origin}/express-booking/${sessionId}?source=website_express`;
        await navigator.clipboard.writeText(url);
        setCopiedLinkId(`guest-${sessionId}`);
        setTimeout(() => setCopiedLinkId(null), 2000);
    };

    const handleCopyWhatsAppLink = async (session: Session) => {
        const guestUrl = `${window.location.origin}/express-booking/${session.id}?source=whatsapp_express`;
        const formattedDate = session.date
            ? new Date(session.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
            : '';
        const message = `Book your child into ${session.className} on ${formattedDate} — no account required! ${guestUrl}`;
        const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
        await navigator.clipboard.writeText(whatsappUrl);
        setCopiedLinkId(`whatsapp-${session.id}`);
        setTimeout(() => setCopiedLinkId(null), 2000);
    };

    const [formData, setFormData] = useState({
        classId: '',
        date: '',
        recipeId: '',
        instructorId: '',
        status: 'open' as Session['status'],
        spotsAvailable: 15,
    });

    useEffect(() => {
        const fetchData = async () => {
            try {
                const sessionsSnap = await getDocs(query(collection(db, 'sessions'), orderBy('date', 'desc')));
                const classesSnap = await getDocs(collection(db, 'classes'));
                const recipesSnap = await getDocs(collection(db, 'recipes'));
                const instructorsSnap = await getDocs(collection(db, 'instructors'));
                const classTypesSnap = await getDocs(query(collection(db, 'class_types'), orderBy('order')));

                setSessions(sessionsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Session)));
                setClasses(classesSnap.docs.map(d => ({ id: d.id, ...d.data() } as BTClass)));
                setRecipes(recipesSnap.docs.map(d => ({ id: d.id, ...d.data() } as Recipe)));
                setInstructors(instructorsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Instructor)));
                setClassTypes(classTypesSnap.docs.map(d => ({ id: d.id, ...d.data() } as BTClassType)));
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    const handleOpenRegister = async (session: Session) => {
        setRegisterSession(session);
        setRegisterLoading(true);
        setSignInTimes({});
        setSignOutTimes({});
        try {
            const bookingsSnap = await getDocs(
                query(collection(db, 'bookings'), where('sessionId', '==', session.id))
            );
            setRegisterBookings(bookingsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Booking)));
        } catch (e) {
            console.error('[SessionRegister]', e);
            setRegisterBookings([]);
        } finally {
            setRegisterLoading(false);
        }
    };

    const handleCloseRegister = () => {
        setRegisterSession(null);
        setRegisterBookings([]);
    };

    const handleOpenModal = (s?: Session) => {
        if (s) {
            setEditingSession(s);
            setFormData({
                classId: s.classId,
                date: s.date,
                recipeId: s.recipeId || '',
                instructorId: s.instructorId || '',
                status: s.status,
                spotsAvailable: s.spotsAvailable,
            });
        } else {
            setEditingSession(null);
            setFormData({ classId: '', date: '', recipeId: '', instructorId: '', status: 'open', spotsAvailable: 15 });
        }
        setShowModal(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const parentClass = classes.find(c => c.id === formData.classId);
        const recipe = recipes.find(r => r.id === formData.recipeId);
        const instructor = instructors.find(i => i.id === formData.instructorId);
        const classType = classTypes.find(ct => ct.slug === parentClass?.type);

        const data = {
            ...formData,
            className: classType?.displayName || parentClass?.type || 'Unknown',
            classType: parentClass?.type || '',
            venueId: parentClass?.venueId || '',
            venueName: parentClass?.venueName || '',
            recipeName: recipe?.name || '',
            instructorName: instructor?.name || '',
            price: parentClass?.price || 1500,
            startTime: parentClass?.startTime || '',
            endTime: parentClass?.endTime || '',
            spotsTotal: parentClass?.maxSize || 15,
            ageMin: parentClass?.ageMin || 5,
            ageMax: parentClass?.ageMax || 12,
            updatedAt: serverTimestamp(),
        };

        try {
            if (editingSession) {
                await updateDoc(doc(db, 'sessions', editingSession.id), data);
                setSessions(prev => prev.map(s => s.id === editingSession.id ? { ...s, ...data } as Session : s));
            } else {
                const docRef = await addDoc(collection(db, 'sessions'), { ...data, createdAt: serverTimestamp() });
                setSessions(prev => [{ id: docRef.id, ...data, createdAt: new Date() } as Session, ...prev]);
            }
            setShowModal(false);
        } catch (e) {
            console.error(e);
            alert('Error saving session.');
        }
    };

    const handleDelete = async (session: Session) => {
        try {
            // Check if any bookings are linked to this session
            const bookingsSnap = await getDocs(
                query(collection(db, 'bookings'), where('sessionId', '==', session.id), where('status', '==', 'confirmed'))
            );
            const bookingCount = bookingsSnap.size;

            const confirmMsg = bookingCount > 0
                ? `⚠️ This session has ${bookingCount} confirmed booking${bookingCount > 1 ? 's' : ''}. Deleting it will NOT automatically cancel or refund those bookings. Are you sure you want to delete it?`
                : 'Delete this session? This cannot be undone.';

            if (!confirm(confirmMsg)) return;

            await deleteDoc(doc(db, 'sessions', session.id));
            setSessions(prev => prev.filter(s => s.id !== session.id));
        } catch (e: any) {
            console.error('[SessionDelete]', e);
            if (e?.code === 'permission-denied') {
                alert('Permission denied. You do not have access to delete this session.');
            } else {
                alert(`Failed to delete session: ${e?.message || 'Unknown error'}. Please try again.`);
            }
        }
    };

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <div>
                    <h1>Session Dates</h1>
                    <p>Schedule and manage individual class sessions.</p>
                </div>
                <button className="btn btn-primary" onClick={() => handleOpenModal()}>
                    Add Session
                </button>
            </div>

            {loading ? (
                <div className="spinner" />
            ) : (
                <div className={styles.tableCard}>
                    <table>
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Class</th>
                                <th>Venue</th>
                                <th>Spots</th>
                                <th>Status</th>
                                <th style={{ textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sessions.map(s => (
                                <tr key={s.id}>
                                    <td><strong>{s.date ? new Date(s.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A'}</strong></td>
                                    <td>
                                        {(() => {
                                            const ct = classTypes.find(t => t.slug === s.classType);
                                            return (
                                                <>
                                                    <span className={`badge badge-${ct?.badgeColor || 'gray'}`}>
                                                        {ct?.shortLabel || s.classType || 'Unknown'}
                                                    </span>
                                                    {' '}{s.className}
                                                </>
                                            );
                                        })()}
                                    </td>
                                    <td className={styles.mutedText}>{s.venueName}</td>
                                    <td>
                                        <span className={`badge ${s.spotsAvailable > 5 ? 'badge-green' : s.spotsAvailable > 0 ? 'badge-amber' : 'badge-red'}`}>
                                            {s.spotsAvailable} left
                                        </span>
                                    </td>
                                    <td>
                                        <span className={`badge ${s.status === 'open' ? 'badge-indigo' : 'badge-gray'}`}>{s.status}</span>
                                    </td>
                                    <td style={{ textAlign: 'right' }}>
                                        <div className="flex justify-end gap-2">
                                            {guestCheckoutEnabled && s.status === 'open' && (
                                                <>
                                                    <button
                                                        className="btn btn-ghost btn-sm"
                                                        style={{ position: 'relative' }}
                                                        title={copiedLinkId === `guest-${s.id}` ? 'Copied!' : 'Copy Guest Link'}
                                                        onClick={() => handleCopyGuestLink(s.id)}
                                                        aria-label={`Copy guest booking link for session on ${s.date}`}
                                                    >
                                                        <LinkIcon size={16} strokeWidth={1.5} />
                                                        {copiedLinkId === `guest-${s.id}` && <span className={styles.copiedTooltip}>Copied!</span>}
                                                    </button>
                                                    <button
                                                        className="btn btn-ghost btn-sm"
                                                        style={{ position: 'relative' }}
                                                        title={copiedLinkId === `whatsapp-${s.id}` ? 'Copied!' : 'Copy WhatsApp Link'}
                                                        onClick={() => handleCopyWhatsAppLink(s)}
                                                        aria-label={`Copy WhatsApp guest booking link for session on ${s.date}`}
                                                    >
                                                        <MessageCircle size={16} strokeWidth={1.5} />
                                                        {copiedLinkId === `whatsapp-${s.id}` && <span className={styles.copiedTooltip}>Copied!</span>}
                                                    </button>
                                                </>
                                            )}
                                            <button className="btn btn-ghost btn-sm" title="View Register" onClick={() => handleOpenRegister(s)}><ClipboardList size={16} strokeWidth={1.5} /></button>
                                            <button className="btn btn-ghost btn-sm" onClick={() => handleOpenModal(s)}><Edit2 size={16} strokeWidth={1.5} /></button>
                                            <button className="btn btn-ghost btn-sm text-danger" onClick={() => handleDelete(s)}><Trash2 size={16} strokeWidth={1.5} /></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {showModal && (
                <div className="modal-overlay">
                    <div className="modal">
                        <div className="modal-header">
                            <h2 className="modal-title">{editingSession ? 'Edit Session' : 'Add Session'}</h2>
                            <button className="modal-close" onClick={() => setShowModal(false)}><X size={20} /></button>
                        </div>
                        <form onSubmit={handleSubmit} className={styles.form}>
                            <div className="form-group">
                                <label className="form-label">Base Class Type</label>
                                <select className="form-select" value={formData.classId} onChange={e => setFormData({ ...formData, classId: e.target.value })} required>
                                    <option value="">Select Class...</option>
                                    {classes.map(c => <option key={c.id} value={c.id}>{c.type} — {c.venueName}</option>)}
                                </select>
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label className="form-label">Session Date</label>
                                    <input type="date" className="form-input" value={formData.date} onChange={e => setFormData({ ...formData, date: e.target.value })} required />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Availability (Spots)</label>
                                    <input type="number" className="form-input" value={formData.spotsAvailable} onChange={e => setFormData({ ...formData, spotsAvailable: parseInt(e.target.value) })} required />
                                </div>
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label className="form-label">Recipe (Optional)</label>
                                    <select className="form-select" value={formData.recipeId} onChange={e => setFormData({ ...formData, recipeId: e.target.value })}>
                                        <option value="">None</option>
                                        {recipes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Instructor (Optional)</label>
                                    <select className="form-select" value={formData.instructorId} onChange={e => setFormData({ ...formData, instructorId: e.target.value })}>
                                        <option value="">None</option>
                                        {instructors.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                                    </select>
                                </div>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Status</label>
                                <select className="form-select" value={formData.status} onChange={e => setFormData({ ...formData, status: e.target.value as any })}>
                                    <option value="open">Open</option>
                                    <option value="closed">Closed</option>
                                    <option value="cancelled">Cancelled</option>
                                </select>
                            </div>

                            <div className={styles.modalActions}>
                                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary">Save Session</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Session Register Modal */}
            {registerSession && (
                <div className="modal-overlay">
                    <div className="modal" style={{ maxWidth: '95vw', width: '1200px' }}>
                        <div className="modal-header">
                            <h2 className="modal-title">
                                Session Register — {registerSession.className}{' '}
                                ({registerSession.date ? new Date(registerSession.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A'})
                            </h2>
                            <button className="modal-close" onClick={handleCloseRegister}><X size={20} /></button>
                        </div>

                        <div className={styles.registerMeta}>
                            <span><MapPin size={14} /> {registerSession.venueName}</span>
                            <span><Clock size={14} /> {registerSession.startTime} – {registerSession.endTime}</span>
                            <span><UserCheck size={14} /> {registerBookings.filter(b => b.status === 'confirmed').length} participant{registerBookings.filter(b => b.status === 'confirmed').length !== 1 ? 's' : ''}</span>
                        </div>

                        {registerLoading ? (
                            <div className="spinner" />
                        ) : registerBookings.length === 0 ? (
                            <div className={styles.registerEmpty}>No bookings for this session yet.</div>
                        ) : (
                            <div className={styles.registerTableWrapper}>
                                <table className={styles.registerTable}>
                                    <thead>
                                        <tr>
                                            <th>Participant</th>
                                            <th>Age</th>
                                            <th>Mode</th>
                                            <th>Source</th>
                                            <th>Status</th>
                                            <th>Medical</th>
                                            <th>Emergency</th>
                                            <th>Authorised Collector</th>
                                            <th>Sign In</th>
                                            <th>Sign Out</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {registerBookings.map(booking => {
                                            const participantName = getParticipantName(booking);
                                            const parentName = getParentName(booking);
                                            const age = getParticipantAge(booking, registerSession.date);
                                            const medicalFlag = hasMedicalFlag(booking);
                                            const emergencyFlag = hasEmergencyContact(booking);
                                            const collectorName = getAuthorisedCollectorName(booking);
                                            const mode = booking.bookingMode || 'account';
                                            const source = booking.bookingSource;

                                            return (
                                                <tr key={booking.id}>
                                                    <td>
                                                        <div className={styles.registerNameCell}>
                                                            <strong>{participantName}</strong>
                                                            <span>Parent: {parentName}</span>
                                                        </div>
                                                    </td>
                                                    <td>{age !== null ? age : '—'}</td>
                                                    <td>
                                                        <span className={`badge ${mode === 'guest' ? 'badge-amber' : 'badge-indigo'}`}>
                                                            {mode === 'guest' ? 'Guest' : 'Account'}
                                                        </span>
                                                    </td>
                                                    <td className={styles.mutedText}>{getSourceLabel(source)}</td>
                                                    <td>
                                                        <span className={`badge ${booking.status === 'confirmed' ? 'badge-green' : 'badge-red'}`}>
                                                            {booking.status}
                                                        </span>
                                                    </td>
                                                    <td className={styles.flagCell}>
                                                        {medicalFlag && <span title="Has medical declarations">🏥</span>}
                                                    </td>
                                                    <td className={styles.flagCell}>
                                                        {emergencyFlag && <span title="Emergency contact provided">📞</span>}
                                                    </td>
                                                    <td className={styles.mutedText}>{collectorName}</td>
                                                    <td>
                                                        <input
                                                            type="time"
                                                            className={styles.registerTimeInput}
                                                            value={signInTimes[booking.id] || ''}
                                                            onChange={e => setSignInTimes(prev => ({ ...prev, [booking.id]: e.target.value }))}
                                                            aria-label={`Sign in time for ${participantName}`}
                                                        />
                                                    </td>
                                                    <td>
                                                        <input
                                                            type="time"
                                                            className={styles.registerTimeInput}
                                                            value={signOutTimes[booking.id] || ''}
                                                            onChange={e => setSignOutTimes(prev => ({ ...prev, [booking.id]: e.target.value }))}
                                                            aria-label={`Sign out time for ${participantName}`}
                                                        />
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
