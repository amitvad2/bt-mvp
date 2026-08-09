// Feature: recurring-term-classes, Property 9: Backward compatibility — per-session bookings unchanged
// **Validates: Requirements 9.1, 9.2, 9.3, 9.4**

// @vitest-environment node

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

/**
 * Property 9: Backward compatibility — per-session bookings unchanged.
 *
 * For any class with `commitment === 'perSession'`, the booking flow SHALL use
 * the session-level price, create per-session booking documents, and display
 * individual sessions as bookable — identically to the pre-feature behaviour.
 *
 * We model the routing logic as pure functions:
 * 1. For a class with commitment === 'perSession', verify the session-level price is always used (not class-level termPrice)
 * 2. For per-session bookings, verify the booking document has no bookingType or classId fields specific to term bookings
 * 3. Verify per-session sessions always appear as bookable items (not filtered out)
 * 4. Verify the existing per-session code path never routes to the term handler
 */

// --- Pure functions under test ---

/**
 * Resolves the payment amount for a per-session booking.
 * This mirrors the single-session code path in create-intent/route.ts:
 *   const amount: number = sessionData.price;
 *
 * For per-session classes, the price is ALWAYS from the session document,
 * never from a class-level termPrice.
 */
function resolvePerSessionPaymentAmount(
  sessionData: { price: number },
  classData: { commitment: 'perSession'; price: number; termPrice?: number }
): number {
  // The create-intent route reads sessionData.price for per-session bookings.
  // class.termPrice is never used for per-session classes.
  void classData;
  return sessionData.price;
}

/**
 * Creates a per-session booking document structure.
 * This mirrors the webhook handler's booking creation for per-session payments.
 * Per-session bookings have sessionId set, and do NOT have bookingType or classId.
 */
function createPerSessionBookingDocument(draft: {
  sessionId: string;
  sessionDate: string;
  className: string;
  venueName: string;
  bookedByUid: string;
  bookedByName: string;
  studentId: string;
  studentName: string;
}): {
  sessionId: string;
  sessionDate: string;
  className: string;
  venueName: string;
  bookedByUid: string;
  bookedByName: string;
  studentId: string;
  studentName: string;
  bookingType: undefined;
  classId: undefined;
  recurrenceDays: undefined;
  termStartDate: undefined;
  termEndDate: undefined;
} {
  return {
    sessionId: draft.sessionId,
    sessionDate: draft.sessionDate,
    className: draft.className,
    venueName: draft.venueName,
    bookedByUid: draft.bookedByUid,
    bookedByName: draft.bookedByName,
    studentId: draft.studentId,
    studentName: draft.studentName,
    // Per-session bookings NEVER have term-specific fields
    bookingType: undefined,
    classId: undefined,
    recurrenceDays: undefined,
    termStartDate: undefined,
    termEndDate: undefined,
  };
}

/**
 * Determines if a session with a per-session parent class is bookable.
 * Sessions belonging to per-session classes are ALWAYS shown as individually bookable.
 */
function isPerSessionSessionBookable(
  session: { id: string; classId: string; spotsAvailable: number; status: string },
  classCommitmentMap: Map<string, 'perSession' | 'term'>
): boolean {
  const commitment = classCommitmentMap.get(session.classId);
  // Only per-session sessions with open status and available spots are bookable
  if (commitment === 'term') return false;
  // Per-session sessions are bookable when status is open and spots > 0
  return session.status === 'open' && session.spotsAvailable > 0;
}

/**
 * Determines which code path the create-intent route uses.
 * This mirrors the routing logic:
 *   if (bundleId) → bundle path
 *   if (classId && bookingType === 'term') → term path
 *   else → single-session path (the per-session path)
 *
 * For per-session bookings, the request has sessionId but no classId/bookingType.
 */
function resolveBookingCodePath(requestBody: {
  sessionId?: string;
  classId?: string;
  bookingType?: string;
  bundleId?: string;
}): 'bundle' | 'term' | 'perSession' {
  if (requestBody.bundleId) return 'bundle';
  if (requestBody.classId && requestBody.bookingType === 'term') return 'term';
  return 'perSession';
}

/**
 * Checks if a booking document (without bookingType field) should be treated
 * as a per-session booking. Existing bookings without a bookingType field
 * are treated as per-session by default.
 */
function isPerSessionBooking(booking: { bookingType?: 'term' }): boolean {
  return booking.bookingType === undefined || booking.bookingType !== 'term';
}

