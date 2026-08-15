/**
 * Guest booking validation utilities.
 */

import { SafetyReviewStatus, GuestMedicalInfo, GuestConsentRecord, ConsentAudit, BookingSource } from '@/types';

/**
 * Input data required to build a consent audit record.
 */
export interface BuildConsentAuditInput {
  consents: GuestConsentRecord;
  parentFirstName: string;
  parentLastName: string;
  termsVersion: string;
  privacyNoticeVersion: string;
  source: BookingSource;
}

/**
 * Builds a ConsentAudit object from form submission data.
 * The acceptedAt and submissionTimestamp fields are set to placeholder strings
 * ('SERVER_TIMESTAMP') since actual Firestore server timestamps are applied
 * at write time in the route handler.
 *
 * Validates: Requirements 6.5, 20.1–20.7
 *
 * @param input - The consent audit input data from the form submission
 * @returns A ConsentAudit object with all required fields populated
 */
export function buildConsentAudit(input: BuildConsentAuditInput): ConsentAudit {
  return {
    consents: input.consents,
    acceptedAt: 'SERVER_TIMESTAMP',
    acceptedBy: `${input.parentFirstName} ${input.parentLastName}`,
    termsVersion: input.termsVersion,
    privacyNoticeVersion: input.privacyNoticeVersion,
    sourceChannel: input.source,
    submissionTimestamp: 'SERVER_TIMESTAMP',
  };
}

/**
 * Calculates the child's age at the session date using standard birthday-based
 * calculation (years since DOB where the birthday has occurred on or before the session date).
 *
 * Returns true if the calculated age is within [ageMin, ageMax] inclusive.
 *
 * @param dateOfBirth - Child's date of birth in YYYY-MM-DD format
 * @param sessionDate - Session date in YYYY-MM-DD format
 * @param ageMin - Minimum eligible age (inclusive)
 * @param ageMax - Maximum eligible age (inclusive)
 */
export function validateChildAge(
  dateOfBirth: string,
  sessionDate: string,
  ageMin: number,
  ageMax: number
): boolean {
  const dob = new Date(dateOfBirth);
  const session = new Date(sessionDate);

  // Calculate age at session date (standard birthday-based calculation)
  let age = session.getFullYear() - dob.getFullYear();
  const monthDiff = session.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && session.getDate() < dob.getDate())) {
    age--;
  }

  return age >= ageMin && age <= ageMax;
}

/**
 * Determines the safety review status based on medical declarations in the draft.
 *
 * Handles BOTH medical info shapes:
 * - GuestMedicalInfo (guest bookings): foodAllergies, epipenRequired, airborneAllergies, medicalConditions
 * - MedicalInfo (authenticated bookings): allergies, conditions, respiratoryProblems
 *
 * Returns 'pending' if any high-risk declarations are present.
 * Returns 'not_required' otherwise.
 *
 * Validates: Requirements 13.1, 13.2
 *
 * @param draft - Object with a medicalInfo property (either GuestMedicalInfo or MedicalInfo shape)
 */
export function determineSafetyReviewStatus(
  draft: { medicalInfo?: GuestMedicalInfo | Record<string, any> }
): SafetyReviewStatus {
  const medical = draft.medicalInfo as Record<string, any> | undefined;
  if (!medical) return 'not_required';

  const hasHighRiskDeclarations =
    // Guest medical info fields (GuestMedicalInfo shape)
    medical.foodAllergies === true ||
    medical.epipenRequired === true ||
    medical.airborneAllergies === true ||
    (medical.medicalConditions != null && typeof medical.medicalConditions === 'string' && medical.medicalConditions.trim().length > 0) ||
    // Authenticated medical info fields (MedicalInfo shape)
    medical.allergies === true ||
    medical.conditions === true ||
    // Shared field (exists on both shapes)
    medical.respiratoryProblems === true;

  return hasHighRiskDeclarations ? 'pending' : 'not_required';
}
