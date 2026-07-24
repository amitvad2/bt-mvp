'use client';

import { useState, useEffect } from 'react';
import { collection, getDocs, query, where, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Bundle, Session } from '@/types';
import { useRouter } from 'next/navigation';
import { Calendar, Tag, Users } from 'lucide-react';
import styles from './BundleBrowser.module.css';

interface Props {
    onBook: (bundleId: string) => void;
}

type AvailabilityStatus = 'Available' | 'Limited Availability' | 'Full';

interface BundleWithSessions {
    bundle: Bundle;
    sessions: Session[];
    availability: AvailabilityStatus;
}

function deriveAvailability(sessions: Session[]): AvailabilityStatus {
    if (sessions.length === 0) return 'Full';
    const allFull = sessions.every(s => s.spotsAvailable === 0);
    if (allFull) return 'Full';
    const someFull = sessions.some(s => s.spotsAvailable === 0);
    if (someFull) return 'Limited Availability';
    return 'Available';
}

function formatSessionDate(dateStr: string): string {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-GB', {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    });
}

function calculatePerSessionSaving(bundle: Bundle): string {
    const totalSaving = bundle.totalIndividualPrice - bundle.bundlePrice;
    const perSession = totalSaving / bundle.sessionIds.length / 100;
    return perSession.toFixed(2);
}

export default function BundleBrowser({ onBook }: Props) {
    const router = useRouter();
    const [bundlesWithSessions, setBundlesWithSessions] = useState<BundleWithSessions[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchBundles = async () => {
            try {
                const bundlesQuery = query(
                    collection(db, 'bundles'),
                    where('status', '==', 'active')
                );
                const bundlesSnap = await getDocs(bundlesQuery);
                const bundles = bundlesSnap.docs.map(d => ({ id: d.id, ...d.data() } as Bundle));

                const results: BundleWithSessions[] = [];

                for (const bundle of bundles) {
                    const sessions: Session[] = [];
                    for (const sessionId of bundle.sessionIds) {
                        const sessionDoc = await getDoc(doc(db, 'sessions', sessionId));
                        if (sessionDoc.exists()) {
                            sessions.push({ id: sessionDoc.id, ...sessionDoc.data() } as Session);
                        }
                    }

                    // Sort sessions chronologically
                    sessions.sort((a, b) => a.date.localeCompare(b.date));

                    const availability = deriveAvailability(sessions);
                    results.push({ bundle, sessions, availability });
                }

                setBundlesWithSessions(results);
            } catch (e) {
                console.error('Error fetching bundles:', e);
                setBundlesWithSessions([]);
            } finally {
                setLoading(false);
            }
        };

        fetchBundles();
    }, []);

    const handleBundleClick = (bundleId: string, availability: AvailabilityStatus) => {
        if (availability === 'Full') return;
        onBook(bundleId);
        router.push(`/book/bundle/${bundleId}/student`);
    };

    if (loading) {
        return null;
    }

    if (bundlesWithSessions.length === 0) {
        return null;
    }

    return (
        <div className={styles.bundleBrowserContainer}>
            <div className={styles.bundleGrid}>
                {bundlesWithSessions.map(({ bundle, sessions, availability }) => {
                    const isFull = availability === 'Full';
                    return (
                        <div
                            key={bundle.id}
                            className={`card ${styles.bundleCard} ${isFull ? styles.bundleCardDisabled : ''}`}
                            onClick={() => handleBundleClick(bundle.id, availability)}
                            role="button"
                            tabIndex={isFull ? -1 : 0}
                            aria-disabled={isFull}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    handleBundleClick(bundle.id, availability);
                                }
                            }}
                        >
                            <div className={styles.bundleHeader}>
                                <span className={`badge badge-indigo ${styles.bundleBadge}`}>Bundle</span>
                                <span className={`${styles.availabilityBadge} ${styles[`availability${availability.replace(/\s/g, '')}`]}`}>
                                    {availability}
                                </span>
                            </div>

                            <h3 className={styles.bundleName}>{bundle.name}</h3>

                            <div className={styles.bundleMeta}>
                                <div className={styles.metaItem}>
                                    <Users size={16} strokeWidth={1.5} />
                                    <span>{bundle.sessionIds.length} sessions</span>
                                </div>
                                <div className={styles.metaItem}>
                                    <Tag size={16} strokeWidth={1.5} />
                                    <span>Save £{calculatePerSessionSaving(bundle)} per session</span>
                                </div>
                            </div>

                            <div className={styles.sessionDates}>
                                <p className={styles.datesLabel}>Session dates:</p>
                                <ul className={styles.dateList}>
                                    {sessions.map(session => (
                                        <li key={session.id} className={styles.dateItem}>
                                            <Calendar size={14} strokeWidth={1.5} />
                                            <span>{formatSessionDate(session.date)}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>

                            <div className={styles.bundleFooter}>
                                <div className={styles.bundlePrice}>
                                    £{(bundle.bundlePrice / 100).toFixed(2)}
                                </div>
                                <button
                                    className={`btn ${isFull ? 'btn-secondary' : 'btn-primary'}`}
                                    disabled={isFull}
                                    tabIndex={-1}
                                >
                                    {isFull ? 'Full' : 'Book Bundle'}
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
