'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import { useTermBooking } from '@/context/TermBookingContext';
import { useAuth } from '@/context/AuthContext';
import { Student } from '@/types';
import { CreditCard, ShieldCheck } from 'lucide-react';
import TermCheckoutForm from './TermCheckoutForm';
import styles from './page.module.css';

const stripeKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
if (!stripeKey) {
    console.warn('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is missing!');
}
const stripePromise = loadStripe(stripeKey || '');

export default function TermPaymentPage() {
    const { state, termClass, loading: bookingLoading } = useTermBooking();
    const { user, btUser, loading: authLoading } = useAuth();

    const [clientSecret, setClientSecret] = useState('');
    const [error, setError] = useState<string | null>(null);
    const intentCreated = useRef(false);

    const isReady = !bookingLoading && !authLoading && !!user && !!btUser;

    useEffect(() => {
        if (!isReady || intentCreated.current) return;
        intentCreated.current = true;

        if (!termClass?.termPrice) {
            setError('Class data is missing. Please go back and restart your booking.');
            return;
        }

        if (!state.termsAccepted) {
            setError('Terms and conditions must be accepted before payment.');
            return;
        }

        setError(null);

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
                    // Term booking indicator
                    bookingType: 'term',
                    classId: state.classId,
                    className: termClass.name,
                    classType: termClass.type,
                    venueName: termClass.venueName || '',
                    startTime: termClass.startTime,
                    endTime: termClass.endTime,
                    recurrenceDays: termClass.recurrenceDays,
                    termStartDate: termClass.termStartDate,
                    termEndDate: termClass.termEndDate,
                    // User display fields
                    bookedByName: `${btUser.firstName} ${btUser.lastName}`,
                    bookedByEmail: user.email,
                    // Student
                    studentId: state.studentId ?? null,
                    studentName,
                    // Booking data
                    medicalInfo: state.medicalInfo ?? null,
                    emergencyContact: state.emergencyContact ?? null,
                    questionnaire: state.questionnaire ?? null,
                    termsAccepted: state.termsAccepted,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to initialise payment');
            console.log('Payment initialised. PI prefix:', data.clientSecret?.substring(0, 10));
            setClientSecret(data.clientSecret);
        };

        createIntent().catch((err) => {
            console.error('Payment init error:', err);
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

    const termPrice = termClass?.termPrice || 0;

    return (
        <div className={styles.container}>
            <div className={styles.sectionHeader}>
                <CreditCard className={styles.icon} size={24} strokeWidth={1.5} />
                <div>
                    <h2>Secure Payment</h2>
                    <p>Complete your term booking using a secure payment method.</p>
                </div>
            </div>

            <div className={styles.amountSummary}>
                <span>Total Amount (Full Programme)</span>
                <strong>£{(termPrice / 100).toFixed(2)}</strong>
            </div>

            {!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY && (
                <div className="alert alert-warning" style={{ margin: '1rem 0' }}>
                    <strong>Configuration Missing:</strong> NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not
                    defined. Add it to your environment variables.
                </div>
            )}

            {error ? (
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
            ) : clientSecret ? (
                <Elements options={options} stripe={stripePromise} key={clientSecret}>
                    <TermCheckoutForm />
                </Elements>
            ) : (
                <div className={styles.loading}>
                    <div className="spinner-inline" />
                    <p>Initialising secure checkout...</p>
                </div>
            )}

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
