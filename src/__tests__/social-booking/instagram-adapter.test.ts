/**
 * Unit tests for Instagram Channel Adapter
 *
 * Tests DM trigger detection, session list format, quick reply handling,
 * checkout link sending, booking confirmation format, and retry logic.
 *
 * Requirements: 13.1, 13.6
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { InstagramAdapter } from '@/lib/social-booking/adapters/instagram';
import {
  validSessionSummaries,
  validBookingConfirmation,
  validInstagramPayload,
  validInstagramQuickReplyPayload,
  testEnvVars,
} from '@/__tests__/social-booking/helpers/fixtures';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('InstagramAdapter', () => {
  let adapter: InstagramAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    // Set environment variables
    process.env.META_INSTAGRAM_ACCESS_TOKEN = testEnvVars.META_INSTAGRAM_ACCESS_TOKEN;
    process.env.META_INSTAGRAM_PAGE_ID = testEnvVars.META_INSTAGRAM_PAGE_ID;
    process.env.NEXT_PUBLIC_APP_URL = testEnvVars.NEXT_PUBLIC_APP_URL;

    adapter = new InstagramAdapter();
    mockFetch.mockResolvedValue({ ok: true, status: 200 });
  });

  afterEach(() => {
    delete process.env.META_INSTAGRAM_ACCESS_TOKEN;
    delete process.env.META_INSTAGRAM_PAGE_ID;
    delete process.env.NEXT_PUBLIC_APP_URL;
  });

  // ─── parseEvent: Trigger Word Detection ──────────────────────────────────

  describe('parseEvent - trigger word detection', () => {
    test('1. detects "Book" as trigger event from Instagram DM payload', () => {
      const payload = makeInstagramTextPayload('Book');
      const result = adapter.parseEvent(payload);

      expect(result).not.toBeNull();
      expect(result!.type).toBe('trigger');
      expect(result!.channel).toBe('instagram');
      expect(result!.senderId).toBe('6789012345678901');
    });

    test('2. detects "Classes" as trigger event', () => {
      const payload = makeInstagramTextPayload('Classes');
      const result = adapter.parseEvent(payload);

      expect(result).not.toBeNull();
      expect(result!.type).toBe('trigger');
      expect(result!.channel).toBe('instagram');
    });

    test('3. detects "Hi" as trigger event', () => {
      const payload = makeInstagramTextPayload('Hi');
      const result = adapter.parseEvent(payload);

      expect(result).not.toBeNull();
      expect(result!.type).toBe('trigger');
      expect(result!.channel).toBe('instagram');
    });

    test('4. detects "book" (lowercase) as trigger event', () => {
      const payload = makeInstagramTextPayload('book');
      const result = adapter.parseEvent(payload);

      expect(result).not.toBeNull();
      expect(result!.type).toBe('trigger');
      expect(result!.channel).toBe('instagram');
    });

    test('5. returns "unknown" type for unrecognised text', () => {
      const payload = makeInstagramTextPayload('What are the prices?');
      const result = adapter.parseEvent(payload);

      expect(result).not.toBeNull();
      expect(result!.type).toBe('unknown');
      expect(result!.channel).toBe('instagram');
      expect(result!.senderId).toBe('6789012345678901');
    });
  });

  // ─── parseEvent: Quick Replies ───────────────────────────────────────────

  describe('parseEvent - quick replies', () => {
    test('6. handles quick_reply as session_selection (payload = session ID)', () => {
      const result = adapter.parseEvent(validInstagramQuickReplyPayload);

      expect(result).not.toBeNull();
      expect(result!.type).toBe('session_selection');
      expect(result!.channel).toBe('instagram');
      if (result!.type === 'session_selection') {
        expect(result!.selectedSessionId).toBe('session_001');
      }
    });
  });

  // ─── parseEvent: Invalid/Malformed Payloads ──────────────────────────────

  describe('parseEvent - malformed payloads', () => {
    test('7. returns null for invalid/malformed payload', () => {
      expect(adapter.parseEvent(null)).toBeNull();
      expect(adapter.parseEvent(undefined)).toBeNull();
      expect(adapter.parseEvent({})).toBeNull();
      expect(adapter.parseEvent({ entry: [] })).toBeNull();
      expect(adapter.parseEvent({ entry: [{}] })).toBeNull();
      expect(adapter.parseEvent({ entry: [{ messaging: [] }] })).toBeNull();
      expect(adapter.parseEvent('not an object')).toBeNull();
      expect(adapter.parseEvent(42)).toBeNull();
    });
  });

  // ─── sendSessionList: Message Format ─────────────────────────────────────

  describe('sendSessionList - message format', () => {
    test('8. sends text with quick reply buttons', async () => {
      const sessions = validSessionSummaries.slice(0, 3);
      await adapter.sendSessionList('6789012345678901', sessions);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);

      // Check URL contains access token
      expect(url).toContain(testEnvVars.META_INSTAGRAM_ACCESS_TOKEN);

      // Check message structure
      expect(body.recipient).toEqual({ id: '6789012345678901' });
      expect(body.message.text).toContain('Available Cooking Classes');
      expect(body.message.quick_replies).toHaveLength(3);

      // Each quick reply should have content_type, title, and payload (session ID)
      expect(body.message.quick_replies[0].content_type).toBe('text');
      expect(body.message.quick_replies[0].payload).toBe('session_001');
      expect(body.message.quick_replies[1].payload).toBe('session_002');
      expect(body.message.quick_replies[2].payload).toBe('session_003');
    });
  });

  // ─── sendCheckoutLink: Clickable URL ─────────────────────────────────────

  describe('sendCheckoutLink', () => {
    test('9. sends message with clickable URL', async () => {
      const session = validSessionSummaries[0];
      const deepLink = 'https://bloomingtastebuds.co.uk/guest/book/abc123token';

      await adapter.sendCheckoutLink('6789012345678901', deepLink, session);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);

      expect(body.recipient).toEqual({ id: '6789012345678901' });
      const text = body.message.text;
      expect(text).toContain(deepLink);
      expect(text).toContain(session.className);
      expect(text).toContain(session.date);
      expect(text).toContain(session.startTime);
      expect(text).toContain(session.venueName);
      expect(text).toContain(session.price);
    });
  });

  // ─── sendBookingConfirmation ─────────────────────────────────────────────

  describe('sendBookingConfirmation', () => {
    test('10. includes class name, date, time, venue, booking ref', async () => {
      await adapter.sendBookingConfirmation('6789012345678901', validBookingConfirmation);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);

      expect(body.recipient).toEqual({ id: '6789012345678901' });
      const text = body.message.text;
      expect(text).toContain(validBookingConfirmation.className);
      expect(text).toContain(validBookingConfirmation.date);
      expect(text).toContain(validBookingConfirmation.startTime);
      expect(text).toContain(validBookingConfirmation.venueName);
      expect(text).toContain(validBookingConfirmation.bookingRef);
      // Should NOT contain sensitive data
      expect(text).not.toContain('medical');
      expect(text).not.toContain('payment');
      expect(text).not.toContain('card');
      expect(text).not.toContain('allergy');
    });
  });

  // ─── Retry Logic ─────────────────────────────────────────────────────────

  describe('retry on API failure', () => {
    test('11. first fetch fails, second succeeds (verify 2 fetch calls)', async () => {
      // First call throws (triggers retry), second call succeeds
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ ok: true, status: 200 });

      await adapter.sendHelpMessage('6789012345678901');

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    test('12. both fetch calls fail, error is logged', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error again'));

      await expect(adapter.sendHelpMessage('6789012345678901')).rejects.toThrow('Network error again');
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Instagram Adapter]'),
        expect.anything()
      );

      consoleSpy.mockRestore();
    });
  });
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Creates an Instagram DM text message webhook payload for testing.
 */
function makeInstagramTextPayload(text: string) {
  return {
    object: 'instagram',
    entry: [
      {
        id: '17841400000000001',
        time: 1721383200,
        messaging: [
          {
            sender: { id: '6789012345678901' },
            recipient: { id: '17841400000000001' },
            timestamp: 1721383200,
            message: {
              mid: 'm_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefg',
              text,
            },
          },
        ],
      },
    ],
  };
}
