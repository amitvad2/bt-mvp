'use client';

import { useRouter } from 'next/navigation';
import { useBundleBooking } from '@/context/BundleBookingContext';
import { FileText, Info } from 'lucide-react';
import styles from './page.module.css';

export default function BundleTermsPage() {
    const router = useRouter();
    const { state, setTermsAccepted } = useBundleBooking();

    const handleContinue = () => {
        if (!state.termsAccepted) return;
        router.push(`/book/bundle/${state.bundleId}/payment`);
    };

    return (
        <div className={styles.container}>
            <div className={styles.sectionHeader}>
                <FileText className={styles.icon} />
                <div>
                    <h2>Review & Terms</h2>
                    <p>Please review your bundle booking details and accept the terms and conditions.</p>
                </div>
            </div>

            <div className={styles.summary}>
                <div className={styles.summaryItem}>
                    <strong>Bundle:</strong>
                    <span>{state.bundle?.name}</span>
                </div>
                <div className={styles.summaryItem}>
                    <strong>Class:</strong>
                    <span>{state.bundle?.className}</span>
                </div>
                <div className={styles.summaryItem}>
                    <strong>Sessions:</strong>
                    <span>{state.bundle?.sessionIds.length} sessions</span>
                </div>
                <div className={styles.summaryItem}>
                    <strong>Participant:</strong>
                    <span>{state.student === 'self' ? 'Myself' : `${state.student?.firstName} ${state.student?.lastName}`}</span>
                </div>
                <div className={styles.summaryItem}>
                    <strong>Venue:</strong>
                    <span>{state.bundle?.venueName}</span>
                </div>
                <div className={styles.summaryItem}>
                    <strong>Bundle Price:</strong>
                    <span className={styles.price}>£{((state.bundle?.bundlePrice || 0) / 100).toFixed(2)}</span>
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
                        <li>For children&apos;s sessions, you agree to drop off and collect the student promptly.</li>
                        <li>Bundle bookings cover all sessions included in the package. Cancellation applies to the entire bundle.</li>
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
                <p>Your spots will be reserved once payment is completed in the next step.</p>
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
