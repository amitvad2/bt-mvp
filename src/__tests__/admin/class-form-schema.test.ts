import { describe, it, expect } from 'vitest';
import { classFormSchema, ClassFormData } from '@/app/admin/classes/schema';

describe('classFormSchema', () => {
    const validPerSessionData: ClassFormData = {
        type: 'kidsAfterSchool',
        dayOfWeek: 'Monday',
        startTime: '15:30',
        endTime: '16:30',
        ageMin: 5,
        ageMax: 12,
        maxSize: 15,
        instructor: 'John Doe',
        venueId: 'venue-1',
        price: 1500,
        commitment: 'perSession',
        termStartDate: '',
        termEndDate: '',
        termPrice: undefined,
        recurrenceDays: [],
    };

    const validTermData: ClassFormData = {
        type: 'kidsAfterSchool',
        dayOfWeek: 'Monday',
        startTime: '15:30',
        endTime: '16:30',
        ageMin: 5,
        ageMax: 12,
        maxSize: 15,
        instructor: 'John Doe',
        venueId: 'venue-1',
        price: 1500,
        commitment: 'term',
        termStartDate: '2025-01-06',
        termEndDate: '2025-03-28',
        termPrice: 12000,
        recurrenceDays: ['Monday', 'Wednesday', 'Friday'],
    };

    describe('per-session commitment', () => {
        it('accepts valid per-session data', () => {
            const result = classFormSchema.safeParse(validPerSessionData);
            expect(result.success).toBe(true);
        });

        it('does not require term fields for per-session', () => {
            const data = { ...validPerSessionData, termStartDate: undefined, termEndDate: undefined, termPrice: undefined, recurrenceDays: undefined };
            const result = classFormSchema.safeParse(data);
            expect(result.success).toBe(true);
        });

        it('rejects missing type', () => {
            const data = { ...validPerSessionData, type: '' };
            const result = classFormSchema.safeParse(data);
            expect(result.success).toBe(false);
        });

        it('rejects missing venueId', () => {
            const data = { ...validPerSessionData, venueId: '' };
            const result = classFormSchema.safeParse(data);
            expect(result.success).toBe(false);
        });
    });

    describe('term commitment', () => {
        it('accepts valid term data', () => {
            const result = classFormSchema.safeParse(validTermData);
            expect(result.success).toBe(true);
        });

        it('rejects when termEndDate is before termStartDate', () => {
            const data = { ...validTermData, termStartDate: '2025-03-28', termEndDate: '2025-01-06' };
            const result = classFormSchema.safeParse(data);
            expect(result.success).toBe(false);
            if (!result.success) {
                const termEndError = result.error.issues.find(i => i.path.includes('termEndDate'));
                expect(termEndError).toBeDefined();
                expect(termEndError?.message).toBe('Term end date must be after start date');
            }
        });

        it('rejects when termEndDate equals termStartDate', () => {
            const data = { ...validTermData, termStartDate: '2025-03-01', termEndDate: '2025-03-01' };
            const result = classFormSchema.safeParse(data);
            expect(result.success).toBe(false);
            if (!result.success) {
                const termEndError = result.error.issues.find(i => i.path.includes('termEndDate'));
                expect(termEndError).toBeDefined();
            }
        });

        it('rejects termPrice of 0', () => {
            const data = { ...validTermData, termPrice: 0 };
            const result = classFormSchema.safeParse(data);
            expect(result.success).toBe(false);
            if (!result.success) {
                const priceError = result.error.issues.find(i => i.path.includes('termPrice'));
                expect(priceError).toBeDefined();
                expect(priceError?.message).toBe('Term price must be greater than 0');
            }
        });

        it('rejects negative termPrice', () => {
            const data = { ...validTermData, termPrice: -100 };
            const result = classFormSchema.safeParse(data);
            expect(result.success).toBe(false);
            if (!result.success) {
                const priceError = result.error.issues.find(i => i.path.includes('termPrice'));
                expect(priceError).toBeDefined();
            }
        });

        it('accepts empty recurrenceDays', () => {
            const data = { ...validTermData, recurrenceDays: [] };
            const result = classFormSchema.safeParse(data);
            expect(result.success).toBe(true);
        });

        it('rejects missing termStartDate', () => {
            const data = { ...validTermData, termStartDate: '' };
            const result = classFormSchema.safeParse(data);
            expect(result.success).toBe(false);
            if (!result.success) {
                const startError = result.error.issues.find(i => i.path.includes('termStartDate'));
                expect(startError).toBeDefined();
            }
        });

        it('rejects missing termEndDate', () => {
            const data = { ...validTermData, termEndDate: '' };
            const result = classFormSchema.safeParse(data);
            expect(result.success).toBe(false);
            if (!result.success) {
                const endError = result.error.issues.find(i => i.path.includes('termEndDate'));
                expect(endError).toBeDefined();
            }
        });

        it('rejects undefined termPrice', () => {
            const data = { ...validTermData, termPrice: undefined };
            const result = classFormSchema.safeParse(data);
            expect(result.success).toBe(false);
        });

        it('accepts undefined recurrenceDays', () => {
            const data = { ...validTermData, recurrenceDays: undefined };
            const result = classFormSchema.safeParse(data);
            expect(result.success).toBe(true);
        });

        it('accepts a single recurrence day', () => {
            const data = { ...validTermData, recurrenceDays: ['Saturday'] };
            const result = classFormSchema.safeParse(data);
            expect(result.success).toBe(true);
        });

        it('accepts termPrice of 1 (minimum valid)', () => {
            const data = { ...validTermData, termPrice: 1 };
            const result = classFormSchema.safeParse(data);
            expect(result.success).toBe(true);
        });
    });
});
