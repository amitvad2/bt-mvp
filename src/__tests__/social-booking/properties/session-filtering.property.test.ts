/**
 * Feature: social-commerce-guest-booking, Property 9: Session Availability Filtering
 *
 * For any collection of sessions in Firestore, the `getAvailableSessions()` result
 * SHALL contain only sessions where status is 'open', spotsAvailable is greater than 0,
 * and date is after the current server date; SHALL be ordered by date ascending;
 * SHALL contain at most 5 entries (the 5 earliest); and each entry SHALL include
 * class name, formatted date, start time, venue name, age range, spots available,
 * and formatted price.
 *
 * Validates: Requirements 5.2, 5.3, 5.4
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';

// ─── Mock @/lib/firebase-admin ───────────────────────────────────────────────

// Use globalThis to share state between mock factory and test code
(globalThis as Record<string, unknown>).__sessionFilteringDocs__ = [] as Array<{
  id: string;
  data: Record<string, unknown>;
}>;

function getSessionDocs(): Array<{ id: string; data: Record<string, unknown> }> {
  return (globalThis as Record<string, unknown>).__sessionFilteringDocs__ as Array<{
    id: string;
    data: Record<string, unknown>;
  }>;
}

function setSessionDocs(docs: Array<{ id: string; data: Record<string, unknown> }>): void {
  (globalThis as Record<string, unknown>).__sessionFilteringDocs__ = docs;
}

vi.mock('@/lib/firebase-admin', () => {
  function getDocsInMock(): Array<{ id: string; data: Record<string, unknown> }> {
    return (globalThis as Record<string, unknown>).__sessionFilteringDocs__ as Array<{
      id: string;
      data: Record<string, unknown>;
    }>;
  }

  // Simulates Firestore query behaviour: applies where/orderBy/limit
  const adminDb = {
    collection: (_collectionPath: string) => {
      const filters: Array<{ field: string; op: string; value: unknown }> = [];
      let orderField: string | null = null;
      let orderDirection: string = 'asc';
      let limitCount: number | null = null;

      const queryRef: Record<string, unknown> = {
        where: (field: string, op: string, value: unknown) => {
          filters.push({ field, op, value });
          return queryRef;
        },
        orderBy: (field: string, direction: string = 'asc') => {
          orderField = field;
          orderDirection = direction;
          return queryRef;
        },
        limit: (n: number) => {
          limitCount = n;
          return queryRef;
        },
        get: async () => {
          let docs = getDocsInMock();

          // Apply filters
          for (const filter of filters) {
            docs = docs.filter((doc) => {
              const val = doc.data[filter.field];
              switch (filter.op) {
                case '==':
                  return val === filter.value;
                case '>':
                  return val > (filter.value as string | number);
                case '>=':
                  return val >= (filter.value as string | number);
                case '<':
                  return val < (filter.value as string | number);
                case '<=':
                  return val <= (filter.value as string | number);
                default:
                  return true;
              }
            });
          }

          // Apply ordering
          if (orderField) {
            const field = orderField;
            const dir = orderDirection;
            docs = [...docs].sort((a, b) => {
              const aVal = a.data[field] as string | number;
              const bVal = b.data[field] as string | number;
              if (aVal < bVal) return dir === 'asc' ? -1 : 1;
              if (aVal > bVal) return dir === 'asc' ? 1 : -1;
              return 0;
            });
          }

          // Apply limit
          if (limitCount !== null) {
            docs = docs.slice(0, limitCount);
          }

          return {
            docs: docs.map((doc) => ({
              id: doc.id,
              exists: true,
              data: () => doc.data,
            })),
            empty: docs.length === 0,
            size: docs.length,
          };
        },
      };

      return queryRef;
    },
  };

  return { adminDb };
});

// Import after mock
import { getAvailableSessions, formatSessionDate, formatPrice, formatAgeRange } from '@/lib/social-booking/session-discovery';

// ─── Generators ──────────────────────────────────────────────────────────────

/** Generate a YYYY-MM-DD date string by composing year/month/day integers directly */
const arbPastDate: fc.Arbitrary<string> = fc
  .tuple(
    fc.constantFrom(2024, 2025),
    fc.integer({ min: 1, max: 12 }),
    fc.integer({ min: 1, max: 28 })
  )
  .filter(([year, month]) => year < 2025 || month <= 6)
  .map(([year, month, day]) =>
    `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  );

const arbFutureDate: fc.Arbitrary<string> = fc
  .tuple(
    fc.constantFrom(2025, 2026),
    fc.integer({ min: 1, max: 12 }),
    fc.integer({ min: 1, max: 28 })
  )
  .filter(([year, month]) => year > 2025 || month >= 8)
  .map(([year, month, day]) =>
    `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  );

