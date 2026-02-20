import { NextResponse } from 'next/server';
import { resend } from '@/lib/resend';

export async function POST(req: Request) {
    try {
        const { to, subject, type, data } = await req.json();

        if (!to || !subject || !type) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        let html = '';

        if (type === 'confirmation') {
            html = `
                <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 12px;">
                    <h1 style="color: #0066CC; font-size: 24px; margin-bottom: 8px;">Booking Confirmed!</h1>
                    <p style="color: #666; font-size: 16px; margin-bottom: 24px;">Your cooking session at Blooming Tastebuds is all set. We can't wait to see you there!</p>
                    
                    <div style="background: #F5F5F7; padding: 20px; border-radius: 12px; margin-bottom: 24px;">
                        <h2 style="font-size: 18px; margin-top: 0;">Session Details</h2>
                        <ul style="list-style: none; padding: 0; margin: 0; color: #333;">
                            <li style="margin-bottom: 8px;"><strong>Class:</strong> ${data.className}</li>
                            <li style="margin-bottom: 8px;"><strong>Date:</strong> ${data.sessionDate}</li>
                            <li style="margin-bottom: 8px;"><strong>Venue:</strong> ${data.venueName}</li>
                            <li style="margin-bottom: 8px;"><strong>Participant:</strong> ${data.studentName}</li>
                        </ul>
                    </div>

                    <p style="color: #666; font-size: 14px; line-height: 1.5;">
                        You can view your booking details and manage your sessions anytime in your <a href="${process.env.NEXT_PUBLIC_APP_URL}/portal/my-classes" style="color: #0066CC;">dashboard</a>.
                    </p>
                    
                    <hr style="border: 0; border-top: 1px solid #eee; margin: 24px 0;" />
                    <p style="color: #999; font-size: 12px; text-align: center;">
                        Blooming Tastebuds — Fun, hands-on cooking classes.
                    </p>
                </div>
            `;
        } else if (type === 'cancellation') {
            html = `
                <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 12px;">
                    <h1 style="color: #D11124; font-size: 24px; margin-bottom: 8px;">Booking Cancelled</h1>
                    <p style="color: #666; font-size: 16px; margin-bottom: 24px;">This is to confirm that your booking for <strong>${data.className}</strong> has been successfully cancelled.</p>
                    
                    <div style="background: #F5F5F7; padding: 20px; border-radius: 12px; margin-bottom: 24px;">
                        <h2 style="font-size: 18px; margin-top: 0;">Details</h2>
                        <ul style="list-style: none; padding: 0; margin: 0; color: #333;">
                            <li style="margin-bottom: 8px;"><strong>Class:</strong> ${data.className}</li>
                            <li style="margin-bottom: 8px;"><strong>Original Date:</strong> ${data.sessionDate}</li>
                            <li style="margin-bottom: 8px;"><strong>Venue:</strong> ${data.venueName}</li>
                        </ul>
                    </div>

                    <p style="color: #666; font-size: 14px; line-height: 1.5;">
                        If this was a mistake, or if you'd like to book a different session, please visit our <a href="${process.env.NEXT_PUBLIC_APP_URL}/portal/find-class" style="color: #0066CC;">class discovery page</a>.
                    </p>
                    
                    <hr style="border: 0; border-top: 1px solid #eee; margin: 24px 0;" />
                    <p style="color: #999; font-size: 12px; text-align: center;">
                        Blooming Tastebuds — We hope to see you again soon!
                    </p>
                </div>
            `;
        }

        if (!process.env.RESEND_API_KEY || process.env.RESEND_API_KEY === 're_placeholder') {
            console.error('Email Error: RESEND_API_KEY is not configured.');
            return NextResponse.json({ error: 'Email service not configured. Please add RESEND_API_KEY to your environment variables.' }, { status: 500 });
        }

        const fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';

        const { data: resData, error } = await resend.emails.send({
            from: `Blooming Tastebuds <${fromEmail}>`,
            to: [to],
            subject: subject,
            html: html,
        });

        if (error) {
            console.error('Resend error:', error);

            // Helpful message for the 403 error when trying to use custom domain without verification
            if (error.name === 'validation_error' && fromEmail !== 'onboarding@resend.dev') {
                return NextResponse.json({
                    error: `Failed to send from ${fromEmail}. Ensure your domain is verified in Resend, or remove RESEND_FROM_EMAIL to use the default onboarding address.`
                }, { status: 400 });
            }

            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, data: resData });
    } catch (err: any) {
        console.error('Email API Error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
