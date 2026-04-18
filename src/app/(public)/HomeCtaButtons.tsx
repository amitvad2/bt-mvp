'use client';

import Link from 'next/link';
import { ArrowRight, Flame } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import styles from './page.module.css';

export function HeroCtas() {
    const { user, loading } = useAuth();

    return (
        <div className={styles.heroCtas}>
            <Link href={user ? '/portal/find-class' : '/classes'} className={styles.ctaPrimary}>
                <Flame size={20} /> Book a Class
            </Link>
            {user ? (
                <Link href="/portal/dashboard" className={styles.ctaSecondary}>
                    My Portal <ArrowRight size={18} />
                </Link>
            ) : !loading ? (
                <Link href="/auth/signup" className={styles.ctaSecondary}>
                    Register Free <ArrowRight size={18} />
                </Link>
            ) : null}
        </div>
    );
}

export function BannerCtas() {
    const { user, loading } = useAuth();

    return (
        <div className={styles.heroCtas}>
            {user ? (
                <>
                    <Link href="/portal/find-class" className={styles.ctaPrimary}>
                        Find a Class <ArrowRight size={18} />
                    </Link>
                    <Link href="/portal/dashboard" className={styles.ctaSecondary}>
                        My Portal
                    </Link>
                </>
            ) : !loading ? (
                <>
                    <Link href="/classes" className={styles.ctaPrimary}>
                        Find a Class <ArrowRight size={18} />
                    </Link>
                    <Link href="/auth/signup" className={styles.ctaSecondary}>
                        Register Free
                    </Link>
                </>
            ) : null}
        </div>
    );
}
