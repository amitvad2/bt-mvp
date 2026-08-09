// ============================================================
// Channel Adapter Interface
// Defines the contract that all social channel adapters must implement.
// Each adapter translates between the channel-neutral Social_Booking_Service
// and a specific platform's messaging API (WhatsApp, Instagram, Messenger).
// ============================================================

import type {
  SocialChannel,
  SessionSummary,
  ProgrammeSummary,
  BookingConfirmation,
  ParsedSocialEvent,
} from '@/types';

/**
 * ChannelAdapter defines the unified interface consumed by the
 * Social_Booking_Service core. Each social platform implements this
 * interface so the core contains zero platform-specific code.
 *
 * Adding a new channel requires only implementing this interface —
 * the core service needs no modifications.
 */
export interface ChannelAdapter {
  /** The social channel this adapter handles */
  readonly channel: SocialChannel;

  /** Send available sessions to the user */
  sendSessionList(
    recipientId: string,
    sessions: SessionSummary[]
  ): Promise<void>;

  /** Send checkout deep link to the user */
  sendCheckoutLink(
    recipientId: string,
    deepLinkUrl: string,
    sessionSummary: SessionSummary
  ): Promise<void>;

  /** Send booking confirmation */
  sendBookingConfirmation(
    recipientId: string,
    confirmation: BookingConfirmation
  ): Promise<void>;

  /** Send no-sessions-available message */
  sendNoSessionsMessage(recipientId: string): Promise<void>;

  /** Send session-unavailable message with updated session list */
  sendSessionUnavailableMessage(
    recipientId: string,
    sessions: SessionSummary[]
  ): Promise<void>;

  /** Send unrecognised command help message */
  sendHelpMessage(recipientId: string): Promise<void>;

  /** Send error/retry message */
  sendErrorMessage(recipientId: string): Promise<void>;

  /** Send available programmes (term classes) to the user */
  sendProgrammeList(
    recipientId: string,
    programmes: ProgrammeSummary[]
  ): Promise<void>;

  /** Send checkout deep link for a programme booking */
  sendProgrammeCheckoutLink(
    recipientId: string,
    deepLinkUrl: string,
    programmeSummary: ProgrammeSummary
  ): Promise<void>;

  /** Parse inbound webhook payload into normalised event */
  parseEvent(payload: unknown): ParsedSocialEvent | null;
}
