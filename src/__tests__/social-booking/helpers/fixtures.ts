/**
 * Static test data for Social Commerce Guest Booking tests.
 *
 * Provides fixed, known-good instances for example-based (unit/integration) tests.
 */
import type {
  SocialBookingSession,
  SessionSummary,
  BookingConfirmation,
  CampaignAttribution,
  AcquisitionMetadata,
} from '@/types';

// ─── Social Booking Session ──────────────────────────────────────────────────

export const validSocialBookingSession: SocialBookingSession = {
  id: 'sbs_abc123def456',
  channel: 'whatsapp',
  externalConversationId: 'conv_wa_447700900123',
  externalUserId: '447700900123',
  state: 'checkout-created',
  sessionId: 'session_001',
  checkoutTokenHash: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
  tokenConsumed: false,
  tokenExpiresAt: new Date('2025-07-19T11:15:00Z'),
  source: 'whatsapp_express',
  campaign: {
    source: 'instagram-ad',
    medium: 'social',
    campaign: 'summer-cooking-2025',
  },
  socialBookingSessionId: 'sbs_abc123def456',
  createdAt: new Date('2025-07-19T10:45:00Z'),
  expiresAt: new Date('2025-07-19T11:15:00Z'),
  updatedAt: new Date('2025-07-19T11:00:00Z'),
};

export const expiredSocialBookingSession: SocialBookingSession = {
  ...validSocialBookingSession,
  id: 'sbs_expired_001',
  state: 'expired',
  tokenConsumed: false,
  tokenExpiresAt: new Date('2025-07-19T09:00:00Z'),
  expiresAt: new Date('2025-07-19T09:15:00Z'),
  socialBookingSessionId: 'sbs_expired_001',
};

export const confirmedSocialBookingSession: SocialBookingSession = {
  ...validSocialBookingSession,
  id: 'sbs_confirmed_001',
  state: 'confirmed',
  tokenConsumed: true,
  socialBookingSessionId: 'sbs_confirmed_001',
};

export const startedSocialBookingSession: SocialBookingSession = {
  ...validSocialBookingSession,
  id: 'sbs_started_001',
  state: 'started',
  sessionId: null,
  checkoutTokenHash: null,
  tokenConsumed: false,
  tokenExpiresAt: null,
  campaign: null,
  socialBookingSessionId: 'sbs_started_001',
};

// ─── Session Summaries ───────────────────────────────────────────────────────

export const validSessionSummaries: SessionSummary[] = [
  {
    sessionId: 'session_001',
    className: 'Kids After School Cooking',
    date: 'Mon 21 Jul',
    startTime: '15:30',
    venueName: 'Blooming Kitchen HQ',
    ageRange: '5–12',
    spotsAvailable: 6,
    price: '£15.00',
  },
  {
    sessionId: 'session_002',
    className: 'Weekend Young Adult Cooking',
    date: 'Sat 26 Jul',
    startTime: '10:30',
    venueName: 'St Mary\'s Community Centre',
    ageRange: '16–25',
    spotsAvailable: 4,
    price: '£25.00',
  },
  {
    sessionId: 'session_003',
    className: 'Italian Pasta Making',
    date: 'Sun 27 Jul',
    startTime: '11:00',
    venueName: 'The Old Hall',
    ageRange: '8–14',
    spotsAvailable: 8,
    price: '£18.00',
  },
  {
    sessionId: 'session_004',
    className: 'Healthy Meals Workshop',
    date: 'Mon 28 Jul',
    startTime: '15:30',
    venueName: 'Riverside Studio',
    ageRange: '5–12',
    spotsAvailable: 3,
    price: '£15.00',
  },
  {
    sessionId: 'session_005',
    className: 'Summer Holiday Baking',
    date: 'Sat 02 Aug',
    startTime: '10:30',
    venueName: 'Blooming Kitchen HQ',
    ageRange: '5–12',
    spotsAvailable: 10,
    price: '£20.00',
  },
];

// ─── Booking Confirmation ────────────────────────────────────────────────────

export const validBookingConfirmation: BookingConfirmation = {
  className: 'Kids After School Cooking',
  date: 'Mon 21 Jul',
  startTime: '15:30',
  venueName: 'Blooming Kitchen HQ',
  bookingRef: 'a1b2c3d4',
};

// ─── Campaign Attribution ────────────────────────────────────────────────────

export const validCampaignAttribution: CampaignAttribution = {
  source: 'instagram-ad',
  medium: 'social',
  campaign: 'summer-cooking-2025',
};

export const emptyCampaignAttribution: CampaignAttribution = {
  source: null,
  medium: null,
  campaign: null,
};

// ─── Acquisition Metadata ────────────────────────────────────────────────────

export const validAcquisitionMetadata: AcquisitionMetadata = {
  bookingSource: 'whatsapp_express',
  campaign: validCampaignAttribution,
  socialBookingSessionId: 'sbs_abc123def456',
};

export const websiteAcquisitionMetadata: AcquisitionMetadata = {
  bookingSource: 'website_express',
  campaign: null,
  socialBookingSessionId: null,
};

// ─── Webhook Payloads ────────────────────────────────────────────────────────

