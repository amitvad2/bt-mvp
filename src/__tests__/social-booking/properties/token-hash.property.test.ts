/**
 * Feature: social-commerce-guest-booking, Property 6: Token Hash Storage
 *
 * For any generated Guest_Checkout_Token, the value stored in the
 * Social_Booking_Session document's `checkoutTokenHash` field SHALL equal
 * the hex-encoded SHA-256 hash of the raw token, and SHALL never equal the
 * raw token itself.
 *
 * Validates: Requirements 6.2, 6.7
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import crypto from 'crypto';
import { generateRawToken, hashToken } from '@/lib/social-booking/token';

describe('Property 6: Token Hash Storage', () => {
  it('hashToken produces a 64-character hex string for any generated token', () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        const token = generateRawToken();
        const hash = hashToken(token);

        // SHA-256 hex output is always 64 characters
        expect(hash).toHaveLength(64);
        // Only contains lowercase hex characters
        expect(hash).toMatch(/^[a-f0-9]{64}$/);
      }),
      { numRuns: 20 }
    );
  });

  it('hashToken equals independently computed SHA-256 hex digest for any generated token', () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        const token = generateRawToken();
        const hash = hashToken(token);

        // Independent verification using crypto directly
        const expectedHash = crypto
          .createHash('sha256')
          .update(token)
          .digest('hex');

        expect(hash).toBe(expectedHash);
      }),
      { numRuns: 20 }
    );
  });

  it('hashToken never equals the raw token itself for any generated token', () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        const token = generateRawToken();
        const hash = hashToken(token);

        // The hash must never be the same as the raw token
        expect(hash).not.toBe(token);
      }),
      { numRuns: 20 }
    );
  });

  it('two different tokens produce different hashes (collision resistance)', () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        const token1 = generateRawToken();
        const token2 = generateRawToken();

        // Tokens should be distinct (32 random bytes → astronomically unlikely collision)
        if (token1 !== token2) {
          const hash1 = hashToken(token1);
          const hash2 = hashToken(token2);
          expect(hash1).not.toBe(hash2);
        }
      }),
      { numRuns: 20 }
    );
  });
});
