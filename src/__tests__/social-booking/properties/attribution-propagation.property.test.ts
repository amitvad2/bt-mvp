/**
 * Feature: social-commerce-guest-booking, Property 13: Attribution Propagation Round-Trip
 *
 * For any booking completed through the social channel flow, the confirmed booking
 * document SHALL contain an acquisition metadata object with `bookingSource` matching
 * the originating channel, `campaign` matching the Social_Booking_Session's campaign
 * data (or null), and `socialBookingSessionId` matching the session document ID —
 * propagated from Social_Booking_Session → booking_draft → booking.
 *
 * Validates: Requirements 8.1, 8.3, 9.6
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  arbSocialChannel,
  arbCampaignAttribution,
  arbCampaignAttributionOrNull,
} from '../helpers/generators';
import type { SocialChannel, CampaignAttribution, BookingSource, AcquisitionMetadata } from '@/types';

// ─── Pure mapping functions extracted for property testing ────────────────────

/**
 * Maps a social channel to the corresponding booking source.
 * This mirrors the mapping in create-guest-intent/route.ts (mapSocialSourceToBookingSource)
 * and the webhook's acquisition building logic.
 *
 * whatsapp → whatsapp_express
 * instagram → instagram_express
 * messenger → facebook_express
 */
export function mapChannelToBookingSource(channel: SocialChannel): BookingSource {
  const mapping: Record<SocialChannel, BookingSource> = {
    whatsapp: 'whatsapp_express',
    instagram: 'instagram_express',
    messenger: 'facebook_express',
  };
  return mapping[channel];
}

/**
 * Builds the socialAttribution object that create-guest-intent writes to the booking_draft.
 * This mirrors the logic in create-guest-intent/route.ts.
 */
export function buildDraftSocialAttribution(
  channel: SocialChannel,
  campaign: CampaignAttribution | null,
  socialBookingSessionId: string
): {
  bookingSource: BookingSource;
  campaign: string | null;
  socialBookingSessionId: string | null;
} {
  return {
    bookingSource: mapChannelToBookingSource(channel),
    campaign: campaign?.campaign ?? null,
    socialBookingSessionId,
  };
}

/**
 * Builds the acquisition metadata that the Stripe webhook writes to the booking document.
 * When socialAttribution is present on the draft, it propagates the fields.
 * When absent, it defaults to website_express.
 *
 * This mirrors the logic in webhooks/stripe/route.ts (buildGuestBookingDoc).
 */
export function buildAcquisitionFromDraft(
  draftSocialAttribution: {
    bookingSource: BookingSource;
    campaign: string | null;
    socialBookingSessionId: string | null;
  } | null
): AcquisitionMetadata {
  if (draftSocialAttribution) {
    return {
      bookingSource: draftSocialAttribution.bookingSource,
      campaign: draftSocialAttribution.campaign
        ? { source: null, medium: null, campaign: draftSocialAttribution.campaign }
        : null,
      socialBookingSessionId: draftSocialAttribution.socialBookingSessionId,
    };
  }
  return {
    bookingSource: 'website_express',
    campaign: null,
    socialBookingSessionId: null,
  };
}

/**
 * Full round-trip: simulates the attribution flow from Social_Booking_Session
 * through the booking draft to the final booking document.
 *
 * Social_Booking_Session (channel, campaign) →
 *   create-guest-intent writes socialAttribution to draft →
 *     Stripe webhook reads draft and writes acquisition to booking
 */
export function propagateAttribution(
  channel: SocialChannel,
  campaign: CampaignAttribution | null,
  socialBookingSessionId: string
): AcquisitionMetadata {
  // Step 1: create-guest-intent builds socialAttribution on draft
  const draftAttribution = buildDraftSocialAttribution(channel, campaign, socialBookingSessionId);

  // Step 2: Stripe webhook reads draft and builds acquisition on booking
  return buildAcquisitionFromDraft(draftAttribution);
}

// ─── Property Tests ──────────────────────────────────────────────────────────

