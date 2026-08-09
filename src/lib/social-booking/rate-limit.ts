/**
 * Rate limiting for social booking use cases.
 *
 * Wraps @vercel/kv to provide:
 * - Token generation rate limit: 10 tokens/hour per externalUserId
 * - Deep link resolution rate limit: 20 requests/min per IP
 * - Failed token attempt tracking: 5 failures/10min per IP → 30min IP block
 *
 * All functions return a RateLimitResult with `allowed` and optional
 * `retryAfterSeconds` for the Retry-After header.
 */
import { kv } from '@vercel/kv';

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds?: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const TOKEN_RATE_LIMIT = 10;
const TOKEN_RATE_WINDOW_SECONDS = 3600; // 1 hour

const DEEPLINK_RATE_LIMIT = 20;
const DEEPLINK_RATE_WINDOW_SECONDS = 60; // 1 minute

const FAILED_ATTEMPT_LIMIT = 5;
const FAILED_ATTEMPT_WINDOW_SECONDS = 600; // 10 minutes

const IP_BLOCK_TTL_SECONDS = 1800; // 30 minutes

// ─── Key Helpers ─────────────────────────────────────────────────────────────

function tokenRateKey(externalUserId: string): string {
  return `social_token_rate:${externalUserId}`;
}

function deepLinkRateKey(ip: string): string {
  return `social_deeplink_rate:${ip}`;
}

function tokenFailKey(ip: string): string {
  return `social_token_fail:${ip}`;
}

function ipBlockKey(ip: string): string {
  return `social_ip_block:${ip}`;
}

// ─── Rate Limit Functions ────────────────────────────────────────────────────

/**
 * Check token generation rate limit (10/hour per externalUserId).
 * Returns whether the request is allowed, and if not, how many seconds
 * until the window resets for the Retry-After header.
 */
export async function checkTokenRateLimit(externalUserId: string): Promise<RateLimitResult> {
  const key = tokenRateKey(externalUserId);

  const count = await kv.incr(key);

  // Set expiry on first request in window
  if (count === 1) {
    await kv.expire(key, TOKEN_RATE_WINDOW_SECONDS);
  }

  if (count <= TOKEN_RATE_LIMIT) {
    return { allowed: true };
  }

  // Exceeded limit — calculate Retry-After from TTL
  const ttl = await kv.ttl(key);
  const retryAfterSeconds = ttl > 0 ? ttl : TOKEN_RATE_WINDOW_SECONDS;

  return { allowed: false, retryAfterSeconds };
}

/**
 * Check deep link resolution rate limit (20/min per IP).
 * Returns whether the request is allowed, and if not, how many seconds
 * until the window resets for the Retry-After header.
 */
export async function checkDeepLinkRateLimit(ip: string): Promise<RateLimitResult> {
  const key = deepLinkRateKey(ip);

  const count = await kv.incr(key);

  // Set expiry on first request in window
  if (count === 1) {
    await kv.expire(key, DEEPLINK_RATE_WINDOW_SECONDS);
  }

  if (count <= DEEPLINK_RATE_LIMIT) {
    return { allowed: true };
  }

  // Exceeded limit — calculate Retry-After from TTL
  const ttl = await kv.ttl(key);
  const retryAfterSeconds = ttl > 0 ? ttl : DEEPLINK_RATE_WINDOW_SECONDS;

  return { allowed: false, retryAfterSeconds };
}

/**
 * Track a failed token attempt for the given IP.
 * After 5 failures within a 10-minute window, the IP is blocked for 30 minutes.
 */
export async function trackFailedTokenAttempt(ip: string): Promise<void> {
  const failKey = tokenFailKey(ip);

  const count = await kv.incr(failKey);

  // Set expiry on first failure in window
  if (count === 1) {
    await kv.expire(failKey, FAILED_ATTEMPT_WINDOW_SECONDS);
  }

  // Block IP after 5 failures
  if (count >= FAILED_ATTEMPT_LIMIT) {
    const blockKey = ipBlockKey(ip);
    await kv.set(blockKey, '1', { ex: IP_BLOCK_TTL_SECONDS });
  }
}

/**
 * Check if an IP is currently blocked due to repeated failed token attempts.
 */
export async function isIPBlocked(ip: string): Promise<boolean> {
  const blockKey = ipBlockKey(ip);
  const blocked = await kv.get(blockKey);
  return blocked !== null;
}
