/**
 * Unit tests for WhatsApp Channel Adapter
 *
 * Tests trigger word detection, interactive message formats, help messages,
 * retry logic on API failure, and event parsing.
 *
 * Requirements: 12.1, 12.7
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { WhatsAppAdapter } from '@/lib/social-booking/adapters/whatsapp';
import {
  validSessionSummaries,
  validBookingConfirmation,
  validWhatsAppPayload,
  validWhatsAppButtonReplyPayload,
  testEnvVars,
} from '@/__tests__/social-booking/helpers/fixtures';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('WhatsAppAdapter', () => {
  let adapter: WhatsAppAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    // Set environment variables
    process.env.META_WHATSAPP_ACCESS_TOKEN = testEnvVars.META_WHATSAPP_ACCESS_TOKEN;
    process.env.META_WHATSAPP_PHONE_NUMBER_ID = testEnvVars.META_WHATSAPP_PHONE_NUMBER_ID;
    process.env.NEXT_PUBLIC_APP_URL = testEnvVars.NEXT_PUBLIC_APP_URL;

    adapter = new WhatsAppAdapter();
    mockFetch.mockResolvedValue({ ok: true, status: 200 });
  });

  afterEach(() => {
    delete process.env.META_WHATSAPP_ACCESS_TOKEN;
    delete process.env.META_WHATSAPP_PHONE_NUMBER_ID;
    delete process.env.NEXT_PUBLIC_APP_URL;
  });

  // ─── parseEvent: Trigger Word Detection ──────────────────────────────────

  describe('parseEvent - trigger word detection', () => {
    test('1. detects "Book" (case-insensitive) as trigger event', () => {
      const payload = makeTextPayload('Book');
      const result = adapter.parseEvent(payload);

      expect(result).not.toBeNull();
      expect(result!.type).toBe('trigger');
      expect(result!.channel).toBe('whatsapp');
      expect(result!.senderId).toBe('447700900123');
    });

    test('2. detects "Classes" as trigger event', () => {
      const payload = makeTextPayload('Classes');
      const result = adapter.parseEvent(payload);

      expect(result).not.toBeNull();
      expect(result!.type).toBe('trigger');
      expect(result!.channel).toBe('whatsapp');
    });

    test('3. detects "Hi" as trigger event', () => {
      const payload = makeTextPayload('Hi');
      const result = adapter.parseEvent(payload);

      expect(result).not.toBeNull();
      expect(result!.type).toBe('trigger');
      expect(result!.channel).toBe('whatsapp');
    });

    test('4. detects "BOOK" (uppercase) as trigger event', () => {
      const payload = makeTextPayload('BOOK');
      const result = adapter.parseEvent(payload);

      expect(result).not.toBeNull();
      expect(result!.type).toBe('trigger');
      expect(result!.channel).toBe('whatsapp');
    });

    test('5. returns "unknown" type for unrecognised text', () => {
      const payload = makeTextPayload('What time is it?');
      const result = adapter.parseEvent(payload);

      expect(result).not.toBeNull();
      expect(result!.type).toBe('unknown');
      expect(result!.channel).toBe('whatsapp');
      expect(result!.senderId).toBe('447700900123');
    });
  });

  // ─── parseEvent: Interactive Replies ─────────────────────────────────────

  describe('parseEvent - interactive replies', () => {
    test('6. handles button reply (interactive.button_reply) as session_selection', () => {
      const result = adapter.parseEvent(validWhatsAppButtonReplyPayload);

      expect(result).not.toBeNull();
      expect(result!.type).toBe('session_selection');
      expect(result!.channel).toBe('whatsapp');
      if (result!.type === 'session_selection') {
        expect(result!.selectedSessionId).toBe('session_001');
      }
    });

    test('7. handles list reply (interactive.list_reply) as session_selection', () => {
      const payload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: '123456789012345',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: {
                    display_phone_number: '15550001234',
                    phone_number_id: '987654321098765',
                  },
                  messages: [
                    {
                      from: '447700900123',
                      id: 'wamid.list_reply_001',
                      timestamp: '1721383260',
                      interactive: {
                        type: 'list_reply',
                        list_reply: {
                          id: 'session_003',
                          title: 'Italian Pasta Making',
                          description: 'Sun 27 Jul, 11:00',
                        },
                      },
                      type: 'interactive',
                    },
                  ],
                },
                field: 'messages',
              },
            ],
          },
        ],
      };

      const result = adapter.parseEvent(payload);

      expect(result).not.toBeNull();
      expect(result!.type).toBe('session_selection');
      expect(result!.channel).toBe('whatsapp');
      if (result!.type === 'session_selection') {
        expect(result!.selectedSessionId).toBe('session_003');
      }
    });
  });

  // ─── parseEvent: Invalid/Malformed Payloads ──────────────────────────────

  describe('parseEvent - malformed payloads', () => {
    test('8. returns null for invalid/malformed payload', () => {
      expect(adapter.parseEvent(null)).toBeNull();
      expect(adapter.parseEvent(undefined)).toBeNull();
      expect(adapter.parseEvent({})).toBeNull();
      expect(adapter.parseEvent({ entry: [] })).toBeNull();
      expect(adapter.parseEvent({ entry: [{ changes: [] }] })).toBeNull();
      expect(adapter.parseEvent({ entry: [{ changes: [{ value: {} }] }] })).toBeNull();
      expect(adapter.parseEvent('not an object')).toBeNull();
      expect(adapter.parseEvent(42)).toBeNull();
    });
  });

  // ─── sendSessionList: Message Format ─────────────────────────────────────

  describe('sendSessionList - message format', () => {
    test('9. uses buttons format for ≤3 sessions', async () => {
      const threeSessions = validSessionSummaries.slice(0, 3);
      await adapter.sendSessionList('447700900123', threeSessions);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);

      expect(body.messaging_product).toBe('whatsapp');
      expect(body.to).toBe('447700900123');
      expect(body.type).toBe('interactive');
      expect(body.interactive.type).toBe('button');
      expect(body.interactive.action.buttons).toHaveLength(3);
      expect(body.interactive.action.buttons[0].type).toBe('reply');
      expect(body.interactive.action.buttons[0].reply.id).toBe('session_001');
    });

    test('10. uses list message format for 4-5 sessions', async () => {
      const fiveSessions = validSessionSummaries.slice(0, 5);
      await adapter.sendSessionList('447700900123', fiveSessions);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);

      expect(body.messaging_product).toBe('whatsapp');
      expect(body.to).toBe('447700900123');
      expect(body.type).toBe('interactive');
      expect(body.interactive.type).toBe('list');
      expect(body.interactive.action.button).toBe('View Sessions');
      expect(body.interactive.action.sections[0].rows).toHaveLength(5);
      expect(body.interactive.action.sections[0].rows[0].id).toBe('session_001');
    });
  });

  // ─── sendCheckoutLink: CTA URL Button ────────────────────────────────────

  describe('sendCheckoutLink', () => {
    test('11. sends CTA URL button with deep link', async () => {
      const session = validSessionSummaries[0];
      const deepLink = 'https://bloomingtastebuds.co.uk/guest/book/abc123token';

      await adapter.sendCheckoutLink('447700900123', deepLink, session);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);

      expect(url).toContain(testEnvVars.META_WHATSAPP_PHONE_NUMBER_ID);
      expect(body.messaging_product).toBe('whatsapp');
      expect(body.to).toBe('447700900123');
      expect(body.type).toBe('interactive');
      expect(body.interactive.type).toBe('cta_url');
      expect(body.interactive.action.name).toBe('cta_url');
      expect(body.interactive.action.parameters.url).toBe(deepLink);
      expect(body.interactive.action.parameters.display_text).toBe('Book Now');
      // Verify session info in the body text
      expect(body.interactive.body.text).toContain(session.className);
      expect(body.interactive.body.text).toContain(session.date);
      expect(body.interactive.body.text).toContain(session.startTime);
      expect(body.interactive.body.text).toContain(session.venueName);
      expect(body.interactive.body.text).toContain(session.price);
    });
  });

  // ─── sendBookingConfirmation ─────────────────────────────────────────────

  describe('sendBookingConfirmation', () => {
    test('12. includes only class name, date, time, venue', async () => {
      await adapter.sendBookingConfirmation('447700900123', validBookingConfirmation);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);

      expect(body.messaging_product).toBe('whatsapp');
      expect(body.to).toBe('447700900123');
      expect(body.type).toBe('text');

      const text = body.text.body;
      expect(text).toContain(validBookingConfirmation.className);
      expect(text).toContain(validBookingConfirmation.date);
      expect(text).toContain(validBookingConfirmation.startTime);
      expect(text).toContain(validBookingConfirmation.venueName);
      // Should NOT contain sensitive data
      expect(text).not.toContain('medical');
      expect(text).not.toContain('payment');
      expect(text).not.toContain('card');
      expect(text).not.toContain('allergy');
    });
  });

  // ─── sendHelpMessage ─────────────────────────────────────────────────────

  describe('sendHelpMessage', () => {
    test('13. includes available commands', async () => {
      await adapter.sendHelpMessage('447700900123');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);

      expect(body.messaging_product).toBe('whatsapp');
      expect(body.to).toBe('447700900123');
      expect(body.type).toBe('text');

      const text = body.text.body;
      expect(text).toContain('Book');
      expect(text).toContain('Classes');
      expect(text).toContain('Hi');
    });
  });

  // ─── Retry Logic ─────────────────────────────────────────────────────────

  describe('retry on API failure', () => {
    test('14. first fetch fails, second succeeds (verify 2 fetch calls)', async () => {
      // First call throws (triggers retry), second call succeeds
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ ok: true, status: 200 });

      await adapter.sendHelpMessage('447700900123');

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    test('15. both fetch calls fail, error is logged', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error again'));

      await expect(adapter.sendHelpMessage('447700900123')).rejects.toThrow('Network error again');
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[WhatsApp Adapter]'),
        expect.anything()
      );

      consoleSpy.mockRestore();
    });
  });
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Creates a WhatsApp text message webhook payload for testing.
 */
function makeTextPayload(text: string) {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: '123456789012345',
        changes: [
          {
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '15550001234',
                phone_number_id: '987654321098765',
              },
              messages: [
                {
                  from: '447700900123',
                  id: 'wamid.test_message_001',
                  timestamp: '1721383200',
                  text: { body: text },
                  type: 'text',
                },
              ],
            },
            field: 'messages',
          },
        ],
      },
    ],
  };
}
