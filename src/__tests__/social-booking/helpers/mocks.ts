/**
 * Mock factories for Social Commerce Guest Booking tests.
 *
 * Provides in-memory mocks for Firestore, Vercel KV, Stripe, and Meta APIs.
 */
import { vi } from 'vitest';

// ─── Firestore Mock ──────────────────────────────────────────────────────────

export interface MockFirestoreDoc {
  id: string;
  data: Record<string, unknown>;
}

export interface MockFirestore {
  _store: Map<string, Map<string, MockFirestoreDoc>>;
  collection: ReturnType<typeof vi.fn>;
  doc: ReturnType<typeof vi.fn>;
  runTransaction: ReturnType<typeof vi.fn>;
  batch: ReturnType<typeof vi.fn>;
}

/**
 * Creates a mock Firestore Admin SDK instance with in-memory document store.
 * Supports collection/doc/get/set/update/where/transaction.
 */
export function createMockFirestore(): MockFirestore {
  const store = new Map<string, Map<string, MockFirestoreDoc>>();

  const getCollection = (collectionPath: string) => {
    if (!store.has(collectionPath)) {
      store.set(collectionPath, new Map());
    }
    return store.get(collectionPath)!;
  };

  const createDocRef = (collectionPath: string, docId: string) => {
    const docRef = {
      id: docId,
      path: `${collectionPath}/${docId}`,
      get: vi.fn(async () => {
        const col = getCollection(collectionPath);
        const doc = col.get(docId);
        return {
          exists: !!doc,
          id: docId,
          data: () => doc?.data ?? undefined,
          ref: docRef,
        };
      }),
      set: vi.fn(async (data: Record<string, unknown>, options?: { merge?: boolean }) => {
        const col = getCollection(collectionPath);
        if (options?.merge) {
          const existing = col.get(docId);
          col.set(docId, { id: docId, data: { ...existing?.data, ...data } });
        } else {
          col.set(docId, { id: docId, data });
        }
      }),
      update: vi.fn(async (data: Record<string, unknown>) => {
        const col = getCollection(collectionPath);
        const existing = col.get(docId);
        if (!existing) throw new Error(`Document ${collectionPath}/${docId} not found`);
        col.set(docId, { id: docId, data: { ...existing.data, ...data } });
      }),
      delete: vi.fn(async () => {
        const col = getCollection(collectionPath);
        col.delete(docId);
      }),
    };
    return docRef;
  };

  const createCollectionRef = (collectionPath: string) => {
    const collectionRef = {
      doc: vi.fn((docId?: string) => {
        const id = docId ?? crypto.randomUUID();
        return createDocRef(collectionPath, id);
      }),
      where: vi.fn((_field: string, _op: string, _value: unknown) => {
        // Returns a chainable query object
        const queryRef: Record<string, ReturnType<typeof vi.fn>> = {
          where: vi.fn(() => queryRef),
          orderBy: vi.fn(() => queryRef),
          limit: vi.fn(() => queryRef),
          get: vi.fn(async () => {
            const col = getCollection(collectionPath);
            const docs = Array.from(col.values()).map((doc) => ({
              id: doc.id,
              exists: true,
              data: () => doc.data,
              ref: createDocRef(collectionPath, doc.id),
            }));
            return { docs, empty: docs.length === 0, size: docs.length };
          }),
        };
        return queryRef;
      }),
      orderBy: vi.fn(() => collectionRef),
      limit: vi.fn(() => collectionRef),
      get: vi.fn(async () => {
        const col = getCollection(collectionPath);
        const docs = Array.from(col.values()).map((doc) => ({
          id: doc.id,
          exists: true,
          data: () => doc.data,
          ref: createDocRef(collectionPath, doc.id),
        }));
        return { docs, empty: docs.length === 0, size: docs.length };
      }),
      add: vi.fn(async (data: Record<string, unknown>) => {
        const id = crypto.randomUUID();
        const col = getCollection(collectionPath);
        col.set(id, { id, data });
        return createDocRef(collectionPath, id);
      }),
    };
    return collectionRef;
  };

  const mockFirestore: MockFirestore = {
    _store: store,
    collection: vi.fn((path: string) => createCollectionRef(path)),
    doc: vi.fn((path: string) => {
      const parts = path.split('/');
      const collectionPath = parts.slice(0, -1).join('/');
      const docId = parts[parts.length - 1];
      return createDocRef(collectionPath, docId);
    }),
    runTransaction: vi.fn(async (updateFn: (transaction: unknown) => Promise<unknown>) => {
      // Simplified transaction mock — runs the function with a transaction-like object
      const transaction = {
        get: vi.fn(async (docRef: { get: () => Promise<unknown> }) => docRef.get()),
        set: vi.fn((docRef: { set: (data: unknown) => Promise<void> }, data: unknown) => {
          docRef.set(data as Record<string, unknown>);
        }),
        update: vi.fn((docRef: { update: (data: unknown) => Promise<void> }, data: unknown) => {
          docRef.update(data as Record<string, unknown>);
        }),
        delete: vi.fn((docRef: { delete: () => Promise<void> }) => {
          docRef.delete();
        }),
      };
      return updateFn(transaction);
    }),
    batch: vi.fn(() => ({
      set: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      commit: vi.fn(async () => {}),
    })),
  };

  return mockFirestore;
}

