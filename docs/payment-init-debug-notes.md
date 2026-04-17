# Payment Initialisation — Debug Notes

Last updated: 2026-04-17

---

## Root Cause (Fixed)

**Symptom:** Payment page shows "Payment Initialisation Failed" / "Failed to initialize booking. Please try again." Stripe Elements never render.

**Root cause:** `FIREBASE_ADMIN_SERVICE_ACCOUNT` in `.env.local` was a stub:

```
FIREBASE_ADMIN_SERVICE_ACCOUNT={"type":"service_account","project_id":"bt-mvp-d057f"}
```

This is valid JSON, so `JSON.parse()` succeeded. However, the object is missing `private_key` and `client_email` — the two fields the Firebase Admin SDK needs to authenticate. What happened:

1. `admin.credential.cert(incompleteObject)` threw a `FirebaseAppError`
2. The old `catch` block in `firebase-admin.ts` silently fell back to Application Default Credentials (ADC)
3. ADC is not configured in local development — no `gcloud auth application-default login` ran
4. When `create-intent` called `adminDb.doc().set()`, Firestore rejected it with a `PERMISSION_DENIED` / `UNAUTHENTICATED` error (code 7 or 16)
5. `create-intent` caught the Firestore error, cancelled the Stripe PaymentIntent (correct behaviour), and returned HTTP 500: `"Failed to initialize booking. Please try again."`
6. The client displayed that error string under "Payment Initialisation Failed"

The failure was **silent** because the old `firebase-admin.ts` used `console.warn` and swallowed the init error without exporting it.

---

## Files Changed

| File | Change |
|------|--------|
| `src/lib/firebase-admin.ts` | Validates required service account fields before init; exports `adminInitError`; replaces silent `console.warn` with `console.error`; clear error messages naming the exact fix |
| `src/app/api/payments/create-intent/route.ts` | Imports `adminInitError`; fails fast before creating a PaymentIntent if Admin SDK is broken; in `dev` mode returns the exact config error to the browser; improved Firestore error logging (includes `code` and `details`) |
| `.env.local` | Added comments above the placeholder explaining what must be replaced and where to get the full JSON |
| `.env.local.example` | Full service account JSON template showing all required fields with a warning about stubs |

---

## Required `.env.local` Variables (Stripe test mode)

```bash
# Firebase client SDK — safe to expose (NEXT_PUBLIC_ prefix)
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSy...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=bt-mvp-d057f.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=bt-mvp-d057f
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=bt-mvp-d057f.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=428761292406
NEXT_PUBLIC_FIREBASE_APP_ID=1:428761292406:web:...

# Firebase Admin SDK — FULL service account JSON on one line (never expose to browser)
FIREBASE_ADMIN_SERVICE_ACCOUNT={"type":"service_account","project_id":"bt-mvp-d057f","private_key_id":"abc123","private_key":"-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----\n","client_email":"firebase-adminsdk-xxx@bt-mvp-d057f.iam.gserviceaccount.com","client_id":"...","auth_uri":"https://accounts.google.com/o/oauth2/auth","token_uri":"https://oauth2.googleapis.com/token","auth_provider_x509_cert_url":"https://www.googleapis.com/oauth2/v1/certs","client_x509_cert_url":"..."}

# Stripe (test mode keys — sk_test_ and pk_test_ prefixes)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_51T2H3b...
STRIPE_SECRET_KEY=sk_test_51T2H3b...
STRIPE_WEBHOOK_SECRET=whsec_...   # from: stripe listen output (local) or Stripe Dashboard (prod)

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Resend (optional for local dev — omit to skip emails silently)
RESEND_API_KEY=re_...
```

### How to get the Firebase Admin service account

