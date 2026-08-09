/**
 * Guest Express Term Checkout — Confirmation Page (Server Component Shell)
 *
 * This is a thin server component that renders the ConfirmationClient.
 * No secrets or tokens in the URL — all sensitive data is read from
 * sessionStorage in the client component.
 */

import { isGuestCheckoutEnabled } from '@/lib/feature-flags';
import ConfirmationClient from './ConfirmationClient';

interface ConfirmationPageProps {
  params: Promise<{ classId: string }>;
}

export default async function GuestTermConfirmationPage({ params }: ConfirmationPageProps) {
  const { classId } = await params;

  // Feature flag check
  if (!isGuestCheckoutEnabled()) {
    return (
      <div style={{ padding: '4rem 1rem', textAlign: 'center' }}>
        <h2>Feature Not Available</h2>
        <p>Guest express checkout is not currently available.</p>
      </div>
    );
  }

  return <ConfirmationClient classId={classId} />;
}
