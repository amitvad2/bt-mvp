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
import { determineSafetyReviewStatus } from '@/lib/guest-validation';
import { createSocialBookingService } from '@/lib/social-booking';
import { WhatsAppAdapter } from '@/lib/social-booking/adapters/whatsapp';
import { InstagramAdapter } from '@/lib/social-booking/adapters/instagram';
import { MessengerAdapter } from '@/lib/social-booking/adapters/messenger';
import { formatRecurrenceDays } from '@/lib/term-utils';
import type { SocialChannel } from '@/types';

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

// ---------------------------------------------------------------------------
// Lazy-initialised Social Booking Service (singleton per cold start)
// ---------------------------------------------------------------------------

let _socialBookingService: ReturnType<typeof createSocialBookingService> | null = null;

function getSocialBookingService() {
  if (!_socialBookingService) {
    const adapters = new Map<SocialChannel, InstanceType<typeof WhatsAppAdapter | typeof InstagramAdapter | typeof MessengerAdapter>>();
    adapters.set('whatsapp', new WhatsAppAdapter());
    adapters.set('instagram', new InstagramAdapter());
    adapters.set('messenger', new MessengerAdapter());
    _socialBookingService = createSocialBookingService({ adapters });
  }
  return _socialBookingService;
}

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

    // Branch: bundle vs guest vs single-session booking
    if (draft.bundleId) {
        await handleBundlePaymentSucceeded(paymentIntent, draft);
        return;
    }

    if (draft.bookingMode === 'guest' && draft.bookingType === 'term') {
        // Guest term booking — route to term handler which supports guest mode
        await handleTermPaymentSucceeded(paymentIntent, draft);
        return;
    }

    if (draft.bookingMode === 'guest') {
        await handleGuestPaymentSucceeded(paymentIntent, draft);
        return;
    }

    if (draft.bookingType === 'term') {
        await handleTermPaymentSucceeded(paymentIntent, draft);
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
            startTime: draft.startTime,
            endTime: draft.endTime,
            venueName: draft.venueName,
            studentName: draft.studentName,
        });
    }

    // 4b. Notify admin of new booking (best-effort, non-blocking)
    await sendAdminBookingNotification({
        className: draft.className,
        sessionDate: draft.sessionDate,
        startTime: draft.startTime,
        endTime: draft.endTime,
        venueName: draft.venueName,
        studentName: draft.studentName,
        bookedByName: draft.bookedByName,
        bookedByEmail: draft.bookedByEmail,
    });

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

    // Notify admin of new bundle booking (best-effort, non-blocking)
    await sendAdminBookingNotification({
        className: draft.className,
        sessionDate: sessions[0]?.date ?? '',
        startTime: sessions[0]?.startTime,
        endTime: sessions[0]?.endTime,
        venueName: sessions[0]?.venueName ?? '',
        studentName: draft.studentName,
        bookedByName: draft.bookedByName,
        bookedByEmail: draft.bookedByEmail,
        bundleName: draft.bundleName,
        sessionCount: sessions.length,
    });

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
// Guest: payment_intent.succeeded
// ---------------------------------------------------------------------------

