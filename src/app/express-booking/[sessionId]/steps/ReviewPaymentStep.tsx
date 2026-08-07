'use client';

/**
 * ReviewPaymentStep (Step 5) — Displays a full summary of all entered data
 * and gates the Stripe Payment Element behind validation conditions.
 *
 * Validates: GUEST-FR-007 (7.1–7.4), GUEST-FR-015 (15.1–15.4), GUEST-FR-019 (21.1)
 */

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';
import { useGuestBooking } from '../GuestBookingContext';
import styles from '../styles/Steps.module.css';

// ============================================================
// Stripe setup
// ============================================================

const stripeKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
if (!stripeKey) {
  console.warn('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is missing!');
}
const stripePromise = loadStripe(stripeKey || '');

// ============================================================
// Turnstile site key
// ============================================================

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '';

// ============================================================
// Constants
// ============================================================

const TERMS_VERSION = '1.0';
const PRIVACY_NOTICE_VERSION = '1.0';

// ============================================================
// Helper: calculate age at session date
// ============================================================

function calculateAge(dob: string, sessionDate: string): number {
  const birth = new Date(dob);
  const session = new Date(sessionDate);
  let age = session.getFullYear() - birth.getFullYear();
  const monthDiff = session.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && session.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

// ============================================================
// Payment gating conditions
// ============================================================

interface GatingResult {
  canPay: boolean;
  reasons: string[];
}

function usePaymentGating(): GatingResult {
  const { state } = useGuestBooking();
  const reasons: string[] = [];

  // Check parent details
  if (!state.parentDetails?.firstName || !state.parentDetails?.lastName ||
      !state.parentDetails?.email || !state.parentDetails?.telephone) {
    reasons.push('Parent details are incomplete.');
  }

  // Check child details
  if (!state.childDetails?.firstName || !state.childDetails?.lastName ||
      !state.childDetails?.dateOfBirth) {
    reasons.push('Child details are incomplete.');
  }

  // Check medical info
  if (!state.medicalInfo) {
    reasons.push('Medical information has not been provided.');
  }

  // Check allergy/dietary info
  if (!state.allergyDietaryInfo) {
    reasons.push('Allergy and dietary information has not been provided.');
  }

  // Check emergency contact
  if (!state.emergencyContact?.name || !state.emergencyContact?.relationship ||
      !state.emergencyContact?.mobile || !state.emergencyContact?.email) {
    reasons.push('Emergency contact details are incomplete.');
  }

  // Check authorised collector
  if (!state.authorisedCollector?.name || !state.authorisedCollector?.relationship ||
      !state.authorisedCollector?.phone) {
    reasons.push('Authorised collector details are incomplete.');
  }

  // Check mandatory consents
  const mandatoryConsentKeys = [
    'parentGuardianAuthority',
    'accuracyOfInformation',
    'healthSafetyDataProcessing',
    'emergencyAssistanceAuthorisation',
    'termsAndCancellationPolicy',
    'privacyNoticeAcknowledgement',
  ] as const;

  if (!state.consents) {
    reasons.push('Consents have not been provided.');
  } else {
    const allMandatory = mandatoryConsentKeys.every(
      (k) => state.consents![k] === true
    );
    if (!allMandatory) {
      reasons.push('Not all mandatory consents have been accepted.');
    }
  }

  // Check session status
  if (state.session) {
    if (state.session.status !== 'open') {
      reasons.push('This session is no longer open for bookings.');
    }
    if (state.session.spotsAvailable <= 0) {
      reasons.push('This session is fully booked (no spots available).');
    }
    // Check child age validity
    if (state.childDetails?.dateOfBirth) {
      const age = calculateAge(state.childDetails.dateOfBirth, state.session.date);
      if (age < state.session.ageMin || age > state.session.ageMax) {
        reasons.push(
          `Child's age (${age}) is outside the eligible range (${state.session.ageMin}–${state.session.ageMax}).`
        );
      }
    }
  }

  return { canPay: reasons.length === 0, reasons };
}

// ============================================================
// Main ReviewPaymentStep Component
// ============================================================

export default function ReviewPaymentStep() {
  const { state, goToStep } = useGuestBooking();
  const { canPay, reasons } = usePaymentGating();
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const intentCreated = useRef(false);
  const turnstileRef = useRef<HTMLDivElement>(null);

  // Load Turnstile script and render invisible widget
  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || !canPay) return;

    const scriptId = 'cf-turnstile-script';
    let script = document.getElementById(scriptId) as HTMLScriptElement | null;

    const renderWidget = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const win = window as unknown as Record<string, any>;
      if (turnstileRef.current && win.turnstile) {
        // Clear any previous widget
        turnstileRef.current.innerHTML = '';
        win.turnstile.render(turnstileRef.current, {
          sitekey: TURNSTILE_SITE_KEY,
          callback: (token: string) => setTurnstileToken(token),
          'error-callback': () => setTurnstileToken(null),
          'expired-callback': () => setTurnstileToken(null),
          size: 'invisible',
        });
      }
    };

    if (!script) {
      script = document.createElement('script');
      script.id = scriptId;
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.onload = renderWidget;
      document.head.appendChild(script);
    } else {
      // Script already loaded, render directly
      renderWidget();
    }
  }, [canPay]);

  // Handle "Pay Now" — create payment intent
  const handlePayNow = useCallback(async () => {
    if (!canPay || intentCreated.current || isSubmitting) return;

    if (!turnstileToken) {
      setPaymentError('Bot verification is still loading. Please wait a moment and try again.');
      return;
    }

    setIsSubmitting(true);
    setPaymentError(null);
    intentCreated.current = true;

    try {
      const submissionRef = crypto.randomUUID();

      const payload = {
        sessionId: state.sessionId,
        source: state.source || 'unknown',
        submissionRef,
        turnstileToken,
        parentDetails: state.parentDetails,
        childDetails: state.childDetails,
        medicalInfo: state.medicalInfo,
        allergyDietaryInfo: state.allergyDietaryInfo,
        emergencyContact: state.emergencyContact,
        authorisedCollector: state.authorisedCollector,
        consents: state.consents,
        termsVersion: TERMS_VERSION,
        privacyNoticeVersion: PRIVACY_NOTICE_VERSION,
      };

      const res = await fetch('/api/payments/create-guest-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || `Payment initialisation failed (${res.status})`);
      }

      // Store for confirmation page
      sessionStorage.setItem('guest_paymentIntentId', data.paymentIntentId);
      sessionStorage.setItem('guest_sessionId', state.sessionId);

      setClientSecret(data.clientSecret);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
      setPaymentError(message);
      intentCreated.current = false;
    } finally {
      setIsSubmitting(false);
    }
  }, [canPay, isSubmitting, turnstileToken, state]);

  const handleBack = useCallback(() => {
    goToStep(4);
  }, [goToStep]);

  // Stripe Elements appearance
  const appearance = useMemo(() => ({
    theme: 'stripe' as const,
    variables: {
      colorPrimary: '#0066CC',
      fontFamily: 'Inter, sans-serif',
      borderRadius: '12px',
    },
  }), []);

  const stripeOptions = useMemo(() => ({
    clientSecret: clientSecret || undefined,
    appearance,
  }), [clientSecret, appearance]);

  return (
    <div className={styles.form}>
      {/* Review Summary Sections */}
      <ReviewSummary goToStep={goToStep} />

      {/* Total Amount */}
      {state.session && (
        <div className={styles.reviewTotal}>
          <span className={styles.reviewTotalLabel}>Total to pay</span>
          <span className={styles.reviewTotalAmount}>
            £{(state.session.price / 100).toFixed(2)}
          </span>
        </div>
      )}

      {/* Payment Section */}
      <div className={styles.paymentContainer}>
        {!canPay ? (
          <PaymentBlocked reasons={reasons} goToStep={goToStep} />
        ) : clientSecret ? (
          <Elements options={stripeOptions} stripe={stripePromise} key={clientSecret}>
            <GuestCheckoutForm sessionId={state.sessionId} />
          </Elements>
        ) : (
          <div style={{ textAlign: 'center' }}>
            {paymentError && (
              <div className={styles.errorBanner} role="alert">
                <svg className={styles.errorBannerIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span>{paymentError}</span>
              </div>
            )}

            <button
              className={styles.stepNavNext}
              onClick={handlePayNow}
              disabled={isSubmitting}
              type="button"
            >
              {isSubmitting ? 'Processing...' : 'Pay Now'}
            </button>
          </div>
        )}
      </div>

      {/* Turnstile invisible widget container */}
      <div ref={turnstileRef} style={{ display: 'none' }} />

      {/* Security note */}
      <div className={styles.securityNote}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        <span>Your payment is processed securely by Stripe. We never store your card details.</span>
      </div>

      {/* Step navigation */}
      <div className={styles.stepNav}>
        <button
          className={styles.stepNavBack}
          onClick={handleBack}
          type="button"
        >
          ← Back
        </button>
      </div>
    </div>
  );
}

