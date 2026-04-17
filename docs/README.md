# Blooming Tastebuds — Documentation Pack

Last updated: 2026-04-16

---

## What the Current Codebase Is

`bt-mvp` is a production-quality Next.js 16 (App Router) web application for **Blooming Tastebuds**, a UK cooking class business.

The stack is: **Next.js + TypeScript + Firebase (Auth / Firestore / Storage) + Stripe + Resend + Leaflet**.

It is a full-stack application with:
- A public marketing website
- A parent/user portal
- A multi-step booking wizard
- A complete admin panel
- Stripe-powered payments with webhook-based booking confirmation
- Email notifications via Resend

The codebase was deployed to Vercel (`.vercel/` directory present).

---

## What Is Already Implemented

| Area | Status |
|------|--------|
| Homepage, About, Gallery, Testimonials, Terms pages | Complete |
| Header + Footer with social links | Complete |
| User sign-up (email + Google OAuth, role selection) | Complete |
| Login / forgot password | Complete |
| Role-based access control (parent / youngAdult / admin) | Complete |
| User portal dashboard | Complete |
| Session discovery (map + list view, filters) | Complete |
| My Classes / My Payments / My Students / Account | Complete (account save partial) |
| Booking wizard (6 steps: student → medical → questionnaire → T&Cs → payment → confirmation) | Complete |
| Medical info + emergency contact capture | Complete |
| Dietary/allergy questionnaire (kids classes) | Complete |
| T&Cs acceptance with timestamp | Complete |
| Stripe PaymentIntent + PaymentElement | Complete |
| **Stripe webhook handler** — server-side booking creation | **Complete** |
| **`booking_drafts` collection** — pre-payment state persistence | **Complete** |
| Booking confirmation emails (Resend) — triggered by webhook | Complete |
| Admin: venues, classes, sessions, recipes, gallery, instructors | Complete |
| Admin: bookings view | Partial (read-only, no cancel/refund) |
| Firestore data model (10 collections with full types) | Complete |
| Firebase Storage (image uploads in admin) | Complete |
| **`firestore.rules`** — per-collection access control | **Complete (ready to deploy)** |
| Next.js Edge middleware for route protection | Complete |
| Interactive Leaflet session maps | Complete |

---

## Top Missing Features

> Items 1 and 2 from the original list have been completed. Updated priority list below.

1. **`/courses` page** — No dedicated page describing the two class formats (After School Club / Weekend Classes) with schedules, pricing, and CTAs.
2. **Booking cancellation with Stripe refund** — Users and admins can set status to `cancelled` in Firestore, but no Stripe `refunds.create()` call is wired up.
3. **Testimonials in database** — Reviews are hardcoded in TSX; cannot be managed by admin.
4. **T&C version tracking** — `termsVersion` field missing from bookings.
5. **Email verification** — `sendEmailVerification` not called after sign-up.
6. **Account settings save** — `portal/account` edit form save-to-Firestore not confirmed complete.
7. **Post-login redirect** — Middleware doesn't preserve the intended URL before redirecting to login.
8. **`payment.receiptUrl` not populated** — Webhook creates the booking but does not expand the Stripe charge to fetch the receipt URL.
9. **Orphaned booking drafts** — If a user abandons payment mid-flow, the `booking_drafts` document is never deleted. A cleanup cron is needed.
10. **`RESEND_FROM_EMAIL`** must be set to a verified domain before production emails work.

---

## Recommended Next 5 Development Tasks

| # | Task | Why | Effort |
|---|------|-----|--------|
| 1 | **Deploy `firestore.rules`** | Rules file exists but must be deployed: `firebase deploy --only firestore:rules` | 30 min |
| 2 | **Build `/courses` page** | Missing marketing page for both class types; needed before public launch | 0.5 days |
| 3 | **Booking cancellation + Stripe refund** (`/api/bookings/cancel`) | Core business operation; admin and user cannot issue refunds from within the app | 1 day |
| 4 | **Populate `payment.receiptUrl`** | Expand `latest_charge` in webhook to store the Stripe receipt URL in the booking | 1 hour |
| 5 | **Register production Stripe webhook endpoint** | The local CLI secret and the production Stripe webhook endpoint are different — must be configured in Stripe Dashboard before go-live | 30 min |

---

## Document Index

| Doc | Title | Purpose |
|-----|-------|---------|
| [01-codebase-overview.md](./01-codebase-overview.md) | Codebase Overview | Tech stack, directory structure, routing, config |
| [02-current-features.md](./02-current-features.md) | Current Features | Complete inventory of what is built |
| [03-gap-analysis-vs-requirements.md](./03-gap-analysis-vs-requirements.md) | Gap Analysis | Every requirement vs. what exists in code |
| [04-user-flows.md](./04-user-flows.md) | User Flows | All 13 user journeys: current state + missing steps |
| [05-data-model-recommendation.md](./05-data-model-recommendation.md) | Data Model | Existing + recommended Firestore schema |
| [06-api-and-integrations.md](./06-api-and-integrations.md) | API & Integrations | All services, status, and gaps |
| [07-mvp-roadmap.md](./07-mvp-roadmap.md) | MVP Roadmap | 8-phase build plan with priorities |
| [08-claude-md.md](./08-claude-md.md) | Claude Working Memory | AI-optimised project context for coding sessions |
| [firestore-rules-notes.md](./firestore-rules-notes.md) | Firestore Rules Notes | Design decisions, tradeoffs, and deployment steps |
| [stripe-webhook-notes.md](./stripe-webhook-notes.md) | Stripe Webhook Notes | Webhook architecture, test steps, edge cases |
