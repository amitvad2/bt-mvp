# 06 — API and Integrations

Status key: **Detected** | **Partially Detected** | **Not Found**

---

## 1. Internal API Routes

### `POST /api/payments/create-intent`
- **Status:** Detected
- **File:** [src/app/api/payments/create-intent/route.ts](../src/app/api/payments/create-intent/route.ts)
- **Purpose:** Server-side creation of a Stripe PaymentIntent and booking draft. Called from the client during the payment step of the booking wizard.
- **Input:** Full booking payload — `{ sessionId, sessionDate, className, venueName, startTime, endTime, classType, amount, bookedByUid, bookedByName, bookedByEmail, studentId, studentName, medicalInfo, emergencyContact, questionnaire, termsAccepted, termsAcceptedAt }`
- **Output:** `{ clientSecret: "pi_xxx_secret_yyy", paymentIntentId: "pi_xxx" }`
- **Auth:** None enforced at the API route level (assumes authenticated client; middleware protects `/book/*`).
- **Notes:** Creates a Stripe PaymentIntent with `automatic_payment_methods: { enabled: true }`. Writes `booking_drafts/{paymentIntentId}` via Firebase Admin SDK so the webhook can reconstruct the full booking without trusting browser state. If the Firestore write fails, the PaymentIntent is cancelled immediately so the user is never charged for an unrecoverable booking.

### `POST /api/emails/send`
- **Status:** Detected
- **File:** [src/app/api/emails/send/route.ts](../src/app/api/emails/send/route.ts)
- **Purpose:** Sends transactional HTML emails via Resend.
- **Input:** `{ to, subject, type: 'confirmation' | 'cancellation', data: { ... } }`
- **Output:** `{ success: true }` or error
- **Auth:** None enforced at route level (internal use only).
- **Notes:** Uses `resend.emails.send()`. HTML templates are inline in the route handler. Graceful degradation — email failure does not block booking creation.

### `POST /api/contact`
- **Status:** Detected
- **File:** [src/app/api/contact/route.ts](../src/app/api/contact/route.ts)
- **Purpose:** Accepts contact/feedback form submissions from the public `/contact` page. No authentication required.
- **Auth:** None — publicly accessible.
- **Input (JSON body):**
  ```json
  {
    "name": "string (required)",
    "email": "string (required, valid email)",
    "phone": "string (optional)",
    "category": "'general' | 'booking' | 'feedback' | 'technical' | 'other' (required)",
    "message": "string (required, min 10 chars)",
    "consentToReply": "boolean (required, must be true)"
  }
  ```
- **Output (success):** `{ success: true, id: "<firestoreDocId>" }`
- **Output (validation error):** `{ error: "Validation failed", issues: [...] }` (HTTP 400)
- **Output (server error):** `{ error: "Failed to submit message" }` (HTTP 500)
- **Side effects:**
  1. Validates request body with Zod server-side.
  2. Writes a `contact_messages/{id}` document via Firebase Admin SDK with fields: `name`, `email`, `phone?`, `category`, `message`, `consentToReply`, `source: 'contact-page'`, `status: 'new'`, `userId?` (if caller is authenticated), `createdAt`.
  3. Sends an admin notification email via Resend to `RESEND_ADMIN_EMAIL` (falls back to `bloomingtastebuds@gmail.com`). Email failure is **non-fatal** — the Firestore write is not rolled back.
- **Environment variable:** `RESEND_ADMIN_EMAIL` (optional; defaults to `bloomingtastebuds@gmail.com`)

### `POST /api/webhooks/stripe`
- **Status:** Detected
- **File:** [src/app/api/webhooks/stripe/route.ts](../src/app/api/webhooks/stripe/route.ts)
- **Purpose:** Handle async Stripe events server-side. The authoritative source for all booking creation.
- **Events handled:**
  - `payment_intent.succeeded` — reads `booking_drafts/{piId}`, runs a Firestore transaction (idempotency check + session capacity check + `bookings/{piId}` creation + `spotsAvailable` decrement), updates student profile, sends confirmation email, deletes draft
  - `payment_intent.payment_failed` — marks draft with `paymentStatus: 'failed'`
- **Security:** Verifies Stripe webhook signature using raw `ArrayBuffer` body and `STRIPE_WEBHOOK_SECRET`.
- **Idempotency:** Booking document ID = PaymentIntent ID; transaction checks existence before writing — duplicate events are no-ops.
- **Notes:** Must be registered in Stripe Dashboard → Webhooks before going to production. See [stripe-webhook-notes.md](./stripe-webhook-notes.md).

---

## 2. Authentication

