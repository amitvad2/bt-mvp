'use client';

/**
 * GuestBookingClient — orchestrator component for the guest express checkout wizard.
 *
 * Receives session data and source from the server component (page.tsx) and
 * manages multi-step form navigation, error display, and API submission.
 *
 * Steps:
 *  0: SessionInfoStep — session details + "no account required" message
 *  1: ParentChildStep — parent & child details with age validation
 *  2: MedicalAllergyStep — medical, allergy, and dietary info
 *  3: EmergencyContactStep — emergency contact + authorised collector
 *  4: ConsentStep — mandatory & optional consents
 *  5: ReviewPaymentStep — summary + Stripe Payment Element
 */

import React, { useCallback, useRef, useState } from 'react';
import Link from 'next/link';
import { ChefHat } from 'lucide-react';
import { GuestSessionInfo } from '@/types';
import { GuestBookingProvider, useGuestBooking } from './GuestBookingContext';
import SessionInfoStep from './steps/SessionInfoStep';
import ParentChildStep from './steps/ParentChildStep';
import MedicalAllergyStep from './steps/MedicalAllergyStep';
import EmergencyContactStep from './steps/EmergencyContactStep';
import ConsentStep from './steps/ConsentStep';
import ReviewPaymentStep from './steps/ReviewPaymentStep';
import styles from './styles/GuestBooking.module.css';

// Step labels for progress indicator
const STEP_LABELS = [
  'Session',
  'Details',
  'Medical',
  'Emergency',
  'Consent',
  'Payment',
];

interface GuestBookingClientProps {
  session: GuestSessionInfo;
  source?: string;
}

export default function GuestBookingClient({ session, source }: GuestBookingClientProps) {
  return (
    <GuestBookingProvider sessionId={session.id} session={session} source={source}>
      <GuestBookingWizard session={session} />
    </GuestBookingProvider>
  );
}

// ============================================================
// Progress Indicator
// ============================================================

function ProgressIndicator({ currentStep }: { currentStep: number }) {
  const totalSteps = STEP_LABELS.length;
  const fillPercentage = totalSteps > 1 ? (currentStep / (totalSteps - 1)) * 100 : 0;

  return (
    <div className={styles.progressContainer}>
      <div className={styles.progressBar}>
        <div className={styles.progressTrack} />
        <div
          className={styles.progressFill}
          style={{ width: `${fillPercentage}%` }}
        />
        {STEP_LABELS.map((label, idx) => {
          const isCompleted = idx < currentStep;
          const isActive = idx === currentStep;

          const dotClass = [
            styles.progressDot,
            isActive ? styles.progressDotActive : '',
            isCompleted ? styles.progressDotCompleted : '',
          ].filter(Boolean).join(' ');

          const labelClass = [
            styles.progressLabel,
            isActive ? styles.progressLabelActive : '',
            isCompleted ? styles.progressLabelCompleted : '',
          ].filter(Boolean).join(' ');

          return (
            <div key={idx} className={styles.progressStep}>
              <div className={dotClass}>
                {isCompleted ? '✓' : idx + 1}
              </div>
              <span className={labelClass}>{label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// Error Banner
// ============================================================

interface ErrorBannerProps {
  error: string | null;
  onDismiss: () => void;
  onRetry?: () => void;
}

function ErrorBanner({ error, onDismiss, onRetry }: ErrorBannerProps) {
  if (!error) return null;

  return (
    <div className={styles.errorPage} role="alert" aria-live="assertive" style={{ padding: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
      <div className={styles.errorTitle}>Something went wrong</div>
      <p className={styles.errorMessage}>{error}</p>
      <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-3)' }}>
        {onRetry && (
          <button className={styles.btnPrimary} onClick={onRetry} type="button">
            Try Again
          </button>
        )}
        <button className={styles.btnSecondary} onClick={onDismiss} type="button">
          Dismiss
        </button>
      </div>
    </div>
  );
}

// ============================================================
// Main Wizard Content
// ============================================================

function GuestBookingWizard({ session }: { session: GuestSessionInfo }) {
  const { state, loading } = useGuestBooking();
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  const handleDismissError = useCallback(() => {
    setSubmissionError(null);
  }, []);

  const handleRetry = useCallback(() => {
    setSubmissionError(null);
    // Retry scrolls back to the top where the form can be resubmitted
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // Scroll to error when it appears
  const setErrorWithScroll = useCallback((error: string) => {
    setSubmissionError(error);
    // Use requestAnimationFrame to ensure DOM has updated before scrolling
    requestAnimationFrame(() => {
      errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, []);

  if (loading) {
    return (
      <div className={styles.wrapper}>
        <div className={styles.container}>
          <div className={styles.loading}>
            <div className={styles.spinner} />
            <p>Loading your booking...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      <header className={styles.siteHeader}>
        <Link href="/" className={styles.siteHeaderLogo}>
          <ChefHat size={24} strokeWidth={1.5} />
          <span>Blooming Tastebuds</span>
        </Link>
        <Link href="/" className={styles.siteHeaderLink}>
          ← Back to website
        </Link>
      </header>
      <div className={styles.container}>
        {/* Error banner at the top */}
        <div ref={errorRef}>
          <ErrorBanner
            error={submissionError}
            onDismiss={handleDismissError}
            onRetry={handleRetry}
          />
        </div>

        {/* Progress indicator */}
        <ProgressIndicator currentStep={state.currentStep} />

        {/* Step content */}
        <div className={styles.formContainer}>
          <StepRenderer
            currentStep={state.currentStep}
            session={session}
            onError={setErrorWithScroll}
          />
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Step Renderer — conditionally renders step components
// ============================================================

interface StepRendererProps {
  currentStep: number;
  session: GuestSessionInfo;
  onError: (error: string) => void;
}

function StepRenderer({ currentStep, session, onError }: StepRendererProps) {
  switch (currentStep) {
    case 0:
      return <SessionInfoStep />;
    case 1:
      return <ParentChildStep />;
    case 2:
      return <MedicalAllergyStep />;
    case 3:
      return <EmergencyContactStep />;
    case 4:
      return <ConsentStep />;
    case 5:
      return <ReviewPaymentStep />;
    default:
      return <StepPlaceholder step={currentStep} title="Unknown Step" />;
  }
}

// ============================================================
// Placeholder Components (replaced by real steps in task 7.x)
// ============================================================

function StepPlaceholder({ step, title }: { step: number; title: string }) {
  const { goToStep } = useGuestBooking();

  return (
    <div>
      <div className={styles.formHeader}>
        <div>
          <h2 className={styles.formTitle}>{title}</h2>
          <p className={styles.formSubtitle}>Step {step + 1} of 6 — Coming soon</p>
        </div>
      </div>

      <p style={{ color: 'var(--bt-gray-500)', textAlign: 'center', padding: 'var(--space-8) 0' }}>
        This step will be implemented in a future task.
      </p>

      <div className={styles.actions}>
        <button
          className={styles.btnSecondary}
          onClick={() => goToStep(step - 1)}
          type="button"
        >
          ← Back
        </button>
        {step < 5 && (
          <button
            className={styles.btnPrimary}
            onClick={() => goToStep(step + 1)}
            type="button"
          >
            Continue →
          </button>
        )}
      </div>
    </div>
  );
}
