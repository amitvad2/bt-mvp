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
import { adminDb, adminInitError } from '@/lib/firebase-admin';
import * as admin from 'firebase-admin';

export async function POST(req: Request) {
    try {
        const body = await req.json();

        const {
            // Payment
            amount,
            // Session identity
            sessionId,
            // User (from AuthContext in the client)
            bookedByUid,
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
            // Booking data
            medicalInfo,
            emergencyContact,
            questionnaire,
            termsAccepted,
        } = body;

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

        // --- Basic validation ---
        if (!sessionId || !amount || !bookedByUid) {
            console.error('[create-intent] Missing required fields:', {
                sessionId: !!sessionId,
                amount: !!amount,
                bookedByUid: !!bookedByUid,
            });
            return NextResponse.json(
                { error: 'Missing required fields: sessionId, amount, bookedByUid' },
                { status: 400 }
            );
        }

        if (!process.env.STRIPE_SECRET_KEY) {
            console.error('[create-intent] STRIPE_SECRET_KEY is not configured');
            return NextResponse.json(
                { error: 'Payment service is not configured. Please contact support.' },
                { status: 500 }
            );
        }

        console.log('[create-intent] Creating PaymentIntent:', {
            sessionId,
            amount,
            bookedByUid,
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
                bookedByUid,
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
            // User
            bookedByUid,
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
