// ============================================================
// WhatsApp Channel Adapter
// Implements the ChannelAdapter interface for WhatsApp Cloud API.
// Handles parsing inbound webhook events and sending interactive
// messages (list messages, buttons, text with CTA URL).
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

const WHATSAPP_API_VERSION = 'v21.0';

/** Trigger words that initiate a booking conversation (case-insensitive) */
const TRIGGER_WORDS = ['book', 'classes', 'hi'];

/**
 * Delay utility for retry logic
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Send a message via WhatsApp Cloud API with retry logic.
 * Retries once after 2 seconds on failure.
 */
async function sendWhatsAppMessage(
  phoneNumberId: string,
  accessToken: string,
  body: Record<string, unknown>
): Promise<void> {
  const url = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${phoneNumberId}/messages`;

  const options: RequestInit = {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  };

  try {
    const response = await fetch(url, options);
    if (!response.ok) {
      throw new Error(`WhatsApp API error: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    // Retry once after 2 seconds
    await delay(2000);
    try {
      const retryResponse = await fetch(url, options);
      if (!retryResponse.ok) {
        throw new Error(`WhatsApp API retry error: ${retryResponse.status} ${retryResponse.statusText}`);
      }
    } catch (retryError) {
      // Log failure but do not propagate to the core service
      console.error('[WhatsApp Adapter] Message delivery failed after retry:', retryError);
      throw retryError;
    }
  }
}

/**
 * WhatsApp Channel Adapter
 *
 * Uses WhatsApp Cloud API to send interactive messages and parse inbound webhook events.
 * Environment variables:
 * - META_WHATSAPP_ACCESS_TOKEN: Bearer token for API auth
 * - META_WHATSAPP_PHONE_NUMBER_ID: WhatsApp Business phone number ID
 */
export class WhatsAppAdapter implements ChannelAdapter {
  readonly channel: SocialChannel = 'whatsapp';

  private get phoneNumberId(): string {
    return process.env.META_WHATSAPP_PHONE_NUMBER_ID || '';
  }

  private get accessToken(): string {
    return process.env.META_WHATSAPP_ACCESS_TOKEN || '';
  }

  /**
   * Parse an inbound WhatsApp webhook payload into a normalised event.
   * Extracts message type, sender ID, and message content from the
   * WhatsApp Cloud API webhook structure.
   */
  parseEvent(payload: unknown): ParsedSocialEvent | null {
    try {
      const data = payload as Record<string, unknown>;

      // WhatsApp webhook payload structure:
      // { entry: [{ changes: [{ value: { messages: [...], contacts: [...] } }] }] }
      const entry = data?.entry as Array<Record<string, unknown>> | undefined;
      if (!entry || entry.length === 0) return null;

      const changes = entry[0]?.changes as Array<Record<string, unknown>> | undefined;
      if (!changes || changes.length === 0) return null;

      const value = changes[0]?.value as Record<string, unknown> | undefined;
      if (!value) return null;

      const messages = value.messages as Array<Record<string, unknown>> | undefined;
      if (!messages || messages.length === 0) return null;

      const message = messages[0];
      const senderId = message.from as string;
      // Use the WhatsApp phone number ID as conversation context
      const conversationId = (value.metadata as Record<string, unknown>)?.phone_number_id as string || '';

      // Handle interactive replies (button reply or list reply)
      if (message.type === 'interactive') {
        const interactive = message.interactive as Record<string, unknown>;

        // Button reply
        if (interactive?.type === 'button_reply') {
          const buttonReply = interactive.button_reply as Record<string, unknown>;
          const selectedId = buttonReply?.id as string;
          if (selectedId) {
            // Check if this is a programme selection (prefixed with 'programme_')
            if (selectedId.startsWith('programme_')) {
              return {
                type: 'programme_selection',
                channel: 'whatsapp',
                senderId,
                conversationId,
                selectedClassId: selectedId.replace('programme_', ''),
              };
            }
            return {
              type: 'session_selection',
              channel: 'whatsapp',
              senderId,
              conversationId,
              selectedSessionId: selectedId,
            };
          }
        }

        // List reply
        if (interactive?.type === 'list_reply') {
          const listReply = interactive.list_reply as Record<string, unknown>;
          const selectedId = listReply?.id as string;
          if (selectedId) {
            // Check if this is a programme selection (prefixed with 'programme_')
            if (selectedId.startsWith('programme_')) {
              return {
                type: 'programme_selection',
                channel: 'whatsapp',
                senderId,
                conversationId,
                selectedClassId: selectedId.replace('programme_', ''),
              };
            }
            return {
              type: 'session_selection',
              channel: 'whatsapp',
              senderId,
              conversationId,
              selectedSessionId: selectedId,
            };
          }
        }
      }

      // Handle text messages
      if (message.type === 'text') {
        const text = (message.text as Record<string, unknown>)?.body as string || '';
        const normalised = text.trim().toLowerCase();

        if (TRIGGER_WORDS.includes(normalised)) {
          return {
            type: 'trigger',
            channel: 'whatsapp',
            senderId,
            conversationId,
            text,
          };
        }

        // Unrecognised text command
        return {
          type: 'unknown',
          channel: 'whatsapp',
          senderId,
          conversationId,
          text,
        };
      }

      // Any other message type (image, audio, etc.) treated as unknown
      return {
        type: 'unknown',
        channel: 'whatsapp',
        senderId,
        conversationId,
        text: '',
      };
    } catch {
      return null;
    }
  }

