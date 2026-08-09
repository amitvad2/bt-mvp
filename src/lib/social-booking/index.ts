// src/lib/social-booking/index.ts
//
// Channel-neutral Social Booking Service core orchestration.
//
// This module contains ZERO platform-specific imports — no WhatsApp,
// Instagram, or Messenger references. Channel adapters are registered
// by channel name at construction time.
//
// Requirements: 2.1, 2.2, 2.4, 2.5, 2.6, 2.7, 2.8

import { adminDb } from '@/lib/firebase-admin';
import type {
  SocialChannel,
  ParsedSocialEvent,
  TokenValidationResult,
  SessionSummary,
  ProgrammeSummary,
  BookingConfirmation,
} from '@/types';
import type { SocialBookingService } from '@/lib/social-booking/service';
import type { ChannelAdapter } from '@/lib/social-booking/adapters/types';
import { createTokenService } from '@/lib/social-booking/token';
import { createSessionManager } from '@/lib/social-booking/session-manager';
import { getAvailableSessions } from '@/lib/social-booking/session-discovery';
import { getAvailableProgrammes, isProgrammeBookable } from '@/lib/social-booking/session-discovery';
import { isSessionBookable } from '@/lib/social-booking/session-discovery';
import { checkTokenRateLimit } from '@/lib/social-booking/rate-limit';

/**
 * Configuration for creating the SocialBookingService.
 * Adapters are passed in by channel name — the core never imports platform code.
 */
export interface SocialBookingServiceConfig {
  adapters: Map<SocialChannel, ChannelAdapter>;
}

/**
 * Creates the concrete SocialBookingService implementation.
 *
 * The service orchestrates:
 * - Inbound message routing (trigger → session list, selection → token, unknown → help)
 * - Token generation with rate limiting
 * - Token validation delegation
 * - Booking confirmation with state transition
 * - Social channel confirmation notifications
 * - Session discovery delegation
 *
 * Adding a new channel requires only registering a new adapter — no core changes.
 */
