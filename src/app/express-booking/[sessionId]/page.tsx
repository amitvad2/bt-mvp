import { adminDb, adminInitError } from '@/lib/firebase-admin';
import { isGuestCheckoutEnabled } from '@/lib/feature-flags';
import { GuestSessionInfo } from '@/types';
import GuestBookingClient from './GuestBookingClient';

interface ExpressBookingPageProps {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ source?: string }>;
}

export default async function ExpressBookingPage({
  params,
  searchParams,
}: ExpressBookingPageProps) {
  const { sessionId } = await params;
  const { source } = await searchParams;

  // Check feature flag — render "feature not available" if disabled
  if (!isGuestCheckoutEnabled()) {
    return (
      <main style={{ padding: '2rem', textAlign: 'center' }}>
        <h1>Guest Checkout Unavailable</h1>
        <p>Guest checkout is not available at this time.</p>
      </main>
    );
  }

  // Check Admin SDK initialisation
  if (adminInitError) {
    return (
      <main style={{ padding: '2rem', textAlign: 'center' }}>
        <h1>Service Unavailable</h1>
        <p>We are experiencing technical difficulties. Please try again later.</p>
      </main>
    );
  }

  // Load session document from Firestore using Admin SDK
  const sessionDoc = await adminDb.collection('sessions').doc(sessionId).get();

  // Session not found
  if (!sessionDoc.exists) {
    return (
      <main style={{ padding: '2rem', textAlign: 'center' }}>
        <h1>Session Not Found</h1>
        <p>Session not found. Please check your link.</p>
      </main>
    );
  }

  const sessionData = sessionDoc.data()!;

  // Session closed or cancelled
  if (sessionData.status === 'closed' || sessionData.status === 'cancelled') {
    return (
      <main style={{ padding: '2rem', textAlign: 'center' }}>
        <h1>Session Unavailable</h1>
        <p>This session is no longer accepting bookings.</p>
      </main>
    );
  }

  // Session date is in the past
  const sessionDate = new Date(sessionData.date + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (sessionDate < today) {
    return (
      <main style={{ padding: '2rem', textAlign: 'center' }}>
        <h1>Session Passed</h1>
        <p>This session has already taken place.</p>
      </main>
    );
  }

  // Session full (spotsAvailable <= 0)
  if (sessionData.spotsAvailable <= 0) {
    return (
      <main style={{ padding: '2rem', textAlign: 'center' }}>
        <h1>Session Full</h1>
        <p>Sorry, this session is now full.</p>
      </main>
    );
  }

  // Map Firestore session document to GuestSessionInfo
  const session: GuestSessionInfo = {
    id: sessionId,
    className: sessionData.className,
    classType: sessionData.classType,
    date: sessionData.date,
    startTime: sessionData.startTime,
    endTime: sessionData.endTime,
    venueName: sessionData.venueName,
    ageMin: sessionData.ageMin,
    ageMax: sessionData.ageMax,
    price: sessionData.price,
    spotsAvailable: sessionData.spotsAvailable,
    status: sessionData.status,
  };

  // Valid session — render GuestBookingClient with session data and source prop
  return <GuestBookingClient session={session} source={source} />;
}