// ============================================================
// ReviewSummary — Displays all collected data in sections
// ============================================================

function ReviewSummary({ goToStep }: { goToStep: (step: number) => void }) {
  const { state } = useGuestBooking();

  return (
    <>
      {/* Session Details */}
      {state.session && (
        <div className={styles.reviewSection}>
          <div className={styles.reviewSectionTitle}>Session Details</div>
          <ReviewItem label="Class" value={state.session.className} />
          <ReviewItem label="Date" value={state.session.date} />
          <ReviewItem label="Time" value={`${state.session.startTime} – ${state.session.endTime}`} />
          <ReviewItem label="Venue" value={state.session.venueName} />
          <ReviewItem label="Age Range" value={`${state.session.ageMin}–${state.session.ageMax} years`} />
        </div>
      )}

      {/* Parent Details */}
      {state.parentDetails && (
        <div className={styles.reviewSection}>
          <div className={styles.reviewSectionTitle}>
            Parent / Guardian
            <button className={styles.reviewEditBtn} onClick={() => goToStep(1)} type="button">
              Edit
            </button>
          </div>
          <ReviewItem label="Name" value={`${state.parentDetails.firstName} ${state.parentDetails.lastName}`} />
          <ReviewItem label="Email" value={state.parentDetails.email} />
          <ReviewItem label="Phone" value={state.parentDetails.telephone} />
        </div>
      )}

      {/* Child Details */}
      {state.childDetails && (
        <div className={styles.reviewSection}>
          <div className={styles.reviewSectionTitle}>
            Child
            <button className={styles.reviewEditBtn} onClick={() => goToStep(1)} type="button">
              Edit
            </button>
          </div>
          <ReviewItem label="Name" value={`${state.childDetails.firstName} ${state.childDetails.lastName}`} />
          <ReviewItem label="Date of Birth" value={state.childDetails.dateOfBirth} />
        </div>
      )}

      {/* Medical & Allergy Summary */}
      <div className={styles.reviewSection}>
        <div className={styles.reviewSectionTitle}>
          Medical &amp; Allergy
          <button className={styles.reviewEditBtn} onClick={() => goToStep(2)} type="button">
            Edit
          </button>
        </div>
        {state.medicalInfo && (
          <>
            <ReviewItem
              label="Food Allergies"
              value={state.medicalInfo.foodAllergies ? 'Yes' : 'No'}
            />
            <ReviewItem
              label="Airborne Allergies"
              value={state.medicalInfo.airborneAllergies ? 'Yes' : 'No'}
            />
            <ReviewItem
              label="EpiPen Required"
              value={state.medicalInfo.epipenRequired ? 'Yes' : 'No'}
            />
            <ReviewItem
              label="Respiratory Problems"
              value={state.medicalInfo.respiratoryProblems ? 'Yes' : 'No'}
            />
            {state.medicalInfo.medicalConditions && (
              <ReviewItem label="Medical Conditions" value={state.medicalInfo.medicalConditions} />
            )}
          </>
        )}
        {state.allergyDietaryInfo && (
          <>
            {state.allergyDietaryInfo.foodAllergies.length > 0 && (
              <ReviewItem
                label="Food Allergies"
                value={state.allergyDietaryInfo.foodAllergies.join(', ')}
              />
            )}
            {state.allergyDietaryInfo.dietaryRequirements.length > 0 && (
              <ReviewItem
                label="Dietary Requirements"
                value={state.allergyDietaryInfo.dietaryRequirements.join(', ')}
              />
            )}
          </>
        )}
      </div>

      {/* Emergency Contact */}
      {state.emergencyContact && (
        <div className={styles.reviewSection}>
          <div className={styles.reviewSectionTitle}>
            Emergency Contact
            <button className={styles.reviewEditBtn} onClick={() => goToStep(3)} type="button">
              Edit
            </button>
          </div>
          <ReviewItem label="Name" value={state.emergencyContact.name} />
          <ReviewItem label="Relationship" value={state.emergencyContact.relationship} />
          <ReviewItem label="Mobile" value={state.emergencyContact.mobile} />
          <ReviewItem label="Email" value={state.emergencyContact.email} />
        </div>
      )}

      {/* Authorised Collector */}
      {state.authorisedCollector && (
        <div className={styles.reviewSection}>
          <div className={styles.reviewSectionTitle}>
            Authorised Collector
            <button className={styles.reviewEditBtn} onClick={() => goToStep(3)} type="button">
              Edit
            </button>
          </div>
          <ReviewItem label="Name" value={state.authorisedCollector.name} />
          <ReviewItem label="Relationship" value={state.authorisedCollector.relationship} />
          <ReviewItem label="Phone" value={state.authorisedCollector.phone} />
          <ReviewItem
            label="Same as Parent"
            value={state.authorisedCollector.sameAsParent ? 'Yes' : 'No'}
          />
        </div>
      )}

      {/* Consents Summary */}
      {state.consents && (
        <div className={styles.reviewSection}>
          <div className={styles.reviewSectionTitle}>
            Consents
            <button className={styles.reviewEditBtn} onClick={() => goToStep(4)} type="button">
              Edit
            </button>
          </div>
          <ReviewItem label="Parent/Guardian Authority" value={state.consents.parentGuardianAuthority ? '✓' : '✗'} />
          <ReviewItem label="Accuracy of Information" value={state.consents.accuracyOfInformation ? '✓' : '✗'} />
          <ReviewItem label="Health & Safety Data" value={state.consents.healthSafetyDataProcessing ? '✓' : '✗'} />
          <ReviewItem label="Emergency Assistance" value={state.consents.emergencyAssistanceAuthorisation ? '✓' : '✗'} />
          <ReviewItem label="Terms & Cancellation" value={state.consents.termsAndCancellationPolicy ? '✓' : '✗'} />
          <ReviewItem label="Privacy Notice" value={state.consents.privacyNoticeAcknowledgement ? '✓' : '✗'} />
          <ReviewItem label="Photography Use" value={state.consents.photographyPromotionalUse ? '✓ (opted in)' : '✗ (declined)'} />
          <ReviewItem label="Email Marketing" value={state.consents.emailMarketing ? '✓ (opted in)' : '✗ (declined)'} />
          <ReviewItem label="WhatsApp Marketing" value={state.consents.whatsappMarketing ? '✓ (opted in)' : '✗ (declined)'} />
        </div>
      )}
    </>
  );
}

