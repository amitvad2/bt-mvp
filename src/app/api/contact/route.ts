import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminDb, adminInitError } from '@/lib/firebase-admin';
import * as admin from 'firebase-admin';
import { resend } from '@/lib/resend';

const schema = z.object({
    name: z.string().min(2, 'Name is required'),
    email: z.string().email('Enter a valid email address'),
    phone: z.string().optional(),
    category: z.enum(['general', 'class-info', 'booking-help', 'dietary-allergy', 'private-event', 'technical', 'feedback']),
    message: z.string().min(10, 'Please enter at least 10 characters'),
    consentToReply: z.boolean().refine(v => v === true, { message: 'Consent is required' }),
    userId: z.string().optional(),
});

export async function POST(req: Request) {
    try {
        if (adminInitError) {
            console.error('[contact] Firebase Admin SDK error:', adminInitError);
            return NextResponse.json({ error: 'Service temporarily unavailable' }, { status: 500 });
        }

        const body = await req.json();
        const result = schema.safeParse(body);

        if (!result.success) {
            return NextResponse.json(
                { error: 'Invalid submission', issues: result.error.flatten().fieldErrors },
                { status: 400 }
            );
        }

        const { name, email, phone, category, message, consentToReply, userId } = result.data;

        const docData: Record<string, any> = {
            name,
            email,
            category,
            message,
            consentToReply,
            source: 'contact-page',
            status: 'new',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        if (phone) docData.phone = phone;
        if (userId) docData.userId = userId;

        const ref = await adminDb.collection('contact_messages').add(docData);
        console.log('[contact] Saved message:', ref.id);

        // Send admin notification — errors here do not fail the submission
        try {
            const adminEmail = process.env.RESEND_ADMIN_EMAIL || 'bloomingtastebuds@gmail.com';
            const fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
            const categoryLabel: Record<string, string> = {
                'general': 'General enquiry',
                'class-info': 'Class information',
                'booking-help': 'Booking help',
                'dietary-allergy': 'Dietary / allergy question',
                'private-event': 'Private event / school enquiry',
                'technical': 'Technical issue',
                'feedback': 'Feedback',
            };
            const submittedAt = new Date().toLocaleString('en-GB', {
                dateStyle: 'full', timeStyle: 'short', timeZone: 'Europe/London',
            });
            await resend.emails.send({
                from: `Blooming Tastebuds <${fromEmail}>`,
                to: [adminEmail],
                replyTo: email,
                subject: `New Contact Form Submission — ${categoryLabel[category] ?? category}`,
                html: `
                    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;border:1px solid #eee;border-radius:12px;">
                        <h2 style="color:#FF6B6B;margin-top:0;">New Contact Form Submission</h2>
                        <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
                            <tr><td style="padding:6px 0;color:#6b7280;width:130px;">From</td><td style="padding:6px 0;font-weight:600;">${name}</td></tr>
                            <tr><td style="padding:6px 0;color:#6b7280;">Email</td><td style="padding:6px 0;"><a href="mailto:${email}" style="color:#FF6B6B;">${email}</a></td></tr>
                            ${phone ? `<tr><td style="padding:6px 0;color:#6b7280;">Phone</td><td style="padding:6px 0;">${phone}</td></tr>` : ''}
                            <tr><td style="padding:6px 0;color:#6b7280;">Category</td><td style="padding:6px 0;">${categoryLabel[category] ?? category}</td></tr>
                            <tr><td style="padding:6px 0;color:#6b7280;">Consent to reply</td><td style="padding:6px 0;">${consentToReply ? '✓ Yes' : '✗ No'}</td></tr>
                            <tr><td style="padding:6px 0;color:#6b7280;">Submitted</td><td style="padding:6px 0;">${submittedAt}</td></tr>
                        </table>
                        <div style="background:#f9fafb;padding:16px;border-radius:8px;margin-bottom:16px;">
                            <p style="margin:0;white-space:pre-wrap;color:#111827;">${message}</p>
                        </div>
                        <p style="color:#9ca3af;font-size:12px;margin:0;">
                            Reply to this email to respond directly to ${name}. Or review in the
                            <a href="${process.env.NEXT_PUBLIC_APP_URL || ''}/admin/contact" style="color:#FF6B6B;">admin inbox</a>.
                        </p>
                    </div>
                `,
            });
            console.log('[contact] Admin notification sent to:', adminEmail);
        } catch (emailErr) {
            console.error('[contact] Admin notification email failed (non-fatal):', emailErr);
        }

        return NextResponse.json({ success: true, id: ref.id });
    } catch (err: any) {
        console.error('[contact] Unexpected error:', err);
        return NextResponse.json({ error: 'Failed to send message. Please try again.' }, { status: 500 });
    }
}
