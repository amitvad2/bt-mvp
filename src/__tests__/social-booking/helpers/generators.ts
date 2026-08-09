/**
 * Fast-check arbitraries for Social Commerce Guest Booking domain types.
 *
 * These generators produce valid and edge-case instances for property-based tests.
 */
import * as fc from 'fast-check';
import type {
  SocialChannel,
  SocialBookingState,
  SocialBookingSession,
  CampaignAttribution,
  SessionSummary,
  BookingConfirmation,
  TokenValidationResult,
  ParsedSocialEvent,
  BookingSource,
} from '@/types';

// ─── Primitives ──────────────────────────────────────────────────────────────

/** One of whatsapp | instagram | messenger */
export const arbSocialChannel: fc.Arbitrary<SocialChannel> = fc.constantFrom(
  'whatsapp',
  'instagram',
  'messenger'
);

/** All valid booking sources */
export const arbBookingSource: fc.Arbitrary<BookingSource> = fc.constantFrom(
  'website',
  'website_express',
  'whatsapp_express',
  'facebook_express',
  'instagram_express',
  'qr_express',
  'google_express',
  'unknown'
);

/** Valid social booking states */
export const arbSocialBookingState: fc.Arbitrary<SocialBookingState> = fc.constantFrom(
  'started',
  'selecting-session',
  'checkout-created',
  'payment-pending',
  'confirmed',
  'expired'
);

// ─── Token ───────────────────────────────────────────────────────────────────

/** URL-safe base64 character set */
const URL_SAFE_BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';

/**
 * Generates a 43-character URL-safe base64 string (matches token format).
 * Tokens are 32 random bytes encoded as URL-safe base64 without padding = 43 chars.
 */
export const arbToken: fc.Arbitrary<string> = fc
  .array(
    fc.integer({ min: 0, max: URL_SAFE_BASE64_CHARS.length - 1 }),
    { minLength: 43, maxLength: 43 }
  )
  .map((indices) => indices.map((i) => URL_SAFE_BASE64_CHARS[i]).join(''));

/** Generates an invalid token (wrong length or invalid characters) */
export const arbInvalidToken: fc.Arbitrary<string> = fc.oneof(
  // Too short
  fc.string({ unit: fc.constantFrom(...URL_SAFE_BASE64_CHARS.split('')), minLength: 1, maxLength: 42 }),
  // Too long
  fc.string({ unit: fc.constantFrom(...URL_SAFE_BASE64_CHARS.split('')), minLength: 44, maxLength: 80 }),
  // Invalid characters
  fc.string({ minLength: 43, maxLength: 43 }).filter((s) => /[^A-Za-z0-9_-]/.test(s))
);

// ─── UTM Parameters ──────────────────────────────────────────────────────────

/** Characters allowed in UTM parameters: [A-Za-z0-9._-] */
const UTM_VALID_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._-';

/** Valid UTM parameter value (1–128 chars, allowed charset) */
export const arbValidUtmValue: fc.Arbitrary<string> = fc.string({
  unit: fc.constantFrom(...UTM_VALID_CHARS.split('')),
  minLength: 1,
  maxLength: 128,
});

/** Invalid UTM parameter value (exceeds 128 chars or contains disallowed chars) */
export const arbInvalidUtmValue: fc.Arbitrary<string> = fc.oneof(
  // Too long
  fc.string({ unit: fc.constantFrom(...UTM_VALID_CHARS.split('')), minLength: 129, maxLength: 200 }),
  // Contains disallowed characters
  fc.string({ minLength: 1, maxLength: 128 }).filter((s) => /[^A-Za-z0-9._-]/.test(s))
);

/** Full UTM params object with optional fields (some valid, some null) */
export const arbUtmParams: fc.Arbitrary<{ utm_source?: string; utm_medium?: string; utm_campaign?: string }> = fc.record({
  utm_source: fc.option(arbValidUtmValue, { nil: undefined }),
  utm_medium: fc.option(arbValidUtmValue, { nil: undefined }),
  utm_campaign: fc.option(arbValidUtmValue, { nil: undefined }),
});

// ─── Campaign Attribution ────────────────────────────────────────────────────

export const arbCampaignAttribution: fc.Arbitrary<CampaignAttribution> = fc.record({
  source: fc.option(arbValidUtmValue, { nil: null }),
  medium: fc.option(arbValidUtmValue, { nil: null }),
  campaign: fc.option(arbValidUtmValue, { nil: null }),
});

export const arbCampaignAttributionOrNull: fc.Arbitrary<CampaignAttribution | null> = fc.option(
  arbCampaignAttribution,
  { nil: null }
);

// ─── Social Booking Session ──────────────────────────────────────────────────

/** Generates a Firestore-like timestamp (Date used for test purposes) */
const arbTimestamp = fc.date({
  min: new Date('2024-01-01'),
  max: new Date('2026-12-31'),
});

