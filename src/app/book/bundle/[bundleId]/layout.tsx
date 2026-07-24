'use client';

import React from 'react';
import { usePathname, useParams } from 'next/navigation';
import Link from 'next/link';
import { BundleBookingProvider, useBundleBooking } from '@/context/BundleBookingContext';
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

function BundleWizardLayoutInner({ children }: { children: React.ReactNode }) {
    const { state, loading, classTypeRecord } = useBundleBooking();
    const pathname = usePathname();

    if (loading) return <div className="loading-screen"><div className="spinner" /></div>;

    const filteredSteps = steps.filter(s => !s.condition || s.condition(state, classTypeRecord));

    return (
        <div className={styles.wrapper}>
            <header className={styles.header}>
                <div className="container">
                    <div className={styles.headerInner}>
                        <Link href="/" className={styles.brand} style={{ textDecoration: 'none', color: 'inherit' }}>
                            <ChefHat size={20} strokeWidth={1.5} className={styles.logoIcon} />
                            <span>Blooming Tastebuds — Bundle Checkout</span>
                        </Link>
                        <div className={styles.sessionSummary}>
                            <div className={styles.sessionMain}>
                                <strong>{state.bundle?.name || 'Loading...'}</strong>
                            </div>
                            <div className={styles.sessionMeta}>
                                <span>{state.sessions?.length ? `${state.sessions.length} sessions` : '...'}</span>
                                <span>{state.bundle?.venueName}</span>
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

export default function BundleBookingLayout({ children }: { children: React.ReactNode }) {
    const params = useParams();
    const bundleId = params?.bundleId as string;

    if (!bundleId) return null;

    return (
        <BundleBookingProvider bundleId={bundleId}>
            <BundleWizardLayoutInner>{children}</BundleWizardLayoutInner>
        </BundleBookingProvider>
    );
}
