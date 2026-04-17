# 02 — Current Features

Status key: **Complete** | **Partial** | **Placeholder**

---

## 1. Public Website

### 1.1 Homepage
- **Status:** Complete
- **File:** [src/app/(public)/page.tsx](../src/app/(public)/page.tsx)
- **How it works:** Static/SSR page. Renders hero canvas section, features grid, session map (dynamic import via `SessionMapSection`), founder bio, and testimonials preview. `HeroCanvas` renders an animated particle/canvas effect. `MagicCursor` provides an interactive custom cursor overlay.
- **Relevant files:**
  - `src/components/home/HeroCanvas.tsx`
  - `src/components/home/HeroCanvasSection.tsx`
  - `src/components/home/MagicCursor.tsx`
  - `src/components/home/SessionMapSection.tsx`

### 1.2 About Page
- **Status:** Complete
- **File:** [src/app/(public)/about/page.tsx](../src/app/(public)/about/page.tsx)
- **How it works:** Static page with founder story, photo, and mission statement. Uses `public/founder.jpg` (alias `nisha-portrait.jpg`).

### 1.3 Gallery Page
- **Status:** Complete
- **File:** [src/app/(public)/gallery/page.tsx](../src/app/(public)/gallery/page.tsx), [GalleryClient.tsx](../src/app/(public)/gallery/GalleryClient.tsx)
- **How it works:** Server component fetches `gallery` collection from Firestore. Passes images to client component which renders them in a masonry/grid layout with category filters (`cooking-classes`, `cakes`, `cookies`, `breads`).

### 1.4 Testimonials Page
- **Status:** Complete
- **File:** [src/app/(public)/testimonies/page.tsx](../src/app/(public)/testimonies/page.tsx)
- **How it works:** Renders an array of hardcoded review objects through `ExpandableReview` components. Each review card can be expanded. Uses `onError` fallback to hide broken review images. Reviews are currently **static/hardcoded**, not pulled from a database.

### 1.5 Terms & Conditions Page
- **Status:** Complete
- **File:** [src/app/(public)/terms/page.tsx](../src/app/(public)/terms/page.tsx)
- **How it works:** Static page rendering the full T&C text for Blooming Tastebuds.

### 1.6 Header / Navigation
- **Status:** Complete
- **File:** [src/components/layout/Header.tsx](../src/components/layout/Header.tsx)
- **How it works:** Responsive nav bar with logo, page links, and auth-aware CTA (shows "Login / Sign Up" or "My Portal" based on auth state). Includes hamburger menu for mobile.

### 1.7 Footer
- **Status:** Complete
- **File:** [src/components/layout/Footer.tsx](../src/components/layout/Footer.tsx)
- **How it works:** Static footer with social links (YouTube, Facebook, Instagram, LinkedIn), quick links, and contact information.

---

## 2. Authentication

### 2.1 User Sign-Up
- **Status:** Complete
- **File:** [src/app/auth/signup/page.tsx](../src/app/auth/signup/page.tsx)
- **How it works:**
  - Role selection first (`parent` or `youngAdult`)
  - Email/password form validated with React Hook Form + Zod
  - Calls `AuthContext.signUp()` → Firebase `createUserWithEmailAndPassword` → creates `users/{uid}` document in Firestore
  - Google OAuth option via `signInWithGoogle(role)` (role must be pre-selected)
  - On success, redirects to `/portal/dashboard`

### 2.2 Login
- **Status:** Complete
- **File:** [src/app/auth/login/page.tsx](../src/app/auth/login/page.tsx)
- **How it works:**
  - Email/password or Google Sign-In
  - Sets `bt_session` cookie (the Firebase ID token) for middleware route protection
  - Redirects authenticated users away from this page to `/portal/dashboard`

### 2.3 Forgot Password
- **Status:** Complete
- **File:** [src/app/auth/forgot-password/page.tsx](../src/app/auth/forgot-password/page.tsx)
- **How it works:** Calls Firebase `sendPasswordResetEmail`. Shows success/error message inline.

