import { SafetyReviewStatus } from '@/types';

/**
 * Determines the safety review status for a guest booking based on
 * medical/allergy declarations in the booking draft.
 *
 * Returns 'pending' if any high-risk declarations are present:
 * - foodAllergies === true
 * - epipenRequired === true
 * - respiratoryProblems === true
 * - airborneAllergies === true
 * - medicalConditions is non-empty
 *
 * Returns 'not_required' otherwise.
 */
export function determineSafetyReviewStatus(draft: any): SafetyReviewStatus {
    const medical = draft.medicalInfo;
    const hasHighRiskDeclarations =
        medical?.foodAllergies === true ||
        medical?.epipenRequired === true ||
        medical?.respiratoryProblems === true ||
        medical?.airborneAllergies === true ||
        (medical?.medicalConditions && medical.medicalConditions.trim().length > 0);

    return hasHighRiskDeclarations ? 'pending' : 'not_required';
}