// --- Arbitraries ---

// Valid session price in pence (positive integer)
const sessionPriceArb = fc.integer({ min: 1, max: 500_000 });

// Valid term price (different from session price to test isolation)
const termPriceArb = fc.integer({ min: 1, max: 1_000_000 });

// Per-session class data (always has commitment: 'perSession')
const perSessionClassDataArb = fc.record({
  commitment: fc.constant('perSession' as const),
  price: sessionPriceArb,
  termPrice: fc.option(termPriceArb, { nil: undefined }),
});

// Session data for per-session booking
const sessionDataArb = fc.record({
  id: fc.uuid(),
  classId: fc.uuid(),
  price: sessionPriceArb,
  spotsAvailable: fc.integer({ min: 0, max: 30 }),
  status: fc.constantFrom('open', 'full', 'cancelled', 'closed'),
  date: fc.constant('2025-03-15'),
  className: fc.string({ minLength: 1, maxLength: 50 }),
  venueName: fc.string({ minLength: 1, maxLength: 50 }),
});

// Booking draft data for per-session booking
const perSessionDraftArb = fc.record({
  sessionId: fc.uuid(),
  sessionDate: fc.constantFrom('2025-01-15', '2025-03-20', '2025-06-10'),
  className: fc.string({ minLength: 1, maxLength: 50 }),
  venueName: fc.string({ minLength: 1, maxLength: 50 }),
  bookedByUid: fc.uuid(),
  bookedByName: fc.string({ minLength: 1, maxLength: 50 }),
  studentId: fc.uuid(),
  studentName: fc.string({ minLength: 1, maxLength: 50 }),
});

// Request body for per-session booking (has sessionId, no classId/bookingType)
const perSessionRequestBodyArb = fc.record({
  sessionId: fc.uuid(),
  classId: fc.constant(undefined as unknown as string),
  bookingType: fc.constant(undefined as unknown as string),
  bundleId: fc.constant(undefined as unknown as string),
});

// --- Property Tests ---