/** Generates a hex-encoded SHA-256 hash string (64 chars) */
const arbTokenHash: fc.Arbitrary<string> = fc
  .array(
    fc.integer({ min: 0, max: 15 }),
    { minLength: 64, maxLength: 64 }
  )
  .map((nibbles) => nibbles.map((n) => n.toString(16)).join(''));

/** Full SocialBookingSession document */
export const arbSocialBookingSession: fc.Arbitrary<SocialBookingSession> = fc.record({
  id: fc.uuid(),
  channel: arbSocialChannel,
  externalConversationId: fc.string({ minLength: 10, maxLength: 30 }),
  externalUserId: fc.string({ minLength: 10, maxLength: 30 }),
  state: arbSocialBookingState,
  sessionId: fc.option(fc.uuid(), { nil: null }),
  checkoutTokenHash: fc.option(arbTokenHash, { nil: null }),
  tokenConsumed: fc.boolean(),
  tokenExpiresAt: fc.option(arbTimestamp, { nil: null }),
  source: arbBookingSource,
  campaign: arbCampaignAttributionOrNull,
  socialBookingSessionId: fc.uuid(),
  createdAt: arbTimestamp,
  expiresAt: arbTimestamp,
  updatedAt: arbTimestamp,
});

// ─── Session Summary ─────────────────────────────────────────────────────────

const arbFormattedDate: fc.Arbitrary<string> = fc.constantFrom(
  'Mon 14 Jul', 'Tue 15 Jul', 'Wed 16 Jul', 'Thu 17 Jul',
  'Fri 18 Jul', 'Sat 19 Jul', 'Sun 20 Jul',
  'Sat 26 Jul', 'Sun 27 Jul', 'Mon 28 Jul'
);

const arbFormattedTime: fc.Arbitrary<string> = fc.constantFrom(
  '10:30', '11:00', '14:00', '15:30', '16:00', '09:00', '13:00'
);

const arbFormattedPrice: fc.Arbitrary<string> = fc
  .integer({ min: 500, max: 10000 })
  .map((pence) => `£${(pence / 100).toFixed(2)}`);

const arbAgeRange: fc.Arbitrary<string> = fc.constantFrom(
  '5–12', '8–14', '16–25', '18+'
);

export const arbSessionSummary: fc.Arbitrary<SessionSummary> = fc.record({
  sessionId: fc.uuid(),
  className: fc.constantFrom(
    'Kids After School Cooking',
    'Weekend Young Adult Cooking',
    'Summer Holiday Baking',
    'Italian Pasta Making',
    'Healthy Meals Workshop'
  ),
  date: arbFormattedDate,
  startTime: arbFormattedTime,
  venueName: fc.constantFrom(
    'Blooming Kitchen HQ',
    'St Mary\'s Community Centre',
    'The Old Hall',
    'Riverside Studio'
  ),
  ageRange: arbAgeRange,
  spotsAvailable: fc.integer({ min: 1, max: 20 }),
  price: arbFormattedPrice,
});

// ─── Booking Confirmation ────────────────────────────────────────────────────

export const arbBookingConfirmation: fc.Arbitrary<BookingConfirmation> = fc.record({
  className: fc.constantFrom(
    'Kids After School Cooking',
    'Weekend Young Adult Cooking',
    'Summer Holiday Baking'
  ),
  date: arbFormattedDate,
  startTime: arbFormattedTime,
  venueName: fc.constantFrom(
    'Blooming Kitchen HQ',
    'St Mary\'s Community Centre',
    'The Old Hall'
  ),
  bookingRef: fc.string({
    unit: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')),
    minLength: 8,
    maxLength: 8,
  }),
});

// ─── Webhook Payloads ────────────────────────────────────────────────────────

/** WhatsApp webhook payload structure */
export const arbWhatsAppWebhookPayload = fc.record({
  object: fc.constant('whatsapp_business_account'),
  entry: fc.array(
    fc.record({
      id: fc.string({ minLength: 10, maxLength: 20 }),
      changes: fc.array(
        fc.record({
          value: fc.record({
            messaging_product: fc.constant('whatsapp'),
            metadata: fc.record({
              display_phone_number: fc.string({ minLength: 10, maxLength: 15 }),
              phone_number_id: fc.string({ minLength: 10, maxLength: 20 }),
            }),
            messages: fc.array(
              fc.record({
                from: fc.string({ minLength: 10, maxLength: 15 }),
                id: fc.string({ minLength: 20, maxLength: 40 }),
                timestamp: fc.integer({ min: 1700000000, max: 1800000000 }).map(String),
                text: fc.record({ body: fc.constantFrom('Book', 'Classes', 'Hi', 'Hello', 'Help') }),
                type: fc.constant('text'),
              }),
              { minLength: 1, maxLength: 1 }
            ),
          }),
          field: fc.constant('messages'),
        }),
        { minLength: 1, maxLength: 1 }
      ),
    }),
    { minLength: 1, maxLength: 1 }
  ),
});

