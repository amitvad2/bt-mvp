/**
 * Feature: social-commerce-guest-booking, Property 5: Token Format and Randomness
 *
 * For any generated Guest_Checkout_Token, the token SHALL be exactly 43 characters
 * of URL-safe base64 (encoding 32 random bytes), containing only characters from
 * the set [A-Za-z0-9_-], and SHALL contain no personally identifiable information.
 *
 * Validates: Requirements 6.1, 6.5
 */

import { describe, it } from 'vitest';
import * as fc from 'fast-check';
import { generateRawToken } from '@/lib/social-booking/token';

describe('Property 5: Token Format and Randomness', () => {
  it('every generated token is exactly 43 characters long', () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        const token = generateRawToken();
        return token.length === 43;
      }),
      { numRuns: 20 }
    );
  });

  it('every generated token contains only URL-safe base64 characters [A-Za-z0-9_-]', () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        const token = generateRawToken();
        return /^[A-Za-z0-9_-]+$/.test(token);
      }),
      { numRuns: 20 }
    );
  });

  it('every generated token does not contain standard base64 characters (+, /, =)', () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        const token = generateRawToken();
        return !token.includes('+') && !token.includes('/') && !token.includes('=');
      }),
      { numRuns: 20 }
    );
  });

  it('any pair of generated tokens are different (uniqueness)', () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        const tokenA = generateRawToken();
        const tokenB = generateRawToken();
        return tokenA !== tokenB;
      }),
      { numRuns: 20 }
    );
  });
});