  /**
   * Send available sessions to the user as an interactive list message.
   * Uses list messages for up to 10 options or buttons for up to 3.
   * Data minimisation: only class name, date, time, venue, age range, spots, price.
   */
  async sendSessionList(
    recipientId: string,
    sessions: SessionSummary[]
  ): Promise<void> {
    if (sessions.length <= 3) {
      // Use interactive buttons (max 3)
      await this.sendSessionButtons(recipientId, sessions);
    } else {
      // Use interactive list message (up to 10 options)
      await this.sendSessionListMessage(recipientId, sessions);
    }
  }

  /**
   * Send checkout deep link as a text message with CTA URL button.
   * Data minimisation: only class name, date, time, venue included.
   */
  async sendCheckoutLink(
    recipientId: string,
    deepLinkUrl: string,
    sessionSummary: SessionSummary
  ): Promise<void> {
    const body = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: recipientId,
      type: 'interactive',
      interactive: {
        type: 'cta_url',
        body: {
          text: `Great choice! 🎉\n\n*${sessionSummary.className}*\n📅 ${sessionSummary.date} at ${sessionSummary.startTime}\n📍 ${sessionSummary.venueName}\n💰 ${sessionSummary.price}\n\nTap below to complete your booking:`,
        },
        action: {
          name: 'cta_url',
          parameters: {
            display_text: 'Book Now',
            url: deepLinkUrl,
          },
        },
      },
    };

