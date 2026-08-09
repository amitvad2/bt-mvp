// src/lib/social-booking/token.ts

import crypto from 'crypto';
import { adminDb } from '@/lib/firebase-admin';
import admin from '@/lib/firebase-admin';
import type { TokenValidationResult } from '@/types';

/**
 * Token service for generating and validating Guest_Checkout_Tokens.
 *
 * Tokens are cryptographically secure, short-lived (15 minutes),
 * single-use, and contain no PII. Only the SHA-256 hash is stored
 * in Firestore — the raw token is returned to the caller and never persisted.
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.7, 6.8
 */
export interface TokenService {
  /** Generate a secure token for a per-session booking, store hash in Firestore */
  generate(socialBookingSessionId: string, sessionId: string): Promise<string>;

  /** Generate a secure token for a programme (term) booking, store hash in Firestore */
  generateForProgramme(socialBookingSessionId: string, classId: string): Promise<string>;

  /** Validate token: hash match, not expired, not consumed. Consumes atomically. */
  validateAndConsume(rawToken: string): Promise<TokenValidationResult>;
}

/**
 * Generates a URL-safe base64 string from 32 random bytes.
 * Result is exactly 43 characters using charset [A-Za-z0-9_-].
 */
export function generateRawToken(): string {
  const bytes = crypto.randomBytes(32);
  // Standard base64 → URL-safe: replace + with -, / with _, strip = padding
  const base64 = bytes.toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * Computes the hex-encoded SHA-256 hash of a raw token string.
 */
export function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

/**
 * Creates the concrete TokenService implementation backed by Firestore.
 */
export function createTokenService(): TokenService {
  return {
    async generate(socialBookingSessionId: string, sessionId: string): Promise<string> {
      // 1. Generate 32 cryptographically random bytes → URL-safe base64 (43 chars)
      const rawToken = generateRawToken();

      // 2. Compute SHA-256 hash (hex-encoded) — this is what we store
      const tokenHash = hashToken(rawToken);

      // 3. Set expiry to now + 15 minutes (server time)
      const now = admin.firestore.Timestamp.now();
      const expiresAt = admin.firestore.Timestamp.fromMillis(
        now.toMillis() + 15 * 60 * 1000
      );

      // 4. Store hash, sessionId, and expiresAt on the Social_Booking_Session document
      const sessionRef = adminDb.collection('social_booking_sessions').doc(socialBookingSessionId);
      await sessionRef.update({
        checkoutTokenHash: tokenHash,
        tokenConsumed: false,
        tokenExpiresAt: expiresAt,
        sessionId,
        state: 'checkout-created',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // 5. Return the raw token (never stored in Firestore)
      return rawToken;
    },

    async generateForProgramme(socialBookingSessionId: string, classId: string): Promise<string> {
      // 1. Generate 32 cryptographically random bytes → URL-safe base64 (43 chars)
      const rawToken = generateRawToken();

      // 2. Compute SHA-256 hash (hex-encoded) — this is what we store
      const tokenHash = hashToken(rawToken);

      // 3. Set expiry to now + 15 minutes (server time)
      const now = admin.firestore.Timestamp.now();
      const expiresAt = admin.firestore.Timestamp.fromMillis(
        now.toMillis() + 15 * 60 * 1000
      );

      // 4. Store hash, classId, bookingType, and expiresAt on the Social_Booking_Session document
      const sessionRef = adminDb.collection('social_booking_sessions').doc(socialBookingSessionId);
      await sessionRef.update({
        checkoutTokenHash: tokenHash,
        tokenConsumed: false,
        tokenExpiresAt: expiresAt,
        classId,
        bookingType: 'term',
        sessionId: null, // No individual session for programme bookings
        state: 'checkout-created',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // 5. Return the raw token (never stored in Firestore)
      return rawToken;
    },

    async validateAndConsume(rawToken: string): Promise<TokenValidationResult> {
      // 1. Compute SHA-256(presentedToken) → hex string
      const tokenHash = hashToken(rawToken);

      // 2. Query social_booking_sessions for matching checkoutTokenHash
      const sessionsRef = adminDb.collection('social_booking_sessions');
      const snapshot = await sessionsRef
        .where('checkoutTokenHash', '==', tokenHash)
        .limit(1)
        .get();

      // If no matching document found → invalid token
      if (snapshot.empty) {
        return { valid: false, reason: 'invalid' };
      }

      const sessionDoc = snapshot.docs[0];
      const sessionDocRef = sessionsRef.doc(sessionDoc.id);

      // 3. Use Firestore transaction to atomically validate and consume
      return await adminDb.runTransaction(async (transaction) => {
        const freshDoc = await transaction.get(sessionDocRef);

        if (!freshDoc.exists) {
          return { valid: false, reason: 'invalid' } as TokenValidationResult;
        }

        const data = freshDoc.data()!;

        // Check if token has already been consumed
        if (data.tokenConsumed === true) {
          return { valid: false, reason: 'consumed' } as TokenValidationResult;
        }

        // Check if token has expired (tokenExpiresAt > now)
        const now = admin.firestore.Timestamp.now();
        const expiresAt = data.tokenExpiresAt;

        if (!expiresAt || expiresAt.toMillis() <= now.toMillis()) {
          return { valid: false, reason: 'expired' } as TokenValidationResult;
        }

        // 4. Token is valid — atomically set tokenConsumed = true
        transaction.update(sessionDocRef, {
          tokenConsumed: true,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // Return session context on success (include classId and bookingType for programme bookings)
        return {
          valid: true,
          sessionId: data.sessionId ?? '',
          channel: data.channel,
          campaign: data.campaign || null,
          socialBookingSessionId: freshDoc.id,
          ...(data.classId && { classId: data.classId }),
          ...(data.bookingType && { bookingType: data.bookingType }),
        } as TokenValidationResult;
      });
    },
  };
}
