import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Bug Condition Exploration Test — Cancellation Emails Missing Admin CC
 *
 * **Validates: Requirements 1.1, 1.2, 2.1, 2.2, 2.3**
 *
 * These tests are EXPECTED TO FAIL on unfixed code. Failure confirms the bug exists:
 * `resend.emails.send()` is currently called without a `cc` field for cancellation emails.
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

const ADMIN_EMAIL = 'bloomingtastebuds@gmail.com';

function makeRequest(body: object): Request {
    return new Request('http://localhost/api/emails/send', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer valid-test-token',
        },
        body: JSON.stringify(body),
    });
}

describe('Bug Condition: Cancellation Emails Missing Admin CC', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockVerifyIdToken.mockResolvedValue({ uid: 'user-123', email: 'user@example.com' });
        mockSendEmail.mockResolvedValue({ data: { id: 'email-1' }, error: null });
        process.env.RESEND_API_KEY = 'test_api_key';
        process.env.RESEND_FROM_EMAIL = 'noreply@bloomingtastebuds.com';
        process.env.RESEND_ADMIN_EMAIL = ADMIN_EMAIL;
    });

    afterEach(() => {
        delete process.env.RESEND_ADMIN_EMAIL;
    });

    it('should CC admin on cancellation emails when RESEND_ADMIN_EMAIL is configured', async () => {
        const res = await POST(
            makeRequest({
                to: 'parent@example.com',
                subject: 'Booking Cancelled',
                type: 'cancellation',
                data: {
                    className: 'After School Club',
                    sessionDate: '2025-02-10',
                    venueName: 'Community Hall',
                },
            })
        );

        expect(res.status).toBe(200);
        expect(mockSendEmail).toHaveBeenCalledTimes(1);

        const sendArgs = mockSendEmail.mock.calls[0][0];
        // Bug condition: cc field should contain admin email but it's currently missing
        expect(sendArgs).toHaveProperty('cc');
        expect(sendArgs.cc).toContain(ADMIN_EMAIL);
    });

    it('should CC admin on bundle-cancellation emails when RESEND_ADMIN_EMAIL is configured', async () => {
        const res = await POST(
            makeRequest({
                to: 'youngadult@example.com',
                subject: 'Bundle Cancellation Confirmed',
                type: 'bundle-cancellation',
                data: {
                    bundleName: 'Weekend Cooking Bundle',
                    studentName: 'Alex Smith',
                    sessions: [
                        { date: '2025-03-01', startTime: '10:30', endTime: '12:30', venueName: 'Main Kitchen' },
                        { date: '2025-03-08', startTime: '10:30', endTime: '12:30', venueName: 'Main Kitchen' },
                    ],
                },
            })
        );

        expect(res.status).toBe(200);
        expect(mockSendEmail).toHaveBeenCalledTimes(1);

        const sendArgs = mockSendEmail.mock.calls[0][0];
        // Bug condition: cc field should contain admin email but it's currently missing
        expect(sendArgs).toHaveProperty('cc');
        expect(sendArgs.cc).toContain(ADMIN_EMAIL);
    });

    it('should send cancellation email without CC and log warning when RESEND_ADMIN_EMAIL is not set', async () => {
        delete process.env.RESEND_ADMIN_EMAIL;

        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const res = await POST(
            makeRequest({
                to: 'parent@example.com',
                subject: 'Booking Cancelled',
                type: 'cancellation',
                data: {
                    className: 'After School Club',
                    sessionDate: '2025-02-10',
                    venueName: 'Community Hall',
                },
            })
        );

        expect(res.status).toBe(200);
        expect(mockSendEmail).toHaveBeenCalledTimes(1);

        const sendArgs = mockSendEmail.mock.calls[0][0];
        // Email should still be sent to the user
        expect(sendArgs.to).toContain('parent@example.com');
        // CC should NOT be present when admin email is not configured
        expect(sendArgs.cc).toBeUndefined();
        // A warning should be logged about missing admin email
        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining('RESEND_ADMIN_EMAIL')
        );

        warnSpy.mockRestore();
    });
});
