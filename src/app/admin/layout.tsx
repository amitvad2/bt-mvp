'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import {
    ShieldCheck, LayoutDashboard, MapPin, ChefHat,
    Calendar, BookOpen, Image, Users, LogOut, ExternalLink, Menu
} from 'lucide-react';
import styles from './admin.module.css';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    const { user, btUser, loading, logOut } = useAuth();
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        if (!loading) {
            if (!user) {
                router.push('/auth/login?redirect=' + pathname);
            } else if (btUser?.role !== 'admin') {
                router.push('/portal/dashboard');
            }
        }
    }, [user, btUser, loading, router, pathname]);

    if (loading || !user || btUser?.role !== 'admin') {
        return (
            <div className="loading-screen">
                <div className="spinner" />
                <p>Checking admin permissions...</p>
            </div>
        );
    }

    const navItems = [
        { href: '/admin/dashboard', icon: LayoutDashboard, label: 'Overview' },
        { href: '/admin/venues', icon: MapPin, label: 'Venues' },
        { href: '/admin/classes', icon: ChefHat, label: 'Classes' },
        { href: '/admin/sessions', icon: Calendar, label: 'Sessions' },
        { href: '/admin/recipes', icon: BookOpen, label: 'Recipes' },
        { href: '/admin/gallery', icon: Image, label: 'Gallery' },
        { href: '/admin/bookings', icon: Users, label: 'Bookings' },
    ];

    return (
        <div className={styles.layout}>
            {/* Admin Sidebar */}
            <aside className={styles.sidebar}>
                <div className={styles.sidebarTop}>
                    <div className={styles.adminBrand}>
                        <ShieldCheck size={20} className={styles.adminIcon} />
                        <span>Admin Control</span>
                    </div>

                    <Link href="/" className={styles.logo}>
                        <ChefHat size={20} />
                        <span>Blooming Tastebuds</span>
                    </Link>

                    <nav className={styles.nav}>
                        {navItems.map(({ href, icon: Icon, label }) => (
                            <Link
                                key={href}
                                href={href}
                                className={`${styles.navItem} ${pathname.startsWith(href) ? styles.active : ''}`}
                            >
                                <Icon size={18} />
                                <span>{label}</span>
                            </Link>
                        ))}
                    </nav>
                </div>

                <div className={styles.sidebarBottom}>
                    <Link href="/portal/dashboard" className={styles.navItem}>
                        <ExternalLink size={18} />
                        <span>User Portal</span>
                    </Link>
                    <button onClick={logOut} className={`${styles.navItem} ${styles.logoutBtn}`}>
                        <LogOut size={18} />
                        <span>Logout</span>
                    </button>
                </div>
            </aside>

            {/* Main Admin Area */}
            <main className={styles.main}>
                <header className={styles.topHeader}>
                    <div className={styles.breadcrumb}>
                        <span>Admin</span> / <span>{navItems.find(i => pathname.startsWith(i.href))?.label || 'Dashboard'}</span>
                    </div>
                    <div className={styles.adminUser}>
                        <span>{btUser?.firstName} (Admin)</span>
                        <div className={styles.avatar}>{btUser?.firstName?.[0]}</div>
                    </div>
                </header>
                <div className={styles.content}>
                    {children}
                </div>
            </main>
        </div>
    );
}
