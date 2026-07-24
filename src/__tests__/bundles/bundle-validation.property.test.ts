// Feature: session-bundles, Property 1: Bundle validation schema
// Feature: session-bundles, Property 2: Session filter for bundle creation
// Feature: session-bundles, Property 3: Bundle document completeness
// **Validates: Requirements 1.2, 1.3, 1.4, 1.6, 7.1**

// @vitest-environment node

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// --- Property 1: Bundle validation schema ---

/**
 * Validates bundle input according to the BundleForm rules:
 * - name: 3–100 characters
 * - sessionIds: 2–20 sessions
 * - bundlePrice: integer > 0 and <= totalIndividualPrice
 */
function validateBundleInput(input: {
  name: string;
  sessionIds: string[];
  bundlePrice: number;
  totalIndividualPrice: number;
}): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (input.name.length < 3) errors.push('Name must be at least 3 characters');
  if (input.name.length > 100) errors.push('Name must be at most 100 characters');
  if (input.sessionIds.length < 2) errors.push('Select at least 2 sessions');
  if (input.sessionIds.length > 20) errors.push('Maximum 20 sessions');
  if (input.bundlePrice < 1) errors.push('Price must be at least 1 pence');
  if (input.bundlePrice > input.totalIndividualPrice)
    errors.push('Bundle price cannot exceed total individual price');
  return { valid: errors.length === 0, errors };
}

// --- Property 2: Session filter for bundle creation ---

/**
 * Filters sessions to only those with the selected classId and status 'open'.
 */
function filterSessionsForBundle(
  sessions: { classId: string; status: string }[],
  selectedClassId: string
): { classId: string; status: string }[] {
  return sessions.filter(s => s.classId === selectedClassId && s.status === 'open');
}

// --- Property 3: Bundle document completeness ---

/**
 * Builds a bundle document from valid input, adding status and createdAt defaults.
 */
function buildBundleDocument(input: {
  name: string;
  classId: string;
  sessionIds: string[];
  bundlePrice: number;
  totalIndividualPrice: number;
  className: string;
  classType: string;
  venueId: string;
  venueName: string;
}): Record<string, any> {
  return { ...input, status: 'active', createdAt: 'SERVER_TIMESTAMP' };
}

// --- Arbitraries ---

// Valid bundle name: 3–100 characters
const validNameArbitrary = fc.string({ minLength: 3, maxLength: 100 });

// Invalid bundle names (too short or too long)
const tooShortNameArbitrary = fc.string({ minLength: 0, maxLength: 2 });
const tooLongNameArbitrary = fc.string({ minLength: 101, maxLength: 150 });

// Session IDs: array of unique UUID-like strings
const sessionIdArbitrary = fc.uuid();
const validSessionIdsArbitrary = fc.array(sessionIdArbitrary, { minLength: 2, maxLength: 20 });
const tooFewSessionIdsArbitrary = fc.array(sessionIdArbitrary, { minLength: 0, maxLength: 1 });
const tooManySessionIdsArbitrary = fc.array(sessionIdArbitrary, { minLength: 21, maxLength: 25 });

// Bundle price: positive integer in pence
const validBundlePriceArbitrary = fc.integer({ min: 1, max: 100000 });

// Total individual price: must be >= bundlePrice for valid inputs
const totalPriceForValidBundle = (bundlePrice: number) =>
  fc.integer({ min: bundlePrice, max: bundlePrice + 50000 });

// Session statuses
const sessionStatusArbitrary = fc.constantFrom('open', 'full', 'cancelled', 'closed');

// Class IDs for session filter tests
const classIdArbitrary = fc.uuid();

// Session record for filter tests
const sessionRecordArbitrary = fc.record({
  classId: classIdArbitrary,
  status: sessionStatusArbitrary,
});

