/**
 * Feature: social-commerce-guest-booking, Property 19: Unavailable Session Rejection
 *
 * For any session selection where the session status is not 'open' or spotsAvailable
 * is 0, the Social_Booking_Service SHALL NOT transition to 'selecting-session' state
 * and SHALL inform the customer that the session is unavailable.
 *
 * Validates: Requirements 4.4
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { isSessionBookable } from '@/lib/social-booking/session-discovery';

// ─── Types ───────────────────────────────────────────────────────────────────

type SessionStatus = 'open' | 'full' | 'cancelled' | 'closed';

// ─── Generators ──────────────────────────────────────────────────────────────

/** Generates a session status that is NOT 'open' */
const arbNonOpenStatus: fc.Arbitrary<SessionStatus> = fc.constantFrom(
  'full',
  'cancelled',
  'closed'
);

/** Generates any valid session status */
const arbSessionStatus: fc.Arbitrary<SessionStatus> = fc.constantFrom(
  'open',
  'full',
  'cancelled',
  'closed'
);

/** Generates a spotsAvailable value of 0 (unavailable) */
const arbZeroSpots: fc.Arbitrary<number> = fc.constant(0);

/** Generates a spotsAvailable value > 0 (available) */
const arbPositiveSpots: fc.Arbitrary<number> = fc.integer({ min: 1, max: 50 });

/** Generates any spotsAvailable value (including 0) */
const arbSpots: fc.Arbitrary<number> = fc.integer({ min: 0, max: 50 });

// ─── In-Memory Session State Mock ────────────────────────────────────────────

interface MockSessionState {
  state: string;
  transitioned: boolean;
}

/**
 * Simulates the Social_Booking_Service selection flow:
 * - Check isSessionBookable
 * - If bookable: transition state to 'selecting-session'
 * - If not bookable: reject without state transition
 *
 * Returns the mock session state to verify no transition occurred.
 */
function attemptSessionSelection(
  session: { status: SessionStatus; spotsAvailable: number },
  currentSessionState: MockSessionState
): { rejected: boolean; sessionState: MockSessionState } {
  if (isSessionBookable(session)) {
    // Would transition to 'selecting-session'
    return {
      rejected: false,
      sessionState: { state: 'selecting-session', transitioned: true },
    };
  }

  // Rejected — no state transition
  return {
    rejected: true,
    sessionState: { ...currentSessionState, transitioned: false },
  };
}

// ─── Property Tests ──────────────────────────────────────────────────────────

describe('Property 19: Unavailable Session Rejection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sessions with status ≠ open are always rejected regardless of spotsAvailable', () => {
    fc.assert(
      fc.property(
        arbNonOpenStatus,
        arbSpots,
        (status, spots) => {
          const session = { status, spotsAvailable: spots };
          const initialState: MockSessionState = { state: 'started', transitioned: false };

          const result = attemptSessionSelection(session, initialState);

          // Must be rejected
          expect(result.rejected).toBe(true);
          // No state transition should have occurred
          expect(result.sessionState.transitioned).toBe(false);
          expect(result.sessionState.state).toBe('started');
        }
      ),
      { numRuns: 20 }
    );
  });

  it('sessions with spotsAvailable = 0 are always rejected regardless of status', () => {
    fc.assert(
      fc.property(
        arbSessionStatus,
        arbZeroSpots,
        (status, spots) => {
          const session = { status, spotsAvailable: spots };
          const initialState: MockSessionState = { state: 'started', transitioned: false };

          const result = attemptSessionSelection(session, initialState);

          // Must be rejected
          expect(result.rejected).toBe(true);
          // No state transition should have occurred
          expect(result.sessionState.transitioned).toBe(false);
          expect(result.sessionState.state).toBe('started');
        }
      ),
      { numRuns: 20 }
    );
  });

  it('isSessionBookable returns false for any session with status ≠ open OR spotsAvailable = 0', () => {
    fc.assert(
      fc.property(
        arbSessionStatus,
        arbSpots,
        (status, spots) => {
          const session = { status, spotsAvailable: spots };
          const bookable = isSessionBookable(session);

          if (status !== 'open' || spots === 0) {
            // Must NOT be bookable
            expect(bookable).toBe(false);
          } else {
            // status === 'open' AND spots > 0 → must be bookable
            expect(bookable).toBe(true);
          }
        }
      ),
      { numRuns: 20 }
    );
  });

  it('no state transition occurs on the Social_Booking_Session when session is unavailable', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          // Case 1: non-open status with any spots
          fc.record({
            status: arbNonOpenStatus,
            spotsAvailable: arbSpots,
          }),
          // Case 2: open status but zero spots
          fc.record({
            status: fc.constant('open' as SessionStatus),
            spotsAvailable: arbZeroSpots,
          })
        ),
        fc.constantFrom('started', 'selecting-session', 'checkout-created') as fc.Arbitrary<string>,
        (session, currentState) => {
          const initialState: MockSessionState = { state: currentState, transitioned: false };

          const result = attemptSessionSelection(session, initialState);

          // Rejection must occur
          expect(result.rejected).toBe(true);
          // The Social_Booking_Session state must remain unchanged
          expect(result.sessionState.state).toBe(currentState);
          expect(result.sessionState.transitioned).toBe(false);
        }
      ),
      { numRuns: 20 }
    );
  });

  it('only sessions with status === open AND spotsAvailable > 0 are accepted', () => {
    fc.assert(
      fc.property(
        arbPositiveSpots,
        (spots) => {
          const session = { status: 'open' as SessionStatus, spotsAvailable: spots };
          const initialState: MockSessionState = { state: 'started', transitioned: false };

          const result = attemptSessionSelection(session, initialState);

          // Must be accepted
          expect(result.rejected).toBe(false);
          // State transition should have occurred
          expect(result.sessionState.transitioned).toBe(true);
          expect(result.sessionState.state).toBe('selecting-session');
        }
      ),
      { numRuns: 20 }
    );
  });
});