// ─── Vercel KV Mock ──────────────────────────────────────────────────────────

export interface MockKV {
  _store: Map<string, { value: string | number; expiresAt?: number }>;
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  incr: ReturnType<typeof vi.fn>;
  expire: ReturnType<typeof vi.fn>;
  del: ReturnType<typeof vi.fn>;
  exists: ReturnType<typeof vi.fn>;
}

/**
 * Creates a mock Vercel KV instance with in-memory Map.
 * Supports get/set/incr/expire/del/exists with TTL simulation.
 */
export function createMockKV(): MockKV {
  const store = new Map<string, { value: string | number; expiresAt?: number }>();

  const isExpired = (key: string): boolean => {
    const entry = store.get(key);
    if (!entry) return true;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      store.delete(key);
      return true;
    }
    return false;
  };

  const mockKV: MockKV = {
    _store: store,
    get: vi.fn(async (key: string) => {
      if (isExpired(key)) return null;
      const entry = store.get(key);
      return entry?.value ?? null;
    }),
    set: vi.fn(async (key: string, value: string | number, options?: { ex?: number; px?: number }) => {
      let expiresAt: number | undefined;
      if (options?.ex) expiresAt = Date.now() + options.ex * 1000;
      if (options?.px) expiresAt = Date.now() + options.px;
      store.set(key, { value, expiresAt });
      return 'OK';
    }),
    incr: vi.fn(async (key: string) => {
      if (isExpired(key)) {
        store.set(key, { value: 1 });
        return 1;
      }
      const entry = store.get(key)!;
      const newValue = (typeof entry.value === 'number' ? entry.value : parseInt(String(entry.value), 10) || 0) + 1;
      entry.value = newValue;
      return newValue;
    }),
    expire: vi.fn(async (key: string, seconds: number) => {
      const entry = store.get(key);
      if (!entry) return 0;
      entry.expiresAt = Date.now() + seconds * 1000;
      return 1;
    }),
    del: vi.fn(async (...keys: string[]) => {
      let count = 0;
      for (const key of keys) {
        if (store.has(key)) {
          store.delete(key);
          count++;
        }
      }
      return count;
    }),
    exists: vi.fn(async (...keys: string[]) => {
      let count = 0;
      for (const key of keys) {
        if (!isExpired(key) && store.has(key)) count++;
      }
      return count;
    }),
  };

  return mockKV;
}

// ─── Stripe Mock ─────────────────────────────────────────────────────────────

export interface MockStripe {
  paymentIntents: {
    create: ReturnType<typeof vi.fn>;
    retrieve: ReturnType<typeof vi.fn>;
    confirm: ReturnType<typeof vi.fn>;
  };
  webhooks: {
    constructEvent: ReturnType<typeof vi.fn>;
  };
}

/**
 * Creates a mock Stripe client with PaymentIntent and webhook utilities.
 */
