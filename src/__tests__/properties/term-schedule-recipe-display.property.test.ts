// Feature: recurring-term-classes, Property 11: Term class schedule displays recipe assignments
// **Validates: Requirements 10.2, 10.3**

// @vitest-environment node

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// --- Pure functions under test ---

/**
 * Represents a session as used in the schedule display.
 */
interface ScheduleSession {
  id: string;
  classId: string;
  date: string; // YYYY-MM-DD
  recipeName?: string;
  recipePhotoUrl?: string;
}

/**
 * Represents what is displayed for a single session row in the schedule.
 */
interface ScheduleDisplayRow {
  date: string;
  recipeName: string; // Actual name or "To be announced"
  hasRecipePhoto: boolean;
}

/**
 * Filters sessions to only those belonging to the given classId.
 * This mirrors the Firestore query: where('classId', '==', id)
 */
function filterSessionsByClassId(sessions: ScheduleSession[], classId: string): ScheduleSession[] {
  return sessions.filter(s => s.classId === classId);
}

/**
 * Sorts sessions chronologically by date (ascending).
 * This mirrors the Firestore orderBy('date', 'asc') used in TermClassScheduleModal.
 */
function sortSessionsByDate(sessions: ScheduleSession[]): ScheduleSession[] {
  return [...sessions].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Transforms a session into a display row for the schedule view.
 * Mirrors the rendering logic in TermClassScheduleModal:
 * - Shows recipeName if present, otherwise "To be announced"
 * - Shows recipe photo if recipePhotoUrl exists
 */
function toDisplayRow(session: ScheduleSession): ScheduleDisplayRow {
  return {
    date: session.date,
    recipeName: session.recipeName || 'To be announced',
    hasRecipePhoto: !!session.recipePhotoUrl,
  };
}

/**
 * Full pipeline: filter by classId → sort by date → map to display rows.
 * This is the pure logic equivalent of what TermClassScheduleModal does.
 */
function buildScheduleDisplay(sessions: ScheduleSession[], classId: string): ScheduleDisplayRow[] {
  const filtered = filterSessionsByClassId(sessions, classId);
  const sorted = sortSessionsByDate(filtered);
  return sorted.map(toDisplayRow);
}

// --- Arbitraries ---

// Generate YYYY-MM-DD date strings directly to avoid invalid Date issues
const dateArbitrary = fc.tuple(
  fc.integer({ min: 2024, max: 2026 }),
  fc.integer({ min: 1, max: 12 }),
  fc.integer({ min: 1, max: 28 }) // Use 28 to avoid month-length issues
).map(([year, month, day]) =>
  `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
);

const classIdArbitrary = fc.uuid();

const recipeNameArbitrary = fc.oneof(
  fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
  fc.constant(undefined)
);

const recipePhotoUrlArbitrary = fc.oneof(
  fc.webUrl(),
  fc.constant(undefined)
);

const scheduleSessionArbitrary = (classId?: string) =>
  fc.record({
    id: fc.uuid(),
    classId: classId ? fc.constant(classId) : classIdArbitrary,
    date: dateArbitrary,
    recipeName: recipeNameArbitrary,
    recipePhotoUrl: recipePhotoUrlArbitrary,
  });

// --- Property Tests ---

describe('Feature: recurring-term-classes, Property 11: Term class schedule displays recipe assignments', () => {
  describe('All sessions with matching classId are included in the schedule', () => {
    it('every session belonging to the target classId appears in the schedule display', () => {
      fc.assert(
        fc.property(
          classIdArbitrary,
          fc.array(scheduleSessionArbitrary(), { minLength: 0, maxLength: 30 }),
          (targetClassId, mixedSessions) => {
            // Add some sessions guaranteed to belong to the target class
            const targetSessions = mixedSessions.filter(s => s.classId === targetClassId);
            const display = buildScheduleDisplay(mixedSessions, targetClassId);

            expect(display.length).toBe(targetSessions.length);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('sessions belonging to other classes are excluded from the schedule', () => {
      fc.assert(
        fc.property(
          classIdArbitrary,
          classIdArbitrary,
          fc.array(scheduleSessionArbitrary(), { minLength: 1, maxLength: 20 }),
          (targetClassId, otherClassId, sessions) => {
            fc.pre(targetClassId !== otherClassId);

            // Ensure all sessions belong to otherClassId
            const otherSessions = sessions.map(s => ({ ...s, classId: otherClassId }));
            const display = buildScheduleDisplay(otherSessions, targetClassId);

            expect(display).toHaveLength(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('the count of display rows equals the count of sessions for that classId', () => {
      fc.assert(
        fc.property(
          classIdArbitrary,
          fc.array(scheduleSessionArbitrary(), { minLength: 0, maxLength: 30 }),
          fc.array(scheduleSessionArbitrary(), { minLength: 0, maxLength: 30 }),
          (targetClassId, targetSessions, otherSessions) => {
            const withTargetClass = targetSessions.map(s => ({ ...s, classId: targetClassId }));
            const allSessions = [...withTargetClass, ...otherSessions];

            const display = buildScheduleDisplay(allSessions, targetClassId);

            expect(display.length).toBe(withTargetClass.length);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Sessions are sorted chronologically by date', () => {
    it('display rows are in non-decreasing date order', () => {
      fc.assert(
        fc.property(
          classIdArbitrary,
          fc.array(scheduleSessionArbitrary(), { minLength: 2, maxLength: 30 }),
          (targetClassId, sessions) => {
            const allWithTargetClass = sessions.map(s => ({ ...s, classId: targetClassId }));
            const display = buildScheduleDisplay(allWithTargetClass, targetClassId);

            for (let i = 1; i < display.length; i++) {
              expect(display[i].date >= display[i - 1].date).toBe(true);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('sorting does not add or remove any sessions', () => {
      fc.assert(
        fc.property(
          classIdArbitrary,
          fc.array(scheduleSessionArbitrary(), { minLength: 0, maxLength: 30 }),
          (targetClassId, sessions) => {
            const allWithTargetClass = sessions.map(s => ({ ...s, classId: targetClassId }));
            const display = buildScheduleDisplay(allWithTargetClass, targetClassId);

            expect(display.length).toBe(allWithTargetClass.length);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('the sorted dates contain the same set of dates as the input (multiset equality)', () => {
      fc.assert(
        fc.property(
          classIdArbitrary,
          fc.array(scheduleSessionArbitrary(), { minLength: 0, maxLength: 30 }),
          (targetClassId, sessions) => {
            const allWithTargetClass = sessions.map(s => ({ ...s, classId: targetClassId }));
            const display = buildScheduleDisplay(allWithTargetClass, targetClassId);

            const inputDates = allWithTargetClass.map(s => s.date).sort();
            const outputDates = display.map(r => r.date).sort();

            expect(outputDates).toEqual(inputDates);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Each session shows recipe name or "To be announced" placeholder', () => {
    it('sessions with a recipeName display that name', () => {
      fc.assert(
        fc.property(
          classIdArbitrary,
          dateArbitrary,
          fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
          recipePhotoUrlArbitrary,
          (classId, date, recipeName, recipePhotoUrl) => {
            const session: ScheduleSession = {
              id: 'test-session',
              classId,
              date,
              recipeName,
              recipePhotoUrl,
            };

            const display = buildScheduleDisplay([session], classId);

            expect(display[0].recipeName).toBe(recipeName);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('sessions without a recipeName display "To be announced"', () => {
      fc.assert(
        fc.property(
          classIdArbitrary,
          dateArbitrary,
          recipePhotoUrlArbitrary,
          (classId, date, recipePhotoUrl) => {
            const session: ScheduleSession = {
              id: 'test-session',
              classId,
              date,
              recipeName: undefined,
              recipePhotoUrl,
            };

            const display = buildScheduleDisplay([session], classId);

            expect(display[0].recipeName).toBe('To be announced');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('sessions with empty string recipeName display "To be announced"', () => {
      fc.assert(
        fc.property(
          classIdArbitrary,
          dateArbitrary,
          recipePhotoUrlArbitrary,
          (classId, date, recipePhotoUrl) => {
            const session: ScheduleSession = {
              id: 'test-session',
              classId,
              date,
              recipeName: '',
              recipePhotoUrl,
            };

            const display = buildScheduleDisplay([session], classId);

            expect(display[0].recipeName).toBe('To be announced');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('every display row always has a non-empty recipeName string', () => {
      fc.assert(
        fc.property(
          classIdArbitrary,
          fc.array(scheduleSessionArbitrary(), { minLength: 1, maxLength: 30 }),
          (targetClassId, sessions) => {
            const allWithTargetClass = sessions.map(s => ({ ...s, classId: targetClassId }));
            const display = buildScheduleDisplay(allWithTargetClass, targetClassId);

            for (const row of display) {
              expect(row.recipeName.length).toBeGreaterThan(0);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Recipe photo is present when recipePhotoUrl exists', () => {
    it('sessions with a recipePhotoUrl have hasRecipePhoto = true', () => {
      fc.assert(
        fc.property(
          classIdArbitrary,
          dateArbitrary,
          recipeNameArbitrary,
          fc.webUrl(),
          (classId, date, recipeName, photoUrl) => {
            const session: ScheduleSession = {
              id: 'test-session',
              classId,
              date,
              recipeName,
              recipePhotoUrl: photoUrl,
            };

            const display = buildScheduleDisplay([session], classId);

            expect(display[0].hasRecipePhoto).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('sessions without a recipePhotoUrl have hasRecipePhoto = false', () => {
      fc.assert(
        fc.property(
          classIdArbitrary,
          dateArbitrary,
          recipeNameArbitrary,
          (classId, date, recipeName) => {
            const session: ScheduleSession = {
              id: 'test-session',
              classId,
              date,
              recipeName,
              recipePhotoUrl: undefined,
            };

            const display = buildScheduleDisplay([session], classId);

            expect(display[0].hasRecipePhoto).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('hasRecipePhoto is determined solely by the presence of recipePhotoUrl', () => {
      fc.assert(
        fc.property(
          classIdArbitrary,
          fc.array(scheduleSessionArbitrary(), { minLength: 1, maxLength: 30 }),
          (targetClassId, sessions) => {
            const allWithTargetClass = sessions.map(s => ({ ...s, classId: targetClassId }));
            const display = buildScheduleDisplay(allWithTargetClass, targetClassId);

            for (let i = 0; i < display.length; i++) {
              const originalSession = sortSessionsByDate(allWithTargetClass)[i];
              if (originalSession.recipePhotoUrl) {
                expect(display[i].hasRecipePhoto).toBe(true);
              } else {
                expect(display[i].hasRecipePhoto).toBe(false);
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