async function handleGuestPaymentSucceeded(
    paymentIntent: Stripe.PaymentIntent,
    draft: FirebaseFirestore.DocumentData
) {
    const piId = paymentIntent.id;
    const sessionId: string = draft.sessionId;

    console.log(`[webhook] Guest payment_intent.succeeded: ${piId}`);

    // 1. Validate consent records exist in draft
    if (!draft.consentAudit?.consents) {
        console.error(
            `[webhook] Guest draft ${piId} missing consent records. ` +
            `Cannot create booking without valid consent audit.`
        );
        return;
    }

    // 2. Determine safety review status based on medical declarations
    const safetyReviewStatus = determineSafetyReviewStatus(draft);

    // 3. Atomic booking creation + capacity decrement
    const bookingRef = adminDb.doc(`bookings/${piId}`);
    const sessionRef = adminDb.doc(`sessions/${sessionId}`);
    const draftRef = adminDb.doc(`booking_drafts/${piId}`);

    let alreadyProcessed = false;

    await adminDb.runTransaction(async (tx) => {
        // --- Idempotency check ---
        const existingBooking = await tx.get(bookingRef);
        if (existingBooking.exists) {
            console.log(
                `[webhook] Guest booking ${piId} already exists — duplicate event, skipping`
            );
            alreadyProcessed = true;
            return;
        }

        // --- Session read for capacity check + snapshot ---
        const sessionDoc = await tx.get(sessionRef);
        if (!sessionDoc.exists) {
            throw new Error(`Session ${sessionId} not found in Firestore`);
        }

        const sessionData = sessionDoc.data()!;

        // Build the guest booking document
        const guestBookingDoc = buildGuestBookingDoc(
            draft,
            paymentIntent,
            safetyReviewStatus,
            sessionData
        );

        if (sessionData.status !== 'open') {
            // Session was closed/cancelled after payment was initiated.
            console.warn(
                `[webhook] Session ${sessionId} status is '${sessionData.status}' ` +
                `(not open) — guest booking will be created without decrementing spots`
            );
            tx.set(bookingRef, guestBookingDoc);
            return;
        }

        if (sessionData.spotsAvailable <= 0) {
            // Session sold out between PaymentIntent creation and webhook.
            console.warn(
                `[webhook] Session ${sessionId} has 0 spots available. ` +
                `Overbooking detected for guest booking — manual review needed.`
            );
            tx.set(bookingRef, { ...guestBookingDoc, overbooking: true });
            return;
        }

        // --- Happy path: create booking + decrement spots atomically ---
        tx.set(bookingRef, guestBookingDoc);
        tx.update(sessionRef, {
            spotsAvailable: admin.firestore.FieldValue.increment(-1),
        });
    });

    if (alreadyProcessed) return;

    // 4. Send guest confirmation email (best-effort, non-blocking)
    await sendGuestConfirmationEmail(draft);

    // 5. Notify admin of new guest booking (best-effort, non-blocking)
    await sendAdminBookingNotification({
        className: draft.className ?? '',
        sessionDate: draft.sessionDate ?? '',
        startTime: draft.startTime ?? undefined,
        endTime: draft.endTime ?? undefined,
        venueName: draft.venueName ?? '',
        studentName: `${draft.childDetails?.firstName ?? ''} ${draft.childDetails?.lastName ?? ''}`.trim(),
        bookedByName: `${draft.guestContact?.firstName ?? ''} ${draft.guestContact?.lastName ?? ''}`.trim(),
        bookedByEmail: draft.guestContact?.email ?? '',
    });

    // 5b. Trigger social channel confirmation (fire-and-forget, best-effort)
    //     If the draft has social attribution, asynchronously confirm the
    //     Social_Booking_Session and send a confirmation message via the
    //     originating social channel. This MUST NOT block the webhook response.
    if (draft.socialAttribution?.socialBookingSessionId) {
        const socialSessionId = draft.socialAttribution.socialBookingSessionId;
        const bookingRef = piId.slice(-8); // Last 8 chars of PaymentIntent ID

        // Fire and forget — do not await
        void (async () => {
            try {
                const socialService = getSocialBookingService();
                await socialService.confirmBooking(socialSessionId, piId);
                await socialService.sendSocialConfirmation(socialSessionId, bookingRef);
                console.log(
                    `[webhook] Social confirmation sent for session ${socialSessionId}`
                );
            } catch (err) {
                // Best-effort — failures must not affect booking creation or email delivery
                console.error(
                    `[webhook] Failed to send social confirmation for session ${socialSessionId}:`,
                    err
                );
            }
        })();
    }

    // 6. Delete the draft (cleanup — non-critical if this fails)
    try {
        await draftRef.delete();
    } catch (err) {
        console.error(`[webhook] Failed to delete guest booking draft ${piId}:`, err);
    }

    console.log(`[webhook] Guest booking ${piId} created successfully`);
}

// ---------------------------------------------------------------------------
// Term: payment_intent.succeeded
// ---------------------------------------------------------------------------

