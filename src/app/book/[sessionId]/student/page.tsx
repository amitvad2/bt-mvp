'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { collection, query, where, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { useBooking } from '@/context/BookingContext';
import { Student } from '@/types';
import { Users, Plus, ArrowRight, UserCheck } from 'lucide-react';
import styles from './page.module.css';

export default function StudentSelectionPage() {
    const router = useRouter();
    const { user, btUser } = useAuth();
    const { state, setStudent } = useBooking();
    const [students, setStudents] = useState<Student[]>([]);
    const [loading, setLoading] = useState(true);
    const [addingNew, setAddingNew] = useState(false);

    const [newStudent, setNewStudent] = useState({
        firstName: '',
        lastName: '',
        dateOfBirth: '',
    });

    useEffect(() => {
        if (!user || btUser?.role !== 'parent') {
            setLoading(false);
            return;
        }
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
    }, [user, btUser]);

    const handleSelect = (s: Student | 'self') => {
        setStudent(s);
        router.push(`/book/${state.sessionId}/medical`);
    };

    const handleAddNew = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;
        try {
            const docRef = await addDoc(collection(db, 'students'), {
                ...newStudent,
                parentUid: user.uid,
                createdAt: serverTimestamp(),
            });
            const s = { id: docRef.id, parentUid: user.uid, ...newStudent } as Student;
            setStudent(s);
            router.push(`/book/${state.sessionId}/medical`);
        } catch (e) {
            console.error(e);
            alert('Error adding student.');
        }
    };

    if (loading) return <div className="spinner" />;

    // Young Adult Flow
    if (btUser?.role === 'youngAdult') {
        return (
            <div className={styles.center}>
                <div className={styles.iconCircle}><UserCheck size={32} strokeWidth={1.5} /></div>
                <h2>Booking for yourself</h2>
                <p className={styles.sub}>You are booking this session for yourself under your own profile.</p>
                <button className="btn btn-primary btn-lg" onClick={() => handleSelect('self')}>
                    Confirm & Continue
                </button>
            </div>
        );
    }

    // Parent Flow
    return (
        <div className={styles.container}>
            <h2>Who is attending?</h2>
            <p className={styles.sub}>Select a student or add a new profile to join this session.</p>

            {!addingNew ? (
                <div className={styles.grid}>
                    {students.map(s => (
                        <button
                            key={s.id}
                            className={`${styles.studentItem} ${state.studentId === s.id ? styles.selected : ''}`}
                            onClick={() => handleSelect(s)}
                        >
                            <div className={styles.avatar}>{s.firstName[0]}{s.lastName[0]}</div>
                            <strong>{s.firstName} {s.lastName}</strong>
                        </button>
                    ))}
                    <button className={styles.addItem} onClick={() => setAddingNew(true)}>
                        <div className={styles.avatar}><Plus size={24} strokeWidth={1.5} /></div>
                        <strong>Add New Student</strong>
                    </button>
                </div>
            ) : (
                <form onSubmit={handleAddNew} className={styles.form}>
                    <div className="form-row">
                        <div className="form-group">
                            <label className="form-label">First Name</label>
                            <input
                                className="form-input"
                                required
                                value={newStudent.firstName}
                                onChange={e => setNewStudent({ ...newStudent, firstName: e.target.value })}
                                placeholder="Student's first name"
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Last Name</label>
                            <input
                                className="form-input"
                                required
                                value={newStudent.lastName}
                                onChange={e => setNewStudent({ ...newStudent, lastName: e.target.value })}
                                placeholder="Student's last name"
                            />
                        </div>
                    </div>
                    <div className="form-group" style={{ maxWidth: '320px' }}>
                        <label className="form-label">Date of Birth</label>
                        <input
                            type="date"
                            className="form-input"
                            required
                            value={newStudent.dateOfBirth}
                            onChange={e => setNewStudent({ ...newStudent, dateOfBirth: e.target.value })}
                        />
                    </div>
                    <div className={styles.formActions}>
                        <button type="button" className="btn btn-ghost" onClick={() => setAddingNew(false)}>Cancel</button>
                        <button type="submit" className="btn btn-primary">Add Student</button>
                    </div>
                </form>
            )}
        </div>
    );
}
