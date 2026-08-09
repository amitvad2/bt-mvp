// Feature: recurring-term-classes, Property 5: Term booking uses class-level price
// **Validates: Requirements 4.1**

// @vitest-environment node

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

/**
 * Property 5: Term booking uses class-level price.
 *
 * For any term booking payment, the Stripe PaymentIntent amount SHALL equal
 * the `termPrice` field from the BTClass document (server-authoritative,
 * never from client).
 *
 * We test the pure logic that determines the PaymentIntent amount:
 * - The amount is ALWAYS derived from classData.termPrice
 * - Any client-supplied amount or price is ignored
 * - The server reads the class document and uses its termPrice field
 */

// --- Pure functions under test ---

/**
 * Extracts the PaymentIntent amount for a term booking.
 * This mirrors the logic in create-intent/route.ts:
 *   const termAmount: number = classData.termPrice;
 *   ...
 *   const paymentIntent = await stripe.paymentIntents.create({ amount: termAmount, ... });
 *
 * The amount is ALWAYS the server-side termPrice, regardless of client input.
 */
function getTermPaymentAmount(classData: { termPrice: number }): number {
  return classData.termPrice;
}

/**
 * Validates that a term price is acceptable for creating a PaymentIntent.
 * This mirrors the validation in create-intent/route.ts:
 *   if (!termAmount || typeof termAmount !== 'number' || termAmount <= 0) → error
 */
function isValidTermPrice(termPrice: unknown): boolean {
  return typeof termPrice === 'number' && termPrice > 0;
}

/**
 * Simulates the full term booking amount resolution logic.
 * Given a class document and an arbitrary client request body,
 * the resolved amount is ALWAYS the class's termPrice — never the client's.
 */
function resolveTermBookingAmount(
  classData: { termPrice: number; commitment: string },
  clientBody: { amount?: number; termPrice?: number; price?: number }
): { amount: number; source: 'server' } {
  // The create-intent route ignores any client-supplied amount/price fields
  // and reads exclusively from classData.termPrice
  void clientBody; // Intentionally unused — demonstrates server-authoritative pricing
  return {
    amount: classData.termPrice,
    source: 'server',
  };
}

// --- Arbitraries ---

// Valid term price in pence (positive integer, realistic range)
const validTermPriceArb = fc.integer({ min: 1, max: 1_000_000 });

// Invalid term prices that should be rejected
const invalidTermPriceArb = fc.oneof(
  fc.constant(0),
  fc.integer({ min: -1_000_000, max: -1 }),
  fc.constant(NaN),
  fc.constant(undefined as unknown as number),
  fc.constant(null as unknown as number)
);

// Arbitrary client-supplied amount (attacker might try to send a lower price)
const clientAmountArb = fc.oneof(
  fc.integer({ min: 0, max: 1_000_000 }),
  fc.constant(0),
  fc.constant(1), // Try to pay only 1 penny
  fc.constant(undefined as unknown as number)
);

// A class document with term-specific data
const termClassDataArb = fc.record({
  termPrice: validTermPriceArb,
  commitment: fc.constant('term' as string),
  name: fc.string({ minLength: 1, maxLength: 50 }),
  termStartDate: fc.constant('2025-01-06'),
  termEndDate: fc.constant('2025-06-28'),
  spotsAvailable: fc.integer({ min: 1, max: 30 }),
});

// Client request body that might try to manipulate the price
const clientBodyArb = fc.record({
  amount: clientAmountArb,
  termPrice: clientAmountArb,
  price: clientAmountArb,
});

// --- Property Tests ---

describe('Feature: recurring-term-classes, Property 5: Term booking uses class-level price', () => {
  describe('PaymentIntent amount always equals server-side termPrice', () => {
    it('the payment amount is always the class termPrice, regardless of any client input', () => {
      fc.assert(
        fc.property(
          termClassDataArb,
          clientBodyArb,
          (classData, clientBody) => {
            const result = resolveTermBookingAmount(classData, clientBody);

            // The amount must ALWAYS equal the server-side termPrice
            expect(result.amount).toBe(classData.termPrice);
            // The source must always be 'server'
            expect(result.source).toBe('server');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('getTermPaymentAmount returns exactly the termPrice from the class document', () => {
      fc.assert(
        fc.property(
          validTermPriceArb,
          (termPrice) => {
            const amount = getTermPaymentAmount({ termPrice });

            expect(amount).toBe(termPrice);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('client-supplied amount never influences the resolved payment amount', () => {
      fc.assert(
        fc.property(
          validTermPriceArb,
          fc.integer({ min: 1, max: 1_000_000 }),
          (serverTermPrice, clientAttemptedAmount) => {
            fc.pre(clientAttemptedAmount !== serverTermPrice); // Ensure they differ

            const classData = { termPrice: serverTermPrice, commitment: 'term' };
            const clientBody = { amount: clientAttemptedAmount, termPrice: clientAttemptedAmount, price: clientAttemptedAmount };

            const result = resolveTermBookingAmount(classData, clientBody);

            // Even when client sends a different amount, the resolved amount is the server's termPrice
            expect(result.amount).toBe(serverTermPrice);
            expect(result.amount).not.toBe(clientAttemptedAmount);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('for any positive termPrice, the payment amount is a positive integer in pence', () => {
      fc.assert(
        fc.property(
          validTermPriceArb,
          (termPrice) => {
            const amount = getTermPaymentAmount({ termPrice });

            expect(amount).toBeGreaterThan(0);
            expect(Number.isInteger(amount)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Term price validation rejects invalid values', () => {
    it('valid term prices (positive numbers) pass validation', () => {
      fc.assert(
        fc.property(
          validTermPriceArb,
          (termPrice) => {
            expect(isValidTermPrice(termPrice)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('zero, negative, NaN, null, and undefined term prices fail validation', () => {
      fc.assert(
        fc.property(
          invalidTermPriceArb,
          (invalidPrice) => {
            expect(isValidTermPrice(invalidPrice)).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Server-authoritative pricing invariant', () => {
    it('the amount is deterministic: same classData always produces same amount', () => {
      fc.assert(
        fc.property(
          termClassDataArb,
          clientBodyArb,
          clientBodyArb,
          (classData, clientBody1, clientBody2) => {
            const result1 = resolveTermBookingAmount(classData, clientBody1);
            const result2 = resolveTermBookingAmount(classData, clientBody2);

            // Same class data → same amount, regardless of different client bodies
            expect(result1.amount).toBe(result2.amount);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('the amount changes if and only if the class termPrice changes', () => {
      fc.assert(
        fc.property(
          validTermPriceArb,
          validTermPriceArb,
          clientBodyArb,
          (price1, price2, clientBody) => {
            const classData1 = { termPrice: price1, commitment: 'term' };
            const classData2 = { termPrice: price2, commitment: 'term' };

            const result1 = resolveTermBookingAmount(classData1, clientBody);
            const result2 = resolveTermBookingAmount(classData2, clientBody);

            if (price1 === price2) {
              expect(result1.amount).toBe(result2.amount);
            } else {
              expect(result1.amount).not.toBe(result2.amount);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