/** Firestore session status */
const arbSessionStatus = fc.constantFrom('open', 'full', 'cancelled', 'closed');

/** Spots available: mix of 0 and positive values */
const arbSpotsAvailable = fc.constantFrom(0, 1, 5, 10);

const FIXED_TODAY = '2025-07-01';

/** A raw Firestore session document */
const arbRawSession = fc.record({
  id: fc.uuid(),
  className: fc.constantFrom(
    'Kids After School Cooking',
    'Weekend Young Adult Cooking',
    'Summer Holiday Baking',
    'Italian Pasta Making',
    'Healthy Meals Workshop'
  ),
  status: arbSessionStatus,
  spotsAvailable: arbSpotsAvailable,
  // Mix of past, today, and future dates
  date: fc.oneof(
    // Past dates
    arbPastDate,
    // Today
    fc.constant(FIXED_TODAY),
    // Future dates
    arbFutureDate
  ),
  startTime: fc.constantFrom('10:30', '11:00', '14:00', '15:30', '16:00'),
  venueName: fc.constantFrom(
    'Blooming Kitchen HQ',
    "St Mary's Community Centre",
    'The Old Hall',
    'Riverside Studio'
  ),
  ageMin: fc.constantFrom(5, 8, 16, 18),
  ageMax: fc.constantFrom(12, 14, 25, 30),
  price: fc.constantFrom(1500, 2000, 2500, 3500, 5000),
  spotsTotal: fc.constantFrom(8, 10, 12, 15),
  classId: fc.uuid(),
  classType: fc.constantFrom('kidsAfterSchool', 'youngAdultWeekend'),
});

