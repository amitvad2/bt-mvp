/**
 * Meta Webhook Handler — single unified endpoint for WhatsApp, Instagram, and Messenger.
 *
 * POST: Receives and processes webhook events from all Meta platforms.
 *   1. Verifies X-Hub-Signature-256 using HMAC-SHA256 + META_APP_SECRET
 *   2. Rejects with 403 if signature is invalid or header is missing
 *   3. Implements replay protection (events > 5 min old rejected)
 *   4. Implements idempotent event processing via Vercel KV (24h TTL)
 *   5. Routes events to the appropriate channel adapter
 *   6. Delegates to SocialBookingService.handleInboundMessage()
 *   7. Returns 200 within 5 seconds
 *
 * GET: Handles Meta webhook verification challenge.
 *   (Stub — fully implemented in task 9.2)
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 11.1, 11.6
 */

import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { kv } from '@vercel/kv';
import type { SocialChannel } from '@/types';

// ─── Environment ─────────────────────────────────────────────────────────────

const META_APP_SECRET = process.env.META_APP_SECRET;

// ─── Constants ───────────────────────────────────────────────────────────────

/** Maximum age for webhook events (replay protection) — 5 minutes in seconds */
const MAX_EVENT_AGE_SECONDS = 300;

/** TTL for idempotency keys in Vercel KV — 24 hours */
const EVENT_DEDUP_TTL_SECONDS = 86400;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Verify Meta webhook signature using HMAC-SHA256.
 * Compares the computed signature to the X-Hub-Signature-256 header
 * using timing-safe comparison to prevent timing attacks.
 */
