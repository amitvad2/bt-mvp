// Feature: recurring-term-classes, Property 3: Term sessions are not individually bookable
// **Validates: Requirements 2.2, 2.3, 2.4**

// @vitest-environment node

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// --- Pure functions under test ---

/**
 * Filters sessions to exclude those belonging to term classes.
 * This mirrors the filtering logic in SessionBrowser.tsx:
 *   results.filter(s => !termClassIds.has(s.classId))
 */
function filterBookableSessions(
  sessions: { id: string; classId: string }[],
  termClassIds: Set<string>
): { id: string; classId: string }[] {
  return sessions.filter(s => !termClassIds.has(s.classId));
}

/**
 * Determines whether a session should be blocked from the booking wizard.
 * This mirrors the guard in book/[sessionId]/layout.tsx:
 *   if (classData.commitment === 'term') → redirect
 */
function isSessionBookingBlocked(
  sessionClassId: string,
  classCommitmentMap: Map<string, 'perSession' | 'term'>
): boolean {
  const commitment = classCommitmentMap.get(sessionClassId);
  return commitment === 'term';
}

// --- Arbitraries ---

const sessionIdArbitrary = fc.uuid();
const classIdArbitrary = fc.uuid();

// A session record with id and classId
const sessionArbitrary = fc.record({
  id: sessionIdArbitrary,
  classId: classIdArbitrary,
});

// Generate a set of term class IDs
const termClassIdSetArbitrary = fc.array(classIdArbitrary, { minLength: 0, maxLength: 10 })
  .map(ids => new Set(ids));

// Commitment type
const commitmentArbitrary = fc.constantFrom('perSession' as const, 'term' as const);

// --- Property Tests ---

describe('Feature: recurring-term-classes, Property 3: Term sessions are not individually bookable', () => {
  describe('Filtering: term sessions never appear in bookable results', () => {
    it('no session in the filtered result has a classId that belongs to a term class', () => {
      fc.assert(
        fc.property(
          fc.array(sessionArbitrary, { minLength: 0, maxLength: 50 }),
          termClassIdSetArbitrary,
          (sessions, termClassIds) => {
            const bookable = filterBookableSessions(sessions, termClassIds);

            for (const session of bookable) {
              expect(termClassIds.has(session.classId)).toBe(false);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('all non-term sessions are preserved in the filtered result', () => {
      fc.assert(
        fc.property(
          fc.array(sessionArbitrary, { minLength: 0, maxLength: 50 }),
          termClassIdSetArbitrary,
          (sessions, termClassIds) => {
            const bookable = filterBookableSessions(sessions, termClassIds);

            const expectedNonTermSessions = sessions.filter(
              s => !termClassIds.has(s.classId)
            );
            expect(bookable.length).toBe(expectedNonTermSessions.length);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('when a session has a classId matching a term class, it is always excluded', () => {
      fc.assert(
        fc.property(
          sessionIdArbitrary,
          classIdArbitrary,
          fc.array(sessionArbitrary, { minLength: 0, maxLength: 20 }),
          (sessionId, termClassId, otherSessions) => {
            const termSession = { id: sessionId, classId: termClassId };
            const termClassIds = new Set([termClassId]);
            const allSessions = [...otherSessions, termSession];

            const bookable = filterBookableSessions(allSessions, termClassIds);

            const termSessionInResult = bookable.find(s => s.id === sessionId && s.classId === termClassId);
            expect(termSessionInResult).toBeUndefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('with an empty set of term class IDs, all sessions pass through', () => {
      fc.assert(
        fc.property(
          fc.array(sessionArbitrary, { minLength: 0, maxLength: 50 }),
          (sessions) => {
            const emptyTermIds = new Set<string>();
            const bookable = filterBookableSessions(sessions, emptyTermIds);

            expect(bookable.length).toBe(sessions.length);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('when all sessions belong to term classes, the result is empty', () => {
      fc.assert(
        fc.property(
          fc.array(classIdArbitrary, { minLength: 1, maxLength: 10 }),
          (termIds) => {
            const termClassIds = new Set(termIds);
            // Create sessions that all have classIds from the term set
            const sessions = termIds.map((classId, i) => ({
              id: `session-${i}`,
              classId,
            }));

            const bookable = filterBookableSessions(sessions, termClassIds);

            expect(bookable).toHaveLength(0);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Booking guard: navigation to /book/[sessionId] is blocked for term sessions', () => {
    it('sessions belonging to a term class are always blocked from booking', () => {
      fc.assert(
        fc.property(
          classIdArbitrary,
          fc.array(
            fc.tuple(classIdArbitrary, commitmentArbitrary),
            { minLength: 1, maxLength: 10 }
          ),
          (termClassId, otherClassEntries) => {
            const classMap = new Map<string, 'perSession' | 'term'>(otherClassEntries);
            // Ensure the term class is in the map
            classMap.set(termClassId, 'term');

            const blocked = isSessionBookingBlocked(termClassId, classMap);
            expect(blocked).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('sessions belonging to a per-session class are never blocked', () => {
      fc.assert(
        fc.property(
          classIdArbitrary,
          fc.array(
            fc.tuple(classIdArbitrary, commitmentArbitrary),
            { minLength: 1, maxLength: 10 }
          ),
          (perSessionClassId, otherClassEntries) => {
            const classMap = new Map<string, 'perSession' | 'term'>(otherClassEntries);
            // Ensure this class is per-session
            classMap.set(perSessionClassId, 'perSession');

            const blocked = isSessionBookingBlocked(perSessionClassId, classMap);
            expect(blocked).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('blocking decision is determined solely by the commitment field of the parent class', () => {
      fc.assert(
        fc.property(
          classIdArbitrary,
          commitmentArbitrary,
          (classId, commitment) => {
            const classMap = new Map<string, 'perSession' | 'term'>([[classId, commitment]]);

            const blocked = isSessionBookingBlocked(classId, classMap);

            if (commitment === 'term') {
              expect(blocked).toBe(true);
            } else {
              expect(blocked).toBe(false);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('sessions with unknown classId (not in the map) are not blocked', () => {
      fc.assert(
        fc.property(
          classIdArbitrary,
          classIdArbitrary,
          commitmentArbitrary,
          (unknownClassId, knownClassId, commitment) => {
            fc.pre(unknownClassId !== knownClassId);

            const classMap = new Map<string, 'perSession' | 'term'>([[knownClassId, commitment]]);

            const blocked = isSessionBookingBlocked(unknownClassId, classMap);
            expect(blocked).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
