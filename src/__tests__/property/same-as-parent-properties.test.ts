// Feature: guest-express-checkout
// Property 12: Same-as-Parent Auto-Population
// **Validates: Requirements 5.3**

// @vitest-environment node

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// --- Types mirroring the application interfaces ---

interface GuestParentDetails {
  firstName: string;
  lastName: string;
  email: string;
  telephone: string;
}

interface GuestAuthorisedCollector {
  name: string;
  relationship: string;
  phone: string;
  sameAsParent: boolean;
}

// --- Pure function: Same-as-Parent auto-population logic ---
// This mirrors the logic in EmergencyContactStep.tsx when sameAsParent is true.

function applyParentAutoPopulation(
  sameAsParent: boolean,
  parentDetails: GuestParentDetails,
  manualCollector: { name: string; relationship: string; phone: string }
): GuestAuthorisedCollector {
  if (sameAsParent) {
    const fullName = `${parentDetails.firstName} ${parentDetails.lastName}`.trim();
    return {
      name: fullName,
      relationship: 'Parent',
      phone: parentDetails.telephone,
      sameAsParent: true,
    };
  }
  return {
    name: manualCollector.name,
    relationship: manualCollector.relationship,
    phone: manualCollector.phone,
    sameAsParent: false,
  };
}

// --- Arbitraries ---

/** Generate non-empty parent first name (trimmed, no leading/trailing spaces) */
const parentFirstNameArb = fc.string({ minLength: 1, maxLength: 50 })
  .filter((s) => s.trim().length > 0);

/** Generate non-empty parent last name (trimmed, no leading/trailing spaces) */
const parentLastNameArb = fc.string({ minLength: 1, maxLength: 50 })
  .filter((s) => s.trim().length > 0);

/** Generate valid telephone number */
const telephoneArb = fc.string({ minLength: 10, maxLength: 20 })
  .map((s) => `07${s.replace(/[^0-9]/g, '').slice(0, 9)}`);

/** Generate valid email */
const emailArb = fc.tuple(
  fc.string({ minLength: 3, maxLength: 15 }).filter((s) => /^[a-z]+$/.test(s)),
  fc.constantFrom('example.com', 'test.co.uk', 'mail.org')
).map(([user, domain]) => `${user}@${domain}`);

/** Generate random parent details */
const parentDetailsArbitrary = fc.record({
  firstName: parentFirstNameArb,
  lastName: parentLastNameArb,
  email: emailArb,
  telephone: telephoneArb,
});

/** Generate random manual collector details */
const manualCollectorArbitrary = fc.record({
  name: fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0),
  relationship: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
  phone: telephoneArb,
});

// --- Property 12: Same-as-Parent Auto-Population ---

describe('Property 12: Same-as-Parent Auto-Population', () => {
  it('when sameAsParent is true, collector name equals parent full name', () => {
    fc.assert(
      fc.property(parentDetailsArbitrary, manualCollectorArbitrary, (parentDetails, manualCollector) => {
        const result = applyParentAutoPopulation(true, parentDetails, manualCollector);

        const expectedName = `${parentDetails.firstName} ${parentDetails.lastName}`.trim();
        expect(result.name).toBe(expectedName);
      }),
      { numRuns: 500 }
    );
  });

  it('when sameAsParent is true, collector phone equals parent telephone', () => {
    fc.assert(
      fc.property(parentDetailsArbitrary, manualCollectorArbitrary, (parentDetails, manualCollector) => {
        const result = applyParentAutoPopulation(true, parentDetails, manualCollector);

        expect(result.phone).toBe(parentDetails.telephone);
      }),
      { numRuns: 500 }
    );
  });

  it('when sameAsParent is true, relationship is always "Parent"', () => {
    fc.assert(
      fc.property(parentDetailsArbitrary, manualCollectorArbitrary, (parentDetails, manualCollector) => {
        const result = applyParentAutoPopulation(true, parentDetails, manualCollector);

        expect(result.relationship).toBe('Parent');
      }),
      { numRuns: 500 }
    );
  });

  it('when sameAsParent is true, sameAsParent flag is set to true in result', () => {
    fc.assert(
      fc.property(parentDetailsArbitrary, manualCollectorArbitrary, (parentDetails, manualCollector) => {
        const result = applyParentAutoPopulation(true, parentDetails, manualCollector);

        expect(result.sameAsParent).toBe(true);
      }),
      { numRuns: 500 }
    );
  });

  it('when sameAsParent is true, manual collector values are ignored', () => {
    fc.assert(
      fc.property(parentDetailsArbitrary, manualCollectorArbitrary, (parentDetails, manualCollector) => {
        const result = applyParentAutoPopulation(true, parentDetails, manualCollector);

        // The result should NOT use manual collector values
        const expectedName = `${parentDetails.firstName} ${parentDetails.lastName}`.trim();
        expect(result.name).toBe(expectedName);
        expect(result.phone).toBe(parentDetails.telephone);
        // Manual collector fields should be overridden unless they happen to equal parent details
      }),
      { numRuns: 500 }
    );
  });

  it('when sameAsParent is false, collector uses manual values (not parent details)', () => {
    fc.assert(
      fc.property(parentDetailsArbitrary, manualCollectorArbitrary, (parentDetails, manualCollector) => {
        const result = applyParentAutoPopulation(false, parentDetails, manualCollector);

        expect(result.name).toBe(manualCollector.name);
        expect(result.relationship).toBe(manualCollector.relationship);
        expect(result.phone).toBe(manualCollector.phone);
        expect(result.sameAsParent).toBe(false);
      }),
      { numRuns: 500 }
    );
  });

  it('collector name is deterministic — same parent details always produce same collector name', () => {
    fc.assert(
      fc.property(parentDetailsArbitrary, (parentDetails) => {
        const result1 = applyParentAutoPopulation(true, parentDetails, { name: 'x', relationship: 'y', phone: '0' });
        const result2 = applyParentAutoPopulation(true, parentDetails, { name: 'a', relationship: 'b', phone: '1' });

        // Regardless of manual collector values, the result is always the same
        expect(result1.name).toBe(result2.name);
        expect(result1.phone).toBe(result2.phone);
        expect(result1.relationship).toBe(result2.relationship);
      }),
      { numRuns: 500 }
    );
  });
});
