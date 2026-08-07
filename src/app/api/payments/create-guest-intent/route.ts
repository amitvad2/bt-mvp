/**
 * POST /api/payments/create-guest-intent
 *
 * Creates a Stripe PaymentIntent for guest (unauthenticated) express checkout.
 * No Firebase auth token required — bot protection via Cloudflare Turnstile,
 * rate limiting via Vercel KV, and submission deduplication.
 *
 * Processing pipeline:
 * 1. Feature flag check → 403 if disabled
 * 2. Parse JSON body (max 64KB payload)
 * 3. Rate limit check (Vercel KV, per IP) → 429 if exceeded
 * 4. Turnstile token verification → 400 if invalid
 * 5. Submission reference deduplication (Vercel KV, 5min window) → 409 if duplicate
 * 6. Zod schema validation → 400 with field errors
 * 7. Session lookup from Firestore → 400 if not found/closed/cancelled/full/past
 * 8. Child age validation against session ageMin/ageMax → 400 if out of range
 * 9. Mandatory consent validation → 400 if any missing
 * 10. Create Stripe PaymentIntent (Firestore price, GBP, metadata: mode + sessionId + source + draftId)
 * 11. Save booking_drafts/{piId} with full payload
 * 12. If draft save fails → cancel PaymentIntent, return 500
 * 13. Return { clientSecret, paymentIntentId }
 */

import { NextResponse } from 'next/server';
import stripe from '@/lib/stripe';
import { adminDb, adminInitError } from '@/lib/firebase-admin';
import { isGuestCheckoutEnabled } from '@/lib/feature-flags';
import { verifyTurnstileToken } from '@/lib/turnstile';
import { checkRateLimit } from '@/lib/rate-limit';
import { validateChildAge } from '@/lib/guest-validation';
import { createGuestIntentSchema } from './schemas';
import { kv } from '@vercel/kv';
import * as admin from 'firebase-admin';

const MAX_PAYLOAD_BYTES = 64 * 1024; // 64KB