export function createSocialBookingService(
  config: SocialBookingServiceConfig
): SocialBookingService {
  const { adapters } = config;
  const tokenService = createTokenService();
  const sessionManager = createSessionManager();

  /**
   * Resolve the adapter for a given channel.
   * Throws if no adapter is registered for the channel.
   */
  function getAdapter(channel: SocialChannel): ChannelAdapter {
    const adapter = adapters.get(channel);
    if (!adapter) {
      throw new Error(`No adapter registered for channel: ${channel}`);
    }
    return adapter;
  }

  /**
   * Build a deep link URL for the given token.
   */
  function buildDeepLinkUrl(rawToken: string): string {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://bloomingtastebuds.co.uk';
    return `${baseUrl}/guest/book/${rawToken}`;
  }

  /**
   * Build a deep link URL for a programme term booking token.
   */
  function buildProgrammeDeepLinkUrl(rawToken: string): string {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://bloomingtastebuds.co.uk';
    return `${baseUrl}/guest/book-term/${rawToken}`;
  }

  return {
    async handleInboundMessage(event: ParsedSocialEvent): Promise<void> {
      const adapter = getAdapter(event.channel);

      switch (event.type) {
        case 'trigger': {
          // Create or reuse an active session for this user/channel
          const session = await sessionManager.createOrReuseSession(
            event.channel,
            event.senderId,
            event.conversationId
          );

          // Get available sessions AND programmes
          const availableSessions = await getAvailableSessions();
          const availableProgrammes = await getAvailableProgrammes();

          if (availableSessions.length === 0 && availableProgrammes.length === 0) {
            await adapter.sendNoSessionsMessage(event.senderId);
            return;
          }

          // Send session list via the channel adapter (if any per-session offerings exist)
          if (availableSessions.length > 0) {
            await adapter.sendSessionList(event.senderId, availableSessions);
          }

          // Send programme list via the channel adapter (if any term offerings exist)
          if (availableProgrammes.length > 0) {
            await adapter.sendProgrammeList(event.senderId, availableProgrammes);
          }

          return;
        }

        case 'session_selection': {
          // Create or reuse an active session
          const session = await sessionManager.createOrReuseSession(
            event.channel,
            event.senderId,
            event.conversationId
          );

          // Check session availability before transitioning
          const sessionDoc = await adminDb
            .collection('sessions')
            .doc(event.selectedSessionId)
            .get();

          if (!sessionDoc.exists) {
            // Session doesn't exist — inform user and re-present list
            const availableSessions = await getAvailableSessions();
            await adapter.sendSessionUnavailableMessage(event.senderId, availableSessions);
            return;
          }

          const sessionData = sessionDoc.data()!;

          if (!isSessionBookable({ status: sessionData.status, spotsAvailable: sessionData.spotsAvailable })) {
            // Session is not bookable — inform user and re-present available sessions
            const availableSessions = await getAvailableSessions();
            await adapter.sendSessionUnavailableMessage(event.senderId, availableSessions);
            return;
          }

          // Transition to 'selecting-session' and record the selected sessionId
          await sessionManager.transitionState(session.id, 'selecting-session');

          // Update the session document with the selected sessionId
          await adminDb.collection('social_booking_sessions').doc(session.id).update({
            sessionId: event.selectedSessionId,
          });

          // Check rate limit before generating token
          const rateLimitResult = await checkTokenRateLimit(event.senderId);
          if (!rateLimitResult.allowed) {
            await adapter.sendErrorMessage(event.senderId);
            return;
          }

          // Generate checkout token (this also transitions state to 'checkout-created')
          const rawToken = await tokenService.generate(session.id, event.selectedSessionId);

          // Build deep link URL
          const deepLinkUrl = buildDeepLinkUrl(rawToken);

          // Build session summary for the adapter message
          const sessionSummary: SessionSummary = {
            sessionId: event.selectedSessionId,
            className: sessionData.className,
            date: sessionData.date,
            startTime: sessionData.startTime,
            venueName: sessionData.venueName,
            ageRange: `${sessionData.ageMin}\u2013${sessionData.ageMax}`,
            spotsAvailable: sessionData.spotsAvailable,
            price: `£${(sessionData.price / 100).toFixed(2)}`,
          };

          // Send checkout link via adapter
          await adapter.sendCheckoutLink(event.senderId, deepLinkUrl, sessionSummary);
          return;
        }

        case 'programme_selection': {
          // Create or reuse an active session
          const session = await sessionManager.createOrReuseSession(
            event.channel,
            event.senderId,
            event.conversationId
          );

          // Check programme (term class) availability before transitioning
          const classDoc = await adminDb
            .collection('classes')
            .doc(event.selectedClassId)
            .get();

          if (!classDoc.exists) {
            // Class doesn't exist — inform user and re-present list
            const availableSessions = await getAvailableSessions();
            await adapter.sendSessionUnavailableMessage(event.senderId, availableSessions);
            return;
          }

          const classData = classDoc.data()!;

          if (!isProgrammeBookable({
            commitment: classData.commitment,
            spotsAvailable: classData.spotsAvailable,
            termEndDate: classData.termEndDate,
          })) {
            // Programme is not bookable — inform user and re-present available options
            const availableSessions = await getAvailableSessions();
            await adapter.sendSessionUnavailableMessage(event.senderId, availableSessions);
            return;
          }

          // Transition to 'selecting-session' and record the selected classId
          await sessionManager.transitionState(session.id, 'selecting-session');

          // Update the social booking session with the selected classId and bookingType
          await adminDb.collection('social_booking_sessions').doc(session.id).update({
            classId: event.selectedClassId,
            bookingType: 'term',
            sessionId: null, // No individual sessionId for programme bookings
          });

          // Check rate limit before generating token
          const rateLimitResult = await checkTokenRateLimit(event.senderId);
          if (!rateLimitResult.allowed) {
            await adapter.sendErrorMessage(event.senderId);
            return;
          }

          // Generate checkout token for programme booking
          // Pass classId as the sessionId param — token service stores it on the session doc
          const rawToken = await tokenService.generateForProgramme(session.id, event.selectedClassId);

          // Build deep link URL for programme booking
          const deepLinkUrl = buildProgrammeDeepLinkUrl(rawToken);

          // Build programme summary for the adapter message
          const programmeSummary: ProgrammeSummary = {
            classId: event.selectedClassId,
            className: classData.name,
            termStartDate: classData.termStartDate,
            termEndDate: classData.termEndDate,
            startTime: classData.startTime,
            venueName: classData.venueName ?? '',
            ageRange: `${classData.ageMin}\u2013${classData.ageMax}`,
            spotsAvailable: classData.spotsAvailable,
            price: `£${(classData.termPrice / 100).toFixed(2)} for the programme`,
            recurrenceDays: classData.recurrenceDays ?? undefined,
          };

          // Send programme checkout link via adapter
          await adapter.sendProgrammeCheckoutLink(event.senderId, deepLinkUrl, programmeSummary);
          return;
        }

        case 'unknown': {
          // Unrecognised command — send help message
          await adapter.sendHelpMessage(event.senderId);
          return;
        }
      }
    },

    async generateCheckoutToken(
      socialBookingSessionId: string,
      sessionId: string
    ): Promise<string> {
      // Check rate limit using the session's externalUserId
      const sessionDoc = await adminDb
        .collection('social_booking_sessions')
        .doc(socialBookingSessionId)
        .get();

      if (sessionDoc.exists) {
        const sessionData = sessionDoc.data()!;
        const rateLimitResult = await checkTokenRateLimit(sessionData.externalUserId);
        if (!rateLimitResult.allowed) {
          throw new Error('Rate limit exceeded for token generation');
        }
      }

      // Delegate to token service (also updates session state to 'checkout-created')
      return tokenService.generate(socialBookingSessionId, sessionId);
    },

    async validateAndConsumeToken(rawToken: string): Promise<TokenValidationResult> {
      // Delegate entirely to the token service
      return tokenService.validateAndConsume(rawToken);
    },

    async confirmBooking(
      socialBookingSessionId: string,
      paymentIntentId: string
    ): Promise<void> {
      // Update session state to 'confirmed'
      await sessionManager.transitionState(socialBookingSessionId, 'confirmed');
    },

    async sendSocialConfirmation(
      socialBookingSessionId: string,
      bookingRef: string
    ): Promise<void> {
      // Retrieve the social booking session to determine channel and session details
      const session = await sessionManager.getSession(socialBookingSessionId);

      if (!session) {
        // Session not found — skip social confirmation silently
        console.warn(
          `[SocialBookingService] Cannot send confirmation: session not found (${socialBookingSessionId})`
        );
        return;
      }

      // Resolve the adapter for this session's channel
      const adapter = getAdapter(session.channel);

      // Look up the booking session details to build confirmation content
      let confirmation: BookingConfirmation;

      if (session.classId && session.bookingType === 'term') {
        // Programme booking — look up class document
        const classDoc = await adminDb
          .collection('classes')
          .doc(session.classId)
          .get();

        if (classDoc.exists) {
          const data = classDoc.data()!;
          confirmation = {
            className: data.name,
            date: `${data.termStartDate} – ${data.termEndDate}`,
            startTime: data.startTime,
            venueName: data.venueName ?? '',
            bookingRef,
          };
        } else {
          confirmation = {
            className: 'Programme Class',
            date: '',
            startTime: '',
            venueName: '',
            bookingRef,
          };
        }
      } else if (session.sessionId) {
        const sessionDoc = await adminDb
          .collection('sessions')
          .doc(session.sessionId)
          .get();

        if (sessionDoc.exists) {
          const data = sessionDoc.data()!;
          confirmation = {
            className: data.className,
            date: data.date,
            startTime: data.startTime,
            venueName: data.venueName,
            bookingRef,
          };
        } else {
          // Session doc not found — use minimal confirmation
          confirmation = {
            className: 'Cooking Class',
            date: '',
            startTime: '',
            venueName: '',
            bookingRef,
          };
        }
      } else {
        // No sessionId linked — use minimal confirmation
        confirmation = {
          className: 'Cooking Class',
          date: '',
          startTime: '',
          venueName: '',
          bookingRef,
        };
      }

      // Send confirmation via the channel adapter (best-effort)
      try {
        await adapter.sendBookingConfirmation(session.externalUserId, confirmation);
      } catch (error) {
        // Best-effort — log but don't throw
        console.error(
          `[SocialBookingService] Failed to send social confirmation for session ${socialBookingSessionId}:`,
          error
        );
      }
    },

    async getAvailableSessions(): Promise<SessionSummary[]> {
      // Delegate to session discovery query
      return getAvailableSessions();
    },

    async getAvailableProgrammes(): Promise<ProgrammeSummary[]> {
      // Delegate to programme discovery query
      return getAvailableProgrammes();
    },
  };
}
