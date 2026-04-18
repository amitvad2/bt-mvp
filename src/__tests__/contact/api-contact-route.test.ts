import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.hoisted() variables are available inside vi.mock() factories (hoisted to top)
const { mockAdd, mockCollection, mockSendEmail } = vi.hoisted(() => {
    const mockAdd = vi.fn();
    const mockCollection = vi.fn(() => ({ add: mockAdd }));
    const mockSendEmail = vi.fn();
    return { mockAdd, mockCollection, mockSendEmail };
});

vi.mock('@/lib/firebase-admin', () => ({
    adminDb: { collection: mockCollection },
    adminInitError: null,
}));

vi.mock('firebase-admin', () => ({
    firestore: { FieldValue: { serverTimestamp: () => 'SERVER_TIMESTAMP' } },
}));

vi.mock('@/lib/resend', () => ({
    resend: { emails: { send: mockSendEmail } },
}));

import { POST } from '@/app/api/contact/route';

const validBody = {
    name: 'Jane Smith',
    email: 'jane@example.com',
    category: 'general',
    message: 'Hello, I have a question about your classes.',
    consentToReply: true,
};

const makeRequest = (body: object) =>
    new Request('http://localhost/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });

describe('POST /api/contact', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockAdd.mockResolvedValue({ id: 'msg-test-123' });
        mockSendEmail.mockResolvedValue({ data: { id: 'email-1' }, error: null });
    });

    it('returns 400 for invalid payload (missing required fields)', async () => {
        const res = await POST(makeRequest({ name: 'A' }));
        expect(res.status).toBe(400);
        const json = await res.json();
        expect(json.error).toBeTruthy();
    });

    it('returns 400 when email is invalid', async () => {
        const res = await POST(makeRequest({ ...validBody, email: 'not-an-email' }));
        expect(res.status).toBe(400);
    });

    it('returns 400 when consent is false', async () => {
        const res = await POST(makeRequest({ ...validBody, consentToReply: false }));
        expect(res.status).toBe(400);
    });

    it('returns 200 and writes to Firestore for valid payload', async () => {
        const res = await POST(makeRequest(validBody));
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.success).toBe(true);
        expect(json.id).toBe('msg-test-123');

        expect(mockCollection).toHaveBeenCalledWith('contact_messages');
        expect(mockAdd).toHaveBeenCalledWith(
            expect.objectContaining({
                name: 'Jane Smith',
                email: 'jane@example.com',
                category: 'general',
                message: 'Hello, I have a question about your classes.',
                consentToReply: true,
                source: 'contact-page',
                status: 'new',
            })
        );
    });

    it('includes optional phone when provided', async () => {
        await POST(makeRequest({ ...validBody, phone: '+44 7700 000000' }));
        expect(mockAdd).toHaveBeenCalledWith(
            expect.objectContaining({ phone: '+44 7700 000000' })
        );
    });

    it('includes userId when provided', async () => {
        await POST(makeRequest({ ...validBody, userId: 'user-abc' }));
        expect(mockAdd).toHaveBeenCalledWith(
            expect.objectContaining({ userId: 'user-abc' })
        );
    });

    it('does not include userId when not provided', async () => {
        await POST(makeRequest(validBody));
        const callArg = mockAdd.mock.calls[0][0];
        expect(callArg).not.toHaveProperty('userId');
    });

    it('returns success even if email notification fails', async () => {
        mockSendEmail.mockRejectedValueOnce(new Error('Resend error'));
        const res = await POST(makeRequest(validBody));
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.success).toBe(true);
    });

    it('sends notification email on valid submission', async () => {
        await POST(makeRequest(validBody));
        expect(mockSendEmail).toHaveBeenCalledTimes(1);
    });

    it('sends email to bloomingtastebuds@gmail.com when no env override is set', async () => {
        delete process.env.RESEND_ADMIN_EMAIL;
        await POST(makeRequest(validBody));
        expect(mockSendEmail).toHaveBeenCalledWith(
            expect.objectContaining({ to: ['bloomingtastebuds@gmail.com'] })
        );
    });

    it('sends email with replyTo set to the submitter email', async () => {
        await POST(makeRequest(validBody));
        expect(mockSendEmail).toHaveBeenCalledWith(
            expect.objectContaining({ replyTo: 'jane@example.com' })
        );
    });

    it('does not send email when payload is invalid', async () => {
        await POST(makeRequest({ name: 'A' }));
        expect(mockSendEmail).not.toHaveBeenCalled();
    });
});
