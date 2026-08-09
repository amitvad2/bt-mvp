'use client';

/**
 * ReviewPaymentStep (Step 5) — Displays a full summary of all entered data
 * and gates the Stripe Payment Element behind validation conditions.
 *
 * Adapted for term bookings: uses termPrice and classId rather than session price.
 * Calls the same create-guest-intent API with bookingType: 'term' and classId.
 */

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';
import { useGuestTermBooking } from '../GuestTermBookingContext';
import { formatTermPrice } from '@/lib/term-utils';
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
// Payment gating conditions
// ============================================================

interface GatingResult {
  canPay: boolean;
  reasons: string[];
}

function usePaymentGating(): GatingResult {
  const { state } = useGuestTermBooking();
  const reasons: string[] = [];

  if (!state.parentDetails?.firstName || !state.parentDetails?.lastName ||
      !state.parentDetails?.email || !state.parentDetails?.telephone) {
    reasons.push('Parent details are incomplete.');
  }

  if (!state.childDetails?.firstName || !state.childDetails?.lastName ||
      !state.childDetails?.dateOfBirth) {
    reasons.push('Child details are incomplete.');
  }

  if (!state.medicalInfo) {
    reasons.push('Medical information has not been provided.');
  }

  if (!state.allergyDietaryInfo) {
    reasons.push('Allergy and dietary information has not been provided.');
  }

  if (!state.emergencyContact?.name || !state.emergencyContact?.relationship ||
      !state.emergencyContact?.mobile || !state.emergencyContact?.email) {
    reasons.push('Emergency contact details are incomplete.');
  }

  if (!state.authorisedCollector?.name || !state.authorisedCollector?.relationship ||
      !state.authorisedCollector?.phone) {
    reasons.push('Authorised collector details are incomplete.');
  }

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

  // Check term class availability
  if (state.termClass) {
    if (state.termClass.spotsAvailable <= 0) {
      reasons.push('This programme is fully booked (no spots available).');
    }
  }

  return { canPay: reasons.length === 0, reasons };
}

// ============================================================
// Main ReviewPaymentStep Component
// ============================================================

