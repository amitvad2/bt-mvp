/**
 * Stripe webhook handler — source of truth for booking creation.
 *
 * Events handled (Stripe test mode):
 *   payment_intent.succeeded     → create booking, decrement spots, send email
 *   payment_intent.payment_failed → mark draft as failed for observability
 *
 * All Firestore writes use Firebase Admin SDK (bypasses security rules).
 *
 * Idempotency: booking document ID = Stripe PaymentIntent ID.
 * Duplicate webhook delivery is handled by checking doc existence inside the transaction.
 */

import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import stripe from '@/lib/stripe';
import { adminDb } from '@/lib/firebase-admin';
import * as admin from 'firebase-admin';
import { resend } from '@/lib/resend';

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(req: Request) {
    // 1. Read the raw body bytes (required for Stripe signature verification)
    const rawBody = await req.arrayBuffer();
    const buf = Buffer.from(rawBody);
    const sig = req.headers.get('stripe-signature') ?? '';

    // 2. Verify signature — reject anything that didn't come from Stripe
    let event: Stripe.Event;
    try {
        if (!webhookSecret) {
            throw new Error('STRIPE_WEBHOOK_SECRET is not configured');
        }
        event = stripe.webhooks.constructEvent(buf, sig, webhookSecret);
    } catch (err: any) {
        console.error('[webhook] Signature verification failed:', err.message);
        return NextResponse.json(
            { error: `Webhook signature error: ${err.message}` },
            { status: 400 }
        );
    }

    console.log(`[webhook] Received event: ${event.type} — ${event.id}`);

    // 3. Dispatch to the appropriate handler
    try {
        switch (event.type) {
            case 'payment_intent.succeeded':
                await handlePaymentIntentSucceeded(
                    event.data.object as Stripe.PaymentIntent
                );
                break;

            case 'payment_intent.payment_failed':
                await handlePaymentIntentFailed(
                    event.data.object as Stripe.PaymentIntent
                );
                break;

            default:
                // Acknowledge all other events without processing them
                console.log(`[webhook] Unhandled event type: ${event.type}`);
        }
    } catch (err: any) {
        // Return 500 so Stripe retries the event
        console.error(`[webhook] Handler threw for ${event.type}:`, err.message);
        return NextResponse.json(
            { error: 'Internal webhook handler error' },
            { status: 500 }
        );
    }

    // Stripe expects a 200 to acknowledge receipt
    return NextResponse.json({ received: true });
}

// ---------------------------------------------------------------------------
// payment_intent.succeeded
// ---------------------------------------------------------------------------

