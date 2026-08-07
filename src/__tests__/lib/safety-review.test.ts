import { describe, it, expect } from 'vitest';
import { determineSafetyReviewStatus } from '@/lib/safety-review';

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
                },
            };
            expect(determineSafetyReviewStatus(draft)).toBe('pending');
        });

        it('returns "pending" when multiple high-risk declarations are present', () => {
            const draft = {
                medicalInfo: {
                    foodAllergies: true,
                    epipenRequired: true,
                    respiratoryProblems: true,
                    airborneAllergies: true,
                    medicalConditions: 'Severe asthma and nut allergy',
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

        it('returns "not_required" when medicalInfo is null', () => {
            const draft = { medicalInfo: null };
            expect(determineSafetyReviewStatus(draft)).toBe('not_required');
        });

        it('returns "not_required" when medicalInfo has no boolean fields', () => {
            const draft = {
                medicalInfo: {
                    dietaryRequirements: 'Vegetarian',
                },
            };
            expect(determineSafetyReviewStatus(draft)).toBe('not_required');
        });

        it('returns "not_required" when medicalConditions is undefined', () => {
            const draft = {
                medicalInfo: {
                    foodAllergies: false,
                    epipenRequired: false,
                    respiratoryProblems: false,
                    airborneAllergies: false,
                },
            };
            expect(determineSafetyReviewStatus(draft)).toBe('not_required');
        });
    });
});
