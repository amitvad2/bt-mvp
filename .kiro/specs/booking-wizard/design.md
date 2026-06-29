# Design Document — Booking Wizard

## Overview

The Booking Wizard is a 6-step multi-page checkout flow at `/book/[sessionId]/` that guides an authenticated Blooming Tastebuds user from participant selection through to booking confirmation. It supports two class types with different step sets:

- **`kidsAfterSchool`** — parent books on behalf of a child; includes Emergency Contact and dietary Questionnaire steps.
- **`youngAdultWeekend`** — young adult books for themselves; Questionnaire step is skipped entirely.

Booking creation is entirely server-authoritative. The browser never writes to the `bookings` collection directly. The Stripe webhook (`payment_intent.succeeded`) is the single source of truth for finalising a booking and decrementing session capacity.

**Key design decisions:**
- Wizard state is accumulated in `BookingContext` and persisted to `sessionStorage` so hard refreshes and Stripe redirects do not lose user progress.
- The `booking_draft` document bridges the browser ↔ server boundary: `create-intent` writes it, the webhook reads it.
- PaymentIntent ID is used as both the `booking_draft` and `booking` document ID, providing a natural idempotency key.
- The price is read server-side from Firestore and never accepted from the client body.

---

## Architecture

### High-Level Data Flow

```
Browser                         Next.js Server              Stripe           Firestore
  │                                   │                        │                  │
  │  1. GET /book/[sessionId]/student  │                        │                  │
  │──────────────────────────────────>│                        │                  │
  │  BookingProvider mounts;          │                        │                  │
  │  fetches sessions/{sessionId}     │                        │                  │
  │<── session doc ────────────────────────────────────────────────────────────── │
  │                                   │                        │                  │
  │  2. User completes steps 1–4      │                        │                  │
  │     (student, medical,            │                        │                  │
  │      questionnaire?, terms)       │                        │                  │
  │                                   │                        │                  │
  │  3. POST /api/payments/           │                        │                  │
  │     create-intent                 │                        │                  │
  │──────────────────────────────────>│                        │                  │
  │     Authorization: Bearer <token> │                        │                  │
  │                                   │ verifyIdToken(token)   │                  │
  │                                   │ read sessions/{id}     │                  │
  │                                   │ (price from Firestore) │                  │
  │                                   │──── create PI ────────>│                  │
  │                                   │<─── {id, clientSecret} │                  │
  │                                   │──── write booking_drafts/{piId} ─────────>│
  │<── {clientSecret, piId} ──────────│                        │                  │
  │                                   │                        │                  │
  │  4. Stripe Elements renders       │                        │                  │
  │     User submits card             │                        │                  │
  │──────────────────────── confirmPayment ──────────────────>│                  │
  │<─────────────── paymentIntent.status=succeeded ───────────│                  │
  │                                   │                        │                  │
  │  5. router.push(/confirmation     │                        │                  │
  │     ?payment_intent=pi_xxx)       │                        │                  │
  │                                   │                        │                  │
  │                                   │<─ payment_intent.succeeded event ─────────│
  │                                   │   POST /api/webhooks/stripe               │
  │                                   │   verifySignature                         │
  │                                   │   read booking_drafts/{piId} ────────────>│
  │                                   │   Firestore transaction:                  │
  │                                   │     create bookings/{piId}                │
  │                                   │     decrement spotsAvailable  ───────────>│
  │                                   │   delete booking_drafts/{piId} ──────────>│
  │                                   │   send confirmation email                 │
  │                                   │──── HTTP 200 ─────────>│                  │
  │                                   │                        │                  │
  │  6. Confirmation page polls       │                        │                  │
  │     bookings/{piId} (up to 8×)    │                        │                  │
  │<── booking doc ────────────────────────────────────────────────────────────── │
  │  Display booking confirmation     │                        │                  │
```

### Security Layers