async function handlePaymentIntentSucceeded(
    paymentIntent: Stripe.PaymentIntent
) {
    const piId = paymentIntent.id;
    console.log(`[webhook] payment_intent.succeeded: ${piId}`);

    // 1. Fetch the booking draft that was written by create-intent
    const draftRef = adminDb.doc(`booking_drafts/${piId}`);
    const draftSnap = await draftRef.get();

    if (!draftSnap.exists) {
        // This can happen if:
        //   (a) the Firestore draft write failed during create-intent, or
        //   (b) the draft was already processed and deleted
        // Return without error — we can't retry meaningfully here.
        console.error(
            `[webhook] No booking draft found for PaymentIntent ${piId}. ` +
            `Payment succeeded but booking cannot be created automatically. ` +
            `Manual intervention required.`
        );
        return;
    }

    const draft = draftSnap.data()!;

    // Branch: bundle vs single-session booking
    if (draft.bundleId) {
        await handleBundlePaymentSucceeded(paymentIntent, draft);
        return;
    }

    const sessionId: string = draft.sessionId;

    // 2. Atomic booking creation + capacity decrement
    const bookingRef = adminDb.doc(`bookings/${piId}`);
    const sessionRef = adminDb.doc(`sessions/${sessionId}`);

    let alreadyProcessed = false;

    await adminDb.runTransaction(async (tx) => {
        // --- Idempotency check ---
        // If the booking doc already exists (duplicate webhook delivery), skip.
        const existingBooking = await tx.get(bookingRef);
        if (existingBooking.exists) {
            console.log(
                `[webhook] Booking ${piId} already exists — duplicate event, skipping`
            );
            alreadyProcessed = true;
            return;
        }

        // --- Session capacity check ---
        const sessionDoc = await tx.get(sessionRef);
        if (!sessionDoc.exists) {
            throw new Error(`Session ${sessionId} not found in Firestore`);
        }

        const sessionData = sessionDoc.data()!;

        if (sessionData.status !== 'open') {
            // Session was closed/cancelled after payment was initiated.
            // The booking should still be recorded, but we cannot safely
            // decrement spots. Log and proceed without decrement.
            console.warn(
                `[webhook] Session ${sessionId} status is '${sessionData.status}' ` +
                `(not open) — booking will be created without decrementing spots`
            );
            tx.set(bookingRef, buildBookingDoc(draft, paymentIntent));
            return;
        }

        if (sessionData.spotsAvailable <= 0) {
            // Session sold out between PaymentIntent creation and webhook.
            // Record the booking anyway (payment was taken) but flag it.
            console.warn(
                `[webhook] Session ${sessionId} has 0 spots available. ` +
                `Overbooking detected — booking created, manual review needed.`
            );
            tx.set(bookingRef, { ...buildBookingDoc(draft, paymentIntent), overbooking: true });
            return;
        }

        // --- Happy path: create booking + decrement spots atomically ---
        tx.set(bookingRef, buildBookingDoc(draft, paymentIntent));
        tx.update(sessionRef, {
            spotsAvailable: admin.firestore.FieldValue.increment(-1),
        });
    });

    if (alreadyProcessed) return;

    // 3. Update student profile (best-effort, outside transaction)
    //    Only applies to parent bookings where a real student doc exists.
    if (draft.studentId && draft.studentId !== 'self') {
        try {
            await adminDb.doc(`students/${draft.studentId}`).update({
                medicalInfo: draft.medicalInfo ?? null,
                emergencyContact: draft.emergencyContact ?? null,
                questionnaire: draft.questionnaire ?? null,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        } catch (err) {
            // Non-critical — the booking is already created.
            console.error(
                `[webhook] Failed to update student profile ${draft.studentId}:`,
                err
            );
        }
    }

    // 4. Send confirmation email (best-effort, non-blocking)
    if (draft.bookedByEmail) {
        await sendConfirmationEmail({
            to: draft.bookedByEmail,
            className: draft.className,
            sessionDate: draft.sessionDate,
            venueName: draft.venueName,
            studentName: draft.studentName,
        });
    }

    // 5. Delete the draft (cleanup — non-critical if this fails)
    try {
        await draftRef.delete();
    } catch (err) {
        console.error(`[webhook] Failed to delete booking draft ${piId}:`, err);
    }

    console.log(`[webhook] Booking ${piId} created successfully`);
}

// ---------------------------------------------------------------------------
// payment_intent.payment_failed
// ---------------------------------------------------------------------------

async function handlePaymentIntentFailed(
    paymentIntent: Stripe.PaymentIntent
) {
    const piId = paymentIntent.id;
    const reason =
        paymentIntent.last_payment_error?.message ?? 'Unknown reason';

    console.log(`[webhook] payment_intent.payment_failed: ${piId} — ${reason}`);

    // Update the draft document with failure status for observability.
    // The draft is kept so the payment page can surface an error state if needed.
    try {
        await adminDb.doc(`booking_drafts/${piId}`).update({
            paymentStatus: 'failed',
            failureMessage: reason,
            failedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
    } catch (err) {
        // Draft may not exist (e.g. draft write itself failed, or it was cleaned up)
        console.warn(
            `[webhook] Could not update draft for failed PaymentIntent ${piId}:`,
            err
        );
    }
}

// ---------------------------------------------------------------------------
// Bundle: payment_intent.succeeded
// ---------------------------------------------------------------------------

async function handleBundlePaymentSucceeded(
    paymentIntent: Stripe.PaymentIntent,
    draft: FirebaseFirestore.DocumentData
) {
    const piId = paymentIntent.id;
    const bundleId: string = draft.bundleId;
    const sessionIds: string[] = draft.sessionIds ?? [];
    const sessions: Array<{
        sessionId: string;
        date: string;
        startTime: string;
        endTime: string;
        venueName: string;
    }> = draft.sessions ?? [];

    console.log(
        `[webhook] Bundle payment succeeded: PI=${piId}, bundleId=${bundleId}, sessions=${sessionIds.length}`
    );

    let alreadyFullyProcessed = false;

    await adminDb.runTransaction(async (tx) => {
        // For each session in the bundle, check idempotency and create booking
        const bookingRefs = sessionIds.map((sid) =>
            adminDb.doc(`bookings/${piId}_${sid}`)
        );
        const sessionRefs = sessionIds.map((sid) =>
            adminDb.doc(`sessions/${sid}`)
        );

        // Read all existing bookings and sessions inside the transaction
        const existingBookings = await Promise.all(
            bookingRefs.map((ref) => tx.get(ref))
        );
        const sessionDocs = await Promise.all(
            sessionRefs.map((ref) => tx.get(ref))
        );

        // Idempotency: if ALL booking docs already exist, skip entirely
        const allExist = existingBookings.every((snap) => snap.exists);
        if (allExist) {
            console.log(
                `[webhook] All ${sessionIds.length} bundle bookings already exist for PI=${piId} — duplicate event, skipping`
            );
            alreadyFullyProcessed = true;
            return;
        }

        // Calculate per-session payment amount (informational split)
        const perSessionAmount = Math.round(paymentIntent.amount / sessionIds.length);

        // Create booking documents and decrement spots for each session
        for (let i = 0; i < sessionIds.length; i++) {
            const sessionId = sessionIds[i];
            const bookingRef = bookingRefs[i];
            const existingBooking = existingBookings[i];
            const sessionDoc = sessionDocs[i];

            // Skip if this specific booking already exists (partial idempotency)
            if (existingBooking.exists) {
                console.log(
                    `[webhook] Booking ${piId}_${sessionId} already exists — skipping`
                );
                continue;
            }

            // Get per-session denormalized data from draft
            const sessionInfo = sessions.find((s) => s.sessionId === sessionId);

            // Build the booking document
            const bookingDoc: Record<string, any> = {
                sessionId,
                sessionDate: sessionInfo?.date ?? '',
                className: draft.className,
                venueName: sessionInfo?.venueName ?? draft.venueName ?? '',
                startTime: sessionInfo?.startTime ?? null,
                endTime: sessionInfo?.endTime ?? null,
                bookedByUid: draft.bookedByUid,
                bookedByName: draft.bookedByName,
                studentId: draft.studentId,
                studentName: draft.studentName,
                status: 'confirmed',
                medicalInfo: draft.medicalInfo ?? null,
                emergencyContact: draft.emergencyContact ?? null,
                questionnaire: draft.questionnaire ?? null,
                termsAccepted: draft.termsAccepted,
                termsAcceptedAt: admin.firestore.FieldValue.serverTimestamp(),
                payment: {
                    stripePaymentIntentId: piId,
                    amount: perSessionAmount,
                    currency: 'gbp',
                    status: 'paid',
                    receiptUrl: null,
                },
                bundleId,
                bundleName: draft.bundleName ?? null,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            };

            // Check session availability for overbooking flag
            if (!sessionDoc.exists) {
                throw new Error(`Session ${sessionId} not found in Firestore`);
            }

            const sessionData = sessionDoc.data()!;

            if (sessionData.spotsAvailable <= 0) {
                // Overbooking: session was already full at webhook time
                console.warn(
                    `[webhook] Session ${sessionId} has 0 spots available. ` +
                    `Overbooking detected for bundle booking.`
                );
                bookingDoc.overbooking = true;
                tx.set(bookingRef, bookingDoc);
                // Don't decrement spots below 0
            } else {
                bookingDoc.overbooking = false;
                tx.set(bookingRef, bookingDoc);
                tx.update(sessionRefs[i], {
                    spotsAvailable: admin.firestore.FieldValue.increment(-1),
                });
            }
        }
    });

    if (alreadyFullyProcessed) return;

    // Send bundle confirmation email (best-effort, non-blocking)
    if (draft.bookedByEmail) {
        await sendBundleConfirmationEmail({
            to: draft.bookedByEmail,
            bundleName: draft.bundleName ?? 'Bundle',
            studentName: draft.studentName,
            totalAmount: paymentIntent.amount,
            sessions,
        });
    }

    // Delete the draft (cleanup — non-critical if this fails)
    try {
        await adminDb.doc(`booking_drafts/${piId}`).delete();
    } catch (err) {
        console.error(`[webhook] Failed to delete bundle booking draft ${piId}:`, err);
    }

    console.log(
        `[webhook] Bundle bookings created successfully: PI=${piId}, bundleId=${bundleId}`
    );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildBookingDoc(
    draft: FirebaseFirestore.DocumentData,
    paymentIntent: Stripe.PaymentIntent
) {
    return {
        // Session
        sessionId: draft.sessionId,
        sessionDate: draft.sessionDate,
        className: draft.className,
        venueName: draft.venueName,
        startTime: draft.startTime ?? null,
        endTime: draft.endTime ?? null,
        // User
        bookedByUid: draft.bookedByUid,
        bookedByName: draft.bookedByName,
        // Student
        studentId: draft.studentId,
        studentName: draft.studentName,
        // Consent & health
        status: 'confirmed',
        medicalInfo: draft.medicalInfo ?? null,
        emergencyContact: draft.emergencyContact ?? null,
        questionnaire: draft.questionnaire ?? null,
        termsAccepted: draft.termsAccepted,
        termsAcceptedAt: admin.firestore.FieldValue.serverTimestamp(),
        // Payment — mirrors the shape used by portal/my-payments and admin/bookings
        payment: {
            stripePaymentIntentId: paymentIntent.id,
            amount: paymentIntent.amount,
            currency: paymentIntent.currency,
            status: 'paid',
            receiptUrl: null, // Populated by a separate charge lookup if needed
        },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };
}

async function sendConfirmationEmail(params: {
    to: string;
    className: string;
    sessionDate: string;
    venueName: string;
    studentName: string;
}) {
    if (!process.env.RESEND_API_KEY || process.env.RESEND_API_KEY === 're_placeholder') {
        console.warn('[webhook] RESEND_API_KEY not set — skipping confirmation email');
        return;
    }

    const formattedDate = new Date(params.sessionDate).toLocaleDateString('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
    });

    const fromEmail =
        process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';

    try {
        const { error } = await resend.emails.send({
            from: `Blooming Tastebuds <${fromEmail}>`,
            to: [params.to],
            subject: `Booking Confirmed: ${params.className}`,
            html: `
                <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;border:1px solid #eee;border-radius:12px;">
                    <h1 style="color:#0066CC;font-size:24px;margin-bottom:8px;">Booking Confirmed!</h1>
                    <p style="color:#666;font-size:16px;margin-bottom:24px;">
                        Your cooking session at Blooming Tastebuds is all set. We can't wait to see you there!
                    </p>
                    <div style="background:#F5F5F7;padding:20px;border-radius:12px;margin-bottom:24px;">
                        <h2 style="font-size:18px;margin-top:0;">Session Details</h2>
                        <ul style="list-style:none;padding:0;margin:0;color:#333;">
                            <li style="margin-bottom:8px;"><strong>Class:</strong> ${params.className}</li>
                            <li style="margin-bottom:8px;"><strong>Date:</strong> ${formattedDate}</li>
                            <li style="margin-bottom:8px;"><strong>Venue:</strong> ${params.venueName}</li>
                            <li style="margin-bottom:8px;"><strong>Participant:</strong> ${params.studentName}</li>
                        </ul>
                    </div>
                    <p style="color:#666;font-size:14px;line-height:1.5;">
                        View and manage your booking in your
                        <a href="${process.env.NEXT_PUBLIC_APP_URL}/portal/my-classes" style="color:#0066CC;">dashboard</a>.
                    </p>
                    <hr style="border:0;border-top:1px solid #eee;margin:24px 0;" />
                    <p style="color:#999;font-size:12px;text-align:center;">Blooming Tastebuds — Fun, hands-on cooking classes.</p>
                </div>
            `,
        });

        if (error) {
            console.error('[webhook] Resend error:', error);
        } else {
            console.log(`[webhook] Confirmation email sent to ${params.to}`);
        }
    } catch (err) {
        console.error('[webhook] Failed to send confirmation email:', err);
    }
}

async function sendBundleConfirmationEmail(params: {
    to: string;
    bundleName: string;
    studentName: string;
    totalAmount: number; // in pence
    sessions: Array<{
        sessionId: string;
        date: string;
        startTime: string;
        endTime: string;
        venueName: string;
    }>;
}) {
    if (!process.env.RESEND_API_KEY || process.env.RESEND_API_KEY === 're_placeholder') {
        console.warn('[webhook] RESEND_API_KEY not set — skipping bundle confirmation email');
        return;
    }

    const fromEmail =
        process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';

    // Sort sessions chronologically by date
    const sortedSessions = [...params.sessions].sort(
        (a, b) => a.date.localeCompare(b.date)
    );

    // Format total as £XX.XX
    const formattedTotal = `£${(params.totalAmount / 100).toFixed(2)}`;

    // Build session list HTML
    const sessionListHtml = sortedSessions
        .map((s) => {
            const formattedDate = new Date(s.date).toLocaleDateString('en-GB', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
            });
            return `<li style="margin-bottom:8px;">${formattedDate} — ${s.startTime}–${s.endTime} at ${s.venueName}</li>`;
        })
        .join('');

    const portalUrl = `${process.env.NEXT_PUBLIC_APP_URL}/portal/my-classes`;

    try {
        const { error } = await resend.emails.send({
            from: `Blooming Tastebuds <${fromEmail}>`,
            to: [params.to],
            subject: `Bundle Booking Confirmed: ${params.bundleName}`,
            html: `
                <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;border:1px solid #eee;border-radius:12px;">
                    <h1 style="color:#0066CC;font-size:24px;margin-bottom:8px;">Bundle Booking Confirmed!</h1>
                    <p style="color:#666;font-size:16px;margin-bottom:24px;">
                        Your bundle booking at Blooming Tastebuds is confirmed. You're all set for ${sortedSessions.length} sessions!
                    </p>
                    <div style="background:#F5F5F7;padding:20px;border-radius:12px;margin-bottom:24px;">
                        <h2 style="font-size:18px;margin-top:0;">Bundle Details</h2>
                        <ul style="list-style:none;padding:0;margin:0 0 16px 0;color:#333;">
                            <li style="margin-bottom:8px;"><strong>Bundle:</strong> ${params.bundleName}</li>
                            <li style="margin-bottom:8px;"><strong>Participant:</strong> ${params.studentName}</li>
                            <li style="margin-bottom:8px;"><strong>Total Paid:</strong> ${formattedTotal}</li>
                        </ul>
                        <h3 style="font-size:16px;margin-bottom:8px;">Your Sessions</h3>
                        <ul style="list-style:none;padding:0;margin:0;color:#333;">
                            ${sessionListHtml}
                        </ul>
                    </div>
                    <p style="color:#666;font-size:14px;line-height:1.5;">
                        View and manage your bookings in your
                        <a href="${portalUrl}" style="color:#0066CC;">My Classes</a> dashboard.
                    </p>
                    <hr style="border:0;border-top:1px solid #eee;margin:24px 0;" />
                    <p style="color:#999;font-size:12px;text-align:center;">Blooming Tastebuds — Fun, hands-on cooking classes.</p>
                </div>
            `,
        });

        if (error) {
            console.error('[webhook] Resend error (bundle confirmation):', error);
        } else {
            console.log(`[webhook] Bundle confirmation email sent to ${params.to}`);
        }
    } catch (err) {
        console.error('[webhook] Failed to send bundle confirmation email:', err);
    }
}
