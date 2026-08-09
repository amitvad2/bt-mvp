'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { collection, query, where, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { useTermBooking } from '@/context/TermBookingContext';
import { Student } from '@/types';
import { Plus, UserCheck, AlertCircle } from 'lucide-react';
import styles from './page.module.css';

export default function TermStudentSelectionPage() {
    const router = useRouter();
    const { user, btUser } = useAuth();
    const { state, termClass, setStudent } = useTermBooking();
    const [students, setStudents] = useState<Student[]>([]);
    const [loading, setLoading] = useState(true);
    const [addingNew, setAddingNew] = useState(false);
    const [validationError, setValidationError] = useState<string | null>(null);

    const [newStudent, setNewStudent] = useState({
        firstName: '',
        lastName: '',
        dateOfBirth: '',
    });

    useEffect(() => {
        if (!user || !user.uid || !btUser) return;
        if (btUser.role !== 'parent') {
            setLoading(false);
            return;
        }

        let isMounted = true;
        const fetchStudents = async () => {
            try {
                const q = query(collection(db, 'students'), where('parentUid', '==', user.uid));
                const snap = await getDocs(q);
                if (isMounted) {
                    setStudents(snap.docs.map(d => ({ id: d.id, ...d.data() } as Student)));
                }
            } catch (e) {
                console.error('Error fetching students:', e);
            } finally {
                if (isMounted) setLoading(false);
            }
        };
        fetchStudents();
        return () => { isMounted = false; };
    }, [user, btUser]);

    const handleSelect = (s: Student | 'self') => {
        setValidationError(null);
        if (!termClass) return;

        if (s === 'self') {
            if (termClass.type === 'kidsAfterSchool') {
                setValidationError('This class is for younger children (Ages 5-11). You can only book Young Adult Weekend Workshops for yourself.');
                return;
            }
        } else {
            // For term classes, validate age against the class's age range
            // Use termStartDate as the reference date for age calculation
            const refDate = termClass.termStartDate || new Date().toISOString().split('T')[0];
            const age = calculateAgeOnDate(s.dateOfBirth, refDate);
            if (age < termClass.ageMin || age > termClass.ageMax) {
                setValidationError(`${s.firstName} will be ${age} years old at the start of the term. This class is for ages ${termClass.ageMin} to ${termClass.ageMax}.`);
                return;
            }
        }

        setStudent(s);
        router.push(`/book-term/${state.classId}/medical`);
    };

    const handleAddNew = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !termClass) return;
        setValidationError(null);

        const refDate = termClass.termStartDate || new Date().toISOString().split('T')[0];
        const age = calculateAgeOnDate(newStudent.dateOfBirth, refDate);
        if (age < termClass.ageMin || age > termClass.ageMax) {
            setValidationError(`${newStudent.firstName} will be ${age} years old at the start of the term. This class is for ages ${termClass.ageMin} to ${termClass.ageMax}.`);
            return;
        }

        try {
            const docRef = await addDoc(collection(db, 'students'), {
                ...newStudent,
                parentUid: user.uid,
                createdAt: serverTimestamp(),
            });
            const s = { id: docRef.id, parentUid: user.uid, ...newStudent } as Student;
            setStudent(s);
            router.push(`/book-term/${state.classId}/medical`);
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
                <p className={styles.sub}>You are booking this term class for yourself.</p>

                {validationError && (
                    <div className={styles.errorBanner}>
                        <AlertCircle size={18} /> {validationError}
                    </div>
                )}

                <button className="btn btn-primary btn-lg" onClick={() => handleSelect('self')} style={{ marginTop: '1rem' }}>
                    Confirm & Continue
                </button>
            </div>
        );
    }

    // Parent Flow
    return (
        <div className={styles.container}>
            <h2>Who is attending?</h2>
            <p className={styles.sub}>Select a student to enrol in this term class.</p>

            {validationError && (
                <div className={styles.errorBanner} style={{ marginBottom: '1.5rem' }}>
                    <AlertCircle size={18} /> {validationError}
                </div>
            )}

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

function calculateAgeOnDate(dobStr: string, refDateStr: string) {
    const dob = new Date(dobStr);
    const refDate = new Date(refDateStr);
    let age = refDate.getFullYear() - dob.getFullYear();
    const m = refDate.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && refDate.getDate() < dob.getDate())) {
        age--;
    }
    return age;
}
