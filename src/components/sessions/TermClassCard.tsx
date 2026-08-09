'use client';

import Link from 'next/link';
import { Calendar, Clock, MapPin, Users } from 'lucide-react';
import { BTClass } from '@/types';
import { formatRecurrenceDays, formatTermPrice, formatProgrammeDescription } from '@/lib/term-utils';
import styles from './TermClassCard.module.css';

interface TermClassCardProps {
    termClass: BTClass;
    onViewSchedule?: (classId: string) => void;
    showGuestOption?: boolean;
}

/**
 * Formats a YYYY-MM-DD date string into a short human-readable format.
 * E.g. "2025-01-06" → "6 Jan 2025"
 */
function formatTermDate(dateStr: string): string {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    });
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

export default function TermClassCard({ termClass, onViewSchedule, showGuestOption }: TermClassCardProps) {
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
        spotsAvailable = 0,
    } = termClass;

    const isFull = spotsAvailable === 0;
    const hasRecurrenceDays = recurrenceDays.length > 0;
    const formattedRecurrence = hasRecurrenceDays
        ? formatRecurrenceDays(recurrenceDays)
        : formatProgrammeDescription(termStartDate, termEndDate);
    const formattedPrice = formatTermPrice(termPrice);
    const termPeriod = `${formatTermDate(termStartDate)} – ${formatTermDate(termEndDate)}`;
    const timeSlot = `${formatTime(startTime)}–${formatTime(endTime)}`;

    return (
        <div className={styles.card}>
            <div className={styles.header}>
                <h3 className={styles.className}>{name}</h3>
                <span className="badge badge-indigo">Term</span>
            </div>

            {termClass.description && (
                <p className={styles.description}>{termClass.description}</p>
            )}

            <div className={styles.details}>
                <div className={`${styles.detailRow} ${styles.recurrence}`}>
                    <Calendar size={18} strokeWidth={1.5} />
                    {formattedRecurrence}
                </div>
                {hasRecurrenceDays && (
                    <div className={styles.detailRow}>
                        <Calendar size={18} strokeWidth={1.5} />
                        {termPeriod}
                    </div>
                )}
                <div className={styles.detailRow}>
                    <Clock size={18} strokeWidth={1.5} />
                    {timeSlot}
                </div>
                <div className={styles.detailRow}>
                    <MapPin size={18} strokeWidth={1.5} />
                    {venueName || 'Venue TBC'}
                </div>
                <div className={styles.detailRow}>
                    <Users size={18} strokeWidth={1.5} />
                    {isFull ? (
                        <span className={styles.fullBadge}>Full</span>
                    ) : (
                        <span className={spotsAvailable <= 3 ? styles.spotsLow : styles.spots}>
                            {spotsAvailable} spot{spotsAvailable === 1 ? '' : 's'} remaining
                        </span>
                    )}
                </div>
            </div>

            <div className={styles.price}>{formattedPrice}</div>

            <div className={styles.footer}>
                {onViewSchedule && (
                    <button
                        type="button"
                        className={styles.viewScheduleBtn}
                        onClick={() => onViewSchedule(id)}
                    >
                        View Schedule
                    </button>
                )}
                {isFull ? (
                    <button className="btn btn-primary" disabled>
                        Full
                    </button>
                ) : (
                    <Link href={`/book-term/${id}/student`} className="btn btn-primary">
                        Book Now
                    </Link>
                )}
            </div>

            {showGuestOption && !isFull && (
                <Link
                    href={`/express-book-term/${id}?source=website_express`}
                    className={styles.guestBookLink}
                >
                    Book as a Guest
                </Link>
            )}
        </div>
    );
}