| Layer | Mechanism | Scope |
|-------|-----------|-------|
| UX gate | `bt_session` cookie checked by Edge middleware (`middleware.ts`) | `/book/*` — redirects unauthenticated browsers before any page loads |
| API auth | Firebase Admin `verifyIdToken` in `create-intent` | Ensures UID comes from a valid Firebase ID token, never from the request body |
| Student ownership | `students/{studentId}.parentUid === verifiedUid` check in `create-intent` | Prevents a parent from booking a session using another family's student |
| Price integrity | `session.price` read from Firestore in `create-intent`; client `amount` field is ignored | Prevents price manipulation |
| Webhook integrity | Stripe signature verification using `STRIPE_WEBHOOK_SECRET` | Ensures only genuine Stripe events trigger booking creation |
| Data boundary | Firestore security rules | `bookings` and `booking_drafts` are never readable or writable from the client SDK |

---

## Component Architecture

### `BookingProvider` (`src/context/BookingContext.tsx`)

The `BookingProvider` is mounted at the `book/[sessionId]/layout.tsx` level — one provider instance per session being booked.

**Responsibilities:**
- Holds `BookingWizardState` in React state.
- On mount: reads `sessionStorage` under key `booking_{sessionId}` and restores prior state if present.
- Fetches the `sessions/{sessionId}` document from Firestore (client SDK) and stores it in state as `session`.
- After every state update where `Object.keys(state).length > 1`, persists the full state to `sessionStorage` as JSON.
- Exposes setter callbacks (`setStudent`, `setMedicalInfo`, `setEmergencyContact`, `setQuestionnaire`, `setTermsAccepted`) — each merges into the existing state via `setState(prev => ({...prev, ...}))`.
- Exposes `clearState()` which resets in-memory state to `{ sessionId }` and removes the `sessionStorage` entry.

**Exposed context shape:**
```ts
interface BookingContextType {
  state: BookingWizardState;
  loading: boolean;
  setSession: (session: Session) => void;
  setStudent: (student: Student | 'self') => void;
  setMedicalInfo: (info: MedicalInfo) => void;
  setEmergencyContact: (contact: EmergencyContact) => void;
  setQuestionnaire: (q: Questionnaire) => void;
  setTermsAccepted: (accepted: boolean) => void;
  clearState: () => void;
}
```

### `BookingLayout` + `WizardLayoutInner` (`book/[sessionId]/layout.tsx`)

`BookingLayout` is a `'use client'` Server Component wrapper that:
1. Reads `sessionId` from `useParams()`.
2. Wraps children in `<BookingProvider sessionId={sessionId}>`.
3. Renders `WizardLayoutInner` which consumes `useBooking()` to access `state` and `loading`.

`WizardLayoutInner` renders:
- A branded header with session name, date, and venue (populated once `state.session` is loaded).
- A progress stepper built from a filtered step list. The `questionnaire` step has a `condition` function: `(state) => state.session?.classType === 'kidsAfterSchool'`. Steps without a `condition` are always shown.
- The `<main>` content slot (`children`).

A full-screen spinner is shown while `loading === true`.

### Step 1 — `StudentSelectionPage` (`book/[sessionId]/student/page.tsx`)

**`youngAdult` branch:**  
Renders a "Booking for yourself" confirmation card. The single button calls `handleSelect('self')`, which checks `session.classType !== 'kidsAfterSchool'` before calling `setStudent('self')` and navigating to `/medical`.

**`parent` branch:**  
Fetches all `students` documents where `parentUid === user.uid` using the Firebase client SDK. Renders a grid of student cards plus an "Add New Student" card.

On selecting an existing student: calls `calculateAgeOnDate(student.dateOfBirth, session.date)` and validates `ageMin ≤ age ≤ ageMax`. On failure, sets `validationError`. On success, calls `setStudent(student)` and navigates to `/medical`.

On adding a new student: validates age client-side first; only calls `addDoc(collection(db, 'students'), ...)` if age passes. Then calls `setStudent(newStudent)` and navigates to `/medical`.

The `calculateAgeOnDate` helper:
```ts
function calculateAgeOnDate(dobStr: string, sessionDateStr: string): number {
  const dob = new Date(dobStr);
  const sessionDate = new Date(sessionDateStr);
  let age = sessionDate.getFullYear() - dob.getFullYear();
  const m = sessionDate.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && sessionDate.getDate() < dob.getDate())) age--;
  return age;
}
```

### Step 2 — `MedicalInfoPage` (`book/[sessionId]/medical/page.tsx`)

