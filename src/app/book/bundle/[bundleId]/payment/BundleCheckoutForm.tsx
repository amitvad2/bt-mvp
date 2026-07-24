'use client';

/**
 * BundleCheckoutForm — Stripe PaymentElement UI for bundle bookings.
 *
 * After payment confirms, this component redirects to the bundle confirmation
 * page with ?payment_intent=<id> so the confirmation page can poll Firestore
 * for the webhook-created booking documents.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    PaymentElement,
    useStripe,
    useElements,
} from '@stripe/react-stripe-js';
import { useBundleBooking } from '@/context/BundleBookingContext';
import { AlertCircle, Lock } from 'lucide-react';
import styles from './page.module.css';

export default function BundleCheckoutForm() {
    const stripe = useStripe();
    const elements = useElements();
    const router = useRouter();
    const { state } = useBundleBooking();

    const [message, setMessage] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isReady, setIsReady] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!stripe || !elements) return;

        setIsLoading(true);
        setMessage(null);

        const { error, paymentIntent } = await stripe.confirmPayment({
            elements,
            confirmParams: {
                // Stripe appends ?payment_intent=pi_xxx&redirect_status=succeeded
                return_url: `${window.location.origin}/book/bundle/${state.bundleId}/confirmation`,
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
            // Payment confirmed inline (no browser redirect needed).
            // Navigate to confirmation page — the webhook will create the
            // bookings asynchronously. Confirmation page polls Firestore.
            router.push(
                `/book/bundle/${state.bundleId}/confirmation?payment_intent=${paymentIntent.id}`
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
                    `Pay £${((state.bundle?.bundlePrice || 0) / 100).toFixed(2)} & Confirm Bundle`
                )}
            </button>
        </form>
    );
}
