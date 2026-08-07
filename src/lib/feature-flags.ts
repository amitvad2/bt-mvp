/**
 * Feature flag utilities for controlling feature availability.
 */

/**
 * Returns true only when the NEXT_PUBLIC_GUEST_CHECKOUT_ENABLED
 * environment variable is exactly the string 'true'.
 */
export function isGuestCheckoutEnabled(): boolean {
  return process.env.NEXT_PUBLIC_GUEST_CHECKOUT_ENABLED === 'true';
}