// Arbitraries for document completeness
const classNameArbitrary = fc.string({ minLength: 1, maxLength: 50 });
const classTypeArbitrary = fc.constantFrom('kidsAfterSchool', 'youngAdultWeekend');
const venueIdArbitrary = fc.uuid();
const venueNameArbitrary = fc.string({ minLength: 1, maxLength: 50 });

// --- Property 1 Tests ---

describe('Property 1: Bundle validation schema', () => {
  it('accepts valid bundles with name 3–100 chars, 2–20 sessions, price > 0 and <= total', () => {
    fc.assert(
      fc.property(
        validNameArbitrary,
        validSessionIdsArbitrary,
        validBundlePriceArbitrary,
        (name, sessionIds, bundlePrice) => {
          const totalIndividualPrice = bundlePrice + Math.floor(Math.random() * 5000);
          const result = validateBundleInput({
            name,
            sessionIds,
            bundlePrice,
            totalIndividualPrice,
          });
          expect(result.valid).toBe(true);
          expect(result.errors).toHaveLength(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('rejects bundles with name shorter than 3 characters', () => {
    fc.assert(
      fc.property(
        tooShortNameArbitrary,
        validSessionIdsArbitrary,
        validBundlePriceArbitrary,
        (name, sessionIds, bundlePrice) => {
          const totalIndividualPrice = bundlePrice + 1000;
          const result = validateBundleInput({
            name,
            sessionIds,
            bundlePrice,
            totalIndividualPrice,
          });
          expect(result.valid).toBe(false);
          expect(result.errors).toContain('Name must be at least 3 characters');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('rejects bundles with name longer than 100 characters', () => {
    fc.assert(
      fc.property(
        tooLongNameArbitrary,
        validSessionIdsArbitrary,
        validBundlePriceArbitrary,
        (name, sessionIds, bundlePrice) => {
          const totalIndividualPrice = bundlePrice + 1000;
          const result = validateBundleInput({
            name,
            sessionIds,
            bundlePrice,
            totalIndividualPrice,
          });
          expect(result.valid).toBe(false);
          expect(result.errors).toContain('Name must be at most 100 characters');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('rejects bundles with fewer than 2 sessions', () => {
    fc.assert(
      fc.property(
        validNameArbitrary,
        tooFewSessionIdsArbitrary,
        validBundlePriceArbitrary,
        (name, sessionIds, bundlePrice) => {
          const totalIndividualPrice = bundlePrice + 1000;
          const result = validateBundleInput({
            name,
            sessionIds,
            bundlePrice,
            totalIndividualPrice,
          });
          expect(result.valid).toBe(false);
          expect(result.errors).toContain('Select at least 2 sessions');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('rejects bundles with more than 20 sessions', () => {
    fc.assert(
      fc.property(
        validNameArbitrary,
        tooManySessionIdsArbitrary,
        validBundlePriceArbitrary,
        (name, sessionIds, bundlePrice) => {
          const totalIndividualPrice = bundlePrice + 1000;
          const result = validateBundleInput({
            name,
            sessionIds,
            bundlePrice,
            totalIndividualPrice,
          });
          expect(result.valid).toBe(false);
          expect(result.errors).toContain('Maximum 20 sessions');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('rejects bundles with price less than 1 pence', () => {
    fc.assert(
      fc.property(
        validNameArbitrary,
        validSessionIdsArbitrary,
        fc.integer({ min: -1000, max: 0 }),
        (name, sessionIds, bundlePrice) => {
          const totalIndividualPrice = 10000;
          const result = validateBundleInput({
            name,
            sessionIds,
            bundlePrice,
            totalIndividualPrice,
          });
          expect(result.valid).toBe(false);
          expect(result.errors).toContain('Price must be at least 1 pence');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('rejects bundles where price exceeds total individual price', () => {
    fc.assert(
      fc.property(
        validNameArbitrary,
        validSessionIdsArbitrary,
        fc.integer({ min: 1000, max: 50000 }),
        (name, sessionIds, totalIndividualPrice) => {
          const bundlePrice = totalIndividualPrice + fc.sample(fc.integer({ min: 1, max: 5000 }), 1)[0];
          const result = validateBundleInput({
            name,
            sessionIds,
            bundlePrice,
            totalIndividualPrice,
          });
          expect(result.valid).toBe(false);
          expect(result.errors).toContain('Bundle price cannot exceed total individual price');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('valid iff all conditions met: name 3–100, 2–20 sessions, 0 < price <= total', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 150 }),
        fc.array(sessionIdArbitrary, { minLength: 0, maxLength: 25 }),
        fc.integer({ min: -100, max: 100000 }),
        fc.integer({ min: 1, max: 100000 }),
        (name, sessionIds, bundlePrice, totalIndividualPrice) => {
          const result = validateBundleInput({
            name,
            sessionIds,
            bundlePrice,
            totalIndividualPrice,
          });

          const nameValid = name.length >= 3 && name.length <= 100;
          const sessionsValid = sessionIds.length >= 2 && sessionIds.length <= 20;
          const priceValid = bundlePrice >= 1 && bundlePrice <= totalIndividualPrice;

          const expectedValid = nameValid && sessionsValid && priceValid;
          expect(result.valid).toBe(expectedValid);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// --- Property 2 Tests ---

describe('Property 2: Session filter for bundle creation', () => {
  it('returns only sessions with matching classId and status open', () => {
    fc.assert(
      fc.property(
        fc.array(sessionRecordArbitrary, { minLength: 0, maxLength: 30 }),
        classIdArbitrary,
        (sessions, selectedClassId) => {
          const result = filterSessionsForBundle(sessions, selectedClassId);

          // Every returned session must match classId and have status 'open'
          for (const session of result) {
            expect(session.classId).toBe(selectedClassId);
            expect(session.status).toBe('open');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('does not exclude any session that matches classId and has status open', () => {
    fc.assert(
      fc.property(
        fc.array(sessionRecordArbitrary, { minLength: 0, maxLength: 30 }),
        classIdArbitrary,
        (sessions, selectedClassId) => {
          const result = filterSessionsForBundle(sessions, selectedClassId);

          // Count expected matches manually
          const expected = sessions.filter(
            s => s.classId === selectedClassId && s.status === 'open'
          );
          expect(result.length).toBe(expected.length);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('excludes sessions with non-open status even if classId matches', () => {
    fc.assert(
      fc.property(
        classIdArbitrary,
        fc.constantFrom('full', 'cancelled', 'closed'),
        (classId, nonOpenStatus) => {
          const sessions = [
            { classId, status: nonOpenStatus },
            { classId, status: 'open' },
          ];
          const result = filterSessionsForBundle(sessions, classId);

          expect(result.length).toBe(1);
          expect(result[0].status).toBe('open');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('excludes sessions with different classId even if status is open', () => {
    fc.assert(
      fc.property(
        classIdArbitrary,
        classIdArbitrary,
        (selectedClassId, otherClassId) => {
          fc.pre(selectedClassId !== otherClassId);

          const sessions = [
            { classId: otherClassId, status: 'open' },
            { classId: selectedClassId, status: 'open' },
          ];
          const result = filterSessionsForBundle(sessions, selectedClassId);

          expect(result.length).toBe(1);
          expect(result[0].classId).toBe(selectedClassId);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('returns empty array when no sessions match both criteria', () => {
    fc.assert(
      fc.property(
        fc.array(sessionRecordArbitrary, { minLength: 0, maxLength: 20 }),
        classIdArbitrary,
        (sessions, selectedClassId) => {
          // Filter out any sessions that would match
          const noMatchSessions = sessions.filter(
            s => !(s.classId === selectedClassId && s.status === 'open')
          );
          const result = filterSessionsForBundle(noMatchSessions, selectedClassId);

          expect(result).toHaveLength(0);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// --- Property 3 Tests ---

describe('Property 3: Bundle document completeness', () => {
  it('document contains all required fields from input', () => {
    fc.assert(
      fc.property(
        validNameArbitrary,
        classIdArbitrary,
        validSessionIdsArbitrary,
        validBundlePriceArbitrary,
        fc.integer({ min: 1, max: 100000 }),
        classNameArbitrary,
        classTypeArbitrary,
        venueIdArbitrary,
        venueNameArbitrary,
        (name, classId, sessionIds, bundlePrice, totalIndividualPrice, className, classType, venueId, venueName) => {
          const input = {
            name,
            classId,
            sessionIds,
            bundlePrice,
            totalIndividualPrice,
            className,
            classType,
            venueId,
            venueName,
          };
          const doc = buildBundleDocument(input);

          // All input fields present
          expect(doc.name).toBe(name);
          expect(doc.classId).toBe(classId);
          expect(doc.sessionIds).toBe(sessionIds);
          expect(doc.bundlePrice).toBe(bundlePrice);
          expect(doc.totalIndividualPrice).toBe(totalIndividualPrice);
          expect(doc.className).toBe(className);
          expect(doc.classType).toBe(classType);
          expect(doc.venueId).toBe(venueId);
          expect(doc.venueName).toBe(venueName);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('status defaults to active for all new bundle documents', () => {
    fc.assert(
      fc.property(
        validNameArbitrary,
        classIdArbitrary,
        validSessionIdsArbitrary,
        validBundlePriceArbitrary,
        fc.integer({ min: 1, max: 100000 }),
        classNameArbitrary,
        classTypeArbitrary,
        venueIdArbitrary,
        venueNameArbitrary,
        (name, classId, sessionIds, bundlePrice, totalIndividualPrice, className, classType, venueId, venueName) => {
          const doc = buildBundleDocument({
            name,
            classId,
            sessionIds,
            bundlePrice,
            totalIndividualPrice,
            className,
            classType,
            venueId,
            venueName,
          });

          expect(doc.status).toBe('active');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('document includes createdAt field', () => {
    fc.assert(
      fc.property(
        validNameArbitrary,
        classIdArbitrary,
        validSessionIdsArbitrary,
        validBundlePriceArbitrary,
        fc.integer({ min: 1, max: 100000 }),
        classNameArbitrary,
        classTypeArbitrary,
        venueIdArbitrary,
        venueNameArbitrary,
        (name, classId, sessionIds, bundlePrice, totalIndividualPrice, className, classType, venueId, venueName) => {
          const doc = buildBundleDocument({
            name,
            classId,
            sessionIds,
            bundlePrice,
            totalIndividualPrice,
            className,
            classType,
            venueId,
            venueName,
          });

          expect(doc.createdAt).toBeDefined();
          expect(doc.createdAt).toBe('SERVER_TIMESTAMP');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('document has exactly the expected set of keys', () => {
    fc.assert(
      fc.property(
        validNameArbitrary,
        classIdArbitrary,
        validSessionIdsArbitrary,
        validBundlePriceArbitrary,
        fc.integer({ min: 1, max: 100000 }),
        classNameArbitrary,
        classTypeArbitrary,
        venueIdArbitrary,
        venueNameArbitrary,
        (name, classId, sessionIds, bundlePrice, totalIndividualPrice, className, classType, venueId, venueName) => {
          const doc = buildBundleDocument({
            name,
            classId,
            sessionIds,
            bundlePrice,
            totalIndividualPrice,
            className,
            classType,
            venueId,
            venueName,
          });

          const expectedKeys = [
            'name',
            'classId',
            'sessionIds',
            'bundlePrice',
            'totalIndividualPrice',
            'className',
            'classType',
            'venueId',
            'venueName',
            'status',
            'createdAt',
          ].sort();

          expect(Object.keys(doc).sort()).toEqual(expectedKeys);
        }
      ),
      { numRuns: 100 }
    );
  });
});
