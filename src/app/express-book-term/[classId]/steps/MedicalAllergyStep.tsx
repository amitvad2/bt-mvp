'use client';

/**
 * MedicalAllergyStep (Step 2) — Collects medical and allergy/dietary information.
 *
 * Identical form structure to express-booking version, adapted to use
 * GuestTermBookingContext instead of GuestBookingContext.
 */

import React from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useGuestTermBooking } from '../GuestTermBookingContext';
import { GuestMedicalInfo, GuestAllergyDietaryInfo } from '@/types';
import styles from '../styles/Steps.module.css';

// ============================================================
// Zod Schema — client-side validation
// ============================================================

const medicalAllergySchema = z.object({
  foodAllergies: z.boolean(),
  dietaryRequirements: z.string().max(1000),
  airborneAllergies: z.boolean(),
  allergenDetails: z.string().max(1000),
  knownReactions: z.string().max(1000),
  symptoms: z.string().max(1000),
  epipenRequired: z.boolean(),
  epipenDetails: z.string().max(500),
  medicationDetails: z.string().max(500),
  respiratoryProblems: z.boolean(),
  medicalConditions: z.string().max(1000),
  recentOperations: z.string().max(500),
  visionImpairment: z.boolean(),
  hearingImpairment: z.boolean(),
  additionalSupportNeeds: z.string().max(1000),
  otherSafetyInfo: z.string().max(1000),
  allergyDietary_foodAllergies: z.string().max(1000),
  allergyDietary_dietaryRequirements: z.string().max(1000),
  allergyDietary_airborneAllergies: z.string().max(1000),
  allergyDietary_allergenDetails: z.string().max(1000),
  allergyDietary_reactionDetails: z.string().max(1000),
  allergyDietary_symptoms: z.string().max(1000),
});

type MedicalAllergyFormData = z.infer<typeof medicalAllergySchema>;

