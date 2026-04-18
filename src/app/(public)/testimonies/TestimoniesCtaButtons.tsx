'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import styles from './page.module.css';

export function TestimoniesCtaButtons() {
    const { user } = useAuth();

    if (user) {
        return (
            <div className={styles.ctaButtons}>
                <Link href="/portal/find-class" className="btn btn-primary btn-lg">
                    Find a Class <ArrowRight size={18} />
                </Link>
                <Link href="/portal/dashboard" className="btn btn-ghost btn-lg">
                    My Portal
                </Link>
            </div>
        );
    }

    return (
        <div className={styles.ctaButtons}>
            <Link href="/auth/signup" className="btn btn-primary btn-lg">
                Register Now
            </Link>
            <Link href="/classes" className="btn btn-ghost btn-lg">
                Find a Class <ArrowRight size={18} />
            </Link>
        </div>
    );
}
