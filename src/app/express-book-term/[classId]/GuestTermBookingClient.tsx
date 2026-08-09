'use client';

/**
 * GuestTermBookingClient — orchestrator component for the guest express term checkout wizard.
 *
 * Receives term class data and source from the server component (page.tsx) and
 * manages multi-step form navigation, error display, and API submission.
 *
 * Steps:
 *  0: ProgrammeInfoStep — programme details + "no account required" message
 *  1: ParentChildStep — parent & child details with age validation
 *  2: MedicalAllergyStep — medical, allergy, and dietary info
 *  3: EmergencyContactStep — emergency contact + authorised collector
 *  4: ConsentStep — mandatory & optional consents
 *  5: ReviewPaymentStep — summary + Stripe Payment Element
 */

import React, { useCallback, useRef, useState } from 'react';
import Link from 'next/link';
import { ChefHat } from 'lucide-react';
import { GuestTermBookingProvider, useGuestTermBooking } from './GuestTermBookingContext';
import { GuestTermClassInfo } from './types';
import ProgrammeInfoStep from './steps/ProgrammeInfoStep';
import ParentChildStep from './steps/ParentChildStep';
import MedicalAllergyStep from './steps/MedicalAllergyStep';
import EmergencyContactStep from './steps/EmergencyContactStep';
import ConsentStep from './steps/ConsentStep';
import ReviewPaymentStep from './steps/ReviewPaymentStep';
import styles from './styles/GuestTermBooking.module.css';

// Step labels for progress indicator
const STEP_LABELS = [
  'Programme',
  'Details',
  'Medical',
  'Emergency',
  'Consent',
  'Payment',
];

interface GuestTermBookingClientProps {
  termClass: GuestTermClassInfo;
  source?: string;
}

export default function GuestTermBookingClient({ termClass, source }: GuestTermBookingClientProps) {
  return (
    <GuestTermBookingProvider classId={termClass.id} termClass={termClass} source={source}>
      <GuestTermBookingWizard termClass={termClass} />
    </GuestTermBookingProvider>
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

function GuestTermBookingWizard({ termClass }: { termClass: GuestTermClassInfo }) {
  const { state, loading } = useGuestTermBooking();
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  const handleDismissError = useCallback(() => {
    setSubmissionError(null);
  }, []);

  const handleRetry = useCallback(() => {
    setSubmissionError(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const setErrorWithScroll = useCallback((error: string) => {
    setSubmissionError(error);
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
            termClass={termClass}
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
  termClass: GuestTermClassInfo;
  onError: (error: string) => void;
}

function StepRenderer({ currentStep }: StepRendererProps) {
  switch (currentStep) {
    case 0:
      return <ProgrammeInfoStep />;
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
      return <ProgrammeInfoStep />;
  }
}
