'use client';

import { useState, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { collection, getDocs, addDoc, updateDoc, doc, serverTimestamp, query, where, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Bundle, BTClass, Session } from '@/types';
import styles from './BundleForm.module.css';

// ---------------------
// Zod schema
// ---------------------
const bundleFormSchema = z.object({
    name: z.string().min(3, 'Name must be at least 3 characters').max(100, 'Name must be at most 100 characters'),
    classId: z.string().min(1, 'Please select a class'),
    sessionIds: z.array(z.string()).min(2, 'Select at least 2 sessions').max(20, 'Maximum 20 sessions'),
    bundlePrice: z.number().int().min(1, 'Price must be at least 1 pence'),
});

type BundleFormData = z.infer<typeof bundleFormSchema>;

interface BundleFormProps {
    editingBundle: Bundle | null;
    onSave: () => void;
    onCancel: () => void;
}

export default function BundleForm({ editingBundle, onSave, onCancel }: BundleFormProps) {
    const [classes, setClasses] = useState<BTClass[]>([]);
    const [sessions, setSessions] = useState<Session[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [priceError, setPriceError] = useState<string | null>(null);
    const [sessionRemovalErrors, setSessionRemovalErrors] = useState<Record<string, string>>({});

    const {
        register,
        handleSubmit,
        watch,
        setValue,
        formState: { errors },
    } = useForm<BundleFormData>({
        resolver: zodResolver(bundleFormSchema),
        defaultValues: {
            name: editingBundle?.name || '',
            classId: editingBundle?.classId || '',
            sessionIds: editingBundle?.sessionIds || [],
            bundlePrice: editingBundle?.bundlePrice || 0,
        },
    });

    const selectedClassId = watch('classId');
    const selectedSessionIds = watch('sessionIds');
    const bundlePrice = watch('bundlePrice');

    // Fetch classes and sessions on mount
    useEffect(() => {
        const fetchData = async () => {
            try {
                const classesSnap = await getDocs(collection(db, 'classes'));
                const sessionsSnap = await getDocs(
                    query(collection(db, 'sessions'), orderBy('date', 'asc'))
                );
                setClasses(classesSnap.docs.map(d => ({ id: d.id, ...d.data() } as BTClass)));
                setSessions(sessionsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Session)));
            } catch (e) {
                console.error('[BundleForm] Error fetching data:', e);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    // Filter sessions by selected class and status 'open'
    const filteredSessions = useMemo(() => {
        if (!selectedClassId) return [];
        return sessions.filter(s => s.classId === selectedClassId && s.status === 'open');
    }, [sessions, selectedClassId]);

    // Auto-calculate total individual price from selected sessions
    const totalIndividualPrice = useMemo(() => {
        return sessions
            .filter(s => selectedSessionIds.includes(s.id))
            .reduce((sum, s) => sum + s.price, 0);
    }, [sessions, selectedSessionIds]);

    // Validate bundlePrice <= totalIndividualPrice whenever either changes
    useEffect(() => {
        if (bundlePrice > 0 && totalIndividualPrice > 0 && bundlePrice > totalIndividualPrice) {
            setPriceError('Bundle price cannot exceed total individual price');
        } else {
            setPriceError(null);
        }
    }, [bundlePrice, totalIndividualPrice]);

    // Clear session selection when class changes (but not on initial load with editing bundle)
    const [initialClassSet, setInitialClassSet] = useState(!!editingBundle);
    useEffect(() => {
        if (!initialClassSet) {
            setInitialClassSet(true);
            return;
        }
        // Only clear if user changed class, not on first render with editingBundle
        if (!editingBundle || selectedClassId !== editingBundle.classId) {
            setValue('sessionIds', []);
            setSessionRemovalErrors({});
        }
    }, [selectedClassId]); // eslint-disable-line react-hooks/exhaustive-deps

    // Toggle session selection
    const toggleSession = async (sessionId: string) => {
        const current = selectedSessionIds || [];
        if (current.includes(sessionId)) {
            // Trying to deselect — check for existing bookings in edit mode
            if (editingBundle) {
                const hasBookings = await checkSessionBookings(editingBundle.id, sessionId);
                if (hasBookings) {
                    const session = sessions.find(s => s.id === sessionId);
                    const dateStr = session
                        ? new Date(session.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                        : sessionId;
                    setSessionRemovalErrors(prev => ({
                        ...prev,
                        [sessionId]: `Cannot remove ${dateStr} — it has existing bookings`,
                    }));
                    return;
                }
            }
            // Remove from selection
            setSessionRemovalErrors(prev => {
                const next = { ...prev };
                delete next[sessionId];
                return next;
            });
            setValue('sessionIds', current.filter(id => id !== sessionId), { shouldValidate: true });
        } else {
            // Add to selection
            setValue('sessionIds', [...current, sessionId], { shouldValidate: true });
        }
    };

    // Check if a session has existing bookings for this bundle
    const checkSessionBookings = async (bundleId: string, sessionId: string): Promise<boolean> => {
        try {
            const bookingsSnap = await getDocs(
                query(
                    collection(db, 'bookings'),
                    where('bundleId', '==', bundleId),
                    where('sessionId', '==', sessionId),
                    where('status', '==', 'confirmed')
                )
            );
            return bookingsSnap.size > 0;
        } catch (e) {
            console.error('[BundleForm] Error checking bookings:', e);
            return false;
        }
    };

    const onSubmit = async (data: BundleFormData) => {
        // Additional validation: bundlePrice <= totalIndividualPrice
        if (data.bundlePrice > totalIndividualPrice) {
            setPriceError('Bundle price cannot exceed total individual price');
            return;
        }

        setSubmitting(true);
        try {
            const selectedClass = classes.find(c => c.id === data.classId);
            const bundleData = {
                name: data.name,
                classId: data.classId,
                className: selectedClass?.name || '',
                classType: selectedClass?.type || '',
                sessionIds: data.sessionIds,
                bundlePrice: data.bundlePrice,
                totalIndividualPrice,
                status: editingBundle?.status || 'active',
                venueId: selectedClass?.venueId || '',
                venueName: selectedClass?.venueName || '',
            };

            if (editingBundle) {
                await updateDoc(doc(db, 'bundles', editingBundle.id), {
                    ...bundleData,
                    updatedAt: serverTimestamp(),
                });
            } else {
                await addDoc(collection(db, 'bundles'), {
                    ...bundleData,
                    createdAt: serverTimestamp(),
                });
            }

            onSave();
        } catch (e: any) {
            console.error('[BundleForm] Error saving bundle:', e);
            if (e?.code === 'permission-denied') {
                alert('Permission denied. You do not have access to save bundles.');
            } else {
                alert(`Failed to save bundle: ${e?.message || 'Unknown error'}. Please try again.`);
            }
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return <div className="spinner" />;
    }

    return (
        <form onSubmit={handleSubmit(onSubmit)} className={styles.form}>
            {/* Bundle name */}
            <div className="form-group">
                <label className="form-label" htmlFor="bundle-name">Bundle Name</label>
                <input
                    id="bundle-name"
                    type="text"
                    className="form-input"
                    placeholder="e.g. January Saturday Bundle"
                    {...register('name')}
                />
                {errors.name && <p className={styles.error}>{errors.name.message}</p>}
            </div>

            <div className={styles.formRow}>
                {/* Class selector */}
                <div className="form-group">
                    <label className="form-label" htmlFor="bundle-class">Class</label>
                    <select
                        id="bundle-class"
                        className="form-select"
                        {...register('classId')}
                    >
                        <option value="">Select a class...</option>
                        {classes.map(c => (
                            <option key={c.id} value={c.id}>
                                {c.name} — {c.venueName || c.type}
                            </option>
                        ))}
                    </select>
                    {errors.classId && <p className={styles.error}>{errors.classId.message}</p>}
                </div>

                {/* Bundle price */}
                <div className="form-group">
                    <label className="form-label" htmlFor="bundle-price">Bundle Price (pence)</label>
                    <input
                        id="bundle-price"
                        type="number"
                        className="form-input"
                        placeholder="e.g. 5000 for £50.00"
                        {...register('bundlePrice', { valueAsNumber: true })}
                    />
                    {errors.bundlePrice && <p className={styles.error}>{errors.bundlePrice.message}</p>}
                    {priceError && <p className={styles.error}>{priceError}</p>}
                </div>
            </div>

            {/* Session selector */}
            <div className={styles.sessionSelector}>
                <label>Sessions</label>
                {!selectedClassId ? (
                    <p>Select a class above to see available sessions.</p>
                ) : filteredSessions.length === 0 ? (
                    <p>No open sessions available for the selected class.</p>
                ) : (
                    <>
                        <p>Click to select/deselect sessions ({selectedSessionIds.length} selected)</p>
                        <div className={styles.sessionGrid}>
                            {filteredSessions.map(session => {
                                const isSelected = selectedSessionIds.includes(session.id);
                                const hasError = sessionRemovalErrors[session.id];
                                return (
                                    <div
                                        key={session.id}
                                        className={`${styles.sessionCard} ${isSelected ? styles.selectedSession : ''}`}
                                        onClick={() => toggleSession(session.id)}
                                        role="button"
                                        tabIndex={0}
                                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSession(session.id); } }}
                                        aria-pressed={isSelected}
                                        aria-label={`Session on ${session.date}, ${isSelected ? 'selected' : 'not selected'}`}
                                    >
                                        <strong>
                                            {new Date(session.date).toLocaleDateString('en-GB', {
                                                weekday: 'short',
                                                day: 'numeric',
                                                month: 'short',
                                                year: 'numeric',
                                            })}
                                        </strong>
                                        <span>{session.startTime} – {session.endTime}</span>
                                        <span>£{(session.price / 100).toFixed(2)} · {session.spotsAvailable} spots</span>
                                        {hasError && <span className={styles.error}>{hasError}</span>}
                                    </div>
                                );
                            })}
                        </div>
                    </>
                )}
                {errors.sessionIds && <p className={styles.error}>{errors.sessionIds.message}</p>}
            </div>

            {/* Price summary */}
            {selectedSessionIds.length >= 2 && totalIndividualPrice > 0 && (
                <div className={styles.priceSummary}>
                    <p>
                        Total individual price:
                        <strong>£{(totalIndividualPrice / 100).toFixed(2)}</strong>
                    </p>
                    {bundlePrice > 0 && bundlePrice <= totalIndividualPrice && (
                        <>
                            <p>
                                Bundle price:
                                <strong>£{(bundlePrice / 100).toFixed(2)}</strong>
                            </p>
                            <p className={styles.saving}>
                                Saving:
                                <strong>£{((totalIndividualPrice - bundlePrice) / 100).toFixed(2)}</strong>
                            </p>
                        </>
                    )}
                </div>
            )}

            {/* Actions */}
            <div className={styles.modalActions}>
                <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={submitting}>
                    Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                    {submitting ? 'Saving...' : editingBundle ? 'Update Bundle' : 'Create Bundle'}
                </button>
            </div>
        </form>
    );
}