/** Instagram webhook payload structure */
export const arbInstagramWebhookPayload = fc.record({
  object: fc.constant('instagram'),
  entry: fc.array(
    fc.record({
      id: fc.string({ minLength: 10, maxLength: 20 }),
      time: fc.integer({ min: 1700000000, max: 1800000000 }),
      messaging: fc.array(
        fc.record({
          sender: fc.record({ id: fc.string({ minLength: 10, maxLength: 20 }) }),
          recipient: fc.record({ id: fc.string({ minLength: 10, maxLength: 20 }) }),
          timestamp: fc.integer({ min: 1700000000, max: 1800000000 }),
          message: fc.record({
            mid: fc.string({ minLength: 20, maxLength: 40 }),
            text: fc.constantFrom('Book', 'Classes', 'Hi', 'Hello', 'Help'),
          }),
        }),
        { minLength: 1, maxLength: 1 }
      ),
    }),
    { minLength: 1, maxLength: 1 }
  ),
});

/** Messenger webhook payload structure */
export const arbMessengerWebhookPayload = fc.record({
  object: fc.constant('page'),
  entry: fc.array(
    fc.record({
      id: fc.string({ minLength: 10, maxLength: 20 }),
      time: fc.integer({ min: 1700000000, max: 1800000000 }),
      messaging: fc.array(
        fc.record({
          sender: fc.record({ id: fc.string({ minLength: 10, maxLength: 20 }) }),
          recipient: fc.record({ id: fc.string({ minLength: 10, maxLength: 20 }) }),
          timestamp: fc.integer({ min: 1700000000, max: 1800000000 }),
          message: fc.record({
            mid: fc.string({ minLength: 20, maxLength: 40 }),
            text: fc.constantFrom('Book', 'Classes', 'Hi', 'Hello', 'Help'),
          }),
        }),
        { minLength: 1, maxLength: 1 }
      ),
    }),
    { minLength: 1, maxLength: 1 }
  ),
});

/** Any webhook payload (randomly picks a channel) */
export const arbWebhookPayload = fc.oneof(
  arbWhatsAppWebhookPayload,
  arbInstagramWebhookPayload,
  arbMessengerWebhookPayload
);

// ─── Parsed Social Events ────────────────────────────────────────────────────

export const arbParsedTriggerEvent: fc.Arbitrary<ParsedSocialEvent> = fc.record({
  type: fc.constant('trigger' as const),
  channel: arbSocialChannel,
  senderId: fc.string({ minLength: 10, maxLength: 20 }),
  conversationId: fc.string({ minLength: 10, maxLength: 20 }),
  text: fc.constantFrom('Book', 'Classes', 'Hi', 'book', 'classes', 'hi'),
});

export const arbParsedSelectionEvent: fc.Arbitrary<ParsedSocialEvent> = fc.record({
  type: fc.constant('session_selection' as const),
  channel: arbSocialChannel,
  senderId: fc.string({ minLength: 10, maxLength: 20 }),
  conversationId: fc.string({ minLength: 10, maxLength: 20 }),
  selectedSessionId: fc.uuid(),
});

export const arbParsedUnknownEvent: fc.Arbitrary<ParsedSocialEvent> = fc.record({
  type: fc.constant('unknown' as const),
  channel: arbSocialChannel,
  senderId: fc.string({ minLength: 10, maxLength: 20 }),
  conversationId: fc.string({ minLength: 10, maxLength: 20 }),
  text: fc.string({ minLength: 1, maxLength: 100 }),
});

export const arbParsedSocialEvent: fc.Arbitrary<ParsedSocialEvent> = fc.oneof(
  arbParsedTriggerEvent,
  arbParsedSelectionEvent,
  arbParsedUnknownEvent
);

// ─── Token Validation Results ────────────────────────────────────────────────

export const arbValidTokenResult: fc.Arbitrary<TokenValidationResult> = fc.record({
  valid: fc.constant(true as const),
  sessionId: fc.uuid(),
  channel: arbSocialChannel,
  campaign: arbCampaignAttributionOrNull,
  socialBookingSessionId: fc.uuid(),
});

export const arbInvalidTokenResult: fc.Arbitrary<TokenValidationResult> = fc.record({
  valid: fc.constant(false as const),
  reason: fc.constantFrom('expired', 'consumed', 'invalid', 'session_unavailable'),
});

export const arbTokenValidationResult: fc.Arbitrary<TokenValidationResult> = fc.oneof(
  arbValidTokenResult,
  arbInvalidTokenResult
);