function verifySignature(rawBody: string, signatureHeader: string): boolean {
  if (!META_APP_SECRET) {
    console.error('[meta-webhook] META_APP_SECRET is not configured');
    return false;
  }

  const expectedSignature = 'sha256=' + crypto
    .createHmac('sha256', META_APP_SECRET)
    .update(rawBody, 'utf8')
    .digest('hex');

  // Both signatures must be the same length for timingSafeEqual
  const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
  const receivedBuffer = Buffer.from(signatureHeader, 'utf8');

  if (expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

/**
 * Determine the originating social channel from the webhook payload structure.
 * 
 * - `object === 'whatsapp_business_account'` → whatsapp
 * - `object === 'instagram'` → instagram
 * - `object === 'page'` → messenger
 * - Unrecognised → null
 */
function determineChannel(payload: Record<string, unknown>): SocialChannel | null {
  const objectField = payload.object;

  if (objectField === 'whatsapp_business_account') {
    return 'whatsapp';
  }
  if (objectField === 'instagram') {
    return 'instagram';
  }
  if (objectField === 'page') {
    return 'messenger';
  }

  return null;
}

/**
 * Extract event timestamp from the payload for replay protection.
 * Meta webhook payloads include timestamps at the entry level.
 * Returns the timestamp in seconds, or null if not found.
 */
function extractEventTimestamp(payload: Record<string, unknown>): number | null {
  // Meta webhooks include entry-level timestamps in the `entry` array
  const entry = payload.entry;
  if (!Array.isArray(entry) || entry.length === 0) {
    return null;
  }

  // Each entry has a `time` field (Unix timestamp in milliseconds)
  const firstEntry = entry[0];
  if (firstEntry && typeof firstEntry.time === 'number') {
    return Math.floor(firstEntry.time / 1000); // Convert ms to seconds
  }

  return null;
}

/**
 * Extract a unique event ID from the payload for idempotency.
 * Uses the entry ID combined with the first messaging event ID for uniqueness.
 */
function extractEventId(payload: Record<string, unknown>): string | null {
  const entry = payload.entry;
  if (!Array.isArray(entry) || entry.length === 0) {
    return null;
  }

  const firstEntry = entry[0];
  if (firstEntry && typeof firstEntry.id === 'string') {
    // Combine entry ID with messaging ID if available for more granularity
    const messaging = firstEntry.messaging || firstEntry.changes;
    if (Array.isArray(messaging) && messaging.length > 0) {
      const firstMessage = messaging[0];
      const messageId = firstMessage?.id || firstMessage?.value?.messages?.[0]?.id;
      if (messageId) {
        return `${firstEntry.id}_${messageId}`;
      }
    }
    return firstEntry.id;
  }

  return null;
}

// ─── POST Handler ────────────────────────────────────────────────────────────

export async function POST(req: Request): Promise<Response> {
  // 1. Read raw body as text
  const rawBody = await req.text();

  // 2. Check X-Hub-Signature-256 header exists → 403 if missing
  const signatureHeader = req.headers.get('x-hub-signature-256');
  if (!signatureHeader) {
    console.warn('[meta-webhook] Missing X-Hub-Signature-256 header', {
      ip: req.headers.get('x-forwarded-for') || 'unknown',
      timestamp: new Date().toISOString(),
    });
    return NextResponse.json(
      { error: 'Missing signature header' },
      { status: 403 }
    );
  }

  // 3. Compute HMAC-SHA256 of raw body with META_APP_SECRET
  // 4. Timing-safe compare with header value → 403 if mismatch
  if (!verifySignature(rawBody, signatureHeader)) {
    console.warn('[meta-webhook] Signature verification failed', {
      ip: req.headers.get('x-forwarded-for') || 'unknown',
      timestamp: new Date().toISOString(),
    });
    return NextResponse.json(
      { error: 'Invalid signature' },
      { status: 403 }
    );
  }

  // 5. Parse JSON body
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    console.error('[meta-webhook] Failed to parse JSON body');
    // Return 200 to prevent Meta retries on malformed payload
    return NextResponse.json({ status: 'ok' }, { status: 200 });
  }

  // 6. Check replay protection: extract timestamp, reject if > 5 min old
  const eventTimestamp = extractEventTimestamp(payload);
  if (eventTimestamp !== null) {
    const now = Math.floor(Date.now() / 1000);
    const age = now - eventTimestamp;

    if (age > MAX_EVENT_AGE_SECONDS) {
      console.warn('[meta-webhook] Stale event rejected (replay protection)', {
        eventTimestamp,
        age,
        ip: req.headers.get('x-forwarded-for') || 'unknown',
      });
      return NextResponse.json(
        { error: 'Event too old' },
        { status: 403 }
      );
    }
  }

  // 7. Extract event ID, check idempotency via KV
  const eventId = extractEventId(payload);
  if (eventId) {
    const dedupeKey = `meta_event:${eventId}`;
    const alreadyProcessed = await kv.get(dedupeKey);

    if (alreadyProcessed !== null) {
      // Already processed — skip silently (idempotent)
      return NextResponse.json({ status: 'ok' }, { status: 200 });
    }

    // Mark as processed with 24h TTL
    await kv.set(dedupeKey, 1, { ex: EVENT_DEDUP_TTL_SECONDS });
  }

  // 8. Determine channel from `object` field
  const channel = determineChannel(payload);

  if (!channel) {
    // Unrecognised payload structure — return 200 (prevent retries), log
    console.warn('[meta-webhook] Unrecognised payload structure', {
      object: payload.object,
      timestamp: new Date().toISOString(),
    });
    return NextResponse.json({ status: 'ok' }, { status: 200 });
  }

  // 9. Route to appropriate adapter and delegate to SocialBookingService
  // Note: Adapters will be wired in later tasks (10, 11, 12, 14).
  // For now, we log the event and acknowledge receipt.
  try {
    // TODO: Wire channel adapter parseEvent + SocialBookingService.handleInboundMessage()
    // once adapters and the core orchestration service are implemented (tasks 10-14).
    console.log(`[meta-webhook] Received ${channel} event`, {
      eventId,
      channel,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    // Log error but still return 200 to prevent Meta retries
    console.error('[meta-webhook] Error processing event', {
      channel,
      eventId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }

  // 10. Return 200 within 5 seconds
  return NextResponse.json({ status: 'ok' }, { status: 200 });
}

// ─── GET Handler (Webhook Verification Challenge) ───────────────────────────

const META_WEBHOOK_VERIFY_TOKEN = process.env.META_WEBHOOK_VERIFY_TOKEN;

/**
 * GET handler for Meta webhook verification challenge.
 * Meta sends a GET request with hub.mode, hub.verify_token, and hub.challenge
 * when subscribing a webhook. We validate mode and token, then echo the challenge.
 *
 * Requirements: 3.10, 11.7, 11.8
 */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');

  // 1. Check hub.mode === 'subscribe'
  if (mode !== 'subscribe') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // 2. Check hub.verify_token matches configured META_WEBHOOK_VERIFY_TOKEN
  if (!token || token !== META_WEBHOOK_VERIFY_TOKEN) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // 3. Return hub.challenge with 200
  return new Response(challenge ?? '', { status: 200 });
}