Uses React Hook Form (no Zod resolver on the client side — validation is via HTML `required` attributes).

Pre-populates from `state.medicalInfo` or the selected student's `student.medicalInfo` if present.

If `session.classType === 'kidsAfterSchool'` (`isKid`), additionally renders the `EmergencyContact` sub-form.

On submit:
- Calls `setMedicalInfo(medicalInfo)` and (if `isKid`) `setEmergencyContact(emergencyContact)`.
- Navigates to `/questionnaire` if `isKid`, or directly to `/terms` if `youngAdultWeekend`.

### Step 3 — `QuestionnairePage` (`book/[sessionId]/questionnaire/page.tsx`)

Only reachable for `kidsAfterSchool` sessions (the layout stepper conditionally omits the step for `youngAdultWeekend`, and `MedicalInfoPage` navigates past it).

Pre-populates from `state.questionnaire` or `student.questionnaire`.

Renders 7 textarea questions with `maxLength={250}` and `required`. On submit, calls `setQuestionnaire(data)` and navigates to `/terms`.

### Step 4 — `TermsAcceptancePage` (`book/[sessionId]/terms/page.tsx`)

Displays a booking summary (class name, participant, date, venue, price) and key T&C bullet points.

A controlled checkbox drives `setTermsAccepted(checked)`. The "Go to Payment" button is `disabled={!state.termsAccepted}`. Navigation to `/payment` only occurs if `state.termsAccepted === true`.

### Step 5 — `PaymentPage` + `CheckoutForm` (`book/[sessionId]/payment/`)

**`PaymentPage`:**
- Uses `useRef(false)` (`intentCreated`) to prevent React 19 Strict Mode's double `useEffect` invocation from creating two PaymentIntents.
- Waits for both `bookingLoading` and `authLoading` to be false and `user`/`btUser` to be non-null.
- Calls `POST /api/payments/create-intent` with `Authorization: Bearer <idToken>` and the full wizard payload.
- On success, stores the returned `clientSecret` in state. Renders `<Elements>` with the `clientSecret` and `stripePromise`.
- On error, shows an alert with a reload button.
- Displays the price as `£{(session.price / 100).toFixed(2)}` — informational only.

**`CheckoutForm`:**
- Renders Stripe's `<PaymentElement layout="tabs">`. The submit button is disabled until `onReady` fires.
- Calls `stripe.confirmPayment({ redirect: 'if_required' })`. If payment succeeds inline (no redirect needed), calls `router.push(/book/{sessionId}/confirmation?payment_intent={piId})`. If a redirect is required, Stripe handles the navigation and appends `?payment_intent=pi_xxx&redirect_status=succeeded` to the `return_url`.

### Step 6 — `ConfirmationPage` (`book/[sessionId]/confirmation/page.tsx`)

- On mount: calls `clearState()` to clean up `sessionStorage`.
- Reads `?payment_intent` from search params (falls back to `?bookingId` for legacy support).
- Polls `bookings/{lookupId}` using `getDoc()` in a loop: up to `MAX_ATTEMPTS = 8` iterations, `POLL_INTERVAL_MS = 1500` ms apart (~12 s total).
- While polling: shows "Confirming Your Booking..." spinner.
- On document found: shows full booking detail card (reference, class, date, venue, participant).
- On poll exhausted without document: shows "Payment Received" message with the last 12 characters of the PaymentIntent ID as a support reference.

---

## API Design

### `POST /api/payments/create-intent`

**Source:** `src/app/api/payments/create-intent/route.ts`

#### Request

```
POST /api/payments/create-intent
Authorization: Bearer <Firebase ID token>
Content-Type: application/json
```

```jsonc
{
  // Required
  "sessionId": "string",

  // User display fields — UID is taken from the verified token, never from the body
  "bookedByName": "string",
  "bookedByEmail": "string",

  // Student — null if booking is for 'self'
  "studentId": "string | null",
  "studentName": "string",

  // Denormalized session fields (sourced from BookingContext.state.session)
  "sessionDate": "string (YYYY-MM-DD)",
  "className": "string",
  "venueName": "string",
  "startTime": "string",
  "endTime": "string",
  "classType": "'kidsAfterSchool' | 'youngAdultWeekend'",

  // Booking data
  "medicalInfo": "MedicalInfo | null",
  "emergencyContact": "EmergencyContact | null",
  "questionnaire": "Questionnaire | null",
  "termsAccepted": "boolean"

  // NOTE: 'amount' is intentionally NOT in this schema.
  // The server reads session.price from Firestore. Any client-supplied amount field is ignored.
}
```