async function handleTermPaymentSucceeded(
    paymentIntent: Stripe.PaymentIntent,
    draft: FirebaseFirestore.DocumentData
) {
    const piId = paymentIntent.id;
    const classId: string = draft.classId;
    const isGuest = draft.bookingMode === 'guest';

    console.log(`[webhook] Term payment_intent.succeeded: ${piId}, classId=${classId}, guest=${isGuest}`);

    // 1. Idempotency check: if booking already exists, skip
    const bookingRef = adminDb.doc(`bookings/${piId}`);
    const bookingSnap = await bookingRef.get();
    if (bookingSnap.exists) {
        console.log(
            `[webhook] Term booking ${piId} already exists — duplicate event, skipping`
        );
        return;
    }

    // 1b. For guest bookings, validate consent records exist
    if (isGuest && !draft.consentAudit?.consents) {
        console.error(
            `[webhook] Guest term draft ${piId} missing consent records. ` +
            `Cannot create booking without valid consent audit.`
        );
        return;
    }

    // 2. Atomic booking creation + class spots decrement
    const classRef = adminDb.doc(`classes/${classId}`);

    // Derive student and booker names based on booking mode
    const studentName = isGuest
        ? `${draft.childSnapshot?.firstName ?? draft.childDetails?.firstName ?? ''} ${draft.childSnapshot?.lastName ?? draft.childDetails?.lastName ?? ''}`.trim()
        : draft.studentName;
    const bookedByName = isGuest
        ? `${draft.guestContact?.firstName ?? ''} ${draft.guestContact?.lastName ?? ''}`.trim()
        : draft.bookedByName;

    await adminDb.runTransaction(async (tx) => {
        // Read class document inside transaction
        const classDoc = await tx.get(classRef);
        if (!classDoc.exists) {
            throw new Error(`Class ${classId} not found in Firestore`);
        }

        const classData = classDoc.data()!;
        const spotsAvailable = classData.spotsAvailable ?? 0;

        // Build the term booking document
        let termBookingDoc: Record<string, any>;

        if (isGuest) {
            // Guest term booking — uses embedded snapshots, no linked user/student docs
            const safetyReviewStatus = determineSafetyReviewStatus(draft);

            // Build acquisition metadata from social attribution (if present) or default to website_express
            const acquisition = draft.socialAttribution
                ? {
                    bookingSource: draft.socialAttribution.bookingSource,
                    campaign: draft.socialAttribution.campaign ?? null,
                    socialBookingSessionId: draft.socialAttribution.socialBookingSessionId ?? null,
                }
                : {
                    bookingSource: draft.source ?? 'website_express',
                    campaign: null,
                    socialBookingSessionId: null,
                };

            termBookingDoc = {
                id: piId,
                bookingType: 'term',
                bookingMode: 'guest',
                bookingSource: draft.source ?? 'unknown',
                classId,
                className: draft.className,
                classType: draft.classType ?? '',
                venueName: draft.venueName,
                startTime: draft.startTime ?? null,
                endTime: draft.endTime ?? null,
                recurrenceDays: draft.recurrenceDays ?? [],
                termStartDate: draft.termStartDate ?? '',
                termEndDate: draft.termEndDate ?? '',
                // Session fields — not applicable for term bookings
                sessionId: '',
                sessionDate: '',
                // Guest — no linked user or student
                bookedByUid: null,
                bookedByName,
                studentId: null,
                studentName,
                // Embedded guest snapshots
                guestContact: draft.guestContact ?? null,
                childSnapshot: draft.childSnapshot ?? draft.childDetails ?? null,
                medicalSnapshot: draft.medicalInfo ?? null,
                allergyDietaryInfo: draft.allergyDietaryInfo ?? null,
                emergencyContactSnapshot: draft.emergencyContact ?? null,
                authorisedCollectorSnapshot: draft.authorisedCollector ?? null,
                consentAudit: draft.consentAudit ?? null,
                // Safety review
                safetyReviewStatus,
                // Acquisition attribution
                acquisition,
                // Status & consent
                status: 'confirmed',
                termsAccepted: draft.termsAccepted ?? true,
                termsAcceptedAt: admin.firestore.FieldValue.serverTimestamp(),
                // Payment
                payment: {
                    stripePaymentIntentId: piId,
                    amount: paymentIntent.amount,
                    currency: paymentIntent.currency ?? 'gbp',
                    status: 'paid',
                    receiptUrl: null,
                },
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            };
        } else {
            // Authenticated term booking — uses linked user/student docs
            termBookingDoc = {
                bookingType: 'term',
                classId,
                className: draft.className,
                classType: draft.classType ?? '',
                venueName: draft.venueName,
                startTime: draft.startTime ?? null,
                endTime: draft.endTime ?? null,
                recurrenceDays: draft.recurrenceDays ?? [],
                termStartDate: draft.termStartDate ?? '',
                termEndDate: draft.termEndDate ?? '',
                // Session fields — not applicable for term bookings
                sessionId: '',
                sessionDate: '',
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
                // Payment
                payment: {
                    stripePaymentIntentId: piId,
                    amount: paymentIntent.amount,
                    currency: 'gbp',
                    status: 'paid',
                    receiptUrl: null,
                },
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            };
        }

        if (spotsAvailable <= 0) {
            // Overbooking: payment was taken but class is full
            console.warn(
                `[webhook] Class ${classId} has 0 spots available. ` +
                `Overbooking detected for term booking — manual review needed.`
            );
            termBookingDoc.overbooking = true;
            tx.set(bookingRef, termBookingDoc);
            // Still decrement (will go negative to signal overbooking level)
            tx.update(classRef, {
                spotsAvailable: admin.firestore.FieldValue.increment(-1),
            });
        } else {
            // Happy path: create booking + decrement spots atomically
            termBookingDoc.overbooking = false;
            tx.set(bookingRef, termBookingDoc);
            tx.update(classRef, {
                spotsAvailable: admin.firestore.FieldValue.increment(-1),
            });
        }
    });

    // 3. Fetch child sessions for the email schedule (best-effort)
    let termSessions: Array<{ date: string; recipeName?: string; startTime?: string; endTime?: string }> = [];
    try {
        const sessionsSnap = await adminDb
            .collection('sessions')
            .where('classId', '==', classId)
            .get();
        termSessions = sessionsSnap.docs.map(d => {
            const data = d.data();
            return {
                date: data.date ?? '',
                recipeName: data.recipeName ?? undefined,
                startTime: data.startTime ?? undefined,
                endTime: data.endTime ?? undefined,
            };
        });
        // Sort client-side to avoid composite index requirement
        termSessions.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    } catch (err) {
        console.error(`[webhook] Failed to fetch term sessions for email — continuing without schedule:`, err);
    }

    // 4. Send term confirmation email (best-effort, non-blocking)
    // Fetch venue address for the email
    let venueAddress = '';
    let venuePostcode = '';
    try {
        const classDocForVenue = await adminDb.doc(`classes/${classId}`).get();
        const venueId = classDocForVenue.data()?.venueId;
        if (venueId) {
            const venueDoc = await adminDb.doc(`venues/${venueId}`).get();
            if (venueDoc.exists) {
                venueAddress = venueDoc.data()?.address ?? '';
                venuePostcode = venueDoc.data()?.postcode ?? '';
            }
        }
    } catch (err) {
        console.error('[webhook] Failed to fetch venue address for email — continuing without:', err);
    }

    // For guest bookings, send to guestContact.email; for authenticated, send to bookedByEmail
    const emailRecipient = isGuest
        ? draft.guestContact?.email
        : draft.bookedByEmail;

    if (emailRecipient) {
        await sendTermConfirmationEmail({
            to: emailRecipient,
            className: draft.className,
            recurrenceDays: draft.recurrenceDays ?? [],
            termStartDate: draft.termStartDate ?? '',
            termEndDate: draft.termEndDate ?? '',
            startTime: draft.startTime ?? '',
            endTime: draft.endTime ?? '',
            venueName: draft.venueName,
            venueAddress,
            venuePostcode,
            studentName,
            amount: paymentIntent.amount,
            isGuest,
            sessions: termSessions,
        });
    }

    // 5. Notify admin of new term booking (best-effort, non-blocking)
    await sendAdminBookingNotification({
        className: draft.className,
        sessionDate: `${draft.termStartDate ?? ''} to ${draft.termEndDate ?? ''}`,
        startTime: draft.startTime,
        endTime: draft.endTime,
        venueName: draft.venueName,
        studentName,
        bookedByName,
        bookedByEmail: emailRecipient ?? '',
    });

    // 5b. Trigger social channel confirmation for guest bookings (fire-and-forget)
    if (isGuest && draft.socialAttribution?.socialBookingSessionId) {
        const socialSessionId = draft.socialAttribution.socialBookingSessionId;
        const bookingRefShort = piId.slice(-8);

        void (async () => {
            try {
                const socialService = getSocialBookingService();
                await socialService.confirmBooking(socialSessionId, piId);
                await socialService.sendSocialConfirmation(socialSessionId, bookingRefShort);
                console.log(
                    `[webhook] Social confirmation sent for term booking session ${socialSessionId}`
                );
            } catch (err) {
                console.error(
                    `[webhook] Failed to send social confirmation for term booking session ${socialSessionId}:`,
                    err
                );
            }
        })();
    }

    // 6. Delete the draft (cleanup — non-critical if this fails)
    try {
        await adminDb.doc(`booking_drafts/${piId}`).delete();
    } catch (err) {
        console.error(`[webhook] Failed to delete term booking draft ${piId}:`, err);
    }

    console.log(`[webhook] Term booking ${piId} created successfully (guest=${isGuest})`);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildGuestBookingDoc(
    draft: FirebaseFirestore.DocumentData,
    paymentIntent: Stripe.PaymentIntent,
    safetyReviewStatus: string,
    sessionData: FirebaseFirestore.DocumentData
) {
    const piId = paymentIntent.id;

    // Build acquisition metadata from social attribution (if present) or default to website_express
    const acquisition = draft.socialAttribution
        ? {
            bookingSource: draft.socialAttribution.bookingSource,
            campaign: draft.socialAttribution.campaign ?? null,
            socialBookingSessionId: draft.socialAttribution.socialBookingSessionId ?? null,
        }
        : {
            bookingSource: 'website_express' as const,
            campaign: null,
            socialBookingSessionId: null,
        };

    return {
        id: piId,
        bookingMode: 'guest' as const,
        bookingSource: draft.source ?? 'unknown',
        sessionId: draft.sessionId,
        status: 'confirmed',
        // Embedded snapshots (no linked documents — GUEST-FR-017)
        guestContact: draft.guestContact,
        childSnapshot: draft.childDetails,
        medicalSnapshot: draft.medicalInfo,
        allergyDietarySnapshot: draft.allergyDietaryInfo,
        emergencyContactSnapshot: draft.emergencyContact,
        authorisedCollectorSnapshot: draft.authorisedCollector,
        consentAudit: draft.consentAudit,
        sessionSnapshot: {
            id: draft.sessionId,
            className: sessionData.className ?? '',
            classType: sessionData.classType ?? '',
            date: sessionData.date ?? '',
            startTime: sessionData.startTime ?? '',
            endTime: sessionData.endTime ?? '',
            venueName: sessionData.venueName ?? '',
            ageMin: sessionData.ageMin ?? 0,
            ageMax: sessionData.ageMax ?? 0,
            price: sessionData.price ?? 0,
            spotsAvailable: sessionData.spotsAvailable ?? 0,
            status: sessionData.status ?? '',
        },
        // Safety review
        safetyReviewStatus,
        // Acquisition attribution (social channel or default website_express)
        acquisition,
        // Payment
        payment: {
            stripePaymentIntentId: piId,
            amount: paymentIntent.amount,
            currency: paymentIntent.currency,
            status: 'paid',
            receiptUrl: null,
        },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };
}



// ---------------------------------------------------------------------------
// Helpers (existing)
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
    startTime?: string;
    endTime?: string;
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

    const timeStr = params.startTime && params.endTime
        ? `${params.startTime} – ${params.endTime}`
        : null;

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
                            ${timeStr ? `<li style="margin-bottom:8px;"><strong>Time:</strong> ${timeStr}</li>` : ''}
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

async function sendAdminBookingNotification(params: {
    className: string;
    sessionDate: string;
    startTime?: string;
    endTime?: string;
    venueName: string;
    studentName: string;
    bookedByName: string;
    bookedByEmail: string;
    bundleName?: string;
    sessionCount?: number;
}) {
    const adminEmail = process.env.RESEND_ADMIN_EMAIL;
    if (!adminEmail) {
        console.warn('[webhook] RESEND_ADMIN_EMAIL not set — skipping admin notification');
        return;
    }

    if (!process.env.RESEND_API_KEY || process.env.RESEND_API_KEY === 're_placeholder') {
        return;
    }

    const fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';

    const formattedDate = params.sessionDate
        ? new Date(params.sessionDate).toLocaleDateString('en-GB', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
        })
        : 'N/A';

    const timeStr = params.startTime && params.endTime
        ? `${params.startTime} – ${params.endTime}`
        : '';

    const isBundle = !!params.bundleName;
    const subject = isBundle
        ? `New Bundle Booking: ${params.bundleName} (${params.sessionCount} sessions)`
        : `New Booking: ${params.className} — ${formattedDate}`;

    try {
        const { error } = await resend.emails.send({
            from: `Blooming Tastebuds <${fromEmail}>`,
            to: [adminEmail],
            subject,
            html: `
                <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;border:1px solid #eee;border-radius:12px;">
                    <h1 style="color:#16a34a;font-size:20px;margin-bottom:8px;">🎉 New Booking Received!</h1>
                    <div style="background:#F5F5F7;padding:16px;border-radius:12px;margin:16px 0;">
                        <ul style="list-style:none;padding:0;margin:0;color:#333;">
                            ${isBundle ? `<li style="margin-bottom:8px;"><strong>Bundle:</strong> ${params.bundleName} (${params.sessionCount} sessions)</li>` : ''}
                            <li style="margin-bottom:8px;"><strong>Class:</strong> ${params.className}</li>
                            <li style="margin-bottom:8px;"><strong>Date:</strong> ${formattedDate}</li>
                            ${timeStr ? `<li style="margin-bottom:8px;"><strong>Time:</strong> ${timeStr}</li>` : ''}
                            <li style="margin-bottom:8px;"><strong>Venue:</strong> ${params.venueName}</li>
                            <li style="margin-bottom:8px;"><strong>Student:</strong> ${params.studentName}</li>
                            <li style="margin-bottom:8px;"><strong>Booked by:</strong> ${params.bookedByName} (${params.bookedByEmail})</li>
                        </ul>
                    </div>
                    <p style="color:#666;font-size:13px;">
                        View all bookings in the <a href="${process.env.NEXT_PUBLIC_APP_URL}/admin/bookings" style="color:#0066CC;">admin panel</a>.
                    </p>
                </div>
            `,
        });

        if (error) {
            console.error('[webhook] Admin notification error:', error);
        } else {
            console.log(`[webhook] Admin booking notification sent to ${adminEmail}`);
        }
    } catch (err) {
        console.error('[webhook] Failed to send admin notification:', err);
    }
}

