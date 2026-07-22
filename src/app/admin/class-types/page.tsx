'use client';

import { useState, useEffect } from 'react';
import { collection, query, orderBy, getDocs, addDoc, updateDoc, deleteDoc, doc, where, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { BTClassType } from '@/types';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { classTypeSchema, ClassTypeFormData, BADGE_COLORS } from './schema';
import { Tag, Plus, Edit2, X, Users, Clock, DollarSign, Trash2 } from 'lucide-react';
import styles from './page.module.css';

export default function AdminClassTypes() {
    const [classTypes, setClassTypes] = useState<BTClassType[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingClassType, setEditingClassType] = useState<BTClassType | null>(null);
    const [submitError, setSubmitError] = useState<string | null>(null);

    const {
        register,
        handleSubmit,
        reset,
        setError,
        formState: { errors, isSubmitting },
    } = useForm<ClassTypeFormData>({
        resolver: zodResolver(classTypeSchema),
    });

    useEffect(() => {
        const fetchClassTypes = async () => {
            try {
                const snap = await getDocs(query(collection(db, 'class_types'), orderBy('order')));
                setClassTypes(snap.docs.map(d => ({ id: d.id, ...d.data() } as BTClassType)));
            } catch (e) {
                console.error('Failed to fetch class types:', e);
            } finally {
                setLoading(false);
            }
        };
        fetchClassTypes();
    }, []);

    const handleOpenModal = (ct?: BTClassType) => {
        setSubmitError(null);
        if (ct) {
            setEditingClassType(ct);
            reset({
                slug: ct.slug,
                displayName: ct.displayName,
                shortLabel: ct.shortLabel,
                badgeColor: ct.badgeColor,
                skipQuestionnaire: ct.skipQuestionnaire,
                requireEmergencyContact: ct.requireEmergencyContact,
                defaultAgeMin: ct.defaultAgeMin,
                defaultAgeMax: ct.defaultAgeMax,
                defaultMaxSize: ct.defaultMaxSize,
                defaultPrice: ct.defaultPrice,
                order: ct.order,
            });
        } else {
            setEditingClassType(null);
            reset({
                slug: '',
                displayName: '',
                shortLabel: '',
                badgeColor: 'gray',
                skipQuestionnaire: false,
                requireEmergencyContact: false,
                defaultAgeMin: 0,
                defaultAgeMax: 12,
                defaultMaxSize: 15,
                defaultPrice: 1500,
                order: classTypes.length + 1,
            });
        }
        setShowModal(true);
    };

    const handleCloseModal = () => {
        setShowModal(false);
        setEditingClassType(null);
        setSubmitError(null);
    };

    const handleDelete = async (ct: BTClassType) => {
        // Safety guard: cannot delete the last class type
        if (classTypes.length <= 1) {
            alert('Cannot delete the last class type. At least one class type must exist.');
            return;
        }

        // Safety guard: check if any classes reference this type
        try {
            const classesSnap = await getDocs(
                query(collection(db, 'classes'), where('type', '==', ct.slug))
            );

            if (!classesSnap.empty) {
                const referencingNames = classesSnap.docs
                    .map(d => (d.data() as { name?: string }).name || d.id)
                    .join(', ');
                alert(
                    `Cannot delete "${ct.displayName}" because it is referenced by the following classes:\n\n${referencingNames}\n\nPlease reassign or delete those classes first.`
                );
                return;
            }
        } catch (e) {
            console.error('Error checking class references:', e);
            alert('Failed to verify class references. Please try again.');
            return;
        }

        // Confirm deletion
        if (!window.confirm(`Are you sure you want to delete "${ct.displayName}"? This action cannot be undone.`)) {
            return;
        }

        // Perform deletion
        try {
            await deleteDoc(doc(db, 'class_types', ct.id));
            setClassTypes(prev => prev.filter(item => item.id !== ct.id));
        } catch (e) {
            console.error('Error deleting class type:', e);
            alert('Failed to delete class type. Please try again.');
        }
    };

    const onSubmit = async (data: ClassTypeFormData) => {
        setSubmitError(null);

        // Slug uniqueness check (from local state)
        const duplicate = classTypes.find(
            ct => ct.slug === data.slug && ct.id !== editingClassType?.id
        );
        if (duplicate) {
            setError('slug', { type: 'manual', message: 'This slug is already in use. Please choose a unique slug.' });
            return;
        }

        try {
            if (editingClassType) {
                // Update existing
                await updateDoc(doc(db, 'class_types', editingClassType.id), {
                    ...data,
                    updatedAt: serverTimestamp(),
                });
                // Optimistic local state update
                setClassTypes(prev =>
                    prev.map(ct =>
                        ct.id === editingClassType.id ? { ...ct, ...data } : ct
                    )
                );
            } else {
                // Create new
                const docRef = await addDoc(collection(db, 'class_types'), {
                    ...data,
                    createdAt: serverTimestamp(),
                });
                // Optimistic local state update
                setClassTypes(prev => [...prev, { id: docRef.id, ...data, createdAt: null } as BTClassType]);
            }
            handleCloseModal();
        } catch (e) {
            console.error('Error saving class type:', e);
            setSubmitError('Failed to save class type. Please try again.');
        }
    };

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <div>
                    <h1>Class Types</h1>
                    <p>Manage programme types, their display settings, and default values.</p>
                </div>
                <button className="btn btn-primary" onClick={() => handleOpenModal()}>
                    <Plus size={16} strokeWidth={1.5} /> Add Class Type
                </button>
            </div>

            {loading ? (
                <div className="spinner" />
            ) : classTypes.length === 0 ? (
                <div className="alert">No class types found. Create your first class type to get started.</div>
            ) : (
                <div className={styles.grid}>
                    {classTypes.map(ct => (
                        <div key={ct.id} className={`card ${styles.classTypeCard}`}>
                            <div className={styles.classTypeHeader}>
                                <span className={`badge badge-${ct.badgeColor}`}>
                                    {ct.shortLabel}
                                </span>
                                <div>
                                    <button className="btn btn-ghost btn-sm" onClick={() => handleOpenModal(ct)}>
                                        <Edit2 size={16} strokeWidth={1.5} />
                                    </button>
                                    <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(ct)}>
                                        <Trash2 size={16} strokeWidth={1.5} />
                                    </button>
                                </div>
                            </div>
                            <h3>{ct.displayName}</h3>
                            <div className={styles.classTypeMeta}>
                                <p><Users size={14} strokeWidth={1.5} /> Ages {ct.defaultAgeMin}–{ct.defaultAgeMax} • Max {ct.defaultMaxSize}</p>
                                <p><DollarSign size={14} strokeWidth={1.5} /> £{(ct.defaultPrice / 100).toFixed(2)} default</p>
                                <p><Clock size={14} strokeWidth={1.5} /> Order: {ct.order}</p>
                            </div>
                            <div className={styles.flags}>
                                {ct.skipQuestionnaire && <span className={styles.flag}>Skip Questionnaire</span>}
                                {ct.requireEmergencyContact && <span className={styles.flag}>Requires Emergency Contact</span>}
                                {!ct.skipQuestionnaire && !ct.requireEmergencyContact && (
                                    <span className={styles.flag}>Standard Flow</span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {showModal && (
                <div className="modal-overlay">
                    <div className="modal modal-lg">
                        <div className="modal-header">
                            <h2 className="modal-title">
                                {editingClassType ? 'Edit Class Type' : 'Add New Class Type'}
                            </h2>
                            <button className="modal-close" onClick={handleCloseModal}>
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit(onSubmit)} className={styles.form}>
                            {submitError && <div className="alert alert-error">{submitError}</div>}

                            <div className={styles.formRow}>
                                <div className="form-group">
                                    <label className="form-label">Slug</label>
                                    <input
                                        className="form-input"
                                        placeholder="e.g. kids-after-school"
                                        {...register('slug')}
                                    />
                                    {errors.slug && <span className="form-error">{errors.slug.message}</span>}
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Display Name</label>
                                    <input
                                        className="form-input"
                                        placeholder="e.g. Kids After School Club"
                                        {...register('displayName')}
                                    />
                                    {errors.displayName && <span className="form-error">{errors.displayName.message}</span>}
                                </div>
                            </div>

                            <div className={styles.formRow}>
                                <div className="form-group">
                                    <label className="form-label">Short Label</label>
                                    <input
                                        className="form-input"
                                        placeholder="e.g. Kids"
                                        {...register('shortLabel')}
                                    />
                                    {errors.shortLabel && <span className="form-error">{errors.shortLabel.message}</span>}
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Badge Colour</label>
                                    <select className="form-select" {...register('badgeColor')}>
                                        {BADGE_COLORS.map(color => (
                                            <option key={color} value={color}>{color}</option>
                                        ))}
                                    </select>
                                    {errors.badgeColor && <span className="form-error">{errors.badgeColor.message}</span>}
                                </div>
                            </div>

                            <div className={styles.formRow}>
                                <div className="form-group">
                                    <label className="form-label">Default Min Age</label>
                                    <input
                                        type="number"
                                        className="form-input"
                                        {...register('defaultAgeMin', { valueAsNumber: true })}
                                    />
                                    {errors.defaultAgeMin && <span className="form-error">{errors.defaultAgeMin.message}</span>}
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Default Max Age</label>
                                    <input
                                        type="number"
                                        className="form-input"
                                        {...register('defaultAgeMax', { valueAsNumber: true })}
                                    />
                                    {errors.defaultAgeMax && <span className="form-error">{errors.defaultAgeMax.message}</span>}
                                </div>
                            </div>

                            <div className={styles.formRow}>
                                <div className="form-group">
                                    <label className="form-label">Default Max Size</label>
                                    <input
                                        type="number"
                                        className="form-input"
                                        {...register('defaultMaxSize', { valueAsNumber: true })}
                                    />
                                    {errors.defaultMaxSize && <span className="form-error">{errors.defaultMaxSize.message}</span>}
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Default Price (pence)</label>
                                    <input
                                        type="number"
                                        className="form-input"
                                        {...register('defaultPrice', { valueAsNumber: true })}
                                    />
                                    {errors.defaultPrice && <span className="form-error">{errors.defaultPrice.message}</span>}
                                </div>
                            </div>

                            <div className={styles.formRow}>
                                <div className="form-group">
                                    <label className="form-label">Display Order</label>
                                    <input
                                        type="number"
                                        className="form-input"
                                        {...register('order', { valueAsNumber: true })}
                                    />
                                    {errors.order && <span className="form-error">{errors.order.message}</span>}
                                </div>
                                <div className="form-group" />
                            </div>

                            <div className={styles.formRow}>
                                <div className="form-group">
                                    <label className="form-label">
                                        <input
                                            type="checkbox"
                                            {...register('skipQuestionnaire')}
                                        />{' '}
                                        Skip Dietary Questionnaire
                                    </label>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">
                                        <input
                                            type="checkbox"
                                            {...register('requireEmergencyContact')}
                                        />{' '}
                                        Require Emergency Contact
                                    </label>
                                </div>
                            </div>

                            <div className={styles.modalActions}>
                                <button type="button" className="btn btn-ghost" onClick={handleCloseModal}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                                    {isSubmitting ? 'Saving...' : (editingClassType ? 'Update Class Type' : 'Create Class Type')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
