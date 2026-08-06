import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { verifyTurnstileToken } from '@/lib/turnstile';

describe('verifyTurnstileToken', () => {
  const originalEnv = process.env.TURNSTILE_SECRET_KEY;

  beforeEach(() => {
    process.env.TURNSTILE_SECRET_KEY = 'test-secret-key';
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalEnv === undefined) {
      delete process.env.TURNSTILE_SECRET_KEY;
    } else {
      process.env.TURNSTILE_SECRET_KEY = originalEnv;
    }
  });

  it('returns true when Turnstile verification succeeds', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      json: () => Promise.resolve({ success: true }),
    });

    const result = await verifyTurnstileToken('valid-token');
    expect(result).toBe(true);
  });

  it('returns false when Turnstile verification fails', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      json: () => Promise.resolve({ success: false, 'error-codes': ['invalid-input-response'] }),
    });

    const result = await verifyTurnstileToken('invalid-token');
    expect(result).toBe(false);
  });

  it('posts to the correct Turnstile verification URL', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      json: () => Promise.resolve({ success: true }),
    });

    await verifyTurnstileToken('test-token');

    expect(fetch).toHaveBeenCalledWith(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
    );
  });

  it('sends the secret key and token in the request body', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      json: () => Promise.resolve({ success: true }),
    });

    await verifyTurnstileToken('my-token');

    const callArgs = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(callArgs[1].body);
    expect(body.secret).toBe('test-secret-key');
    expect(body.response).toBe('my-token');
  });

  it('includes remoteip when ip parameter is provided', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      json: () => Promise.resolve({ success: true }),
    });

    await verifyTurnstileToken('my-token', '192.168.1.1');

    const callArgs = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(callArgs[1].body);
    expect(body.remoteip).toBe('192.168.1.1');
  });

  it('omits remoteip when ip parameter is not provided', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      json: () => Promise.resolve({ success: true }),
    });

    await verifyTurnstileToken('my-token');

    const callArgs = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(callArgs[1].body);
    expect(body).not.toHaveProperty('remoteip');
  });

  it('returns false when TURNSTILE_SECRET_KEY is not set', async () => {
    delete process.env.TURNSTILE_SECRET_KEY;

    const result = await verifyTurnstileToken('some-token');
    expect(result).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns false when fetch throws a network error', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Network error'));

    const result = await verifyTurnstileToken('some-token');
    expect(result).toBe(false);
  });

  it('returns false when response data does not have success field', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      json: () => Promise.resolve({}),
    });

    const result = await verifyTurnstileToken('some-token');
    expect(result).toBe(false);
  });
});
