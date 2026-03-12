'use client';

import { useState, useEffect, useRef } from 'react';
import { collection, query, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, orderBy } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';
import { Instructor, InstructorGender } from '@/types';
import { UserCheck, Plus, Edit2, Trash2, X, Upload, Loader2, AlertCircle } from 'lucide-react';
import styles from './page.module.css';

const GENDERS: { value: InstructorGender; label: string }[] = [
    { value: 'female', label: 'Female' },
    { value: 'male', label: 'Male' },
    { value: 'non-binary', label: 'Non-binary' },
    { value: 'prefer-not-to-say', label: 'Prefer not to say' },
];

const GENDER_LABELS: Record<InstructorGender, string> = {
    female: 'Female',
    male: 'Male',
    'non-binary': 'Non-binary',
    'prefer-not-to-say': 'Prefer not to say',
};

const EXPERTISE_SUGGESTIONS = [
    'Baking', 'Bread', 'Cakes', 'Cookies', 'Pasta', 'Nutrition',
    'Knife Skills', 'Pastry', 'Decorating', 'Healthy Eating', 'World Cuisine',
];

type FormData = {
    name: string;
    gender: InstructorGender;
    bio: string;
    expertiseInput: string;
    expertise: string[];
    photoUrl: string;
    order: number;
};

