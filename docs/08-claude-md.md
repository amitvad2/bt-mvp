# 08 — Claude Working Memory (CLAUDE.md)

_This file is optimised for AI-assisted development sessions. Keep it updated as the project evolves._

---

## Project Summary

**Blooming Tastebuds** — a cooking class booking platform for children (After School Club, age 5–12, Mondays) and young adults (Weekend Classes, age 16+, Saturdays/Sundays). Parents register and book sessions for their children; young adults self-book. Admin manages all content.

Repo: `bt-mvp` | Framework: Next.js 16 App Router | Language: TypeScript 5

---

## Tech Stack

| Layer | Tool |
|-------|------|
| Framework | Next.js 16.1.6 (App Router, no pages/ dir) |
| Language | TypeScript 5 (strict mode) |
| Auth | Firebase Auth (email/password + Google OAuth) |
| Database | Firebase Firestore (client SDK + admin SDK) |
| Storage | Firebase Storage |
| Payments | Stripe (PaymentIntent flow + React Elements) |
| Email | Resend (transactional HTML emails) |
| Maps | Leaflet + React-Leaflet (dynamic import required) |
| Forms | React Hook Form + Zod |
| Icons | Lucide React |
| Styling | CSS Modules (no Tailwind, no component library) |
| Deployment | Vercel |

---

## Coding Conventions (inferred from repo)

- **CSS Modules** — every page/component has a co-located `.module.css` file. No global utility classes except in `globals.css`.
- **Client components** — marked `"use client"` at top. Server components are the default (no annotation).
- **Path alias** — `@/*` maps to `src/*`. Always use `@/` imports, not relative `../../`.
- **Firestore writes** — direct client SDK calls from components for standard CRUD (no custom REST layer). Use `setDoc`, `addDoc`, `updateDoc`, `deleteDoc` from `firebase/firestore`. **Exception: booking creation is server-side only** — the Stripe webhook handler (`/api/webhooks/stripe`) is the sole writer to the `bookings` collection and the sole decrementer of `sessions.spotsAvailable`. Never add client-side booking creation back.
- **Forms** — React Hook Form + Zod schema validation. Pattern: `const { register, handleSubmit, formState } = useForm<FormType>({ resolver: zodResolver(schema) })`.
- **Error states** — inline `useState` for error/success messages, not toast libraries.
- **Loading states** — `useState<boolean>` named `loading`/`isLoading`; renders a `<div className={styles.spinner}>`.
- **Types** — all shared interfaces in `src/types/index.ts`. Never define a type inline that belongs in types/index.ts.
- **Context** — auth state via `useAuth()` hook from `AuthContext`. Booking state via `useBooking()` from `BookingContext`.
- **Auth-aware public CTAs** — every public page CTA that points to `/auth/signup` must be wrapped in a `'use client'` island using `useAuth()`. Logged-in users must never see "Register", "Register Free", "Register Now", or "Get Started → /auth/signup". Pattern: `if (user) { return <logged-in CTA> }; return <logged-out CTA>`. Existing islands: `HomeCtaButtons.tsx` (homepage hero + banner), `AboutCtaSection.tsx` (about page), `TestimoniesCtaButtons.tsx` (testimonies page). Footer uses `{!user && ...}` guard. Header uses `user ? logged_in : !loading ? logged_out : spinner`. When adding new public pages with a CTA, follow the same pattern.

---

## Key Folders / Files

| Path | Purpose |
|------|---------|
| `src/types/index.ts` | **All** shared TypeScript interfaces — read this first |
| `src/context/AuthContext.tsx` | Auth state, user roles, Firebase auth methods |
| `src/context/BookingContext.tsx` | Multi-step booking wizard state (sessionStorage) |
| `src/middleware.ts` | Edge middleware — route protection rules |
| `src/lib/firebase.ts` | Firebase client SDK (db, auth, storage) |
| `src/lib/firebase-admin.ts` | Firebase Admin SDK (adminDb, adminAuth) |
| `src/lib/stripe.ts` | Stripe server client |
| `src/lib/resend.ts` | Resend email client |
| `src/app/api/payments/create-intent/route.ts` | Stripe PaymentIntent + `booking_drafts` write |
| `src/app/api/webhooks/stripe/route.ts` | Stripe webhook — authoritative booking creation |
| `src/app/api/emails/send/route.ts` | Resend email API (called from webhook, not browser) |
| `src/app/book/[sessionId]/payment/CheckoutForm.tsx` | Stripe Elements UI (no Firestore writes) |
| `firestore.rules` | Firestore security rules (ready to deploy) |
| `src/components/layout/Header.tsx` | Main nav |
| `src/components/layout/Footer.tsx` | Footer with socials |
| `.env.local.example` | All required env vars documented here |

---

## Business Requirements

### Class Types
| Type | Age | Schedule | Duration |
|------|-----|----------|----------|
| `kidsAfterSchool` | 5–12 | Mondays 3:30–4:30 pm | 1 hour |
| `youngAdultWeekend` | ~16+ (university starters) | Sat or Sun 10:30 am–12:30 pm | 2 hours |

### User Roles
- `parent` — books for child students; manages student profiles
- `youngAdult` — books for self; no child students
- `admin` — full access to admin panel; can CRUD all data

### Booking Flow (required steps in order)
1. Browse sessions (find-class)
2. Select student / add student
3. Medical info + emergency contact
4. Dietary questionnaire (kids only)
5. Accept T&Cs
6. Payment (Stripe)
7. Confirmation + email

---

## MVP Scope (build now)

