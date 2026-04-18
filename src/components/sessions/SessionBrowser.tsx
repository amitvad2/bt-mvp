'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Session, Venue } from '@/types';
import { Calendar, MapPin, Clock, ChefHat, Map, List } from 'lucide-react';
import SessionMapSection from '@/components/home/SessionMapSection';
import styles from './SessionBrowser.module.css';

interface Props {
    onBook: (sessionId: string) => void;
}

export default function SessionBrowser({ onBook }: Props) {
    return (
        <Suspense fallback={<div className="loading-screen"><div className="spinner" /></div>}>
            <SessionBrowserContent onBook={onBook} />
        </Suspense>
    );
}

function SessionBrowserContent({ onBook }: Props) {
    const searchParams = useSearchParams();
    const [venues, setVenues] = useState<Venue[]>([]);
    const [sessions, setSessions] = useState<Session[]>([]);
    const [loading, setLoading] = useState(false);
    const [viewMode, setViewMode] = useState<'map' | 'list'>('list');
    const [filters, setFilters] = useState({
        venueId: 'all',
        type: searchParams.get('type') || 'all',
        dateRange: 'all',
    });

    useEffect(() => {
        const fetchVenues = async () => {
            try {
                const snap = await getDocs(collection(db, 'venues'));
                setVenues(snap.docs.map(d => ({ id: d.id, ...d.data() } as Venue)));
            } catch (e) { console.error(e); }
        };
        fetchVenues();
    }, []);

    const handleSearch = async () => {
        setLoading(true);
        try {
            const q = query(collection(db, 'sessions'), where('status', '==', 'open'));
            const snap = await getDocs(q);
            let results = snap.docs.map(d => ({ id: d.id, ...d.data() } as Session));

            results.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

            if (filters.venueId !== 'all') {
                results = results.filter(s => s.venueId === filters.venueId);
            }
            if (filters.type !== 'all') {
                results = results.filter(s => s.classType?.toLowerCase() === filters.type.toLowerCase());
            }

            const now = new Date();
            now.setHours(0, 0, 0, 0);

            if (filters.dateRange === 'this-week') {
                const nextWeek = new Date();
                nextWeek.setDate(now.getDate() + 7);
                results = results.filter(s => {
                    const d = new Date(s.date);
                    return d >= now && d <= nextWeek;
                });
            } else if (filters.dateRange === 'this-month') {
                const nextMonth = new Date();
                nextMonth.setMonth(now.getMonth() + 1);
                results = results.filter(s => {
                    const d = new Date(s.date);
                    return d >= now && d <= nextMonth;
                });
            } else {
                results = results.filter(s => new Date(s.date) >= now);
            }

            setSessions(results);
        } catch (e) {
            console.error('Error fetching sessions:', e);
            setSessions([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const typeParam = searchParams.get('type');
        if (typeParam) {
            setFilters(prev => ({ ...prev, type: typeParam }));
        }
        handleSearch();
    }, [searchParams]);

    return (
        <>
            <div className={styles.viewToggleBar}>
                <div className={styles.viewToggle}>
                    <button
                        className={`${styles.toggleBtn} ${viewMode === 'map' ? styles.active : ''}`}
                        onClick={() => setViewMode('map')}
                    >
                        <Map size={18} /> Map
                    </button>
                    <button
                        className={`${styles.toggleBtn} ${viewMode === 'list' ? styles.active : ''}`}
                        onClick={() => setViewMode('list')}
                    >
                        <List size={18} /> List
                    </button>
                </div>
            </div>

            {viewMode === 'map' ? (
                <div className={styles.mapContainer}>
                    <SessionMapSection />
                </div>
            ) : (
                <>
                    <div className={`card ${styles.filters}`}>
                        <div className={styles.filterRow}>
                            <div className="form-group">
                                <label className="form-label">Venue</label>
                                <select
                                    className="form-select"
                                    value={filters.venueId}
                                    onChange={e => setFilters(f => ({ ...f, venueId: e.target.value }))}
                                >
                                    <option value="all">All Locations</option>
                                    {venues.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="form-label">When</label>
                                <select
                                    className="form-select"
                                    value={filters.dateRange}
                                    onChange={e => setFilters(f => ({ ...f, dateRange: e.target.value }))}
                                >
                                    <option value="all">Anytime</option>
                                    <option value="this-week">This Week</option>
                                    <option value="this-month">This Month</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Type</label>
                                <select
                                    className="form-select"
                                    value={filters.type}
                                    onChange={e => setFilters(f => ({ ...f, type: e.target.value }))}
                                >
                                    <option value="all">All Classes</option>
                                    <option value="kidsAfterSchool">Kids (5–12)</option>
                                    <option value="youngAdultWeekend">Young Adult</option>
                                </select>
                            </div>
                            <button
                                onClick={handleSearch}
                                className={`btn btn-primary ${styles.searchBtn}`}
                                disabled={loading}
                            >
                                {loading ? 'Searching...' : 'Search'}
                            </button>
                        </div>
                    </div>

                    <p className={styles.resultCount}>{sessions.length} sessions available</p>

                    {loading ? (
                        <div className="loading-screen">
                            <div className="spinner" />
                            <p>Finding sessions...</p>
                        </div>
                    ) : sessions.length === 0 ? (
                        <div className={styles.empty}>
                            <span>🍳</span>
                            <h3>No sessions found</h3>
                            <p>Try adjusting your filters or checking a different date range.</p>
                        </div>
                    ) : (
                        <div className={styles.sessionGrid}>
                            {sessions.map(s => (
                                <div key={s.id} className={`card ${styles.sessionCard}`}>
                                    <div className={styles.sessionHeader}>
                                        <div className={styles.ageRange}>
                                            {s.classType === 'kidsAfterSchool'
                                                ? `Kids (Ages ${s.ageMin}–${s.ageMax})`
                                                : `Teens (Ages ${s.ageMin}+)`}
                                        </div>
                                        <h3 className={styles.sessionName}>{s.className}</h3>
                                    </div>

                                    <div className={styles.sessionDetails}>
                                        <div>
                                            <Calendar size={18} strokeWidth={1.5} />
                                            {new Date(s.date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
                                        </div>
                                        <div><Clock size={18} strokeWidth={1.5} /> {s.startTime} – {s.endTime}</div>
                                        <div><MapPin size={18} strokeWidth={1.5} /> {s.venueName}</div>
                                        {s.instructorName && (
                                            <div><ChefHat size={18} strokeWidth={1.5} /> {s.instructorName}</div>
                                        )}
                                    </div>

                                    <div className={styles.cardFooter}>
                                        <div className="text-xl font-bold">£{(s.price / 100).toFixed(2)}</div>
                                        <button
                                            onClick={() => onBook(s.id!)}
                                            className="btn btn-primary"
                                            disabled={s.spotsAvailable === 0}
                                        >
                                            {s.spotsAvailable === 0 ? 'Full' : 'Book Now'}
                                        </button>
                                    </div>

                                    {s.spotsAvailable !== undefined && s.spotsAvailable <= 3 && s.spotsAvailable > 0 && (
                                        <p className={`${styles.spots} ${styles.spotsLow}`}>
                                            Only {s.spotsAvailable} spot{s.spotsAvailable === 1 ? '' : 's'} left!
                                        </p>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}
        </>
    );
}