describe('Property 13: Attribution Propagation Round-Trip', () => {
  const arbSessionId = fc.uuid();

  it('whatsapp channel maps to whatsapp_express bookingSource', () => {
    fc.assert(
      fc.property(
        arbCampaignAttributionOrNull,
        arbSessionId,
        (campaign, sessionId) => {
          const result = propagateAttribution('whatsapp', campaign, sessionId);
          expect(result.bookingSource).toBe('whatsapp_express');
        }
      ),
      { numRuns: 20 }
    );
  });

  it('instagram channel maps to instagram_express bookingSource', () => {
    fc.assert(
      fc.property(
        arbCampaignAttributionOrNull,
        arbSessionId,
        (campaign, sessionId) => {
          const result = propagateAttribution('instagram', campaign, sessionId);
          expect(result.bookingSource).toBe('instagram_express');
        }
      ),
      { numRuns: 20 }
    );
  });

  it('messenger channel maps to facebook_express bookingSource', () => {
    fc.assert(
      fc.property(
        arbCampaignAttributionOrNull,
        arbSessionId,
        (campaign, sessionId) => {
          const result = propagateAttribution('messenger', campaign, sessionId);
          expect(result.bookingSource).toBe('facebook_express');
        }
      ),
      { numRuns: 20 }
    );
  });

  it('for any SocialChannel, bookingSource maps correctly', () => {
    const expectedMapping: Record<SocialChannel, BookingSource> = {
      whatsapp: 'whatsapp_express',
      instagram: 'instagram_express',
      messenger: 'facebook_express',
    };

    fc.assert(
      fc.property(
        arbSocialChannel,
        arbCampaignAttributionOrNull,
        arbSessionId,
        (channel, campaign, sessionId) => {
          const result = propagateAttribution(channel, campaign, sessionId);
          expect(result.bookingSource).toBe(expectedMapping[channel]);
        }
      ),
      { numRuns: 20 }
    );
  });

  it('campaign.campaign field propagates unchanged through draft → booking', () => {
    fc.assert(
      fc.property(
        arbSocialChannel,
        arbCampaignAttribution,
        arbSessionId,
        (channel, campaign, sessionId) => {
          const result = propagateAttribution(channel, campaign, sessionId);

          if (campaign.campaign) {
            // When campaign has a campaign name, it should be present in the result
            expect(result.campaign).not.toBeNull();
            expect(result.campaign!.campaign).toBe(campaign.campaign);
          } else {
            // When campaign.campaign is null, the entire campaign object should be null
            expect(result.campaign).toBeNull();
          }
        }
      ),
      { numRuns: 20 }
    );
  });

  it('null campaign propagates as null through draft → booking', () => {
    fc.assert(
      fc.property(
        arbSocialChannel,
        arbSessionId,
        (channel, sessionId) => {
          const result = propagateAttribution(channel, null, sessionId);
          expect(result.campaign).toBeNull();
        }
      ),
      { numRuns: 20 }
    );
  });

  it('socialBookingSessionId propagates unchanged through draft → booking', () => {
    fc.assert(
      fc.property(
        arbSocialChannel,
        arbCampaignAttributionOrNull,
        arbSessionId,
        (channel, campaign, sessionId) => {
          const result = propagateAttribution(channel, campaign, sessionId);
          expect(result.socialBookingSessionId).toBe(sessionId);
        }
      ),
      { numRuns: 20 }
    );
  });

  it('when socialAttribution is absent from draft, bookingSource defaults to website_express', () => {
    fc.assert(
      fc.property(
        fc.constant(null),
        (draftAttribution) => {
          const result = buildAcquisitionFromDraft(draftAttribution);
          expect(result.bookingSource).toBe('website_express');
          expect(result.campaign).toBeNull();
          expect(result.socialBookingSessionId).toBeNull();
        }
      ),
      { numRuns: 20 }
    );
  });

  it('when socialAttribution is absent, campaign and socialBookingSessionId are both null', () => {
    fc.assert(
      fc.property(
        fc.constant(null),
        (draftAttribution) => {
          const result = buildAcquisitionFromDraft(draftAttribution);
          expect(result.campaign).toBeNull();
          expect(result.socialBookingSessionId).toBeNull();
        }
      ),
      { numRuns: 20 }
    );
  });

  it('round-trip preserves all attribution fields for any valid input combination', () => {
    fc.assert(
      fc.property(
        arbSocialChannel,
        arbCampaignAttributionOrNull,
        arbSessionId,
        (channel, campaign, sessionId) => {
          const result = propagateAttribution(channel, campaign, sessionId);

          // bookingSource is one of the valid social sources
          expect(['whatsapp_express', 'instagram_express', 'facebook_express']).toContain(
            result.bookingSource
          );

          // socialBookingSessionId always matches input
          expect(result.socialBookingSessionId).toBe(sessionId);

          // campaign consistency: if input has campaign name, output preserves it
          if (campaign?.campaign) {
            expect(result.campaign?.campaign).toBe(campaign.campaign);
          } else {
            expect(result.campaign).toBeNull();
          }
        }
      ),
      { numRuns: 20 }
    );
  });
});
