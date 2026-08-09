/**
 * Smoke test to verify all shared test helpers import and work correctly.
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  arbSocialChannel,
  arbToken,
  arbInvalidToken,
  arbValidUtmValue,
  arbInvalidUtmValue,
  arbUtmParams,
  arbCampaignAttribution,
  arbSocialBookingSession,
  arbSessionSummary,
  arbBookingConfirmation,
  arbWhatsAppWebhookPayload,
  arbInstagramWebhookPayload,
  arbMessengerWebhookPayload,
  arbWebhookPayload,
  arbParsedSocialEvent,
  arbTokenValidationResult,
} from './generators';
import {
  createMockFirestore,
  createMockKV,
  createMockStripe,
  createMockMetaAPI,
  createMockFetch,
} from './mocks';
import {
  validSocialBookingSession,
  validSessionSummaries,
  validBookingConfirmation,
  validWhatsAppPayload,
  validInstagramPayload,
  validMessengerPayload,
  testEnvVars,
  rateLimitFixtures,
} from './fixtures';

describe('generators', () => {
  it('arbSocialChannel generates valid channels', () => {
    const samples = fc.sample(arbSocialChannel, 10);
    for (const s of samples) {
      expect(['whatsapp', 'instagram', 'messenger']).toContain(s);
    }
  });

  it('arbToken generates 43-char URL-safe base64 strings', () => {
    fc.assert(
      fc.property(arbToken, (token) => {
        expect(token).toHaveLength(43);
        expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
      }),
      { numRuns: 50 }
    );
  });

  it('arbInvalidToken generates tokens that violate format', () => {
    const samples = fc.sample(arbInvalidToken, 20);
    for (const token of samples) {
      const isWrongLength = token.length !== 43;
      const hasInvalidChars = /[^A-Za-z0-9_-]/.test(token);
      expect(isWrongLength || hasInvalidChars).toBe(true);
    }
  });

  it('arbValidUtmValue generates valid UTM values', () => {
    fc.assert(
      fc.property(arbValidUtmValue, (value) => {
        expect(value.length).toBeGreaterThanOrEqual(1);
        expect(value.length).toBeLessThanOrEqual(128);
        expect(value).toMatch(/^[A-Za-z0-9._-]+$/);
      }),
      { numRuns: 50 }
    );
  });

  it('arbSocialBookingSession generates valid session documents', () => {
    const samples = fc.sample(arbSocialBookingSession, 5);
    for (const session of samples) {
      expect(session.id).toBeDefined();
      expect(['whatsapp', 'instagram', 'messenger']).toContain(session.channel);
      expect(session.state).toBeDefined();
    }
  });

  it('arbSessionSummary generates valid summaries', () => {
    const samples = fc.sample(arbSessionSummary, 5);
    for (const summary of samples) {
      expect(summary.sessionId).toBeDefined();
      expect(summary.className).toBeDefined();
      expect(summary.price).toMatch(/^£\d+\.\d{2}$/);
      expect(summary.spotsAvailable).toBeGreaterThan(0);
    }
  });

  it('arbBookingConfirmation generates valid confirmations', () => {
    const samples = fc.sample(arbBookingConfirmation, 5);
    for (const conf of samples) {
      expect(conf.bookingRef).toHaveLength(8);
      expect(conf.className).toBeDefined();
    }
  });

  it('arbWebhookPayload generates WhatsApp/Instagram/Messenger payloads', () => {
    const samples = fc.sample(arbWebhookPayload, 10);
    for (const payload of samples) {
      expect(['whatsapp_business_account', 'instagram', 'page']).toContain(
        (payload as Record<string, unknown>).object
      );
    }
  });

  it('arbParsedSocialEvent generates valid event variants', () => {
    const samples = fc.sample(arbParsedSocialEvent, 15);
    for (const event of samples) {
      expect(['trigger', 'session_selection', 'unknown']).toContain(event.type);
      expect(['whatsapp', 'instagram', 'messenger']).toContain(event.channel);
    }
  });

  it('arbTokenValidationResult generates valid/invalid results', () => {
    const samples = fc.sample(arbTokenValidationResult, 20);
    const hasValid = samples.some((r) => r.valid === true);
    const hasInvalid = samples.some((r) => r.valid === false);
    expect(hasValid || hasInvalid).toBe(true);
  });
});

describe('mocks', () => {
  it('createMockFirestore provides collection/doc/get/set/update', async () => {
    const db = createMockFirestore();
    const col = db.collection('social_booking_sessions');
    const docRef = col.doc('test-id');
    await docRef.set({ state: 'started', channel: 'whatsapp' });
    const snap = await docRef.get();
    expect(snap.exists).toBe(true);
    expect(snap.data()).toEqual({ state: 'started', channel: 'whatsapp' });
  });

  it('createMockFirestore supports update', async () => {
    const db = createMockFirestore();
    const docRef = db.collection('sessions').doc('s1');
    await docRef.set({ state: 'started' });
    await docRef.update({ state: 'selecting-session' });
    const snap = await docRef.get();
    expect(snap.data()).toEqual({ state: 'selecting-session' });
  });

  it('createMockFirestore supports runTransaction', async () => {
    const db = createMockFirestore();
    const docRef = db.collection('sessions').doc('s1');
    await docRef.set({ tokenConsumed: false });

    await db.runTransaction(async (transaction: any) => {
      const snap = await transaction.get(docRef);
      expect(snap.exists).toBe(true);
      transaction.update(docRef, { tokenConsumed: true });
    });

    const snap = await docRef.get();
    expect(snap.data()).toEqual({ tokenConsumed: true });
  });

  it('createMockKV supports get/set/incr/expire', async () => {
    const kv = createMockKV();
    await kv.set('test_key', 'value', { ex: 3600 });
    const val = await kv.get('test_key');
    expect(val).toBe('value');

    await kv.set('counter', 0);
    const result = await kv.incr('counter');
    expect(result).toBe(1);
  });

  it('createMockStripe creates payment intents', async () => {
    const stripe = createMockStripe();
    const pi = await stripe.paymentIntents.create({
      amount: 1500,
      currency: 'gbp',
      metadata: { source: 'whatsapp_express' },
    });
    expect(pi.id).toMatch(/^pi_/);
    expect(pi.amount).toBe(1500);
    expect(pi.currency).toBe('gbp');
  });

  it('createMockMetaAPI handles success and error simulation', async () => {
    const metaAPI = createMockMetaAPI();

    const successResponse = await metaAPI.sendMessage({});
    expect(successResponse.ok).toBe(true);
    expect(successResponse.status).toBe(200);

    metaAPI.simulateError(429);
    const errorResponse = await metaAPI.sendMessage({});
    expect(errorResponse.ok).toBe(false);
    expect(errorResponse.status).toBe(429);

    metaAPI.simulateSuccess();
    const recoveredResponse = await metaAPI.sendMessage({});
    expect(recoveredResponse.ok).toBe(true);
  });

  it('createMockFetch routes to meta API mock', async () => {
    const metaAPI = createMockMetaAPI();
    const mockFetch = createMockFetch(metaAPI);

    const response = await mockFetch(
      'https://graph.facebook.com/v18.0/987654321/messages',
      { method: 'POST', body: JSON.stringify({ type: 'text', text: { body: 'Hello' } }) }
    );
    expect(response.ok).toBe(true);
    expect(metaAPI.sendMessage).toHaveBeenCalledTimes(1);
  });
});

describe('fixtures', () => {
  it('validSocialBookingSession has required fields', () => {
    expect(validSocialBookingSession.id).toBeDefined();
    expect(validSocialBookingSession.channel).toBe('whatsapp');
    expect(validSocialBookingSession.state).toBe('checkout-created');
    expect(validSocialBookingSession.campaign).not.toBeNull();
  });

  it('validSessionSummaries has 5 entries', () => {
    expect(validSessionSummaries).toHaveLength(5);
    for (const s of validSessionSummaries) {
      expect(s.price).toMatch(/^£\d+\.\d{2}$/);
      expect(s.spotsAvailable).toBeGreaterThan(0);
    }
  });

  it('validBookingConfirmation has required fields', () => {
    expect(validBookingConfirmation.className).toBeDefined();
    expect(validBookingConfirmation.bookingRef).toHaveLength(8);
  });

  it('webhook payloads have correct object types', () => {
    expect(validWhatsAppPayload.object).toBe('whatsapp_business_account');
    expect(validInstagramPayload.object).toBe('instagram');
    expect(validMessengerPayload.object).toBe('page');
  });

  it('testEnvVars has all required environment variables', () => {
    expect(testEnvVars.META_APP_SECRET).toBeDefined();
    expect(testEnvVars.META_WEBHOOK_VERIFY_TOKEN).toBeDefined();
    expect(testEnvVars.META_WHATSAPP_ACCESS_TOKEN).toBeDefined();
    expect(testEnvVars.NEXT_PUBLIC_SOCIAL_BOOKING_ENABLED).toBe('true');
  });

  it('rateLimitFixtures produces correct key formats', () => {
    expect(rateLimitFixtures.tokenRateKey('user1')).toBe('social_token_rate:user1');
    expect(rateLimitFixtures.deepLinkRateKey('1.2.3.4')).toBe('social_deeplink_rate:1.2.3.4');
    expect(rateLimitFixtures.tokenFailKey('1.2.3.4')).toBe('social_token_fail:1.2.3.4');
    expect(rateLimitFixtures.ipBlockKey('1.2.3.4')).toBe('social_ip_block:1.2.3.4');
    expect(rateLimitFixtures.metaEventKey('evt123')).toBe('meta_event:evt123');
  });
});