### 2.4 Role-Based Access Control
- **Status:** Complete
- **Files:** `src/context/AuthContext.tsx`, `src/middleware.ts`
- **How it works:** Three roles defined — `parent`, `youngAdult`, `admin`. Stored in `users/{uid}.role`. Middleware checks the `bt_session` cookie; admin routes additionally verify the `customClaims.admin` flag set via Firebase Admin SDK.

### 2.5 Session Persistence
- **Status:** Complete
- **File:** [src/context/AuthContext.tsx](../src/context/AuthContext.tsx)
- **How it works:** Firebase `onAuthStateChanged` listener keeps auth state fresh. `bt_session` cookie set on login/sign-up, cleared on logout. Middleware reads cookie without needing to decode JWT on every request.

---

## 3. User Portal

### 3.1 Portal Dashboard
- **Status:** Complete
- **File:** [src/app/portal/dashboard/page.tsx](../src/app/portal/dashboard/page.tsx)
- **How it works:** Welcome screen with quick-action cards (Find a Class, My Bookings, My Students, My Payments). Reads `btUser` from AuthContext for personalised greeting.

### 3.2 Find a Class (Session Browser)
- **Status:** Complete
- **File:** [src/app/portal/find-class/page.tsx](../src/app/portal/find-class/page.tsx)
- **How it works:**
  - Queries Firestore `sessions` collection, filters by `status: 'open'` and future dates
  - Toggle between **Map view** (Leaflet) and **List view**
  - Filters: class type (After School / Weekend), venue, date range
  - Each session card shows date, time, venue, instructor, spots available, price
  - "Book Now" button links to `/book/[sessionId]/student`

### 3.3 My Classes (Booked Sessions)
- **Status:** Complete
- **File:** [src/app/portal/my-classes/page.tsx](../src/app/portal/my-classes/page.tsx)
- **How it works:** Queries `bookings` where `bookedByUid == currentUser.uid`. Displays upcoming and past bookings with class details, student name, date, venue, and status badge.

### 3.4 My Payments
- **Status:** Complete
- **File:** [src/app/portal/my-payments/page.tsx](../src/app/portal/my-payments/page.tsx)
- **How it works:** Reads the `payment` sub-object from each booking document. Renders a styled table with columns: class, date, student, amount, status badge, receipt link. Status badges use colour coding (green = paid, amber = pending, red = refunded).

### 3.5 My Students
- **Status:** Complete (for parents)
- **File:** [src/app/portal/my-students/page.tsx](../src/app/portal/my-students/page.tsx)
- **How it works:** Parents can view, add, and edit student profiles. Queries `students` where `parentUid == currentUser.uid`. Displays student cards with DOB, age-calculated display. Includes inline form to add a new student. Hidden/not applicable for `youngAdult` role.

### 3.6 Account Settings
- **Status:** Partial
- **File:** [src/app/portal/account/page.tsx](../src/app/portal/account/page.tsx)
- **How it works:** Displays current user name and email from `btUser`. Edit functionality present but may not persist changes back to Firestore. Password change not wired through the UI.

---

## 4. Booking Wizard

### 4.1 Step 1 — Student Selection
- **Status:** Complete
- **File:** [src/app/book/[sessionId]/student/page.tsx](../src/app/book/[sessionId]/student/page.tsx)
- **How it works:**
  - For `parent` role: lists existing students from `students` collection; option to add a new student inline
  - For `youngAdult` role: pre-selects "self" as the student
  - Validates age eligibility against the session's `ageMin`/`ageMax` fields
  - On confirm, stores `studentId` + `student` in `BookingContext`

