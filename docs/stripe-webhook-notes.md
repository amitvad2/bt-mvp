# Stripe Webhook — Implementation Notes

All work is scoped to **Stripe test mode**. Do not use live keys with this implementation.

---

## What Changed

### Problem being solved

Previously, after `stripe.confirmPayment()` succeeded in the browser, `CheckoutForm.tsx` directly called:
- `addDoc(collection(db, 'bookings'), ...)` — created the booking
- `updateDoc(sessions/{id}, {spotsAvailable: increment(-1)})` — decremented capacity
- `updateDoc(students/{id}, {medicalInfo, emergencyContact, questionnaire})` — saved health data
- `fetch('/api/emails/send', ...)` — sent the confirmation email

If the user's network dropped between Stripe charging their card and any of these calls completing, payments were taken with no booking record created.

### New architecture

```
Browser                          Server                   Stripe
  │                                │                         │
  │ ── POST /api/payments/         │                         │
  │    create-intent ──────────────▶                         │
  │    (full booking payload)      │ create PaymentIntent ──▶│
  │                                │ write booking_drafts/   │
  │                                │   {pi_id}               │
  │ ◀── clientSecret ──────────────│                         │
  │                                │                         │
  │ stripe.confirmPayment()        │                         │
  │ ──────────────────────────────────────────────────────────▶
  │                                │                         │ charge card
  │ ◀────────────────────────────────── redirect/inline ─────│
  │                                │                         │
  │ navigate to /confirmation      │ ◀── webhook POST ───────│
  │   ?payment_intent=pi_xxx       │  payment_intent.succeeded
  │                                │                         │
  │                         fetch booking_drafts/pi_xxx      │
  │                         runTransaction:                  │
  │                           check idempotency              │
  │                           check session open + capacity  │
  │                           set bookings/pi_xxx            │
  │                           decrement spotsAvailable       │
  │                         update student profile           │
  │                         send confirmation email          │
  │                         delete booking_drafts/pi_xxx     │
  │                                │                         │
  │ poll getDoc(bookings/pi_xxx)   │                         │
  │ ◀── booking exists ────────────│                         │
  │ show confirmation details      │                         │
```

---

## Files Changed

| File | Change |
|------|--------|
| `src/app/api/webhooks/stripe/route.ts` | **New** — webhook handler |
| `src/app/api/payments/create-intent/route.ts` | Extended to accept full booking payload and write `booking_drafts` |
| `src/app/book/[sessionId]/payment/page.tsx` | Now imports `useAuth`, sends full booking state to create-intent |
| `src/app/book/[sessionId]/payment/CheckoutForm.tsx` | All Firestore + email calls removed; just handles Stripe UI |
| `src/app/book/[sessionId]/confirmation/page.tsx` | Accepts `?payment_intent` param; polls Firestore for webhook-created booking |
| `firestore.rules` | Removed client booking-create rule and client session spotsAvailable rule; added `booking_drafts` deny-all |

---

## Stripe Events Handled

| Event | Behaviour |
|-------|-----------|
| `payment_intent.succeeded` | Creates booking, decrements spots, updates student profile, sends email, deletes draft |
| `payment_intent.payment_failed` | Marks draft with `paymentStatus: 'failed'` and failure message for observability |

All other event types are acknowledged (200) without processing.

---

## Idempotency

Booking document ID = Stripe PaymentIntent ID (e.g. `bookings/pi_3Abc123...`).

The Firestore transaction checks whether the booking document already exists **before** writing it:

```typescript
const existingBooking = await tx.get(bookingRef);
if (existingBooking.exists) {
    // Duplicate webhook delivery — skip silently
    return;
}
```

Stripe guarantees at-least-once delivery. A duplicate `payment_intent.succeeded` event will read the already-existing booking and return without creating a duplicate or double-decrementing spots.

---

## How the Booking Draft Works

When `/api/payments/create-intent` is called:

1. A Stripe `PaymentIntent` is created with minimal metadata (IDs only — Stripe metadata values are strings with a 500-char limit).
2. A `booking_drafts/{paymentIntentId}` document is written to Firestore via **Firebase Admin SDK** (server-side). This document holds the full booking payload: session data, user data, student data, medical info, questionnaire, terms acceptance.
3. If the Firestore write fails, the PaymentIntent is **cancelled** via `stripe.paymentIntents.cancel(id)` so the user is never charged for a booking that can't be confirmed.

The webhook reads this draft document to reconstruct the booking without trusting any browser-side state.

---

## Confirmation Page — Polling Logic

After payment, the browser navigates to `/book/{sessionId}/confirmation?payment_intent=pi_xxx`.

Since the webhook may arrive a few hundred milliseconds to a few seconds after the redirect, the confirmation page polls Firestore:

```
poll attempts: 8
interval:      1500 ms
max wait:      ~12 seconds
```

If the booking document exists on any attempt, it is displayed immediately.

If all attempts are exhausted without a booking appearing, the page shows a "Payment Received" fallback with the payment reference and links to the portal. This handles the edge case of webhook delays > 12 seconds (Stripe retries webhooks up to 3 days, so the booking will eventually be created).

---

## Edge Cases

### Session sold out between PaymentIntent creation and webhook

