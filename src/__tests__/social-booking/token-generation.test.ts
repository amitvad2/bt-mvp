import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';

// Use vi.hoisted to declare mocks that vi.mock can reference (both are hoisted)
const { mockUpdate, mockDoc, mockCollection } = vi.hoisted(() => {
  const mockUpdate = vi.fn();
  const mockDoc = vi.fn(() => ({
    update: mockUpdate,
  }));
  const mockCollection = vi.fn(() => ({
    doc: mockDoc,
  }));
  return { mockUpdate, mockDoc, mockCollection };
});

vi.mock('@/lib/firebase-admin', () => {
  const mockTimestampNow = () => ({
    toMillis: () => Date.now(),
  });
  const mockTimestampFromMillis = (ms: number) => ({
    toMillis: () => ms,
    _seconds: Math.floor(ms / 1000),
    _nanoseconds: (ms % 1000) * 1000000,
  });

  return {
    adminDb: {
      collection: mockCollection,
    },
    default: {
      firestore: {
        Timestamp: {
          now: mockTimestampNow,
          fromMillis: mockTimestampFromMillis,
        },
        FieldValue: {
          serverTimestamp: () => 'SERVER_TIMESTAMP',
        },
      },
    },
  };
});

import { generateRawToken, hashToken, createTokenService } from '@/lib/social-booking/token';

describe('Token Generation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('generateRawToken', () => {
    it('should generate a 43-character URL-safe base64 string', () => {
      const token = generateRawToken();
      expect(token).toHaveLength(43);
    });

    it('should only contain URL-safe base64 characters [A-Za-z0-9_-]', () => {
      const token = generateRawToken();
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('should not contain standard base64 special characters (+, /, =)', () => {
      for (let i = 0; i < 20; i++) {
        const token = generateRawToken();
        expect(token).not.toContain('+');
        expect(token).not.toContain('/');
        expect(token).not.toContain('=');
      }
    });

    it('should generate unique tokens each time', () => {
      const tokens = new Set<string>();
      for (let i = 0; i < 100; i++) {
        tokens.add(generateRawToken());
      }
      expect(tokens.size).toBe(100);
    });
  });

  describe('hashToken', () => {
    it('should produce a 64-character hex string (SHA-256)', () => {
      const token = generateRawToken();
      const hash = hashToken(token);
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[a-f0-9]+$/);
    });

    it('should produce consistent hashes for the same input', () => {
      const token = 'test-token-value-abc123';
      const hash1 = hashToken(token);
      const hash2 = hashToken(token);
      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different inputs', () => {
      const hash1 = hashToken('token-a');
      const hash2 = hashToken('token-b');
      expect(hash1).not.toBe(hash2);
    });

    it('hash should never equal the raw token', () => {
      const token = generateRawToken();
      const hash = hashToken(token);
      expect(hash).not.toBe(token);
    });
  });

  describe('createTokenService().generate', () => {
    it('should return a 43-char URL-safe base64 token', async () => {
      const tokenService = createTokenService();
      const rawToken = await tokenService.generate('session-123', 'cooking-session-456');

      expect(rawToken).toHaveLength(43);
      expect(rawToken).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('should store the SHA-256 hash (not the raw token) in Firestore', async () => {
      const tokenService = createTokenService();
      const rawToken = await tokenService.generate('session-abc', 'cooking-session-789');

      expect(mockCollection).toHaveBeenCalledWith('social_booking_sessions');
      expect(mockDoc).toHaveBeenCalledWith('session-abc');

      const updateArg = mockUpdate.mock.calls[0][0];
      const expectedHash = crypto.createHash('sha256').update(rawToken).digest('hex');

      expect(updateArg.checkoutTokenHash).toBe(expectedHash);
      expect(updateArg.checkoutTokenHash).not.toBe(rawToken);
    });

    it('should set tokenExpiresAt to 15 minutes from now', async () => {
      const now = Date.now();
      const tokenService = createTokenService();
      await tokenService.generate('session-exp', 'session-id');

      const updateArg = mockUpdate.mock.calls[0][0];
      const expiresAtMs = updateArg.tokenExpiresAt.toMillis();
      const fifteenMinMs = 15 * 60 * 1000;

      // Should be approximately 15 minutes from now (within 1 second tolerance)
      expect(Math.abs(expiresAtMs - (now + fifteenMinMs))).toBeLessThan(1000);
    });

    it('should update the state to checkout-created and set tokenConsumed to false', async () => {
      const tokenService = createTokenService();
      await tokenService.generate('session-state', 'session-id');

      const updateArg = mockUpdate.mock.calls[0][0];

      expect(updateArg.state).toBe('checkout-created');
      expect(updateArg.tokenConsumed).toBe(false);
      expect(updateArg.sessionId).toBe('session-id');
      expect(updateArg.updatedAt).toBe('SERVER_TIMESTAMP');
    });

    it('should store the correct sessionId in the update', async () => {
      const tokenService = createTokenService();
      await tokenService.generate('sb-session-1', 'target-session-42');

      const updateArg = mockUpdate.mock.calls[0][0];
      expect(updateArg.sessionId).toBe('target-session-42');
    });
  });
});
