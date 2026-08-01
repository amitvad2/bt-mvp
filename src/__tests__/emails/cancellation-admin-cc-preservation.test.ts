import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Property 2: Preservation — Confirmation and Error Behaviour Unchanged
 *
 * These tests capture the EXISTING behaviour of the email send route on unfixed code.
 * They verify that non-cancellation email types, auth failures, missing fields, and
 * missing API key all behave exactly as they do today. After the fix is applied,
 * these tests must continue to pass (no regressions).
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
 */

const { mockSendEmail, mockVerifyIdToken } = vi.hoisted(() => {
    const mockSendEmail = vi.fn();
    const mockVerifyIdToken = vi.fn();
    return { mockSendEmail, mockVerifyIdToken };
});

vi.mock('@/lib/resend', () => ({
    resend: { emails: { send: mockSendEmail } },
}));

vi.mock('@/lib/firebase-admin', () => ({
    adminAuth: { verifyIdToken: mockVerifyIdToken },
    adminInitError: null,
}));

import { POST } from '@/app/api/emails/send/route';

const makeRequest = (body: object, headers: Record<string, string> = {}) =>
    new Request('http://localhost/api/emails/send', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...headers,
        },
        body: JSON.stringify(body),
    });

const validConfirmationBody = {
    to: 'parent@example.com',
    subject: 'Booking Confirmed',
    type: 'confirmation',
    data: {
        className: 'After School Club',
        sessionDate: '2025-03-15',
        venueName: 'Community Hall',
        studentName: 'Alice',
    },
};

describe('Property 2: Preservation — Confirmation and Error Behaviour Unchanged', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        vi.clearAllMocks();
        process.env = { ...originalEnv };
        process.env.RESEND_API_KEY = 'test_api_key';
        process.env.RESEND_FROM_EMAIL = 'test@bloomingtastebuds.co.uk';
        process.env.RESEND_ADMIN_EMAIL = 'admin@bloomingtastebuds.co.uk';
        mockVerifyIdToken.mockResolvedValue({ uid: 'user-123' });
        mockSendEmail.mockResolvedValue({ data: { id: 'email-123' }, error: null });
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    describe('Confirmation emails send without cc field', () => {
        it('sends confirmation email with no cc field', async () => {
            const req = makeRequest(validConfirmationBody, {
                Authorization: 'Bearer valid-token',
            });

            const res = await POST(req);
            expect(res.status).toBe(200);

            expect(mockSendEmail).toHaveBeenCalledTimes(1);
            const sendArgs = mockSendEmail.mock.calls[0][0];
            expect(sendArgs).not.toHaveProperty('cc');
            expect(sendArgs.to).toEqual(['parent@example.com']);
            expect(sendArgs.subject).toBe('Booking Confirmed');
        });

        it('sends to only the specified recipient for confirmation type', async () => {
            const req = makeRequest(validConfirmationBody, {
                Authorization: 'Bearer valid-token',
            });

            await POST(req);

            const sendArgs = mockSendEmail.mock.calls[0][0];
            expect(sendArgs.to).toEqual(['parent@example.com']);
            expect(sendArgs.cc).toBeUndefined();
        });
    });

    describe('Missing required fields return 400', () => {
        it('returns 400 when "to" is missing', async () => {
            const req = makeRequest(
                { subject: 'Test', type: 'confirmation', data: {} },
                { Authorization: 'Bearer valid-token' }
            );

            const res = await POST(req);
            expect(res.status).toBe(400);
            const json = await res.json();
            expect(json.error).toBe('Missing required fields');
        });

        it('returns 400 when "subject" is missing', async () => {
            const req = makeRequest(
                { to: 'user@example.com', type: 'confirmation', data: {} },
                { Authorization: 'Bearer valid-token' }
            );

            const res = await POST(req);
            expect(res.status).toBe(400);
            const json = await res.json();
            expect(json.error).toBe('Missing required fields');
        });

        it('returns 400 when "type" is missing', async () => {
            const req = makeRequest(
                { to: 'user@example.com', subject: 'Test', data: {} },
                { Authorization: 'Bearer valid-token' }
            );

            const res = await POST(req);
            expect(res.status).toBe(400);
            const json = await res.json();
            expect(json.error).toBe('Missing required fields');
        });

        it('returns 400 for cancellation type with missing required fields', async () => {
            const req = makeRequest(
                { type: 'cancellation', data: {} },
                { Authorization: 'Bearer valid-token' }
            );

            const res = await POST(req);
            expect(res.status).toBe(400);
            const json = await res.json();
            expect(json.error).toBe('Missing required fields');
        });
    });

    describe('Missing or invalid auth returns 401', () => {
        it('returns 401 when Authorization header is missing', async () => {
            const req = makeRequest(validConfirmationBody);

            const res = await POST(req);
            expect(res.status).toBe(401);
            const json = await res.json();
            expect(json.error).toBe('Unauthorised');
        });

        it('returns 401 when Authorization header does not start with Bearer', async () => {
            const req = makeRequest(validConfirmationBody, {
                Authorization: 'Basic abc123',
            });

            const res = await POST(req);
            expect(res.status).toBe(401);
            const json = await res.json();
            expect(json.error).toBe('Unauthorised');
        });

        it('returns 401 when token verification fails', async () => {
            mockVerifyIdToken.mockRejectedValueOnce(new Error('Invalid token'));
            const req = makeRequest(validConfirmationBody, {
                Authorization: 'Bearer invalid-token',
            });

            const res = await POST(req);
            expect(res.status).toBe(401);
            const json = await res.json();
            expect(json.error).toBe('Unauthorised');
        });

        it('returns 401 regardless of email type when auth is missing', async () => {
            const cancellationBody = {
                to: 'user@example.com',
                subject: 'Cancelled',
                type: 'cancellation',
                data: {},
            };
            const req = makeRequest(cancellationBody);

            const res = await POST(req);
            expect(res.status).toBe(401);
        });
    });

    describe('Missing RESEND_API_KEY returns 500', () => {
        it('returns 500 when RESEND_API_KEY is not set', async () => {
            delete process.env.RESEND_API_KEY;

            const req = makeRequest(validConfirmationBody, {
                Authorization: 'Bearer valid-token',
            });

            const res = await POST(req);
            expect(res.status).toBe(500);
            const json = await res.json();
            expect(json.error).toContain('Email service not configured');
        });

        it('returns 500 when RESEND_API_KEY is placeholder value', async () => {
            process.env.RESEND_API_KEY = 're_placeholder';

            const req = makeRequest(validConfirmationBody, {
                Authorization: 'Bearer valid-token',
            });

            const res = await POST(req);
            expect(res.status).toBe(500);
            const json = await res.json();
            expect(json.error).toContain('Email service not configured');
        });

        it('returns 500 for cancellation type when RESEND_API_KEY is missing', async () => {
            delete process.env.RESEND_API_KEY;

            const cancellationBody = {
                to: 'user@example.com',
                subject: 'Booking Cancelled',
                type: 'cancellation',
                data: { className: 'Test', sessionDate: '2025-01-01', venueName: 'Hall' },
            };

            const req = makeRequest(cancellationBody, {
                Authorization: 'Bearer valid-token',
            });

            const res = await POST(req);
            expect(res.status).toBe(500);
            const json = await res.json();
            expect(json.error).toContain('Email service not configured');
        });
    });
});
