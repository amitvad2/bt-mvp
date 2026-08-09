/**
 * Property 3: Event Idempotency
 *
 * For any webhook event processed by the Meta webhook handler, processing the same
 * event ID a second time SHALL produce no side effects — no duplicate Social_Booking_Session
 * creation, no duplicate adapter responses, and no duplicate state transitions.
 *
 * Feature: social-commerce-guest-booking, Property 3: Event Idempotency
 * Validates: Requirements 3.9
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import crypto from 'crypto';

// ─── Hoisted: set env + create in-memory KV store ───────────────────────────

const TEST_APP_SECRET = 'test_meta_app_secret_for_property_testing';

const { kvStore, mockGet, mockSet } = vi.hoisted(() => {
  // Set env var in hoisted block so it's available when route module loads
  process.env.META_APP_SECRET = 'test_meta_app_secret_for_property_testing';

  const kvStore = new Map<string, { value: string | number; expiresAt?: number }>();

  function isExpired(key: string): boolean {
    const entry = kvStore.get(key);
    if (!entry) return true;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      kvStore.delete(key);
      return true;
    }
    return false;
  }

  const mockGet = vi.fn(async (key: string) => {
    if (isExpired(key)) return null;
    const entry = kvStore.get(key);
    return entry?.value ?? null;
  });

  const mockSet = vi.fn(
    async (key: string, value: string | number, options?: { ex?: number }) => {
      let expiresAt: number | undefined;
      if (options?.ex) expiresAt = Date.now() + options.ex * 1000;
      kvStore.set(key, { value, expiresAt });
      return 'OK';
    }
  );

  return { kvStore, mockGet, mockSet };
});

// ─── Mock @vercel/kv ─────────────────────────────────────────────────────────

vi.mock('@vercel/kv', () => ({
  kv: {
    get: mockGet,
    set: mockSet,
  },
}));

// ─── Import handler after mock setup ─────────────────────────────────────────

import { POST } from '@/app/api/webhooks/meta/route';

// ─── Helper: create a valid signed request ───────────────────────────────────

function computeSignature(body: string, secret: string): string {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(body, 'utf8').digest('hex');
}

function createSignedRequest(payload: object): Request {
  const body = JSON.stringify(payload);
  const signature = computeSignature(body, TEST_APP_SECRET);

  return new Request('http://localhost/api/webhooks/meta', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-hub-signature-256': signature,
      'x-forwarded-for': '127.0.0.1',
    },
    body,
  });
}

// ─── Generators ──────────────────────────────────────────────────────────────

/**
 * Generates a valid Meta webhook payload with a unique entry ID and
 * a recent timestamp (within 5 minutes of now) to pass replay protection.
 */
function arbValidWebhookPayload() {
  const nowMs = Date.now();
  return fc.record({
    object: fc.constantFrom('whatsapp_business_account', 'instagram', 'page'),
    entry: fc.tuple(
      fc.record({
        id: fc.stringMatching(/^[a-z0-9]{10,20}$/),
        time: fc.integer({ min: nowMs - 60_000, max: nowMs + 60_000 }), // within ±1 minute
        changes: fc.constant([
          {
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '447700000000',
                phone_number_id: '123456789012345',
              },
              messages: [
                {
                  from: '447700000001',
                  id: 'wamid_unique_msg_001',
                  timestamp: String(Math.floor(nowMs / 1000)),
                  text: { body: 'Book' },
                  type: 'text',
                },
              ],
            },
            field: 'messages',
          },
        ]),
        messaging: fc.constant([
          {
            sender: { id: '123456789' },
            recipient: { id: '987654321' },
            timestamp: Math.floor(nowMs / 1000),
            message: { mid: 'mid_unique_001', text: 'Book' },
          },
        ]),
      })
    ).map(([entry]) => [entry]),
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Property 3: Event Idempotency', () => {
  beforeEach(() => {
    kvStore.clear();
    vi.clearAllMocks();
  });

  it('processing the same event ID twice stores the event ID in KV on first call and skips processing on second call (no duplicate KV writes)', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbValidWebhookPayload(),
        async (payload) => {
          // Clear state for each iteration
          kvStore.clear();
          mockGet.mockClear();
          mockSet.mockClear();

          // ── First call: should process the event and store in KV ──
          const req1 = createSignedRequest(payload);
          const res1 = await POST(req1);

          expect(res1.status).toBe(200);

          // The event ID should now be stored in KV
          // Extract what the handler uses as event ID
          const entryId = payload.entry[0].id;
          // The handler builds event ID from entry[0].id + messaging/changes sub-IDs
          // We just need to verify that kv.set was called once
          const setCallsAfterFirst = mockSet.mock.calls.length;
          expect(setCallsAfterFirst).toBe(1);

          // Verify the key pattern is meta_event:<eventId>
          const setKey = mockSet.mock.calls[0][0] as string;
          expect(setKey).toMatch(/^meta_event:/);
          expect(setKey).toContain(entryId);

          // Verify the value is 1 and TTL is 86400 (24 hours)
          expect(mockSet.mock.calls[0][1]).toBe(1);
          expect(mockSet.mock.calls[0][2]).toEqual({ ex: 86400 });

          // ── Second call: same payload, should be deduplicated ──
          const req2 = createSignedRequest(payload);
          const res2 = await POST(req2);

          expect(res2.status).toBe(200);

          // kv.set should NOT have been called again (no duplicate store)
          const setCallsAfterSecond = mockSet.mock.calls.length;
          expect(setCallsAfterSecond).toBe(1); // Still just the one call from first request

          // kv.get should have been called to check dedup on both calls
          // Second call's kv.get returned a non-null value, so handler skipped processing
          const getCallsTotal = mockGet.mock.calls.length;
          expect(getCallsTotal).toBe(2); // Once per POST call
        }
      ),
      { numRuns: 20 }
    );
  });

  it('for any valid event processed twice, the second call returns 200 without invoking adapter routing logic', async () => {
    // Use console.log spy to verify that the second call does NOT log the
    // "[meta-webhook] Received <channel> event" message (which indicates processing)
    const consoleSpy = vi.spyOn(console, 'log');

    await fc.assert(
      fc.asyncProperty(
        arbValidWebhookPayload(),
        async (payload) => {
          kvStore.clear();
          mockGet.mockClear();
          mockSet.mockClear();
          consoleSpy.mockClear();

          // First call: processes the event (logs routing)
          const req1 = createSignedRequest(payload);
          await POST(req1);

          // Count how many routing logs were produced on first call
          const logsAfterFirst = consoleSpy.mock.calls.filter(
            (call) => typeof call[0] === 'string' && call[0].includes('[meta-webhook] Received')
          ).length;
          expect(logsAfterFirst).toBe(1);

          // Second call: should be idempotent (no additional routing log)
          const req2 = createSignedRequest(payload);
          const res2 = await POST(req2);

          expect(res2.status).toBe(200);

          const logsAfterSecond = consoleSpy.mock.calls.filter(
            (call) => typeof call[0] === 'string' && call[0].includes('[meta-webhook] Received')
          ).length;
          // Still just 1 routing log — second call was skipped
          expect(logsAfterSecond).toBe(1);
        }
      ),
      { numRuns: 20 }
    );

    consoleSpy.mockRestore();
  });
});
