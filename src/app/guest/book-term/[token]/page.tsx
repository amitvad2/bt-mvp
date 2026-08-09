import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createTokenService } from '@/lib/social-booking/token';
import {
  checkDeepLinkRateLimit,
  isIPBlocked,
  trackFailedTokenAttempt,
} from '@/lib/social-booking/rate-limit';
import { validateAndExtractUtmParams } from '@/lib/social-booking/utm-validation';
import { adminDb, adminInitError } from '@/lib/firebase-admin';

interface GuestBookTermPageProps {
  params: Promise<{ token: string }>;
  searchParams: Promise<{
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
  }>;
}

/**
 * Deep Link Resolution page — /guest/book-term/[token]
 *
 * Validates a Guest_Checkout_Token for programme (term) bookings,
 * applies rate limiting and IP blocking, then redirects to the
 * express-book-term page with social attribution params.
 *
 * This is the programme-booking equivalent of /guest/book/[token].
 *
 * Requirements: 13.6
 */
export default async function GuestBookTermPage({
  params,
  searchParams,
}: GuestBookTermPageProps) {
  const { token } = await params;
  const utmParams = await searchParams;

  // 1. Get client IP from headers
  const headersList = await headers();
  const ip =
    headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    headersList.get('x-real-ip') ||
    'unknown';

  // 2. Check if IP is blocked (5 failures → 30min block)
  const blocked = await isIPBlocked(ip);
  if (blocked) {
    return (
      <main style={{ padding: '2rem', maxWidth: '600px', margin: '0 auto', textAlign: 'center' }}>
        <h1>Too Many Attempts</h1>
        <p>
          Your access has been temporarily restricted due to too many invalid attempts.
          Please try again later.
        </p>
        <p style={{ marginTop: '1.5rem', color: '#666' }}>
          To start a new booking, please return to the social channel where you received
          your booking link and request a new one.
        </p>
      </main>
    );
  }

  // 3. Check deep link rate limit (20 req/min per IP)
  const rateLimitResult = await checkDeepLinkRateLimit(ip);
  if (!rateLimitResult.allowed) {
    return (
      <main style={{ padding: '2rem', maxWidth: '600px', margin: '0 auto', textAlign: 'center' }}>
        <h1>Too Many Requests</h1>
        <p>
          You have made too many requests. Please wait a moment before trying again.
        </p>
        <p style={{ marginTop: '1.5rem', color: '#666' }}>
          Try again in {rateLimitResult.retryAfterSeconds ?? 60} seconds.
        </p>
      </main>
    );
  }

  // 4. Check admin SDK initialisation
  if (adminInitError) {
    return (
      <main style={{ padding: '2rem', maxWidth: '600px', margin: '0 auto', textAlign: 'center' }}>
        <h1>Service Unavailable</h1>
        <p>We are experiencing technical difficulties. Please try again later.</p>
      </main>
    );
  }

  // 5. Validate and consume the token
  const tokenService = createTokenService();
  const result = await tokenService.validateAndConsume(token);

  // 6. Handle invalid/expired/consumed tokens
  if (!result.valid) {
    // Track failed attempt (only for truly invalid tokens — not expired or consumed)
    if (result.reason === 'invalid') {
      await trackFailedTokenAttempt(ip);
    }

    if (result.reason === 'expired') {
      return (
        <main style={{ padding: '2rem', maxWidth: '600px', margin: '0 auto', textAlign: 'center' }}>
          <h1>Link Expired</h1>
          <p>
            This booking link has expired. Links are valid for 15 minutes after they are generated.
          </p>
          <p style={{ marginTop: '1.5rem', color: '#666' }}>
            To book a programme, please return to the social channel where you received this
            link and request a new booking link.
          </p>
        </main>
      );
    }

    if (result.reason === 'consumed') {
      return (
        <main style={{ padding: '2rem', maxWidth: '600px', margin: '0 auto', textAlign: 'center' }}>
          <h1>Link Already Used</h1>
          <p>
            This booking link has already been used. Each link can only be used once.
          </p>
          <p style={{ marginTop: '1.5rem', color: '#666' }}>
            If you need to start a new booking, please return to the social channel
            where you received this link and request a new one.
          </p>
        </main>
      );
    }

    // Generic invalid token
    return (
      <main style={{ padding: '2rem', maxWidth: '600px', margin: '0 auto', textAlign: 'center' }}>
        <h1>Invalid Link</h1>
        <p>
          This booking link is not valid. It may have been copied incorrectly.
        </p>
        <p style={{ marginTop: '1.5rem', color: '#666' }}>
          To book a programme, please return to the social channel where you received
          your booking link and request a new one.
        </p>
      </main>
    );
  }

  // 7. Token is valid — extract classId (programme tokens store classId, not sessionId)
  const classId = result.classId || '';

  if (!classId) {
    // Token does not reference a programme class — redirect to per-session flow
    return (
      <main style={{ padding: '2rem', maxWidth: '600px', margin: '0 auto', textAlign: 'center' }}>
        <h1>Invalid Programme Link</h1>
        <p>
          This link is not associated with a programme booking.
        </p>
        <p style={{ marginTop: '1.5rem', color: '#666' }}>
          To book a programme, please return to the social channel where you received
          your booking link and request a new one.
        </p>
      </main>
    );
  }

  // 8. Verify the programme class is still bookable
  const classDoc = await adminDb.collection('classes').doc(classId).get();

  if (!classDoc.exists) {
    return (
      <main style={{ padding: '2rem', maxWidth: '600px', margin: '0 auto', textAlign: 'center' }}>
        <h1>Programme Not Found</h1>
        <p>
          The programme associated with this link could not be found.
        </p>
        <p style={{ marginTop: '1.5rem', color: '#666' }}>
          To find available programmes, please return to the social channel
          where you started your booking and browse the current offerings.
        </p>
      </main>
    );
  }

  const classData = classDoc.data()!;

  // Check the class is still a valid, bookable programme
  const today = new Date().toISOString().split('T')[0];
  if (
    classData.commitment !== 'term' ||
    classData.termEndDate < today ||
    (typeof classData.spotsAvailable === 'number' && classData.spotsAvailable <= 0)
  ) {
    return (
      <main style={{ padding: '2rem', maxWidth: '600px', margin: '0 auto', textAlign: 'center' }}>
        <h1>Programme No Longer Available</h1>
        <p>
          Sorry, the programme you selected is no longer available.
          It may have filled up or ended.
        </p>
        <p style={{ marginTop: '1.5rem', color: '#666' }}>
          To find another available programme, please return to the social channel
          where you started your booking and browse the current offerings.
        </p>
      </main>
    );
  }

  // 9. Store valid UTM params on the Social_Booking_Session (best-effort)
  const validUtm = validateAndExtractUtmParams(utmParams);
  if (validUtm && result.socialBookingSessionId) {
    try {
      await adminDb
        .collection('social_booking_sessions')
        .doc(result.socialBookingSessionId)
        .update({
          campaign: validUtm,
        });
    } catch {
      // Best-effort — do not block redirect on UTM storage failure
    }
  }

  // 10. Build redirect URL with social attribution query params
  const source = `social_${result.channel}`;
  const redirectUrl = new URL(
    `/express-book-term/${classId}`,
    'http://localhost' // Base URL placeholder — only pathname + search used
  );
  redirectUrl.searchParams.set('source', source);

  // Add campaign from session or UTM params
  const campaignName =
    validUtm?.campaign ||
    result.campaign?.campaign ||
    null;
  if (campaignName) {
    redirectUrl.searchParams.set('campaign', campaignName);
  }

  // Redirect to express-book-term page
  redirect(`${redirectUrl.pathname}${redirectUrl.search}`);
}