export async function POST(req: Request) {
  try {
    // 1. Feature flag check
    if (!isGuestCheckoutEnabled()) {
      return NextResponse.json(
        { error: 'Guest checkout is not available.', code: 'FEATURE_DISABLED' },
        { status: 403 }
      );
    }

    // Firebase Admin health check
    if (adminInitError) {
      console.error('[create-guest-intent] Firebase Admin SDK not initialized:', adminInitError);
      return NextResponse.json(
        { error: 'Booking service is temporarily unavailable.' },
        { status: 500 }
      );
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      console.error('[create-guest-intent] STRIPE_SECRET_KEY is not configured');
      return NextResponse.json(
        { error: 'Payment service is not configured.' },
        { status: 500 }
      );
    }

    // 2. Parse JSON body with 64KB payload limit
    const contentLength = req.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > MAX_PAYLOAD_BYTES) {
      return NextResponse.json(
        { error: 'Request payload too large.', code: 'PAYLOAD_TOO_LARGE' },
        { status: 413 }
      );
    }

    let body: unknown;
    try {
      const rawText = await req.text();
      if (rawText.length > MAX_PAYLOAD_BYTES) {
        return NextResponse.json(
          { error: 'Request payload too large.', code: 'PAYLOAD_TOO_LARGE' },
          { status: 413 }
        );
      }
      body = JSON.parse(rawText);
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body.', code: 'INVALID_JSON' },
        { status: 400 }
      );
    }

    // 3. Rate limit check per IP (5 requests per 60 seconds)
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      'unknown';

    const rateLimitResult = await checkRateLimit(ip, 5, 60);
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.', code: 'RATE_LIMITED' },
        { status: 429 }
      );
    }

    // 4. Turnstile token verification
    // Extract turnstile token from raw body before validation
    const rawBody = body as Record<string, unknown>;
    const turnstileToken = typeof rawBody?.turnstileToken === 'string' ? rawBody.turnstileToken : '';

    if (!turnstileToken) {
      return NextResponse.json(
        { error: 'Bot verification token is required.', code: 'TURNSTILE_MISSING' },
        { status: 400 }
      );
    }

    const turnstileValid = await verifyTurnstileToken(turnstileToken, ip);
    if (!turnstileValid) {
      return NextResponse.json(
        { error: 'Bot verification failed. Please refresh and try again.', code: 'TURNSTILE_FAILED' },
        { status: 400 }
      );
    }

    // 5. Submission reference deduplication (5-min window in Vercel KV)
    const submissionRef = typeof rawBody?.submissionRef === 'string' ? rawBody.submissionRef : '';
    if (submissionRef) {
      const dedupKey = `guest_intent_dedup:${submissionRef}`;
      const existing = await kv.get(dedupKey);
      if (existing) {
        return NextResponse.json(
          { error: 'This submission has already been processed.', code: 'DUPLICATE_SUBMISSION' },
          { status: 409 }
        );
      }
      // Mark this submission ref as used (5-minute TTL)
      await kv.set(dedupKey, '1', { ex: 300 });
    }

    // 6. Zod schema validation
    const parseResult = createGuestIntentSchema.safeParse(body);
    if (!parseResult.success) {
      const fieldErrors = parseResult.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }));
      return NextResponse.json(
        { error: 'Validation failed.', code: 'VALIDATION_ERROR', fieldErrors },
        { status: 400 }
      );
    }

    const data = parseResult.data;

    // 7. Session lookup from Firestore (validate open, future, spots > 0)
    const sessionDoc = await adminDb.doc(`sessions/${data.sessionId}`).get();
    if (!sessionDoc.exists) {
      return NextResponse.json(
        { error: 'Session not found.', code: 'SESSION_NOT_FOUND' },
        { status: 400 }
      );
    }

    const sessionData = sessionDoc.data()!;

    if (sessionData.status !== 'open') {
      return NextResponse.json(
        { error: 'This session is no longer accepting bookings.', code: 'SESSION_NOT_OPEN' },
        { status: 400 }
      );
    }

    // Check session date is in the future
    const sessionDate = sessionData.date as string;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sessionDateObj = new Date(sessionDate);
    sessionDateObj.setHours(0, 0, 0, 0);

    if (sessionDateObj < today) {
      return NextResponse.json(
        { error: 'This session has already taken place.', code: 'SESSION_PAST' },
        { status: 400 }
      );
    }

    if (typeof sessionData.spotsAvailable === 'number' && sessionData.spotsAvailable <= 0) {
      return NextResponse.json(
        { error: 'Sorry, this session is now full.', code: 'SESSION_FULL' },
        { status: 400 }
      );
    }

    // 8. Child age validation against session ageMin/ageMax
    const ageMin = sessionData.ageMin as number;
    const ageMax = sessionData.ageMax as number;

    if (!validateChildAge(data.childDetails.dateOfBirth, sessionDate, ageMin, ageMax)) {
      return NextResponse.json(
        {
          error: `Child's age must be between ${ageMin} and ${ageMax} years at the time of the session.`,
          code: 'CHILD_AGE_INVALID',
        },
        { status: 400 }
      );
    }

    // 9. Mandatory consent validation
    const mandatoryConsents = [
      'parentGuardianAuthority',
      'accuracyOfInformation',
      'healthSafetyDataProcessing',
      'emergencyAssistanceAuthorisation',
      'termsAndCancellationPolicy',
      'privacyNoticeAcknowledgement',
    ] as const;

    for (const consent of mandatoryConsents) {
      if (data.consents[consent] !== true) {
        return NextResponse.json(
          { error: 'All mandatory consents must be accepted.', code: 'CONSENT_MISSING' },
          { status: 400 }
        );
      }
    }

    // 10. Create Stripe PaymentIntent with Firestore-authoritative price (GBP)
    const amount: number = sessionData.price;
    if (!amount || typeof amount !== 'number' || amount <= 0) {
      console.error('[create-guest-intent] Session has invalid price:', {
        sessionId: data.sessionId,
        price: sessionData.price,
      });
      return NextResponse.json(
        { error: 'Session pricing is unavailable. Please contact support.' },
        { status: 500 }
      );
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: 'gbp',
      automatic_payment_methods: { enabled: true },
      // Only safe metadata — NO PII, NO medical data
      metadata: {
        bookingMode: 'guest',
        sessionId: data.sessionId,
        source: data.source,
        draftId: '', // Will be set to paymentIntent.id below
        env: process.env.NODE_ENV === 'production' ? 'production' : 'development',
      },
    });

    // Update draftId metadata to the paymentIntent ID
    await stripe.paymentIntents.update(paymentIntent.id, {
      metadata: {
        bookingMode: 'guest',
        sessionId: data.sessionId,
        source: data.source,
        draftId: paymentIntent.id,
        env: process.env.NODE_ENV === 'production' ? 'production' : 'development',
      },
    });

    // 11. Save booking_drafts/{piId} with full payload
    const consentAudit = {
      consents: data.consents,
      acceptedAt: admin.firestore.FieldValue.serverTimestamp(),
      acceptedBy: `${data.parentDetails.firstName} ${data.parentDetails.lastName}`,
      termsVersion: data.termsVersion,
      privacyNoticeVersion: data.privacyNoticeVersion,
      sourceChannel: data.source,
      submissionTimestamp: admin.firestore.FieldValue.serverTimestamp(),
    };

    const draftData = {
      stripePaymentIntentId: paymentIntent.id,
      paymentStatus: 'pending',
      bookingMode: 'guest',
      sessionId: data.sessionId,
      source: data.source,
      guestContact: data.parentDetails,
      childDetails: data.childDetails,
      medicalInfo: data.medicalInfo,
      allergyDietaryInfo: data.allergyDietaryInfo,
      emergencyContact: data.emergencyContact,
      authorisedCollector: data.authorisedCollector,
      consentAudit,
      submissionRef: data.submissionRef,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    try {
      await adminDb.doc(`booking_drafts/${paymentIntent.id}`).set(draftData);
      console.log('[create-guest-intent] Booking draft saved:', paymentIntent.id);
    } catch (firestoreErr: unknown) {
      // 12. If draft save fails → cancel PaymentIntent, return 500
      const errMessage = firestoreErr instanceof Error ? firestoreErr.message : 'Unknown error';
      console.error('[create-guest-intent] Failed to save booking draft:', errMessage);

      try {
        await stripe.paymentIntents.cancel(paymentIntent.id);
        console.log('[create-guest-intent] PaymentIntent cancelled after draft failure:', paymentIntent.id);
      } catch (cancelErr) {
        console.error('[create-guest-intent] Failed to cancel PaymentIntent:', cancelErr);
      }

      return NextResponse.json(
        { error: 'Failed to initialize booking. Please try again.' },
        { status: 500 }
      );
    }

    // 13. Return { clientSecret, paymentIntentId }
    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });
  } catch (error: unknown) {
    const errMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[create-guest-intent] Unexpected error:', errMessage);
    return NextResponse.json(
      { error: 'An unexpected error occurred. Please try again.' },
      { status: 500 }
    );
  }
}