    await sendWhatsAppMessage(this.phoneNumberId, this.accessToken, body);
  }

  /**
   * Send booking confirmation message.
   * Data minimisation: only class name, date, time, venue. No medical or payment details.
   */
  async sendBookingConfirmation(
    recipientId: string,
    confirmation: BookingConfirmation
  ): Promise<void> {
    const body = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: recipientId,
      type: 'text',
      text: {
        body: `✅ *Booking Confirmed!*\n\n*${confirmation.className}*\n📅 ${confirmation.date} at ${confirmation.startTime}\n📍 ${confirmation.venueName}\n\nWe look forward to seeing you! A confirmation email has also been sent.`,
      },
    };

    await sendWhatsAppMessage(this.phoneNumberId, this.accessToken, body);
  }

  /**
   * Send no-sessions-available message with website URL.
   */
  async sendNoSessionsMessage(recipientId: string): Promise<void> {
    const websiteUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://bloomingtastebuds.co.uk';

    const body = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: recipientId,
      type: 'text',
      text: {
        body: `Sorry, there are no upcoming sessions available at the moment. 😔\n\nPlease check our website for future sessions: ${websiteUrl}/classes\n\nSend "Book" anytime to check again!`,
      },
    };

    await sendWhatsAppMessage(this.phoneNumberId, this.accessToken, body);
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
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: recipientId,
      type: 'text',
      text: {
        body: `Sorry, that session is no longer available. 😔\n\nHere are the current available sessions:`,
      },
    };

    await sendWhatsAppMessage(this.phoneNumberId, this.accessToken, noticeBody);

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
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: recipientId,
      type: 'text',
      text: {
        body: `👋 Hi! I can help you book a cooking class with Blooming Tastebuds.\n\nSend one of these to get started:\n• *Book* — See available classes\n• *Classes* — Browse upcoming sessions\n• *Hi* — Start a conversation\n\nHow can I help you today?`,
      },
    };

    await sendWhatsAppMessage(this.phoneNumberId, this.accessToken, body);
  }

  /**
   * Send error/retry message.
   */
  async sendErrorMessage(recipientId: string): Promise<void> {
    const body = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: recipientId,
      type: 'text',
      text: {
        body: `Sorry, something went wrong on our end. 😔\n\nPlease try again in a moment by sending "Book".`,
      },
    };

    await sendWhatsAppMessage(this.phoneNumberId, this.accessToken, body);
  }

  /**
   * Send available programmes (term classes) to the user as a text message with instructions.
   * Uses list messages for multiple programmes or buttons for up to 3.
   * Data minimisation: only class name, dates, time, venue, age range, spots, price.
   */
  async sendProgrammeList(
    recipientId: string,
    programmes: ProgrammeSummary[]
  ): Promise<void> {
    if (programmes.length <= 3) {
      // Use interactive buttons (max 3)
      const buttons = programmes.map((prog) => ({
        type: 'reply',
        reply: {
          id: `programme_${prog.classId}`,
          title: this.truncate(prog.className, 20),
        },
      }));

      const programmeLines = programmes.map(
        (p) => `• *${p.className}* — ${p.termStartDate} to ${p.termEndDate}, ${p.startTime}, ${p.venueName} (${p.ageRange}) — ${p.spotsAvailable} spots — ${p.price}`
      ).join('\n');

      const body = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: recipientId,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: {
            text: `📚 *Available Programme Classes*\n\n${programmeLines}\n\nTap a button to select:`,
          },
          action: {
            buttons,
          },
        },
      };

      await sendWhatsAppMessage(this.phoneNumberId, this.accessToken, body);
    } else {
      // Use interactive list message
      const rows = programmes.map((prog) => ({
        id: `programme_${prog.classId}`,
        title: this.truncate(prog.className, 24),
        description: this.truncate(
          `${prog.termStartDate} – ${prog.termEndDate}, ${prog.startTime} · ${prog.venueName} · ${prog.ageRange} · ${prog.spotsAvailable} spots · ${prog.price}`,
          72
        ),
      }));

      const body = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: recipientId,
        type: 'interactive',
        interactive: {
          type: 'list',
          body: {
            text: `📚 *Available Programme Classes*\n\nWe have ${programmes.length} programmes available. Tap "View Programmes" to browse:`,
          },
          action: {
            button: 'View Programmes',
            sections: [
              {
                title: 'Programmes',
                rows,
              },
            ],
          },
        },
      };

      await sendWhatsAppMessage(this.phoneNumberId, this.accessToken, body);
    }
  }

  /**
   * Send checkout deep link for a programme booking as a CTA URL message.
   * Data minimisation: only class name, dates, time, venue, price.
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
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: recipientId,
      type: 'interactive',
      interactive: {
        type: 'cta_url',
        body: {
          text: `Great choice! 🎉\n\n*${programmeSummary.className}*\n${scheduleText} at ${programmeSummary.startTime}\n📍 ${programmeSummary.venueName}\n💰 ${programmeSummary.price}\n\nTap below to complete your booking:`,
        },
        action: {
          name: 'cta_url',
          parameters: {
            display_text: 'Book Programme',
            url: deepLinkUrl,
          },
        },
      },
    };

    await sendWhatsAppMessage(this.phoneNumberId, this.accessToken, body);
  }

  // ────────────────────────────────────────────────────────
  // Private helpers
  // ────────────────────────────────────────────────────────

  /**
   * Send session options as interactive buttons (max 3 sessions).
   */
  private async sendSessionButtons(
    recipientId: string,
    sessions: SessionSummary[]
  ): Promise<void> {
    const buttons = sessions.map((session) => ({
      type: 'reply',
      reply: {
        id: session.sessionId,
        title: this.truncate(`${session.className}`, 20),
      },
    }));

    const sessionLines = sessions.map(
      (s) => `• *${s.className}* — ${s.date}, ${s.startTime}, ${s.venueName} (${s.ageRange}) — ${s.spotsAvailable} spots — ${s.price}`
    ).join('\n');

    const body = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: recipientId,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: {
          text: `🍳 *Available Cooking Classes*\n\n${sessionLines}\n\nTap a button to select:`,
        },
        action: {
          buttons,
        },
      },
    };

    await sendWhatsAppMessage(this.phoneNumberId, this.accessToken, body);
  }

  /**
   * Send session options as an interactive list message (up to 10 sessions).
   */
  private async sendSessionListMessage(
    recipientId: string,
    sessions: SessionSummary[]
  ): Promise<void> {
    const rows = sessions.map((session) => ({
      id: session.sessionId,
      title: this.truncate(session.className, 24),
      description: this.truncate(
        `${session.date}, ${session.startTime} · ${session.venueName} · ${session.ageRange} · ${session.spotsAvailable} spots · ${session.price}`,
        72
      ),
    }));

    const body = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: recipientId,
      type: 'interactive',
      interactive: {
        type: 'list',
        body: {
          text: `🍳 *Available Cooking Classes*\n\nWe have ${sessions.length} upcoming sessions. Tap "View Sessions" to browse and select one:`,
        },
        action: {
          button: 'View Sessions',
          sections: [
            {
              title: 'Upcoming Sessions',
              rows,
            },
          ],
        },
      },
    };

    await sendWhatsAppMessage(this.phoneNumberId, this.accessToken, body);
  }

  /**
   * Truncate a string to a maximum length, appending "…" if truncated.
   */
  private truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength - 1) + '…';
  }
}
