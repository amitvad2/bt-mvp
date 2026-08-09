/**
 * Creates a Stripe PaymentIntent and persists a booking draft in Firestore.
 *
 * The booking draft stores all wizard state server-side so the Stripe webhook
 * can reconstruct and create the full booking document without relying on
 * browser state.
 *
 * Draft document ID = PaymentIntent ID → enables idempotent webhook processing.
 *
 * If the Firestore draft write fails after the PaymentIntent is created,
 * the PaymentIntent is cancelled so the user is never charged for an
 * un-bookable session.
 */

import { NextResponse } from 'next/server';
import stripe from '@/lib/stripe';
import { adminDb, adminAuth, adminInitError } from '@/lib/firebase-admin';
import * as admin from 'firebase-admin';

export async function POST(req: Request) {
    try {
        const body = await req.json();

        const {
            // Bundle identity (if present, triggers bundle code path)
            bundleId,
            // Term booking identity (if present with bookingType: 'term', triggers term code path)
            classId,
            bookingType,
            // Booking mode — 'guest' skips auth for term bookings
            bookingMode,
            // Session identity (for single-session bookings)
            sessionId,
            // User display fields — UID is taken from the verified token
            bookedByName,
            bookedByEmail,
            // Student
            studentId,
            studentName,
            // Denormalized session fields (from BookingContext)
            sessionDate,
            className,
            venueName,
            startTime,
            endTime,
            classType,
            // Term-specific fields from TermBookingContext
            recurrenceDays,
            termStartDate,
            termEndDate,
            // Booking data
            medicalInfo,
            emergencyContact,
            questionnaire,
            termsAccepted,
            // Guest-specific fields (present when bookingMode === 'guest')
            guestContact,
            childSnapshot,
            allergyDietaryInfo,
            authorisedCollector,
            consentAudit,
            consents,
            termsVersion,
            privacyNoticeVersion,
            source,
        } = body;
        // NOTE: `amount` is intentionally NOT taken from the client body.
        // It is read from Firestore below to prevent price manipulation.

        // Build consentAudit from raw consents if consentAudit not provided directly
        const resolvedConsentAudit = consentAudit ?? (consents ? {
            consents,
            acceptedAt: new Date().toISOString(),
            acceptedBy: guestContact ? `${guestContact.firstName} ${guestContact.lastName}` : 'Guest',
            termsVersion: termsVersion ?? '1.0',
            privacyNoticeVersion: privacyNoticeVersion ?? '1.0',
            sourceChannel: source ?? 'website_express',
            submissionTimestamp: new Date().toISOString(),
        } : null);

        // --- Determine if this is a guest term booking (skip auth) ---
        const isGuestTermBooking = classId && bookingType === 'term' && bookingMode === 'guest';

        // --- Verify caller is authenticated (skip for guest term bookings) ---
        let verifiedUid: string | null = null;
        if (!isGuestTermBooking) {
            const authHeader = req.headers.get('Authorization');
            const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
            if (!token) {
                return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
            }
            try {
                const decoded = await adminAuth.verifyIdToken(token);
                verifiedUid = decoded.uid;
            } catch {
                return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
            }
        }

        // --- Firebase Admin health check ---
        // Fail fast before creating a PaymentIntent if the Admin SDK is broken,
        // so the user gets a clear message instead of a cryptic Firestore 403.
        if (adminInitError) {
            console.error('[create-intent] Firebase Admin SDK not properly initialized:', adminInitError);
            return NextResponse.json(
                {
                    error:
                        process.env.NODE_ENV === 'development'
                            ? `Server configuration error: ${adminInitError}`
                            : 'Booking service is temporarily unavailable. Please contact support.',
                },
                { status: 500 }
            );
        }

        if (!process.env.STRIPE_SECRET_KEY) {
            console.error('[create-intent] STRIPE_SECRET_KEY is not configured');
            return NextResponse.json(
                { error: 'Payment service is not configured. Please contact support.' },
                { status: 500 }
            );
        }

        // --- Validate studentId belongs to the authenticated user (skip for guest) ---
        if (studentId && verifiedUid) {
            const studentDoc = await adminDb.doc(`students/${studentId}`).get();
            if (!studentDoc.exists || studentDoc.data()?.parentUid !== verifiedUid) {
                return NextResponse.json({ error: 'Invalid student selection.' }, { status: 403 });
            }
        }

        // ================================================================
        // BUNDLE CODE PATH — triggered when bundleId is present
        // ================================================================
        if (bundleId) {
            // --- Read bundle document (server-authoritative price) ---
            const bundleDoc = await adminDb.doc(`bundles/${bundleId}`).get();
            if (!bundleDoc.exists) {
                return NextResponse.json({ error: 'Bundle not found.' }, { status: 404 });
            }
            const bundleData = bundleDoc.data()!;

            // --- Validate bundle status is active ---
            if (bundleData.status !== 'active') {
                return NextResponse.json(
                    { error: 'This bundle is no longer accepting bookings.' },
                    { status: 400 }
                );
            }

            // --- Read all session documents and verify availability ---
            const sessionIds: string[] = bundleData.sessionIds;
            const fullSessions: Array<{ sessionId: string; date: string }> = [];
            const sessionsData: Array<{
                sessionId: string;
                date: string;
                startTime: string;
                endTime: string;
                venueName: string;
            }> = [];

            for (const sId of sessionIds) {
                const sDoc = await adminDb.doc(`sessions/${sId}`).get();
                if (!sDoc.exists) {
                    return NextResponse.json(
                        { error: `Session ${sId} not found.` },
                        { status: 400 }
                    );
                }
                const sData = sDoc.data()!;
                sessionsData.push({
                    sessionId: sId,
                    date: sData.date ?? null,
                    startTime: sData.startTime ?? null,
                    endTime: sData.endTime ?? null,
                    venueName: sData.venueName ?? null,
                });

                if (typeof sData.spotsAvailable === 'number' && sData.spotsAvailable <= 0) {
                    fullSessions.push({ sessionId: sId, date: sData.date ?? '' });
                }
            }

            // --- If any session is full, return 400 with details ---
            if (fullSessions.length > 0) {
                return NextResponse.json(
                    {
                        error: 'One or more sessions in this bundle are fully booked.',
                        fullSessions,
                    },
                    { status: 400 }
                );
            }

            // --- Server-authoritative pricing from bundle document ---
            const amount: number = bundleData.bundlePrice;
            if (!amount || typeof amount !== 'number' || amount <= 0) {
                console.error('[create-intent] Bundle has invalid price:', { bundleId, price: bundleData.bundlePrice });
                return NextResponse.json(
                    { error: 'Bundle pricing is unavailable. Please contact support.' },
                    { status: 500 }
                );
            }

            console.log('[create-intent] Creating bundle PaymentIntent:', {
                bundleId,
                sessionCount: sessionIds.length,
                amount,
                bookedByUid: verifiedUid,
            });

            // --- Create Stripe PaymentIntent for bundle ---
            const paymentIntent = await stripe.paymentIntents.create({
                amount,
                currency: 'gbp',
                automatic_payment_methods: { enabled: true },
                metadata: {
                    bundleId,
                    bookedByUid: verifiedUid,
                    sessionCount: String(sessionIds.length),
                    env: process.env.NODE_ENV ?? 'development',
                },
            });

            console.log('[create-intent] Bundle PaymentIntent created:', paymentIntent.id);

            // --- Persist bundle booking draft to Firestore ---
            const bundleDraftData = {
                stripePaymentIntentId: paymentIntent.id,
                paymentStatus: 'pending',
                bundleId,
                bundleName: bundleData.name ?? null,
                sessionIds,
                sessions: sessionsData,
                classType: bundleData.classType ?? null,
                className: bundleData.className ?? null,
                bookedByUid: verifiedUid,
                bookedByName: bookedByName ?? null,
                bookedByEmail: bookedByEmail ?? null,
                studentId: studentId ?? null,
                studentName: studentName ?? null,
                medicalInfo: medicalInfo ?? null,
                emergencyContact: emergencyContact ?? null,
                questionnaire: questionnaire ?? null,
                termsAccepted: termsAccepted ?? false,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            };

            try {
                await adminDb.doc(`booking_drafts/${paymentIntent.id}`).set(bundleDraftData);
                console.log('[create-intent] Bundle booking draft saved:', paymentIntent.id);
            } catch (firestoreErr: any) {
                // Draft write failed — cancel the PaymentIntent so the user
                // is not charged for a booking that can never be confirmed.
                console.error('[create-intent] Failed to save bundle booking draft:', {
                    message: firestoreErr.message,
                    code: firestoreErr.code,
                    details: firestoreErr.details,
                });
                try {
                    await stripe.paymentIntents.cancel(paymentIntent.id);
                    console.log('[create-intent] PaymentIntent cancelled after bundle draft failure:', paymentIntent.id);
                } catch (cancelErr) {
                    console.error('[create-intent] Failed to cancel PaymentIntent after bundle draft failure:', cancelErr);
                }
                return NextResponse.json(
                    { error: 'Failed to initialize booking. Please try again.' },
                    { status: 500 }
                );
            }

            return NextResponse.json({
                clientSecret: paymentIntent.client_secret,
                paymentIntentId: paymentIntent.id,
            });
        }

        // ================================================================
        // TERM BOOKING CODE PATH — triggered when classId + bookingType 'term'
        // Supports both authenticated (verifiedUid set) and guest (bookingMode === 'guest')
        // ================================================================
        if (classId && bookingType === 'term') {
            // --- Read class document (server-authoritative price) ---
            const classDoc = await adminDb.doc(`classes/${classId}`).get();
            if (!classDoc.exists) {
                return NextResponse.json({ error: 'Class not found.' }, { status: 404 });
            }
            const classData = classDoc.data()!;

            // --- Validate class is a term class ---
            if (classData.commitment !== 'term') {
                return NextResponse.json(
                    { error: 'This class is not a term class.' },
                    { status: 400 }
                );
            }

            // --- Validate term has not ended ---
            const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
            if (classData.termEndDate < today) {
                return NextResponse.json(
                    { error: 'Term has ended.' },
                    { status: 400 }
                );
            }

            // --- Validate spots available ---
            if (typeof classData.spotsAvailable === 'number' && classData.spotsAvailable <= 0) {
                return NextResponse.json(
                    { error: 'Class is full.' },
                    { status: 400 }
                );
            }

            // --- Server-authoritative pricing from class document ---
            const termAmount: number = classData.termPrice;
            if (!termAmount || typeof termAmount !== 'number' || termAmount <= 0) {
                console.error('[create-intent] Term class has invalid price:', { classId, termPrice: classData.termPrice });
                return NextResponse.json(
                    { error: 'Term pricing is unavailable. Please contact support.' },
                    { status: 500 }
                );
            }

            console.log('[create-intent] Creating term PaymentIntent:', {
                classId,
                amount: termAmount,
                bookingMode: isGuestTermBooking ? 'guest' : 'account',
                bookedByUid: verifiedUid ?? 'guest',
            });

            // --- Create Stripe PaymentIntent for term booking ---
            const paymentIntent = await stripe.paymentIntents.create({
                amount: termAmount,
                currency: 'gbp',
                automatic_payment_methods: { enabled: true },
                metadata: {
                    classId,
                    bookingType: 'term',
                    bookingMode: isGuestTermBooking ? 'guest' : 'account',
                    ...(verifiedUid && { bookedByUid: verifiedUid }),
                    env: process.env.NODE_ENV ?? 'development',
                },
            });

            console.log('[create-intent] Term PaymentIntent created:', paymentIntent.id);

            // --- Persist term booking draft to Firestore ---
            const termDraftData = {
                stripePaymentIntentId: paymentIntent.id,
                paymentStatus: 'pending',
                bookingType: 'term' as const,
                classId,
                className: className ?? classData.name ?? null,
                classType: classType ?? classData.type ?? null,
                venueName: venueName ?? classData.venueName ?? null,
                startTime: startTime ?? classData.startTime ?? null,
                endTime: endTime ?? classData.endTime ?? null,
                recurrenceDays: recurrenceDays ?? classData.recurrenceDays ?? null,
                termStartDate: termStartDate ?? classData.termStartDate ?? null,
                termEndDate: termEndDate ?? classData.termEndDate ?? null,
                // Auth fields — present for authenticated, absent for guest
                ...(isGuestTermBooking
                    ? {
                        bookingMode: 'guest' as const,
                        guestContact: guestContact ?? null,
                        childSnapshot: childSnapshot ?? null,
                        allergyDietaryInfo: allergyDietaryInfo ?? null,
                        authorisedCollector: authorisedCollector ?? null,
                        consentAudit: resolvedConsentAudit,
                        source: source ?? 'website_express',
                    }
                    : {
                        bookedByUid: verifiedUid,
                        bookedByName: bookedByName ?? null,
                        bookedByEmail: bookedByEmail ?? null,
                        studentId: studentId ?? null,
                        studentName: studentName ?? null,
                    }),
                medicalInfo: medicalInfo ?? null,
                emergencyContact: emergencyContact ?? null,
                questionnaire: questionnaire ?? null,
                termsAccepted: termsAccepted ?? false,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            };

            try {
                await adminDb.doc(`booking_drafts/${paymentIntent.id}`).set(termDraftData);
                console.log('[create-intent] Term booking draft saved:', paymentIntent.id);
            } catch (firestoreErr: any) {
                // Draft write failed — cancel the PaymentIntent so the user
                // is not charged for a booking that can never be confirmed.
                console.error('[create-intent] Failed to save term booking draft:', {
                    message: firestoreErr.message,
                    code: firestoreErr.code,
                    details: firestoreErr.details,
                });
                try {
                    await stripe.paymentIntents.cancel(paymentIntent.id);
                    console.log('[create-intent] PaymentIntent cancelled after term draft failure:', paymentIntent.id);
                } catch (cancelErr) {
                    console.error('[create-intent] Failed to cancel PaymentIntent after term draft failure:', cancelErr);
                }
                return NextResponse.json(
                    { error: 'Failed to initialize booking. Please try again.' },
                    { status: 500 }
                );
            }

            return NextResponse.json({
                clientSecret: paymentIntent.client_secret,
                paymentIntentId: paymentIntent.id,
            });
        }

        // ================================================================
        // SINGLE-SESSION CODE PATH (existing logic — unchanged)
        // ================================================================

        // --- Basic validation ---
        if (!sessionId) {
            return NextResponse.json({ error: 'Missing required field: sessionId' }, { status: 400 });
        }

        // --- Server-side session lookup: authoritative price + availability ---
        // Never trust the client-supplied amount — always read from Firestore.
        const sessionDoc = await adminDb.doc(`sessions/${sessionId}`).get();
        if (!sessionDoc.exists) {
            return NextResponse.json({ error: 'Session not found.' }, { status: 400 });
        }
        const sessionData = sessionDoc.data()!;

        if (sessionData.status !== 'open') {
            return NextResponse.json(
                { error: 'This session is no longer accepting bookings.' },
                { status: 400 }
            );
        }
        if (typeof sessionData.spotsAvailable === 'number' && sessionData.spotsAvailable <= 0) {
            return NextResponse.json(
                { error: 'Sorry, this session is now full.' },
                { status: 400 }
            );
        }

        const amount: number = sessionData.price;
        if (!amount || typeof amount !== 'number' || amount <= 0) {
            console.error('[create-intent] Session has invalid price:', { sessionId, price: sessionData.price });
            return NextResponse.json(
                { error: 'Session pricing is unavailable. Please contact support.' },
                { status: 500 }
            );
        }

        console.log('[create-intent] Creating PaymentIntent:', {
            sessionId,
            amount,
            bookedByUid: verifiedUid,
        });

        // --- Create Stripe PaymentIntent ---
        const paymentIntent = await stripe.paymentIntents.create({
            amount,
            currency: 'gbp',
            automatic_payment_methods: { enabled: true },
            // Minimal metadata: IDs only (Stripe metadata values are strings, 500-char limit)
            metadata: {
                sessionId,
                studentId: studentId ?? 'self',
                bookedByUid: verifiedUid,
                className: className ?? '',
                // Stripe metadata is informational only — the webhook reads from the
                // booking_draft document, not from PaymentIntent metadata.
                env: process.env.NODE_ENV ?? 'development',
            },
        });

        console.log('[create-intent] PaymentIntent created:', paymentIntent.id);

        // --- Persist booking draft to Firestore (server-side via Admin SDK) ---
        // This is the canonical source of booking data for the webhook.
        // Document ID = PaymentIntent ID → direct idempotency key.
        const draftData = {
            // Payment reference
            stripePaymentIntentId: paymentIntent.id,
            paymentStatus: 'pending',
            // Session
            sessionId,
            sessionDate: sessionDate ?? null,
            className: className ?? null,
            venueName: venueName ?? null,
            startTime: startTime ?? null,
            endTime: endTime ?? null,
            classType: classType ?? null,
            // User — UID is taken from the verified token, not the request body
            bookedByUid: verifiedUid,
            bookedByName: bookedByName ?? null,
            bookedByEmail: bookedByEmail ?? null,
            // Student
            studentId: studentId ?? null,
            studentName: studentName ?? null,
            // Booking data
            medicalInfo: medicalInfo ?? null,
            emergencyContact: emergencyContact ?? null,
            questionnaire: questionnaire ?? null,
            termsAccepted: termsAccepted ?? false,
            // Timestamps
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        try {
            await adminDb.doc(`booking_drafts/${paymentIntent.id}`).set(draftData);
            console.log('[create-intent] Booking draft saved:', paymentIntent.id);
        } catch (firestoreErr: any) {
            // Draft write failed — cancel the PaymentIntent so the user
            // is not charged for a booking that can never be confirmed.
            console.error('[create-intent] Failed to save booking draft:', {
                message: firestoreErr.message,
                code: firestoreErr.code,        // e.g. 'PERMISSION_DENIED', 'UNAUTHENTICATED'
                details: firestoreErr.details,
            });
            try {
                await stripe.paymentIntents.cancel(paymentIntent.id);
                console.log('[create-intent] PaymentIntent cancelled after draft failure:', paymentIntent.id);
            } catch (cancelErr) {
                console.error('[create-intent] Failed to cancel PaymentIntent after draft failure:', cancelErr);
            }
            return NextResponse.json(
                { error: 'Failed to initialize booking. Please try again.' },
                { status: 500 }
            );
        }

        return NextResponse.json({
            clientSecret: paymentIntent.client_secret,
            paymentIntentId: paymentIntent.id,
        });
    } catch (error: any) {
        console.error('[create-intent] Unexpected error:', error?.type, error?.message);
        return NextResponse.json(
            { error: error.message || 'Failed to create payment intent' },
            { status: 500 }
        );
    }
}