export default function AdminInstructors() {
    const [instructors, setInstructors] = useState<Instructor[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingInstructor, setEditingInstructor] = useState<Instructor | null>(null);
    const [formData, setFormData] = useState<FormData>({
        name: '',
        gender: 'female',
        bio: '',
        expertiseInput: '',
        expertise: [],
        photoUrl: '',
        order: 0,
    });

    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const fetchInstructors = async () => {
            try {
                const snap = await getDocs(query(collection(db, 'instructors'), orderBy('order', 'asc')));
                setInstructors(snap.docs.map(d => ({ id: d.id, ...d.data() } as Instructor)));
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        fetchInstructors();
    }, []);

    const handleOpenModal = (instructor?: Instructor) => {
        if (instructor) {
            setEditingInstructor(instructor);
            setFormData({
                name: instructor.name,
                gender: instructor.gender || 'female',
                bio: instructor.bio || '',
                expertiseInput: '',
                expertise: instructor.expertise || [],
                photoUrl: instructor.photoUrl || '',
                order: instructor.order || 0,
            });
        } else {
            setEditingInstructor(null);
            setFormData({
                name: '',
                gender: 'female',
                bio: '',
                expertiseInput: '',
                expertise: [],
                photoUrl: '',
                order: instructors.length,
            });
        }
        setSelectedFile(null);
        setUploadError(null);
        setUploadProgress(0);
        setShowModal(true);
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {
            setUploadError('Photo must be under 5MB.');
            return;
        }
        setUploadError(null);
        setSelectedFile(file);
    };

    const addExpertiseTag = (tag: string) => {
        const trimmed = tag.trim();
        if (trimmed && !formData.expertise.includes(trimmed)) {
            setFormData(prev => ({ ...prev, expertise: [...prev.expertise, trimmed], expertiseInput: '' }));
        } else {
            setFormData(prev => ({ ...prev, expertiseInput: '' }));
        }
    };

    const removeExpertiseTag = (tag: string) => {
        setFormData(prev => ({ ...prev, expertise: prev.expertise.filter(t => t !== tag) }));
    };

    const handleExpertiseKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            addExpertiseTag(formData.expertiseInput);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name.trim()) return;
        setUploading(true);
        setUploadError(null);

        try {
            let finalPhotoUrl = formData.photoUrl;

            if (selectedFile) {
                const fileExt = selectedFile.name.split('.').pop();
                const fileName = `instructors/${Date.now()}_${Math.random().toString(36).slice(2)}.${fileExt}`;
                const storageRef = ref(storage, fileName);
                const uploadTask = uploadBytesResumable(storageRef, selectedFile);
                finalPhotoUrl = await new Promise<string>((resolve, reject) => {
                    uploadTask.on('state_changed',
                        (snap) => setUploadProgress((snap.bytesTransferred / snap.totalBytes) * 100),
                        reject,
                        async () => resolve(await getDownloadURL(uploadTask.snapshot.ref))
                    );
                });
            }

            const payload = {
                name: formData.name.trim(),
                gender: formData.gender,
                bio: formData.bio.trim(),
                expertise: formData.expertise,
                photoUrl: finalPhotoUrl,
                order: formData.order,
                updatedAt: serverTimestamp(),
            };

            if (editingInstructor) {
                await updateDoc(doc(db, 'instructors', editingInstructor.id), payload);
                setInstructors(prev =>
                    prev.map(i => i.id === editingInstructor.id ? { ...i, ...payload } as Instructor : i)
                        .sort((a, b) => a.order - b.order)
                );
            } else {
                const docRef = await addDoc(collection(db, 'instructors'), { ...payload, createdAt: serverTimestamp() });
                setInstructors(prev => [...prev, { id: docRef.id, ...payload } as Instructor].sort((a, b) => a.order - b.order));
            }

            setShowModal(false);
        } catch (err: any) {
            console.error(err);
            setUploadError(err.message || 'An error occurred while saving.');
        } finally {
            setUploading(false);
        }
    };

    const handleDelete = async (instructor: Instructor) => {
        if (!confirm(`Remove ${instructor.name} from instructors?`)) return;
        try {
            if (instructor.photoUrl?.includes('firebasestorage.googleapis.com')) {
                try {
                    await deleteObject(ref(storage, instructor.photoUrl));
                } catch (se) {
                    console.warn('Storage deletion failed:', se);
                }
            }
            await deleteDoc(doc(db, 'instructors', instructor.id));
            setInstructors(prev => prev.filter(i => i.id !== instructor.id));
        } catch (e) {
            console.error(e);
            alert('Error deleting instructor.');
        }
    };

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <div>
                    <h1>Instructors Master</h1>
                    <p>Manage the instructors who deliver Blooming Tastebuds cooking classes.</p>
                </div>
                <button className="btn btn-primary" onClick={() => handleOpenModal()}>
                    <Plus size={18} /> Add Instructor
                </button>
            </div>

            {loading ? (
                <div className="spinner" />
            ) : (
                <div className={styles.tableCard}>
                    <table>
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>Photo</th>
                                <th>Name</th>
                                <th>Gender</th>
                                <th>Expertise</th>
                                <th>Bio</th>
                                <th style={{ textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {instructors.map(instructor => (
                                <tr key={instructor.id}>
                                    <td className={styles.orderCell}>#{instructor.order}</td>
                                    <td>
                                        {instructor.photoUrl ? (
                                            <img src={instructor.photoUrl} alt={instructor.name} className={styles.thumbImage} />
                                        ) : (
                                            <div className={styles.thumbPlaceholder}>
                                                <UserCheck size={20} />
                                            </div>
                                        )}
                                    </td>
                                    <td className={styles.nameCell}>
                                        <strong>{instructor.name}</strong>
                                    </td>
                                    <td>
                                        <span className={`${styles.genderBadge} ${styles[`gender_${instructor.gender?.replace(/-/g, '_')}`]}`}>
                                            {GENDER_LABELS[instructor.gender] || instructor.gender}
                                        </span>
                                    </td>
                                    <td>
                                        <div className={styles.expertiseTags}>
                                            {(instructor.expertise || []).map(tag => (
                                                <span key={tag} className={styles.tag}>{tag}</span>
                                            ))}
                                            {(!instructor.expertise || instructor.expertise.length === 0) && (
                                                <span className={styles.noTags}>—</span>
                                            )}
                                        </div>
                                    </td>
                                    <td className={styles.bioCell}>{instructor.bio || '—'}</td>
                                    <td style={{ textAlign: 'right' }}>
                                        <div className={styles.actions}>
                                            <button className="btn btn-ghost btn-sm" onClick={() => handleOpenModal(instructor)}>
                                                <Edit2 size={15} strokeWidth={1.5} />
                                            </button>
                                            <button className="btn btn-ghost btn-sm" style={{ color: '#f43f5e' }} onClick={() => handleDelete(instructor)}>
                                                <Trash2 size={15} strokeWidth={1.5} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {instructors.length === 0 && (
                                <tr>
                                    <td colSpan={7} className={styles.empty}>No instructors yet. Add your first one!</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {showModal && (
                <div className="modal-overlay">
                    <div className="modal">
                        <div className="modal-header">
                            <h2 className="modal-title">{editingInstructor ? 'Edit Instructor' : 'Add New Instructor'}</h2>
                            <button className="modal-close" onClick={() => setShowModal(false)}><X size={20} /></button>
                        </div>
                        <form onSubmit={handleSubmit} className={styles.form}>

                            {/* Photo Upload */}
                            <div className="form-group">
                                <label className="form-label">Profile Photo</label>
                                <div className={styles.uploadArea} onClick={() => !uploading && fileInputRef.current?.click()}>
                                    {selectedFile ? (
                                        <div className={styles.previewBox}>
                                            <img src={URL.createObjectURL(selectedFile)} alt="Preview" className={styles.previewImage} />
                                            <span>Click to change</span>
                                        </div>
                                    ) : formData.photoUrl ? (
                                        <div className={styles.previewBox}>
                                            <img src={formData.photoUrl} alt="Current" className={styles.previewImage} />
                                            <span>Click to replace</span>
                                        </div>
                                    ) : (
                                        <div className={styles.uploadPlaceholder}>
                                            <Upload size={28} className={styles.uploadIcon} />
                                            <p>Click to upload photo</p>
                                            <span>Max 5MB (JPG, PNG)</span>
                                        </div>
                                    )}
                                    <input
                                        type="file"
                                        ref={fileInputRef}
                                        accept="image/*"
                                        onChange={handleFileChange}
                                        style={{ display: 'none' }}
                                        disabled={uploading}
                                    />
                                </div>
                                {uploading && (
                                    <div className={styles.progressContainer}>
                                        <div className={styles.progressFill} style={{ width: `${uploadProgress}%` }} />
                                    </div>
                                )}
                                {uploadError && (
                                    <div className={styles.errorText}>
                                        <AlertCircle size={14} /> {uploadError}
                                    </div>
                                )}
                            </div>

                            {/* Name */}
                            <div className="form-group">
                                <label className="form-label">Full Name <span className="required">*</span></label>
                                <input
                                    className="form-input"
                                    required
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    placeholder="e.g. Sarah Johnson"
                                    disabled={uploading}
                                />
                            </div>

                            {/* Gender */}
                            <div className="form-group">
                                <label className="form-label">Gender <span className="required">*</span></label>
                                <select
                                    className="form-input"
                                    value={formData.gender}
                                    onChange={e => setFormData({ ...formData, gender: e.target.value as InstructorGender })}
                                    disabled={uploading}
                                >
                                    {GENDERS.map(g => (
                                        <option key={g.value} value={g.value}>{g.label}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Expertise Tags */}
                            <div className="form-group">
                                <label className="form-label">Expertise Tags</label>
                                <div className={styles.tagInputWrapper}>
                                    {formData.expertise.map(tag => (
                                        <span key={tag} className={styles.tagPill}>
                                            {tag}
                                            <button type="button" onClick={() => removeExpertiseTag(tag)} className={styles.tagRemove}>
                                                <X size={12} />
                                            </button>
                                        </span>
                                    ))}
                                    <input
                                        className={styles.tagInput}
                                        value={formData.expertiseInput}
                                        onChange={e => setFormData({ ...formData, expertiseInput: e.target.value })}
                                        onKeyDown={handleExpertiseKeyDown}
                                        placeholder={formData.expertise.length === 0 ? 'Type a skill and press Enter...' : 'Add more...'}
                                        disabled={uploading}
                                    />
                                </div>
                                <div className={styles.suggestions}>
                                    {EXPERTISE_SUGGESTIONS.filter(s => !formData.expertise.includes(s)).map(s => (
                                        <button key={s} type="button" className={styles.suggestionChip} onClick={() => addExpertiseTag(s)}>
                                            + {s}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Bio */}
                            <div className="form-group">
                                <label className="form-label">Bio (Optional)</label>
                                <textarea
                                    className="form-input"
                                    rows={3}
                                    value={formData.bio}
                                    onChange={e => setFormData({ ...formData, bio: e.target.value })}
                                    placeholder="A short description about this instructor..."
                                    disabled={uploading}
                                />
                            </div>

                            {/* Display Order */}
                            <div className="form-group">
                                <label className="form-label">Display Order</label>
                                <input
                                    type="number"
                                    className="form-input"
                                    value={formData.order}
                                    onChange={e => setFormData({ ...formData, order: parseInt(e.target.value) || 0 })}
                                    disabled={uploading}
                                />
                            </div>

                            <div className={styles.modalActions}>
                                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)} disabled={uploading}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn btn-primary" disabled={uploading || !formData.name.trim()}>
                                    {uploading ? (
                                        <><Loader2 className="spinner-inline" /> {uploadProgress < 100 ? `Uploading... ${Math.round(uploadProgress)}%` : 'Saving...'}</>
                                    ) : editingInstructor ? 'Save Changes' : 'Add Instructor'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
