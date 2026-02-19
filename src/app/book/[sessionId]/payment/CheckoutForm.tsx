'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
    PaymentElement,
    useStripe,
    useElements
} from '@stripe/react-stripe-js';
import { useAuth } from '@/context/AuthContext';
import { useBooking } from '@/context/BookingContext';
import { collection, addDoc, serverTimestamp, doc, updateDoc, increment } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { CreditCard, ShieldCheck, AlertCircle, Lock } from 'lucide-react';
import styles from './page.module.css';

export default function CheckoutForm() {
    const stripe = useStripe();
    const elements = useElements();
    const router = useRouter();
    const { user, btUser } = useAuth();
    const { state } = useBooking();

    const [message, setMessage] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!stripe || !elements || !user || !btUser) return;

        setIsLoading(true);

        // 1. Confirm payment with Stripe
        const { error, paymentIntent } = await stripe.confirmPayment({
            elements,
            confirmParams: {
                return_url: `${window.location.origin}/book/${state.sessionId}/confirmation`,
            },
            redirect: 'if_required',
        });

        if (error) {
            if (error.type === 'card_error' || error.type === 'validation_error') {
                setMessage(error.message || 'An error occurred.');
            } else {
                setMessage('An unexpected error occurred.');
            }
            setIsLoading(false);
            return;
        }

        if (paymentIntent && paymentIntent.status === 'succeeded') {
            // 2. Payment Succeeded - Save booking to Firestore
            try {
                const bookingData = {
                    sessionId: state.sessionId,
                    sessionDate: state.session?.date || '',
                    className: state.session?.className || '',
                    venueName: state.session?.venueName || '',
                    bookedByUid: user.uid,
                    bookedByName: `${btUser.firstName} ${btUser.lastName}`,
                    studentId: state.studentId || user.uid, // Default to parent UID for young adults
                    studentName: state.student === 'self' ? `${btUser.firstName} ${btUser.lastName}` : `${state.student?.firstName} ${state.student?.lastName}`,
                    medicalInfo: state.medicalInfo,
                    emergencyContact: state.emergencyContact || null,
                    questionnaire: state.questionnaire || null,
                    termsAccepted: state.termsAccepted,
                    status: 'confirmed',
                    payment: {
                        amount: state.session?.price || 0,
                        currency: 'gbp',
                        status: 'paid',
                        stripePaymentIntentId: paymentIntent.id,
                    },
                    createdAt: serverTimestamp(),
                };

                const docRef = await addDoc(collection(db, 'bookings'), bookingData);

                // 3. Update session availability
                await updateDoc(doc(db, 'sessions', state.sessionId), {
                    spotsAvailable: increment(-1)
                });

                // 4. Redirect to confirmation
                router.push(`/book/${state.sessionId}/confirmation?bookingId=${docRef.id}`);
            } catch (e) {
                console.error('Error saving booking:', e);
                setMessage('Payment succeeded but we failed to save your booking. Please contact support.');
                setIsLoading(false);
            }
        }
    };

    return (
        <form id="payment-form" onSubmit={handleSubmit} className={styles.stripeForm}>
            <PaymentElement id="payment-element" options={{ layout: 'tabs' }} />

            {message && <div className="alert alert-error"><AlertCircle size={18} /> {message}</div>}

            <div className={styles.securityBox}>
                <Lock size={14} />
                <span>Secure encrypted payment via Stripe</span>
            </div>

            <button disabled={isLoading || !stripe || !elements} id="submit" className="btn btn-primary btn-full">
                {isLoading ? (
                    <div className="spinner-inline" />
                ) : (
                    `Pay £${((state.session?.price || 0) / 100).toFixed(2)} & Confirm Booking`
                )}
            </button>
        </form>
    );
}
