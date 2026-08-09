import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Store original env
const originalEnv = process.env;

describe('Meta Webhook GET Verification Challenge', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv, META_WEBHOOK_VERIFY_TOKEN: 'my_secret_verify_token' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  async function importGET() {
    const mod = await import('@/app/api/webhooks/meta/route');
    return mod.GET;
  }

  function createRequest(params: Record<string, string>): Request {
    const url = new URL('https://example.com/api/webhooks/meta');
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    return new Request(url.toString(), { method: 'GET' });
  }

  it('returns hub.challenge with 200 when mode is subscribe and token matches', async () => {
    const GET = await importGET();
    const req = createRequest({
      'hub.mode': 'subscribe',
      'hub.verify_token': 'my_secret_verify_token',
      'hub.challenge': 'challenge_string_123',
    });

    const response = await GET(req);

    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toBe('challenge_string_123');
  });

  it('returns 403 when verify_token does not match', async () => {
    const GET = await importGET();
    const req = createRequest({
      'hub.mode': 'subscribe',
      'hub.verify_token': 'wrong_token',
      'hub.challenge': 'challenge_string_123',
    });

    const response = await GET(req);

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body).toEqual({ error: 'Forbidden' });
  });

  it('returns 403 when hub.mode is not subscribe', async () => {
    const GET = await importGET();
    const req = createRequest({
      'hub.mode': 'unsubscribe',
      'hub.verify_token': 'my_secret_verify_token',
      'hub.challenge': 'challenge_string_123',
    });

    const response = await GET(req);

    expect(response.status).toBe(403);
  });

  it('returns 403 when hub.mode is missing', async () => {
    const GET = await importGET();
    const req = createRequest({
      'hub.verify_token': 'my_secret_verify_token',
      'hub.challenge': 'challenge_string_123',
    });

    const response = await GET(req);

    expect(response.status).toBe(403);
  });

  it('returns 403 when hub.verify_token is missing', async () => {
    const GET = await importGET();
    const req = createRequest({
      'hub.mode': 'subscribe',
      'hub.challenge': 'challenge_string_123',
    });

    const response = await GET(req);

    expect(response.status).toBe(403);
  });

  it('returns 200 with null body when hub.challenge is missing but mode and token valid', async () => {
    const GET = await importGET();
    const req = createRequest({
      'hub.mode': 'subscribe',
      'hub.verify_token': 'my_secret_verify_token',
    });

    const response = await GET(req);

    // hub.challenge is null, but mode and token match — Meta spec says echo the challenge
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toBe('');
  });
});
