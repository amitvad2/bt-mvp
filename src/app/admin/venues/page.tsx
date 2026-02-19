'use client';

import { useState, useEffect } from 'react';
import { collection, query, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Venue } from '@/types';
import { MapPin, Plus, Edit2, Trash2, X, Map } from 'lucide-react';
import styles from './page.module.css';

export default function AdminVenues() {
    const [venues, setVenues] = useState<Venue[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingVenue, setEditingVenue] = useState<Venue | null>(null);
    const [formData, setFormData] = useState({ name: '', address: '' });

    useEffect(() => {
        const fetchVenues = async () => {
            try {
                const snap = await getDocs(collection(db, 'venues'));
                setVenues(snap.docs.map(d => ({ id: d.id, ...d.data() } as Venue)));
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        fetchVenues();
    }, []);

    const handleOpenModal = (venue?: Venue) => {
        if (venue) {
            setEditingVenue(venue);
            setFormData({ name: venue.name, address: venue.address });
        } else {
            setEditingVenue(null);
            setFormData({ name: '', address: '' });
        }
        setShowModal(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (editingVenue) {
                await updateDoc(doc(db, 'venues', editingVenue.id), { ...formData, updatedAt: serverTimestamp() });
                setVenues(prev => prev.map(v => v.id === editingVenue.id ? { ...v, ...formData } : v));
            } else {
                const docRef = await addDoc(collection(db, 'venues'), { ...formData, createdAt: serverTimestamp() });
                setVenues(prev => [...prev, { id: docRef.id, ...formData } as Venue]);
            }
            setShowModal(false);
        } catch (e) {
            console.error(e);
            alert('Error saving venue.');
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure? This may affect linked classes and sessions.')) return;
        try {
            await deleteDoc(doc(db, 'venues', id));
            setVenues(prev => prev.filter(v => v.id !== id));
        } catch (e) {
            console.error(e);
        }
    };

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <div>
                    <h1>Venue Master</h1>
                    <p>Manage the locations where cooking sessions are held.</p>
                </div>
                <button className="btn btn-primary" onClick={() => handleOpenModal()}>
                    <Plus size={18} /> Add Venue
                </button>
            </div>

            {loading ? (
                <div className="spinner" />
            ) : (
                <div className={`card ${styles.tableCard}`}>
                    <div className="table-wrapper">
                        <table>
                            <thead>
                                <tr>
                                    <th>Venue Name</th>
                                    <th>Address</th>
                                    <th style={{ textAlign: 'right' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {venues.map(venue => (
                                    <tr key={venue.id}>
                                        <td className={styles.venueName}>
                                            <MapPin size={16} /> <strong>{venue.name}</strong>
                                        </td>
                                        <td>{venue.address}</td>
                                        <td style={{ textAlign: 'right' }}>
                                            <button className="btn btn-ghost btn-sm" onClick={() => handleOpenModal(venue)}><Edit2 size={16} /></button>
                                            <button className="btn btn-ghost btn-sm text-danger" onClick={() => handleDelete(venue.id)}><Trash2 size={16} /></button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {showModal && (
                <div className="modal-overlay">
                    <div className="modal">
                        <div className="modal-header">
                            <h2 className="modal-title">{editingVenue ? 'Edit Venue' : 'Add New Venue'}</h2>
                            <button className="modal-close" onClick={() => setShowModal(false)}><X size={20} /></button>
                        </div>
                        <form onSubmit={handleSubmit} className={styles.form}>
                            <div className="form-group">
                                <label className="form-label">Venue/School Name <span className="required">*</span></label>
                                <input
                                    className="form-input"
                                    required
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    placeholder="e.g. St. Peters Primary School"
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Full Address <span className="required">*</span></label>
                                <textarea
                                    className="form-input"
                                    required
                                    rows={3}
                                    value={formData.address}
                                    onChange={e => setFormData({ ...formData, address: e.target.value })}
                                    placeholder="Street, City, Postcode"
                                />
                            </div>
                            <div className={styles.modalActions}>
                                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary">Save Venue</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