### Firebase Authentication
- **Status:** Detected
- **Files:** [src/lib/firebase.ts](../src/lib/firebase.ts), [src/context/AuthContext.tsx](../src/context/AuthContext.tsx)
- **SDK Version:** firebase@12.9.0 (client)
- **Methods used:**
  - `createUserWithEmailAndPassword` — user registration
  - `signInWithEmailAndPassword` — email login
  - `GoogleAuthProvider` + `signInWithPopup` — Google OAuth
  - `sendPasswordResetEmail` — forgot password
  - `onAuthStateChanged` — auth state listener
  - `signOut` — logout
- **Session management:** Firebase ID token stored in `bt_session` cookie for server-side middleware access.
- **Role storage:** Role stored in Firestore `users/{uid}.role` (not Firebase custom claims). Middleware reads the cookie (JWT) then fetches the role from Firestore for admin checks.

### Firebase Admin SDK
- **Status:** Detected
- **File:** [src/lib/firebase-admin.ts](../src/lib/firebase-admin.ts)
- **SDK Version:** firebase-admin@13.6.1
- **Purpose:** Server-side Firestore/Auth/Storage access from API routes.
- **Initialisation:** Reads `FIREBASE_ADMIN_SERVICE_ACCOUNT` env var (JSON string). Falls back to Application Default Credentials.
- **Exports:** `adminDb` (Firestore), `adminAuth` (Auth), `adminStorage` (Storage)

---

## 3. Database / Storage

### Firebase Firestore
- **Status:** Detected
- **File:** `src/lib/firebase.ts` — `getFirestore(app)` exported as `db`
- **Access pattern:** Direct client-SDK reads/writes from React components and server components. API routes use Firebase Admin SDK (`adminDb`). No ORM or abstraction layer.
- **Collections:** `users`, `students`, `venues`, `classes`, `sessions`, `recipes`, `bookings`, `gallery`, `instructors`, `booking_drafts`, `contact_messages`
- **Security rules:** `firestore.rules` present in repo root — per-collection access control implemented. **Awaiting deployment:** `firebase deploy --only firestore:rules`. See [firestore-rules-notes.md](./firestore-rules-notes.md).

### Firebase Storage
- **Status:** Detected
- **File:** `src/lib/firebase.ts` — `getStorage(app)` exported as `storage`
- **Storage rules file:** `storage.rules` — public read, authenticated write.
- **Usage:** Admin panel uploads (gallery images, recipe photos, instructor photos) go to Firebase Storage. URLs stored as `imageUrl`/`photoUrl` fields in Firestore documents.

---

## 4. Payment Integration

### Stripe
- **Status:** Detected
- **Files:**
  - [src/lib/stripe.ts](../src/lib/stripe.ts) — server-side `Stripe` client
  - [src/app/api/payments/create-intent/route.ts](../src/app/api/payments/create-intent/route.ts) — PaymentIntent creation
  - [src/app/book/[sessionId]/payment/CheckoutForm.tsx](../src/app/book/[sessionId]/payment/CheckoutForm.tsx) — client-side `<PaymentElement>`
- **SDK versions:** stripe@20.3.1 (server), @stripe/react-stripe-js@5.6.0 / @stripe/stripe-js@8.7.0 (client)
- **Flow:**
  1. Server creates PaymentIntent + `booking_drafts` document → returns `clientSecret` + `paymentIntentId`
  2. Client mounts `<Elements>` with `clientSecret`
  3. User fills in `<PaymentElement>` (card, Apple Pay, Google Pay, etc.)
  4. `stripe.confirmPayment()` sends data to Stripe
  5. On success, browser navigates to `/book/{sessionId}/confirmation?payment_intent={piId}`
  6. Stripe sends `payment_intent.succeeded` webhook to server → webhook creates booking, decrements spots, sends email
  7. Confirmation page polls Firestore until booking appears
- **Currency:** GBP (`gbp`)
- **Webhook handling:** Implemented — see `/api/webhooks/stripe` above
- **Refunds:** Not yet implemented — no `stripe.refunds.create()` call in codebase; refunds must be issued manually via Stripe Dashboard

### PayPal
- **Status:** Not Found
- **Notes:** `STRIPE_WEBHOOK_SECRET` environment variable and Stripe's `automatic_payment_methods` could potentially include PayPal if configured in the Stripe dashboard. Native PayPal SDK not integrated.

---

## 5. Email / Notifications