1. Open [Firebase Console](https://console.firebase.google.com) and select project `bt-mvp-d057f`
2. Click the gear icon → **Project settings**
3. Select the **Service accounts** tab
4. Click **Generate new private key** → **Generate key**
5. A `.json` file downloads — open it in a text editor
6. Copy the **entire contents** and paste it as a single line (the file may have literal newlines inside `private_key` — these must remain as `\n` escape sequences in the env var, which the downloaded JSON already uses)
7. Set `FIREBASE_ADMIN_SERVICE_ACCOUNT=<paste here>` in `.env.local` with no surrounding quotes beyond what the JSON itself contains

---

## How to Verify the Fix Locally

### Step 1 — Check server logs on startup

After replacing the service account and restarting `npm run dev`, you should see in the terminal:

```
[firebase-admin] Initialized with service account for project: bt-mvp-d057f
```

If you still see an error like:
```
[firebase-admin] Initialization failed: FIREBASE_ADMIN_SERVICE_ACCOUNT is missing required fields: private_key, client_email.
```
…the service account JSON is still incomplete or incorrectly formatted.

### Step 2 — Try the payment flow

1. Log in and navigate to `/portal/find-class`
2. Book a session through the full wizard
3. On the payment page, check the browser Network tab for `POST /api/payments/create-intent`
4. On success, the response should be `200` with `{ clientSecret: "pi_..._secret_...", paymentIntentId: "pi_..." }`
5. Stripe Elements should render immediately

### Step 3 — Forward webhooks (separate terminal)

```powershell
C:\stripe\stripe listen --forward-to http://localhost:3000/api/webhooks/stripe
```

Copy the `whsec_...` secret it prints and set it as `STRIPE_WEBHOOK_SECRET` in `.env.local`. Restart the dev server.

### Step 4 — Complete a test payment

Use Stripe test card: `4242 4242 4242 4242`, any future expiry, any CVC.

Expected server logs:
```
[create-intent] Creating PaymentIntent: { sessionId: ..., amount: ..., bookedByUid: ... }
[create-intent] PaymentIntent created: pi_xxx
[create-intent] Booking draft saved: pi_xxx
[webhook] Received event: payment_intent.succeeded — evt_xxx
[webhook] Booking pi_xxx created successfully
[webhook] Confirmation email sent to ...
```

---

## Common Failure Modes

| Symptom | Cause | Fix |
|---------|-------|-----|
| "Payment Initialisation Failed" / "Failed to initialize booking" | `FIREBASE_ADMIN_SERVICE_ACCOUNT` stub/missing `private_key` + `client_email` | Replace with full service account JSON from Firebase Console |
| "Server configuration error: FIREBASE_ADMIN_SERVICE_ACCOUNT is missing required fields…" (dev mode) | Same as above — now surfaced clearly in dev | Replace service account JSON |
| "Payment service is not configured" | `STRIPE_SECRET_KEY` not set | Add `STRIPE_SECRET_KEY=sk_test_...` to `.env.local` |
| "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is missing" banner on payment page | Missing publishable key | Add `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...` |
| Spinner never resolves (no error) | `user` or `btUser` not loaded (auth context still loading) | Check Firebase client SDK vars are set; check browser console for auth errors |
| Webhook not firing locally | `STRIPE_WEBHOOK_SECRET` not set or Stripe CLI not running | Run `C:\stripe\stripe listen --forward-to http://localhost:3000/api/webhooks/stripe` and copy the printed secret |
| Booking not created, confirmation page shows "Payment Received" fallback | Webhook received but no booking draft found (draft write failed at create-intent time) | Check server logs for `[create-intent] Failed to save booking draft` |
| `PERMISSION_DENIED` in Firestore server logs | Admin SDK initialized with ADC that lacks Firestore access | Replace service account JSON |

---

## Architecture Reminder

```
payment/page.tsx
  └── POST /api/payments/create-intent
        ├── [FAIL FAST] adminInitError check  ← NEW
        ├── stripe.paymentIntents.create()
        ├── adminDb.doc('booking_drafts/{piId}').set(fullPayload)
        │     └── [if fails] stripe.paymentIntents.cancel()  → 500 to client
        └── return { clientSecret, paymentIntentId }

Stripe → POST /api/webhooks/stripe
  ├── verify signature
  ├── adminDb.runTransaction(idempotency + capacity + bookings/{piId}.set())
  ├── adminDb.doc('students/{id}').update(medicalInfo)
  ├── resend.emails.send(confirmation)
  └── adminDb.doc('booking_drafts/{piId}').delete()
```

Booking creation **never** happens in the browser. If `create-intent` fails, the Stripe PaymentIntent is cancelled before the user is charged.
