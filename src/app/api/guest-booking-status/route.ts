/**
 * GET /api/guest-booking-status?pi={paymentIntentId}&session={sessionId}
 *
 * Server-mediated confirmation page polling endpoint.
 * Returns non-sensitive booking summary without requiring authentication.
 *
 * Security mechanism:
 * - paymentIntentId format validated (must start with `pi_`)
 * - sessionId must match the booking's sessionId (prevents enumeration)
 * - Response contains only non-sensitive summary fields
 * - Rate-limited to 30 req/IP/60s to prevent brute-force enumeration
 * - Never returns medical/allergy/emergency data
 *
 * Requirements: GUEST-FR-010 (10.1–10.8), GUEST-SEC-004 (25.1–25.4)
 */

import { NextResponse } from 'next/server';
import { adminDb, adminInitError } from '@/lib/firebase-admin';
import { isGuestCheckoutEnabled } from '@/lib/feature-flags';
import { checkRateLimit } from '@/lib/rate-limit';

export async function GET(req: Request) {
  try {
    // 1. Feature flag check
    if (!isGuestCheckoutEnabled()) {
      return NextResponse.json({ status: 'unavailable' }, { status: 403 });
    }

    // Firebase Admin health check
    if (adminInitError) {
      console.error('[guest-booking-status] Firebase Admin SDK not initialized:', adminInitError);
      return NextResponse.json(
        { error: 'Booking service is temporarily unavailable.' },
        { status: 500 }
      );
    }

    // 2. Rate limit (30 req/IP/60s for polling)
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      'unknown';

    const rateLimitResult = await checkRateLimit(`status:${ip}`, 30, 60);
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: 'Too many requests.' },
        { status: 429 }
      );
    }

    // 3. Validate query params
    const { searchParams } = new URL(req.url);
    const pi = searchParams.get('pi');
    const session = searchParams.get('session');

    if (!pi || !pi.startsWith('pi_')) {
      return NextResponse.json(
        { error: 'Invalid payment reference.' },
        { status: 400 }
      );
    }

    if (!session) {
      return NextResponse.json(
        { error: 'Session parameter required.' },
        { status: 400 }
      );
    }

    // 4. Read booking from Firestore
    const bookingDoc = await adminDb.doc(`bookings/${pi}`).get();

    if (!bookingDoc.exists) {
      // Booking not yet created by webhook — return pending status
      return NextResponse.json({ status: 'pending' });
    }

    const booking = bookingDoc.data()!;

    // 5. Verify sessionId matches (prevent enumeration)
    if (booking.sessionId !== session) {
      // Return same error as invalid PI to prevent enumeration
      return NextResponse.json(
        { error: 'Invalid payment reference.' },
        { status: 400 }
      );
    }

    // 6. Return non-sensitive summary only
    // Never return: medical data, allergy info, emergency contacts,
    // full PI ID, parent email/phone, child last name
    return NextResponse.json({
      status: 'confirmed',
      reference: pi.slice(-8),
      childFirstName: booking.childSnapshot?.firstName ?? booking.studentName ?? '',
      className: booking.className ?? booking.sessionSnapshot?.className ?? '',
      date: booking.sessionDate ?? booking.sessionSnapshot?.date ?? '',
      startTime: booking.startTime ?? booking.sessionSnapshot?.startTime ?? '',
      endTime: booking.endTime ?? booking.sessionSnapshot?.endTime ?? '',
      venueName: booking.venueName ?? booking.sessionSnapshot?.venueName ?? '',
      amountPaid: booking.payment?.amount ?? 0,
    });
  } catch (error: unknown) {
    const errMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[guest-booking-status] Unexpected error:', errMessage);
    return NextResponse.json(
      { error: 'An unexpected error occurred.' },
      { status: 500 }
    );
  }
}
