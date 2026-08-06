'use client';

/**
 * EmergencyContactStep (Step 3) — Collects emergency contact and authorised
 * collector details for the child attending the session.
 *
 * - Emergency contact: name, relationship, mobile, alternativePhone, email
 * - Authorised collector: name, relationship, phone, sameAsParent
 * - When sameAsParent is checked, collector fields auto-populate from parent details (Step 1)
 * - Validates at least one phone number for both emergency contact and authorised collector
 *
 * Validates: GUEST-FR-005 (5.1–5.5)
 */

import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useGuestBooking } from '../GuestBookingContext';
import styles from '../styles/Steps.module.css';

// ============================================================
// Zod Schema — client-side validation
// ============================================================

const emergencyContactStepSchema = z.object({
  // Emergency contact fields
  emergencyName: z.string().min(1, 'Contact name is required').max(100),
  emergencyRelationship: z.string().min(1, 'Relationship is required').max(50),
  emergencyMobile: z.string().max(20),
  emergencyAlternativePhone: z.string().max(20),
  emergencyEmail: z.string().email('Please enter a valid email address').max(254),

  // Authorised collector fields
  collectorName: z.string().min(1, 'Collector name is required').max(100),
  collectorRelationship: z.string().min(1, 'Relationship is required').max(50),
  collectorPhone: z.string().max(20),
  sameAsParent: z.boolean(),
}).refine(
  (data) => {
    // At least one phone number for emergency contact
    const hasMobile = data.emergencyMobile.trim().length >= 10;
    const hasAlt = data.emergencyAlternativePhone.trim().length >= 10;
    return hasMobile || hasAlt;
  },
  {
    message: 'At least one phone number is required for emergency contact',
    path: ['emergencyMobile'],
  }
).refine(
  (data) => {
    // At least one phone number for authorised collector
    // If sameAsParent is true, we'll use parent telephone (validated in Step 1)
    if (data.sameAsParent) return true;
    const hasPhone = data.collectorPhone.trim().length >= 10;
    return hasPhone;
  },
  {
    message: 'Phone number is required for the authorised collector',
    path: ['collectorPhone'],
  }
);

type EmergencyContactFormData = z.infer<typeof emergencyContactStepSchema>;

// ============================================================
// Component
// ============================================================

