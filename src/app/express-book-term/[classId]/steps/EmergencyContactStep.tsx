'use client';

/**
 * EmergencyContactStep (Step 3) — Collects emergency contact and authorised
 * collector details for the child attending the programme.
 *
 * Identical form structure to express-booking version, adapted to use
 * GuestTermBookingContext.
 */

import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useGuestTermBooking } from '../GuestTermBookingContext';
import styles from '../styles/Steps.module.css';

// ============================================================
// Zod Schema
// ============================================================

const emergencyContactStepSchema = z.object({
  emergencyName: z.string().min(1, 'Contact name is required').max(100),
  emergencyRelationship: z.string().min(1, 'Relationship is required').max(50),
  emergencyMobile: z.string().max(20),
  emergencyAlternativePhone: z.string().max(20),
  emergencyEmail: z.string().email('Please enter a valid email address').max(254),
  collectorName: z.string().min(1, 'Collector name is required').max(100),
  collectorRelationship: z.string().min(1, 'Relationship is required').max(50),
  collectorPhone: z.string().max(20),
  sameAsParent: z.boolean(),
}).refine(
  (data) => {
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
    if (data.sameAsParent) return true;
    return data.collectorPhone.trim().length >= 10;
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
  const { state, setEmergencyContact, setAuthorisedCollector, goToStep } = useGuestTermBooking();
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

  useEffect(() => {
    if (sameAsParent && parentDetails) {
      const fullName = `${parentDetails.firstName} ${parentDetails.lastName}`.trim();
      setValue('collectorName', fullName);
      setValue('collectorRelationship', 'Parent');
      setValue('collectorPhone', parentDetails.telephone);
    }
  }, [sameAsParent, parentDetails, setValue]);

  const onSubmit = (data: EmergencyContactFormData) => {
    setEmergencyContact({
      name: data.emergencyName.trim(),
      relationship: data.emergencyRelationship.trim(),
      mobile: data.emergencyMobile.trim(),
      alternativePhone: data.emergencyAlternativePhone.trim(),
      email: data.emergencyEmail.trim(),
    });

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

    goToStep(4);
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit(onSubmit)} noValidate>
      {/* Emergency Contact */}
      <div className={styles.fieldGroup}>
        <h3 className={styles.sectionTitle}>Emergency Contact</h3>
        <p className={styles.sectionSubtitle}>
          Please provide details of someone we can contact in an emergency during sessions.
        </p>

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
            <span className={styles.error} role="alert">{errors.emergencyName.message}</span>
          )}
        </div>

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
            <span className={styles.error} role="alert">{errors.emergencyRelationship.message}</span>
          )}
        </div>

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
              <span className={styles.error} role="alert">{errors.emergencyMobile.message}</span>
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
              className={styles.input}
              placeholder="Landline or second mobile"
              autoComplete="tel"
              {...register('emergencyAlternativePhone')}
            />
          </div>
        </div>

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
            <span className={styles.error} role="alert">{errors.emergencyEmail.message}</span>
          )}
        </div>
      </div>

      <div className={styles.sectionDivider} />

      {/* Authorised Collector */}
      <div className={styles.fieldGroup}>
        <h3 className={styles.sectionTitle}>Authorised Collector</h3>
        <p className={styles.sectionSubtitle}>
          Who is authorised to collect your child at the end of each session? Your
          child will only be released to named individuals.
        </p>

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
            <span className={styles.error} role="alert">{errors.collectorName.message}</span>
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
            <span className={styles.error} role="alert">{errors.collectorRelationship.message}</span>
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
            <span className={styles.error} role="alert">{errors.collectorPhone.message}</span>
          )}
        </div>
      </div>

      {/* Step Navigation */}
      <div className={styles.stepNav}>
        <button type="button" className={styles.stepNavBack} onClick={() => goToStep(2)}>
          ← Back
        </button>
        <button type="submit" className={styles.stepNavNext}>
          Continue →
        </button>
      </div>
    </form>
  );
}
