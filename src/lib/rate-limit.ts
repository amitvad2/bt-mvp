import { kv } from '@vercel/kv';

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number; // Unix timestamp
}

export async function checkRateLimit(
  identifier: string,
  limit: number = 5,
  windowSeconds: number = 60
): Promise<RateLimitResult> {
  const key = `rate_limit:guest_intent:${identifier}`;
  const now = Math.floor(Date.now() / 1000);

  const count = await kv.incr(key);

  // Set expiry on first request in window
  if (count === 1) {
    await kv.expire(key, windowSeconds);
  }

  const ttl = await kv.ttl(key);
  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
    resetAt: now + (ttl > 0 ? ttl : windowSeconds),
  };
}
