/**
 * Feature: social-commerce-guest-booking, Property 1: Webhook Signature Verification
 *
 * For any HTTP request body and X-Hub-Signature-256 header value, the Meta webhook
 * handler SHALL accept the request if and only if the header equals
 * `sha256=HMAC-SHA256(body, META_APP_SECRET)`, and SHALL reject with HTTP 403
 * otherwise (including when the header is missing).
 *
 * Validates: Requirements 3.2, 3.3, 3.4, 11.1
 */

import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import crypto from 'crypto';

// ─── Test constants ──────────────────────────────────────────────────────────

const TEST_APP_SECRET = 'test_meta_app_secret_for_property_tests';

// ─── Mock @vercel/kv (used by route for idempotency) ─────────────────────────

const mockKvGet = vi.fn().mockResolvedValue(null);
const mockKvSet = vi.fn().mockResolvedValue('OK');

vi.mock('@vercel/kv', () => ({
  kv: {
    get: mockKvGet,
    set: mockKvSet,
  },
}));

// ─── Route handler reference (loaded dynamically after env is set) ───────────

let POST: (req: Request) => Promise<Response>;

beforeAll(async () => {
  // Set env var before dynamic import so route captures it at module scope
  process.env.META_APP_SECRET = TEST_APP_SECRET;

  // Force fresh module load
  vi.resetModules();

  // Re-mock @vercel/kv after resetModules
  vi.doMock('@vercel/kv', () => ({
    kv: {
      get: mockKvGet,
      set: mockKvSet,
    },
  }));

  const routeModule = await import('@/app/api/webhooks/meta/route');
  POST = routeModule.POST;
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Compute the correct HMAC-SHA256 signature for a given body and secret.
 * Returns the full header value: `sha256=<hex_digest>`
 */
function computeSignature(body: string, secret: string): string {
  const hmac = crypto.createHmac('sha256', secret).update(body, 'utf8').digest('hex');
  return `sha256=${hmac}`;
}

/**
 * Create a minimal valid Meta webhook payload body string.
 * Includes the entry.time field set to "now" to pass replay protection.
 */
function makeValidPayloadBody(rawContent: string): string {
  const payload = {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'entry_test_' + crypto.randomUUID(),
        time: Date.now(),
        changes: [
          {
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '447700000000', phone_number_id: '12345' },
              messages: [
                {
                  from: '447700000001',
                  id: 'wamid_' + crypto.randomUUID(),
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  text: { body: rawContent },
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
  return JSON.stringify(payload);
}

/**
 * Create a Request object with the given body and optional signature header.
 */
function makeRequest(body: string, signatureHeader?: string): Request {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };
  if (signatureHeader !== undefined) {
    headers['x-hub-signature-256'] = signatureHeader;
  }
  return new Request('http://localhost:3000/api/webhooks/meta', {
    method: 'POST',
    headers,
    body,
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Property 1: Webhook Signature Verification', () => {
  beforeEach(() => {
    mockKvGet.mockResolvedValue(null);
    mockKvSet.mockResolvedValue('OK');
  });

  it('accepts any request with a correct HMAC-SHA256 signature (returns 200)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 200 }),
        async (rawContent) => {
          const body = makeValidPayloadBody(rawContent);
          const signature = computeSignature(body, TEST_APP_SECRET);
          const req = makeRequest(body, signature);

          const response = await POST(req);

          expect(response.status).toBe(200);
        }
      ),
      { numRuns: 20 }
    );
  });

  it('rejects any request with an incorrect signature (wrong key) with 403', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 200 }),
        fc.string({ minLength: 1, maxLength: 64 }).filter((s) => s !== TEST_APP_SECRET),
        async (rawContent, wrongSecret) => {
          const body = makeValidPayloadBody(rawContent);
          const wrongSignature = computeSignature(body, wrongSecret);
          const req = makeRequest(body, wrongSignature);

          const response = await POST(req);

          expect(response.status).toBe(403);
        }
      ),
      { numRuns: 20 }
    );
  });

  it('rejects any request with a tampered body (body changed after signing) with 403', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 200 }),
        fc.string({ minLength: 1, maxLength: 200 }),
        async (rawContent, tamperedContent) => {
          const originalBody = makeValidPayloadBody(rawContent);
          const signature = computeSignature(originalBody, TEST_APP_SECRET);

          // Build a different body (append marker to ensure difference)
          const tamperedBody = makeValidPayloadBody(tamperedContent + '_tampered');
          // Only assert if bodies are actually different
          if (originalBody === tamperedBody) return;

          const req = makeRequest(tamperedBody, signature);

          const response = await POST(req);

          expect(response.status).toBe(403);
        }
      ),
      { numRuns: 20 }
    );
  });

  it('rejects any request when X-Hub-Signature-256 header is missing with 403', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 200 }),
        async (rawContent) => {
          const body = makeValidPayloadBody(rawContent);
          const req = makeRequest(body, undefined);

          const response = await POST(req);

          expect(response.status).toBe(403);
        }
      ),
      { numRuns: 20 }
    );
  });
});
