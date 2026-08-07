/**
 * Cloudflare Turnstile client-side type declarations.
 * No official @cloudflare/turnstile types package exists — these are inline declarations
 * based on the Turnstile client-side API documentation.
 * @see https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/
 */

declare global {
  interface Window {
    turnstile?: TurnstileObject;
  }
}

export interface TurnstileObject {
  render: (
    container: string | HTMLElement,
    options: TurnstileRenderOptions
  ) => string; // returns widget ID
  reset: (widgetId?: string) => void;
  remove: (widgetId?: string) => void;
  getResponse: (widgetId?: string) => string | undefined;
  isExpired: (widgetId?: string) => boolean;
}

export interface TurnstileRenderOptions {
  sitekey: string;
  callback?: (token: string) => void;
  'error-callback'?: (error?: unknown) => void;
  'expired-callback'?: () => void;
  'timeout-callback'?: () => void;
  'before-interactive-callback'?: () => void;
  'after-interactive-callback'?: () => void;
  'unsupported-callback'?: () => void;
  theme?: 'light' | 'dark' | 'auto';
  language?: string;
  tabindex?: number;
  action?: string;
  cData?: string;
  size?: 'normal' | 'compact' | 'invisible' | 'flexible';
  appearance?: 'always' | 'execute' | 'interaction-only';
  'response-field'?: boolean;
  'response-field-name'?: string;
  retry?: 'auto' | 'never';
  'retry-interval'?: number;
  'refresh-expired'?: 'auto' | 'manual' | 'never';
  'refresh-timeout'?: 'auto' | 'manual' | 'never';
  execution?: 'render' | 'execute';
}

/** Props for a React Turnstile widget component */
export interface TurnstileWidgetProps {
  siteKey: string;
  onVerify: (token: string) => void;
  onError?: (error?: unknown) => void;
  onExpire?: () => void;
  onTimeout?: () => void;
  size?: 'normal' | 'compact' | 'invisible' | 'flexible';
  theme?: 'light' | 'dark' | 'auto';
  action?: string;
  className?: string;
}

/** Server-side verification response from Cloudflare Turnstile siteverify endpoint */
export interface TurnstileVerifyResponse {
  success: boolean;
  'error-codes': string[];
  challenge_ts?: string;
  hostname?: string;
  action?: string;
  cdata?: string;
}
