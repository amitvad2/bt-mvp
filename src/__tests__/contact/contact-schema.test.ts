import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// Mirrors the schema in ContactForm.tsx and api/contact/route.ts
const schema = z.object({
    name: z.string().min(2, 'Name is required'),
    email: z.string().email('Enter a valid email address'),
    phone: z.string().optional(),
    category: z.enum(['general', 'class-info', 'booking-help', 'dietary-allergy', 'private-event', 'technical', 'feedback'] as const, {
        errorMap: () => ({ message: 'Please select an enquiry type' }),
    }),
    message: z.string().min(10, 'Please enter at least 10 characters'),
    consentToReply: z.boolean().refine(v => v === true, { message: 'Please consent to being contacted back' }),
});

const validPayload = {
    name: 'Jane Smith',
    email: 'jane@example.com',
    category: 'general' as const,
    message: 'Hello, I have a question about your classes.',
    consentToReply: true,
};

describe('Contact form schema', () => {
    it('accepts a valid full payload', () => {
        expect(schema.safeParse(validPayload).success).toBe(true);
    });

    it('accepts payload without optional phone', () => {
        const { phone, ...withoutPhone } = { ...validPayload, phone: undefined };
        expect(schema.safeParse(withoutPhone).success).toBe(true);
    });

    it('accepts payload with optional phone provided', () => {
        expect(schema.safeParse({ ...validPayload, phone: '+44 7700 000000' }).success).toBe(true);
    });

    it('rejects invalid email', () => {
        const result = schema.safeParse({ ...validPayload, email: 'not-an-email' });
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues.some(i => i.path.includes('email'))).toBe(true);
        }
    });

    it('rejects name shorter than 2 characters', () => {
        const result = schema.safeParse({ ...validPayload, name: 'J' });
        expect(result.success).toBe(false);
    });

    it('rejects message shorter than 10 characters', () => {
        const result = schema.safeParse({ ...validPayload, message: 'Hi' });
        expect(result.success).toBe(false);
        if (!result.success) {
            const issue = result.error.issues.find(i => i.path.includes('message'));
            expect(issue?.message).toMatch(/10 characters/i);
        }
    });

    it('rejects when consent is false', () => {
        const result = schema.safeParse({ ...validPayload, consentToReply: false });
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues.some(i => i.path.includes('consentToReply'))).toBe(true);
        }
    });

    it('rejects invalid category', () => {
        const result = schema.safeParse({ ...validPayload, category: 'not-a-category' });
        expect(result.success).toBe(false);
    });

    it('accepts all valid category values', () => {
        const categories = ['general', 'class-info', 'booking-help', 'dietary-allergy', 'private-event', 'technical', 'feedback'] as const;
        categories.forEach(category => {
            expect(schema.safeParse({ ...validPayload, category }).success).toBe(true);
        });
    });
});