### 4.2 Step 2 — Medical Information
- **Status:** Complete
- **File:** [src/app/book/[sessionId]/medical/page.tsx](../src/app/book/[sessionId]/medical/page.tsx)
- **How it works:**
  - Renders a comprehensive form for `MedicalInfo`: allergies, medical conditions, recent operations, vision/hearing impairment, glasses, respiratory problems, additional support needs
  - Also captures `EmergencyContact`: name, relationship, email, phone
  - Pre-fills if the student already has medical info stored
  - Stores in `BookingContext.medicalInfo` + `BookingContext.emergencyContact`

### 4.3 Step 3 — Dietary Questionnaire
- **Status:** Complete (shown for kids / After School Club; skipped for young adults)
- **File:** [src/app/book/[sessionId]/questionnaire/page.tsx](../src/app/book/[sessionId]/questionnaire/page.tsx)
- **How it works:**
  - Captures: dietary requirements, airborne allergy flag, reaction details, symptoms, epipen info, same-table and may-contain preferences
  - Skipped entirely for `youngAdultWeekend` class type
  - Stores in `BookingContext.questionnaire`

### 4.4 Step 4 — Terms & Conditions
- **Status:** Complete
- **File:** [src/app/book/[sessionId]/terms/page.tsx](../src/app/book/[sessionId]/terms/page.tsx)
- **How it works:** Renders T&C text inline with a mandatory checkbox. Sets `BookingContext.termsAccepted = true` + timestamp. User cannot proceed without accepting.