If `spotsAvailable == 0` when the webhook processes:
- The booking is **still created** (payment was taken — business obligation to honour it)
- The `spotsAvailable` field is **not decremented** (can't go below 0)
- A `[webhook] Overbooking detected` warning is logged
- The booking document gets an `overbooking: true` flag for admin review

### Session closed/cancelled when webhook processes

If `status !== 'open'`:
- Booking is created without decrementing spots
- Warning is logged
- Admin should review and decide on refund

### Draft not found when webhook fires

This can happen if:
1. The Firestore draft write failed during `create-intent` (the PaymentIntent would have been cancelled in that case — so this scenario shouldn't produce a charge)
2. The webhook somehow fires for a PaymentIntent that was never associated with a draft

In either case, the webhook logs a critical error and returns 200 (to prevent Stripe from retrying indefinitely for an unrecoverable state). Manual intervention is required.

### Email sending fails

Confirmation email sending is **outside the Firestore transaction** and wrapped in `try/catch`. If it fails, the booking is still created. Resend can be retried manually from the Resend dashboard.

---

## Firestore Rules Changes

### Removed (now server-side only)

```javascript
// REMOVED from sessions:
allow update: if isSignedIn()
  && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['spotsAvailable'])
  && resource.data.status == 'open'
  && resource.data.spotsAvailable > 0
  && request.resource.data.spotsAvailable == resource.data.spotsAvailable - 1;

// REMOVED from bookings:
allow create: if isSignedIn()
  && request.resource.data.bookedByUid == request.auth.uid
  && request.resource.data.termsAccepted == true
  && request.resource.data.status == 'confirmed'
  && request.resource.data.payment.status in ['pending', 'paid'];
```

### Added

```javascript
// NEW: booking drafts — server-side only (Admin SDK bypasses rules)
match /booking_drafts/{docId} {
  allow read, write: if false;
}
```

No client can now create or modify booking documents or decrement session capacity. All these operations are exclusively performed by the webhook via Firebase Admin SDK.

---

## Local / Test Mode Verification

### Prerequisites

- Stripe CLI installed: https://stripe.com/docs/stripe-cli
- `.env.local` populated with test keys (`sk_test_...`, `pk_test_...`)

### Step 1 — Start the app

```bash
npm run dev
```

### Step 2 — Forward webhooks from Stripe CLI

In a new terminal:

```bash
stripe login
stripe listen --forward-to http://localhost:3000/api/webhooks/stripe
```

The CLI will print a webhook signing secret that starts with `whsec_`. Copy it.

### Step 3 — Set the webhook secret

Add or update in `.env.local`:

```
STRIPE_WEBHOOK_SECRET=whsec_<secret from CLI output>
```

Restart `npm run dev` after updating.

### Step 4 — Run a test booking

1. Log in and navigate to `/portal/find-class`
2. Book a session through the full wizard
3. On the payment page, use Stripe test card: `4242 4242 4242 4242`, any future expiry, any CVC
4. Submit payment

### Step 5 — Verify webhook processing

In the Stripe CLI terminal, you should see:
```
2024-xx-xx  payment_intent.created             [200]
2024-xx-xx  payment_intent.succeeded           [200]
```

In the app dev server terminal:
```
[webhook] Received event: payment_intent.succeeded — evt_xxx
[webhook] Booking pi_xxx created successfully
[webhook] Confirmation email sent to user@example.com
```

In the confirmation page: booking details displayed (or spinner for 1–2 seconds while webhook processes).

### Step 6 — Verify Firestore

In the Firebase Console → Firestore:
- `bookings/pi_xxx` document exists with `status: 'confirmed'`, `payment.status: 'paid'`
- `booking_drafts/pi_xxx` document has been deleted
- `sessions/{sessionId}.spotsAvailable` decremented by 1

### Test a failed payment

Use Stripe test card: `4000 0000 0000 0002` (card declined).

In Stripe CLI terminal:
```
payment_intent.payment_failed   [200]
```

In Firestore, `booking_drafts/pi_xxx` should have `paymentStatus: 'failed'`.

---

## Known Limitations Before Production Launch

1. **`STRIPE_WEBHOOK_SECRET` must be set to a Vercel/production endpoint secret** (not the local CLI secret) before deploying. Register the webhook endpoint in the Stripe Dashboard → Developers → Webhooks → Add endpoint: `https://yourdomain.com/api/webhooks/stripe`, events: `payment_intent.succeeded`, `payment_intent.payment_failed`.

2. **Receipt URL not populated.** The `payment.receiptUrl` field in the booking document is set to `null`. To populate it, the webhook would need to expand the charge object: `await stripe.paymentIntents.retrieve(piId, { expand: ['latest_charge'] })`. Low priority for MVP.

3. **No refund flow yet.** Admin cannot initiate Stripe refunds from the app. Refunds must be done via the Stripe Dashboard.

4. **Email from address.** In test mode, `onboarding@resend.dev` works as the sender. In production, `RESEND_FROM_EMAIL` must be set to a verified domain.

5. **Draft cleanup.** If the draft write succeeds but the PaymentIntent is never completed (user abandons the payment page), the `booking_drafts` document remains indefinitely. A Cloud Scheduler or Vercel Cron job deleting drafts older than 24 hours would clean these up.
