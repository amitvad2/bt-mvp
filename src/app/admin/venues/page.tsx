'use client';

import { useState, useEffect } from 'react';
import { collection, query, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Venue } from '@/types';
import { MapPin, Plus, Edit2, Trash2, X, Map, Locate, Loader2 } from 'lucide-react';
import styles from './page.module.css';

export default function AdminVenues() {
    const [venues, setVenues] = useState<Venue[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingVenue, setEditingVenue] = useState<Venue | null>(null);
    const [formData, setFormData] = useState({ name: '', address: '', postcode: '', lat: '', lng: '' });
    const [geocoding, setGeocoding] = useState(false);
    const [geoError, setGeoError] = useState<string | null>(null);

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
            setFormData({
                name: venue.name,
                address: venue.address,
                postcode: venue.postcode || '',
                lat: venue.lat?.toString() || '',
                lng: venue.lng?.toString() || '',
            });
        } else {
            setEditingVenue(null);
            setFormData({ name: '', address: '', postcode: '', lat: '', lng: '' });
        }
        setGeoError(null);
        setGeoSuccess(false);
        setShowModal(true);
    };

    const [geoSuccess, setGeoSuccess] = useState(false);

    // Try postcode first (postcodes.io), then fall back to full address (Nominatim)
    const geocode = async (opts: { postcode?: string; address?: string; name?: string }) => {
        const pc = (opts.postcode ?? formData.postcode).trim();
        const addr = (opts.address ?? formData.address).trim();
        const nm = (opts.name ?? formData.name).trim();

        if (!pc && !addr && !nm) return;
        setGeocoding(true);
        setGeoError(null);
        setGeoSuccess(false);

        try {
            // 1️⃣  Try UK postcode lookup first (most accurate)
            if (pc) {
                const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(pc)}`);
                const data = await res.json();
                if (data.status === 200 && data.result) {
                    setFormData(prev => ({
                        ...prev,
                        lat: data.result.latitude.toFixed(6),
                        lng: data.result.longitude.toFixed(6),
                    }));
                    setGeoSuccess(true);
                    return;
                }
            }

            // 2️⃣  Fall back to Nominatim (OpenStreetMap) using full address
            const searchQuery = [nm, addr, pc, 'UK'].filter(Boolean).join(', ');
            const nomRes = await fetch(
                `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchQuery)}&format=json&limit=1&countrycodes=gb`,
                { headers: { 'Accept-Language': 'en', 'User-Agent': 'BloomingTastebuds/1.0' } }
            );
            const nomData = await nomRes.json();
            if (nomData.length > 0) {
                setFormData(prev => ({
                    ...prev,
                    lat: parseFloat(nomData[0].lat).toFixed(6),
                    lng: parseFloat(nomData[0].lon).toFixed(6),
                }));
                setGeoSuccess(true);
                return;
            }

            setGeoError('Could not locate this address. You can enter coordinates manually below.');
        } catch {
            setGeoError('Lookup failed. Check your connection and try again.');
        } finally {
            setGeocoding(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const payload = {
                name: formData.name,
                address: formData.address,
                postcode: formData.postcode.trim().toUpperCase(),
                lat: formData.lat ? parseFloat(formData.lat) : undefined,
                lng: formData.lng ? parseFloat(formData.lng) : undefined,
            };
            if (editingVenue) {
                await updateDoc(doc(db, 'venues', editingVenue.id), { ...payload, updatedAt: serverTimestamp() });
                setVenues(prev => prev.map(v => v.id === editingVenue.id ? { ...v, ...payload } as Venue : v));
            } else {
                const docRef = await addDoc(collection(db, 'venues'), { ...payload, createdAt: serverTimestamp() });
                setVenues(prev => [...prev, { id: docRef.id, ...payload, createdAt: new Date() } as Venue]);
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
                    Add Venue
                </button>
            </div>

            {loading ? (
                <div className="spinner" />
            ) : (
                <div className={styles.tableCard}>
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
                                        <MapPin size={16} strokeWidth={1.5} /> <strong>{venue.name}</strong>
                                    </td>
                                    <td>{venue.address}</td>
                                    <td style={{ textAlign: 'right' }}>
                                        <div className="flex justify-end gap-2">
                                            <button className="btn btn-ghost btn-sm" onClick={() => handleOpenModal(venue)}>
                                                <Edit2 size={16} strokeWidth={1.5} />
                                            </button>
                                            <button className="btn btn-ghost btn-sm text-danger" onClick={() => handleDelete(venue.id)}>
                                                <Trash2 size={16} strokeWidth={1.5} />
                                            </button>
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
                                    onBlur={e => {
                                        if (e.target.value.trim()) geocode({ address: e.target.value });
                                    }}
                                    placeholder="Street, City, Postcode"
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">
                                    Postcode
                                    <span style={{ fontSize: '0.8rem', color: 'var(--bt-gray-500)', fontWeight: 400 }}> — auto-detects location on entry</span>
                                </label>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <input
                                        className="form-input"
                                        value={formData.postcode}
                                        onChange={e => {
                                            setFormData({ ...formData, postcode: e.target.value.toUpperCase() });
                                            setGeoSuccess(false);
                                        }}
                                        onBlur={e => { if (e.target.value.trim()) geocode({ postcode: e.target.value }); }}
                                        placeholder="e.g. SW1A 1AA"
                                        style={{ flex: 1 }}
                                    />
                                    <button
                                        type="button"
                                        className="btn btn-ghost btn-sm"
                                        onClick={() => geocode({})}
                                        disabled={geocoding}
                                        style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
                                        title="Auto-detect from postcode or address"
                                    >
                                        {geocoding
                                            ? <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} />
                                            : <Locate size={14} />}
                                        {geocoding ? 'Detecting…' : 'Auto-detect'}
                                    </button>
                                </div>
                                {geoError && (
                                    <p style={{ color: '#f43f5e', fontSize: '0.8rem', marginTop: '4px' }}>{geoError}</p>
                                )}
                            </div>

                            {/* Coordinates row */}
                            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
                                <div className="form-group" style={{ flex: 1 }}>
                                    <label className="form-label">Latitude</label>
                                    <input
                                        className="form-input"
                                        type="number"
                                        step="any"
                                        value={formData.lat}
                                        onChange={e => { setFormData({ ...formData, lat: e.target.value }); setGeoSuccess(false); }}
                                        placeholder="Auto-filled"
                                        style={formData.lat ? { borderColor: '#10b981' } : {}}
                                    />
                                </div>
                                <div className="form-group" style={{ flex: 1 }}>
                                    <label className="form-label">Longitude</label>
                                    <input
                                        className="form-input"
                                        type="number"
                                        step="any"
                                        value={formData.lng}
                                        onChange={e => { setFormData({ ...formData, lng: e.target.value }); setGeoSuccess(false); }}
                                        placeholder="Auto-filled"
                                        style={formData.lng ? { borderColor: '#10b981' } : {}}
                                    />
                                </div>
                            </div>
                            {geoSuccess && (
                                <p style={{ color: '#10b981', fontSize: '0.85rem', marginTop: '-8px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    ✓ Location detected — coordinates filled automatically.
                                    <button type="button" onClick={() => { setFormData(p => ({ ...p, lat: '', lng: '' })); setGeoSuccess(false); }} style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: '0.75rem', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>Clear</button>
                                </p>
                            )}

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
