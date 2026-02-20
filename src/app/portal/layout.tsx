'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import {
    LayoutDashboard, Search, BookOpen, CreditCard, Users,
    Settings, HelpCircle, LogOut, ChefHat, ExternalLink
} from 'lucide-react';
import styles from './portal.module.css';

export default function PortalLayout({ children }: { children: React.ReactNode }) {
    const { user, btUser, loading, logOut } = useAuth();
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        // Only redirect if loading is finished AND there's truly no user 
        // AND no session cookie (to prevent flash-redirects if cookie is still being processed)
        const hasSessionCookie = document.cookie.includes('session=true');

        if (!loading && !user && !hasSessionCookie) {
            router.push('/auth/login?redirect=' + pathname);
        }
    }, [user, loading, router, pathname]);

    if (loading || !user) {
        return (
            <div className="loading-screen">
                <div className="spinner" />
                <p>Loading your portal...</p>
            </div>
        );
    }

    const navItems = [
        { href: '/portal/find-class', icon: Search, label: 'Find Class' },
        { href: '/portal/my-classes', icon: BookOpen, label: 'My Classes' },
        { href: '/portal/my-payments', icon: CreditCard, label: 'My Payments' },
        ...(btUser?.role === 'parent' ? [{ href: '/portal/my-students', icon: Users, label: 'My Students' }] : []),
        { href: '/portal/account', icon: Settings, label: 'Manage Account' },
        { href: '/portal/support', icon: HelpCircle, label: 'Support' },
    ];

    return (
        <div className={styles.layout}>
            {/* Sidebar */}
            <aside className={styles.sidebar}>
                <div className={styles.sidebarTop}>
                    <Link href="/" className={styles.logo}>
                        <ChefHat size={24} strokeWidth={1.5} />
                        <span>Blooming Tastebuds</span>
                    </Link>

                    <div className={styles.userInfo}>
                        <div className={styles.avatar}>
                            {btUser?.firstName?.[0]}{btUser?.lastName?.[0]}
                        </div>
                        <div>
                            <strong>{btUser?.firstName} {btUser?.lastName}</strong>
                            <span className={`badge ${btUser?.role === 'admin' ? 'badge-indigo' : btUser?.role === 'parent' ? 'badge-amber' : 'badge-green'}`}>
                                {btUser?.role === 'youngAdult' ? 'Young Adult' : btUser?.role === 'parent' ? 'Parent' : 'Admin'}
                            </span>
                        </div>
                    </div>

                    <nav className={styles.nav}>
                        {navItems.map(({ href, icon: Icon, label }) => (
                            <Link
                                key={href}
                                href={href}
                                className={`${styles.navItem} ${pathname.startsWith(href) ? styles.active : ''}`}
                            >
                                <Icon size={20} strokeWidth={1.5} />
                                <span>{label}</span>
                            </Link>
                        ))}
                    </nav>
                </div>

                <div className={styles.sidebarBottom}>
                    <Link href="/" className={styles.navItem}>
                        <ExternalLink size={20} strokeWidth={1.5} />
                        <span>Back to Website</span>
                    </Link>
                    <button onClick={logOut} className={`${styles.navItem} ${styles.logoutBtn}`}>
                        <LogOut size={20} strokeWidth={1.5} />
                        <span>Logout</span>
                    </button>
                </div>
            </aside>

            {/* Main content */}
            <main className={styles.main}>
                <div className={styles.content}>
                    {children}
                </div>
            </main>
        </div>
    );
}