### 4.5 Step 5 — Payment
- **Status:** Complete
- **Files:** [src/app/book/[sessionId]/payment/page.tsx](../src/app/book/[sessionId]/payment/page.tsx), [CheckoutForm.tsx](../src/app/book/[sessionId]/payment/CheckoutForm.tsx)
- **How it works:**
  1. `page.tsx` waits for both auth (`useAuth`) and booking context (`useBooking`) to be ready
  2. Calls `POST /api/payments/create-intent` with the **full booking payload** — session data, user data, student data, medical info, questionnaire, terms acceptance
  3. Server writes a `booking_drafts/{paymentIntentId}` document (Admin SDK) and returns `clientSecret` + `paymentIntentId`
  4. `CheckoutForm` renders `<PaymentElement>` (Stripe's hosted card UI) — **UI only**, no Firestore writes
  5. On submit: `stripe.confirmPayment()` sent directly to Stripe
  6. On success (inline redirect): navigates to `/book/{sessionId}/confirmation?payment_intent={pi_id}`
  7. All booking creation, capacity decrement, student profile update, and email dispatch happen **server-side in the Stripe webhook** — not in the browser

### 4.6 Step 6 — Confirmation
- **Status:** Complete
- **File:** [src/app/book/[sessionId]/confirmation/page.tsx](../src/app/book/[sessionId]/confirmation/page.tsx)
- **How it works:** Reads `?payment_intent` URL param (or legacy `?bookingId`). Polls Firestore `bookings/{paymentIntentId}` up to 8 times at 1.5 s intervals (~12 s max) while the Stripe webhook processes asynchronously. On booking found: shows full summary card (class name, date, venue, student). If polling exhausts before booking appears: shows a "Payment Received" fallback with the payment reference and contact instructions. The webhook will eventually create the booking (Stripe retries up to 3 days).

---

## 5. Admin Panel

### 5.1 Admin Dashboard
- **Status:** Partial (basic stats)
- **File:** [src/app/admin/dashboard/page.tsx](../src/app/admin/dashboard/page.tsx)
- **How it works:** Shows count cards for total bookings, upcoming sessions, active students. Recent bookings list. No charting or analytics.

### 5.2 Venue Management
- **Status:** Complete
- **File:** [src/app/admin/venues/page.tsx](../src/app/admin/venues/page.tsx)
- **How it works:** Full CRUD for `venues` collection. Form fields: name, address, postcode, lat, lng. Table view of existing venues with edit/delete actions.

### 5.3 Class Management
- **Status:** Complete
- **File:** [src/app/admin/classes/page.tsx](../src/app/admin/classes/page.tsx)
- **How it works:** Full CRUD for `classes` collection (class definitions, not individual sessions). Fields: type, name, day of week, start/end time, age range, max size, price, venue.

### 5.4 Session Management
- **Status:** Complete
- **File:** [src/app/admin/sessions/page.tsx](../src/app/admin/sessions/page.tsx)
- **How it works:** Full CRUD for `sessions` collection. Admin creates individual session instances from class templates. Fields: classId, date, recipeId, spots total, status override.

### 5.5 Recipe Management
- **Status:** Complete
- **File:** [src/app/admin/recipes/page.tsx](../src/app/admin/recipes/page.tsx)
- **How it works:** Full CRUD for `recipes` collection. Fields: name, description, photo upload to Firebase Storage.

### 5.6 Gallery Management
- **Status:** Complete
- **File:** [src/app/admin/gallery/page.tsx](../src/app/admin/gallery/page.tsx)
- **How it works:** Upload images to Firebase Storage, create `gallery` documents with `imageUrl`, `description`, `altText`, `order`, `category`. Sort/reorder support.

### 5.7 Instructor Management
- **Status:** Complete
- **File:** [src/app/admin/instructors/page.tsx](../src/app/admin/instructors/page.tsx)
- **How it works:** Full CRUD for `instructors` collection. Fields: name, gender, expertise (tags), bio, photo upload, display order.

### 5.8 Bookings Management
- **Status:** Partial
- **File:** [src/app/admin/bookings/page.tsx](../src/app/admin/bookings/page.tsx)
- **How it works:** Read-only view of all bookings. Filters by session and status. No cancellation or refund action buttons wired up.

---

## 6. Payments

### 6.1 Stripe PaymentIntent Creation
- **Status:** Complete
- **File:** [src/app/api/payments/create-intent/route.ts](../src/app/api/payments/create-intent/route.ts)
- **How it works:** Server-side `POST` handler. Accepts the **full booking payload** (session data, user data, student data, medical info, questionnaire, terms acceptance). Creates a Stripe `PaymentIntent` with `automatic_payment_methods: { enabled: true }` and writes a `booking_drafts/{paymentIntentId}` document via Firebase Admin SDK. If the Firestore write fails, cancels the PaymentIntent so the user is never charged without a corresponding draft. Returns both `clientSecret` and `paymentIntentId`.

### 6.2 Stripe Elements Payment UI
- **Status:** Complete
- **File:** [src/app/book/[sessionId]/payment/CheckoutForm.tsx](../src/app/book/[sessionId]/payment/CheckoutForm.tsx)
- **How it works:** Uses `@stripe/react-stripe-js` `<PaymentElement>`. Handles loading states, error display, and the `stripe.confirmPayment()` call. **No Firestore writes** — all booking creation is handled by the webhook. On inline success, navigates to the confirmation page passing `?payment_intent={id}`.

### 6.3 Stripe Webhook Handler
- **Status:** Complete
- **File:** [src/app/api/webhooks/stripe/route.ts](../src/app/api/webhooks/stripe/route.ts)
- **How it works:**
  - Verifies Stripe signature via `stripe.webhooks.constructEvent` using raw `ArrayBuffer` body
  - `payment_intent.succeeded`: reads `booking_drafts/{piId}`, runs a Firestore transaction (idempotency check + session capacity check + booking creation + `spotsAvailable` decrement), updates student profile, sends confirmation email (Resend), deletes the draft
  - `payment_intent.payment_failed`: marks draft with `paymentStatus: 'failed'` for observability
  - Booking document ID = Stripe PaymentIntent ID (idempotency: duplicate webhook delivery is a no-op)
  - Returns 200 to Stripe on success; 400 on signature failure; 500 on handler error (triggers Stripe retry)

---

## 7. Email Notifications

### 7.1 Booking Confirmation Email
- **Status:** Complete
- **File:** [src/app/api/emails/send/route.ts](../src/app/api/emails/send/route.ts)
- **How it works:** `POST /api/emails/send` with `type: 'confirmation'`. Sends HTML-formatted email via Resend with booking details (class, date, venue, student). **Triggered from the Stripe webhook handler** after the booking document is created — not from the browser. Email failure is non-fatal; the booking is already created before the email send is attempted.

### 7.2 Booking Cancellation Email
- **Status:** Complete (template exists)
- **File:** `src/app/api/emails/send/route.ts`
- **How it works:** `type: 'cancellation'` sends a cancellation email. However, the admin UI does not currently have a button to trigger cancellations, so this path is partially unused.

### 7.3 Email Reminders
- **Status:** Not implemented
- **Note:** No scheduled job or cron mechanism exists to send reminder emails before a class.

---

## 8. Maps Integration

### 8.1 Session Map on Homepage
- **Status:** Complete
- **File:** [src/components/home/SessionMapFinder.tsx](../src/components/home/SessionMapFinder.tsx)
- **How it works:** Uses React-Leaflet to render an interactive map showing session markers. Dynamically loaded (via `next/dynamic`) to avoid SSR issues with Leaflet's `window` dependency.

### 8.2 Session Map in Portal (Find a Class)
- **Status:** Complete
- **File:** [src/app/portal/find-class/page.tsx](../src/app/portal/find-class/page.tsx)
- **How it works:** Same Leaflet-based map. Queries Firestore for open sessions, renders markers with venue coordinates, click opens session detail card.

---

## 9. Data Model & Firestore

### 9.1 TypeScript Type Definitions
- **Status:** Complete
- **File:** [src/types/index.ts](../src/types/index.ts)
- **Entities defined:** `BTUser`, `Student`, `Venue`, `BTClass`, `Session`, `Recipe`, `Booking`, `GalleryImage`, `Instructor`, `MedicalInfo`, `EmergencyContact`, `Questionnaire`, `BookingWizardState`

### 9.2 Firestore Collections
- **Status:** Complete
- **Collections:** `users`, `students`, `venues`, `classes`, `sessions`, `recipes`, `bookings`, `gallery`, `instructors`, `booking_drafts`
- **`booking_drafts`:** Server-side only (Admin SDK). Holds full booking wizard state keyed by `paymentIntentId`. Written by `create-intent`, read and deleted by the Stripe webhook. Firestore rules deny all client access.
- **Security rules:** `firestore.rules` is present in the repository root with per-collection access control. **Awaiting deployment:** `firebase deploy --only firestore:rules`.

---

## 10. Missing / Not Implemented

| Feature | Notes |
|---------|-------|
| Courses/Class-types landing page | No dedicated `/courses` page describing the two class formats |
| Booking cancellation + Stripe refund | Admin bookings page is read-only; no `stripe.refunds.create()` call; users can set `status: 'cancelled'` in Firestore but no refund is issued |
| `payment.receiptUrl` not populated | Webhook creates the booking but does not expand `latest_charge` to fetch the Stripe receipt URL |
| T&C version not tracked | `termsVersion` field missing from booking documents |
| Email verification | `sendEmailVerification` not called after sign-up |
| Account settings save not confirmed | `portal/account` edit form save-to-Firestore not verified complete |
| Post-login redirect | Middleware doesn't preserve the intended URL before redirecting to login |
| Orphaned booking drafts | If user abandons payment mid-flow, `booking_drafts` document is never cleaned up |
| Password change in account page | UI incomplete |
| Email reminders | No scheduler or cron |
| PayPal payment option | Only Stripe is wired; PayPal not present |
| Firestore rules deployment | `firestore.rules` file exists but must be deployed: `firebase deploy --only firestore:rules` |
| Production Stripe webhook endpoint | Must be registered in Stripe Dashboard before go-live |