#### Processing Steps

1. Extract `Authorization: Bearer <token>` header; reject with 401 if absent or invalid.
2. Check `adminInitError`; return 500 if Firebase Admin SDK is not initialised.
3. Validate `sessionId` is present; return 400 if missing.
4. If `studentId` is provided, verify `students/{studentId}.parentUid === verifiedUid`; return 403 if not.
5. Read `sessions/{sessionId}` from Firestore via Admin SDK; return 400 if not found.
6. Check `session.status === 'open'`; return 400 if not.
7. Check `session.spotsAvailable > 0`; return 400 if not.
8. Read `session.price` as the authoritative `amount`.
9. Create Stripe `PaymentIntent`: `{ amount, currency: 'gbp', automatic_payment_methods: { enabled: true }, metadata: { sessionId, studentId, bookedByUid: verifiedUid, className, env } }`.
10. Write `booking_drafts/{paymentIntent.id}` with full payload (`bookedByUid` from verified token).
11. If the Firestore write fails: cancel the PaymentIntent, return 500.
12. Return 200 `{ clientSecret, paymentIntentId }`.

#### Success Response (200)

```jsonc
{
  "clientSecret": "pi_xxx_secret_yyy",
  "paymentIntentId": "pi_xxx"
}
```

#### Error Responses

| Status | Condition |
|--------|-----------|
| 400 | `sessionId` missing |
| 400 | Session not found |
| 400 | `session.status !== 'open'` |
| 400 | `session.spotsAvailable <= 0` |
| 401 | Missing or invalid `Authorization` header |
| 403 | `studentId` provided but does not belong to the caller |
| 500 | Firebase Admin SDK not initialised (`adminInitError`) |
| 500 | Stripe `PaymentIntent` creation failed |
| 500 | Firestore `booking_drafts` write failed (PaymentIntent is cancelled) |

### `POST /api/webhooks/stripe`

**Source:** `src/app/api/webhooks/stripe/route.ts`

#### Request

Stripe sends raw bytes with a `Stripe-Signature` header. The handler reads `req.arrayBuffer()` to preserve the raw body for signature verification.

#### Event Handling

**`payment_intent.succeeded`**

1. Fetch `booking_drafts/{piId}` via Admin SDK. If absent, log critical error and return 200 (manual intervention needed).
2. Open Firestore transaction:
   a. Read `bookings/{piId}` — if it already exists, set `alreadyProcessed = true` and return (idempotency guard).
   b. Read `sessions/{sessionId}`.
   c. If `session.status !== 'open'`: create booking doc without decrementing `spotsAvailable`.
   d. If `session.spotsAvailable <= 0`: create booking doc with `overbooking: true`, no decrement.
   e. Happy path: `tx.set(bookings/{piId}, buildBookingDoc(...))` + `tx.update(sessions/{sessionId}, { spotsAvailable: FieldValue.increment(-1) })`.
3. (Best-effort, outside transaction) Update `students/{studentId}` with `medicalInfo`, `emergencyContact`, `questionnaire` if a real student is linked.
4. (Best-effort) Send confirmation email via Resend.
5. (Best-effort) Delete `booking_drafts/{piId}`.
6. Return 200 `{ received: true }`.

**`payment_intent.payment_failed`**

Update `booking_drafts/{piId}` with `{ paymentStatus: 'failed', failureMessage, failedAt: serverTimestamp() }`. Return 200.

**Unhandled event types**

Log and return 200.

**Unhandled exceptions**

Return 500 so Stripe retries the event.

#### Response

```jsonc
// Always 200 on success (Stripe requires 2xx to acknowledge)
{ "received": true }

// 400 on signature verification failure
{ "error": "Webhook signature error: ..." }

// 500 on unhandled exception (causes Stripe to retry)
{ "error": "Internal webhook handler error" }
```

---

## Data Models

### `BookingWizardState` (client-side, `sessionStorage`)

