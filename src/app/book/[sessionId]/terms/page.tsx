'use client';

import { useRouter } from 'next/navigation';
import { useBooking } from '@/context/BookingContext';
import { Check, Info, FileText, AlertCircle } from 'lucide-react';
import styles from './page.module.css';

export default function TermsAcceptancePage() {
    const router = useRouter();
    const { state, setTermsAccepted } = useBooking();

    const handleContinue = () => {
        if (!state.termsAccepted) return;
        router.push(`/book/${state.sessionId}/payment`);
    };

    const isKid = state.session?.classType === 'kidsAfterSchool';

    return (
        <div className={styles.container}>
            <div className={styles.sectionHeader}>
                <FileText className={styles.icon} />
                <div>
                    <h2>Review & Terms</h2>
                    <p>Please review your booking details and accept the terms and conditions.</p>
                </div>
            </div>

            <div className={styles.summary}>
                <div className={styles.summaryItem}>
                    <strong>Class:</strong>
                    <span>{state.session?.className}</span>
                </div>
                <div className={styles.summaryItem}>
                    <strong>Participant:</strong>
                    <span>{state.student === 'self' ? 'Myself' : `${state.student?.firstName} ${state.student?.lastName}`}</span>
                </div>
                <div className={styles.summaryItem}>
                    <strong>Date:</strong>
                    <span>{new Date(state.session?.date || '').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
                </div>
                <div className={styles.summaryItem}>
                    <strong>Venue:</strong>
                    <span>{state.session?.venueName}</span>
                </div>
                <div className={styles.summaryItem}>
                    <strong>Price:</strong>
                    <span className={styles.price}>£{((state.session?.price || 0) / 100).toFixed(2)}</span>
                </div>
            </div>

            <div className={styles.termsBox}>
                <h3>Blooming Tastebuds Terms & Conditions</h3>
                <div className={styles.termsContent}>
                    <p>By checking the box below, you acknowledge and agree to the following:</p>
                    <ul>
                        <li>You have provided accurate medical information and emergency contact details.</li>
                        <li>You understand that Blooming Tastebuds operates allergen-aware kitchens but cannot guarantee an entirely allergen-free environment.</li>
                        <li>You agree to our cancellation policy (full refund if cancelled 48+ hours before session).</li>
                        <li>For children's sessions, you agree to drop off and collect the student promptly.</li>
                    </ul>
                    <p>View the full <a href="/terms" target="_blank">Terms & Conditions</a> in a new tab.</p>
                </div>
            </div>

            <label className={styles.checkboxLabel}>
                <input
                    type="checkbox"
                    checked={state.termsAccepted || false}
                    onChange={e => setTermsAccepted(e.target.checked)}
                />
                <span>I have read and agree to the Blooming Tastebuds Terms & Conditions. <span className="required">*</span></span>
            </label>

            <div className={styles.infoBox}>
                <Info size={18} />
                <p>Your spot will be reserved once payment is completed in the next step.</p>
            </div>

            <div className={styles.actions}>
                <button type="button" className="btn btn-ghost" onClick={() => router.back()}>Back</button>
                <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleContinue}
                    disabled={!state.termsAccepted}
                >
                    Go to Payment
                </button>
            </div>
        </div>
    );
}
