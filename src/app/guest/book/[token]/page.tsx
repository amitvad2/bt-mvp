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

interface GuestBookPageProps {
  params: Promise<{ token: string }>;
  searchParams: Promise<{
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
  }>;
}

/**
 * Deep Link Resolution page — /guest/book/[token]
 *
 * Validates a Guest_Checkout_Token, applies rate limiting and IP blocking,
 * then redirects to the express-booking page with social attribution params.
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 11.4, 11.5
 */
export default async function GuestBookPage({
  params,
  searchParams,
}: GuestBookPageProps) {
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
            To book a class, please return to the social channel where you received this
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

    if (result.reason === 'session_unavailable') {
      return (
        <main style={{ padding: '2rem', maxWidth: '600px', margin: '0 auto', textAlign: 'center' }}>
          <h1>Session No Longer Available</h1>
          <p>
            Sorry, the cooking session you selected is no longer available.
            It may have filled up or been cancelled.
          </p>
          <p style={{ marginTop: '1.5rem', color: '#666' }}>
            To find another available session, please return to the social channel
            where you started your booking and browse the current sessions.
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
          To book a class, please return to the social channel where you received
          your booking link and request a new one.
        </p>
      </main>
    );
  }

  // 7. Token is valid — check if the session is still bookable
  const sessionDoc = await adminDb.collection('sessions').doc(result.sessionId).get();

  if (!sessionDoc.exists) {
    return (
      <main style={{ padding: '2rem', maxWidth: '600px', margin: '0 auto', textAlign: 'center' }}>
        <h1>Session Not Found</h1>
        <p>
          The cooking session associated with this link could not be found.
        </p>
        <p style={{ marginTop: '1.5rem', color: '#666' }}>
          To find available sessions, please return to the social channel
          where you started your booking and browse the current sessions.
        </p>
      </main>
    );
  }

  const sessionData = sessionDoc.data()!;

  if (sessionData.status !== 'open' || sessionData.spotsAvailable <= 0) {
    return (
      <main style={{ padding: '2rem', maxWidth: '600px', margin: '0 auto', textAlign: 'center' }}>
        <h1>Session No Longer Available</h1>
        <p>
          Sorry, the cooking session you selected is no longer available.
          It may have filled up or been cancelled.
        </p>
        <p style={{ marginTop: '1.5rem', color: '#666' }}>
          To find another available session, please return to the social channel
          where you started your booking and browse the current sessions.
        </p>
      </main>
    );
  }

  // 8. Store valid UTM params on the Social_Booking_Session (best-effort)
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

  // 9. Build redirect URL with social attribution query params
  const source = `social_${result.channel}`;
  const redirectUrl = new URL(
    `/express-booking/${result.sessionId}`,
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

  // Redirect to express-booking page
  redirect(`${redirectUrl.pathname}${redirectUrl.search}`);
}


