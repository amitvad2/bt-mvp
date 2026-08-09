// ============================================================
// Instagram Channel Adapter
// Implements the ChannelAdapter interface for Instagram Messaging API.
// Handles parsing inbound DM webhook events and sending structured
// text messages with quick reply buttons for session selection.
// All Meta API calls are wrapped in try/catch with single retry after 2s.
// ============================================================

import type {
  SocialChannel,
  SessionSummary,
  ProgrammeSummary,
  BookingConfirmation,
  ParsedSocialEvent,
} from '@/types';
import type { ChannelAdapter } from '@/lib/social-booking/adapters/types';

const INSTAGRAM_API_VERSION = 'v21.0';

/** Trigger words that initiate a booking conversation (case-insensitive) */
const TRIGGER_WORDS = ['book', 'classes', 'hi'];

/**
 * Delay utility for retry logic
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Send a message via Instagram Messaging API with retry logic.
 * Retries once after 2 seconds on failure.
 * Endpoint: https://graph.facebook.com/v21.0/me/messages?access_token=<TOKEN>
 */
async function sendInstagramMessage(
  accessToken: string,
  body: Record<string, unknown>
): Promise<void> {
  const url = `https://graph.facebook.com/${INSTAGRAM_API_VERSION}/me/messages?access_token=${accessToken}`;

  const options: RequestInit = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  };

  try {
    const response = await fetch(url, options);
    if (!response.ok) {
      throw new Error(`Instagram API error: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    // Retry once after 2 seconds
    await delay(2000);
    try {
      const retryResponse = await fetch(url, options);
      if (!retryResponse.ok) {
        throw new Error(`Instagram API retry error: ${retryResponse.status} ${retryResponse.statusText}`);
      }
    } catch (retryError) {
      // Log failure but do not propagate to the core service
      console.error('[Instagram Adapter] Message delivery failed after retry:', retryError);
      throw retryError;
    }
  }
}

/**
 * Instagram Channel Adapter
 *
 * Uses the Instagram Messaging API to send structured text messages with
 * quick reply buttons and parse inbound DM webhook events.
 * Environment variables:
 * - META_INSTAGRAM_ACCESS_TOKEN: Bearer token for API auth
 * - META_INSTAGRAM_PAGE_ID: Instagram page identity
 */
export class InstagramAdapter implements ChannelAdapter {
  readonly channel: SocialChannel = 'instagram';

  private get accessToken(): string {
    return process.env.META_INSTAGRAM_ACCESS_TOKEN || '';
  }

  /**
   * Parse an inbound Instagram DM webhook payload into a normalised event.
   * Extracts message type, sender ID, and message content from the
   * Instagram Messaging API webhook structure.
   *
   * Instagram webhook payload structure:
   * {
   *   "object": "instagram",
   *   "entry": [{
   *     "id": "<page_id>",
   *     "time": <timestamp_ms>,
   *     "messaging": [{
   *       "sender": { "id": "<sender_id>" },
   *       "recipient": { "id": "<recipient_id>" },
   *       "timestamp": <timestamp_ms>,
   *       "message": {
   *         "mid": "<message_id>",
   *         "text": "<message_text>",
   *         "quick_reply": { "payload": "<payload>" }
   *       }
   *     }]
   *   }]
   * }
   */
  parseEvent(payload: unknown): ParsedSocialEvent | null {
    try {
      const data = payload as Record<string, unknown>;

      const entry = data?.entry as Array<Record<string, unknown>> | undefined;
      if (!entry || entry.length === 0) return null;

      const messaging = entry[0]?.messaging as Array<Record<string, unknown>> | undefined;
      if (!messaging || messaging.length === 0) return null;

      const messagingEvent = messaging[0];
      const sender = messagingEvent.sender as Record<string, unknown> | undefined;
      const senderId = sender?.id as string;
      if (!senderId) return null;

      // Use page ID as conversation context
      const conversationId = entry[0]?.id as string || '';

      const message = messagingEvent.message as Record<string, unknown> | undefined;
      if (!message) return null;

      // Handle quick reply (session selection)
      const quickReply = message.quick_reply as Record<string, unknown> | undefined;
      if (quickReply?.payload) {
        const selectedId = quickReply.payload as string;
        // Check if this is a programme selection (prefixed with 'programme_')
        if (selectedId.startsWith('programme_')) {
          return {
            type: 'programme_selection',
            channel: 'instagram',
            senderId,
            conversationId,
            selectedClassId: selectedId.replace('programme_', ''),
          };
        }
        return {
          type: 'session_selection',
          channel: 'instagram',
          senderId,
          conversationId,
          selectedSessionId: selectedId,
        };
      }

      // Handle text messages
      const text = message.text as string;
      if (text) {
        const normalised = text.trim().toLowerCase();

        if (TRIGGER_WORDS.includes(normalised)) {
          return {
            type: 'trigger',
            channel: 'instagram',
            senderId,
            conversationId,
            text,
          };
        }

        // Unrecognised text command
        return {
          type: 'unknown',
          channel: 'instagram',
          senderId,
          conversationId,
          text,
        };
      }

      // Any other message type treated as unknown
      return {
        type: 'unknown',
        channel: 'instagram',
        senderId,
        conversationId,
        text: '',
      };
    } catch {
      return null;
    }
  }

  /**
   * Send available sessions as text with quick reply buttons.
   * Instagram supports up to 13 quick replies per message.
   * Data minimisation: only class name, date, time, venue, age range, spots, price.
   */
  async sendSessionList(
    recipientId: string,
    sessions: SessionSummary[]
  ): Promise<void> {
    const sessionLines = sessions.map(
      (s, i) => `${i + 1}. *${s.className}*\n   📅 ${s.date} at ${s.startTime}\n   📍 ${s.venueName} (${s.ageRange})\n   👥 ${s.spotsAvailable} spots · ${s.price}`
    ).join('\n\n');

    const quickReplies = sessions.map((session) => ({
      content_type: 'text',
      title: this.truncate(session.className, 20),
      payload: session.sessionId,
    }));

    const body = {
      recipient: { id: recipientId },
      message: {
        text: `🍳 Available Cooking Classes\n\n${sessionLines}\n\nTap a button below to select:`,
        quick_replies: quickReplies,
      },
    };

    await sendInstagramMessage(this.accessToken, body);
  }

  /**
   * Send checkout deep link as a clickable URL.
   * Data minimisation: only class name, date, time, venue included.
   */
  async sendCheckoutLink(
    recipientId: string,
    deepLinkUrl: string,
    sessionSummary: SessionSummary
  ): Promise<void> {
    const body = {
      recipient: { id: recipientId },
      message: {
        text: `Great choice! 🎉\n\n*${sessionSummary.className}*\n📅 ${sessionSummary.date} at ${sessionSummary.startTime}\n📍 ${sessionSummary.venueName}\n💰 ${sessionSummary.price}\n\nComplete your booking here:\n${deepLinkUrl}`,
      },
    };

    await sendInstagramMessage(this.accessToken, body);
  }

  /**
   * Send booking confirmation message.
   * Data minimisation: only class name, date, time, venue, booking ref (last 8 chars of PI ID).
   * No medical or payment details.
   */
  async sendBookingConfirmation(
    recipientId: string,
    confirmation: BookingConfirmation
  ): Promise<void> {
    const body = {
      recipient: { id: recipientId },
      message: {
        text: `✅ Booking Confirmed!\n\n*${confirmation.className}*\n📅 ${confirmation.date} at ${confirmation.startTime}\n📍 ${confirmation.venueName}\n🔖 Ref: ${confirmation.bookingRef}\n\nWe look forward to seeing you! A confirmation email has also been sent.`,
      },
    };

    await sendInstagramMessage(this.accessToken, body);
  }

  /**
   * Send no-sessions-available message with website URL.
   */
  async sendNoSessionsMessage(recipientId: string): Promise<void> {
    const websiteUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://bloomingtastebuds.co.uk';

    const body = {
      recipient: { id: recipientId },
      message: {
        text: `Sorry, there are no upcoming sessions available at the moment. 😔\n\nPlease check our website for future sessions: ${websiteUrl}/classes\n\nSend "Book" anytime to check again!`,
      },
    };

    await sendInstagramMessage(this.accessToken, body);
  }

  /**
   * Send session-unavailable message and re-present current available sessions.
   */
  async sendSessionUnavailableMessage(
    recipientId: string,
    sessions: SessionSummary[]
  ): Promise<void> {
    // First send unavailable notice
    const noticeBody = {
      recipient: { id: recipientId },
      message: {
        text: `Sorry, that session is no longer available. 😔\n\nHere are the current available sessions:`,
      },
    };

    await sendInstagramMessage(this.accessToken, noticeBody);

    // Then re-present the updated session list
    if (sessions.length > 0) {
      await this.sendSessionList(recipientId, sessions);
    } else {
      await this.sendNoSessionsMessage(recipientId);
    }
  }

  /**
   * Send help message listing available commands.
   */
  async sendHelpMessage(recipientId: string): Promise<void> {
    const body = {
      recipient: { id: recipientId },
      message: {
        text: `👋 Hi! I can help you book a cooking class with Blooming Tastebuds.\n\nSend one of these to get started:\n• Book — See available classes\n• Classes — Browse upcoming sessions\n• Hi — Start a conversation\n\nHow can I help you today?`,
      },
    };

    await sendInstagramMessage(this.accessToken, body);
  }

  /**
   * Send error/retry message.
   */
  async sendErrorMessage(recipientId: string): Promise<void> {
    const body = {
      recipient: { id: recipientId },
      message: {
        text: `Sorry, something went wrong on our end. 😔\n\nPlease try again in a moment by sending "Book".`,
      },
    };

    await sendInstagramMessage(this.accessToken, body);
  }

  /**
   * Send available programmes (term classes) to the user as quick reply buttons.
   */
  async sendProgrammeList(
    recipientId: string,
    programmes: ProgrammeSummary[]
  ): Promise<void> {
    const programmeLines = programmes.map(
      (p, i) => `${i + 1}. *${p.className}*\n   📅 ${p.termStartDate} – ${p.termEndDate} at ${p.startTime}\n   📍 ${p.venueName} (${p.ageRange})\n   👥 ${p.spotsAvailable} spots · ${p.price}`
    ).join('\n\n');

    const quickReplies = programmes.map((prog) => ({
      content_type: 'text',
      title: this.truncate(prog.className, 20),
      payload: `programme_${prog.classId}`,
    }));

    const body = {
      recipient: { id: recipientId },
      message: {
        text: `📚 Available Programme Classes\n\n${programmeLines}\n\nTap a button below to select:`,
        quick_replies: quickReplies,
      },
    };

    await sendInstagramMessage(this.accessToken, body);
  }

  /**
   * Send checkout deep link for a programme booking.
   */
  async sendProgrammeCheckoutLink(
    recipientId: string,
    deepLinkUrl: string,
    programmeSummary: ProgrammeSummary
  ): Promise<void> {
    const scheduleText = programmeSummary.recurrenceDays?.length
      ? `📅 Every ${programmeSummary.recurrenceDays.map(d => d.slice(0, 3)).join(', ')}`
      : `📅 ${programmeSummary.termStartDate} – ${programmeSummary.termEndDate}`;

    const body = {
      recipient: { id: recipientId },
      message: {
        text: `Great choice! 🎉\n\n*${programmeSummary.className}*\n${scheduleText} at ${programmeSummary.startTime}\n📍 ${programmeSummary.venueName}\n💰 ${programmeSummary.price}\n\nComplete your programme booking here:\n${deepLinkUrl}`,
      },
    };

    await sendInstagramMessage(this.accessToken, body);
  }

  // ────────────────────────────────────────────────────────
  // Private helpers
  // ────────────────────────────────────────────────────────

  /**
   * Truncate a string to a maximum length, appending "…" if truncated.
   */
  private truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength - 1) + '…';
  }
}
