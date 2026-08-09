'use client';

import { useRouter } from 'next/navigation';
import { useTermBooking } from '@/context/TermBookingContext';
import { formatRecurrenceDays, formatTermPrice } from '@/lib/term-utils';
import { Info, FileText } from 'lucide-react';
import styles from './page.module.css';

export default function TermTermsAcceptancePage() {
    const router = useRouter();
    const { state, termClass, setTermsAccepted } = useTermBooking();

    const handleContinue = () => {
        if (!state.termsAccepted) return;
        router.push(`/book-term/${state.classId}/payment`);
    };

    const termPeriod = termClass?.termStartDate && termClass?.termEndDate
        ? `${new Date(termClass.termStartDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} – ${new Date(termClass.termEndDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
        : '...';

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
                    <span>{termClass?.name || '...'}</span>
                </div>
                <div className={styles.summaryItem}>
                    <strong>Participant:</strong>
                    <span>{state.student === 'self' ? 'Myself' : `${state.student?.firstName ?? ''} ${state.student?.lastName ?? ''}`}</span>
                </div>
                <div className={styles.summaryItem}>
                    <strong>Schedule:</strong>
                    <span>{termClass?.recurrenceDays ? formatRecurrenceDays(termClass.recurrenceDays) : '...'}</span>
                </div>
                <div className={styles.summaryItem}>
                    <strong>Term Period:</strong>
                    <span>{termPeriod}</span>
                </div>
                <div className={styles.summaryItem}>
                    <strong>Time:</strong>
                    <span>{termClass?.startTime} – {termClass?.endTime}</span>
                </div>
                <div className={styles.summaryItem}>
                    <strong>Venue:</strong>
                    <span>{termClass?.venueName || '...'}</span>
                </div>
                <div className={styles.summaryItem}>
                    <strong>Price:</strong>
                    <span className={styles.price}>{termClass?.termPrice ? formatTermPrice(termClass.termPrice) : '...'}</span>
                </div>
            </div>

            <div className={styles.termsBox}>
                <h3>Blooming Tastebuds Terms & Conditions</h3>
                <div className={styles.termsContent}>
                    <p>By checking the box below, you acknowledge and agree to the following:</p>
                    <ul>
                        <li>You have provided accurate medical information and emergency contact details.</li>
                        <li>You understand that Blooming Tastebuds operates allergen-aware kitchens but cannot guarantee an entirely allergen-free environment.</li>
                        <li>You agree to our cancellation policy for term bookings (contact us for term cancellation arrangements).</li>
                        <li>For children&apos;s sessions, you agree to drop off and collect the student promptly on each scheduled day.</li>
                        <li>This booking covers attendance on all scheduled days within the term period.</li>
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
