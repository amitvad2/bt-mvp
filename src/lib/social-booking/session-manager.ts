// src/lib/social-booking/session-manager.ts

import { adminDb } from '@/lib/firebase-admin';
import admin from '@/lib/firebase-admin';
import type { SocialChannel, SocialBookingState, SocialBookingSession } from '@/types';

/**
 * Valid state transitions for the Social Booking Session state machine.
 *
 * Linear progression: started → selecting-session → checkout-created → payment-pending → confirmed
 * Plus: any non-confirmed state → expired (when expiresAt exceeded)
 *
 * Requirements: 4.1, 4.3, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10
 */
const VALID_TRANSITIONS: Record<SocialBookingState, SocialBookingState[]> = {
  'started': ['selecting-session', 'expired'],
  'selecting-session': ['checkout-created', 'expired'],
  'checkout-created': ['payment-pending', 'expired'],
  'payment-pending': ['confirmed', 'expired'],
  'confirmed': [],
  'expired': [],
};

/**
 * Session lifecycle manager interface.
 *
 * Manages creation, reuse, state transitions, and expiry of
 * Social_Booking_Session documents in Firestore.
 */
export interface SessionManager {
  /** Find or create a session for the given channel/user. Reuses active sessions. */
  createOrReuseSession(
    channel: SocialChannel,
    externalUserId: string,
    externalConversationId: string
  ): Promise<SocialBookingSession>;

  /** Transition a session's state, enforcing valid transitions. */
  transitionState(
    socialBookingSessionId: string,
    newState: SocialBookingState
  ): Promise<void>;

  /** Retrieve a session by ID. Returns null if not found. Marks expired sessions lazily. */
  getSession(socialBookingSessionId: string): Promise<SocialBookingSession | null>;
}

/**
 * Checks whether a session has expired based on its expiresAt timestamp.
 */
function isExpired(session: SocialBookingSession): boolean {
  if (!session.expiresAt) return false;
  const now = Date.now();
  const expiresAtMs = session.expiresAt.toMillis
    ? session.expiresAt.toMillis()
    : new Date(session.expiresAt).getTime();
  return now > expiresAtMs;
}

/**
 * Determines whether a session is "active" — neither expired nor confirmed.
 */
function isActiveSession(session: SocialBookingSession): boolean {
  if (session.state === 'confirmed' || session.state === 'expired') {
    return false;
  }
  return !isExpired(session);
}

/**
 * Creates the concrete SessionManager implementation backed by Firestore.
 */
export function createSessionManager(): SessionManager {
  const collection = adminDb.collection('social_booking_sessions');

  return {
    async createOrReuseSession(
      channel: SocialChannel,
      externalUserId: string,
      externalConversationId: string
    ): Promise<SocialBookingSession> {
      // Query for an active (non-expired, non-confirmed) session on same channel/user
      const snapshot = await collection
        .where('channel', '==', channel)
        .where('externalUserId', '==', externalUserId)
        .where('state', 'not-in', ['confirmed', 'expired'])
        .orderBy('createdAt', 'desc')
        .limit(5)
        .get();

      // Check each candidate — some may have expired since creation
      for (const doc of snapshot.docs) {
        const session = { id: doc.id, ...doc.data() } as SocialBookingSession;

        if (isActiveSession(session)) {
          // Reuse this existing active session
          return session;
        }

        // Session has expired — lazily mark it as expired
        await doc.ref.update({
          state: 'expired',
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      // No active session found — create a new one
      const now = admin.firestore.Timestamp.now();
      const expiresAt = admin.firestore.Timestamp.fromMillis(
        now.toMillis() + 30 * 60 * 1000 // 30 minutes from creation
      );

      const docRef = collection.doc();
      const newSession: Omit<SocialBookingSession, 'id'> = {
        channel,
        externalConversationId,
        externalUserId,
        state: 'started',
        sessionId: null,
        checkoutTokenHash: null,
        tokenConsumed: false,
        tokenExpiresAt: null,
        source: `${channel}_express` as SocialBookingSession['source'],
        campaign: null,
        socialBookingSessionId: docRef.id,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      await docRef.set(newSession);

      // Return the full session object with the generated ID
      return {
        id: docRef.id,
        ...newSession,
        createdAt: now,
        updatedAt: now,
      } as SocialBookingSession;
    },

    async transitionState(
      socialBookingSessionId: string,
      newState: SocialBookingState
    ): Promise<void> {
      const docRef = collection.doc(socialBookingSessionId);
      const doc = await docRef.get();

      if (!doc.exists) {
        throw new Error(`Social booking session not found: ${socialBookingSessionId}`);
      }

      const session = { id: doc.id, ...doc.data() } as SocialBookingSession;

      // Check for expiry first — if expired, mark it and reject the transition
      if (session.state !== 'confirmed' && session.state !== 'expired' && isExpired(session)) {
        await docRef.update({
          state: 'expired',
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        throw new Error(
          `Cannot transition to '${newState}': session '${socialBookingSessionId}' has expired`
        );
      }

      // Validate the state transition
      const allowedTransitions = VALID_TRANSITIONS[session.state];
      if (!allowedTransitions || !allowedTransitions.includes(newState)) {
        throw new Error(
          `Invalid state transition: '${session.state}' → '${newState}' for session '${socialBookingSessionId}'`
        );
      }

      // Apply the transition
      await docRef.update({
        state: newState,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    },

    async getSession(socialBookingSessionId: string): Promise<SocialBookingSession | null> {
      const docRef = collection.doc(socialBookingSessionId);
      const doc = await docRef.get();

      if (!doc.exists) {
        return null;
      }

      const session = { id: doc.id, ...doc.data() } as SocialBookingSession;

      // Lazy expiry: if session is past expiresAt and not yet confirmed/expired, mark it
      if (session.state !== 'confirmed' && session.state !== 'expired' && isExpired(session)) {
        await docRef.update({
          state: 'expired',
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return { ...session, state: 'expired' };
      }

      return session;
    },
  };
}
