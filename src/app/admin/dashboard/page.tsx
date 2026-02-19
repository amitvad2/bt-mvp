'use client';

import { useState, useEffect } from 'react';
import { collection, query, getDocs, limit, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Users, Calendar, MapPin, CreditCard, ChevronRight, ChefHat, Image as ImageIcon, BookOpen } from 'lucide-react';
import Link from 'next/link';
import styles from './page.module.css';

export default function AdminDashboard() {
    const [stats, setStats] = useState({
        totalUsers: 0,
        activeSessions: 0,
        totalVenues: 0,
        revenue: 0,
    });
    const [recentBookings, setRecentBookings] = useState<any[]>([]);

    useEffect(() => {
        const fetchData = async () => {
            // Very simple stats for MVP
            const usersSnap = await getDocs(collection(db, 'users'));
            const sessionsSnap = await getDocs(query(collection(db, 'sessions'), orderBy('date', 'asc')));
            const venuesSnap = await getDocs(collection(db, 'venues'));
            const bookingsSnap = await getDocs(query(collection(db, 'bookings'), orderBy('createdAt', 'desc'), limit(5)));

            let revenue = 0;
            const allBookings = await getDocs(collection(db, 'bookings'));
            allBookings.forEach(d => revenue += d.data().payment?.amount || 0);

            setStats({
                totalUsers: usersSnap.size,
                activeSessions: sessionsSnap.size, // in a real app, only future sessions
                totalVenues: venuesSnap.size,
                revenue: revenue / 100,
            });

            setRecentBookings(bookingsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        };
        fetchData();
    }, []);

    const cards = [
        { label: 'Total Users', value: stats.totalUsers, icon: Users },
        { label: 'Sessions', value: stats.activeSessions, icon: Calendar },
        { label: 'Venues', value: stats.totalVenues, icon: MapPin },
        { label: 'Revenue', value: stats.revenue.toLocaleString('en-GB', { style: 'currency', currency: 'GBP' }), icon: CreditCard },
    ];

    return (
        <div className={styles.page}>
            <header className={styles.header}>
                <h1>Admin Overview</h1>
                <p>Snapshot of your business performance.</p>
            </header>

            <div className={styles.statsGrid}>
                {cards.map(card => (
                    <div key={card.label} className={styles.statCard}>
                        <div className={styles.iconBox}>
                            <card.icon size={24} strokeWidth={1.5} />
                        </div>
                        <div className={styles.statContent}>
                            <span>{card.label}</span>
                            <strong>{card.value}</strong>
                        </div>
                    </div>
                ))}
            </div>

            <div className={styles.dashboardGrid}>
                <section className={styles.recentSection}>
                    <div className={styles.sectionHeader}>
                        <h3>Recent Bookings</h3>
                        <Link href="/admin/bookings">View All</Link>
                    </div>
                    <div className={styles.bookingList}>
                        {recentBookings.map(b => (
                            <div key={b.id} className={styles.bookingItem}>
                                <div className={styles.bookingMain}>
                                    <strong>{b.studentName}</strong>
                                    <span>{b.className} ({b.venueName})</span>
                                </div>
                                <div className={styles.bookingMeta}>
                                    <span className="badge badge-green">£{(b.payment?.amount / 100).toFixed(2)}</span>
                                    <span className={styles.date}>
                                        {b.createdAt?.toDate ? new Date(b.createdAt.toDate()).toLocaleDateString() : 'N/A'}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                <section className={styles.quickActions}>
                    <h3>Quick Actions</h3>
                    <div className={styles.actionLinks}>
                        <Link href="/admin/sessions"><Calendar size={18} strokeWidth={1.5} /> Add New Session</Link>
                        <Link href="/admin/classes"><ChefHat size={18} strokeWidth={1.5} /> Add New Class Type</Link>
                        <Link href="/admin/venues"><MapPin size={18} strokeWidth={1.5} /> Add New Venue</Link>
                        <Link href="/admin/recipes"><BookOpen size={18} strokeWidth={1.5} /> Add New Recipe</Link>
                        <Link href="/admin/gallery"><ImageIcon size={18} strokeWidth={1.5} /> Upload Photo</Link>
                    </div>
                </section>
            </div>
        </div>
    );
}
