'use client';

import React, { useEffect, useState } from 'react';
import { usePathname, useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { BookingProvider, useBooking } from '@/context/BookingContext';
import { ChefHat } from 'lucide-react';
import { BTClassType } from '@/types';
import styles from './layout.module.css';

const steps = [
    { id: 'student', label: 'Student', path: '/student' },
    { id: 'medical', label: 'Medical', path: '/medical' },
    { id: 'questionnaire', label: 'Questions', path: '/questionnaire', condition: (_state: any, classTypeRecord: BTClassType | null) => classTypeRecord === null || classTypeRecord.skipQuestionnaire === false },
    { id: 'terms', label: 'Terms', path: '/terms' },
    { id: 'payment', label: 'Payment', path: '/payment' },
    { id: 'confirmation', label: 'Done', path: '/confirmation' },
];

function WizardLayoutInner({ children }: { children: React.ReactNode }) {
    const { state, loading, classTypeRecord } = useBooking();
    const pathname = usePathname();
    const router = useRouter();
    const [termCheckComplete, setTermCheckComplete] = useState(false);

    // Guard: block per-session booking for sessions belonging to term classes.
    // After the session is loaded, fetch the parent class and check if it's a term class.
    useEffect(() => {
        if (loading || !state.session?.classId) return;

        const classId = state.session.classId;

        const checkTermClass = async () => {
            try {
                // Skip this check for term sessions (sessionType === 'term') —
                // they ARE meant to be booked via this wizard.
                if (state.session?.sessionType === 'term') {
                    setTermCheckComplete(true);
                    return;
                }

                const classDoc = await getDoc(doc(db, 'classes', classId));
                if (classDoc.exists()) {
                    const classData = classDoc.data();
                    if (classData.commitment === 'term') {
                        router.replace('/classes?error=term-session-not-bookable');
                        return;
                    }
                }
            } catch (e) {
                console.error('Error checking parent class commitment:', e);
            }
            setTermCheckComplete(true);
        };

        checkTermClass();
    }, [loading, state.session, router]);

    if (loading || !termCheckComplete) return <div className="loading-screen"><div className="spinner" /></div>;

    const filteredSteps = steps.filter(s => !s.condition || s.condition(state, classTypeRecord));

    const sessionDate = state.session?.date ? new Date(state.session.date) : null;
    const dateString = sessionDate && !isNaN(sessionDate.getTime())
        ? sessionDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
        : '...';

    return (
        <div className={styles.wrapper}>
            <header className={styles.header}>
                <div className="container">
                    <div className={styles.headerInner}>
                        <Link href="/" className={styles.brand} style={{ textDecoration: 'none', color: 'inherit' }}>
                            <ChefHat size={20} strokeWidth={1.5} className={styles.logoIcon} />
                            <span>Blooming Tastebuds — Checkout</span>
                        </Link>
                        <div className={styles.sessionSummary}>
                            <div className={styles.sessionMain}>
                                <strong>{state.session?.className || 'Loading...'}</strong>
                            </div>
                            <div className={styles.sessionMeta}>
                                <span>{dateString}</span>
                                <span>{state.session?.venueName}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            <div className={styles.progress}>
                <div className="container">
                    <div className={styles.steps}>
                        {filteredSteps.map((step, idx) => {
                            const isCompleted = filteredSteps.findIndex(s => pathname.includes(s.path)) > idx;
                            const isActive = pathname.includes(step.path);
                            return (
                                <div key={step.id} className={`${styles.step} ${isActive ? styles.active : ''} ${isCompleted ? styles.completed : ''}`}>
                                    <div className={styles.stepCircle}>{isCompleted ? '✓' : idx + 1}</div>
                                    <span className={styles.stepLabel}>{step.label}</span>
                                    {idx < filteredSteps.length - 1 && <div className={styles.stepArrow} />}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            <main className={styles.main}>
                <div className="container-sm">
                    <div className={styles.card}>
                        {children}
                    </div>
                </div>
            </main>
        </div>
    );
}

export default function BookingLayout({ children }: { children: React.ReactNode }) {
    const params = useParams();
    const sessionId = params?.sessionId as string;
    
    if (!sessionId) return null;

    return (
        <BookingProvider sessionId={sessionId}>
            <WizardLayoutInner>{children}</WizardLayoutInner>
        </BookingProvider>
    );
}