/** Generate a collection of 0-15 random sessions */
const arbSessionCollection = fc.array(arbRawSession, { minLength: 0, maxLength: 15 });

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Property 9: Session Availability Filtering', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(`${FIXED_TODAY}T12:00:00Z`));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('results contain ONLY sessions that are open, have spots > 0, and date is after today', async () => {
    await fc.assert(
      fc.asyncProperty(arbSessionCollection, async (sessions) => {
        // Setup mock data
        const docs = sessions.map((s) => ({
          id: s.id,
          data: {
            className: s.className,
            status: s.status,
            spotsAvailable: s.spotsAvailable,
            date: s.date,
            startTime: s.startTime,
            venueName: s.venueName,
            ageMin: s.ageMin,
            ageMax: s.ageMax,
            price: s.price,
            spotsTotal: s.spotsTotal,
            classId: s.classId,
            classType: s.classType,
          },
        }));
        setSessionDocs(docs);

        const result = await getAvailableSessions();

        // Every returned result must be from an eligible session
        for (const r of result) {
          const matchingSession = sessions.find((s) => s.id === r.sessionId);
          expect(matchingSession).toBeDefined();
          expect(matchingSession!.status).toBe('open');
          expect(matchingSession!.spotsAvailable).toBeGreaterThan(0);
          expect(matchingSession!.date > FIXED_TODAY).toBe(true);
        }
      }),
      { numRuns: 20 }
    );
  });

  it('results are ordered by date ascending', async () => {
    await fc.assert(
      fc.asyncProperty(arbSessionCollection, async (sessions) => {
        const docs = sessions.map((s) => ({
          id: s.id,
          data: {
            className: s.className,
            status: s.status,
            spotsAvailable: s.spotsAvailable,
            date: s.date,
            startTime: s.startTime,
            venueName: s.venueName,
            ageMin: s.ageMin,
            ageMax: s.ageMax,
            price: s.price,
            spotsTotal: s.spotsTotal,
            classId: s.classId,
            classType: s.classType,
          },
        }));
        setSessionDocs(docs);

        const result = await getAvailableSessions();

        // Get the original dates for each returned session
        const resultDates = result.map((r) => {
          const matchingSession = sessions.find((s) => s.id === r.sessionId);
          return matchingSession!.date;
        });

        // Verify ascending order
        for (let i = 1; i < resultDates.length; i++) {
          expect(resultDates[i] >= resultDates[i - 1]).toBe(true);
        }
      }),
      { numRuns: 20 }
    );
  });

  it('maximum 5 results are returned regardless of collection size', async () => {
    await fc.assert(
      fc.asyncProperty(arbSessionCollection, async (sessions) => {
        const docs = sessions.map((s) => ({
          id: s.id,
          data: {
            className: s.className,
            status: s.status,
            spotsAvailable: s.spotsAvailable,
            date: s.date,
            startTime: s.startTime,
            venueName: s.venueName,
            ageMin: s.ageMin,
            ageMax: s.ageMax,
            price: s.price,
            spotsTotal: s.spotsTotal,
            classId: s.classId,
            classType: s.classType,
          },
        }));
        setSessionDocs(docs);

        const result = await getAvailableSessions();

        expect(result.length).toBeLessThanOrEqual(5);
      }),
      { numRuns: 20 }
    );
  });

  it('the 5 results returned are the 5 earliest by date from the eligible set', async () => {
    await fc.assert(
      fc.asyncProperty(arbSessionCollection, async (sessions) => {
        const docs = sessions.map((s) => ({
          id: s.id,
          data: {
            className: s.className,
            status: s.status,
            spotsAvailable: s.spotsAvailable,
            date: s.date,
            startTime: s.startTime,
            venueName: s.venueName,
            ageMin: s.ageMin,
            ageMax: s.ageMax,
            price: s.price,
            spotsTotal: s.spotsTotal,
            classId: s.classId,
            classType: s.classType,
          },
        }));
        setSessionDocs(docs);

        const result = await getAvailableSessions();

        // Compute the expected top-5 eligible sessions sorted by date
        const eligible = sessions
          .filter((s) => s.status === 'open' && s.spotsAvailable > 0 && s.date > FIXED_TODAY)
          .sort((a, b) => a.date.localeCompare(b.date))
          .slice(0, 5);

        expect(result.length).toBe(eligible.length);

        // Each result should match the expected eligible session by ID and order
        for (let i = 0; i < result.length; i++) {
          expect(result[i].sessionId).toBe(eligible[i].id);
        }
      }),
      { numRuns: 20 }
    );
  });

  it('each result includes correctly formatted class name, date, start time, venue name, age range, spots, and price', async () => {
    await fc.assert(
      fc.asyncProperty(arbSessionCollection, async (sessions) => {
        const docs = sessions.map((s) => ({
          id: s.id,
          data: {
            className: s.className,
            status: s.status,
            spotsAvailable: s.spotsAvailable,
            date: s.date,
            startTime: s.startTime,
            venueName: s.venueName,
            ageMin: s.ageMin,
            ageMax: s.ageMax,
            price: s.price,
            spotsTotal: s.spotsTotal,
            classId: s.classId,
            classType: s.classType,
          },
        }));
        setSessionDocs(docs);

        const result = await getAvailableSessions();

        for (const r of result) {
          const matchingSession = sessions.find((s) => s.id === r.sessionId);
          expect(matchingSession).toBeDefined();

          // className matches raw data
          expect(r.className).toBe(matchingSession!.className);

          // date is formatted using formatSessionDate
          expect(r.date).toBe(formatSessionDate(matchingSession!.date));

          // startTime matches raw data
          expect(r.startTime).toBe(matchingSession!.startTime);

          // venueName matches raw data
          expect(r.venueName).toBe(matchingSession!.venueName);

          // ageRange is formatted with en-dash
          expect(r.ageRange).toBe(formatAgeRange(matchingSession!.ageMin, matchingSession!.ageMax));

          // spotsAvailable matches raw value
          expect(r.spotsAvailable).toBe(matchingSession!.spotsAvailable);

          // price is formatted as £XX.XX
          expect(r.price).toBe(formatPrice(matchingSession!.price));
        }
      }),
      { numRuns: 20 }
    );
  });
});
