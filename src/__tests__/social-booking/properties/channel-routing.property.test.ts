/**
 * Feature: social-commerce-guest-booking, Property 2: Channel Routing from Payload Structure
 *
 * For any valid webhook event payload, the Meta webhook handler SHALL correctly
 * identify the originating channel (whatsapp, instagram, or messenger) based on
 * the payload's structural characteristics, and route the event to the
 * corresponding Channel_Adapter.
 *
 * - `object === 'whatsapp_business_account'` → whatsapp
 * - `object === 'instagram'` → instagram
 * - `object === 'page'` → messenger
 * - Unrecognised `object` value → 200 (acknowledged without processing)
 *
 * Validates: Requirements 3.5, 3.7
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import crypto from 'crypto';

// ─── Constants ───────────────────────────────────────────────────────────────

const TEST_APP_SECRET = 'test_meta_app_secret_for_channel_routing';

// ─── Set env BEFORE module is loaded (vi.mock is hoisted but env must also be) ──

// Use vi.hoisted to ensure env is set before the route module evaluates
vi.hoisted(() => {
  process.env.META_APP_SECRET = 'test_meta_app_secret_for_channel_routing';
});

// ─── Mock @vercel/kv ─────────────────────────────────────────────────────────

const mockKvStore = new Map<string, unknown>();

vi.mock('@vercel/kv', () => ({
  kv: {
    get: vi.fn(async (key: string) => mockKvStore.get(key) ?? null),
    set: vi.fn(async (key: string, value: unknown) => {
      mockKvStore.set(key, value);
      return 'OK';
    }),
  },
}));

// ─── Import the route handler after mocks & env are set ──────────────────────

import { POST } from '@/app/api/webhooks/meta/route';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function computeSignature(body: string, secret: string): string {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(body, 'utf8').digest('hex');
}

function createRequest(body: string, signature: string): Request {
  return new Request('http://localhost:3000/api/webhooks/meta', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-hub-signature-256': signature,
    },
    body,
  });
}

// ─── Test Suite ──────────────────────────────────────────────────────────────

describe('Property 2: Channel Routing from Payload Structure', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockKvStore.clear();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('payloads with object "whatsapp_business_account" are routed as whatsapp channel (returns 200)', async () => {
    await fc.assert(
      fc.asyncProperty(fc.nat({ max: 9999 }), async (seed) => {
        mockKvStore.clear();
        logSpy.mockClear();

        const nowSeconds = Math.floor(Date.now() / 1000);
        const payload = {
          object: 'whatsapp_business_account',
          entry: [
            {
              id: `wa_entry_${seed}_${Date.now()}`,
              time: nowSeconds * 1000,
              changes: [
                {
                  value: {
                    messaging_product: 'whatsapp',
                    metadata: {
                      display_phone_number: '447700000000',
                      phone_number_id: 'phone_123456',
                    },
                    messages: [
                      {
                        from: '447700111222',
                        id: `wamid_${seed}_${Date.now()}`,
                        timestamp: String(nowSeconds),
                        text: { body: 'Book' },
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

        const body = JSON.stringify(payload);
        const signature = computeSignature(body, TEST_APP_SECRET);
        const req = createRequest(body, signature);

        const res = await POST(req);
        expect(res.status).toBe(200);

        // Verify the handler identified the channel as whatsapp
        const routedCall = logSpy.mock.calls.find(
          (call) => typeof call[0] === 'string' && call[0].includes('whatsapp')
        );
        expect(routedCall).toBeDefined();
      }),
      { numRuns: 20 }
    );
  });

  it('payloads with object "instagram" are routed as instagram channel (returns 200)', async () => {
    await fc.assert(
      fc.asyncProperty(fc.nat({ max: 9999 }), async (seed) => {
        mockKvStore.clear();
        logSpy.mockClear();

        const nowSeconds = Math.floor(Date.now() / 1000);
        const payload = {
          object: 'instagram',
          entry: [
            {
              id: `ig_entry_${seed}_${Date.now()}`,
              time: nowSeconds * 1000,
              messaging: [
                {
                  sender: { id: 'ig_sender_123' },
                  recipient: { id: 'ig_recipient_456' },
                  timestamp: nowSeconds * 1000,
                  message: {
                    mid: `mid_ig_${seed}_${Date.now()}`,
                    text: 'Book',
                  },
                },
              ],
            },
          ],
        };

        const body = JSON.stringify(payload);
        const signature = computeSignature(body, TEST_APP_SECRET);
        const req = createRequest(body, signature);

        const res = await POST(req);
        expect(res.status).toBe(200);

        // Verify the handler identified the channel as instagram
        const routedCall = logSpy.mock.calls.find(
          (call) => typeof call[0] === 'string' && call[0].includes('instagram')
        );
        expect(routedCall).toBeDefined();
      }),
      { numRuns: 20 }
    );
  });

  it('payloads with object "page" are routed as messenger channel (returns 200)', async () => {
    await fc.assert(
      fc.asyncProperty(fc.nat({ max: 9999 }), async (seed) => {
        mockKvStore.clear();
        logSpy.mockClear();

        const nowSeconds = Math.floor(Date.now() / 1000);
        const payload = {
          object: 'page',
          entry: [
            {
              id: `fb_entry_${seed}_${Date.now()}`,
              time: nowSeconds * 1000,
              messaging: [
                {
                  sender: { id: 'fb_sender_789' },
                  recipient: { id: 'fb_page_012' },
                  timestamp: nowSeconds * 1000,
                  message: {
                    mid: `mid_fb_${seed}_${Date.now()}`,
                    text: 'Classes',
                  },
                },
              ],
            },
          ],
        };

        const body = JSON.stringify(payload);
        const signature = computeSignature(body, TEST_APP_SECRET);
        const req = createRequest(body, signature);

        const res = await POST(req);
        expect(res.status).toBe(200);

        // Verify the handler identified the channel as messenger
        const routedCall = logSpy.mock.calls.find(
          (call) => typeof call[0] === 'string' && call[0].includes('messenger')
        );
        expect(routedCall).toBeDefined();
      }),
      { numRuns: 20 }
    );
  });

  it('payloads with an unrecognised object value return 200 without routing to any channel', async () => {
    // Generate random unrecognised object values that are NOT any recognised channel
    const arbUnrecognisedObject = fc.string({ minLength: 1, maxLength: 50 }).filter(
      (s) => s !== 'whatsapp_business_account' && s !== 'instagram' && s !== 'page'
    );

    await fc.assert(
      fc.asyncProperty(arbUnrecognisedObject, fc.nat({ max: 9999 }), async (objectValue, seed) => {
        mockKvStore.clear();
        logSpy.mockClear();
        warnSpy.mockClear();

        const nowSeconds = Math.floor(Date.now() / 1000);
        const payload = {
          object: objectValue,
          entry: [
            {
              id: `unknown_entry_${seed}_${Date.now()}`,
              time: nowSeconds * 1000,
            },
          ],
        };

        const body = JSON.stringify(payload);
        const signature = computeSignature(body, TEST_APP_SECRET);
        const req = createRequest(body, signature);

        const res = await POST(req);

        // Should return 200 to prevent Meta retries
        expect(res.status).toBe(200);

        // Should NOT have logged a channel routing event
        const channelRoutedCall = logSpy.mock.calls.find(
          (call) =>
            typeof call[0] === 'string' &&
            (call[0].includes('whatsapp') || call[0].includes('instagram') || call[0].includes('messenger'))
        );
        expect(channelRoutedCall).toBeUndefined();

        // Should have warned about unrecognised payload structure
        const unrecognisedCall = warnSpy.mock.calls.find(
          (call) => typeof call[0] === 'string' && call[0].includes('Unrecognised')
        );
        expect(unrecognisedCall).toBeDefined();
      }),
      { numRuns: 20 }
    );
  });
});
