'use client';

import { useState, useEffect } from 'react';
import { collection, query, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { BTClass, Venue } from '@/types';
import { ChefHat, Plus, Edit2, Trash2, X, Clock, Users, MapPin } from 'lucide-react';
import styles from './page.module.css';

export default function AdminClasses() {
    const [classes, setClasses] = useState<BTClass[]>([]);
    const [venues, setVenues] = useState<Venue[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingClass, setEditingClass] = useState<BTClass | null>(null);

    const [formData, setFormData] = useState({
        type: 'kidsAfterSchool' as const,
        dayOfWeek: 'Monday',
        startTime: '15:30',
        endTime: '16:30',
        ageMin: 5,
        ageMax: 12,
        maxSize: 15,
        instructor: '',
        venueId: '',
        price: 1500, // £15.00
    });

    useEffect(() => {
        const fetchData = async () => {
            try {
                const classesSnap = await getDocs(collection(db, 'classes'));
                const venuesSnap = await getDocs(collection(db, 'venues'));
                setClasses(classesSnap.docs.map(d => ({ id: d.id, ...d.data() } as BTClass)));
                setVenues(venuesSnap.docs.map(d => ({ id: d.id, ...d.data() } as Venue)));
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    const handleOpenModal = (c?: BTClass) => {
        if (c) {
            setEditingClass(c);
            setFormData({
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
            });
        } else {
            setEditingClass(null);
            setFormData({
                type: 'kidsAfterSchool', dayOfWeek: 'Monday', startTime: '15:30',
                endTime: '16:30', ageMin: 5, ageMax: 12, maxSize: 15,
                instructor: '', venueId: '', price: 1500
            });
        }
        setShowModal(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const venue = venues.find(v => v.id === formData.venueId);
        const data = { ...formData, venueName: venue?.name || '' };

        try {
            if (editingClass) {
                await updateDoc(doc(db, 'classes', editingClass.id), { ...data, updatedAt: serverTimestamp() });
                setClasses(prev => prev.map(c => c.id === editingClass.id ? { ...c, ...data } : c));
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
                    <Plus size={18} /> Add Class Type
                </button>
            </div>

            {loading ? (
                <div className="spinner" />
            ) : (
                <div className={styles.grid}>
                    {classes.map(c => (
                        <div key={c.id} className={`card ${styles.classCard}`}>
                            <div className={styles.classHeader}>
                                <span className={`badge ${c.type === 'kidsAfterSchool' ? 'badge-amber' : 'badge-green'}`}>
                                    {c.type === 'kidsAfterSchool' ? 'Kids' : 'Young Adult'}
                                </span>
                                <div className={styles.classActions}>
                                    <button className="btn btn-ghost btn-sm" onClick={() => handleOpenModal(c)}><Edit2 size={16} /></button>
                                </div>
                            </div>
                            <h3>{c.type === 'kidsAfterSchool' ? 'Kids After School Club' : 'Weekend Workshop'}</h3>
                            <div className={styles.classMeta}>
                                <p><Clock size={14} /> {c.dayOfWeek}, {c.startTime}–{c.endTime}</p>
                                <p><MapPin size={14} /> {c.venueName}</p>
                                <p><Users size={14} /> Ages {c.ageMin}–{c.ageMax} • Max {c.maxSize}</p>
                                <p><strong>Price: £{(c.price / 100).toFixed(2)}</strong></p>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {showModal && (
                <div className="modal-overlay">
                    <div className="modal modal-lg">
                        <div className="modal-header">
                            <h2 className="modal-title">{editingClass ? 'Edit Class Type' : 'Add New Class Type'}</h2>
                            <button className="modal-close" onClick={() => setShowModal(false)}><X size={20} /></button>
                        </div>
                        <form onSubmit={handleSubmit} className={styles.form}>
                            <div className="form-row">
                                <div className="form-group">
                                    <label className="form-label">Type</label>
                                    <select className="form-select" value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value as any })}>
                                        <option value="kidsAfterSchool">Kids After School Club</option>
                                        <option value="youngAdultWeekend">Young Adults Weekend</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Day of Week</label>
                                    <select className="form-select" value={formData.dayOfWeek} onChange={e => setFormData({ ...formData, dayOfWeek: e.target.value })}>
                                        {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(d => <option key={d} value={d}>{d}</option>)}
                                    </select>
                                </div>
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label className="form-label">Start Time</label>
                                    <input type="time" className="form-input" value={formData.startTime} onChange={e => setFormData({ ...formData, startTime: e.target.value })} required />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">End Time</label>
                                    <input type="time" className="form-input" value={formData.endTime} onChange={e => setFormData({ ...formData, endTime: e.target.value })} required />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Price (Pence)</label>
                                    <input type="number" className="form-input" value={formData.price} onChange={e => setFormData({ ...formData, price: parseInt(e.target.value) })} required />
                                </div>
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label className="form-label">Min Age</label>
                                    <input type="number" className="form-input" value={formData.ageMin} onChange={e => setFormData({ ...formData, ageMin: parseInt(e.target.value) })} required />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Max Age</label>
                                    <input type="number" className="form-input" value={formData.ageMax} onChange={e => setFormData({ ...formData, ageMax: parseInt(e.target.value) })} required />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Max Class Size</label>
                                    <input type="number" className="form-input" value={formData.maxSize} onChange={e => setFormData({ ...formData, maxSize: parseInt(e.target.value) })} required />
                                </div>
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label className="form-label">Default Instructor</label>
                                    <input className="form-input" value={formData.instructor} onChange={e => setFormData({ ...formData, instructor: e.target.value })} placeholder="John Doe" />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Venue</label>
                                    <select className="form-select" value={formData.venueId} onChange={e => setFormData({ ...formData, venueId: e.target.value })} required>
                                        <option value="">Select Venue...</option>
                                        {venues.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                                    </select>
                                </div>
                            </div>

                            <div className={styles.modalActions}>
                                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary">Save Class Type</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
