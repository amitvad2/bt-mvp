import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted to declare mocks that vi.mock can reference
const { mockUpdate, mockSet, mockGet, mockDoc, mockCollection, mockWhere, mockOrderBy, mockLimit, mockQueryGet } = vi.hoisted(() => {
  const mockUpdate = vi.fn().mockResolvedValue(undefined);
  const mockSet = vi.fn().mockResolvedValue(undefined);
  const mockGet = vi.fn();
  const mockDoc = vi.fn();
  const mockQueryGet = vi.fn();
  const mockLimit = vi.fn(() => ({ get: mockQueryGet }));
  const mockOrderBy = vi.fn(() => ({ limit: mockLimit }));
  const mockWhere = vi.fn(() => ({ where: mockWhere, orderBy: mockOrderBy }));
  const mockCollection = vi.fn(() => ({
    doc: mockDoc,
    where: mockWhere,
  }));

  // mockDoc returns an object with update, set, get
  mockDoc.mockImplementation((id?: string) => {
    const docId = id || `auto-id-${Date.now()}`;
    return {
      id: docId,
      update: mockUpdate,
      set: mockSet,
      get: mockGet,
    };
  });

  return { mockUpdate, mockSet, mockGet, mockDoc, mockCollection, mockWhere, mockOrderBy, mockLimit, mockQueryGet };
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

import { createSessionManager } from '@/lib/social-booking/session-manager';

describe('SessionManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createOrReuseSession', () => {
    it('should create a new session when no active sessions exist', async () => {
      // No existing sessions found
      mockQueryGet.mockResolvedValue({ docs: [] });

      const manager = createSessionManager();
      const session = await manager.createOrReuseSession('whatsapp', 'user-123', 'conv-456');

      expect(session.channel).toBe('whatsapp');
      expect(session.externalUserId).toBe('user-123');
      expect(session.externalConversationId).toBe('conv-456');
      expect(session.state).toBe('started');
      expect(session.sessionId).toBeNull();
      expect(session.checkoutTokenHash).toBeNull();
      expect(session.tokenConsumed).toBe(false);
      expect(session.campaign).toBeNull();
      expect(mockSet).toHaveBeenCalled();
    });

    it('should reuse an active session on the same channel/user', async () => {
      const futureTimestamp = {
        toMillis: () => Date.now() + 10 * 60 * 1000, // 10 min from now
      };

      mockQueryGet.mockResolvedValue({
        docs: [{
          id: 'existing-session-id',
          ref: { update: mockUpdate },
          data: () => ({
            channel: 'whatsapp',
            externalUserId: 'user-123',
            externalConversationId: 'conv-789',
            state: 'started',
            sessionId: null,
            checkoutTokenHash: null,
            tokenConsumed: false,
            tokenExpiresAt: null,
            source: 'whatsapp_express',
            campaign: null,
            socialBookingSessionId: 'existing-session-id',
            createdAt: { toMillis: () => Date.now() - 5 * 60 * 1000 },
            expiresAt: futureTimestamp,
            updatedAt: { toMillis: () => Date.now() - 5 * 60 * 1000 },
          }),
        }],
      });

      const manager = createSessionManager();
      const session = await manager.createOrReuseSession('whatsapp', 'user-123', 'conv-456');

      expect(session.id).toBe('existing-session-id');
      expect(session.state).toBe('started');
      // Should NOT create a new session
      expect(mockSet).not.toHaveBeenCalled();
    });

    it('should mark expired sessions and create a new one', async () => {
      const pastTimestamp = {
        toMillis: () => Date.now() - 5 * 60 * 1000, // 5 min ago (expired)
      };

      mockQueryGet.mockResolvedValue({
        docs: [{
          id: 'expired-session-id',
          ref: { update: mockUpdate },
          data: () => ({
            channel: 'instagram',
            externalUserId: 'user-abc',
            externalConversationId: 'conv-old',
            state: 'selecting-session',
            sessionId: 'some-session',
            checkoutTokenHash: null,
            tokenConsumed: false,
            tokenExpiresAt: null,
            source: 'instagram_express',
            campaign: null,
            socialBookingSessionId: 'expired-session-id',
            createdAt: { toMillis: () => Date.now() - 35 * 60 * 1000 },
            expiresAt: pastTimestamp,
            updatedAt: { toMillis: () => Date.now() - 30 * 60 * 1000 },
          }),
        }],
      });

      const manager = createSessionManager();
      const session = await manager.createOrReuseSession('instagram', 'user-abc', 'conv-new');

      // Should have marked the old session as expired
      expect(mockUpdate).toHaveBeenCalledWith({
        state: 'expired',
        updatedAt: 'SERVER_TIMESTAMP',
      });

      // Should create a new session
      expect(mockSet).toHaveBeenCalled();
      expect(session.state).toBe('started');
      expect(session.channel).toBe('instagram');
    });

    it('should set expiresAt to 30 minutes from creation', async () => {
      mockQueryGet.mockResolvedValue({ docs: [] });

      const now = Date.now();
      const manager = createSessionManager();
      await manager.createOrReuseSession('messenger', 'user-x', 'conv-y');

      const setArg = mockSet.mock.calls[0][0];
      const expiresAtMs = setArg.expiresAt.toMillis();
      const thirtyMinMs = 30 * 60 * 1000;

      expect(Math.abs(expiresAtMs - (now + thirtyMinMs))).toBeLessThan(1000);
    });

    it('should query Firestore with correct filters for active sessions', async () => {
      mockQueryGet.mockResolvedValue({ docs: [] });

      const manager = createSessionManager();
      await manager.createOrReuseSession('whatsapp', 'user-filter', 'conv-filter');

      expect(mockCollection).toHaveBeenCalledWith('social_booking_sessions');
      expect(mockWhere).toHaveBeenCalledWith('channel', '==', 'whatsapp');
      expect(mockWhere).toHaveBeenCalledWith('externalUserId', '==', 'user-filter');
      expect(mockWhere).toHaveBeenCalledWith('state', 'not-in', ['confirmed', 'expired']);
    });
  });

  describe('transitionState', () => {
    it('should allow valid transition: started → selecting-session', async () => {
      mockGet.mockResolvedValue({
        exists: true,
        id: 'session-1',
        data: () => ({
          state: 'started',
          expiresAt: { toMillis: () => Date.now() + 20 * 60 * 1000 },
        }),
      });

      const manager = createSessionManager();
      await expect(manager.transitionState('session-1', 'selecting-session')).resolves.toBeUndefined();

      expect(mockUpdate).toHaveBeenCalledWith({
        state: 'selecting-session',
        updatedAt: 'SERVER_TIMESTAMP',
      });
    });

    it('should allow valid transition: selecting-session → checkout-created', async () => {
      mockGet.mockResolvedValue({
        exists: true,
        id: 'session-2',
        data: () => ({
          state: 'selecting-session',
          expiresAt: { toMillis: () => Date.now() + 15 * 60 * 1000 },
        }),
      });

      const manager = createSessionManager();
      await expect(manager.transitionState('session-2', 'checkout-created')).resolves.toBeUndefined();
    });

    it('should allow valid transition: checkout-created → payment-pending', async () => {
      mockGet.mockResolvedValue({
        exists: true,
        id: 'session-3',
        data: () => ({
          state: 'checkout-created',
          expiresAt: { toMillis: () => Date.now() + 10 * 60 * 1000 },
        }),
      });

      const manager = createSessionManager();
      await expect(manager.transitionState('session-3', 'payment-pending')).resolves.toBeUndefined();
    });

    it('should allow valid transition: payment-pending → confirmed', async () => {
      mockGet.mockResolvedValue({
        exists: true,
        id: 'session-4',
        data: () => ({
          state: 'payment-pending',
          expiresAt: { toMillis: () => Date.now() + 5 * 60 * 1000 },
        }),
      });

      const manager = createSessionManager();
      await expect(manager.transitionState('session-4', 'confirmed')).resolves.toBeUndefined();
    });

    it('should reject invalid transition: started → confirmed', async () => {
      mockGet.mockResolvedValue({
        exists: true,
        id: 'session-5',
        data: () => ({
          state: 'started',
          expiresAt: { toMillis: () => Date.now() + 20 * 60 * 1000 },
        }),
      });

      const manager = createSessionManager();
      await expect(manager.transitionState('session-5', 'confirmed'))
        .rejects.toThrow("Invalid state transition: 'started' → 'confirmed'");
    });

    it('should reject invalid transition: confirmed → started', async () => {
      mockGet.mockResolvedValue({
        exists: true,
        id: 'session-6',
        data: () => ({
          state: 'confirmed',
          expiresAt: { toMillis: () => Date.now() + 10 * 60 * 1000 },
        }),
      });

      const manager = createSessionManager();
      await expect(manager.transitionState('session-6', 'started'))
        .rejects.toThrow("Invalid state transition: 'confirmed' → 'started'");
    });

    it('should reject invalid transition: expired → selecting-session', async () => {
      mockGet.mockResolvedValue({
        exists: true,
        id: 'session-7',
        data: () => ({
          state: 'expired',
          expiresAt: { toMillis: () => Date.now() - 5 * 60 * 1000 },
        }),
      });

      const manager = createSessionManager();
      await expect(manager.transitionState('session-7', 'selecting-session'))
        .rejects.toThrow("Invalid state transition: 'expired' → 'selecting-session'");
    });

    it('should reject transition on expired session and update state to expired', async () => {
      mockGet.mockResolvedValue({
        exists: true,
        id: 'session-8',
        data: () => ({
          state: 'selecting-session',
          expiresAt: { toMillis: () => Date.now() - 1000 }, // already expired
        }),
      });

      const manager = createSessionManager();
      await expect(manager.transitionState('session-8', 'checkout-created'))
        .rejects.toThrow('has expired');

      // Should have updated the state to 'expired'
      expect(mockUpdate).toHaveBeenCalledWith({
        state: 'expired',
        updatedAt: 'SERVER_TIMESTAMP',
      });
    });

    it('should throw when session does not exist', async () => {
      mockGet.mockResolvedValue({ exists: false });

      const manager = createSessionManager();
      await expect(manager.transitionState('nonexistent', 'selecting-session'))
        .rejects.toThrow('Social booking session not found: nonexistent');
    });

    it('should reject skipping states: started → checkout-created', async () => {
      mockGet.mockResolvedValue({
        exists: true,
        id: 'session-skip',
        data: () => ({
          state: 'started',
          expiresAt: { toMillis: () => Date.now() + 20 * 60 * 1000 },
        }),
      });

      const manager = createSessionManager();
      await expect(manager.transitionState('session-skip', 'checkout-created'))
        .rejects.toThrow("Invalid state transition: 'started' → 'checkout-created'");
    });
  });

  describe('getSession', () => {
    it('should return null for non-existent session', async () => {
      mockGet.mockResolvedValue({ exists: false });

      const manager = createSessionManager();
      const result = await manager.getSession('nonexistent-id');

      expect(result).toBeNull();
    });

    it('should return the session when it exists and is not expired', async () => {
      mockGet.mockResolvedValue({
        exists: true,
        id: 'active-session',
        data: () => ({
          channel: 'whatsapp',
          externalUserId: 'user-1',
          externalConversationId: 'conv-1',
          state: 'started',
          sessionId: null,
          checkoutTokenHash: null,
          tokenConsumed: false,
          tokenExpiresAt: null,
          source: 'whatsapp_express',
          campaign: null,
          socialBookingSessionId: 'active-session',
          createdAt: { toMillis: () => Date.now() - 5 * 60 * 1000 },
          expiresAt: { toMillis: () => Date.now() + 25 * 60 * 1000 },
          updatedAt: { toMillis: () => Date.now() - 5 * 60 * 1000 },
        }),
      });

      const manager = createSessionManager();
      const session = await manager.getSession('active-session');

      expect(session).not.toBeNull();
      expect(session!.id).toBe('active-session');
      expect(session!.state).toBe('started');
    });

    it('should lazily mark session as expired and return updated state', async () => {
      mockGet.mockResolvedValue({
        exists: true,
        id: 'lazy-expired',
        data: () => ({
          channel: 'messenger',
          externalUserId: 'user-2',
          externalConversationId: 'conv-2',
          state: 'checkout-created',
          sessionId: 'session-x',
          checkoutTokenHash: 'abc123',
          tokenConsumed: false,
          tokenExpiresAt: null,
          source: 'messenger_express',
          campaign: null,
          socialBookingSessionId: 'lazy-expired',
          createdAt: { toMillis: () => Date.now() - 35 * 60 * 1000 },
          expiresAt: { toMillis: () => Date.now() - 5 * 60 * 1000 }, // expired
          updatedAt: { toMillis: () => Date.now() - 30 * 60 * 1000 },
        }),
      });

      const manager = createSessionManager();
      const session = await manager.getSession('lazy-expired');

      expect(session).not.toBeNull();
      expect(session!.state).toBe('expired');
      // Should have updated Firestore
      expect(mockUpdate).toHaveBeenCalledWith({
        state: 'expired',
        updatedAt: 'SERVER_TIMESTAMP',
      });
    });

    it('should NOT mark confirmed sessions as expired even if past expiresAt', async () => {
      mockGet.mockResolvedValue({
        exists: true,
        id: 'confirmed-session',
        data: () => ({
          channel: 'whatsapp',
          externalUserId: 'user-3',
          externalConversationId: 'conv-3',
          state: 'confirmed',
          sessionId: 'session-y',
          checkoutTokenHash: 'def456',
          tokenConsumed: true,
          tokenExpiresAt: null,
          source: 'whatsapp_express',
          campaign: null,
          socialBookingSessionId: 'confirmed-session',
          createdAt: { toMillis: () => Date.now() - 60 * 60 * 1000 },
          expiresAt: { toMillis: () => Date.now() - 30 * 60 * 1000 }, // past expiry
          updatedAt: { toMillis: () => Date.now() - 25 * 60 * 1000 },
        }),
      });

      const manager = createSessionManager();
      const session = await manager.getSession('confirmed-session');

      expect(session).not.toBeNull();
      expect(session!.state).toBe('confirmed');
      // Should NOT update to expired
      expect(mockUpdate).not.toHaveBeenCalled();
    });
  });
});