```ts
interface BookingWizardState {
  sessionId: string;          // Always present — the Firestore session document ID
  session?: Session;          // Fetched from Firestore on BookingProvider mount
  studentId?: string;         // undefined when student === 'self'
  student?: Student | 'self'; // 'self' for youngAdult bookings; Student object for parent bookings
  medicalInfo?: MedicalInfo;
  emergencyContact?: EmergencyContact; // Only populated for kidsAfterSchool sessions
  questionnaire?: Questionnaire;       // Only populated for kidsAfterSchool sessions
  termsAccepted?: boolean;
}
```

Persisted to `sessionStorage` under key `booking_{sessionId}` as JSON. Cleared by `clearState()` when the confirmation page mounts.

### `Booking_Draft` document (`booking_drafts/{paymentIntentId}`)

Written by `create-intent`. Read (and deleted) by the webhook. Never accessible via the client SDK.

```ts
{
  // Payment
  stripePaymentIntentId: string;   // = document ID
  paymentStatus: 'pending' | 'failed';

  // Session (denormalized)
  sessionId: string;
  sessionDate: string | null;      // YYYY-MM-DD
  className: string | null;
  venueName: string | null;
  startTime: string | null;
  endTime: string | null;
  classType: 'kidsAfterSchool' | 'youngAdultWeekend' | null;

  // User — UID from verified token only, never from request body
  bookedByUid: string;
  bookedByName: string | null;
  bookedByEmail: string | null;

  // Student
  studentId: string | null;       // null when booking is for 'self'
  studentName: string | null;

  // Booking data
  medicalInfo: MedicalInfo | null;
  emergencyContact: EmergencyContact | null;
  questionnaire: Questionnaire | null;  // null for youngAdultWeekend
  termsAccepted: boolean;

  // Timestamps
  createdAt: Timestamp;
  failedAt?: Timestamp;        // Set on payment_intent.payment_failed
  failureMessage?: string;     // Set on payment_intent.payment_failed
}
```

### `Booking` document (`bookings/{paymentIntentId}`)

Created exclusively by the Stripe webhook. Document ID = Stripe PaymentIntent ID.

```ts
{
  // Session (denormalized from draft)
  sessionId: string;
  sessionDate: string;           // YYYY-MM-DD
  className: string;
  venueName: string;
  startTime: string | null;
  endTime: string | null;

  // User
  bookedByUid: string;           // From the verified token — never from client body
  bookedByName: string;

  // Student
  studentId: string | null;      // null when student === 'self'
  studentName: string;

  // Status & consent
  status: 'confirmed' | 'cancelled';
  termsAccepted: boolean;
  termsAcceptedAt: Timestamp;    // Firestore serverTimestamp() set by webhook

  // Health & dietary (copied from draft)
  medicalInfo: MedicalInfo | null;
  emergencyContact: EmergencyContact | null;
  questionnaire: Questionnaire | null;  // Always null for youngAdultWeekend

  // Payment sub-object
  payment: {
    stripePaymentIntentId: string;  // = document ID
    amount: number;                 // In pence — from PaymentIntent.amount (server-authoritative)
    currency: string;               // Always 'gbp'
    status: 'pending' | 'paid' | 'refunded';  // Set to 'paid' by webhook
    receiptUrl: string | null;
  };

  // Timestamps
  createdAt: Timestamp;

  // Exceptional fields (only present when applicable)
  overbooking?: true;   // Set when spotsAvailable <= 0 at webhook time
}
```

**Key invariants about the `payment` sub-object (webhook-created documents only):**
- `payment.amount` = `PaymentIntent.amount` (the server-verified amount in pence)
- `payment.currency` = `'gbp'`
- `payment.status` = `'paid'`

---

## State Machine

The wizard is a linear state machine of URL-routable steps. Navigation between steps is performed by `router.push(...)`. There is no back-navigation enforcement — users may press the browser back button, which will reload the prior step from `sessionStorage`.

```
                    ┌──────────────────────────────────────────────────────┐
                    │           classType = youngAdultWeekend              │
                    │                                                      │
[mount]──►[student]──►[medical]──────────────────────────►[terms]──►[payment]──►[confirmation]
                             │                                  ▲
                             │  classType = kidsAfterSchool     │
                             └──────────►[questionnaire]────────┘
```

