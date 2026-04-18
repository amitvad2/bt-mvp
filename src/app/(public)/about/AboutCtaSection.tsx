'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import styles from './page.module.css';

export function AboutCtaSection() {
    const { user } = useAuth();

    if (user) {
        return (
            <section className={styles.cta}>
                <div className="container">
                    <h2>Keep the Journey Going!</h2>
                    <p>Find your next cooking session and build on your skills.</p>
                    <Link href="/portal/find-class" className="btn btn-primary btn-lg">
                        Find a Class <ArrowRight size={18} />
                    </Link>
                </div>
            </section>
        );
    }

    return (
        <section className={styles.cta}>
            <div className="container">
                <h2>Ready to Join the Blooming Tastebuds Family?</h2>
                <p>Register today and book your first session in minutes.</p>
                <Link href="/auth/signup" className="btn btn-primary btn-lg">
                    Get Started <ArrowRight size={18} />
                </Link>
            </div>
        </section>
    );
}
