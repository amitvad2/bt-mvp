'use client';

import { useState } from 'react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { User, Settings, Save, AlertCircle, CheckCircle } from 'lucide-react';
import styles from './page.module.css';

export default function AccountPage() {
    const { btUser } = useAuth();
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState('');

    const [formData, setFormData] = useState({
        firstName: btUser?.firstName || '',
        lastName: btUser?.lastName || '',
        phone: btUser?.phone || '',
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!btUser) return;

        setLoading(true);
        setError('');
        setSuccess(false);

        try {
            await updateDoc(doc(db, 'users', btUser.uid), {
                ...formData,
                updatedAt: serverTimestamp(),
            });
            setSuccess(true);
        } catch (e) {
            console.error(e);
            setError('Failed to update profile. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <h1>Manage Account</h1>
                <p>Update your personal information and contact details.</p>
            </div>

            <div className={styles.content}>
                <div className={`card ${styles.accountCard}`}>
                    <h3>Profile Information</h3>
                    <p className={styles.subText}>These details are used for your bookings and communications.</p>

                    {success && (
                        <div className="alert alert-success">
                            <CheckCircle size={18} /> Profile updated successfully!
                        </div>
                    )}

                    {error && (
                        <div className="alert alert-error">
                            <AlertCircle size={18} /> {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className={styles.form}>
                        <div className="form-row">
                            <div className="form-group">
                                <label className="form-label">First Name</label>
                                <input
                                    className="form-input"
                                    value={formData.firstName}
                                    onChange={e => setFormData({ ...formData, firstName: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Last Name</label>
                                <input
                                    className="form-input"
                                    value={formData.lastName}
                                    onChange={e => setFormData({ ...formData, lastName: e.target.value })}
                                    required
                                />
                            </div>
                        </div>

                        <div className="form-group">
                            <label className="form-label">Email Address (Read-only)</label>
                            <input
                                className="form-input"
                                value={btUser?.email || ''}
                                disabled
                            />
                            <p className="form-hint">Email cannot be changed directly for security. Contact support if needed.</p>
                        </div>

                        <div className="form-group">
                            <label className="form-label">Phone Number</label>
                            <input
                                type="tel"
                                className="form-input"
                                placeholder="e.g. +44 7700 900000"
                                value={formData.phone}
                                onChange={e => setFormData({ ...formData, phone: e.target.value })}
                            />
                        </div>

                        <div className={styles.actions}>
                            <button type="submit" className="btn btn-primary" disabled={loading}>
                                <Save size={18} /> {loading ? 'Saving...' : 'Save Changes'}
                            </button>
                        </div>
                    </form>
                </div>

                <div className={`card ${styles.roleCard}`}>
                    <h3>Account Role</h3>
                    <p>Your account is registered as a:</p>
                    <div className={`badge ${btUser?.role === 'admin' ? 'badge-red' : btUser?.role === 'parent' ? 'badge-amber' : 'badge-green'}`} style={{ fontSize: '1rem', padding: '0.5rem 1rem' }}>
                        {btUser?.role === 'parent' ? 'Parent / Guardian' : btUser?.role === 'youngAdult' ? 'Young Adult' : 'Administrator'}
                    </div>
                    <p className={styles.roleDesc}>
                        {btUser?.role === 'parent'
                            ? 'You can manage multiple students and book classes for them.'
                            : btUser?.role === 'youngAdult'
                                ? 'You can book classes for yourself directly.'
                                : 'You have full access to manage venues, classes, and galleries.'}
                    </p>
                </div>
            </div>
        </div>
    );
}
