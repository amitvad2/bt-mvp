'use client';

/**
 * ConsentStep (Step 4) — Collects mandatory and optional consents before
 * the parent can proceed to Review & Payment.
 *
 * Identical consent structure to express-booking version, adapted to use
 * GuestTermBookingContext.
 */

import React, { useState, useCallback, useMemo } from 'react';
import { GuestConsentRecord } from '@/types';
import { useGuestTermBooking } from '../GuestTermBookingContext';
import styles from '../styles/Steps.module.css';

// ============================================================
// Consent definitions
// ============================================================

interface ConsentDefinition {
  key: keyof GuestConsentRecord;
  label: string;
  mandatory: boolean;
}

const MANDATORY_CONSENTS: ConsentDefinition[] = [
  {
    key: 'parentGuardianAuthority',
    label: 'I confirm I am the parent or legal guardian of the child named in this booking and have authority to provide consent on their behalf.',
    mandatory: true,
  },
  {
    key: 'accuracyOfInformation',
    label: 'I confirm all information provided in this form is accurate and complete to the best of my knowledge.',
    mandatory: true,
  },
  {
    key: 'healthSafetyDataProcessing',
    label: 'I consent to Blooming Tastebuds processing the health and safety information provided for the purpose of safeguarding my child during sessions.',
    mandatory: true,
  },
  {
    key: 'emergencyAssistanceAuthorisation',
    label: 'I authorise Blooming Tastebuds staff to seek emergency medical assistance for my child if required and I cannot be reached.',
    mandatory: true,
  },
  {
    key: 'termsAndCancellationPolicy',
    label: 'I have read and accept the Terms & Conditions and Cancellation Policy.',
    mandatory: true,
  },
  {
    key: 'privacyNoticeAcknowledgement',
    label: 'I acknowledge that I have read the Privacy Notice and understand how my data and my child\'s data will be processed.',
    mandatory: true,
  },
];

const OPTIONAL_CONSENTS: ConsentDefinition[] = [
  {
    key: 'photographyPromotionalUse',
    label: 'I consent to photographs of my child being taken during sessions and used for promotional purposes (website, social media).',
    mandatory: false,
  },
  {
    key: 'emailMarketing',
    label: 'I would like to receive email communications about upcoming classes, events, and offers.',
    mandatory: false,
  },
  {
    key: 'whatsappMarketing',
    label: 'I would like to receive WhatsApp messages about upcoming classes, events, and offers.',
    mandatory: false,
  },
];

const DEFAULT_CONSENTS: GuestConsentRecord = {
  parentGuardianAuthority: false,
  accuracyOfInformation: false,
  healthSafetyDataProcessing: false,
  emergencyAssistanceAuthorisation: false,
  termsAndCancellationPolicy: false,
  privacyNoticeAcknowledgement: false,
  photographyPromotionalUse: false,
  emailMarketing: false,
  whatsappMarketing: false,
};

// ============================================================
// Component
// ============================================================

export default function ConsentStep() {
  const { state, setConsents, goToStep } = useGuestTermBooking();

  const [consents, setLocalConsents] = useState<GuestConsentRecord>(
    state.consents ?? DEFAULT_CONSENTS
  );
  const [showError, setShowError] = useState(false);

  const allMandatoryAccepted = useMemo(() => {
    return MANDATORY_CONSENTS.every((c) => consents[c.key] === true);
  }, [consents]);

  const handleToggle = useCallback((key: keyof GuestConsentRecord) => {
    setLocalConsents((prev) => ({ ...prev, [key]: !prev[key] }));
    setShowError(false);
  }, []);

  const handleContinue = useCallback(() => {
    if (!allMandatoryAccepted) {
      setShowError(true);
      return;
    }
    setConsents(consents);
    goToStep(5);
  }, [allMandatoryAccepted, consents, setConsents, goToStep]);

  const handleBack = useCallback(() => {
    setConsents(consents);
    goToStep(3);
  }, [consents, setConsents, goToStep]);

  return (
    <div className={styles.form}>
      {/* Mandatory consents */}
      <div>
        <h3 className={styles.sectionTitle}>Required Consents</h3>
        <p className={styles.sectionSubtitle}>
          All of the following must be accepted to proceed with your booking.
        </p>

        <div className={styles.consentGroup} role="group" aria-labelledby="mandatory-consents-heading">
          <span id="mandatory-consents-heading" className="sr-only">
            Mandatory consents
          </span>
          {MANDATORY_CONSENTS.map((consent) => (
            <ConsentCheckboxItem
              key={consent.key}
              consent={consent}
              checked={consents[consent.key]}
              onToggle={handleToggle}
            />
          ))}
        </div>
      </div>

      {showError && !allMandatoryAccepted && (
        <div className={styles.errorBanner} role="alert" aria-live="assertive">
          <svg className={styles.errorBannerIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>Please accept all required consents before continuing.</span>
        </div>
      )}

      <div className={styles.sectionDivider} />

      {/* Optional consents */}
      <div>
        <h3 className={styles.sectionTitle}>Optional Consents</h3>
        <p className={styles.sectionSubtitle}>
          These are entirely optional and will not affect your booking.
        </p>

        <div className={styles.consentGroup} role="group" aria-labelledby="optional-consents-heading">
          <span id="optional-consents-heading" className="sr-only">
            Optional consents
          </span>
          {OPTIONAL_CONSENTS.map((consent) => (
            <ConsentCheckboxItem
              key={consent.key}
              consent={consent}
              checked={consents[consent.key]}
              onToggle={handleToggle}
            />
          ))}
        </div>
      </div>

      {/* Step navigation */}
      <div className={styles.stepNav}>
        <button className={styles.stepNavBack} onClick={handleBack} type="button">
          ← Back
        </button>
        <button
          className={styles.stepNavNext}
          onClick={handleContinue}
          type="button"
          aria-disabled={!allMandatoryAccepted}
        >
          Continue →
        </button>
      </div>
    </div>
  );
}

// ============================================================
// Individual Consent Checkbox Item
// ============================================================

interface ConsentCheckboxItemProps {
  consent: ConsentDefinition;
  checked: boolean;
  onToggle: (key: keyof GuestConsentRecord) => void;
}

function ConsentCheckboxItem({ consent, checked, onToggle }: ConsentCheckboxItemProps) {
  const itemClasses = [
    styles.consentItem,
    checked ? styles.consentItemChecked : '',
  ].filter(Boolean).join(' ');

  const labelClasses = [
    styles.consentLabel,
    consent.mandatory ? styles.consentMandatory : styles.consentOptional,
  ].filter(Boolean).join(' ');

  return (
    <label className={itemClasses}>
      <input
        type="checkbox"
        className={styles.consentCheckbox}
        checked={checked}
        onChange={() => onToggle(consent.key)}
        aria-required={consent.mandatory}
      />
      <span className={labelClasses}>
        {consent.label}
        {!consent.mandatory && (
          <span className={styles.consentOptionalTag}>Optional</span>
        )}
      </span>
    </label>
  );
}
