'use client';

import { useState, useEffect } from 'react';
import { collection, query, getDocs, orderBy, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { ContactMessage, ContactStatus } from '@/types';
import { MessageSquare, ChevronDown, ChevronUp, X } from 'lucide-react';
import styles from './page.module.css';

const STATUS_LABELS: Record<ContactStatus, string> = {
    new: 'New',
    read: 'Read',
    replied: 'Replied',
    closed: 'Closed',
};

const CATEGORY_LABELS: Record<string, string> = {
    'general': 'General enquiry',
    'class-info': 'Class information',
    'booking-help': 'Booking help',
    'dietary-allergy': 'Dietary / allergy',
    'private-event': 'Private event',
    'technical': 'Technical issue',
    'feedback': 'Feedback',
};

export default function AdminContactPage() {
    const [messages, setMessages] = useState<ContactMessage[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [filterStatus, setFilterStatus] = useState<ContactStatus | 'all'>('all');

    useEffect(() => {
        const fetch = async () => {
            try {
                const snap = await getDocs(query(collection(db, 'contact_messages'), orderBy('createdAt', 'desc')));
                setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() } as ContactMessage)));
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        fetch();
    }, []);

    const handleStatusChange = async (id: string, status: ContactStatus) => {
        try {
            await updateDoc(doc(db, 'contact_messages', id), { status, updatedAt: serverTimestamp() });
            setMessages(prev => prev.map(m => m.id === id ? { ...m, status } : m));
        } catch (e) {
            console.error('Failed to update status:', e);
        }
    };

    const filtered = filterStatus === 'all'
        ? messages
        : messages.filter(m => m.status === filterStatus);

    const newCount = messages.filter(m => m.status === 'new').length;

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <div>
                    <h1>Contact Inbox</h1>
                    <p>Review and manage enquiries and feedback from the website.</p>
                </div>
                {newCount > 0 && (
                    <span className={styles.newBadge}>{newCount} new</span>
                )}
            </div>

            <div className={styles.toolbar}>
                <span className={styles.toolbarLabel}>Filter by status:</span>
                {(['all', 'new', 'read', 'replied', 'closed'] as const).map(s => (
                    <button
                        key={s}
                        className={`${styles.filterBtn} ${filterStatus === s ? styles.filterActive : ''}`}
                        onClick={() => setFilterStatus(s)}
                    >
                        {s === 'all' ? 'All' : STATUS_LABELS[s]}
                    </button>
                ))}
            </div>

            {loading ? (
                <div className="spinner" />
            ) : filtered.length === 0 ? (
                <div className={styles.empty}>
                    <MessageSquare size={40} strokeWidth={1} />
                    <p>No messages {filterStatus !== 'all' ? `with status "${STATUS_LABELS[filterStatus as ContactStatus]}"` : 'yet'}.</p>
                </div>
            ) : (
                <div className={`card ${styles.tableCard}`}>
                    <table>
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Email</th>
                                <th>Category</th>
                                <th>Date</th>
                                <th>Status</th>
                                <th style={{ width: 48 }} />
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map(m => {
                                const isExpanded = expandedId === m.id;
                                const date = m.createdAt?.toDate ? m.createdAt.toDate() : new Date(m.createdAt);
                                return (
                                    <>
                                        <tr
                                            key={m.id}
                                            className={`${styles.row} ${m.status === 'new' ? styles.rowNew : ''}`}
                                        >
                                            <td className={styles.nameCell}>
                                                <strong>{m.name}</strong>
                                                {m.phone && <span>{m.phone}</span>}
                                            </td>
                                            <td>
                                                <a href={`mailto:${m.email}`} className={styles.emailLink}>{m.email}</a>
                                            </td>
                                            <td>
                                                <span className={styles.categoryTag}>
                                                    {CATEGORY_LABELS[m.category] ?? m.category}
                                                </span>
                                            </td>
                                            <td className={styles.dateCell}>
                                                {date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                                            </td>
                                            <td>
                                                <select
                                                    className={`${styles.statusSelect} ${styles[`status_${m.status}`]}`}
                                                    value={m.status}
                                                    onChange={e => handleStatusChange(m.id, e.target.value as ContactStatus)}
                                                    aria-label={`Status for message from ${m.name}`}
                                                >
                                                    {(Object.keys(STATUS_LABELS) as ContactStatus[]).map(s => (
                                                        <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                                                    ))}
                                                </select>
                                            </td>
                                            <td>
                                                <button
                                                    className={styles.expandBtn}
                                                    onClick={() => setExpandedId(isExpanded ? null : m.id)}
                                                    aria-label={isExpanded ? 'Collapse message' : 'View message'}
                                                >
                                                    {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                                                </button>
                                            </td>
                                        </tr>
                                        {isExpanded && (
                                            <tr key={`${m.id}-detail`} className={styles.detailRow}>
                                                <td colSpan={6}>
                                                    <div className={styles.detailContent}>
                                                        <p className={styles.detailMessage}>{m.message}</p>
                                                        <div className={styles.detailMeta}>
                                                            {m.consentToReply && (
                                                                <span className={styles.consentBadge}>✓ Consented to reply</span>
                                                            )}
                                                            {m.userId && (
                                                                <span className={styles.metaItem}>User ID: {m.userId}</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
