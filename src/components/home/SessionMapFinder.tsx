'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Session, Venue } from '@/types';
import { Search, MapPin, Calendar, Users, ChevronDown, Loader2, AlertCircle, Clock, ChefHat, Map, List } from 'lucide-react';
import styles from './SessionMapFinder.module.css';

// Dynamically import the map to avoid SSR issues with Leaflet
const MapView = dynamic(() => import('./MapView'), { ssr: false, loading: () => <div className={styles.mapPlaceholder}><Loader2 className={styles.spinning} size={28} /></div> });

const DISTANCE_OPTIONS = [2, 5, 10, 20];

// Haversine distance in miles between two lat/lng points
function getDistanceMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 3958.8; // Earth radius in miles
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export type SessionWithVenue = Session & {
    venueLat: number;
    venueLng: number;
    distanceMiles: number;
};

export default function SessionMapFinder() {
    const searchParams = useSearchParams();
    const typeParam = searchParams?.get('type');
    const [postcode, setPostcode] = useState('');
    const [distance, setDistance] = useState(5);
    const [searching, setSearching] = useState(false);
    const [searched, setSearched] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<'map' | 'list'>('map');

    const [centerLat, setCenterLat] = useState<number | null>(null);
    const [centerLng, setCenterLng] = useState<number | null>(null);
    const [results, setResults] = useState<SessionWithVenue[]>([]);

    const handleSearch = useCallback(async (e?: React.FormEvent) => {
        e?.preventDefault();
        const trimmed = postcode.trim().toUpperCase();
        if (!trimmed) { setError('Please enter a postcode.'); return; }

        setSearching(true);
        setError(null);
        setResults([]);
        setSearched(false);

        try {
            // 1. Geocode postcode via postcodes.io
            const geoRes = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(trimmed)}`);
            const geoData = await geoRes.json();
            if (geoData.status !== 200 || !geoData.result) {
                setError('Postcode not found. Please check and try again.');
                setSearching(false);
                return;
            }
            const { latitude: userLat, longitude: userLng } = geoData.result;
            setCenterLat(userLat);
            setCenterLng(userLng);

            // 2. Fetch all venues with coordinates from Firestore
            const venuesSnap = await getDocs(collection(db, 'venues'));
            const venues: Venue[] = venuesSnap.docs.map(d => ({ id: d.id, ...d.data() } as Venue));
            const geocodedVenues = venues.filter(v => v.lat != null && v.lng != null);

            // 3. Fetch all sessions and filter client-side (avoids needing a Firestore composite index)
            const today = new Date().toISOString().split('T')[0];
            const sessionsSnap = await getDocs(collection(db, 'sessions'));
            let sessions: Session[] = sessionsSnap.docs
                .map(d => ({ id: d.id, ...d.data() } as Session))
                .filter(s => s.status === 'open' && s.date >= today)
                .sort((a, b) => a.date.localeCompare(b.date));

            // Apply URL type filter if present
            if (typeParam) {
                sessions = sessions.filter(s => s.classType === typeParam);
            }

            // 4. Join sessions with their venue coordinates + filter by distance
            const matched: SessionWithVenue[] = [];
            for (const session of sessions) {
                const venue = geocodedVenues.find(v => v.id === session.venueId);
                if (!venue || venue.lat == null || venue.lng == null) continue;
                const dist = getDistanceMiles(userLat, userLng, venue.lat, venue.lng);
                if (dist <= distance) {
                    matched.push({ ...session, venueLat: venue.lat, venueLng: venue.lng, distanceMiles: dist });
                }
            }

            // Sort by distance then date
            matched.sort((a, b) => a.distanceMiles - b.distanceMiles || a.date.localeCompare(b.date));
            setResults(matched);
            setSearched(true);
        } catch (err) {
            console.error(err);
            setError('Something went wrong. Please try again.');
        } finally {
            setSearching(false);
        }
    }, [postcode, distance, typeParam]);

    return (
        <section className={`section ${styles.section}`}>
            <div className="container">
                <div className={styles.headerTop}>
                    <div className="section-header" style={{ marginBottom: 0 }}>
                        <span className="eyebrow">Find a Class</span>
                        <h2>Classes near you.</h2>
                        <p>Enter your postcode and distance to discover available sessions in your area.</p>
                    </div>
                    <div className={styles.viewToggle}>
                        <button
                            type="button"
                            className={`${styles.toggleBtn} ${viewMode === 'map' ? styles.active : ''}`}
                            onClick={() => setViewMode('map')}
                        >
                            <Map size={18} /> Map
                        </button>
                        <button
                            type="button"
                            className={`${styles.toggleBtn} ${viewMode === 'list' ? styles.active : ''}`}
                            onClick={() => setViewMode('list')}
                        >
                            <List size={18} /> List
                        </button>
                    </div>
                </div>

                {/* Search Bar */}
                <form className={styles.searchBar} onSubmit={handleSearch}>
                    <div className={styles.postcodeField}>
                        <MapPin size={18} className={styles.fieldIcon} />
                        <input
                            className={styles.postcodeInput}
                            type="text"
                            value={postcode}
                            onChange={e => setPostcode(e.target.value.toUpperCase())}
                            placeholder="Enter postcode e.g. SW1A 1AA"
                            maxLength={8}
                            autoComplete="postal-code"
                        />
                    </div>
                    <div className={styles.distanceField}>
                        <ChevronDown size={16} className={styles.selectIcon} />
                        <select
                            className={styles.distanceSelect}
                            value={distance}
                            onChange={e => setDistance(Number(e.target.value))}
                        >
                            {DISTANCE_OPTIONS.map(d => (
                                <option key={d} value={d}>Within {d} miles</option>
                            ))}
                        </select>
                    </div>
                    <button type="submit" className={`btn btn-primary ${styles.searchBtn}`} disabled={searching}>
                        {searching ? <Loader2 size={18} className={styles.spinning} /> : <Search size={18} />}
                        {searching ? 'Searching…' : 'Search'}
                    </button>
                </form>

                {error && (
                    <div className={styles.errorMsg}>
                        <AlertCircle size={16} /> {error}
                    </div>
                )}

                {/* Map (Only show if viewMode is map) */}
                {viewMode === 'map' && (
                    <div className={styles.mapWrapper}>
                        <MapView
                            centerLat={centerLat}
                            centerLng={centerLng}
                            sessions={results}
                            zoom={searched ? 11 : 6}
                        />
                    </div>
                )}

                {/* Results */}
                {searched && (
                    <div className={styles.results}>
                        {results.length === 0 ? (
                            <div className={styles.noResults}>
                                <span>🍳</span>
                                <p>No open sessions found within {distance} miles of <strong>{postcode}</strong>.</p>
                                <p className={styles.noResultsSub}>Try increasing the distance or check back soon for new sessions.</p>
                            </div>
                        ) : (
                            <>
                                <p className={styles.resultCount}>
                                    Found <strong>{results.length}</strong> session{results.length !== 1 ? 's' : ''} within {distance} miles of <strong>{postcode}</strong>
                                </p>
                                <div className={styles.sessionGrid}>
                                    {results.map(s => (
                                        <div key={s.id} className={styles.sessionCard}>
                                            <div className={styles.cardHeader}>
                                                <span className={`badge ${s.classType === 'kidsAfterSchool' ? 'badge-amber' : 'badge-indigo'}`}>
                                                    {s.classType === 'kidsAfterSchool' ? `🧒 Kids (Ages ${s.ageMin}-${s.ageMax})` : `🎓 Teens (Ages ${s.ageMin}+)`}
                                                </span>
                                                <span className={styles.distancePill}>
                                                    <MapPin size={12} /> {s.distanceMiles.toFixed(1)} mi
                                                </span>
                                            </div>
                                            <div className={styles.cardBody}>
                                                <div className={styles.sessionMeta}>
                                                    <div className={styles.metaItem}>
                                                        <Calendar size={15} />
                                                        <span>{new Date(s.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span>
                                                    </div>
                                                    {(s.startTime || s.endTime) && (
                                                        <div className={styles.metaItem}>
                                                            <Clock size={15} />
                                                            <span>{s.startTime}{s.endTime ? `–${s.endTime}` : ''}</span>
                                                        </div>
                                                    )}
                                                    <div className={styles.metaItem}>
                                                        <MapPin size={15} />
                                                        <span>{s.venueName}</span>
                                                    </div>
                                                    {s.instructorName && (
                                                        <div className={styles.metaItem}>
                                                            <ChefHat size={15} />
                                                            <span>{s.instructorName}</span>
                                                        </div>
                                                    )}
                                                    <div className={styles.metaItem}>
                                                        <Users size={15} />
                                                        <span>{s.spotsAvailable} spot{s.spotsAvailable !== 1 ? 's' : ''} left</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className={styles.cardFooter}>
                                                <span className={styles.price}>
                                                    £{((s.price || 0) / 100).toFixed(2)} per session
                                                </span>
                                                <Link href={`/book/${s.id}/student`} className="btn btn-primary btn-sm">
                                                    Book Now
                                                </Link>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                )}

                {!searched && !searching && (
                    <div className={styles.hint}>
                        <MapPin size={16} /> Enter your postcode above to find classes near you
                    </div>
                )}
            </div>
        </section>
    );
}
