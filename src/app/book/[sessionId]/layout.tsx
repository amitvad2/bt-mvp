'use client';

import React, { use } from 'react';
import { usePathname } from 'next/navigation';
import { BookingProvider, useBooking } from '@/context/BookingContext';
import { ChefHat } from 'lucide-react';
import styles from './layout.module.css';

const steps = [
    { id: 'student', label: 'Student', path: '/student' },
    { id: 'medical', label: 'Medical', path: '/medical' },
    { id: 'questionnaire', label: 'Questions', path: '/questionnaire', condition: (state: any) => state.session?.classType === 'kidsAfterSchool' },
    { id: 'terms', label: 'Terms', path: '/terms' },
    { id: 'payment', label: 'Payment', path: '/payment' },
    { id: 'confirmation', label: 'Done', path: '/confirmation' },
];

function WizardLayoutInner({ children }: { children: React.ReactNode }) {
    const { state, loading } = useBooking();
    const pathname = usePathname();

    if (loading) return <div className="loading-screen"><div className="spinner" /></div>;

    const filteredSteps = steps.filter(s => !s.condition || s.condition(state));

    const sessionDate = state.session?.date ? new Date(state.session.date) : null;
    const dateString = sessionDate && !isNaN(sessionDate.getTime())
        ? sessionDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
        : '...';

    return (
        <div className={styles.wrapper}>
            <header className={styles.header}>
                <div className="container">
                    <div className={styles.headerInner}>
                        <div className={styles.brand}>
                            <ChefHat size={20} strokeWidth={1.5} className={styles.logoIcon} />
                            <span>Blooming Tastebuds — Checkout</span>
                        </div>
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

export default function BookingLayout({ params, children }: { params: Promise<{ sessionId: string }>; children: React.ReactNode }) {
    const { sessionId } = use(params);
    return (
        <BookingProvider sessionId={sessionId}>
            <WizardLayoutInner>{children}</WizardLayoutInner>
        </BookingProvider>
    );
}
