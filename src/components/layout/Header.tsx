'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Menu, X, ChefHat } from 'lucide-react';
import styles from './Header.module.css';

export default function Header() {
    const { user, btUser, logOut } = useAuth();
    const [mobileOpen, setMobileOpen] = useState(false);

    const navLinks = [
        { href: '/', label: 'Home' },
        { href: '/about', label: 'About Us' },
        { href: '/courses', label: 'Courses' },
        { href: '/gallery', label: 'Gallery' },
    ];

    return (
        <header className={styles.header}>
            <div className={`container ${styles.inner}`}>
                {/* Logo */}
                <Link href="/" className={styles.logo}>
                    <ChefHat size={28} strokeWidth={2} />
                    <span>Blooming Tastebuds</span>
                </Link>

                {/* Desktop Nav */}
                <nav className={styles.nav}>
                    {navLinks.map((l) => (
                        <Link key={l.href} href={l.href} className={styles.navLink}>
                            {l.label}
                        </Link>
                    ))}
                </nav>

                {/* Auth CTA */}
                <div className={styles.actions}>
                    {user ? (
                        <>
                            {btUser?.role === 'admin' && (
                                <Link href="/admin/dashboard" className="btn btn-ghost btn-sm">
                                    Admin Control
                                </Link>
                            )}
                            <Link href="/portal/dashboard" className="btn btn-outline btn-sm">
                                My Portal
                            </Link>
                            <button onClick={logOut} className="btn btn-ghost btn-sm">
                                Logout
                            </button>
                        </>
                    ) : (
                        <>
                            <Link href="/auth/login" className="btn btn-ghost btn-sm">
                                Login
                            </Link>
                            <Link href="/auth/signup" className="btn btn-primary btn-sm">
                                Register
                            </Link>
                        </>
                    )}
                </div>

                {/* Mobile hamburger */}
                <button
                    className={styles.hamburger}
                    onClick={() => setMobileOpen(!mobileOpen)}
                    aria-label="Toggle menu"
                >
                    {mobileOpen ? <X size={24} /> : <Menu size={24} />}
                </button>
            </div>

            {/* Mobile Menu */}
            {mobileOpen && (
                <div className={styles.mobileMenu}>
                    {navLinks.map((l) => (
                        <Link
                            key={l.href}
                            href={l.href}
                            className={styles.mobileLink}
                            onClick={() => setMobileOpen(false)}
                        >
                            {l.label}
                        </Link>
                    ))}
                    <hr className="divider" />
                    {user ? (
                        <>
                            <Link href="/portal/dashboard" className="btn btn-outline btn-full" onClick={() => setMobileOpen(false)}>
                                My Portal
                            </Link>
                            <button onClick={() => { logOut(); setMobileOpen(false); }} className="btn btn-ghost btn-full">
                                Logout
                            </button>
                        </>
                    ) : (
                        <>
                            <Link href="/auth/login" className="btn btn-ghost btn-full" onClick={() => setMobileOpen(false)}>
                                Login
                            </Link>
                            <Link href="/auth/signup" className="btn btn-primary btn-full" onClick={() => setMobileOpen(false)}>
                                Register Free
                            </Link>
                        </>
                    )}
                </div>
            )}
        </header>
    );
}
