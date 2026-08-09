'use client';

import React from 'react';
import { usePathname, useParams } from 'next/navigation';
import Link from 'next/link';
import { TermBookingProvider, useTermBooking } from '@/context/TermBookingContext';
import { ChefHat } from 'lucide-react';
import { BTClassType } from '@/types';
import { formatRecurrenceDays } from '@/lib/term-utils';
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
    const { state, loading, termClass, classTypeRecord } = useTermBooking();
    const pathname = usePathname();

    if (loading) return <div className="loading-screen"><div className="spinner" /></div>;

    const filteredSteps = steps.filter(s => !s.condition || s.condition(state, classTypeRecord));

    const schedule = termClass?.recurrenceDays ? formatRecurrenceDays(termClass.recurrenceDays) : '';

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
                                <strong>{termClass?.name || 'Loading...'}</strong>
                            </div>
                            <div className={styles.sessionMeta}>
                                <span>{schedule}</span>
                                <span>{termClass?.venueName}</span>
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

export default function TermBookingLayout({ children }: { children: React.ReactNode }) {
    const params = useParams();
    const classId = params?.classId as string;

    if (!classId) return null;

    return (
        <TermBookingProvider classId={classId}>
            <WizardLayoutInner>{children}</WizardLayoutInner>
        </TermBookingProvider>
    );
}