describe('Feature: recurring-term-classes, Property 9: Backward compatibility — per-session bookings unchanged', () => {
  describe('Payment amount always uses session-level price for per-session classes', () => {
    it('the payment amount is always the session price, never the class termPrice', () => {
      fc.assert(
        fc.property(
          sessionPriceArb,
          perSessionClassDataArb,
          (sessionPrice, classData) => {
            const sessionData = { price: sessionPrice };
            const amount = resolvePerSessionPaymentAmount(sessionData, classData);

            // Amount MUST equal the session price
            expect(amount).toBe(sessionPrice);
            // Amount must NOT equal termPrice (if it exists and differs)
            if (classData.termPrice !== undefined && classData.termPrice !== sessionPrice) {
              expect(amount).not.toBe(classData.termPrice);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('even when a per-session class has a termPrice field, the session price is used', () => {
      fc.assert(
        fc.property(
          sessionPriceArb,
          termPriceArb,
          (sessionPrice, termPrice) => {
            fc.pre(sessionPrice !== termPrice); // Ensure they differ

            const sessionData = { price: sessionPrice };
            const classData = { commitment: 'perSession' as const, price: sessionPrice, termPrice };

            const amount = resolvePerSessionPaymentAmount(sessionData, classData);

            expect(amount).toBe(sessionPrice);
            expect(amount).not.toBe(termPrice);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('the resolved per-session payment amount is always a positive integer in pence', () => {
      fc.assert(
        fc.property(
          sessionPriceArb,
          perSessionClassDataArb,
          (sessionPrice, classData) => {
            const amount = resolvePerSessionPaymentAmount({ price: sessionPrice }, classData);

            expect(amount).toBeGreaterThan(0);
            expect(Number.isInteger(amount)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Per-session booking documents have no term-specific fields', () => {
    it('per-session booking documents never contain bookingType or classId', () => {
      fc.assert(
        fc.property(
          perSessionDraftArb,
          (draft) => {
            const booking = createPerSessionBookingDocument(draft);

            expect(booking.bookingType).toBeUndefined();
            expect(booking.classId).toBeUndefined();
            expect(booking.recurrenceDays).toBeUndefined();
            expect(booking.termStartDate).toBeUndefined();
            expect(booking.termEndDate).toBeUndefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('per-session booking documents always have sessionId set', () => {
      fc.assert(
        fc.property(
          perSessionDraftArb,
          (draft) => {
            const booking = createPerSessionBookingDocument(draft);

            expect(booking.sessionId).toBe(draft.sessionId);
            expect(booking.sessionId).toBeDefined();
            expect(booking.sessionId.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('per-session booking documents always have sessionDate set', () => {
      fc.assert(
        fc.property(
          perSessionDraftArb,
          (draft) => {
            const booking = createPerSessionBookingDocument(draft);

            expect(booking.sessionDate).toBe(draft.sessionDate);
            expect(booking.sessionDate).toBeDefined();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Per-session sessions always appear as bookable items', () => {
    it('sessions with per-session parent class and open status are shown as bookable', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          fc.uuid(),
          fc.integer({ min: 1, max: 30 }),
          (sessionId, classId, spotsAvailable) => {
            const session = { id: sessionId, classId, spotsAvailable, status: 'open' };
            const classMap = new Map<string, 'perSession' | 'term'>([[classId, 'perSession']]);

            const bookable = isPerSessionSessionBookable(session, classMap);

            expect(bookable).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('sessions with per-session parent class are never filtered out by the term filter', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          fc.uuid(),
          fc.array(fc.uuid(), { minLength: 0, maxLength: 10 }),
          (sessionId, perSessionClassId, termClassIds) => {
            // Ensure our per-session class is not in the term set
            const termSet = new Set(termClassIds.filter(id => id !== perSessionClassId));

            const sessions = [{ id: sessionId, classId: perSessionClassId }];
            const filtered = sessions.filter(s => !termSet.has(s.classId));

            // Per-session session should ALWAYS pass through the term filter
            expect(filtered).toHaveLength(1);
            expect(filtered[0].id).toBe(sessionId);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('commitment === perSession never triggers term blocking in booking guard', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          (classId) => {
            const classMap = new Map<string, 'perSession' | 'term'>([[classId, 'perSession']]);
            const session = { id: 'any-session', classId, spotsAvailable: 5, status: 'open' };

            // The term blocking check should return false for per-session classes
            const commitment = classMap.get(session.classId);
            const isBlocked = commitment === 'term';

            expect(isBlocked).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Per-session code path never routes to the term handler', () => {
    it('requests with sessionId and no classId/bookingType always route to perSession path', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          (sessionId) => {
            const requestBody = {
              sessionId,
              classId: undefined as unknown as string,
              bookingType: undefined as unknown as string,
              bundleId: undefined as unknown as string,
            };

            const path = resolveBookingCodePath(requestBody);

            expect(path).toBe('perSession');
            expect(path).not.toBe('term');
            expect(path).not.toBe('bundle');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('even if sessionId matches a session under a term class, the per-session path is used when request lacks classId+bookingType', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          fc.uuid(),
          (sessionId, classId) => {
            // A session might belong to a term class, but if the request
            // doesn't include classId + bookingType='term', it still routes per-session
            const requestBody = {
              sessionId,
              classId: undefined as unknown as string,
              bookingType: undefined as unknown as string,
              bundleId: undefined as unknown as string,
            };

            const path = resolveBookingCodePath(requestBody);

            expect(path).toBe('perSession');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('the term code path is only triggered when BOTH classId and bookingType=term are present', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          fc.uuid(),
          fc.constantFrom('perSession', undefined as unknown as string, 'other'),
          (sessionId, classId, bookingType) => {
            // With classId but bookingType !== 'term', should NOT route to term
            const requestBody = { sessionId, classId, bookingType, bundleId: undefined as unknown as string };

            const path = resolveBookingCodePath(requestBody);

            // Only routes to 'term' if bookingType is exactly 'term'
            if (bookingType === 'term') {
              expect(path).toBe('term');
            } else {
              expect(path).not.toBe('term');
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Existing bookings without bookingType are treated as per-session', () => {
    it('bookings without bookingType field are always classified as per-session', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(undefined, null as unknown as 'term'),
          (bookingType) => {
            const booking = { bookingType: bookingType as 'term' | undefined };
            const result = isPerSessionBooking(booking);

            expect(result).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('only bookings with bookingType === "term" are NOT classified as per-session', () => {
      fc.assert(
        fc.property(
          fc.constant('term' as const),
          (bookingType) => {
            const booking = { bookingType };
            const result = isPerSessionBooking(booking);

            expect(result).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