export const validWhatsAppPayload = {
  object: 'whatsapp_business_account',
  entry: [
    {
      id: '123456789012345',
      changes: [
        {
          value: {
            messaging_product: 'whatsapp',
            metadata: {
              display_phone_number: '15550001234',
              phone_number_id: '987654321098765',
            },
            messages: [
              {
                from: '447700900123',
                id: 'wamid.HBgNNDQ3NzAwOTAwMTIzFQIAEhggQTFCMkMzRDRFNUY2QQ',
                timestamp: '1721383200',
                text: { body: 'Book' },
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

export const validWhatsAppButtonReplyPayload = {
  object: 'whatsapp_business_account',
  entry: [
    {
      id: '123456789012345',
      changes: [
        {
          value: {
            messaging_product: 'whatsapp',
            metadata: {
              display_phone_number: '15550001234',
              phone_number_id: '987654321098765',
            },
            messages: [
              {
                from: '447700900123',
                id: 'wamid.HBgNNDQ3NzAwOTAwMTIzFQIAEhggQTFCMkMzRDRFNUY2Qg',
                timestamp: '1721383260',
                interactive: {
                  type: 'button_reply',
                  button_reply: {
                    id: 'session_001',
                    title: 'Kids Cooking Mon 21 Jul',
                  },
                },
                type: 'interactive',
              },
            ],
          },
          field: 'messages',
        },
      ],
    },
  ],
};

export const validInstagramPayload = {
  object: 'instagram',
  entry: [
    {
      id: '17841400000000001',
      time: 1721383200,
      messaging: [
        {
          sender: { id: '6789012345678901' },
          recipient: { id: '17841400000000001' },
          timestamp: 1721383200,
          message: {
            mid: 'm_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefg',
            text: 'Book',
          },
        },
      ],
    },
  ],
};

export const validInstagramQuickReplyPayload = {
  object: 'instagram',
  entry: [
    {
      id: '17841400000000001',
      time: 1721383260,
      messaging: [
        {
          sender: { id: '6789012345678901' },
          recipient: { id: '17841400000000001' },
          timestamp: 1721383260,
          message: {
            mid: 'm_ABCDEFGHIJKLMNOPQRSTUVWXYZhijklmn',
            text: 'session_001',
            quick_reply: {
              payload: 'session_001',
            },
          },
        },
      ],
    },
  ],
};

export const validMessengerPayload = {
  object: 'page',
  entry: [
    {
      id: '112233445566778899',
      time: 1721383200,
      messaging: [
        {
          sender: { id: '9876543210987654' },
          recipient: { id: '112233445566778899' },
          timestamp: 1721383200,
          message: {
            mid: 'mid.$cAABa1b2c3d4e5f6g7h8i9j0',
            text: 'Classes',
          },
        },
      ],
    },
  ],
};

export const validMessengerQuickReplyPayload = {
  object: 'page',
  entry: [
    {
      id: '112233445566778899',
      time: 1721383260,
      messaging: [
        {
          sender: { id: '9876543210987654' },
          recipient: { id: '112233445566778899' },
          timestamp: 1721383260,
          message: {
            mid: 'mid.$cAABa1b2c3d4e5f6g7h8i9j0k1',
            text: 'session_002',
            quick_reply: {
              payload: 'session_002',
            },
          },
        },
      ],
    },
  ],
};

// ─── Tokens ──────────────────────────────────────────────────────────────────

/** A valid 43-char URL-safe base64 token */
export const validToken = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqr';

/** The SHA-256 hash of validToken (pre-computed for fixture consistency) */
export const validTokenHash = '7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069';

// ─── Environment Variables ───────────────────────────────────────────────────

/** Test environment variables for social booking tests */
export const testEnvVars = {
  META_APP_SECRET: 'test_meta_app_secret_abc123',
  META_WEBHOOK_VERIFY_TOKEN: 'test_verify_token_xyz789',
  META_WHATSAPP_ACCESS_TOKEN: 'EAABwzLixnjYBO_test_whatsapp_token',
  META_WHATSAPP_PHONE_NUMBER_ID: '987654321098765',
  META_INSTAGRAM_ACCESS_TOKEN: 'EAABwzLixnjYBO_test_instagram_token',
  META_INSTAGRAM_PAGE_ID: '17841400000000001',
  META_MESSENGER_ACCESS_TOKEN: 'EAABwzLixnjYBO_test_messenger_token',
  META_MESSENGER_PAGE_ID: '112233445566778899',
  NEXT_PUBLIC_SOCIAL_BOOKING_ENABLED: 'true',
  NEXT_PUBLIC_APP_URL: 'https://bloomingtastebuds.co.uk',
};

// ─── Rate Limiting Fixtures ──────────────────────────────────────────────────

export const rateLimitFixtures = {
  /** Key used for token generation rate limiting */
  tokenRateKey: (userId: string) => `social_token_rate:${userId}`,
  /** Key used for deep link resolution rate limiting */
  deepLinkRateKey: (ip: string) => `social_deeplink_rate:${ip}`,
  /** Key used for failed token attempt tracking */
  tokenFailKey: (ip: string) => `social_token_fail:${ip}`,
  /** Key used for IP blocking */
  ipBlockKey: (ip: string) => `social_ip_block:${ip}`,
  /** Key used for Meta event deduplication */
  metaEventKey: (eventId: string) => `meta_event:${eventId}`,

  sampleIP: '192.168.1.100',
  sampleUserId: '447700900123',
};
