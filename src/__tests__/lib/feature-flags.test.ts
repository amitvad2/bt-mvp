import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isGuestCheckoutEnabled } from '@/lib/feature-flags';

describe('isGuestCheckoutEnabled', () => {
  const originalEnv = process.env.NEXT_PUBLIC_GUEST_CHECKOUT_ENABLED;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.NEXT_PUBLIC_GUEST_CHECKOUT_ENABLED;
    } else {
      process.env.NEXT_PUBLIC_GUEST_CHECKOUT_ENABLED = originalEnv;
    }
  });

  it('returns true when env var is exactly "true"', () => {
    process.env.NEXT_PUBLIC_GUEST_CHECKOUT_ENABLED = 'true';
    expect(isGuestCheckoutEnabled()).toBe(true);
  });

  it('returns false when env var is "false"', () => {
    process.env.NEXT_PUBLIC_GUEST_CHECKOUT_ENABLED = 'false';
    expect(isGuestCheckoutEnabled()).toBe(false);
  });

  it('returns false when env var is undefined', () => {
    delete process.env.NEXT_PUBLIC_GUEST_CHECKOUT_ENABLED;
    expect(isGuestCheckoutEnabled()).toBe(false);
  });

  it('returns false when env var is empty string', () => {
    process.env.NEXT_PUBLIC_GUEST_CHECKOUT_ENABLED = '';
    expect(isGuestCheckoutEnabled()).toBe(false);
  });

  it('returns false when env var is "TRUE" (case-sensitive)', () => {
    process.env.NEXT_PUBLIC_GUEST_CHECKOUT_ENABLED = 'TRUE';
    expect(isGuestCheckoutEnabled()).toBe(false);
  });

  it('returns false when env var is "1"', () => {
    process.env.NEXT_PUBLIC_GUEST_CHECKOUT_ENABLED = '1';
    expect(isGuestCheckoutEnabled()).toBe(false);
  });

  it('returns false when env var is "yes"', () => {
    process.env.NEXT_PUBLIC_GUEST_CHECKOUT_ENABLED = 'yes';
    expect(isGuestCheckoutEnabled()).toBe(false);
  });
});
