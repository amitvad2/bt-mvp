// src/lib/social-booking/service.ts

import type { ParsedSocialEvent, TokenValidationResult, SessionSummary, ProgrammeSummary } from '@/types';

/**
 * Channel-neutral Social Booking Service interface.
 *
 * Contains no platform-specific imports or logic. Orchestrates the
 * conversation-to-checkout flow: session discovery, token generation,
 * token validation, booking confirmation, and social notifications.
 *
 * Requirements: 2.1, 2.4, 2.5, 2.6
 */
export interface SocialBookingService {
  /** Handle an inbound social message (trigger, selection, programme_selection, or unknown) */
  handleInboundMessage(event: ParsedSocialEvent): Promise<void>;

  /** Generate a secure checkout token for a session selection */
  generateCheckoutToken(
    socialBookingSessionId: string,
    sessionId: string
  ): Promise<string>;

  /** Validate and consume a checkout token, returning session context */
  validateAndConsumeToken(rawToken: string): Promise<TokenValidationResult>;

  /** Mark session as confirmed (called by Stripe webhook) */
  confirmBooking(socialBookingSessionId: string, paymentIntentId: string): Promise<void>;

  /** Send social channel confirmation (async, best-effort) */
  sendSocialConfirmation(socialBookingSessionId: string, bookingRef: string): Promise<void>;

  /** Query available sessions (open, future, spots > 0, max 5) */
  getAvailableSessions(): Promise<SessionSummary[]>;

  /** Query available programmes (term classes with spots, not expired, max 5) */
  getAvailableProgrammes(): Promise<ProgrammeSummary[]>;
}
