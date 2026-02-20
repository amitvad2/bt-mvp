'use client';

import { useState, useEffect, useMemo } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import { useBooking } from '@/context/BookingContext';
import { CreditCard, ShieldCheck } from 'lucide-react';
import CheckoutForm from './CheckoutForm';
import styles from './page.module.css';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

export default function PaymentPage() {
    const { state, loading } = useBooking();
    const [clientSecret, setClientSecret] = useState('');
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (loading) return;

        if (!state.session?.price) {
            setError('Session data is missing. Please restart your booking.');
            return;
        }

        setError(null);
        // Create PaymentIntent as soon as the page loads
        fetch('/api/payments/create-intent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionId: state.sessionId,
                studentId: state.studentId,
                amount: state.session?.price || 0,
                metadata: {
                    sessionName: state.session?.className,
                    venueName: state.session?.venueName,
                }
            }),
        })
            .then(async (res) => {
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Failed to initialize payment');
                return data;
            })
            .then((data) => setClientSecret(data.clientSecret))
            .catch(err => {
                console.error('Payment Error:', err);
                setError(err.message);
            });
    }, [state.sessionId, state.studentId, state.session?.price, loading]);

    const appearance = useMemo(() => ({
        theme: 'stripe' as const,
        variables: {
            colorPrimary: '#0066CC', // bt-accent
            fontFamily: 'Inter, sans-serif',
            borderRadius: '12px',
        },
    }), []);

    const options = useMemo(() => ({
        clientSecret,
        appearance,
    }), [clientSecret, appearance]);

    return (
        <div className={styles.container}>
            <div className={styles.sectionHeader}>
                <CreditCard className={styles.icon} size={24} strokeWidth={1.5} />
                <div>
                    <h2>Secure Payment</h2>
                    <p>Complete your booking using a secure payment method.</p>
                </div>
            </div>

            <div className={styles.amountSummary}>
                <span>Total Amount</span>
                <strong>£{((state.session?.price || 0) / 100).toFixed(2)}</strong>
            </div>

            {error ? (
                <div className="alert alert-error">
                    <strong>Payment Initialization Failed</strong>
                    <p>{error}</p>
                    <button className="btn btn-primary btn-sm" onClick={() => window.location.reload()} style={{ marginTop: '1rem' }}>
                        Retry
                    </button>
                </div>
            ) : clientSecret ? (
                <Elements options={options} stripe={stripePromise} key={clientSecret}>
                    <CheckoutForm />
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
                    <p>Your payment is secure. We use Stripe to process all transactions and never store your card details.</p>
                </div>
            </div>
        </div>
    );
}
