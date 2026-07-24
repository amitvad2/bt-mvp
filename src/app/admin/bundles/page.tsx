'use client';

import { useState, useEffect } from 'react';
import { collection, query, getDocs, deleteDoc, doc, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Bundle } from '@/types';
import { Package, Plus, Edit2, Trash2, X } from 'lucide-react';
import BundleForm from './BundleForm';
import styles from './page.module.css';

export default function AdminBundles() {
    const [bundles, setBundles] = useState<Bundle[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingBundle, setEditingBundle] = useState<Bundle | null>(null);

    useEffect(() => {
        const fetchBundles = async () => {
            try {
                const bundlesSnap = await getDocs(
                    query(collection(db, 'bundles'), orderBy('createdAt', 'desc'))
                );
                setBundles(bundlesSnap.docs.map(d => ({ id: d.id, ...d.data() } as Bundle)));
            } catch (e) {
                console.error('[AdminBundles] Error fetching bundles:', e);
            } finally {
                setLoading(false);
            }
        };
        fetchBundles();
    }, []);

    const handleOpenModal = (bundle?: Bundle) => {
        if (bundle) {
            setEditingBundle(bundle);
        } else {
            setEditingBundle(null);
        }
        setShowModal(true);
    };

    const handleDelete = async (bundle: Bundle) => {
        if (!window.confirm(`Delete bundle "${bundle.name}"? This cannot be undone.`)) return;

        try {
            await deleteDoc(doc(db, 'bundles', bundle.id));
            setBundles(prev => prev.filter(b => b.id !== bundle.id));
        } catch (e: any) {
            console.error('[AdminBundles] Error deleting bundle:', e);
            if (e?.code === 'permission-denied') {
                alert('Permission denied. You do not have access to delete this bundle.');
            } else {
                alert(`Failed to delete bundle: ${e?.message || 'Unknown error'}. Please try again.`);
            }
        }
    };

    const getStatusBadgeClass = (status: Bundle['status']) => {
        switch (status) {
            case 'active': return 'badge-green';
            case 'closed': return 'badge-gray';
            case 'cancelled': return 'badge-red';
            default: return 'badge-gray';
        }
    };

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <div>
                    <h1><Package size={28} strokeWidth={1.5} /> Bundles</h1>
                    <p>Create and manage session bundles for discounted multi-session bookings.</p>
                </div>
                <button className="btn btn-primary" onClick={() => handleOpenModal()}>
                    <Plus size={18} /> Create Bundle
                </button>
            </div>

            {loading ? (
                <div className="spinner" />
            ) : bundles.length === 0 ? (
                <div className={styles.emptyState}>
                    <Package size={48} strokeWidth={1} />
                    <h3>No bundles yet</h3>
                    <p>Create your first bundle to offer discounted session packages.</p>
                    <button className="btn btn-primary" onClick={() => handleOpenModal()}>
                        <Plus size={18} /> Create Bundle
                    </button>
                </div>
            ) : (
                <div className={styles.tableCard}>
                    <table>
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Class</th>
                                <th>Sessions</th>
                                <th>Price</th>
                                <th>Status</th>
                                <th style={{ textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {bundles.map(bundle => (
                                <tr key={bundle.id}>
                                    <td><strong>{bundle.name}</strong></td>
                                    <td className={styles.mutedText}>{bundle.className}</td>
                                    <td>{bundle.sessionIds.length} sessions</td>
                                    <td>
                                        <span className={styles.price}>
                                            £{(bundle.bundlePrice / 100).toFixed(2)}
                                        </span>
                                        {bundle.totalIndividualPrice > bundle.bundlePrice && (
                                            <span className={styles.originalPrice}>
                                                £{(bundle.totalIndividualPrice / 100).toFixed(2)}
                                            </span>
                                        )}
                                    </td>
                                    <td>
                                        <span className={`badge ${getStatusBadgeClass(bundle.status)}`}>
                                            {bundle.status}
                                        </span>
                                    </td>
                                    <td style={{ textAlign: 'right' }}>
                                        <div className="flex justify-end gap-2">
                                            <button
                                                className="btn btn-ghost btn-sm"
                                                onClick={() => handleOpenModal(bundle)}
                                                title="Edit bundle"
                                            >
                                                <Edit2 size={16} strokeWidth={1.5} />
                                            </button>
                                            <button
                                                className="btn btn-ghost btn-sm text-danger"
                                                onClick={() => handleDelete(bundle)}
                                                title="Delete bundle"
                                            >
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
                            <h2 className="modal-title">
                                {editingBundle ? 'Edit Bundle' : 'Create Bundle'}
                            </h2>
                            <button className="modal-close" onClick={() => setShowModal(false)}>
                                <X size={20} />
                            </button>
                        </div>
                        <div style={{ padding: 'var(--space-6)' }}>
                            <BundleForm
                                editingBundle={editingBundle}
                                onSave={() => {
                                    setShowModal(false);
                                    // Refresh bundle list
                                    const refresh = async () => {
                                        try {
                                            const bundlesSnap = await getDocs(
                                                query(collection(db, 'bundles'), orderBy('createdAt', 'desc'))
                                            );
                                            setBundles(bundlesSnap.docs.map(d => ({ id: d.id, ...d.data() } as Bundle)));
                                        } catch (e) {
                                            console.error('[AdminBundles] Error refreshing bundles:', e);
                                        }
                                    };
                                    refresh();
                                }}
                                onCancel={() => setShowModal(false)}
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
