'use client';

import { useState, useEffect } from 'react';
import { collection, query, where, getDocs, addDoc, serverTimestamp, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { Student, MedicalInfo, EmergencyContact, Questionnaire } from '@/types';
import { Users, Plus, Edit2, Trash2, X, Check, AlertCircle } from 'lucide-react';
import styles from './page.module.css';

export default function MyStudentsPage() {
    const { user, btUser } = useAuth();
    const [students, setStudents] = useState<Student[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingStudent, setEditingStudent] = useState<Student | null>(null);

    // Form State
    const [formData, setFormData] = useState({
        firstName: '',
        lastName: '',
        dateOfBirth: '',
    });

    useEffect(() => {
        if (!user) return;
        const fetchStudents = async () => {
            try {
                const q = query(collection(db, 'students'), where('parentUid', '==', user.uid));
                const snap = await getDocs(q);
                setStudents(snap.docs.map(d => ({ id: d.id, ...d.data() } as Student)));
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        fetchStudents();
    }, [user]);

    const handleOpenModal = (student?: Student) => {
        if (student) {
            setEditingStudent(student);
            setFormData({
                firstName: student.firstName,
                lastName: student.lastName,
                dateOfBirth: student.dateOfBirth,
            });
        } else {
            setEditingStudent(null);
            setFormData({ firstName: '', lastName: '', dateOfBirth: '' });
        }
        setShowModal(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;

        try {
            if (editingStudent) {
                await updateDoc(doc(db, 'students', editingStudent.id), {
                    ...formData,
                    updatedAt: serverTimestamp(),
                });
                setStudents(prev => prev.map(s => s.id === editingStudent.id ? { ...s, ...formData } : s));
            } else {
                const docRef = await addDoc(collection(db, 'students'), {
                    ...formData,
                    parentUid: user.uid,
                    createdAt: serverTimestamp(),
                });
                setStudents(prev => [...prev, { id: docRef.id, parentUid: user.uid, ...formData, createdAt: new Date() }]);
            }
            setShowModal(false);
        } catch (e) {
            console.error(e);
            alert('Error saving student. Please try again.');
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this student?')) return;
        try {
            await deleteDoc(doc(db, 'students', id));
            setStudents(prev => prev.filter(s => s.id !== id));
        } catch (e) {
            console.error(e);
        }
    };

    if (btUser?.role !== 'parent') {
        return (
            <div className="alert alert-info">
                <AlertCircle size={20} />
                This page is only for Parent accounts. Young Adults manage their own bookings directly.
            </div>
        );
    }

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <div>
                    <h1>My Students</h1>
                    <p>Manage your children's profiles for easier booking.</p>
                </div>
                <button className="btn btn-primary" onClick={() => handleOpenModal()}>
                    <Plus size={18} /> Add Student
                </button>
            </div>

            {loading ? (
                <div className="loading-screen">
                    <div className="spinner" />
                    <p>Loading students...</p>
                </div>
            ) : students.length === 0 ? (
                <div className={styles.empty}>
                    <Users size={48} />
                    <h3>No students added yet</h3>
                    <p>Add your child's details to speed up the booking process.</p>
                    <button className="btn btn-outline" onClick={() => handleOpenModal()}>
                        Add your first student
                    </button>
                </div>
            ) : (
                <div className={styles.grid}>
                    {students.map(student => (
                        <div key={student.id} className={`card ${styles.studentCard}`}>
                            <div className={styles.studentInfo}>
                                <div className={styles.avatar}>
                                    {student.firstName[0]}{student.lastName[0]}
                                </div>
                                <div>
                                    <h3>{student.firstName} {student.lastName}</h3>
                                    <p>DOB: {student.dateOfBirth ? new Date(student.dateOfBirth).toLocaleDateString('en-GB') : 'N/A'}</p>
                                </div>
                            </div>
                            <div className={styles.actions}>
                                <button className="btn btn-ghost btn-sm" onClick={() => handleOpenModal(student)}>
                                    <Edit2 size={16} /> Edit
                                </button>
                                <button className="btn btn-ghost btn-sm text-danger" onClick={() => handleDelete(student.id)}>
                                    <Trash2 size={16} /> Delete
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Modal */}
            {showModal && (
                <div className="modal-overlay">
                    <div className="modal">
                        <div className="modal-header">
                            <h2 className="modal-title">{editingStudent ? 'Edit Student' : 'Add New Student'}</h2>
                            <button className="modal-close" onClick={() => setShowModal(false)}><X size={20} /></button>
                        </div>
                        <form onSubmit={handleSubmit} className={styles.form}>
                            <div className="form-row">
                                <div className="form-group">
                                    <label className="form-label">First Name <span className="required">*</span></label>
                                    <input
                                        className="form-input"
                                        required
                                        value={formData.firstName}
                                        onChange={e => setFormData({ ...formData, firstName: e.target.value })}
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Last Name <span className="required">*</span></label>
                                    <input
                                        className="form-input"
                                        required
                                        value={formData.lastName}
                                        onChange={e => setFormData({ ...formData, lastName: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Date of Birth <span className="required">*</span></label>
                                <input
                                    type="date"
                                    className="form-input"
                                    required
                                    value={formData.dateOfBirth}
                                    onChange={e => setFormData({ ...formData, dateOfBirth: e.target.value })}
                                />
                            </div>
                            <p className="form-hint">Medical and emergency info will be collected during the booking process.</p>
                            <div className={styles.modalActions}>
                                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary">
                                    {editingStudent ? 'Save Changes' : 'Add Student'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
