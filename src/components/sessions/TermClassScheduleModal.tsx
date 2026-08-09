'use client';

import { useState, useEffect, useCallback } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { BTClass, Session, Recipe } from '@/types';
import { formatRecurrenceDays, formatTermPrice, formatProgrammeDescription } from '@/lib/term-utils';
import { X, Calendar, Clock, MapPin, ImageIcon } from 'lucide-react';
import styles from './TermClassScheduleModal.module.css';

interface TermClassScheduleModalProps {
    termClass: BTClass;
    onClose: () => void;
}

/**
 * Formats a YYYY-MM-DD date string to "6 Jan 2025" format.
 */
function formatDate(dateStr: string): string {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    });
}

/**
 * Returns the day of week for a YYYY-MM-DD date string (e.g. "Monday").
 */
function getDayOfWeek(dateStr: string): string {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-GB', { weekday: 'long' });
}

/**
 * Formats a time string (e.g. "15:30") into a more readable form (e.g. "3:30 pm").
 */
function formatTime(time: string): string {
    const [hours, minutes] = time.split(':').map(Number);
    const period = hours >= 12 ? 'pm' : 'am';
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
}

export default function TermClassScheduleModal({ termClass, onClose }: TermClassScheduleModalProps) {
    const [sessions, setSessions] = useState<Session[]>([]);
    const [recipes, setRecipes] = useState<Map<string, Recipe>>(new Map());
    const [loading, setLoading] = useState(true);

    const {
        id,
        name,
        recurrenceDays = [],
        termStartDate = '',
        termEndDate = '',
        startTime,
        endTime,
        venueName,
        termPrice = 0,
    } = termClass;

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            // Fetch sessions — query by classId only (no orderBy to avoid composite index requirement)
            const sessionsQuery = query(
                collection(db, 'sessions'),
                where('classId', '==', id)
            );
            const sessionsSnap = await getDocs(sessionsQuery);
            const sessionResults = sessionsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Session));
            // Sort client-side by date
            sessionResults.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
            setSessions(sessionResults);

            // Fetch all recipes for skills lookup
            const recipesSnap = await getDocs(collection(db, 'recipes'));
            const recipesMap = new Map<string, Recipe>();
            recipesSnap.docs.forEach(d => {
                recipesMap.set(d.id, { id: d.id, ...d.data() } as Recipe);
            });
            setRecipes(recipesMap);
        } catch (error) {
            console.error('Error fetching term class sessions:', error);
            setSessions([]);
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Close on Escape key
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    const termPeriod = `${formatDate(termStartDate)} – ${formatDate(termEndDate)}`;
    const timeSlot = `${formatTime(startTime)}–${formatTime(endTime)}`;

    return (
        <div
            className="modal-overlay"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="schedule-modal-title"
        >
            <div className={`modal ${styles.modalContent}`}>
                <div className={styles.header}>
                    <div className={styles.headerInfo}>
                        <h2 id="schedule-modal-title" className={styles.className}>{name}</h2>
                        <span className="badge badge-indigo">Term</span>
                    </div>
                    <button
                        type="button"
                        className={styles.closeBtn}
                        onClick={onClose}
                        aria-label="Close schedule"
                    >
                        <X size={22} />
                    </button>
                </div>

                <div className={styles.meta}>
                    {recurrenceDays.length > 0 && (
                        <div className={styles.metaItem}>
                            <Calendar size={16} strokeWidth={1.5} />
                            {formatRecurrenceDays(recurrenceDays)}
                        </div>
                    )}
                    <div className={styles.metaItem}>
                        <Calendar size={16} strokeWidth={1.5} />
                        {recurrenceDays.length === 0 && !loading && sessions.length > 0
                            ? formatProgrammeDescription(termStartDate, termEndDate, sessions.length)
                            : termPeriod}
                    </div>
                    <div className={styles.metaItem}>
                        <Clock size={16} strokeWidth={1.5} />
                        {timeSlot}
                    </div>
                    <div className={styles.metaItem}>
                        <MapPin size={16} strokeWidth={1.5} />
                        {venueName || 'Venue TBC'}
                    </div>
                    <div className={`${styles.metaItem} ${styles.price}`}>
                        {formatTermPrice(termPrice)}
                    </div>
                </div>

                <h3 className={styles.scheduleTitle}>Recipe Schedule</h3>

                {loading ? (
                    <div className={styles.loading}>
                        <div className="spinner" />
                        <p>Loading schedule...</p>
                    </div>
                ) : sessions.length === 0 ? (
                    <div className={styles.empty}>
                        <p>No sessions have been scheduled yet.</p>
                    </div>
                ) : (
                    <ul className={styles.scheduleList}>
                        {sessions.map(session => {
                            // Get all recipes for this session
                            const sessionRecipeIds = session.recipeIds && session.recipeIds.length > 0
                                ? session.recipeIds
                                : session.recipeId ? [session.recipeId] : [];
                            const sessionRecipes = sessionRecipeIds
                                .map(rid => recipes.get(rid))
                                .filter((r): r is Recipe => !!r);

                            return (
                            <li key={session.id} className={styles.sessionRow}>
                                <div className={styles.sessionDate}>
                                    <span className={styles.dateText}>{formatDate(session.date)}</span>
                                    <span className={styles.dayText}>{getDayOfWeek(session.date)}</span>
                                    {(session.startTime !== startTime || session.endTime !== endTime) && (
                                        <span className={styles.sessionTime}>
                                            {formatTime(session.startTime)}–{formatTime(session.endTime)}
                                        </span>
                                    )}
                                </div>

                                {sessionRecipes.length > 0 ? (
                                    <div className={styles.sessionRecipes}>
                                        {sessionRecipes.map(recipe => (
                                            <div key={recipe.id} className={styles.recipeItem}>
                                                {recipe.photoUrl ? (
                                                    <img
                                                        src={recipe.photoUrl}
                                                        alt={`Photo of ${recipe.name}`}
                                                        className={styles.recipePhoto}
                                                    />
                                                ) : (
                                                    <div className={styles.photoPlaceholder} aria-hidden="true">
                                                        <ImageIcon size={20} />
                                                    </div>
                                                )}
                                                <div className={styles.recipeDetail}>
                                                    <span className={styles.recipeName}>{recipe.name}</span>
                                                    {recipe.skills && recipe.skills.length > 0 && (
                                                        <span className={styles.skillsText}>
                                                            {recipe.skills.join(', ')}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : session.recipeName ? (
                                    <div className={styles.sessionInfo}>
                                        {session.recipePhotoUrl ? (
                                            <img
                                                src={session.recipePhotoUrl}
                                                alt={`Photo of ${session.recipeName}`}
                                                className={styles.recipePhoto}
                                            />
                                        ) : (
                                            <div className={styles.photoPlaceholder} aria-hidden="true">
                                                <ImageIcon size={20} />
                                            </div>
                                        )}
                                        <div className={styles.recipeDetail}>
                                            <span className={styles.recipeName}>{session.recipeName}</span>
                                            {session.skills && session.skills.length > 0 && (
                                                <span className={styles.skillsText}>
                                                    {session.skills.join(', ')}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <div className={styles.sessionInfo}>
                                        <div className={styles.photoPlaceholder} aria-hidden="true">
                                            <ImageIcon size={20} />
                                        </div>
                                        <span className={styles.tbaText}>To be announced</span>
                                    </div>
                                )}
                            </li>
                            );
                        })}
                    </ul>
                )}

                <div className={styles.footer}>
                    <p className={styles.disclaimer}>
                        Programme schedule subject to change. Recipes may be substituted due to ingredient availability, allergen management, or operational requirements.
                    </p>
                </div>
            </div>
        </div>
    );
}