### Step Transitions

| From | To | Trigger | Guard |
|------|----|---------|-------|
| `student` | `medical` | User selects valid student or confirms 'self' | Age validation passes; classType check for 'self' passes |
| `medical` | `questionnaire` | Form submitted | `classType === 'kidsAfterSchool'` |
| `medical` | `terms` | Form submitted | `classType === 'youngAdultWeekend'` |
| `questionnaire` | `terms` | Form submitted | All 7 fields non-empty |
| `terms` | `payment` | "Go to Payment" button clicked | `state.termsAccepted === true` |
| `payment` | `confirmation` | `stripe.confirmPayment` resolves with `status: 'succeeded'` | `clientSecret` was successfully obtained |
| `payment` | `confirmation` (redirect) | Stripe redirects back from 3DS flow | Stripe appends `?payment_intent=pi_xxx` |
| `confirmation` | — | `clearState()` called on mount; booking polled | Terminal state |

### Questionnaire Skip Mechanism

The skip is implemented in two places:
1. **`MedicalInfoPage`**: the `onSubmit` handler navigates to `/questionnaire` if `isKid` is true, or directly to `/terms` if false.
2. **`WizardLayoutInner`** (layout stepper): the `questionnaire` step has a `condition` function that returns `true` only when `state.session?.classType === 'kidsAfterSchool'`. Steps that fail their condition are filtered out of the displayed stepper.

The questionnaire page itself (`questionnaire/page.tsx`) does not contain a redirect guard — it is only reachable through the navigation chain from `medical/page.tsx`.

### React Strict Mode Guard

`PaymentPage` uses a `useRef(false)` flag (`intentCreated`) set to `true` on the first invocation of the `useEffect` that calls `create-intent`. This prevents React 19 Strict Mode's deliberate double-invocation of effects from creating two Stripe PaymentIntents.

```ts
const intentCreated = useRef(false);

useEffect(() => {
  if (!isReady || intentCreated.current) return;
  intentCreated.current = true;
  // ... create intent
}, [isReady]);
```

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: State SessionStorage Round-Trip

*For any* `BookingWizardState` object that contains more than just `sessionId`, serializing the state to JSON and restoring it from `sessionStorage` (via `JSON.parse`) should produce an object that is deeply equal to the original state.

This validates that no wizard state is silently lost or corrupted by the sessionStorage persistence layer.

**Validates: Requirements 9.1, 9.2, 9.3**

---

### Property 2: Age Validation Boundary

*For any* `dateOfBirth` string, `sessionDate` string, `ageMin`, and `ageMax`, the `calculateAgeOnDate(dob, sessionDate)` function must return the correct age (accounting for whether the birthday has passed on the session date), and the selection guard must permit the student if and only if `ageMin ≤ calculatedAge ≤ ageMax`.

This validates both the correctness of the age calculation and the guard that prevents out-of-range students from being selected, across all possible date combinations including boundary dates (birthday falls exactly on the session date).

**Validates: Requirements 2.3, 2.4, 2.7, 2.8**

---

### Property 3: Price Invariant — Server-Authoritative Amount

*For any* call to `POST /api/payments/create-intent`, regardless of what `amount`, `price`, or any other numeric field is included in the request body, the resulting Stripe `PaymentIntent.amount` must equal the `price` field read from the `sessions/{sessionId}` Firestore document at the time of the request.

The `create-intent` handler explicitly ignores any `amount` from the body and always reads the price from Firestore. This is the core price-integrity invariant of the system.

**Validates: Requirements 7.2, 11.3, 14.1**

---

### Property 4: Auth Invariant — UID from Verified Token Only

*For any* `Booking` document created by the Stripe webhook, `booking.bookedByUid` must equal the UID extracted by `adminAuth.verifyIdToken(token)` during the corresponding `create-intent` call — it must never equal any `bookedByUid` or `uid` field that was present in the `create-intent` request body.

This invariant is enforced because `create-intent` ignores any `bookedByUid` in the body and always writes `bookedByUid: verifiedUid` to the draft. The webhook then copies `bookedByUid` from the draft.