// ---------------------------------------------------------------------------
// Guest Confirmation Email
// ---------------------------------------------------------------------------

export async function sendGuestConfirmationEmail(
    draft: FirebaseFirestore.DocumentData
): Promise<void> {
    if (!process.env.RESEND_API_KEY || process.env.RESEND_API_KEY === 're_placeholder') {
        console.warn('[webhook] RESEND_API_KEY not set — skipping guest confirmation email');
        return;
    }

    // Determine if running in Preview mode
    const isPreview =
        process.env.VERCEL_ENV === 'preview' || process.env.NODE_ENV !== 'production';

    // Determine recipients
    let recipients: string[];
    if (isPreview) {
        const previewRecipients = process.env.PREVIEW_EMAIL_RECIPIENTS;
        if (!previewRecipients) {
            console.warn(
                '[webhook] Preview mode but PREVIEW_EMAIL_RECIPIENTS not configured — skipping guest confirmation email'
            );
            return;
        }
        recipients = previewRecipients.split(',').map((e) => e.trim()).filter(Boolean);
        if (recipients.length === 0) {
            console.warn('[webhook] PREVIEW_EMAIL_RECIPIENTS is empty — skipping guest confirmation email');
            return;
        }
    } else {
        // Production mode: send to the guest's email
        const guestEmail = draft.guestContact?.email;
        if (!guestEmail) {
            console.error('[webhook] Guest draft missing guestContact.email — cannot send confirmation');
            return;
        }
        recipients = [guestEmail];
    }

    const fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';

    // Extract email content fields from draft (non-sensitive only)
    const parentFirstName = draft.guestContact?.firstName ?? 'there';
    const childFirstName = draft.childDetails?.firstName ?? 'your child';
    const className = draft.className ?? 'Cooking Class';
    const sessionDate = draft.sessionDate ?? '';
    const startTime = draft.startTime ?? '';
    const endTime = draft.endTime ?? '';
    const venueName = draft.venueName ?? '';
    const piId: string = draft.stripePaymentIntentId ?? '';

    // Booking reference: last 8 chars of PaymentIntent ID
    const bookingReference = piId.length >= 8 ? piId.slice(-8) : piId;

    // Format amount (stored in pence on the PaymentIntent / draft)
    const amountPence = draft.amount ?? 0;
    const formattedAmount = `£${(amountPence / 100).toFixed(2)}`;

    // Format date for display
    const formattedDate = sessionDate
        ? new Date(sessionDate).toLocaleDateString('en-GB', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
        })
        : '';

    const timeStr = startTime && endTime ? `${startTime} – ${endTime}` : '';

    // Subject line
    const subjectPrefix = isPreview ? '[PREVIEW] ' : '';
    const subject = `${subjectPrefix}Booking Confirmed: ${className}`;

    try {
        const { error } = await resend.emails.send({
            from: `Blooming Tastebuds <${fromEmail}>`,
            to: recipients,
            subject,
            html: `
                <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;border:1px solid #eee;border-radius:12px;">
                    <h1 style="color:#0066CC;font-size:24px;margin-bottom:8px;">Booking Confirmed!</h1>
                    <p style="color:#666;font-size:16px;margin-bottom:24px;">
                        Hi ${parentFirstName}, your booking for ${childFirstName} is confirmed. We can't wait to see them!
                    </p>
                    <div style="background:#F5F5F7;padding:20px;border-radius:12px;margin-bottom:24px;">
                        <h2 style="font-size:18px;margin-top:0;">Session Details</h2>
                        <ul style="list-style:none;padding:0;margin:0;color:#333;">
                            <li style="margin-bottom:8px;"><strong>Class:</strong> ${className}</li>
                            ${formattedDate ? `<li style="margin-bottom:8px;"><strong>Date:</strong> ${formattedDate}</li>` : ''}
                            ${timeStr ? `<li style="margin-bottom:8px;"><strong>Time:</strong> ${timeStr}</li>` : ''}
                            ${venueName ? `<li style="margin-bottom:8px;"><strong>Venue:</strong> ${venueName}</li>` : ''}
                            <li style="margin-bottom:8px;"><strong>Child:</strong> ${childFirstName}</li>
                            <li style="margin-bottom:8px;"><strong>Amount Paid:</strong> ${formattedAmount}</li>
                            <li style="margin-bottom:8px;"><strong>Booking Reference:</strong> ${bookingReference}</li>
                        </ul>
                    </div>
                    <div style="background:#E8F5E9;padding:16px;border-radius:12px;margin-bottom:24px;">
                        <p style="color:#2E7D32;font-size:14px;margin:0;">
                            ✅ Your safety information has been received. Our team will review it ahead of the session.
                        </p>
                    </div>
                    <div style="margin-bottom:24px;">
                        <h3 style="font-size:16px;margin-bottom:8px;">Arrival Information</h3>
                        <p style="color:#666;font-size:14px;line-height:1.5;margin:0;">
                            Please arrive 5 minutes before the session start time. Ensure your child is collected by the authorised person at the end of the session.
                        </p>
                    </div>
                    <hr style="border:0;border-top:1px solid #eee;margin:24px 0;" />
                    <div style="text-align:center;">
                        <p style="color:#666;font-size:14px;margin-bottom:8px;">
                            <strong>Blooming Tastebuds</strong>
                        </p>
                        <p style="color:#999;font-size:12px;margin:0;">
                            Fun, hands-on cooking classes for children.<br/>
                            Questions? Contact us at <a href="mailto:info@bloomingtastebuds.co.uk" style="color:#0066CC;">info@bloomingtastebuds.co.uk</a>
                        </p>
                    </div>
                </div>
            `,
        });

        if (error) {
            console.error('[webhook] Guest confirmation email error:', error);
        } else {
            console.log(`[webhook] Guest confirmation email sent to ${recipients.join(', ')}`);
        }
    } catch (err) {
        console.error('[webhook] Failed to send guest confirmation email:', err);
    }
}

