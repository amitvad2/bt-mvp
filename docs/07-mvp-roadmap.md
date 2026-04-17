# 07 — MVP Roadmap

Last updated: 2026-04-16

---

## Overview

The codebase is already highly functional — authentication, booking, payments, and admin are largely built. The roadmap focuses on **closing gaps, adding missing safety nets, and reaching production quality** rather than building from scratch.

> **Status key:**  ✅ Done &nbsp;|&nbsp; 🔲 Not started &nbsp;|&nbsp; ⚠️ Partial

---

## Phase 0 — Stabilise Current Code ✅ Largely Complete

**Goal:** Understand and harden what already exists before adding new features.

**Tasks:**
1. ✅ Add `firestore.rules` — per-collection access control implemented (see [firestore-rules-notes.md](./firestore-rules-notes.md))
2. 🔲 Deploy Firestore rules: `firebase deploy --only firestore:rules` — file exists, awaiting deployment
3. 🔲 Verify environment variables are set in the Vercel project dashboard
4. 🔲 Confirm Stripe publishable and secret keys are switched to live mode before go-live
5. 🔲 Set `RESEND_FROM_EMAIL` to a verified sending domain (not `onboarding@resend.dev`)
6. 🔲 Test the complete booking flow end-to-end in production/staging
7. 🔲 Confirm the `bt_session` cookie expiry aligns with the desired session duration

**Dependencies:** Firebase project access, Stripe account, Resend verified domain, Vercel project.

**Risks:**
- ~~Firestore without rules is an open database~~ — **resolved, rules file created**
- Stripe test keys in production will reject real card payments
- Email sending will fail in production without a verified Resend domain

**Complexity:** Low — mostly configuration; code work is done.

---

## Phase 1 — MVP Public Pages 🔲 Not started

**Goal:** Complete the public-facing marketing site.

**Tasks:**

1. 🔲 **Courses page** — `src/app/(public)/courses/page.tsx`
   - Two sections: After School Club and Weekend Classes
   - Schedule, age range, price, what students learn
   - CTA button → `/auth/signup`
   - Add to Header nav

2. 🔲 **SEO metadata** — Add `generateMetadata()` to all public `page.tsx` files

3. 🔲 **Testimonials from database** — Replace hardcoded reviews with Firestore
   - Create `testimonials` collection
   - Update `src/app/(public)/testimonies/page.tsx` to fetch from Firestore
   - Add `src/app/admin/testimonials/page.tsx` (CRUD)

4. 🔲 **Update social footer links** — Replace placeholder `href` values with real URLs

**Dependencies:** None — all standalone front-end work.

**Risks:** Low. Static pages; no auth or data dependencies.

**Complexity:** Low–Medium.

---

## Phase 2 — Auth and Dashboard Enhancements 🔲 Not started

**Goal:** Improve post-registration experience and account management.

**Tasks:**

1. 🔲 **Email verification** — Call `sendEmailVerification(user)` in `AuthContext.signUp()`. Add `/auth/verify-email` page.

2. 🔲 **Post-login redirect** — Preserve intended URL before login wall and redirect after successful login.

3. 🔲 **Account settings completion** — Wire the account page form to save changes back to Firestore (`updateDoc`) and handle password changes via `updatePassword`.

4. 🔲 **Portal dashboard — upcoming classes** — Query `bookings` for the user's upcoming sessions; display a "Next class" summary card.

5. 🔲 **Onboarding modal** — On first portal visit (no students yet), prompt parent users to add their first student.

**Dependencies:** Phase 0 complete (Firestore rules deployed).

**Risks:** Medium. Firebase security requires proper rule updates for new write paths.

**Complexity:** Low–Medium.

---

## Phase 3 — Class Discovery and Booking Hardening ✅ Largely Complete

**Goal:** Make the core booking flow bulletproof.

**Tasks:**

1. ✅ **Stripe webhook handler** — `src/app/api/webhooks/stripe/route.ts` implemented
   - Handles `payment_intent.succeeded` → authoritative booking creation
   - Handles `payment_intent.payment_failed` → draft marked with failure status
   - Verifies webhook signature using `STRIPE_WEBHOOK_SECRET`
   - All Firestore writes moved server-side from `CheckoutForm.tsx`
   - See [stripe-webhook-notes.md](./stripe-webhook-notes.md) for full details

2. ✅ **Idempotent booking creation** — Booking document ID = Stripe `payment_intent.id`; transaction checks existence before writing

3. ✅ **Safe capacity decrement** — Firestore transaction inside webhook checks session open + `spotsAvailable > 0` before decrement

4. 🔲 **Booking cancellation with Stripe refund** — Users can set `status: 'cancelled'` in Firestore but no `stripe.refunds.create()` call exists. Needs a `/api/bookings/cancel` server route.

5. 🔲 **Session detail page** — `src/app/(public)/session/[sessionId]/page.tsx` or modal — show recipe, instructor bio, venue details before booking.

6. 🔲 **Empty states** — Add "No sessions available" and "No bookings yet" empty states.

7. 🔲 **Register production webhook endpoint** — Must be done in Stripe Dashboard before go-live (see [stripe-webhook-notes.md](./stripe-webhook-notes.md)).

**Dependencies:** Phase 0 (Stripe keys, webhook secret configured).

**Risks:**
- ~~Webhook handler missing — race conditions on booking creation~~ — **resolved**
- Cancellation/refund logic still needs implementation

**Complexity:** Webhook done. Remaining tasks: Low–Medium.

---

## Phase 4 — Medical / Questionnaire / T&Cs Improvements 🔲 Not started

**Goal:** Improve data integrity and consent tracking.

**Tasks:**

