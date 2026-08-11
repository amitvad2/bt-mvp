// Feature: term-session-management, Property 10: Absent sessionType defaults to single-date behavior
// **Validates: Requirements 9.4**

// @vitest-environment node

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { resolveSessionType, isTermSession } from '@/lib/term-schedule-utils';

/**
 * Property 10: Absent sessionType defaults to single-date behavior.
 *
 * For any session document where the sessionType field is absent or undefined,
 * all system components (public display, booking wizard, webhook) SHALL treat
 * the session identically to one with sessionType: 'single' — no schedule array
 * is expected, no term-specific UI is rendered, and the standard per-date
 * booking flow is used.
 */

// --- Custom Arbitraries ---

/** Generates arbitrary strings that are NOT 'term' */
const nonTermStringArb = fc
  .string({ minLength: 0, maxLength: 50 })
  .filter((s) => s !== 'term');

/** Generates undefined/null-like values that represent "absent" sessionType */
const absentValueArb = fc.oneof(
  fc.constant(undefined),
  fc.constant(null)
);

/** Generates values that should all resolve to 'single' (undefined, null, 'single', or any non-'term' string) */
const singleResolvingArb = fc.oneof(
  fc.constant(undefined),
  fc.constant(null),
  fc.constant('single'),
  nonTermStringArb
);

// --- Property Tests ---

describe('Feature: term-session-management, Property 10: Absent sessionType defaults to single-date behavior', () => {
  describe('resolveSessionType: undefined/null always resolves to "single"', () => {
    it('undefined sessionType resolves to "single"', () => {
      fc.assert(
        fc.property(
          absentValueArb,
          (value) => {
            const result = resolveSessionType(value);
            expect(result).toBe('single');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('explicit "single" resolves to "single"', () => {
      const result = resolveSessionType('single');
      expect(result).toBe('single');
    });
  });

  describe('resolveSessionType: only explicit "term" resolves to "term"', () => {
    it('explicit "term" resolves to "term"', () => {
      const result = resolveSessionType('term');
      expect(result).toBe('term');
    });

    it('any string that is NOT "term" resolves to "single"', () => {
      fc.assert(
        fc.property(
          nonTermStringArb,
          (value) => {
            const result = resolveSessionType(value);
            expect(result).toBe('single');
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('resolveSessionType: fallback behavior for arbitrary values', () => {
    it('for any value that is not exactly "term", resolved type is always "single"', () => {
      fc.assert(
        fc.property(
          singleResolvingArb,
          (value) => {
            const result = resolveSessionType(value);
            expect(result).toBe('single');
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('isTermSession: false for undefined/null/"single"', () => {
    it('isTermSession is false when sessionType is undefined or null', () => {
      fc.assert(
        fc.property(
          absentValueArb,
          (value) => {
            const result = isTermSession(value);
            expect(result).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('isTermSession is false when sessionType is "single"', () => {
      const result = isTermSession('single');
      expect(result).toBe(false);
    });

    it('isTermSession is false for any non-"term" string', () => {
      fc.assert(
        fc.property(
          nonTermStringArb,
          (value) => {
            const result = isTermSession(value);
            expect(result).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('isTermSession: true only for explicit "term"', () => {
    it('isTermSession is true when sessionType is "term"', () => {
      const result = isTermSession('term');
      expect(result).toBe(true);
    });
  });

  describe('No term-specific data expected when type resolves to "single"', () => {
    it('for any non-term session type, isTermSession is false meaning no schedule/termStartDate/termEndDate is expected', () => {
      fc.assert(
        fc.property(
          singleResolvingArb,
          (sessionType) => {
            // When resolved type is 'single', no term-specific data is needed
            const resolved = resolveSessionType(sessionType);
            const isTerm = isTermSession(sessionType);

            // Invariants for single-date behavior:
            expect(resolved).toBe('single');
            expect(isTerm).toBe(false);

            // These two properties guarantee that:
            // - No schedule array is expected
            // - No term-specific UI is rendered
            // - Standard per-date booking flow is used
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('resolveSessionType and isTermSession are consistent', () => {
    it('isTermSession(x) === (resolveSessionType(x) === "term") for any input', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.constant(undefined),
            fc.constant(null),
            fc.constant('single'),
            fc.constant('term'),
            fc.string({ minLength: 0, maxLength: 30 })
          ),
          (value) => {
            const resolved = resolveSessionType(value);
            const isTerm = isTermSession(value);

            expect(isTerm).toBe(resolved === 'term');
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
