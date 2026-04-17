'use client';

/**
 * CheckoutForm — Stripe PaymentElement UI only.
 *
 * Booking creation, capacity decrement, student profile update, and email
 * sending have all moved to the server-side Stripe webhook handler at
 * /api/webhooks/stripe.
 *
 * After payment confirms, this component redirects to the confirmation page
 * with ?payment_intent=<id> so the confirmation page can poll Firestore for
 * the webhook-created booking document.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    PaymentElement,
    useStripe,
    useElements,
} from '@stripe/react-stripe-js';
import { useBooking } from '@/context/BookingContext';
import { CreditCard, AlertCircle, Lock } from 'lucide-react';
import styles from './page.module.css';

export default function CheckoutForm() {
    const stripe = useStripe();
    const elements = useElements();
    const router = useRouter();
    const { state } = useBooking();

    const [message, setMessage] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isReady, setIsReady] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!stripe || !elements) return;

        setIsLoading(true);
        setMessage(null);

        // Stripe will redirect to return_url if the payment method requires it
        // (e.g. 3D Secure, bank redirects). For inline methods (card), the
        // payment completes here and paymentIntent is returned directly.
        //
        // In both cases the confirmation page reads ?payment_intent=pi_xxx
        // (Stripe appends it on redirect; we append it manually for inline).
        const { error, paymentIntent } = await stripe.confirmPayment({
            elements,
            confirmParams: {
                // Stripe appends ?payment_intent=pi_xxx&redirect_status=succeeded
                return_url: `${window.location.origin}/book/${state.sessionId}/confirmation`,
            },
            redirect: 'if_required',
        });

        if (error) {
            // Only surface card/validation errors to the user
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
            // Payment confirmed inline (no browser redirect needed).
            // Navigate to confirmation page — the webhook will create the
            // booking asynchronously. Confirmation page polls Firestore.
            router.push(
                `/book/${state.sessionId}/confirmation?payment_intent=${paymentIntent.id}`
            );
            return;
        }

        // Should not reach here under normal conditions with redirect: 'if_required'
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
                    `Pay £${((state.session?.price || 0) / 100).toFixed(2)} & Confirm Booking`
                )}
            </button>
        </form>
    );
}
