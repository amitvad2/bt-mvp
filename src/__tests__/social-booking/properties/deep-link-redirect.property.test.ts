/**
 * Feature: social-commerce-guest-booking, Property 11: Deep Link Resolution Redirect
 *
 * For any valid Guest_Checkout_Token associated with a bookable session,
 * resolving the deep link /guest/book/[token] SHALL redirect to
 * /express-booking/[sessionId]?source=social_<channel> with the correct
 * sessionId from the Social_Booking_Session, and SHALL append
 * &campaign=<name> if campaign data is present on the session.
 *
 * Validates: Requirements 7.1, 7.3, 7.4
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { arbSocialChannel, arbCampaignAttributionOrNull } from '../helpers/generators';
import type { SocialChannel, CampaignAttribution } from '@/types';

/**
 * Builds the redirect URL for a successfully resolved deep link.
 * This mirrors the URL construction logic in /guest/book/[token]/page.tsx.
 *
 * @param sessionId - The session ID from the validated token's Social_Booking_Session
 * @param channel - The social channel (whatsapp, instagram, messenger)
 * @param campaign - Campaign attribution from the session (may be null)
 * @param utmCampaign - Campaign name from UTM params (may be null)
 */
export function buildDeepLinkRedirectUrl(
  sessionId: string,
  channel: SocialChannel,
  campaign: CampaignAttribution | null,
  utmCampaign: string | null = null
): string {
  const source = `social_${channel}`;
  const redirectUrl = new URL(
    `/express-booking/${sessionId}`,
    'http://localhost' // Base URL placeholder — only pathname + search used
  );
  redirectUrl.searchParams.set('source', source);

  // Campaign from UTM takes priority, fallback to session campaign
  const campaignName = utmCampaign || campaign?.campaign || null;
  if (campaignName) {
    redirectUrl.searchParams.set('campaign', campaignName);
  }

  return `${redirectUrl.pathname}${redirectUrl.search}`;
}

describe('Property 11: Deep Link Resolution Redirect', () => {
  const arbSessionId = fc.uuid();

  it('redirect URL starts with /express-booking/<sessionId>', () => {
    fc.assert(
      fc.property(
        arbSessionId,
        arbSocialChannel,
        arbCampaignAttributionOrNull,
        (sessionId, channel, campaign) => {
          const url = buildDeepLinkRedirectUrl(sessionId, channel, campaign);
          expect(url.startsWith(`/express-booking/${sessionId}`)).toBe(true);
        }
      ),
      { numRuns: 20 }
    );
  });

  it('source query param equals social_<channel>', () => {
    fc.assert(
      fc.property(
        arbSessionId,
        arbSocialChannel,
        arbCampaignAttributionOrNull,
        (sessionId, channel, campaign) => {
          const url = buildDeepLinkRedirectUrl(sessionId, channel, campaign);
          const parsedUrl = new URL(url, 'http://localhost');
          expect(parsedUrl.searchParams.get('source')).toBe(`social_${channel}`);
        }
      ),
      { numRuns: 20 }
    );
  });

  it('source is one of social_whatsapp, social_instagram, social_messenger', () => {
    const validSources = ['social_whatsapp', 'social_instagram', 'social_messenger'];
    fc.assert(
      fc.property(
        arbSessionId,
        arbSocialChannel,
        arbCampaignAttributionOrNull,
        (sessionId, channel, campaign) => {
          const url = buildDeepLinkRedirectUrl(sessionId, channel, campaign);
          const parsedUrl = new URL(url, 'http://localhost');
          expect(validSources).toContain(parsedUrl.searchParams.get('source'));
        }
      ),
      { numRuns: 20 }
    );
  });

  it('if campaign.campaign is non-null, the campaign query param equals that value', () => {
    const arbCampaignWithValue: fc.Arbitrary<CampaignAttribution> = fc.record({
      source: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: null }),
      medium: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: null }),
      campaign: fc.string({ minLength: 1, maxLength: 128 }),
    });

    fc.assert(
      fc.property(
        arbSessionId,
        arbSocialChannel,
        arbCampaignWithValue,
        (sessionId, channel, campaign) => {
          const url = buildDeepLinkRedirectUrl(sessionId, channel, campaign);
          const parsedUrl = new URL(url, 'http://localhost');
          expect(parsedUrl.searchParams.get('campaign')).toBe(campaign.campaign);
        }
      ),
      { numRuns: 20 }
    );
  });

  it('if campaign is null, no campaign query param is present', () => {
    fc.assert(
      fc.property(
        arbSessionId,
        arbSocialChannel,
        (sessionId, channel) => {
          const url = buildDeepLinkRedirectUrl(sessionId, channel, null);
          const parsedUrl = new URL(url, 'http://localhost');
          expect(parsedUrl.searchParams.has('campaign')).toBe(false);
        }
      ),
      { numRuns: 20 }
    );
  });

  it('if campaign.campaign is null but utmCampaign is provided, campaign param equals utmCampaign', () => {
    const arbUtmCampaign = fc.string({
      unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._-'.split('')),
      minLength: 1,
      maxLength: 128,
    });

    fc.assert(
      fc.property(
        arbSessionId,
        arbSocialChannel,
        arbUtmCampaign,
        (sessionId, channel, utmCampaign) => {
          const url = buildDeepLinkRedirectUrl(sessionId, channel, null, utmCampaign);
          const parsedUrl = new URL(url, 'http://localhost');
          expect(parsedUrl.searchParams.get('campaign')).toBe(utmCampaign);
        }
      ),
      { numRuns: 20 }
    );
  });

  it('utmCampaign takes priority over campaign.campaign when both are present', () => {
    const arbCampaignWithValue: fc.Arbitrary<CampaignAttribution> = fc.record({
      source: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: null }),
      medium: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: null }),
      campaign: fc.string({ minLength: 1, maxLength: 128 }),
    });
    const arbUtmCampaign = fc.string({
      unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._-'.split('')),
      minLength: 1,
      maxLength: 128,
    });

    fc.assert(
      fc.property(
        arbSessionId,
        arbSocialChannel,
        arbCampaignWithValue,
        arbUtmCampaign,
        (sessionId, channel, campaign, utmCampaign) => {
          const url = buildDeepLinkRedirectUrl(sessionId, channel, campaign, utmCampaign);
          const parsedUrl = new URL(url, 'http://localhost');
          expect(parsedUrl.searchParams.get('campaign')).toBe(utmCampaign);
        }
      ),
      { numRuns: 20 }
    );
  });
});
