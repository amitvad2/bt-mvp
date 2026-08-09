'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { collection, query, orderBy, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { BTClass, Venue, BTClassType, Booking, Instructor } from '@/types';
import { classFormSchema, ClassFormData } from './schema';
import TermFields from './TermFields';
import { formatRecurrenceDays } from '@/lib/term-utils';
import { ChefHat, Plus, Edit2, Trash2, X, Clock, Users, MapPin, UserCheck, CalendarDays, Calendar, Share2, AlertTriangle } from 'lucide-react';
import styles from './page.module.css';

export default function AdminClasses() {
    const [classes, setClasses] = useState<BTClass[]>([]);
    const [venues, setVenues] = useState<Venue[]>([]);
    const [instructors, setInstructors] = useState<Instructor[]>([]);
    const [classTypes, setClassTypes] = useState<BTClassType[]>([]);
    const [classTypesError, setClassTypesError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingClass, setEditingClass] = useState<BTClass | null>(null);
    const [enrolledModal, setEnrolledModal] = useState<BTClass | null>(null);
    const [enrolledStudents, setEnrolledStudents] = useState<Booking[]>([]);
    const [enrolledLoading, setEnrolledLoading] = useState(false);

    // Social booking link generator state for term classes
    const [socialLinkClass, setSocialLinkClass] = useState<BTClass | null>(null);
    const [socialCampaignName, setSocialCampaignName] = useState('');
    const [socialCampaignError, setSocialCampaignError] = useState('');
    const [socialLinkCopied, setSocialLinkCopied] = useState(false);
    const [generatedSocialLink, setGeneratedSocialLink] = useState('');

    const {
        register,
        handleSubmit,
        watch,
        setValue,
        reset,
        formState: { errors },
    } = useForm<ClassFormData>({
        resolver: zodResolver(classFormSchema),
        defaultValues: {
            name: '',
            description: '',
            type: '',
            dayOfWeek: 'Monday',
            startTime: '15:30',
            endTime: '16:30',
            ageMin: 5,
            ageMax: 12,
            maxSize: 15,
            instructor: '',
            venueId: '',
            price: 1500,
            commitment: 'perSession',
            termStartDate: '',
            termEndDate: '',
            termPrice: undefined,
            recurrenceDays: [],
        },
    });

    const commitment = watch('commitment');

    useEffect(() => {
        const fetchData = async () => {
            try {
                const classesSnap = await getDocs(collection(db, 'classes'));
                const venuesSnap = await getDocs(collection(db, 'venues'));
                const instructorsSnap = await getDocs(collection(db, 'instructors'));
                setClasses(classesSnap.docs.map(d => ({ id: d.id, ...d.data() } as BTClass)));
                setVenues(venuesSnap.docs.map(d => ({ id: d.id, ...d.data() } as Venue)));
                setInstructors(instructorsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Instructor)));
            } catch (e) {
                console.error(e);
            }

            try {
                const classTypesSnap = await getDocs(query(collection(db, 'class_types'), orderBy('order')));
                const types = classTypesSnap.docs.map(d => ({ id: d.id, ...d.data() } as BTClassType));
                setClassTypes(types);
                setClassTypesError(null);
            } catch (e) {
                console.error('Failed to fetch class types:', e);
                setClassTypesError('Failed to load class types. The type dropdown is unavailable.');
            }

            setLoading(false);
        };
        fetchData();
    }, []);

    const getClassTypeBadge = (slug: string) => {
        const ct = classTypes.find(t => t.slug === slug);
        if (ct) {
            return { label: ct.shortLabel, color: ct.badgeColor };
        }
        return { label: slug, color: 'gray' as const };
    };

    const getClassTypeDisplayName = (slug: string) => {
        const ct = classTypes.find(t => t.slug === slug);
        return ct?.displayName || slug;
    };

    const handleOpenModal = (c?: BTClass) => {
        if (c) {
            setEditingClass(c);
            reset({
                name: c.name || '',
                description: c.description || '',
                type: c.type,
                dayOfWeek: c.dayOfWeek,
                startTime: c.startTime,
                endTime: c.endTime,
                ageMin: c.ageMin,
                ageMax: c.ageMax,
                maxSize: c.maxSize,
                instructor: c.instructor,
                venueId: c.venueId,
                price: c.price,
                commitment: c.commitment || 'perSession',
                termStartDate: c.termStartDate || '',
                termEndDate: c.termEndDate || '',
                termPrice: c.termPrice || undefined,
                recurrenceDays: c.recurrenceDays || [],
            });
        } else {
            setEditingClass(null);
            const defaultType = classTypes.length > 0 ? classTypes[0].slug : '';
            reset({
                name: '',
                description: '',
                type: defaultType,
                dayOfWeek: 'Monday',
                startTime: '15:30',
                endTime: '16:30',
                ageMin: 5,
                ageMax: 12,
                maxSize: 15,
                instructor: '',
                venueId: '',
                price: 1500,
                commitment: 'perSession',
                termStartDate: '',
                termEndDate: '',
                termPrice: undefined,
                recurrenceDays: [],
            });
        }
        setShowModal(true);
    };

    const handleViewEnrolled = async (c: BTClass) => {
        setEnrolledModal(c);
        setEnrolledLoading(true);
        setEnrolledStudents([]);
        try {
            const bookingsQuery = query(
                collection(db, 'bookings'),
                where('classId', '==', c.id),
                where('bookingType', '==', 'term'),
                where('status', '==', 'confirmed')
            );
            const snap = await getDocs(bookingsQuery);
            const bookings = snap.docs.map(d => ({ id: d.id, ...d.data() } as Booking));
            setEnrolledStudents(bookings);
        } catch (e) {
            console.error('Failed to fetch enrolled students:', e);
        }
        setEnrolledLoading(false);
    };

    const CAMPAIGN_REGEX = /^[A-Za-z0-9_-]*$/;

    const handleOpenSocialLinkModal = (c: BTClass) => {
        setSocialLinkClass(c);
        setSocialCampaignName('');
        setSocialCampaignError('');
        setSocialLinkCopied(false);
        setGeneratedSocialLink('');
    };

    const handleCloseSocialLinkModal = () => {
        setSocialLinkClass(null);
        setSocialCampaignName('');
        setSocialCampaignError('');
        setSocialLinkCopied(false);
        setGeneratedSocialLink('');
    };

    const handleSocialCampaignNameChange = (value: string) => {
        setSocialCampaignName(value);
        setSocialLinkCopied(false);
        setGeneratedSocialLink('');
        if (value && !CAMPAIGN_REGEX.test(value)) {
            setSocialCampaignError('Only letters, numbers, hyphens, and underscores allowed');
        } else if (value.length > 50) {
            setSocialCampaignError('Campaign name must be 50 characters or fewer');
        } else {
            setSocialCampaignError('');
        }
    };

    const handleGenerateSocialLink = async () => {
        if (socialCampaignName && !CAMPAIGN_REGEX.test(socialCampaignName)) return;
        if (socialCampaignName.length > 50) return;

        // Build the express-book-term URL for sharing on social channels
        const classId = socialLinkClass?.id || 'unknown';
        let url = `${window.location.origin}/express-book-term/${classId}?source=social_link`;
        if (socialCampaignName.trim()) {
            url += `&utm_campaign=${encodeURIComponent(socialCampaignName.trim())}`;
        }

        setGeneratedSocialLink(url);
        await navigator.clipboard.writeText(url);
        setSocialLinkCopied(true);
        setTimeout(() => setSocialLinkCopied(false), 3000);
    };

    const onSubmit = async (formData: ClassFormData) => {
        const venue = venues.find(v => v.id === formData.venueId);

        // Build the data to save based on commitment type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let data: Record<string, any>;

        if (formData.commitment === 'term') {
            data = {
                name: formData.name,
                description: formData.description || '',
                type: formData.type,
                dayOfWeek: formData.dayOfWeek,
                startTime: formData.startTime,
                endTime: formData.endTime,
                ageMin: formData.ageMin,
                ageMax: formData.ageMax,
                maxSize: formData.maxSize,
                instructor: formData.instructor,
                venueId: formData.venueId,
                venueName: venue?.name || '',
                price: formData.price,
                commitment: 'term' as const,
                termStartDate: formData.termStartDate,
                termEndDate: formData.termEndDate,
                termPrice: formData.termPrice,
                recurrenceDays: formData.recurrenceDays,
                // For new term classes, set spotsAvailable = maxSize
                ...(!editingClass ? { spotsAvailable: formData.maxSize } : {}),
            };
        } else {
            // Per-session: save with commitment: 'perSession' and no term fields
            data = {
                name: formData.name,
                description: formData.description || '',
                type: formData.type,
                dayOfWeek: formData.dayOfWeek,
                startTime: formData.startTime,
                endTime: formData.endTime,
                ageMin: formData.ageMin,
                ageMax: formData.ageMax,
                maxSize: formData.maxSize,
                instructor: formData.instructor,
                venueId: formData.venueId,
                venueName: venue?.name || '',
                price: formData.price,
                commitment: 'perSession' as const,
            };
        }

        try {
            if (editingClass) {
                await updateDoc(doc(db, 'classes', editingClass.id), { ...data, updatedAt: serverTimestamp() });
                setClasses(prev => prev.map(c => c.id === editingClass.id ? { ...c, ...data } as BTClass : c));
            } else {
                const docRef = await addDoc(collection(db, 'classes'), { ...data, createdAt: serverTimestamp() });
                setClasses(prev => [...prev, { id: docRef.id, ...data } as BTClass]);
            }
            setShowModal(false);
        } catch (e) {
            console.error(e);
            alert('Error saving class.');
        }
    };

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <div>
                    <h1>Class Master</h1>
                    <p>Define recurring class types and their default settings.</p>
                </div>
                <button className="btn btn-primary" onClick={() => handleOpenModal()}>
                    Add Class Type
                </button>
            </div>

            {loading ? (
                <div className="spinner" />
            ) : (
                <div className={styles.grid}>
                    {classes.map(c => {
                        const badge = getClassTypeBadge(c.type);
                        return (
                            <div key={c.id} className={`card ${styles.classCard}`}>
                                <div className={styles.classHeader}>
                                    <span className={`badge badge-${badge.color}`}>
                                        {badge.label}
                                    </span>
                                    <div className={styles.classActions}>
                                        <div className="flex gap-2">
                                            <button className="btn btn-ghost btn-sm" onClick={() => handleOpenModal(c)}>
                                                <Edit2 size={16} strokeWidth={1.5} />
                                            </button>
                                            <button className="btn btn-ghost btn-sm text-danger" onClick={async () => {
                                                if (confirm('Delete this class?')) {
                                                    await deleteDoc(doc(db, 'classes', c.id));
                                                    setClasses(prev => prev.filter(item => item.id !== c.id));
                                                }
                                            }}>
                                                <Trash2 size={16} strokeWidth={1.5} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                                <h3>{c.name || getClassTypeDisplayName(c.type)}</h3>
                                <div className={styles.classMeta}>
                                    {c.commitment === 'term' ? (
                                        <>
                                            <p><span className="badge badge-indigo">Term</span></p>
                                            {c.recurrenceDays && c.recurrenceDays.length > 0 && (
                                                <p><CalendarDays size={14} strokeWidth={1.5} /> {formatRecurrenceDays(c.recurrenceDays)}</p>
                                            )}
                                            {c.termStartDate && c.termEndDate && (
                                                <p><Calendar size={14} strokeWidth={1.5} /> {c.termStartDate} – {c.termEndDate}</p>
                                            )}
                                            <p><Clock size={14} strokeWidth={1.5} /> {c.startTime}–{c.endTime}</p>
                                            <p><MapPin size={14} strokeWidth={1.5} /> {c.venueName}</p>
                                            <p><Users size={14} strokeWidth={1.5} /> Ages {c.ageMin}–{c.ageMax} • Max {c.maxSize}</p>
                                            <p><UserCheck size={14} strokeWidth={1.5} /> Spots: {c.spotsAvailable ?? 0} / {c.maxSize}</p>
                                            {c.termPrice && (
                                                <p><strong>Package Price: £{(c.termPrice / 100).toFixed(2)}</strong></p>
                                            )}
                                            <button
                                                className="btn btn-ghost btn-sm"
                                                onClick={() => handleViewEnrolled(c)}
                                                style={{ marginTop: '0.5rem', alignSelf: 'flex-start' }}
                                            >
                                                <UserCheck size={14} strokeWidth={1.5} /> View Enrolled Students
                                            </button>
                                            <button
                                                className="btn btn-ghost btn-sm"
                                                onClick={() => handleOpenSocialLinkModal(c)}
                                                style={{ marginTop: '0.25rem', alignSelf: 'flex-start' }}
                                                title="Generate Social Booking Link"
                                                aria-label={`Generate social booking link for ${getClassTypeDisplayName(c.type)}`}
                                            >
                                                <Share2 size={14} strokeWidth={1.5} /> Social Link
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <p><Clock size={14} strokeWidth={1.5} /> {c.dayOfWeek}, {c.startTime}–{c.endTime}</p>
                                            <p><MapPin size={14} strokeWidth={1.5} /> {c.venueName}</p>
                                            <p><Users size={14} strokeWidth={1.5} /> Ages {c.ageMin}–{c.ageMax} • Max {c.maxSize}</p>
                                            <p><strong>Price: £{(c.price / 100).toFixed(2)}</strong></p>
                                        </>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {showModal && (
                <div className="modal-overlay">
                    <div className="modal modal-lg">
                        <div className="modal-header">
                            <h2 className="modal-title">{editingClass ? 'Edit Class' : 'Add New Class'}</h2>
                            <button className="modal-close" onClick={() => setShowModal(false)}><X size={20} /></button>
                        </div>
                        <form onSubmit={handleSubmit(onSubmit)} className={styles.form}>
                            {/* Commitment selector — at the top so the form adapts immediately */}
                            <div className={styles.commitmentGroup}>
                                <label className="form-label">Commitment</label>
                                <div className={styles.radioGroup}>
                                    <label className={styles.radioOption}>
                                        <input
                                            type="radio"
                                            value="perSession"
                                            {...register('commitment')}
                                        />
                                        <span>Per Session</span>
                                    </label>
                                    <label className={styles.radioOption}>
                                        <input
                                            type="radio"
                                            value="term"
                                            {...register('commitment')}
                                        />
                                        <span>Term / Programme</span>
                                    </label>
                                </div>
                            </div>

                            <div className="form-row">
                                <div className="form-group" style={{ flex: 1 }}>
                                    <label className="form-label">Class Name</label>
                                    <input
                                        className="form-input"
                                        placeholder="e.g. Junior Chefs — August Holiday Workshop"
                                        {...register('name')}
                                    />
                                    {errors.name && <p className="form-error">{errors.name.message}</p>}
                                </div>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Short Description (Optional)</label>
                                <input
                                    className="form-input"
                                    placeholder="e.g. 5 days of no-cook recipes for young chefs aged 5–11"
                                    {...register('description')}
                                />
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label className="form-label">Type</label>
                                    {classTypesError ? (
                                        <div>
                                            <select className="form-select" disabled>
                                                <option>Unable to load class types</option>
                                            </select>
                                            <p className="text-danger" style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>{classTypesError}</p>
                                        </div>
                                    ) : (
                                        <>
                                            <select className="form-select" {...register('type')}>
                                                <option value="">Select Class Type...</option>
                                                {classTypes.map(ct => (
                                                    <option key={ct.slug} value={ct.slug}>{ct.displayName}</option>
                                                ))}
                                            </select>
                                            {errors.type && <p className="form-error">{errors.type.message}</p>}
                                        </>
                                    )}
                                </div>
                                {/* Day of Week — only relevant for per-session classes */}
                                {commitment !== 'term' && (
                                    <div className="form-group">
                                        <label className="form-label">Day of Week</label>
                                        <select className="form-select" {...register('dayOfWeek')}>
                                            {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(d => <option key={d} value={d}>{d}</option>)}
                                        </select>
                                    </div>
                                )}
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label className="form-label">Start Time</label>
                                    <input type="time" className="form-input" {...register('startTime')} />
                                    {errors.startTime && <p className="form-error">{errors.startTime.message}</p>}
                                </div>
                                <div className="form-group">
                                    <label className="form-label">End Time</label>
                                    <input type="time" className="form-input" {...register('endTime')} />
                                    {errors.endTime && <p className="form-error">{errors.endTime.message}</p>}
                                </div>
                                {/* Per-session price — hidden for term/programme classes (they use Package Price) */}
                                {commitment !== 'term' && (
                                    <div className="form-group">
                                        <label className="form-label">Price (Pence)</label>
                                        <input type="number" className="form-input" {...register('price', { valueAsNumber: true })} />
                                        {errors.price && <p className="form-error">{errors.price.message}</p>}
                                    </div>
                                )}
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label className="form-label">Min Age</label>
                                    <input type="number" className="form-input" {...register('ageMin', { valueAsNumber: true })} />
                                    {errors.ageMin && <p className="form-error">{errors.ageMin.message}</p>}
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Max Age</label>
                                    <input type="number" className="form-input" {...register('ageMax', { valueAsNumber: true })} />
                                    {errors.ageMax && <p className="form-error">{errors.ageMax.message}</p>}
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Max Class Size</label>
                                    <input type="number" className="form-input" {...register('maxSize', { valueAsNumber: true })} />
                                    {errors.maxSize && <p className="form-error">{errors.maxSize.message}</p>}
                                </div>
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label className="form-label">Instructor</label>
                                    <select className="form-select" {...register('instructor')}>
                                        <option value="">Select Instructor...</option>
                                        {instructors.map(i => <option key={i.id} value={i.name}>{i.name}</option>)}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Venue</label>
                                    <select className="form-select" {...register('venueId')}>
                                        <option value="">Select Venue...</option>
                                        {venues.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                                    </select>
                                    {errors.venueId && <p className="form-error">{errors.venueId.message}</p>}
                                </div>
                            </div>

                            {/* Term-specific fields — shown only when commitment === 'term' */}
                            {commitment === 'term' && (
                                <TermFields
                                    register={register}
                                    errors={errors}
                                    setValue={setValue}
                                    watch={watch}
                                />
                            )}

                            <div className={styles.modalActions}>
                                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary">Save Class</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Enrolled Students Modal for Term Classes */}
            {enrolledModal && (
                <div className="modal-overlay">
                    <div className="modal modal-lg">
                        <div className="modal-header">
                            <h2 className="modal-title">
                                Enrolled Students — {getClassTypeDisplayName(enrolledModal.type)}
                            </h2>
                            <button className="modal-close" onClick={() => setEnrolledModal(null)}><X size={20} /></button>
                        </div>
                        <div className={styles.enrolledBody}>
                            <div className={styles.enrolledSummary}>
                                <p><UserCheck size={16} strokeWidth={1.5} /> <strong>Spots:</strong> {enrolledModal.spotsAvailable ?? 0} / {enrolledModal.maxSize} available</p>
                                {enrolledModal.recurrenceDays && enrolledModal.recurrenceDays.length > 0 && (
                                    <p><CalendarDays size={16} strokeWidth={1.5} /> {formatRecurrenceDays(enrolledModal.recurrenceDays)}</p>
                                )}
                                {enrolledModal.termStartDate && enrolledModal.termEndDate && (
                                    <p><Clock size={16} strokeWidth={1.5} /> {enrolledModal.termStartDate} – {enrolledModal.termEndDate}</p>
                                )}
                            </div>

                            {enrolledLoading ? (
                                <div className="spinner" />
                            ) : enrolledStudents.length === 0 ? (
                                <p className={styles.noStudents}>No students currently enrolled in this term class.</p>
                            ) : (
                                <table className={styles.enrolledTable}>
                                    <thead>
                                        <tr>
                                            <th>Student Name</th>
                                            <th>Booked By</th>
                                            <th>Booking Date</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {enrolledStudents.map(booking => (
                                            <tr key={booking.id}>
                                                <td>{booking.studentName}</td>
                                                <td>{booking.bookedByName}</td>
                                                <td>
                                                    {booking.createdAt?.toDate
                                                        ? booking.createdAt.toDate().toLocaleDateString('en-GB')
                                                        : '—'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Social Booking Link Generator Modal for Term Classes */}
            {socialLinkClass && (
                <div className="modal-overlay">
                    <div className="modal" style={{ maxWidth: '480px' }}>
                        <div className="modal-header">
                            <h2 className="modal-title">Generate Social Link</h2>
                            <button className="modal-close" onClick={handleCloseSocialLinkModal}><X size={20} /></button>
                        </div>

                        <div className={styles.socialLinkBody}>
                            {/* Warning if programme has no spots or has ended */}
                            {((socialLinkClass.spotsAvailable ?? 0) <= 0 || (socialLinkClass.termEndDate && socialLinkClass.termEndDate < new Date().toISOString().split('T')[0])) && (
                                <div className={styles.socialLinkWarning}>
                                    <AlertTriangle size={16} />
                                    <span>
                                        {(socialLinkClass.spotsAvailable ?? 0) <= 0
                                            ? 'No spots available for this programme.'
                                            : 'This programme has ended.'}
                                        {' '}Link can still be generated.
                                    </span>
                                </div>
                            )}

                            <div className={styles.socialLinkClassInfo}>
                                <strong>{getClassTypeDisplayName(socialLinkClass.type)}</strong>
                                <span>
                                    {socialLinkClass.termStartDate && socialLinkClass.termEndDate
                                        ? `${socialLinkClass.termStartDate} – ${socialLinkClass.termEndDate}`
                                        : 'N/A'}
                                    {' · '}{socialLinkClass.venueName}
                                    {' · '}{socialLinkClass.spotsAvailable ?? 0} spot{(socialLinkClass.spotsAvailable ?? 0) !== 1 ? 's' : ''} left
                                </span>
                            </div>

                            <div className="form-group">
                                <label className="form-label" htmlFor="social-campaign-name">
                                    Campaign Name <span className={styles.socialLinkOptional}>(optional)</span>
                                </label>
                                <input
                                    type="text"
                                    id="social-campaign-name"
                                    className="form-input"
                                    value={socialCampaignName}
                                    onChange={(e) => handleSocialCampaignNameChange(e.target.value)}
                                    placeholder="e.g. summer-2025"
                                    maxLength={50}
                                    aria-describedby={socialCampaignError ? 'social-campaign-error' : undefined}
                                />
                                {socialCampaignError && (
                                    <p id="social-campaign-error" className={styles.socialLinkError}>
                                        {socialCampaignError}
                                    </p>
                                )}
                                <p className={styles.socialLinkHint}>
                                    Track which social campaign drives bookings. Only letters, numbers, hyphens, and underscores.
                                </p>
                            </div>

                            <button
                                className="btn btn-primary"
                                onClick={handleGenerateSocialLink}
                                disabled={!!socialCampaignError}
                            >
                                Generate & Copy Link
                            </button>

                            {generatedSocialLink && (
                                <div className={styles.socialLinkResult}>
                                    <p className={styles.socialLinkUrl}>{generatedSocialLink}</p>
                                    {socialLinkCopied && (
                                        <span className={styles.socialLinkCopiedBadge}>✓ Copied to clipboard</span>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
