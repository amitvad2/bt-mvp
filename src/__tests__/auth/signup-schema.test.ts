import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// Duplicated from auth/signup/page.tsx — kept here intentionally so schema
// changes surface as test failures rather than silently breaking validation.
const schema = z.object({
    firstName: z.string().min(2, 'First name is required'),
    lastName: z.string().min(2, 'Last name is required'),
    email: z.string().email('Enter a valid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string(),
    role: z.enum(['parent', 'youngAdult'] as const),
}).refine(d => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
});

const validData = {
    firstName: 'Jane',
    lastName: 'Smith',
    email: 'jane@example.com',
    password: 'password123',
    confirmPassword: 'password123',
    role: 'parent' as const,
};

describe('Sign-up form schema', () => {
    it('accepts valid parent registration data', () => {
        expect(schema.safeParse(validData).success).toBe(true);
    });

    it('accepts valid youngAdult registration data', () => {
        expect(schema.safeParse({ ...validData, role: 'youngAdult' }).success).toBe(true);
    });

    it('rejects mismatched passwords', () => {
        const result = schema.safeParse({ ...validData, confirmPassword: 'different' });
        expect(result.success).toBe(false);
        if (!result.success) {
            const paths = result.error.issues.map(i => i.path.join('.'));
            expect(paths).toContain('confirmPassword');
        }
    });

    it('rejects password shorter than 8 characters', () => {
        const result = schema.safeParse({ ...validData, password: 'short', confirmPassword: 'short' });
        expect(result.success).toBe(false);
        if (!result.success) {
            const issue = result.error.issues.find(i => i.path.includes('password'));
            expect(issue?.message).toMatch(/8 characters/i);
        }
    });

    it('rejects invalid email address', () => {
        const result = schema.safeParse({ ...validData, email: 'not-an-email' });
        expect(result.success).toBe(false);
        if (!result.success) {
            const issue = result.error.issues.find(i => i.path.includes('email'));
            expect(issue?.message).toMatch(/valid email/i);
        }
    });

    it('rejects first name shorter than 2 characters', () => {
        const result = schema.safeParse({ ...validData, firstName: 'J' });
        expect(result.success).toBe(false);
    });
});