export function createMockStripe(): MockStripe {
  return {
    paymentIntents: {
      create: vi.fn(async (params: { amount: number; currency: string; metadata?: Record<string, string> }) => ({
        id: `pi_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`,
        amount: params.amount,
        currency: params.currency,
        status: 'requires_payment_method',
        client_secret: `pi_${crypto.randomUUID()}_secret_${crypto.randomUUID()}`,
        metadata: params.metadata ?? {},
      })),
      retrieve: vi.fn(async (id: string) => ({
        id,
        amount: 1500,
        currency: 'gbp',
        status: 'succeeded',
        metadata: {},
      })),
      confirm: vi.fn(async (id: string) => ({
        id,
        status: 'succeeded',
      })),
    },
    webhooks: {
      constructEvent: vi.fn((body: string, signature: string, _secret: string) => {
        // Simple mock — returns a parsed event-like object
        const parsed = typeof body === 'string' ? JSON.parse(body) : body;
        return {
          id: `evt_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`,
          type: parsed.type ?? 'payment_intent.succeeded',
          data: {
            object: parsed.data?.object ?? { id: 'pi_test', status: 'succeeded', metadata: {} },
          },
          created: Math.floor(Date.now() / 1000),
          livemode: false,
          api_version: '2024-04-10',
          request: { id: signature },
        };
      }),
    },
  };
}

// ─── Meta API Mock ───────────────────────────────────────────────────────────

export interface MockMetaAPIResponse {
  ok: boolean;
  status: number;
  json: () => Promise<Record<string, unknown>>;
}

export interface MockMetaAPI {
  sendMessage: ReturnType<typeof vi.fn>;
  sendInteractiveMessage: ReturnType<typeof vi.fn>;
  /** Resets all call counts */
  reset: () => void;
  /** Configures next response to be an error */
  simulateError: (statusCode?: number) => void;
  /** Restores to success responses */
  simulateSuccess: () => void;
}

/**
 * Creates a mock Meta messaging API for WhatsApp/Instagram/Messenger.
 * Returns success responses by default; call simulateError() to test failure paths.
 */
export function createMockMetaAPI(): MockMetaAPI {
  let shouldFail = false;
  let errorStatus = 500;

  const createSuccessResponse = (): MockMetaAPIResponse => ({
    ok: true,
    status: 200,
    json: async () => ({
      messaging_product: 'whatsapp',
      contacts: [{ input: '+447700000000', wa_id: '447700000000' }],
      messages: [{ id: `wamid.${crypto.randomUUID()}` }],
    }),
  });

  const createErrorResponse = (): MockMetaAPIResponse => ({
    ok: false,
    status: errorStatus,
    json: async () => ({
      error: {
        message: 'Internal server error',
        type: 'OAuthException',
        code: errorStatus,
        fbtrace_id: 'trace_mock_123',
      },
    }),
  });

  const mockAPI: MockMetaAPI = {
    sendMessage: vi.fn(async () => {
      if (shouldFail) return createErrorResponse();
      return createSuccessResponse();
    }),
    sendInteractiveMessage: vi.fn(async () => {
      if (shouldFail) return createErrorResponse();
      return createSuccessResponse();
    }),
    reset: () => {
      mockAPI.sendMessage.mockClear();
      mockAPI.sendInteractiveMessage.mockClear();
      shouldFail = false;
      errorStatus = 500;
    },
    simulateError: (statusCode = 500) => {
      shouldFail = true;
      errorStatus = statusCode;
    },
    simulateSuccess: () => {
      shouldFail = false;
    },
  };

  return mockAPI;
}

// ─── Fetch Mock Helper ───────────────────────────────────────────────────────

/**
 * Creates a mock fetch function for Meta API HTTP calls.
 * Routes based on URL to return appropriate Meta API responses.
 */
export function createMockFetch(metaAPI: MockMetaAPI) {
  return vi.fn(async (url: string, options?: RequestInit) => {
    const body = options?.body ? JSON.parse(options.body as string) : {};

    // WhatsApp Cloud API
    if (url.includes('graph.facebook.com') && url.includes('/messages')) {
      if (body.interactive || body.type === 'interactive') {
        return metaAPI.sendInteractiveMessage(body);
      }
      return metaAPI.sendMessage(body);
    }

    // Instagram Messaging API
    if (url.includes('graph.facebook.com') && url.includes('/me/messages')) {
      return metaAPI.sendMessage(body);
    }

    // Default — return success
    return metaAPI.sendMessage(body);
  });
}