function splitToArray(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// ============================================================
// Component
// ============================================================

export default function MedicalAllergyStep() {
  const { state, setMedicalInfo, setAllergyDietaryInfo, goToStep } = useGuestTermBooking();

  const existingMedical = state.medicalInfo;
  const existingAllergy = state.allergyDietaryInfo;

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<MedicalAllergyFormData>({
    resolver: zodResolver(medicalAllergySchema),
    defaultValues: {
      foodAllergies: existingMedical?.foodAllergies ?? false,
      dietaryRequirements: existingMedical?.dietaryRequirements ?? '',
      airborneAllergies: existingMedical?.airborneAllergies ?? false,
      allergenDetails: existingMedical?.allergenDetails ?? '',
      knownReactions: existingMedical?.knownReactions ?? '',
      symptoms: existingMedical?.symptoms ?? '',
      epipenRequired: existingMedical?.epipenRequired ?? false,
      epipenDetails: existingMedical?.epipenDetails ?? '',
      medicationDetails: existingMedical?.medicationDetails ?? '',
      respiratoryProblems: existingMedical?.respiratoryProblems ?? false,
      medicalConditions: existingMedical?.medicalConditions ?? '',
      recentOperations: existingMedical?.recentOperations ?? '',
      visionImpairment: existingMedical?.visionImpairment ?? false,
      hearingImpairment: existingMedical?.hearingImpairment ?? false,
      additionalSupportNeeds: existingMedical?.additionalSupportNeeds ?? '',
      otherSafetyInfo: existingMedical?.otherSafetyInfo ?? '',
      allergyDietary_foodAllergies: existingAllergy?.foodAllergies?.join(', ') ?? '',
      allergyDietary_dietaryRequirements: existingAllergy?.dietaryRequirements?.join(', ') ?? '',
      allergyDietary_airborneAllergies: existingAllergy?.airborneAllergies?.join(', ') ?? '',
      allergyDietary_allergenDetails: existingAllergy?.allergenDetails ?? '',
      allergyDietary_reactionDetails: existingAllergy?.reactionDetails ?? '',
      allergyDietary_symptoms: existingAllergy?.symptoms ?? '',
    },
  });

  const watchFoodAllergies = useWatch({ control, name: 'foodAllergies' });
  const watchEpipenRequired = useWatch({ control, name: 'epipenRequired' });
  const watchAirborneAllergies = useWatch({ control, name: 'airborneAllergies' });

  const onSubmit = (data: MedicalAllergyFormData) => {
    const medicalInfo: GuestMedicalInfo = {
      foodAllergies: data.foodAllergies,
      dietaryRequirements: data.dietaryRequirements,
      airborneAllergies: data.airborneAllergies,
      allergenDetails: data.allergenDetails,
      knownReactions: data.knownReactions,
      symptoms: data.symptoms,
      epipenRequired: data.epipenRequired,
      epipenDetails: data.epipenDetails,
      medicationDetails: data.medicationDetails,
      respiratoryProblems: data.respiratoryProblems,
      medicalConditions: data.medicalConditions,
      recentOperations: data.recentOperations,
      visionImpairment: data.visionImpairment,
      hearingImpairment: data.hearingImpairment,
      additionalSupportNeeds: data.additionalSupportNeeds,
      otherSafetyInfo: data.otherSafetyInfo,
    };

    const allergyDietaryInfo: GuestAllergyDietaryInfo = {
      foodAllergies: splitToArray(data.allergyDietary_foodAllergies),
      dietaryRequirements: splitToArray(data.allergyDietary_dietaryRequirements),
      airborneAllergies: splitToArray(data.allergyDietary_airborneAllergies),
      allergenDetails: data.allergyDietary_allergenDetails,
      reactionDetails: data.allergyDietary_reactionDetails,
      symptoms: data.allergyDietary_symptoms,
    };

    setMedicalInfo(medicalInfo);
    setAllergyDietaryInfo(allergyDietaryInfo);
    goToStep(3);
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit(onSubmit)} noValidate>
      <div>
        <h2 className={styles.sectionTitle}>Medical &amp; Allergy Information</h2>
        <p className={styles.sectionSubtitle}>
          Please provide accurate medical and allergy details so we can keep your child safe during the programme.
        </p>
      </div>

      <div className={styles.disclaimer} role="note">
        <span className={styles.disclaimerIcon} aria-hidden="true">⚠️</span>
        <span>
          Declaring medical or allergy needs does not guarantee accommodation. Blooming Tastebuds staff will review all declarations and contact you if further discussion is needed before the programme starts.
        </span>
      </div>

      {/* Allergy & Dietary Declarations */}
      <div className={styles.fieldGroup}>
        <h3 className={styles.sectionTitle}>Allergy &amp; Dietary Declarations</h3>

        <label className={`${styles.medicalToggle} ${watchFoodAllergies ? styles.medicalToggleActive : ''}`}>
          <span className={styles.medicalToggleLabel}>Does your child have food allergies?</span>
          <input type="checkbox" className={styles.medicalToggleSwitch} {...register('foodAllergies')} />
        </label>

        {watchFoodAllergies && (
          <div className={styles.conditionalFields}>
            <div className={styles.field}>
              <label className={styles.label}>Food allergies (comma-separated)</label>
              <input
                type="text"
                className={`${styles.input} ${errors.allergyDietary_foodAllergies ? styles.inputError : ''}`}
                placeholder="e.g. Peanuts, Tree nuts, Shellfish"
                {...register('allergyDietary_foodAllergies')}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Allergen details</label>
              <textarea
                className={`${styles.textarea} ${errors.allergenDetails ? styles.inputError : ''}`}
                placeholder="Describe specific allergens and severity"
                rows={3}
                {...register('allergenDetails')}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Known reactions</label>
              <textarea
                className={`${styles.textarea} ${errors.knownReactions ? styles.inputError : ''}`}
                placeholder="Describe reactions to known allergens"
                rows={3}
                {...register('knownReactions')}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Symptoms to watch for</label>
              <textarea
                className={`${styles.textarea} ${errors.symptoms ? styles.inputError : ''}`}
                placeholder="Describe symptoms that may indicate a reaction"
                rows={3}
                {...register('symptoms')}
              />
            </div>
          </div>
        )}

        <label className={`${styles.medicalToggle} ${watchAirborneAllergies ? styles.medicalToggleActive : ''}`}>
          <span className={styles.medicalToggleLabel}>Does your child have airborne allergies?</span>
          <input type="checkbox" className={styles.medicalToggleSwitch} {...register('airborneAllergies')} />
        </label>

        {watchAirborneAllergies && (
          <div className={styles.conditionalFields}>
            <div className={styles.field}>
              <label className={styles.label}>Airborne allergies (comma-separated)</label>
              <input
                type="text"
                className={`${styles.input} ${errors.allergyDietary_airborneAllergies ? styles.inputError : ''}`}
                placeholder="e.g. Dust, Pollen, Pet dander"
                {...register('allergyDietary_airborneAllergies')}
              />
            </div>
          </div>
        )}

        <div className={styles.field}>
          <label className={styles.label}>Dietary requirements</label>
          <span className={styles.labelHint}>
            List any dietary needs (comma-separated), e.g. Vegetarian, Halal, Gluten-free
          </span>
          <input
            type="text"
            className={`${styles.input} ${errors.allergyDietary_dietaryRequirements ? styles.inputError : ''}`}
            placeholder="e.g. Vegetarian, Halal, Gluten-free"
            {...register('allergyDietary_dietaryRequirements')}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Additional dietary information</label>
          <textarea
            className={`${styles.textarea} ${errors.dietaryRequirements ? styles.inputError : ''}`}
            placeholder="Any other dietary information we should know about"
            rows={2}
            {...register('dietaryRequirements')}
          />
        </div>
      </div>

      <div className={styles.sectionDivider} />

      {/* EpiPen & Medication */}
      <div className={styles.fieldGroup}>
        <h3 className={styles.sectionTitle}>EpiPen &amp; Medication</h3>

        <label className={`${styles.medicalToggle} ${watchEpipenRequired ? styles.medicalToggleActive : ''}`}>
          <span className={styles.medicalToggleLabel}>Does your child carry an EpiPen?</span>
          <input type="checkbox" className={styles.medicalToggleSwitch} {...register('epipenRequired')} />
        </label>

        {watchEpipenRequired && (
          <div className={styles.conditionalFields}>
            <div className={styles.field}>
              <label className={styles.label}>EpiPen details</label>
              <textarea
                className={`${styles.textarea} ${errors.epipenDetails ? styles.inputError : ''}`}
                placeholder="Describe the EpiPen prescription, dosage, and when it should be administered"
                rows={3}
                {...register('epipenDetails')}
              />
            </div>
          </div>
        )}

        <div className={styles.field}>
          <label className={styles.label}>Medication details</label>
          <span className={styles.labelHint}>
            List any medications your child takes regularly or may need during sessions
          </span>
          <textarea
            className={`${styles.textarea} ${errors.medicationDetails ? styles.inputError : ''}`}
            placeholder="e.g. Antihistamines as needed, Inhaler for asthma"
            rows={2}
            {...register('medicationDetails')}
          />
        </div>
      </div>

      <div className={styles.sectionDivider} />

      {/* Medical Conditions */}
      <div className={styles.fieldGroup}>
        <h3 className={styles.sectionTitle}>Medical Conditions</h3>

        <div className={styles.field}>
          <label className={styles.label}>Medical conditions</label>
          <textarea
            className={`${styles.textarea} ${errors.medicalConditions ? styles.inputError : ''}`}
            placeholder="Describe any medical conditions (e.g. asthma, epilepsy, diabetes)"
            rows={3}
            {...register('medicalConditions')}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Additional support needs</label>
          <textarea
            className={`${styles.textarea} ${errors.additionalSupportNeeds ? styles.inputError : ''}`}
            placeholder="Describe any additional support your child may need during sessions"
            rows={3}
            {...register('additionalSupportNeeds')}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Other safety information</label>
          <textarea
            className={`${styles.textarea} ${errors.otherSafetyInfo ? styles.inputError : ''}`}
            placeholder="Anything else we should know to keep your child safe"
            rows={3}
            {...register('otherSafetyInfo')}
          />
        </div>
      </div>

      {/* Navigation */}
      <div className={styles.stepNav}>
        <button type="button" className={styles.stepNavBack} onClick={() => goToStep(1)}>
          ← Back
        </button>
        <button type="submit" className={styles.stepNavNext}>
          Continue →
        </button>
      </div>
    </form>
  );
}
