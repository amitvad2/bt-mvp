'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import { useBundleBooking } from '@/context/BundleBookingContext';
import { useAuth } from '@/context/AuthContext';
import { Student } from '@/types';
import { CreditCard, ShieldCheck, AlertCircle, CalendarX } from 'lucide-react';
import BundleCheckoutForm from './BundleCheckoutForm';
import styles from './page.module.css';

const stripeKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
if (!stripeKey) {
    console.warn('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is missing!');
}
const stripePromise = loadStripe(stripeKey || '');

interface FullSession {
    sessionId: string;
    date: string;
}

export default function BundlePaymentPage() {
    const { state, loading: bookingLoading } = useBundleBooking();
    const { user, btUser, loading: authLoading } = useAuth();

    const [clientSecret, setClientSecret] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [fullSessions, setFullSessions] = useState<FullSession[]>([]);
    // Prevent React Strict Mode double-invoke from creating two PaymentIntents
    const intentCreated = useRef(false);

    // Wait until both the booking context and auth are ready
    const isReady = !bookingLoading && !authLoading && !!user && !!btUser;

    useEffect(() => {
        if (!isReady || intentCreated.current) return;
        intentCreated.current = true;

        if (!state.bundle?.bundlePrice) {
            setError('Bundle data is missing. Please go back and restart your booking.');
            return;
        }

        if (!state.termsAccepted) {
            setError('Terms and conditions must be accepted before payment.');
            return;
        }

        setError(null);
        setFullSessions([]);

        const bundle = state.bundle!;
        const studentName =
            state.student === 'self'
                ? `${btUser.firstName} ${btUser.lastName}`
                : `${(state.student as Student)?.firstName ?? ''} ${(state.student as Student)?.lastName ?? ''}`.trim();

        const createIntent = async () => {
            const idToken = await user.getIdToken();

            const res = await fetch('/api/payments/create-intent', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`,
                },
                body: JSON.stringify({
                    bundleId: state.bundleId,
                    bookedByName: `${btUser.firstName} ${btUser.lastName}`,
                    bookedByEmail: user.email,
                    studentId: state.studentId ?? null,
                    studentName,
                    medicalInfo: state.medicalInfo ?? null,
                    emergencyContact: state.emergencyContact ?? null,
                    questionnaire: state.questionnaire ?? null,
                    termsAccepted: state.termsAccepted,
                }),
            });

            const data = await res.json();

            if (res.status === 400 && data.fullSessions) {
                // Sessions are full — display which ones and prevent payment
                setFullSessions(data.fullSessions);
                setError(data.error || 'Some sessions in this bundle are fully booked.');
                return;
            }

            if (!res.ok) {
                throw new Error(data.error || 'Failed to initialise payment');
            }

            console.log('Bundle payment initialised. PI prefix:', data.clientSecret?.substring(0, 10));
            setClientSecret(data.clientSecret);
        };

        createIntent().catch((err) => {
            console.error('Bundle payment init error:', err);
            setError(err.message);
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isReady]);

    const appearance = useMemo(() => ({
        theme: 'stripe' as const,
        variables: {
            colorPrimary: '#0066CC',
            fontFamily: 'Inter, sans-serif',
            borderRadius: '12px',
        },
    }), []);

    const options = useMemo(() => ({
        clientSecret,
        appearance,
    }), [clientSecret, appearance]);

    // Format a YYYY-MM-DD date string for display
    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr + 'T00:00:00');
        return date.toLocaleDateString('en-GB', {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
            year: 'numeric',
        });
    };

    return (
        <div className={styles.container}>
            <div className={styles.sectionHeader}>
                <CreditCard className={styles.icon} size={24} strokeWidth={1.5} />
                <div>
                    <h2>Secure Payment</h2>
                    <p>Complete your bundle booking using a secure payment method.</p>
                </div>
            </div>

            <div className={styles.amountSummary}>
                <span>Total Amount</span>
                <strong>£{((state.bundle?.bundlePrice || 0) / 100).toFixed(2)}</strong>
            </div>

            {!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY && (
                <div className="alert alert-warning" style={{ margin: '1rem 0' }}>
                    <strong>Configuration Missing:</strong> NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not
                    defined. Add it to your environment variables.
                </div>
            )}

            {/* Full sessions error — sessions with no spots remaining */}
            {fullSessions.length > 0 && (
                <div className={styles.fullSessionsError}>
                    <h3><AlertCircle size={20} /> Sessions Fully Booked</h3>
                    <p>
                        The following sessions in this bundle no longer have availability.
                        Payment cannot proceed until spots become available.
                    </p>
                    <ul className={styles.fullSessionsList}>
                        {fullSessions.map((s) => (
                            <li key={s.sessionId}>
                                <CalendarX size={16} />
                                {formatDate(s.date)}
                            </li>
                        ))}
                    </ul>
                    <div className={styles.actions}>
                        <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => window.history.back()}
                        >
                            Go Back
                        </button>
                    </div>
                </div>
            )}

            {/* General error (not full-sessions specific) */}
            {error && fullSessions.length === 0 && (
                <div className="alert alert-error">
                    <strong>Payment Initialisation Failed</strong>
                    <p>{error}</p>
                    <button
                        className="btn btn-primary btn-sm"
                        onClick={() => window.location.reload()}
                        style={{ marginTop: '1rem' }}
                    >
                        Retry
                    </button>
                </div>
            )}

            {/* Stripe Elements checkout form */}
            {!error && clientSecret ? (
                <Elements options={options} stripe={stripePromise} key={clientSecret}>
                    <BundleCheckoutForm />
                </Elements>
            ) : !error && !fullSessions.length ? (
                <div className={styles.loading}>
                    <div className="spinner-inline" />
                    <p>Initialising secure checkout...</p>
                </div>
            ) : null}

            <div className={styles.guarantee}>
                <ShieldCheck size={24} strokeWidth={1.5} />
                <div>
                    <strong>Secure Checkout</strong>
                    <p>
                        Your payment is processed by Stripe. We never store your card details.
                    </p>
                </div>
            </div>
        </div>
    );
}
