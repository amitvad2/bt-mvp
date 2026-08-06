'use client';

/**
 * ParentChildStep (Step 1) — Collects parent contact details and child information.
 *
 * Uses React Hook Form + Zod for validation. Performs client-side age validation
 * against the session's ageMin/ageMax using `validateChildAge` from guest-validation.
 *
 * Validates: GUEST-FR-003 (3.1–3.5)
 */

import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useGuestBooking } from '../GuestBookingContext';
import { validateChildAge } from '@/lib/guest-validation';
import styles from '../styles/Steps.module.css';

// ============================================================
// Zod Schema — Client-side validation
// ============================================================

const parentChildSchema = z.object({
  parentFirstName: z.string().min(1, 'First name is required').max(100),
  parentLastName: z.string().min(1, 'Last name is required').max(100),
  parentEmail: z.string().email('Please enter a valid email address').max(254),
  parentTelephone: z.string().min(10, 'Phone number must be at least 10 digits').max(20),
  childFirstName: z.string().min(1, 'First name is required').max(100),
  childLastName: z.string().min(1, 'Last name is required').max(100),
  childDateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Please enter a valid date of birth'),
});

type ParentChildFormData = z.infer<typeof parentChildSchema>;

// ============================================================
// Component
// ============================================================

export default function ParentChildStep() {
  const { state, setParentDetails, setChildDetails, goToStep } = useGuestBooking();
  const session = state.session;
  const [ageError, setAgeError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<ParentChildFormData>({
    resolver: zodResolver(parentChildSchema),
    defaultValues: {
      parentFirstName: state.parentDetails?.firstName || '',
      parentLastName: state.parentDetails?.lastName || '',
      parentEmail: state.parentDetails?.email || '',
      parentTelephone: state.parentDetails?.telephone || '',
      childFirstName: state.childDetails?.firstName || '',
      childLastName: state.childDetails?.lastName || '',
      childDateOfBirth: state.childDetails?.dateOfBirth || '',
    },
  });

  // Watch child DOB for real-time age validation feedback
  const childDob = watch('childDateOfBirth');

  useEffect(() => {
    if (!childDob || !session) {
      setAgeError(null);
      return;
    }

    // Only validate if the DOB matches the expected format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(childDob)) {
      setAgeError(null);
      return;
    }

    const isValid = validateChildAge(childDob, session.date, session.ageMin, session.ageMax);
    if (!isValid) {
      setAgeError(
        `Your child must be between ${session.ageMin} and ${session.ageMax} years old on the session date (${session.date}). Please check the date of birth.`
      );
    } else {
      setAgeError(null);
    }
  }, [childDob, session]);

  const onSubmit = (data: ParentChildFormData) => {
    // Final age validation check before progression
    if (session && !validateChildAge(data.childDateOfBirth, session.date, session.ageMin, session.ageMax)) {
      setAgeError(
        `Your child must be between ${session.ageMin} and ${session.ageMax} years old on the session date (${session.date}). Please check the date of birth.`
      );
      return;
    }

    // Save to context
    setParentDetails({
      firstName: data.parentFirstName,
      lastName: data.parentLastName,
      email: data.parentEmail,
      telephone: data.parentTelephone,
    });

    setChildDetails({
      firstName: data.childFirstName,
      lastName: data.childLastName,
      dateOfBirth: data.childDateOfBirth,
    });

    // Proceed to next step
    goToStep(2);
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit(onSubmit)} noValidate>
      {/* Parent Details Section */}
      <div className={styles.fieldGroup}>
        <h3 className={styles.sectionTitle}>Parent / Guardian Details</h3>
        <p className={styles.sectionSubtitle}>
          We&apos;ll use these details to contact you about the booking.
        </p>

        <div className={styles.fieldRow}>
          <div className={styles.field}>
            <label htmlFor="parentFirstName" className={`${styles.label} ${styles.labelRequired}`}>
              First Name
            </label>
            <input
              id="parentFirstName"
              type="text"
              autoComplete="given-name"
              className={`${styles.input} ${errors.parentFirstName ? styles.inputError : ''}`}
              placeholder="e.g. Sarah"
              {...register('parentFirstName')}
            />
            {errors.parentFirstName && (
              <span className={styles.error} role="alert">
                {errors.parentFirstName.message}
              </span>
            )}
          </div>

          <div className={styles.field}>
            <label htmlFor="parentLastName" className={`${styles.label} ${styles.labelRequired}`}>
              Last Name
            </label>
            <input
              id="parentLastName"
              type="text"
              autoComplete="family-name"
              className={`${styles.input} ${errors.parentLastName ? styles.inputError : ''}`}
              placeholder="e.g. Johnson"
              {...register('parentLastName')}
            />
            {errors.parentLastName && (
              <span className={styles.error} role="alert">
                {errors.parentLastName.message}
              </span>
            )}
          </div>
        </div>

        <div className={styles.field}>
          <label htmlFor="parentEmail" className={`${styles.label} ${styles.labelRequired}`}>
            Email Address
          </label>
          <input
            id="parentEmail"
            type="email"
            inputMode="email"
            autoComplete="email"
            className={`${styles.input} ${errors.parentEmail ? styles.inputError : ''}`}
            placeholder="e.g. sarah@example.com"
            {...register('parentEmail')}
          />
          {errors.parentEmail && (
            <span className={styles.error} role="alert">
              {errors.parentEmail.message}
            </span>
          )}
        </div>

        <div className={styles.field}>
          <label htmlFor="parentTelephone" className={`${styles.label} ${styles.labelRequired}`}>
            Phone Number
          </label>
          <input
            id="parentTelephone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            className={`${styles.input} ${errors.parentTelephone ? styles.inputError : ''}`}
            placeholder="e.g. 07700 900123"
            {...register('parentTelephone')}
          />
          {errors.parentTelephone && (
            <span className={styles.error} role="alert">
              {errors.parentTelephone.message}
            </span>
          )}
        </div>
      </div>

      <div className={styles.sectionDivider} />

      {/* Child Details Section */}
      <div className={styles.fieldGroup}>
        <h3 className={styles.sectionTitle}>Child Details</h3>
        <p className={styles.sectionSubtitle}>
          Details for the child attending the session. Age must be between{' '}
          {session?.ageMin}–{session?.ageMax} years on the session date.
        </p>

        <div className={styles.fieldRow}>
          <div className={styles.field}>
            <label htmlFor="childFirstName" className={`${styles.label} ${styles.labelRequired}`}>
              First Name
            </label>
            <input
              id="childFirstName"
              type="text"
              autoComplete="off"
              className={`${styles.input} ${errors.childFirstName ? styles.inputError : ''}`}
              placeholder="e.g. Oliver"
              {...register('childFirstName')}
            />
            {errors.childFirstName && (
              <span className={styles.error} role="alert">
                {errors.childFirstName.message}
              </span>
            )}
          </div>

          <div className={styles.field}>
            <label htmlFor="childLastName" className={`${styles.label} ${styles.labelRequired}`}>
              Last Name
            </label>
            <input
              id="childLastName"
              type="text"
              autoComplete="off"
              className={`${styles.input} ${errors.childLastName ? styles.inputError : ''}`}
              placeholder="e.g. Johnson"
              {...register('childLastName')}
            />
            {errors.childLastName && (
              <span className={styles.error} role="alert">
                {errors.childLastName.message}
              </span>
            )}
          </div>
        </div>

        <div className={styles.field}>
          <label htmlFor="childDateOfBirth" className={`${styles.label} ${styles.labelRequired}`}>
            Date of Birth
          </label>
          <input
            id="childDateOfBirth"
            type="date"
            className={`${styles.input} ${errors.childDateOfBirth || ageError ? styles.inputError : ''}`}
            {...register('childDateOfBirth')}
          />
          {errors.childDateOfBirth && (
            <span className={styles.error} role="alert">
              {errors.childDateOfBirth.message}
            </span>
          )}
          {ageError && !errors.childDateOfBirth && (
            <div className={styles.errorBanner} role="alert">
              <span className={styles.errorBannerIcon} aria-hidden="true">⚠️</span>
              <span>{ageError}</span>
            </div>
          )}
        </div>
      </div>

      {/* Step Navigation */}
      <div className={styles.stepNav}>
        <button
          type="button"
          className={styles.stepNavBack}
          onClick={() => goToStep(0)}
        >
          ← Back
        </button>
        <button
          type="submit"
          className={styles.stepNavNext}
          disabled={!!ageError}
        >
          Next →
        </button>
      </div>
    </form>
  );
}