**Validates: Requirements 7.1, 11.2, 14.1**

---

### Property 5: Idempotency — One Booking Per PaymentIntent

*For any* Stripe `PaymentIntent` ID, delivering the `payment_intent.succeeded` webhook event N times (N ≥ 1) must result in exactly 1 document in the `bookings` collection and exactly 1 decrement of `session.spotsAvailable`.

This is enforced by the Firestore transaction inside the webhook: the transaction reads `bookings/{piId}` first, and if the document already exists, it skips all writes and returns immediately.

**Validates: Requirements 8.5, 13.1, 13.2**

---

### Property 6: Capacity Invariant — `spotsAvailable` Never Goes Below Zero via Normal Processing

*For any* session with `spotsAvailable = N > 0` and `status = 'open'`, after exactly one successful `payment_intent.succeeded` webhook delivery, `session.spotsAvailable` must equal `N - 1`. For any session with `spotsAvailable ≤ 0`, the webhook must not decrement `spotsAvailable` further; instead, it must create the booking with `overbooking: true` and leave `spotsAvailable` unchanged.

This invariant is enforced atomically inside the Firestore transaction: `spotsAvailable` is only decremented when the pre-read value is `> 0`.

**Validates: Requirements 8.4, 8.6, 13.4**

---

### Property 7: Draft Lifecycle Invariant — Cleanup After Every Outcome

*For any* `PaymentIntent` ID, after the Stripe webhook has finished processing the event, the `booking_drafts/{piId}` document must be in one of exactly two states:
- **Absent** (deleted) — when `payment_intent.succeeded` was processed and the booking was created.
- **Present with `paymentStatus: 'failed'`** — when `payment_intent.payment_failed` was received.

A draft must never remain in `paymentStatus: 'pending'` state after the webhook has finished processing a terminal payment event.

**Validates: Requirements 8.12, 8.13, 12.7**

---

### Property 8: Questionnaire Skip — No Questionnaire on `youngAdultWeekend` Bookings

*For any* `Booking` document where the corresponding session has `classType = 'youngAdultWeekend'`, the `booking.questionnaire` field must be `null`.

This is enforced at two levels: (1) `MedicalInfoPage` skips the questionnaire step and sends `questionnaire: null` to `create-intent`; (2) `create-intent` stores `questionnaire: null` in the draft; (3) the webhook copies `questionnaire: null` from the draft to the booking document.

**Validates: Requirements 3.9, 4.2, 1.7**

---

### Property 9: Corrupted SessionStorage — Silent Discard

*For any* string stored under `booking_{sessionId}` in `sessionStorage` that cannot be parsed as valid JSON, `BookingProvider` must not throw an exception and must initialise its state to `{ sessionId }` as if no prior state existed.

**Validates: Requirement 9.3**

---

## Error Handling

### `create-intent` — Draft Write Failure After PaymentIntent Created

If `adminDb.doc('booking_drafts/...').set(draftData)` throws after the PaymentIntent has been successfully created, the route:
1. Attempts to cancel the PaymentIntent via `stripe.paymentIntents.cancel(piId)`.
2. Returns HTTP 500 regardless of whether the cancellation succeeds.

This ensures the user is never charged without a corresponding booking being creatable.

### `create-intent` — Firebase Admin SDK Not Initialised

If `adminInitError` is set, the route returns HTTP 500 before any Stripe or Firestore operation. In development mode, the error message includes the raw error string; in production it returns a generic message.

### Webhook — No Draft Found

If `booking_drafts/{piId}` does not exist when a `payment_intent.succeeded` event is received, the webhook logs a critical error and returns HTTP 200 without creating a booking. This avoids triggering Stripe retries (which would also find no draft). Manual intervention is required.

### Webhook — Student Update Failure

The `students/{studentId}` update after booking creation is wrapped in `try/catch` outside the transaction. Failure is logged but does not affect the booking result.

### Webhook — Email Send Failure

`sendConfirmationEmail()` is wrapped in `try/catch`. Email send failures are logged but do not affect the booking result.

### Webhook — Draft Deletion Failure

The final `draftRef.delete()` is also wrapped in `try/catch`. Deletion failure is logged but does not roll back the booking.

### Webhook — Unhandled Exception