- [x] Homepage, About, Gallery, Testimonials, Terms pages
- [x] Auth: sign-up, login, forgot password
- [x] User portal: dashboard, find-class, my-classes, my-payments, my-students, account
- [x] Booking wizard: student → medical → questionnaire → terms → payment → confirmation
- [x] Admin: venues, classes, sessions, recipes, gallery, instructors, bookings
- [x] Stripe payment (PaymentIntent + Elements)
- [x] Confirmation emails via Resend
- [x] **Firestore security rules** (`firestore.rules`) — file exists, **awaiting `firebase deploy --only firestore:rules`**
- [x] **Stripe webhook handler** (`/api/webhooks/stripe`) — implemented; **must register production endpoint in Stripe Dashboard before go-live**
- [ ] **Courses page** (`/courses`) — MISSING, HIGH
- [ ] **Booking cancellation** (user + admin + refund) — MISSING, HIGH

---

## Non-MVP Scope (post-launch)

- PayPal payment method
- Email reminders (pre-class)
- Bulk/recurring session creation
- Testimonials managed via DB (currently hardcoded)
- Admin analytics/charts
- Student progress tracking
- SMS notifications
- Instructor schedules
- Calendar `.ics` download

---

## Known Gaps (prioritised)

1. **`firestore.rules` not yet deployed** — file exists; run `firebase deploy --only firestore:rules` before go-live.
2. **Production Stripe webhook endpoint not registered** — must be added in Stripe Dashboard → Webhooks → Add endpoint pointing to `https://{yourdomain}/api/webhooks/stripe` before go-live.
3. **No `/courses` page** — users can't learn about class formats before signing up.
4. **No booking cancellation + Stripe refund** — users can set `status: 'cancelled'` in Firestore but no `stripe.refunds.create()` call exists; admin has no cancel button.
5. **`payment.receiptUrl` not populated** — webhook does not expand `latest_charge` to fetch the Stripe receipt URL.
6. **T&C version not stored** — `termsVersion` field missing from booking documents.
7. **Testimonials hardcoded** — cannot be managed by admin.
8. **`RESEND_FROM_EMAIL` defaults to test address** — emails will fail in production without a verified Resend domain.
9. **Account settings save not confirmed** — `portal/account` may not persist edits to Firestore.
10. **No email verification after sign-up.**
11. **Orphaned booking drafts** — if user abandons payment mid-flow, `booking_drafts` document is never cleaned up (needs a cron job).

---

## Next Recommended Tasks

1. **Deploy `firestore.rules`** — `firebase deploy --only firestore:rules --project {PROJECT_ID}` (file already in repo).
2. **Build `/courses` page** — `src/app/(public)/courses/page.tsx`, static page describing After School Club and Weekend Classes with schedule, pricing, and a CTA to `/auth/signup`.
3. **Booking cancellation + Stripe refund** — add `/api/bookings/cancel` route calling `stripe.refunds.create({ payment_intent: booking.payment.stripePaymentIntentId })`, update booking status, send cancellation email, wire up cancel buttons in `portal/my-classes` and `admin/bookings`.
4. **Populate `payment.receiptUrl`** — in the webhook, expand `latest_charge` via `stripe.paymentIntents.retrieve(piId, { expand: ['latest_charge'] })` and store `charge.receipt_url`.
5. **Register production Stripe webhook endpoint** in Stripe Dashboard before deploying to production.

---

## Important Warnings / Assumptions

- **Leaflet must be dynamically imported** — `next/dynamic` with `ssr: false`. Never `import Map from 'leaflet'` at the top of a server component.
- **Firebase client vs. admin SDK** — use `src/lib/firebase.ts` in client/server components and route handlers that don't need elevated privileges. Use `src/lib/firebase-admin.ts` only in API routes that need server-side access.
- **Prices are stored in pence (GBP)** — e.g. 2500 = £25.00. Always divide by 100 for display.
- **`spotsAvailable` decrement is server-side only** — handled exclusively by the Stripe webhook handler via a Firestore transaction. Never add client-side decrement logic. The transaction checks `spotsAvailable > 0` before decrementing; if the session is full when the webhook fires, the booking is still created (payment was taken) and an `overbooking: true` flag is set for admin review.
- **Google Sign-In requires allowed OAuth origins** in the Firebase Console → Authentication → Sign-in method → Authorised domains. Add your Vercel production URL.
- **Admin role is stored in Firestore `users/{uid}.role`**, not in Firebase custom claims. If you need middleware-level admin checks without a Firestore read, consider setting a Firebase custom claim.
- **`sessionStorage` key pattern** for booking wizard: `booking_{sessionId}`. Cleared on confirmation.
- **CSS Module class names** follow `.camelCase` convention (e.g. `.formGroup`, `.btnPrimary`).
- **CSS custom property catalogue** — only use variables defined in `src/app/globals.css`. The design system defines two naming tiers: (1) core brand tokens (`--bt-coral`, `--bt-orange`, `--bt-berry`, `--bt-sky`, `--bt-leaf`, `--bt-citrus`, `--bt-cream`, `--bt-charcoal`, `--bt-muted`, `--bt-border`) and (2) extended tokens added later (`--bt-amber`, `--bt-amber-dark`, `--bt-amber-light`, `--bt-green-light`, `--bt-warm-white`, `--bt-gray-50` through `--bt-gray-900`, `--bt-accent`, `--bt-accent-light`). Using an undefined CSS variable in a `linear-gradient()` silently makes the entire `background` invalid — text can become invisible. Always verify a variable is defined in globals.css before using it in a CSS Module.
