'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Session, Venue } from '@/types';
import { Calendar, MapPin, Clock, ArrowRight } from 'lucide-react';
import styles from './page.module.css';

export default function FindClassPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [venues, setVenues] = useState<Venue[]>([]);
    const [sessions, setSessions] = useState<Session[]>([]);
    const [loading, setLoading] = useState(false);

    // Filters State
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
            let q = query(
                collection(db, 'sessions'),
                where('status', '==', 'open'),
                orderBy('date', 'asc')
            );
            const snap = await getDocs(q);
            let results = snap.docs.map(d => ({ id: d.id, ...d.data() } as Session));

            // Client-side filtering
            if (filters.venueId !== 'all') {
                results = results.filter(s => s.venueId === filters.venueId);
            }
            if (filters.type !== 'all') {
                results = results.filter(s => s.classType === filters.type);
            }
            // Date filtering (Simplified)
            if (filters.dateRange === 'this-week') {
                const now = new Date();
                const nextWeek = new Date();
                nextWeek.setDate(now.getDate() + 7);
                results = results.filter(s => {
                    const d = new Date(s.date);
                    return d >= now && d <= nextWeek;
                });
            }

            setSessions(results);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    // Initial load
    useEffect(() => { handleSearch(); }, []);

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <h1>Find a Class</h1>
                <p>Browse available sessions and book your spot.</p>
            </div>

            {/* Filters */}
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
                            <option value="kidsAfterSchool">Kids (5-12)</option>
                            <option value="youngAdultWeekend">Young Adult</option>
                        </select>
                    </div>
                    <button onClick={handleSearch} className={`btn btn-primary ${styles.searchBtn}`} disabled={loading}>
                        {loading ? 'Searching...' : 'Search'}
                    </button>
                </div>
            </div>

            <div className={styles.resultCount}>
                {sessions.length} sessions available
            </div>

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
                                    {s.classType === 'kidsAfterSchool' ? 'Kids 5-12' : 'Young Adult'}
                                </div>
                                <h3 className={styles.sessionName}>{s.className}</h3>
                            </div>

                            <div className={styles.sessionDetails}>
                                <div><Calendar size={18} strokeWidth={1.5} /> {new Date(s.date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
                                <div><Clock size={18} strokeWidth={1.5} /> {s.startTime} – {s.endTime}</div>
                                <div><MapPin size={18} strokeWidth={1.5} /> {s.venueName}</div>
                            </div>

                            <div className="flex justify-between items-center" style={{ marginTop: 'auto' }}>
                                <div className="text-xl font-bold">£{(s.price / 100).toFixed(2)}</div>
                                <button
                                    onClick={() => router.push(`/book/${s.id}`)}
                                    className="btn btn-primary"
                                    disabled={s.spotsAvailable === 0}
                                >
                                    {s.spotsAvailable === 0 ? 'Full' : 'Book Now'}
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
