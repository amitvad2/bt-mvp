'use client';

import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { BookOpen, CreditCard, Users, Settings, Search, ArrowRight } from 'lucide-react';
import styles from './page.module.css';

export default function DashboardPage() {
    const { btUser } = useAuth();
    const isParent = btUser?.role === 'parent';

    const tiles = [
        { href: '/portal/my-classes', icon: BookOpen, label: 'My Classes', desc: 'View upcoming and past sessions' },
        { href: '/portal/my-payments', icon: CreditCard, label: 'My Payments', desc: 'Payment history and receipts' },
        ...(isParent ? [{ href: '/portal/my-students', icon: Users, label: 'My Students', desc: 'Manage your children\'s profiles' }] : []),
        { href: '/portal/account', icon: Settings, label: 'Manage Account', desc: 'Update your profile and details' },
    ];

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <div>
                    <h1>Welcome, {btUser?.firstName}</h1>
                    <p>What would you like to do today?</p>
                </div>
                <Link href="/portal/find-class" className="btn btn-primary">
                    Find a Class
                </Link>
            </div>

            {/* Tiles */}
            <div className={styles.tiles}>
                {tiles.map(({ href, icon: Icon, label, desc }) => (
                    <Link key={href} href={href} className={styles.tile}>
                        <div className={styles.tileIcon}>
                            <Icon size={24} strokeWidth={1.5} />
                        </div>
                        <div className={styles.tileText}>
                            <strong>{label}</strong>
                            <span>{desc}</span>
                        </div>
                        <ArrowRight size={18} className={styles.tileArrow} />
                    </Link>
                ))}
            </div>

            {/* Quick Find Class */}
            <div className={`card ${styles.findClassCard}`}>
                <div className={styles.findClassInner}>
                    <div>
                        <h3>Ready to book a session?</h3>
                        <p>Browse available classes by venue, type, and date. Per-session booking — no commitment required.</p>
                    </div>
                    <Link href="/portal/find-class" className="btn btn-secondary">
                        Find a Class
                    </Link>
                </div>
            </div>
        </div>
    );
}