export default function ReviewPaymentStep() {
  const { state, goToStep } = useGuestTermBooking();
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
        turnstileRef.current.innerHTML = '';
        win.turnstile.render(turnstileRef.current, {
          sitekey: TURNSTILE_SITE_KEY,
          callback: (token: string) => setTurnstileToken(token),
          'error-callback': () => setTurnstileToken(null),
          'expired-callback': () => setTurnstileToken(null),
          size: 'compact',
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
      renderWidget();
    }
  }, [canPay]);

  // Handle "Pay Now" — create payment intent for term booking
  const handlePayNow = useCallback(async () => {
    if (!canPay || intentCreated.current || isSubmitting) return;

    if (!turnstileToken && TURNSTILE_SITE_KEY) {
      setPaymentError('Bot verification is still loading. Please wait a moment and try again.');
      return;
    }

    setIsSubmitting(true);
    setPaymentError(null);
    intentCreated.current = true;

    try {
      const submissionRef = crypto.randomUUID();

      const payload = {
        classId: state.classId,
        bookingType: 'term',
        bookingMode: 'guest',
        source: state.source || 'unknown',
        submissionRef,
        turnstileToken,
        guestContact: state.parentDetails,
        childSnapshot: state.childDetails,
        medicalInfo: state.medicalInfo,
        allergyDietaryInfo: state.allergyDietaryInfo,
        emergencyContact: state.emergencyContact,
        authorisedCollector: state.authorisedCollector,
        consentAudit: {
          consents: state.consents,
          acceptedAt: new Date().toISOString(),
          acceptedBy: `${state.parentDetails?.firstName ?? ''} ${state.parentDetails?.lastName ?? ''}`.trim(),
          termsVersion: TERMS_VERSION,
          privacyNoticeVersion: PRIVACY_NOTICE_VERSION,
          sourceChannel: state.source || 'unknown',
          submissionTimestamp: new Date().toISOString(),
        },
        termsVersion: TERMS_VERSION,
        privacyNoticeVersion: PRIVACY_NOTICE_VERSION,
      };

      const res = await fetch('/api/payments/create-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || `Payment initialisation failed (${res.status})`);
      }

      // Store for confirmation page
      sessionStorage.setItem('guest_term_paymentIntentId', data.paymentIntentId);
      sessionStorage.setItem('guest_term_classId', state.classId);

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
      {state.termClass && (
        <div className={styles.reviewTotal}>
          <span className={styles.reviewTotalLabel}>Total to pay (Full Programme)</span>
          <span className={styles.reviewTotalAmount}>
            {formatTermPrice(state.termClass.termPrice)}
          </span>
        </div>
      )}

      {/* Payment Section */}
      <div className={styles.paymentContainer}>
        {!canPay ? (
          <PaymentBlocked reasons={reasons} goToStep={goToStep} />
        ) : clientSecret ? (
          <Elements options={stripeOptions} stripe={stripePromise} key={clientSecret}>
            <GuestTermCheckoutForm classId={state.classId} />
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
        <button className={styles.stepNavBack} onClick={handleBack} type="button">
          ← Back
        </button>
      </div>
    </div>
  );
}

// ============================================================
// ReviewSummary
// ============================================================

function ReviewSummary({ goToStep }: { goToStep: (step: number) => void }) {
  const { state } = useGuestTermBooking();

  const termClass = state.termClass;
  const scheduleDescription = termClass?.recurrenceDays && termClass.recurrenceDays.length > 0
    ? termClass.recurrenceDays.join(', ')
    : 'See programme dates';

  return (
    <>
      {/* Programme Details */}
      {termClass && (
        <div className={styles.reviewSection}>
          <div className={styles.reviewSectionTitle}>Programme Details</div>
          <ReviewItem label="Programme" value={termClass.name} />
          <ReviewItem label="Schedule" value={scheduleDescription} />
          <ReviewItem label="Period" value={`${termClass.termStartDate} to ${termClass.termEndDate}`} />
          <ReviewItem label="Time" value={`${termClass.startTime} – ${termClass.endTime}`} />
          <ReviewItem label="Venue" value={termClass.venueName} />
          <ReviewItem label="Age Range" value={`${termClass.ageMin}–${termClass.ageMax} years`} />
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
            <ReviewItem label="Food Allergies" value={state.medicalInfo.foodAllergies ? 'Yes' : 'No'} />
            <ReviewItem label="EpiPen Required" value={state.medicalInfo.epipenRequired ? 'Yes' : 'No'} />
          </>
        )}
        {state.allergyDietaryInfo && state.allergyDietaryInfo.dietaryRequirements.length > 0 && (
          <ReviewItem label="Dietary Requirements" value={state.allergyDietaryInfo.dietaryRequirements.join(', ')} />
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
          <ReviewItem label="All mandatory consents" value="✓ Accepted" />
          <ReviewItem label="Photography" value={state.consents.photographyPromotionalUse ? '✓ Opted in' : '✗ Declined'} />
          <ReviewItem label="Email Marketing" value={state.consents.emailMarketing ? '✓ Opted in' : '✗ Declined'} />
          <ReviewItem label="WhatsApp Marketing" value={state.consents.whatsappMarketing ? '✓ Opted in' : '✗ Declined'} />
        </div>
      )}
    </>
  );
}

// ============================================================
// ReviewItem
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
// PaymentBlocked
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
// GuestTermCheckoutForm — Stripe Payment Element + confirmation
// ============================================================

function GuestTermCheckoutForm({ classId }: { classId: string }) {
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
        return_url: `${window.location.origin}/express-book-term/${classId}/confirmation`,
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
      window.location.href = `/express-book-term/${classId}/confirmation`;
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