export default function EmergencyContactStep() {
  const { state, setEmergencyContact, setAuthorisedCollector, goToStep } = useGuestBooking();
  const parentDetails = state.parentDetails;

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<EmergencyContactFormData>({
    resolver: zodResolver(emergencyContactStepSchema),
    defaultValues: {
      emergencyName: state.emergencyContact?.name ?? '',
      emergencyRelationship: state.emergencyContact?.relationship ?? '',
      emergencyMobile: state.emergencyContact?.mobile ?? '',
      emergencyAlternativePhone: state.emergencyContact?.alternativePhone ?? '',
      emergencyEmail: state.emergencyContact?.email ?? '',
      collectorName: state.authorisedCollector?.name ?? '',
      collectorRelationship: state.authorisedCollector?.relationship ?? '',
      collectorPhone: state.authorisedCollector?.phone ?? '',
      sameAsParent: state.authorisedCollector?.sameAsParent ?? false,
    },
  });

  const sameAsParent = watch('sameAsParent');

  // Auto-populate collector fields when sameAsParent is checked
  useEffect(() => {
    if (sameAsParent && parentDetails) {
      const fullName = `${parentDetails.firstName} ${parentDetails.lastName}`.trim();
      setValue('collectorName', fullName);
      setValue('collectorRelationship', 'Parent');
      setValue('collectorPhone', parentDetails.telephone);
    }
  }, [sameAsParent, parentDetails, setValue]);

  const onSubmit = (data: EmergencyContactFormData) => {
    // Save emergency contact to context
    setEmergencyContact({
      name: data.emergencyName.trim(),
      relationship: data.emergencyRelationship.trim(),
      mobile: data.emergencyMobile.trim(),
      alternativePhone: data.emergencyAlternativePhone.trim(),
      email: data.emergencyEmail.trim(),
    });

    // Save authorised collector to context
    if (data.sameAsParent && parentDetails) {
      const fullName = `${parentDetails.firstName} ${parentDetails.lastName}`.trim();
      setAuthorisedCollector({
        name: fullName,
        relationship: 'Parent',
        phone: parentDetails.telephone,
        sameAsParent: true,
      });
    } else {
      setAuthorisedCollector({
        name: data.collectorName.trim(),
        relationship: data.collectorRelationship.trim(),
        phone: data.collectorPhone.trim(),
        sameAsParent: false,
      });
    }

    // Advance to Step 4 (Consent)
    goToStep(4);
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit(onSubmit)} noValidate>
      {/* Section: Emergency Contact */}
      <div className={styles.fieldGroup}>
        <h3 className={styles.sectionTitle}>Emergency Contact</h3>
        <p className={styles.sectionSubtitle}>
          Please provide details of someone we can contact in an emergency during
          the session.
        </p>

        {/* Name */}
        <div className={styles.field}>
          <label htmlFor="emergencyName" className={`${styles.label} ${styles.labelRequired}`}>
            Contact Name
          </label>
          <input
            id="emergencyName"
            type="text"
            className={`${styles.input} ${errors.emergencyName ? styles.inputError : ''}`}
            placeholder="Full name"
            autoComplete="off"
            {...register('emergencyName')}
          />
          {errors.emergencyName && (
            <span className={styles.error} role="alert">
              <svg className={styles.errorIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              {errors.emergencyName.message}
            </span>
          )}
        </div>

        {/* Relationship */}
        <div className={styles.field}>
          <label htmlFor="emergencyRelationship" className={`${styles.label} ${styles.labelRequired}`}>
            Relationship to Child
          </label>
          <input
            id="emergencyRelationship"
            type="text"
            className={`${styles.input} ${errors.emergencyRelationship ? styles.inputError : ''}`}
            placeholder="e.g. Grandparent, Aunt, Family Friend"
            autoComplete="off"
            {...register('emergencyRelationship')}
          />
          {errors.emergencyRelationship && (
            <span className={styles.error} role="alert">
              <svg className={styles.errorIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              {errors.emergencyRelationship.message}
            </span>
          )}
        </div>

        {/* Phone numbers row */}
        <div className={styles.fieldRow}>
          <div className={styles.field}>
            <label htmlFor="emergencyMobile" className={`${styles.label} ${styles.labelRequired}`}>
              Mobile Phone
            </label>
            <input
              id="emergencyMobile"
              type="tel"
              className={`${styles.input} ${errors.emergencyMobile ? styles.inputError : ''}`}
              placeholder="07xxx xxxxxx"
              autoComplete="tel"
              {...register('emergencyMobile')}
            />
            {errors.emergencyMobile && (
              <span className={styles.error} role="alert">
                <svg className={styles.errorIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                {errors.emergencyMobile.message}
              </span>
            )}
          </div>
          <div className={styles.field}>
            <label htmlFor="emergencyAlternativePhone" className={styles.label}>
              Alternative Phone
            </label>
            <span className={styles.labelHint}>Optional</span>
            <input
              id="emergencyAlternativePhone"
              type="tel"
              className={`${styles.input} ${errors.emergencyAlternativePhone ? styles.inputError : ''}`}
              placeholder="Landline or second mobile"
              autoComplete="tel"
              {...register('emergencyAlternativePhone')}
            />
            {errors.emergencyAlternativePhone && (
              <span className={styles.error} role="alert">
                <svg className={styles.errorIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                {errors.emergencyAlternativePhone.message}
              </span>
            )}
          </div>
        </div>

        {/* Email */}
        <div className={styles.field}>
          <label htmlFor="emergencyEmail" className={`${styles.label} ${styles.labelRequired}`}>
            Email Address
          </label>
          <input
            id="emergencyEmail"
            type="email"
            className={`${styles.input} ${errors.emergencyEmail ? styles.inputError : ''}`}
            placeholder="emergency@example.com"
            autoComplete="email"
            {...register('emergencyEmail')}
          />
          {errors.emergencyEmail && (
            <span className={styles.error} role="alert">
              <svg className={styles.errorIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              {errors.emergencyEmail.message}
            </span>
          )}
        </div>
      </div>

      {/* Section Divider */}
      <div className={styles.sectionDivider} />

      {/* Section: Authorised Collector */}
      <div className={styles.fieldGroup}>
        <h3 className={styles.sectionTitle}>Authorised Collector</h3>
        <p className={styles.sectionSubtitle}>
          Who is authorised to collect your child at the end of the session? Your
          child will only be released to named individuals.
        </p>

        {/* Same as Parent toggle */}
        <label className={styles.sameAsParent}>
          <input
            type="checkbox"
            className={styles.sameAsParentCheckbox}
            {...register('sameAsParent')}
          />
          <span className={styles.sameAsParentLabel}>
            Same as parent / guardian (me)
          </span>
        </label>

        {/* Collector fields — shown even when sameAsParent, but pre-populated and read-only */}
        <div className={styles.field}>
          <label htmlFor="collectorName" className={`${styles.label} ${styles.labelRequired}`}>
            Collector Name
          </label>
          <input
            id="collectorName"
            type="text"
            className={`${styles.input} ${errors.collectorName ? styles.inputError : ''}`}
            placeholder="Full name"
            autoComplete="off"
            readOnly={sameAsParent}
            aria-readonly={sameAsParent}
            {...register('collectorName')}
          />
          {errors.collectorName && (
            <span className={styles.error} role="alert">
              <svg className={styles.errorIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              {errors.collectorName.message}
            </span>
          )}
        </div>

        <div className={styles.field}>
          <label htmlFor="collectorRelationship" className={`${styles.label} ${styles.labelRequired}`}>
            Relationship to Child
          </label>
          <input
            id="collectorRelationship"
            type="text"
            className={`${styles.input} ${errors.collectorRelationship ? styles.inputError : ''}`}
            placeholder="e.g. Parent, Grandparent"
            autoComplete="off"
            readOnly={sameAsParent}
            aria-readonly={sameAsParent}
            {...register('collectorRelationship')}
          />
          {errors.collectorRelationship && (
            <span className={styles.error} role="alert">
              <svg className={styles.errorIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              {errors.collectorRelationship.message}
            </span>
          )}
        </div>

        <div className={styles.field}>
          <label htmlFor="collectorPhone" className={`${styles.label} ${styles.labelRequired}`}>
            Phone Number
          </label>
          <input
            id="collectorPhone"
            type="tel"
            className={`${styles.input} ${errors.collectorPhone ? styles.inputError : ''}`}
            placeholder="07xxx xxxxxx"
            autoComplete="tel"
            readOnly={sameAsParent}
            aria-readonly={sameAsParent}
            {...register('collectorPhone')}
          />
          {errors.collectorPhone && (
            <span className={styles.error} role="alert">
              <svg className={styles.errorIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              {errors.collectorPhone.message}
            </span>
          )}
        </div>
      </div>

      {/* Step Navigation */}
      <div className={styles.stepNav}>
        <button
          type="button"
          className={styles.stepNavBack}
          onClick={() => goToStep(2)}
        >
          ← Back
        </button>
        <button type="submit" className={styles.stepNavNext}>
          Continue →
        </button>
      </div>
    </form>
  );
}