1. 🔲 **T&C versioning** — Add `termsVersion` field to bookings; store current version in a `config` Firestore document.

2. 🔲 **Medical info editing** — Add inline edit capability on `portal/my-students/page.tsx` per student.
   - Note: medical info write-back after booking is now handled by the webhook.

3. 🔲 **Questionnaire acknowledgement** — Show dietary/allergy summary on confirmation page.

4. 🔲 **Booking review step** — Insert a review step between T&Cs and Payment showing a full summary (session, student, price, medical notes summary).

**Dependencies:** Phase 3 (stable webhook-based booking flow).

**Risks:** Low. Mostly form and data flow improvements.

**Complexity:** Low–Medium.

---

## Phase 5 — Payments ⚠️ Partial

**Goal:** Complete payment reliability and add alternate payment options.

**Tasks:**

1. ✅ **Stripe webhook** — Done in Phase 3.

2. 🔲 **Booking cancellation + Stripe refund** — Add `/api/bookings/cancel` route:
   - Read booking by ID
   - Call `stripe.refunds.create({ payment_intent: booking.payment.stripePaymentIntentId })`
   - Update `booking.status = 'cancelled'`, `booking.payment.status = 'refunded'`
   - Send cancellation email
   - Wire up to cancel button in `admin/bookings/page.tsx` and `portal/my-classes/page.tsx`

3. 🔲 **PayPal integration** — Option A: add `payment_method_types: ['card', 'paypal']` in PaymentIntent (lowest effort via Stripe). Option B: native PayPal JS SDK.

4. 🔲 **Payment receipt URL** — Expand `latest_charge` in webhook to store the Stripe receipt URL in `booking.payment.receiptUrl`.

5. 🔲 **Spot availability pre-check** — In `create-intent`, verify `spotsAvailable > 0` and return a 409 if the session is full, preventing a PaymentIntent being created for a sold-out session.

6. 🔲 **Orphaned draft cleanup** — Cron job (Vercel Cron or Cloud Scheduler) to delete `booking_drafts` documents older than 24 hours.

**Dependencies:** Phase 3 (webhook deployed).

**Risks:** Stripe refunds require careful error handling. PayPal via Stripe needs Stripe account feature enabled.

**Complexity:** Medium–High.

---

## Phase 6 — Admin Tools 🔲 Not started

**Goal:** Give the business owner complete management capability.

**Tasks:**

1. 🔲 **Testimonials admin** — `admin/testimonials/page.tsx` with publish/unpublish toggle.

2. 🔲 **Recurring session generator** — Admin utility to bulk-create sessions for a class (e.g. every Monday for 10 weeks).

3. 🔲 **Booking cancellation in admin** — (from Phase 5).

4. 🔲 **CSV export** — Export bookings list to CSV from admin bookings page.

5. 🔲 **Admin dashboard stats** — Basic revenue summary, booking trends. Consider using `recharts` library.

6. 🔲 **Instructor display on About page** — Wire `instructors` Firestore collection to the About page (currently static).

**Dependencies:** Phase 0–5.

**Risks:** Low. Mostly admin UX.

**Complexity:** Low–Medium.

---

## Phase 7 — Polish, Testing, and Deployment 🔲 Not started

**Goal:** Production-ready quality.

**Tasks:**

1. 🔲 **Error boundaries** — Add `error.tsx` to route groups for graceful error pages.

2. 🔲 **Loading states** — Ensure all async pages have `loading.tsx` skeleton screens.

3. 🔲 **404 page** — Add `src/app/not-found.tsx`.

4. 🔲 **Integration testing** — Playwright or Cypress end-to-end tests for:
   - Sign-up flow
   - Full booking flow using Stripe test cards + CLI webhooks
   - Admin session creation

5. 🔲 **Accessibility audit** — Colour contrast, keyboard nav, ARIA labels.

6. 🔲 **Performance audit** — Lighthouse; optimise images (`next/image`).

7. 🔲 **Sitemap and robots.txt** — Add via Next.js metadata API.

8. 🔲 **Production deployment checklist**:
   - All env vars set in Vercel
   - Stripe live mode keys
   - Resend verified domain
   - `firebase deploy --only firestore:rules` executed
   - Stripe production webhook endpoint registered in Stripe Dashboard

**Dependencies:** All previous phases.

**Risks:** Testing setup from scratch takes time. Accessibility issues may require HTML restructuring.

**Complexity:** Medium.

---

## Phase Summary Table

| Phase | Goal | Key Deliverables | Status | Must-Have for MVP? |
|-------|------|-----------------|--------|-------------------|
| 0 | Stabilise | Firestore rules, env vars, live Stripe | ✅ Largely done — deploy rules | YES |
| 1 | Public pages | Courses page, SEO, DB testimonials | 🔲 Not started | YES |
| 2 | Auth/Dashboard | Email verify, redirect, account edit | 🔲 Not started | Partial |
| 3 | Booking hardening | Webhook, idempotency, cancellation | ✅ Webhook + idempotency done | YES |
| 4 | Medical/T&Cs | T&C versioning, review step | 🔲 Not started | No |
| 5 | Payments | Refunds, PayPal, receipts | ⚠️ Webhook done; refund + receipt pending | Partial |
| 6 | Admin tools | Testimonials, bulk sessions, export | 🔲 Not started | No |
| 7 | Polish/Testing | E2E tests, accessibility, SEO | 🔲 Not started | No |

**Minimum viable production launch requires Phases 0, 1, and 3.** All Phase 3 blocking work (webhook + idempotency) is done. Remaining blockers: deploy Firestore rules (Phase 0), build courses page (Phase 1), register production webhook endpoint (Phase 3).