// ============================================================
// ReviewItem — Single key/value pair in a review section
// ============================================================

function ReviewItem({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.reviewItem}>
      <span className={styles.reviewLabel}>{label}</span>
      <span className={styles.reviewValue}>{value}</span>
    </div>
  );
}

// ============================================================
// PaymentBlocked — Shown when gating conditions are not met
// ============================================================

interface PaymentBlockedProps {
  reasons: string[];
  goToStep: (step: number) => void;
}

function PaymentBlocked({ reasons, goToStep }: PaymentBlockedProps) {
  return (
    <div className={styles.paymentBlocked}>
      <svg className={styles.paymentBlockedIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 9v2m0 4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
      </svg>
      <div className={styles.paymentBlockedMessage}>
        <strong>Payment is not available yet</strong>
        <p style={{ marginTop: '8px' }}>Please resolve the following before you can pay:</p>
        <ul style={{ textAlign: 'left', margin: '8px 0', paddingLeft: '20px', fontSize: '0.85rem' }}>
          {reasons.map((reason, idx) => (
            <li key={idx} style={{ marginBottom: '4px' }}>{reason}</li>
          ))}
        </ul>
        <button
          className={styles.reviewEditBtn}
          onClick={() => goToStep(1)}
          type="button"
          style={{ fontSize: '0.9rem', marginTop: '8px' }}
        >
          Go back and fix →
        </button>
      </div>
    </div>
  );
}

// ============================================================
// GuestCheckoutForm — Stripe Payment Element + confirmation
// ============================================================

function GuestCheckoutForm({ sessionId }: { sessionId: string }) {
  const stripe = useStripe();
  const elements = useElements();
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
        return_url: `${window.location.origin}/express-booking/${sessionId}/confirmation`,
      },
      redirect: 'if_required',
    });

    if (error) {
      if (error.type === 'card_error' || error.type === 'validation_error') {
        setMessage(error.message || 'Your payment was declined.');
      } else {
        setMessage('An unexpected error occurred. Please try again or contact support.');
      }
      setIsLoading(false);
      return;
    }

    if (paymentIntent && paymentIntent.status === 'succeeded') {
      // Redirect to confirmation page — webhook creates booking asynchronously
      window.location.href = `/express-booking/${sessionId}/confirmation`;
      return;
    }

    setMessage('Payment status is unclear. Please check your email or contact support.');
    setIsLoading(false);
  };

  return (
    <form onSubmit={handleSubmit}>
      <PaymentElement
        id="payment-element"
        options={{ layout: 'tabs' }}
        onReady={() => setIsReady(true)}
        onLoadError={(e) => {
          console.error('Stripe PaymentElement load error:', e);
          setMessage(
            `Payment form failed to load: ${e.error?.message || 'Unknown error'}. Please refresh.`
          );
        }}
      />

      {message && (
        <div className={styles.errorBanner} role="alert" style={{ marginTop: '16px' }}>
          <svg className={styles.errorBannerIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{message}</span>
        </div>
      )}

      <button
        type="submit"
        className={styles.stepNavNext}
        disabled={isLoading || !stripe || !elements || !isReady}
        style={{ width: '100%', marginTop: '24px' }}
      >
        {isLoading ? 'Processing payment...' : 'Confirm & Pay'}
      </button>
    </form>
  );
}