### Resend
- **Status:** Detected
- **Files:** [src/lib/resend.ts](../src/lib/resend.ts), [src/app/api/emails/send/route.ts](../src/app/api/emails/send/route.ts)
- **SDK Version:** resend@6.9.2
- **From address:** Reads `RESEND_FROM_EMAIL` env var; defaults to `onboarding@resend.dev` (test address — must be changed for production).
- **Email types:** `confirmation`, `cancellation` (booking emails via `/api/emails/send`); admin contact notification (inline in `/api/contact`)
- **Admin notification recipient:** `RESEND_ADMIN_EMAIL` env var; defaults to `bloomingtastebuds@gmail.com`
- **HTML templates:** Inline in route handlers (not file-based)
- **Notes:** A verified sending domain must be configured in Resend dashboard for production use.

### Firebase Auth Emails
- **Status:** Detected (Firebase-native)
- **Purpose:** Password reset emails are sent automatically by Firebase Auth (`sendPasswordResetEmail`).
- **Customisation:** Email templates can be customised in Firebase Console → Authentication → Templates.

### SMS / Push Notifications
- **Status:** Not Found
- **Notes:** No SMS or push notification service is integrated.

---

## 6. Admin Functionality

### Admin Route Protection
- **Status:** Detected
- **File:** [src/middleware.ts](../src/middleware.ts)
- **How it works:** Middleware intercepts `/admin/*` routes. Checks `bt_session` cookie validity. Checks user role in Firestore is `admin`. Redirects non-admin users to `/portal/dashboard`.

### Admin Data Operations
- **Status:** Detected
- **Files:** `src/app/admin/*/page.tsx` (7 admin pages)
- **Pattern:** Each admin page directly uses the Firebase client SDK to CRUD Firestore documents and Firebase Storage (for file uploads).
- **No dedicated admin API layer** — admin pages interact with Firestore directly via the client SDK. This is acceptable given Firestore security rules would enforce admin-only writes (once rules are implemented).

---

## 7. Maps

### Leaflet + React-Leaflet
- **Status:** Detected
- **Files:** [src/components/home/SessionMapFinder.tsx](../src/components/home/SessionMapFinder.tsx), [src/app/portal/find-class/page.tsx](../src/app/portal/find-class/page.tsx)
- **SDK versions:** leaflet@1.9.4, react-leaflet@5.0.0, @types/leaflet@1.9.21
- **Usage:** Interactive maps showing session locations. Dynamically imported to avoid SSR issues (`next/dynamic` with `ssr: false`).
- **Map tiles:** OpenStreetMap (free, no API key required).
- **Venue coordinates:** Stored as `lat`/`lng` on `venues` Firestore documents. Admins must enter these manually.

---

## 8. External Social / Embed Links

### Social Media Links (Footer)
- **Status:** Detected
- **File:** [src/components/layout/Footer.tsx](../src/components/layout/Footer.tsx)
- **Platforms linked:** YouTube, Facebook, Instagram, LinkedIn
- **Note:** Links use placeholder/static `href` values. Actual social profile URLs must be confirmed and updated.

### YouTube Embed
- **Status:** Not Found
- **Notes:** No embedded YouTube videos on any page. The footer links to a YouTube channel but no video content is embedded on the site.

---

## 9. Deployment / Infrastructure

### Vercel
- **Status:** Partially Detected (inferred from `.vercel/` directory)
- **Type:** Serverless Next.js deployment
- **API routes:** Run as Vercel Serverless Functions
- **Environment variables:** Must be configured in Vercel project settings

### Firebase Hosting
- **Status:** Not Found
- **Notes:** App is deployed to Vercel, not Firebase Hosting. Firebase is used only for backend services (Auth, Firestore, Storage).

---

## Integration Summary Table

| Integration | Purpose | Status | Missing |
|-------------|---------|--------|---------|
| Firebase Auth | Authentication, session management | Detected | Email verification not called after sign-up |
| Firebase Firestore | Primary database | Detected | Rules file exists — needs deployment |
| Firebase Storage | Image file storage | Detected | — |
| Firebase Admin SDK | Server-side auth + DB | Detected | — |
| Stripe | Payment processing | Detected | Refund flow |
| Stripe Webhooks | Async payment events / booking creation | **Detected** | Register production endpoint in Stripe Dashboard |
| Resend | Transactional emails + contact admin notifications | Detected | Production sending domain (`RESEND_FROM_EMAIL`); set `RESEND_ADMIN_EMAIL` |
| Leaflet / React-Leaflet | Session maps | Detected | — |
| Vercel | Hosting / deployment | Partially Detected | Env vars must be set |
| PayPal | Alternate payment | Not Found | Full integration needed |
| YouTube embed | Course preview videos | Not Found | Embed player on courses page |
| SMS / Push | Notifications | Not Found | Third-party service needed |
