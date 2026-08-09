'use client';

/**
 * TermCheckoutForm — Stripe PaymentElement for term bookings.
 *
 * After payment confirms, redirects to the term confirmation page
 * with ?payment_intent=<id> so it can poll for the booking document.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    PaymentElement,
    useStripe,
    useElements,
} from '@stripe/react-stripe-js';
import { useTermBooking } from '@/context/TermBookingContext';
import { AlertCircle, Lock } from 'lucide-react';
import styles from './page.module.css';

export default function TermCheckoutForm() {
    const stripe = useStripe();
    const elements = useElements();
    const router = useRouter();
    const { state, termClass } = useTermBooking();

    const [message, setMessage] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isReady, setIsReady] = useState(false);

    const termPrice = termClass?.termPrice || 0;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!stripe || !elements) return;

        setIsLoading(true);
        setMessage(null);

        const { error, paymentIntent } = await stripe.confirmPayment({
            elements,
            confirmParams: {
                return_url: `${window.location.origin}/book-term/${state.classId}/confirmation`,
            },
            redirect: 'if_required',
        });

        if (error) {
            if (
                error.type === 'card_error' ||
                error.type === 'validation_error'
            ) {
                setMessage(error.message || 'Your payment was declined.');
            } else {
                setMessage(
                    'An unexpected error occurred. Please try again or contact support.'
                );
            }
            setIsLoading(false);
            return;
        }

        if (paymentIntent && paymentIntent.status === 'succeeded') {
            router.push(
                `/book-term/${state.classId}/confirmation?payment_intent=${paymentIntent.id}`
            );
            return;
        }

        setMessage('Payment status is unclear. Please check your email or contact support.');
        setIsLoading(false);
    };

    return (
        <form id="payment-form" onSubmit={handleSubmit} className={styles.stripeForm}>
            <div className={styles.stripeContainer}>
                <PaymentElement
                    id="payment-element"
                    options={{ layout: 'tabs' }}
                    onReady={() => setIsReady(true)}
                    onLoadError={(e) => {
                        console.error('Stripe PaymentElement load error:', e);
                        setMessage(
                            `Payment form failed to load: ${e.error?.message || 'Unknown error'}. ` +
                            `Please refresh the page.`
                        );
                    }}
                />
            </div>

            {message && (
                <div className="alert alert-error">
                    <AlertCircle size={18} /> {message}
                </div>
            )}

            <div className={styles.securityBox}>
                <Lock size={14} />
                <span>Secure encrypted payment via Stripe</span>
            </div>

            <button
                disabled={isLoading || !stripe || !elements || !isReady}
                id="submit"
                className="btn btn-primary btn-full"
            >
                {isLoading ? (
                    <div className="spinner-inline" />
                ) : (
                    `Pay £${(termPrice / 100).toFixed(2)} & Confirm Booking`
                )}
            </button>
        </form>
    );
}
