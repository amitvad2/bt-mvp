/**
 * Guest Express Checkout — Confirmation Page (Server Component Shell)
 *
 * This is a thin server component that renders the ConfirmationClient.
 * No secrets or tokens in the URL — all sensitive data is read from
 * sessionStorage in the client component.
 *
 * Requirements: GUEST-FR-010 (10.1–10.8), GUEST-SEC-004 (25.1–25.4)
 */

import { isGuestCheckoutEnabled } from '@/lib/feature-flags';
import ConfirmationClient from './ConfirmationClient';

interface ConfirmationPageProps {
  params: Promise<{ sessionId: string }>;
}

export default async function GuestConfirmationPage({ params }: ConfirmationPageProps) {
  const { sessionId } = await params;

  // Feature flag check
  if (!isGuestCheckoutEnabled()) {
    return (
      <div style={{ padding: '4rem 1rem', textAlign: 'center' }}>
        <h2>Feature Not Available</h2>
        <p>Guest express checkout is not currently available.</p>
      </div>
    );
  }

  return <ConfirmationClient sessionId={sessionId} />;
}