// ---------------------------------------------------------------------------
// Term Booking Confirmation Email
// ---------------------------------------------------------------------------

async function sendTermConfirmationEmail(params: {
    to: string;
    className: string;
    recurrenceDays: string[];
    termStartDate: string;
    termEndDate: string;
    startTime: string;
    endTime: string;
    venueName: string;
    venueAddress?: string;
    venuePostcode?: string;
    studentName: string;
    amount: number; // in pence
    isGuest?: boolean;
    sessions?: Array<{ date: string; recipeName?: string; startTime?: string; endTime?: string }>;
}) {
    if (!process.env.RESEND_API_KEY || process.env.RESEND_API_KEY === 're_placeholder') {
        console.warn('[webhook] RESEND_API_KEY not set — skipping term confirmation email');
        return;
    }

    const fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';

    // Format recurrence days into human-readable schedule
    const scheduleDescription = formatRecurrenceDays(params.recurrenceDays);
    const timeStr = params.startTime && params.endTime
        ? `${params.startTime} – ${params.endTime}`
        : '';

    // Format dates for display (short format for schedule line: "6 Jan 2025")
    const formattedStartDateShort = params.termStartDate
        ? new Date(params.termStartDate).toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
        })
        : '';
    const formattedEndDateShort = params.termEndDate
        ? new Date(params.termEndDate).toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
        })
        : '';

    // Format dates for display (long format for term period: "6 January 2025")
    const formattedStartDateLong = params.termStartDate
        ? new Date(params.termStartDate).toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
        })
        : '';
    const formattedEndDateLong = params.termEndDate
        ? new Date(params.termEndDate).toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
        })
        : '';

    // Build full recurring schedule description per Req 8.2:
    // "Every Mon, Wed, Fri — 3:30–4:30 pm, from 6 Jan 2025 to 28 Mar 2025"
    let recurringSchedule = scheduleDescription;
    if (timeStr) {
        recurringSchedule += ` — ${timeStr}`;
    }
    if (formattedStartDateShort && formattedEndDateShort) {
        recurringSchedule += `, from ${formattedStartDateShort} to ${formattedEndDateShort}`;
    }

    // Format amount
    const formattedAmount = `£${(params.amount / 100).toFixed(2)}`;

    const portalUrl = `${process.env.NEXT_PUBLIC_APP_URL}/portal/my-classes`;

    // Build session schedule HTML (Requirement 8.2 + 10.9)
    // Include session-specific times where they differ from the class default
    let sessionScheduleHtml = '';
    if (params.sessions && params.sessions.length > 0) {
        const sessionRows = params.sessions.map(session => {
            const sessionDate = session.date
                ? new Date(session.date + 'T00:00:00').toLocaleDateString('en-GB', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                })
                : '';
            const recipe = session.recipeName || 'To be announced';

            // Show session-specific time if it differs from the class default
            const hasCustomTime = (session.startTime && session.endTime) &&
                (session.startTime !== params.startTime || session.endTime !== params.endTime);
            const timeNote = hasCustomTime
                ? ` <span style="color:#4f46e5;font-weight:500;">(${session.startTime} – ${session.endTime})</span>`
                : '';

            return `<li style="margin-bottom:6px;font-size:14px;color:#333;">${sessionDate}${timeNote} &mdash; ${recipe}</li>`;
        }).join('');

        sessionScheduleHtml = `
                    <div style="background:#F9FAFB;padding:16px 20px;border-radius:12px;margin-bottom:24px;">
                        <h3 style="font-size:16px;margin-top:0;margin-bottom:12px;color:#333;">Session Schedule</h3>
                        <ul style="list-style:none;padding:0;margin:0;">
                            ${sessionRows}
                        </ul>
                    </div>`;
    }

    try {
        const { error } = await resend.emails.send({
            from: `Blooming Tastebuds <${fromEmail}>`,
            to: [params.to],
            subject: `Term Booking Confirmed: ${params.className}`,
            html: `
                <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;border:1px solid #eee;border-radius:12px;">
                    <h1 style="color:#0066CC;font-size:24px;margin-bottom:8px;">Term Booking Confirmed!</h1>
                    <p style="color:#666;font-size:16px;margin-bottom:24px;">
                        Your term enrolment at Blooming Tastebuds is confirmed. We can&rsquo;t wait to see you every week!
                    </p>
                    <div style="background:#F5F5F7;padding:20px;border-radius:12px;margin-bottom:24px;">
                        <h2 style="font-size:18px;margin-top:0;">Term Details</h2>
                        <ul style="list-style:none;padding:0;margin:0;color:#333;">
                            <li style="margin-bottom:8px;"><strong>Class:</strong> ${params.className}</li>
                            <li style="margin-bottom:8px;"><strong>Recurring Schedule:</strong> ${recurringSchedule}</li>
                            <li style="margin-bottom:8px;"><strong>Term Period:</strong> ${formattedStartDateLong} to ${formattedEndDateLong}</li>
                            <li style="margin-bottom:8px;"><strong>Time:</strong> ${timeStr || 'TBC'}</li>
                            <li style="margin-bottom:8px;"><strong>Venue:</strong> ${params.venueName}${params.venueAddress ? `<br/><span style="color:#666;font-size:13px;">${params.venueAddress}${params.venuePostcode ? `, ${params.venuePostcode}` : ''}</span>` : ''}</li>
                            <li style="margin-bottom:8px;"><strong>Participant:</strong> ${params.studentName}</li>
                            <li style="margin-bottom:8px;"><strong>Amount Paid:</strong> ${formattedAmount}</li>
                        </ul>
                    </div>
                    ${sessionScheduleHtml}
                    <div style="background:#E8F5E9;padding:16px;border-radius:12px;margin-bottom:24px;">
                        <p style="color:#2E7D32;font-size:14px;margin:0;">
                            &#10003; Your child is enrolled for the full term. No need to book individual sessions &mdash; just turn up on the scheduled days!
                        </p>
                    </div>
                    <p style="color:#666;font-size:14px;line-height:1.5;">
                        ${params.isGuest
                            ? 'If you need to make changes to your booking, please contact us at <a href="mailto:bloomingtastebuds@gmail.com" style="color:#0066CC;">bloomingtastebuds@gmail.com</a>.'
                            : `View and manage your booking in your <a href="${portalUrl}" style="color:#0066CC;">My Classes</a> dashboard.`
                        }
                    </p>
                    <hr style="border:0;border-top:1px solid #eee;margin:24px 0;" />
                    <p style="color:#999;font-size:12px;text-align:center;">Blooming Tastebuds &mdash; Fun, hands-on cooking classes.</p>
                </div>
            `,
        });

        if (error) {
            console.error('[webhook] Term confirmation email error:', error);
        } else {
            console.log(`[webhook] Term confirmation email sent to ${params.to}`);
        }
    } catch (err) {
        console.error('[webhook] Failed to send term confirmation email:', err);
    }
}