The outer `try/catch` in the POST handler returns HTTP 500, causing Stripe to schedule a retry.

### Confirmation Page — Poll Exhausted

After 8 unsuccessful polling attempts the page does not display an error. Instead it shows a "Payment Received" message with a truncated payment reference. This is the correct UX because the booking may still appear shortly after — the user is directed to check "My Classes" within 5 minutes.

---

## Testing Strategy

This feature uses a dual approach: example-based tests for UI interactions and specific scenarios, and property-based tests for the universal invariants documented in the Correctness Properties section.

### Unit / Example-Based Tests

Use Vitest + `@testing-library/react`. Mock Firebase and Stripe modules at the top of each test file with `vi.mock(...)`.

Recommended coverage:
- **`calculateAgeOnDate`** — example cases: birthday before session date, birthday after session date, birthday on session date, leap year.
- **`StudentSelectionPage`** — `youngAdult` renders "Booking for yourself"; `parent` fetches and renders students.
- **`MedicalInfoPage`** — `kidsAfterSchool` renders Emergency Contact form; `youngAdultWeekend` does not.
- **`TermsAcceptancePage`** — "Go to Payment" button is disabled when `termsAccepted` is false; enabled when true.
- **`QuestionnairePage`** — renders exactly 7 questions with `maxLength={250}`.
- **`PaymentPage`** — shows error when `termsAccepted` is false; shows error when `session.price` is absent.
- **`ConfirmationPage`** — shows spinner while polling; shows booking detail card on found; shows "Payment Received" on poll exhausted.
- **`create-intent` route** — returns 401 without token; returns 400 for missing `sessionId`; returns 400 for non-open session; returns 403 for wrong student owner; ignores any `amount` in request body.
- **Webhook route** — returns 400 on bad signature; skips booking creation on duplicate event; marks draft as failed on `payment_intent.payment_failed`.

### Property-Based Tests

Use **fast-check** (the standard property-based testing library for TypeScript) with Vitest. Each property test should run a minimum of 100 iterations.

Tag each test with a comment referencing the design property:
```ts
// Feature: booking-wizard, Property N: <property text>
```

| Property | What to generate | What to assert |
|----------|-----------------|----------------|
| **P1 — State SessionStorage Round-Trip** | Arbitrary `BookingWizardState` objects with valid session, student, medical info etc. | `JSON.parse(JSON.stringify(state))` deep-equals the original |
| **P2 — Age Validation Boundary** | Random `dateOfBirth`, `sessionDate`, `ageMin ∈ [0,18]`, `ageMax ∈ [ageMin, 18]` | `calculateAgeOnDate` returns correct age; guard permits iff age in `[ageMin, ageMax]` |
| **P3 — Price Invariant** | Various request bodies with arbitrary `amount`/`price` fields, paired with a mocked Firestore that returns a fixed `session.price` | The PaymentIntent is always created with the Firestore-sourced price, regardless of body |
| **P4 — Auth Invariant** | Arbitrary `bookedByUid` values in the request body, paired with a mocked `verifyIdToken` returning a fixed UID | `booking_draft.bookedByUid` equals the mocked verified UID, never the body value |
| **P5 — Idempotency** | Any PaymentIntent ID; call `handlePaymentIntentSucceeded` N times (N drawn from 1–10) with a mocked Firestore | Exactly 1 booking doc written; `spotsAvailable` decremented exactly once |
| **P6 — Capacity Invariant** | Sessions with arbitrary `spotsAvailable` (including 0 and negative); webhook called once | If `spotsAvailable > 0`: decremented by 1. If `spotsAvailable ≤ 0`: unchanged, `overbooking: true` on booking |
| **P7 — Draft Lifecycle** | Any PaymentIntent ID processed through success or failure path with mocked Firestore | After success: draft deleted. After failure: draft has `paymentStatus: 'failed'` |
| **P8 — Questionnaire Skip** | Booking drafts with `classType: 'youngAdultWeekend'` and arbitrary questionnaire values | Resulting booking document always has `questionnaire: null` |
| **P9 — Corrupted SessionStorage** | Arbitrary non-JSON strings stored under `booking_{sessionId}` | `BookingProvider` does not throw; state initialises to `{ sessionId }` |
