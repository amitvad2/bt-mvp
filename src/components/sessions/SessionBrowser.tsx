'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Session, Venue, BTClassType } from '@/types';
import { getActiveSessionCount } from '@/lib/term-schedule-utils';
import { Map, List, ChevronDown, ChevronUp, ChefHat } from 'lucide-react';
import SessionMapSection from '@/components/home/SessionMapSection';
import BundleBrowser from '@/components/sessions/BundleBrowser';
import TermScheduleView from '@/components/sessions/TermScheduleView';
import styles from './SessionBrowser.module.css';

interface Props {
    onBook: (sessionId: string) => void;
    showGuestOption?: boolean;
}

export default function SessionBrowser({ onBook, showGuestOption }: Props) {
    return (
        <Suspense fallback={<div className="loading-screen"><div className="spinner" /></div>}>
            <SessionBrowserContent onBook={onBook} showGuestOption={showGuestOption} />
        </Suspense>
    );
}

function SessionBrowserContent({ onBook, showGuestOption }: Props) {
    const searchParams = useSearchParams();
    const [venues, setVenues] = useState<Venue[]>([]);
    const [classTypes, setClassTypes] = useState<BTClassType[]>([]);
    const [sessions, setSessions] = useState<Session[]>([]);
    const [termSessions, setTermSessions] = useState<Session[]>([]);
    const [expandedTermSchedule, setExpandedTermSchedule] = useState<string | null>(null);
    const [expandedRecipe, setExpandedRecipe] = useState<string | null>(null);
    const [termClassIds, setTermClassIds] = useState<Set<string>>(new Set());
    const [termClassIdsReady, setTermClassIdsReady] = useState(false);
    const [loading, setLoading] = useState(false);
    const [viewMode, setViewMode] = useState<'map' | 'list'>('list');
    const [filters, setFilters] = useState({
        venueId: 'all',
        type: searchParams.get('type') || 'all',
        dateRange: 'all',
    });
    // Applied filters — only updated when Search is clicked (or on initial load)
    const [appliedFilters, setAppliedFilters] = useState({
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
        const fetchClassTypes = async () => {
            try {
                const snap = await getDocs(query(collection(db, 'class_types'), orderBy('order')));
                setClassTypes(snap.docs.map(d => ({ id: d.id, ...d.data() } as BTClassType)));
            } catch (e) { console.error('Error fetching class types:', e); }
        };
        const fetchTermClasses = async () => {
            try {
                const snap = await getDocs(
                    query(collection(db, 'classes'), where('commitment', '==', 'term'))
                );
                const ids = new Set(snap.docs.map(d => d.id));
                setTermClassIds(ids);
            } catch (e) { console.error('Error fetching term classes:', e); } finally {
                setTermClassIdsReady(true);
            }
        };
        fetchVenues();
        fetchClassTypes();
        fetchTermClasses();
    }, []);

    const getClassTypeBadge = (slug: string) => {
        const ct = classTypes.find(t => t.slug === slug);
        if (ct) {
            return { label: ct.shortLabel, displayName: ct.displayName, color: ct.badgeColor };
        }
        return { label: slug, displayName: slug, color: 'gray' as const };
    };

    const handleSearch = async (typeOverride?: string) => {
        const activeType = typeOverride ?? filters.type;
        setAppliedFilters({ ...filters, type: activeType });
        setLoading(true);
        try {
            const q = query(collection(db, 'sessions'), where('status', '==', 'open'));
            const snap = await getDocs(q);
            let results = snap.docs.map(d => ({ id: d.id, ...d.data() } as Session));

            // Exclude legacy per-date sessions belonging to term classes that are part of the old
            // class-based term model (auto-generated per-date sessions not meant for individual booking).
            // Keep: all term sessions, and any session not linked to a term class.
            // For sessions linked to a term class: only exclude if they have no sessionType field
            // AND were created as part of the old auto-generated schedule (identified by having
            // a classId in termClassIds but no explicit sessionType).
            // NOTE: We no longer exclude these because it causes issues when admins create
            // standalone sessions linked to term classes. The old model's per-date sessions
            // should be cleaned up separately if they exist.
            // Term sessions (sessionType === 'term') are separated into their own display section below.

            // Separate term sessions from single sessions.
            // Absent/undefined sessionType defaults to 'single' (backward compat).
            const termSessionResults = results.filter(s => s.sessionType === 'term');
            let singleResults = results.filter(s => (s.sessionType ?? 'single') !== 'term');

            singleResults.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

            if (filters.venueId !== 'all') {
                singleResults = singleResults.filter(s => s.venueId === filters.venueId);
            }
            if (activeType !== 'all') {
                singleResults = singleResults.filter(s => s.classType?.toLowerCase() === activeType.toLowerCase());
            }

            const now = new Date();
            now.setHours(0, 0, 0, 0);

            if (filters.dateRange === 'this-weekend') {
                // Find next Saturday and Sunday
                const dayOfWeek = now.getDay(); // 0=Sun, 6=Sat
                const daysUntilSat = dayOfWeek === 6 ? 0 : (6 - dayOfWeek);
                const saturday = new Date(now);
                saturday.setDate(now.getDate() + daysUntilSat);
                const sunday = new Date(saturday);
                sunday.setDate(saturday.getDate() + 1);
                sunday.setHours(23, 59, 59, 999);
                singleResults = singleResults.filter(s => {
                    const d = new Date(s.date);
                    return d >= saturday && d <= sunday;
                });
            } else if (filters.dateRange === 'this-week') {
                const nextWeek = new Date();
                nextWeek.setDate(now.getDate() + 7);
                singleResults = singleResults.filter(s => {
                    const d = new Date(s.date);
                    return d >= now && d <= nextWeek;
                });
            } else if (filters.dateRange === 'next-2-weeks') {
                const twoWeeks = new Date();
                twoWeeks.setDate(now.getDate() + 14);
                singleResults = singleResults.filter(s => {
                    const d = new Date(s.date);
                    return d >= now && d <= twoWeeks;
                });
            } else if (filters.dateRange === 'this-month') {
                const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                singleResults = singleResults.filter(s => {
                    const d = new Date(s.date);
                    return d >= now && d <= endOfMonth;
                });
            } else if (filters.dateRange === 'next-month') {
                const startNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
                const endNextMonth = new Date(now.getFullYear(), now.getMonth() + 2, 0);
                singleResults = singleResults.filter(s => {
                    const d = new Date(s.date);
                    return d >= startNextMonth && d <= endNextMonth;
                });
            } else {
                singleResults = singleResults.filter(s => new Date(s.date) >= now);
            }

            // Filter term sessions by venue and type (date range doesn't apply the same way)
            let filteredTermSessions = termSessionResults;
            if (filters.venueId !== 'all') {
                filteredTermSessions = filteredTermSessions.filter(s => s.venueId === filters.venueId);
            }
            if (activeType !== 'all') {
                filteredTermSessions = filteredTermSessions.filter(s => s.classType?.toLowerCase() === activeType.toLowerCase());
            }
            // For term sessions, filter out those whose termEndDate has passed
            filteredTermSessions = filteredTermSessions.filter(s => {
                if (s.termEndDate) {
                    return new Date(s.termEndDate) >= now;
                }
                return true;
            });

            setSessions(singleResults);
            setTermSessions(filteredTermSessions);
        } catch (e) {
            console.error('Error fetching sessions:', e);
            setSessions([]);
            setTermSessions([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const typeParam = searchParams.get('type');
        if (typeParam) {
            setFilters(prev => ({ ...prev, type: typeParam }));
            handleSearch(typeParam);
        } else {
            handleSearch();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
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
                    <BundleBrowser onBook={onBook} />

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
                                    <option value="this-weekend">This Weekend</option>
                                    <option value="this-week">This Week</option>
                                    <option value="next-2-weeks">Next 2 Weeks</option>
                                    <option value="this-month">This Month</option>
                                    <option value="next-month">Next Month</option>
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
                                    {classTypes.map(ct => (
                                        <option key={ct.id} value={ct.slug}>{ct.displayName}</option>
                                    ))}
                                </select>
                            </div>
                            <button
                                onClick={() => handleSearch()}
                                className={`btn btn-primary ${styles.searchBtn}`}
                                disabled={loading}
                            >
                                {loading ? 'Searching...' : 'Search'}
                            </button>
                        </div>
                    </div>

                    <p className={styles.resultCount}>
                        {(() => {
                            const total = sessions.length + termSessions.length;
                            return `${total} result${total !== 1 ? 's' : ''} available`;
                        })()}
                    </p>

                    <div className={styles.combinedResults}>
                    {/* Term Sessions (sessionType === 'term') */}
                    {!loading && termSessions.length > 0 && (
                        <section className={styles.termSessionsSection}>
                            <div className={styles.sessionGrid}>
                                {termSessions.map(ts => {
                                    const badge = getClassTypeBadge(ts.classType);
                                    const startDate = ts.termStartDate ? new Date(ts.termStartDate + 'T00:00:00') : null;
                                    const endDate = ts.termEndDate ? new Date(ts.termEndDate + 'T00:00:00') : null;
                                    const dateRangeStr = startDate && endDate
                                        ? `${startDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${endDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
                                        : '';
                                    const activeCount = ts.schedule ? getActiveSessionCount(ts.schedule) : 0;
                                    const isExpanded = expandedTermSchedule === ts.id;

                                    const [sh, sm] = ts.startTime.split(':').map(Number);
                                    const period = sh >= 12 ? 'pm' : 'am';
                                    const displayHour = sh % 12 || 12;
                                    const timeDisplay = `${displayHour}:${sm.toString().padStart(2, '0')}`;

                                    return (
                                        <div key={ts.id} className={`card ${styles.sessionCard}`}>
                                            {/* Header: date range + title */}
                                            <div className={styles.cardTop}>
                                                <div className={`${styles.dateBadge} ${styles[`dateBadge_${badge.color}`]}`}>
                                                    <span className={styles.badgeDay}>{startDate ? startDate.getDate() : '—'}</span>
                                                    <span className={styles.badgeMonth}>{startDate ? startDate.toLocaleDateString('en-GB', { month: 'short' }).toUpperCase() : 'TERM'}</span>
                                                </div>
                                                <div className={styles.cardTitleBlock}>
                                                    <h3 className={styles.sessionName}>{ts.className}</h3>
                                                    <p className={styles.sessionSchedule}>{dateRangeStr}</p>
                                                </div>
                                            </div>

                                            {/* Term badge */}
                                            <div className={styles.termBadgeRow}>
                                                <span className="badge badge-indigo">Term</span>
                                                {activeCount > 0 && (
                                                    <span className={styles.termSessionCount}>
                                                        {activeCount} session{activeCount !== 1 ? 's' : ''}
                                                    </span>
                                                )}
                                            </div>

                                            {/* Details table */}
                                            <dl className={styles.detailsTable}>
                                                <div className={styles.detailRow}>
                                                    <dt>Term Period</dt>
                                                    <dd>{dateRangeStr}</dd>
                                                </div>
                                                <div className={styles.detailRow}>
                                                    <dt>Day</dt>
                                                    <dd>{ts.dayOfWeek || '—'}</dd>
                                                </div>
                                                <div className={styles.detailRow}>
                                                    <dt>Time</dt>
                                                    <dd>{timeDisplay} {period.toUpperCase()}</dd>
                                                </div>
                                                <div className={styles.detailRow}>
                                                    <dt>Spaces Available</dt>
                                                    <dd>{ts.spotsAvailable === 0 ? 'Full' : `${ts.spotsAvailable} spot${ts.spotsAvailable === 1 ? '' : 's'}`}</dd>
                                                </div>
                                                <div className={styles.detailRow}>
                                                    <dt>Category</dt>
                                                    <dd>{badge.displayName}</dd>
                                                </div>
                                                {ts.ageMin != null && ts.ageMax != null && (
                                                    <div className={styles.detailRow}>
                                                        <dt>Ages</dt>
                                                        <dd>{ts.ageMin}–{ts.ageMax} yrs</dd>
                                                    </div>
                                                )}
                                                {ts.venueName && (
                                                    <div className={styles.detailRow}>
                                                        <dt>Venue</dt>
                                                        <dd>{ts.venueName}{ts.venuePostcode ? `, ${ts.venuePostcode}` : (venues.find(v => v.id === ts.venueId)?.postcode ? `, ${venues.find(v => v.id === ts.venueId)!.postcode}` : '')}</dd>
                                                    </div>
                                                )}
                                                {ts.instructorName && (
                                                    <div className={styles.detailRow}>
                                                        <dt>Instructor</dt>
                                                        <dd>{ts.instructorName}</dd>
                                                    </div>
                                                )}
                                            </dl>

                                            {/* Price */}
                                            <div className={styles.priceRow}>
                                                <span className={styles.priceLabel}>Term price</span>
                                                <span className={styles.priceValue}>£{(ts.price / 100).toFixed(2)}</span>
                                            </div>

                                            {/* Full term menu and learning plan */}
                                            {ts.schedule && ts.schedule.length > 0 && (
                                                <div className={styles.viewScheduleSection}>
                                                    <button
                                                        type="button"
                                                        className={styles.viewScheduleToggle}
                                                    onClick={() => setExpandedTermSchedule(isExpanded ? null : ts.id!)}
                                                    aria-expanded={isExpanded}
                                                >
                                                        See what they&apos;ll cook &amp; learn
                                                        {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                                                    </button>
                                                    {isExpanded && (
                                                        <div className={styles.scheduleInline}>
                                                            <TermScheduleView schedule={ts.schedule} />
                                                            <p className={styles.scheduleDisclaimer}>
                                                                Planned menu subject to change for seasonal availability, allergen management, or operational reasons.
                                                            </p>
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {/* CTA */}
                                            <button
                                                onClick={() => onBook(ts.id!)}
                                                className={`btn btn-primary ${styles.bookBtn}`}
                                                disabled={ts.spotsAvailable === 0}
                                            >
                                                {ts.spotsAvailable === 0 ? 'Full' : 'Book Now'}
                                            </button>

                                            {showGuestOption && ts.spotsAvailable > 0 && (
                                                <Link
                                                    href={`/express-booking/${ts.id}?source=website_express`}
                                                    className={styles.guestBookLink}
                                                >
                                                    Book as a Guest
                                                </Link>
                                            )}

                                            {ts.spotsAvailable !== undefined && ts.spotsAvailable <= 3 && ts.spotsAvailable > 0 && (
                                                <p className={`${styles.spots} ${styles.spotsLow}`}>
                                                    Only {ts.spotsAvailable} spot{ts.spotsAvailable === 1 ? '' : 's'} left!
                                                </p>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </section>
                    )}

                    {loading ? (
                        <div className="loading-screen">
                            <div className="spinner" />
                            <p>Finding sessions...</p>
                        </div>
                    ) : sessions.length === 0 && termSessions.length === 0 ? (
                        <div className={styles.empty}>
                            <h3>No sessions found</h3>
                            <p>Try adjusting your filters or checking a different date range.</p>
                        </div>
                    ) : (
                        sessions.length > 0 && (
                        <div className={styles.sessionGrid}>
                            {sessions.map(s => {
                                const badge = getClassTypeBadge(s.classType);
                                const sessionDate = new Date(s.date + 'T00:00:00');
                                const dayNum = sessionDate.getDate();
                                const monthStr = sessionDate.toLocaleDateString('en-GB', { month: 'short' }).toUpperCase();
                                const dayFull = sessionDate.toLocaleDateString('en-GB', { weekday: 'long' });
                                const dayAbbrev = sessionDate.toLocaleDateString('en-GB', { weekday: 'short' });
                                const firstLesson = sessionDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', year: '2-digit' });

                                const [sh, sm] = s.startTime.split(':').map(Number);
                                const [eh, em] = s.endTime.split(':').map(Number);
                                const period = sh >= 12 ? 'pm' : 'am';
                                const displayHour = sh % 12 || 12;
                                const timeDisplay = `${displayHour}:${sm.toString().padStart(2, '0')}`;
                                const durationMins = (eh * 60 + em) - (sh * 60 + sm);
                                const durationHours = durationMins / 60;
                                const durationLabel = Number.isInteger(durationHours) ? `${durationHours}` : durationHours.toFixed(1);

                                return (
                                <div key={s.id} className={`card ${styles.sessionCard}`}>
                                    {/* Header: date badge + title */}
                                    <div className={styles.cardTop}>
                                        <div className={`${styles.dateBadge} ${styles[`dateBadge_${badge.color}`]}`}>
                                            <span className={styles.badgeDay}>{dayNum}</span>
                                            <span className={styles.badgeMonth}>{monthStr}</span>
                                        </div>
                                        <div className={styles.cardTitleBlock}>
                                            <h3 className={styles.sessionName}>{s.className}</h3>
                                            <p className={styles.sessionSchedule}>{dayFull} at {timeDisplay} {period.toUpperCase()}</p>
                                        </div>
                                    </div>

                                    {/* Stats strip */}
                                    <div className={styles.statsStrip}>
                                        <div className={styles.statItem}>
                                            <span className={styles.statValue}>✓</span>
                                            <span className={styles.statLabel}>spaces</span>
                                        </div>
                                        <div className={styles.statItem}>
                                            <span className={styles.statValue}>{dayAbbrev}</span>
                                            <span className={styles.statLabel}>days</span>
                                        </div>
                                        <div className={styles.statItem}>
                                            <span className={styles.statValue}>{timeDisplay}</span>
                                            <span className={styles.statLabel}>{period}</span>
                                        </div>
                                        <div className={styles.statItem}>
                                            <span className={styles.statValue}>{durationLabel}</span>
                                            <span className={styles.statLabel}>{durationHours === 1 ? 'hour' : 'hours'}</span>
                                        </div>
                                    </div>

                                    {/* Details table */}
                                    <dl className={styles.detailsTable}>
                                        <div className={styles.detailRow}>
                                            <dt>First Lesson</dt>
                                            <dd>{firstLesson}</dd>
                                        </div>
                                        <div className={styles.detailRow}>
                                            <dt>Spaces Available</dt>
                                            <dd>{s.spotsAvailable === 0 ? 'Full' : `${s.spotsAvailable} spot${s.spotsAvailable === 1 ? '' : 's'}`}</dd>
                                        </div>
                                        <div className={styles.detailRow}>
                                            <dt>Category</dt>
                                            <dd>{badge.displayName}</dd>
                                        </div>
                                        {s.ageMin != null && s.ageMax != null && (<>
                                            <div className={styles.detailRow}>
                                                <dt>Minimum Age</dt>
                                                <dd>{s.ageMin} yrs</dd>
                                            </div>
                                            <div className={styles.detailRow}>
                                                <dt>Maximum Age</dt>
                                                <dd>{s.ageMax} yrs</dd>
                                            </div>
                                        </>)}
                                        {s.venueName && (
                                            <div className={styles.detailRow}>
                                                <dt>Venue</dt>
                                                <dd>{s.venueName}{s.venuePostcode ? `, ${s.venuePostcode}` : (venues.find(v => v.id === s.venueId)?.postcode ? `, ${venues.find(v => v.id === s.venueId)!.postcode}` : '')}</dd>
                                            </div>
                                        )}
                                        {s.instructorName && (
                                            <div className={styles.detailRow}>
                                                <dt>Instructor</dt>
                                                <dd>{s.instructorName}</dd>
                                            </div>
                                        )}
                                    </dl>

                                    {/* Price */}
                                    <div className={styles.priceRow}>
                                        <span className={styles.priceLabel}>Cost per session from</span>
                                        <span className={styles.priceValue}>£{(s.price / 100).toFixed(2)}</span>
                                    </div>

                                    {/* Optional recipe detail for a single-session booking. */}
                                    {s.recipeName && (
                                        <div className={styles.viewScheduleSection}>
                                            <button
                                                type="button"
                                                className={styles.viewScheduleToggle}
                                                onClick={() => setExpandedRecipe(expandedRecipe === s.id ? null : s.id!)}
                                                aria-expanded={expandedRecipe === s.id}
                                            >
                                                View Recipe
                                                {expandedRecipe === s.id ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                                            </button>
                                            {expandedRecipe === s.id && (
                                                <div className={styles.scheduleInline}>
                                                    <div className={styles.recipeDetailCard}>
                                                        {s.recipePhotoUrl ? (
                                                            <img
                                                                src={s.recipePhotoUrl}
                                                                alt={`Photo of ${s.recipeName}`}
                                                                className={styles.recipeDetailPhoto}
                                                            />
                                                        ) : (
                                                            <div className={styles.recipeDetailFallback} aria-hidden="true">
                                                                <ChefHat size={32} />
                                                            </div>
                                                        )}
                                                        <div className={styles.recipeDetailInfo}>
                                                            <h4 className={styles.recipeDetailName}>{s.recipeName}</h4>
                                                            {s.recipeDescription && (
                                                                <p className={styles.recipeDetailDescription}>{s.recipeDescription}</p>
                                                            )}
                                                            {s.skills && s.skills.length > 0 && (
                                                                <p className={styles.recipeDetailSkills}>{s.skills.join(' · ')}</p>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* CTA */}
                                    <button
                                        onClick={() => onBook(s.id!)}
                                        className={`btn btn-primary ${styles.bookBtn}`}
                                        disabled={s.spotsAvailable === 0}
                                    >
                                        {s.spotsAvailable === 0 ? 'Full' : 'Book Now'}
                                    </button>

                                    {showGuestOption && s.spotsAvailable > 0 && (
                                        <Link
                                            href={`/express-booking/${s.id}?source=website_express`}
                                            className={styles.guestBookLink}
                                        >
                                            Book as a Guest
                                        </Link>
                                    )}

                                    {s.spotsAvailable !== undefined && s.spotsAvailable <= 3 && s.spotsAvailable > 0 && (
                                        <p className={`${styles.spots} ${styles.spotsLow}`}>
                                            Only {s.spotsAvailable} spot{s.spotsAvailable === 1 ? '' : 's'} left!
                                        </p>
                                    )}
                                </div>
                                );
                            })}
                        </div>
                        )
                    )}
                    </div>
                </>
            )}

        </>
    );
}
