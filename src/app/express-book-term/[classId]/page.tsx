import { adminDb, adminInitError } from '@/lib/firebase-admin';
import { isGuestCheckoutEnabled } from '@/lib/feature-flags';
import GuestTermBookingClient from './GuestTermBookingClient';
import { GuestTermClassInfo } from './types';

interface ExpressBookTermPageProps {
  params: Promise<{ classId: string }>;
  searchParams: Promise<{ source?: string }>;
}

export default async function ExpressBookTermPage({
  params,
  searchParams,
}: ExpressBookTermPageProps) {
  const { classId } = await params;
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

  // Load class document from Firestore using Admin SDK
  const classDoc = await adminDb.collection('classes').doc(classId).get();

  // Class not found
  if (!classDoc.exists) {
    return (
      <main style={{ padding: '2rem', textAlign: 'center' }}>
        <h1>Programme Not Found</h1>
        <p>Programme not found. Please check your link.</p>
      </main>
    );
  }

  const classData = classDoc.data()!;

  // Validate commitment is 'term'
  if (classData.commitment !== 'term') {
    return (
      <main style={{ padding: '2rem', textAlign: 'center' }}>
        <h1>Invalid Programme</h1>
        <p>This class is not a term programme. Please check your link.</p>
      </main>
    );
  }

  // Check termEndDate — programme must not be expired
  const termEndDate = classData.termEndDate as string;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const endDate = new Date(termEndDate + 'T00:00:00');

  if (endDate < today) {
    return (
      <main style={{ padding: '2rem', textAlign: 'center' }}>
        <h1>Programme Ended</h1>
        <p>This programme has already ended and is no longer accepting bookings.</p>
      </main>
    );
  }

  // Check spotsAvailable
  if ((classData.spotsAvailable ?? 0) <= 0) {
    return (
      <main style={{ padding: '2rem', textAlign: 'center' }}>
        <h1>Programme Full</h1>
        <p>Sorry, this programme is now full. No spots available.</p>
      </main>
    );
  }

  // Map Firestore class document to GuestTermClassInfo
  // Fetch venue postcode if venueId is available
  let venuePostcode = '';
  if (classData.venueId) {
    try {
      const venueDoc = await adminDb.collection('venues').doc(classData.venueId).get();
      if (venueDoc.exists) {
        venuePostcode = venueDoc.data()?.postcode || '';
      }
    } catch (e) {
      // Best effort — continue without postcode
    }
  }

  const termClass: GuestTermClassInfo = {
    id: classId,
    name: classData.name,
    type: classData.type,
    startTime: classData.startTime,
    endTime: classData.endTime,
    venueName: classData.venueName || '',
    venuePostcode,
    ageMin: classData.ageMin,
    ageMax: classData.ageMax,
    termPrice: classData.termPrice,
    termStartDate: classData.termStartDate,
    termEndDate: classData.termEndDate,
    recurrenceDays: classData.recurrenceDays || [],
    spotsAvailable: classData.spotsAvailable,
    maxSize: classData.maxSize,
  };

  // Valid term class — render GuestTermBookingClient with class data and source prop
  return <GuestTermBookingClient termClass={termClass} source={source} />;
}
