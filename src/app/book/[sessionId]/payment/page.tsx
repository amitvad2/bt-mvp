'use client';

import { useState, useEffect } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import { useBooking } from '@/context/BookingContext';
import { CreditCard, ShieldCheck } from 'lucide-react';
import CheckoutForm from './CheckoutForm';
import styles from './page.module.css';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

export default function PaymentPage() {
    const { state } = useBooking();
    const [clientSecret, setClientSecret] = useState('');

    useEffect(() => {
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
            .then((res) => res.json())
            .then((data) => setClientSecret(data.clientSecret));
    }, [state]);

    const appearance = {
        theme: 'stripe' as const,
        variables: {
            colorPrimary: '#0066CC', // bt-accent
            fontFamily: 'Inter, sans-serif',
            borderRadius: '12px',
        },
    };

    const options = {
        clientSecret,
        appearance,
    };

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

            {clientSecret ? (
                <Elements options={options} stripe={stripePromise}>
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
