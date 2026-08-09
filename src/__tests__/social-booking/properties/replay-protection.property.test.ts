/**
 * Feature: social-commerce-guest-booking, Property 4: Replay Protection
 *
 * For any webhook event whose entry-level timestamp is older than 5 minutes
 * relative to the server's current time, the Meta webhook handler SHALL reject
 * the event with HTTP 403.
 *
 * Validates: Requirements 11.6
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import crypto from 'crypto';

// ─── Constants ───────────────────────────────────────────────────────────────

const MAX_EVENT_AGE_MS = 5 * 60 * 1000; // 5 minutes in milliseconds
const TEST_META_APP_SECRET = 'test-meta-app-secret-for-property-testing';

// ─── Hoisted setup: env + in-memory KV store ─────────────────────────────────

const { kvStore, mockGet, mockSet } = vi.hoisted(() => {
  // Set env var in hoisted block so it's available when the route module loads
  process.env.META_APP_SECRET = 'test-meta-app-secret-for-property-testing';

  const kvStore = new Map<string, unknown>();

  const mockGet = vi.fn(async (key: string) => {
    return kvStore.get(key) ?? null;
  });

  const mockSet = vi.fn(async (key: string, value: unknown, _options?: { ex?: number }) => {
    kvStore.set(key, value);
    return 'OK';
  });

  return { kvStore, mockGet, mockSet };
});

// ─── Mock @vercel/kv ─────────────────────────────────────────────────────────

vi.mock('@vercel/kv', () => ({
  kv: {
    get: mockGet,
    set: mockSet,
  },
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Compute a valid HMAC-SHA256 signature for the given body using the test secret.
 */
function computeValidSignature(body: string): string {
  return 'sha256=' + crypto
    .createHmac('sha256', TEST_META_APP_SECRET)
    .update(body, 'utf8')
    .digest('hex');
}

/**
 * Build a Meta webhook payload with a given entry-level timestamp (in milliseconds).
 */
function buildPayload(entryTimeMs: number, channel: 'whatsapp' | 'instagram' | 'messenger'): Record<string, unknown> {
  const objectField =
    channel === 'whatsapp' ? 'whatsapp_business_account' :
    channel === 'instagram' ? 'instagram' :
    'page';

  return {
    object: objectField,
    entry: [
      {
        id: crypto.randomUUID(),
        time: entryTimeMs,
        changes: [
          {
            value: {
              messages: [{ id: crypto.randomUUID(), text: { body: 'Book' } }],
            },
          },
        ],
      },
    ],
  };
}

// ─── Import the handler AFTER mocks are set up ───────────────────────────────

import { POST } from '@/app/api/webhooks/meta/route';

describe('Property 4: Replay Protection', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    kvStore.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('events with timestamps within 5 minutes of server time are accepted (return 200)', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Offset in ms: 0 to just under 5 minutes (exclusive boundary)
        // Negative means event is in the past (but within tolerance)
        fc.integer({ min: 0, max: MAX_EVENT_AGE_MS - 1000 }),
        fc.constantFrom('whatsapp' as const, 'instagram' as const, 'messenger' as const),
        async (ageMs, channel) => {
          kvStore.clear();

          const serverNow = new Date('2025-06-15T10:00:00Z').getTime();
          vi.setSystemTime(serverNow);

          // Event timestamp is `ageMs` milliseconds in the past
          const eventTimestampMs = serverNow - ageMs;
          const payload = buildPayload(eventTimestampMs, channel);
          const body = JSON.stringify(payload);
          const signature = computeValidSignature(body);

          const request = new Request('http://localhost/api/webhooks/meta', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-hub-signature-256': signature,
            },
            body,
          });

          const response = await POST(request);
          expect(response.status).toBe(200);
        }
      ),
      { numRuns: 20 }
    );
  });

  it('events with timestamps older than 5 minutes are rejected with HTTP 403', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Age beyond 5 minutes: from 5 min + 1 second to 2 hours in the past
        fc.integer({ min: MAX_EVENT_AGE_MS + 1000, max: 2 * 60 * 60 * 1000 }),
        fc.constantFrom('whatsapp' as const, 'instagram' as const, 'messenger' as const),
        async (ageMs, channel) => {
          kvStore.clear();

          const serverNow = new Date('2025-06-15T10:00:00Z').getTime();
          vi.setSystemTime(serverNow);

          // Event timestamp is `ageMs` milliseconds in the past (> 5 min)
          const eventTimestampMs = serverNow - ageMs;
          const payload = buildPayload(eventTimestampMs, channel);
          const body = JSON.stringify(payload);
          const signature = computeValidSignature(body);

          const request = new Request('http://localhost/api/webhooks/meta', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-hub-signature-256': signature,
            },
            body,
          });

          const response = await POST(request);
          expect(response.status).toBe(403);
        }
      ),
      { numRuns: 20 }
    );
  });

  it('the boundary is exactly at 5 minutes (300 seconds): events at exactly 5 min are rejected', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('whatsapp' as const, 'instagram' as const, 'messenger' as const),
        async (channel) => {
          kvStore.clear();

          const serverNow = new Date('2025-06-15T10:00:00Z').getTime();
          vi.setSystemTime(serverNow);

          // --- Event at exactly 5 min + 1 second (301 seconds) → should be rejected ---
          const justOverBoundaryMs = serverNow - (MAX_EVENT_AGE_MS + 1000);
          const payloadOver = buildPayload(justOverBoundaryMs, channel);
          const bodyOver = JSON.stringify(payloadOver);
          const sigOver = computeValidSignature(bodyOver);

          const reqOver = new Request('http://localhost/api/webhooks/meta', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-hub-signature-256': sigOver,
            },
            body: bodyOver,
          });

          const resOver = await POST(reqOver);
          expect(resOver.status).toBe(403);

          // --- Event at exactly 4 min 59 sec (299 seconds) → should be accepted ---
          kvStore.clear();
          const justUnderBoundaryMs = serverNow - (MAX_EVENT_AGE_MS - 1000);
          const payloadUnder = buildPayload(justUnderBoundaryMs, channel);
          const bodyUnder = JSON.stringify(payloadUnder);
          const sigUnder = computeValidSignature(bodyUnder);

          const reqUnder = new Request('http://localhost/api/webhooks/meta', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-hub-signature-256': sigUnder,
            },
            body: bodyUnder,
          });

          const resUnder = await POST(reqUnder);
          expect(resUnder.status).toBe(200);
        }
      ),
      { numRuns: 20 }
    );
  });
});
