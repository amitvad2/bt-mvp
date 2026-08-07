import { describe, it, expect } from 'vitest';
import { determineSafetyReviewStatus, validateChildAge } from '@/lib/guest-validation';

describe('determineSafetyReviewStatus', () => {
  describe('returns "pending" for high-risk declarations', () => {
    it('returns "pending" when foodAllergies is true', () => {
      const draft = {
        medicalInfo: {
          foodAllergies: true,
          epipenRequired: false,
          respiratoryProblems: false,
          airborneAllergies: false,
          medicalConditions: '',
          dietaryRequirements: '',
          allergenDetails: '',
          knownReactions: '',
          symptoms: '',
          epipenDetails: '',
          medicationDetails: '',
          recentOperations: '',
          visionImpairment: false,
          hearingImpairment: false,
          additionalSupportNeeds: '',
          otherSafetyInfo: '',
        },
      };
      expect(determineSafetyReviewStatus(draft)).toBe('pending');
    });

    it('returns "pending" when epipenRequired is true', () => {
      const draft = {
        medicalInfo: {
          foodAllergies: false,
          epipenRequired: true,
          respiratoryProblems: false,
          airborneAllergies: false,
          medicalConditions: '',
          dietaryRequirements: '',
          allergenDetails: '',
          knownReactions: '',
          symptoms: '',
          epipenDetails: '',
          medicationDetails: '',
          recentOperations: '',
          visionImpairment: false,
          hearingImpairment: false,
          additionalSupportNeeds: '',
          otherSafetyInfo: '',
        },
      };
      expect(determineSafetyReviewStatus(draft)).toBe('pending');
    });

    it('returns "pending" when respiratoryProblems is true', () => {
      const draft = {
        medicalInfo: {
          foodAllergies: false,
          epipenRequired: false,
          respiratoryProblems: true,
          airborneAllergies: false,
          medicalConditions: '',
          dietaryRequirements: '',
          allergenDetails: '',
          knownReactions: '',
          symptoms: '',
          epipenDetails: '',
          medicationDetails: '',
          recentOperations: '',
          visionImpairment: false,
          hearingImpairment: false,
          additionalSupportNeeds: '',
          otherSafetyInfo: '',
        },
      };
      expect(determineSafetyReviewStatus(draft)).toBe('pending');
    });

    it('returns "pending" when airborneAllergies is true', () => {
      const draft = {
        medicalInfo: {
          foodAllergies: false,
          epipenRequired: false,
          respiratoryProblems: false,
          airborneAllergies: true,
          medicalConditions: '',
          dietaryRequirements: '',
          allergenDetails: '',
          knownReactions: '',
          symptoms: '',
          epipenDetails: '',
          medicationDetails: '',
          recentOperations: '',
          visionImpairment: false,
          hearingImpairment: false,
          additionalSupportNeeds: '',
          otherSafetyInfo: '',
        },
      };
      expect(determineSafetyReviewStatus(draft)).toBe('pending');
    });

    it('returns "pending" when medicalConditions is non-empty', () => {
      const draft = {
        medicalInfo: {
          foodAllergies: false,
          epipenRequired: false,
          respiratoryProblems: false,
          airborneAllergies: false,
          medicalConditions: 'Asthma',
          dietaryRequirements: '',
          allergenDetails: '',
          knownReactions: '',
          symptoms: '',
          epipenDetails: '',
          medicationDetails: '',
          recentOperations: '',
          visionImpairment: false,
          hearingImpairment: false,
          additionalSupportNeeds: '',
          otherSafetyInfo: '',
        },
      };
      expect(determineSafetyReviewStatus(draft)).toBe('pending');
    });
  });

  describe('returns "not_required" for no high-risk declarations', () => {
    it('returns "not_required" when all flags are false and medicalConditions is empty', () => {
      const draft = {
        medicalInfo: {
          foodAllergies: false,
          epipenRequired: false,
          respiratoryProblems: false,
          airborneAllergies: false,
          medicalConditions: '',
          dietaryRequirements: '',
          allergenDetails: '',
          knownReactions: '',
          symptoms: '',
          epipenDetails: '',
          medicationDetails: '',
          recentOperations: '',
          visionImpairment: false,
          hearingImpairment: false,
          additionalSupportNeeds: '',
          otherSafetyInfo: '',
        },
      };
      expect(determineSafetyReviewStatus(draft)).toBe('not_required');
    });

    it('returns "not_required" when medicalConditions is only whitespace', () => {
      const draft = {
        medicalInfo: {
          foodAllergies: false,
          epipenRequired: false,
          respiratoryProblems: false,
          airborneAllergies: false,
          medicalConditions: '   ',
          dietaryRequirements: '',
          allergenDetails: '',
          knownReactions: '',
          symptoms: '',
          epipenDetails: '',
          medicationDetails: '',
          recentOperations: '',
          visionImpairment: false,
          hearingImpairment: false,
          additionalSupportNeeds: '',
          otherSafetyInfo: '',
        },
      };
      expect(determineSafetyReviewStatus(draft)).toBe('not_required');
    });
  });

  describe('handles edge cases gracefully', () => {
    it('returns "not_required" when medicalInfo is undefined', () => {
      const draft = {};
      expect(determineSafetyReviewStatus(draft)).toBe('not_required');
    });
  });
});
