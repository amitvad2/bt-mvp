'use client';

import { useState, useEffect } from 'react';
import { collection, query, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, orderBy, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Session, BTClass, Recipe } from '@/types';
import { Calendar, Plus, Edit2, Trash2, X, Clock, ChefHat, MapPin, UserCheck } from 'lucide-react';
import styles from './page.module.css';

export default function AdminSessions() {
    const [sessions, setSessions] = useState<Session[]>([]);
    const [classes, setClasses] = useState<BTClass[]>([]);
    const [recipes, setRecipes] = useState<Recipe[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingSession, setEditingSession] = useState<Session | null>(null);

    const [formData, setFormData] = useState({
        classId: '',
        date: '',
        recipeId: '',
        instructor: '',
        status: 'open' as const,
        spotsAvailable: 15,
    });

    useEffect(() => {
        const fetchData = async () => {
            try {
                const sessionsSnap = await getDocs(query(collection(db, 'sessions'), orderBy('date', 'desc')));
                const classesSnap = await getDocs(collection(db, 'classes'));
                const recipesSnap = await getDocs(collection(db, 'recipes'));

                setSessions(sessionsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Session)));
                setClasses(classesSnap.docs.map(d => ({ id: d.id, ...d.data() } as BTClass)));
                setRecipes(recipesSnap.docs.map(d => ({ id: d.id, ...d.data() } as Recipe)));
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    const handleOpenModal = (s?: Session) => {
        if (s) {
            setEditingSession(s);
            setFormData({
                classId: s.classId,
                date: s.date,
                recipeId: s.recipeId || '',
                instructor: s.instructor || '',
                status: s.status,
                spotsAvailable: s.spotsAvailable,
            });
        } else {
            setEditingSession(null);
            setFormData({ classId: '', date: '', recipeId: '', instructor: '', status: 'open', spotsAvailable: 15 });
        }
        setShowModal(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const parentClass = classes.find(c => c.id === formData.classId);
        const recipe = recipes.find(r => r.id === formData.recipeId);

        const data = {
            ...formData,
            className: parentClass?.type === 'kidsAfterSchool' ? 'Kids After School Club' : 'Weekend Workshop',
            classType: parentClass?.type || 'kidsAfterSchool',
            venueId: parentClass?.venueId || '',
            venueName: parentClass?.venueName || '',
            recipeName: recipe?.name || '',
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
                setSessions(prev => prev.map(s => s.id === editingSession.id ? { ...s, ...data } : s));
            } else {
                const docRef = await addDoc(collection(db, 'sessions'), { ...data, createdAt: serverTimestamp() });
                setSessions(prev => [{ id: docRef.id, ...data } as Session, ...prev]);
            }
            setShowModal(false);
        } catch (e) {
            console.error(e);
            alert('Error saving session.');
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
                                    <td>{s.className}</td>
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
                                            <button className="btn btn-ghost btn-sm" onClick={() => handleOpenModal(s)}><Edit2 size={16} strokeWidth={1.5} /></button>
                                            <button className="btn btn-ghost btn-sm text-danger" onClick={async () => {
                                                if (confirm('Delete session?')) {
                                                    await deleteDoc(doc(db, 'sessions', s.id));
                                                    setSessions(prev => prev.filter(item => item.id !== s.id));
                                                }
                                            }}><Trash2 size={16} strokeWidth={1.5} /></button>
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
                                    <label className="form-label">Status</label>
                                    <select className="form-select" value={formData.status} onChange={e => setFormData({ ...formData, status: e.target.value as any })}>
                                        <option value="open">Open</option>
                                        <option value="closed">Closed</option>
                                        <option value="cancelled">Cancelled</option>
                                    </select>
                                </div>
                            </div>

                            <div className={styles.modalActions}>
                                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary">Save Session</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
