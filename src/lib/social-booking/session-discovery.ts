import { adminDb } from '@/lib/firebase-admin';
import type { Session, SessionSummary, ProgrammeSummary } from '@/types';

/**
 * Determines whether a session is bookable for social channel selection.
 *
 * A session is bookable if and only if:
 * - status is 'open'
 * - spotsAvailable is greater than 0
 *
 * This check is performed BEFORE any state transition to 'selecting-session'.
 * If the session is not bookable, the Social_Booking_Service SHALL NOT transition
 * the Social_Booking_Session state and SHALL inform the customer.
 *
 * Requirements: 4.4
 */
export function isSessionBookable(session: Pick<Session, 'status' | 'spotsAvailable'>): boolean {
  return session.status === 'open' && session.spotsAvailable > 0;
}

/**
 * Format a YYYY-MM-DD date string to "Sat 19 Jul" format.
 */
export function formatSessionDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  // Create date at noon UTC to avoid timezone offset issues
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));

  const dayName = date.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' });
  const dayNum = date.getUTCDate();
  const monthName = date.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' });

  return `${dayName} ${dayNum} ${monthName}`;
}

/**
 * Format a price in pence to "£XX.XX" string.
 */
export function formatPrice(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

/**
 * Format age range as "min–max" using en-dash character.
 */
export function formatAgeRange(ageMin: number, ageMax: number): string {
  return `${ageMin}\u2013${ageMax}`;
}

/**
 * Query available sessions for social booking discovery.
 * Returns sessions that are open, have spots available, and are in the future.
 * Maximum 5 results, ordered by date ascending (earliest first).
 *
 * Requirements: 5.2, 5.3, 5.4
 */
export async function getAvailableSessions(): Promise<SessionSummary[]> {
  const today = new Date().toISOString().split('T')[0];

  const snapshot = await adminDb
    .collection('sessions')
    .where('status', '==', 'open')
    .where('spotsAvailable', '>', 0)
    .where('date', '>', today)
    .orderBy('date', 'asc')
    .limit(5)
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      sessionId: doc.id,
      className: data.className,
      date: formatSessionDate(data.date),
      startTime: data.startTime,
      venueName: data.venueName,
      ageRange: formatAgeRange(data.ageMin, data.ageMax),
      spotsAvailable: data.spotsAvailable,
      price: formatPrice(data.price),
    };
  });
}


/**
 * Determines whether a programme (term) class is bookable for social channel selection.
 *
 * A programme is bookable if and only if:
 * - commitment is 'term'
 * - spotsAvailable is greater than 0
 * - termEndDate is on or after today
 *
 * Requirements: 13.6
 */
export function isProgrammeBookable(termClass: {
  commitment: string;
  spotsAvailable?: number;
  termEndDate?: string;
}): boolean {
  if (termClass.commitment !== 'term') return false;
  if (typeof termClass.spotsAvailable !== 'number' || termClass.spotsAvailable <= 0) return false;
  if (!termClass.termEndDate) return false;
  const today = new Date().toISOString().split('T')[0];
  return termClass.termEndDate >= today;
}

/**
 * Query available programme (term) classes for social booking discovery.
 * Returns term classes that have spots available and have not expired.
 * Maximum 5 results, ordered by termStartDate ascending (earliest first).
 *
 * Requirements: 13.6
 */
export async function getAvailableProgrammes(): Promise<ProgrammeSummary[]> {
  const today = new Date().toISOString().split('T')[0];

  const snapshot = await adminDb
    .collection('classes')
    .where('commitment', '==', 'term')
    .where('spotsAvailable', '>', 0)
    .where('termEndDate', '>=', today)
    .orderBy('termStartDate', 'asc')
    .limit(5)
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      classId: doc.id,
      className: data.name,
      termStartDate: formatSessionDate(data.termStartDate),
      termEndDate: formatSessionDate(data.termEndDate),
      startTime: data.startTime,
      venueName: data.venueName ?? '',
      ageRange: formatAgeRange(data.ageMin, data.ageMax),
      spotsAvailable: data.spotsAvailable,
      price: `£${(data.termPrice / 100).toFixed(2)} for the programme`,
      recurrenceDays: data.recurrenceDays ?? undefined,
    };
  });
}
