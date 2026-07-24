'use client';

import { useMemo } from 'react';
import { Booking } from '@/types';
import { Package, Calendar, X } from 'lucide-react';
import styles from './BundleGroupCard.module.css';

export interface BundleGroupCardProps {
    bookings: Booking[];
    onCancel: (bundleId: string) => void;
}

/**
 * Formats a session date string (YYYY-MM-DD) with optional time and venue into
 * display format: "Sat 15 Mar — 10:30-12:30 at Kitchen Studio"
 */
function formatSessionLine(booking: Booking & { startTime?: string; endTime?: string }): string {
    const date = new Date(booking.sessionDate + 'T00:00:00');
    const weekday = date.toLocaleDateString('en-GB', { weekday: 'short' });
    const day = date.getDate();
    const month = date.toLocaleDateString('en-GB', { month: 'short' });

    const timePart = booking.startTime && booking.endTime
        ? ` — ${booking.startTime}-${booking.endTime}`
        : '';

    const venuePart = booking.venueName ? ` at ${booking.venueName}` : '';

    return `${weekday} ${day} ${month}${timePart}${venuePart}`;
}

export default function BundleGroupCard({ bookings, onCancel }: BundleGroupCardProps) {
    // Sort bookings by sessionDate chronologically
    const sortedBookings = useMemo(() => {
        return [...bookings].sort((a, b) => {
            return a.sessionDate.localeCompare(b.sessionDate);
        });
    }, [bookings]);

    // Get bundle name from first booking's bundleName field
    const bundleName = sortedBookings[0]?.bundleName || 'Bundle';
    const bundleId = sortedBookings[0]?.bundleId;

    // Bundle is cancelled if all bookings have status 'cancelled'
    const isCancelled = sortedBookings.every(b => b.status === 'cancelled');

    if (!bundleId) return null;

    return (
        <div className={styles.card}>
            <div className={styles.cardHeader}>
                <div className={styles.bundleIcon}>
                    <Package size={20} />
                </div>
                <div className={styles.bundleInfo}>
                    <h3 className={styles.bundleName}>{bundleName}</h3>
                    <span className={styles.sessionCount}>
                        {sortedBookings.length} session{sortedBookings.length !== 1 ? 's' : ''}
                    </span>
                </div>
                {isCancelled && (
                    <span className={`badge badge-red ${styles.cancelledBadge}`}>Cancelled</span>
                )}
            </div>

            <ul className={styles.sessionList}>
                {sortedBookings.map(booking => (
                    <li key={booking.id} className={styles.sessionItem}>
                        <Calendar size={14} className={styles.sessionIcon} />
                        <span className={styles.sessionText}>
                            {formatSessionLine(booking as Booking & { startTime?: string; endTime?: string })}
                        </span>
                    </li>
                ))}
            </ul>

            {!isCancelled && (
                <div className={styles.cardActions}>
                    <button
                        className={`btn btn-ghost btn-sm text-danger ${styles.cancelBtn}`}
                        onClick={() => onCancel(bundleId)}
                    >
                        <X size={16} />
                        Cancel Bundle
                    </button>
                </div>
            )}
        </div>
    );
}
