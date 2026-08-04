# Documentation Audit Report

Generated: 2026-08-04  
Branch: feature/portal-mobile-nav  
Auditor: Claude Sonnet (automated via documentation audit task)

---

## 1. Per-File Audit Table

### README.md

| Statement or section | Current status | Code evidence | Required action |
|---|---|---|---|
| Entire file is the default Next.js create-next-app template | Remove | No project-specific content whatsoever | Rewrite with project-specific onboarding |
| "This is a Next.js project bootstrapped with create-next-app" | Remove | Does not describe Blooming Tastebuds | Replace with project description |

---

### docs/01-codebase-overview.md

| Statement or section | Current status | Code evidence | Required action |
|---|---|---|---|
| Tech stack table (versions) | Accurate | Matches package.json | No change |
| Directory structure — missing `src/app/book/bundle/[bundleId]/**` | Update required | Bundle wizard exists in src: student, medical, questionnaire, terms, payment, confirmation pages all present | Add bundle wizard to directory tree |
| Directory structure — missing `src/app/admin/bundles/` | Update required | `src/app/admin/bundles/page.tsx`, `BundleForm.tsx` exist | Add to tree |
| Directory structure — missing `src/app/admin/class-types/` | Update required | `src/app/admin/class-types/page.tsx`, `schema.ts` exist | Add to tree |
| Context section — missing `BundleBookingContext.tsx` | Update required | `src/context/BundleBookingContext.tsx` exists | Add to context section |
| Components — missing `BundleBrowser`, `BundleGroupCard` | Update required | Both components exist in src | Add to reusable components |
| API routes section | Accurate | All four routes present | No change |
| Routing tables — missing bundle wizard routes and admin class-types/bundles routes | Update required | All routes exist in src | Add to routing tables |
| `.env.local.example` referenced in Config table | Update required | No `.env.local.example` file exists in worktree root | Remove reference or mark as absent; env vars are documented in payment-init-debug-notes.md and HOSTING-AND-DEPLOYMENT.md |
| `RESEND_ADMIN_EMAIL` missing from Required Environment Variables | Update required | Used in `webhooks/stripe/route.ts` and `contact/route.ts` | Add to env vars list |
| `storage.rules` mentioned in Config table | Accurate | `storage.rules` exists in repo root | No change |

---

### docs/02-current-features.md

| Statement or section | Current status | Code evidence | Required action |
|---|---|---|---|
| Section 2.4 — "admin routes additionally verify the `customClaims.admin` flag set via Firebase Admin SDK" | Update required (inaccurate) | `src/middleware.ts` checks only for `bt_session` cookie presence (plain boolean). No custom claims check anywhere in the codebase. Admin role is read from Firestore client-side by portal layout. | Correct to: middleware checks bt_session cookie; admin role enforced client-side by portal layout and server-side by Firestore rules |
| Section 3.3 My Classes — no mention of bundle booking display | Update required | `src/app/portal/my-classes/page.tsx` groups bundle bookings via `BundleGroupCard` | Add bundle booking display to My Classes section |
| Section 4 (Booking Wizard) — no mention of bundle booking wizard | Update required | Full bundle wizard exists: `src/app/book/bundle/[bundleId]/**` | Add new section for bundle booking wizard |
| Section 5 (Admin Panel) — missing Admin Bundles and Admin Class Types | Update required | `src/app/admin/bundles/` and `src/app/admin/class-types/` both exist | Add sections 5.10 and 5.11 |
| Section 7.2 "admin UI does not currently have a button to trigger cancellations, so this path is partially unused" | Update required | Users CAN cancel individual bookings from `portal/my-classes` which triggers the cancellation email via `POST /api/emails/send`. Bundle cancellation also implemented. | Update: cancellation email path is fully used by portal |
| Section 7 — missing bundle-cancellation email type | Update required | `src/app/api/emails/send/route.ts` handles `type: 'bundle-cancellation'` | Add bundle-cancellation email type |
| Section 9.1 TypeScript types — missing Bundle, BundleBookingWizardState, BTClassType, BundleStatus, ContactCategory, ContactStatus, ContactMessage | Update required | All present in `src/types/index.ts` | Update entity list |
| Section 9.2 Firestore collections — missing `class_types` and `bundles` | Update required | Both referenced in code: `collection(db, 'class_types')`, `collection(db, 'bundles')`, and in `firestore.rules` | Add to collections list |
| Section 10 Missing — "Booking cancellation by user: No UI or API route" | Update required | Users CAN cancel individual bookings from portal/my-classes (updateDoc to status:'cancelled' + cancellation email). Gap is Stripe refund, not UI. | Correct: cancellation UI exists, refund does not |

---

### docs/03-gap-analysis-vs-requirements.md

| Statement or section | Current status | Code evidence | Required action |
|---|---|---|---|
| "Booking cancellation by user — No" | Update required | `portal/my-classes/page.tsx` implements `handleCancel` which updates status to 'cancelled' and sends cancellation email | Change to Partial: UI and email exist; Stripe refund does not |
| Flow 12 note: "No Stripe webhook handler" under Missing Steps | Update required | `src/app/api/webhooks/stripe/route.ts` fully implemented | Remove this note; webhook is implemented |
| Session bundles row absent from all sections | Update required | Full bundle feature implemented | Add bundle feature across Booking Flow and Admin Tools sections |
| Admin Class Types CRUD absent | Update required | `src/app/admin/class-types/page.tsx` exists | Add to Admin Tools section |
| Contact form categories — "class-info, booking-help, dietary-allergy, private-event" missing | Update required | `src/app/api/contact/route.ts` schema has 7 categories: general, class-info, booking-help, dietary-allergy, private-event, technical, feedback | Update category list wherever referenced |

---

### docs/04-user-flows.md

| Statement or section | Current status | Code evidence | Required action |
|---|---|---|---|
| Flow 12 Missing Steps: "No Stripe webhook handler" | Remove | `src/app/api/webhooks/stripe/route.ts` fully implemented | Remove this listed missing step |
| Flow 12 Missing Steps: "No idempotency check" | Remove | Implemented: booking doc ID = PaymentIntent ID; transaction checks existence | Remove this listed missing step |
| Flow 13: "Confirmation email sent from CheckoutForm (before redirect)" | Update required | Email is now sent exclusively from the webhook, not from CheckoutForm. CheckoutForm was refactored to remove all Firestore/email calls. | Correct to: email sent from webhook after booking creation |
| Flow 14 Contact — category enum: 'general' | 'booking' | 'feedback' | 'technical' | 'other' | Update required | Actual enum: 'general' \| 'class-info' \| 'booking-help' \| 'dietary-allergy' \| 'private-event' \| 'technical' \| 'feedback' | Correct the enum values |
| No Flow for Bundle Booking | Update required | Bundle wizard exists: /book/bundle/[bundleId]/* with 6 steps | Add Flow for bundle booking |

---

### docs/05-data-model-recommendation.md

| Statement or section | Current status | Code evidence | Required action |
|---|---|---|---|
| Bottom section "Firestore Security Rules (MISSING — Critical)" and the entire code block with "Action required: Create firestore.rules" | Remove | `firestore.rules` exists in repo root with comprehensive per-collection rules | Remove this section entirely; add a note that rules exist and have been deployed |
| Gallery category field shows `'cooking-classes' \| 'cakes' \| 'cookies' \| 'breads'?` | Update required | `GalleryCategory` type is `'cooking-classes' \| 'personal-gallery'`. Legacy values normalized at read time via `normalizeCategory()`. | Correct the type definition |
| Contact message category shows `'general' \| 'booking' \| 'feedback' \| 'technical' \| 'other'` | Update required | Actual `ContactCategory` enum: `'general' \| 'class-info' \| 'booking-help' \| 'dietary-allergy' \| 'private-event' \| 'technical' \| 'feedback'` | Correct the category values |
| Missing `bundles` collection | Update required | `bundles/{bundleId}` exists in Firestore rules and is queried in code | Add bundles collection documentation |
| Missing `class_types` collection | Update required | `class_types/{docId}` exists in Firestore rules; `BTClassType` fully typed | Add class_types collection documentation |
| Missing `booking_drafts` collection | Update required | `booking_drafts/{paymentIntentId}` written by create-intent, read/deleted by webhook | Add booking_drafts collection (server-side only) |
| Testimonials listed as "Recommended New Entity #10" but contact_messages also numbered 10 | Update required | Numbering conflict | Fix numbering |

---

### docs/06-api-and-integrations.md

| Statement or section | Current status | Code evidence | Required action |
|---|---|---|---|
| `POST /api/payments/create-intent` — "Auth: None enforced at the API route level" | Update required (inaccurate) | Route verifies Firebase ID token: `adminAuth.verifyIdToken(token)` with 401 on failure | Correct to: Auth required — Bearer token verified via Firebase Admin SDK |
| `POST /api/emails/send` — "Auth: None enforced at route level" | Update required (inaccurate) | Route verifies Firebase ID token: `adminAuth.verifyIdToken(token)` with 401 on failure | Correct to: Auth required — Bearer token verified |
| `POST /api/emails/send` — type list shows only `'confirmation' \| 'cancellation'` | Update required | Route also handles `type: 'bundle-cancellation'` | Add bundle-cancellation type |
| Admin Route Protection: "Checks user role in Firestore is admin. Redirects non-admin users to /portal/dashboard." | Update required (inaccurate) | `src/middleware.ts` checks only for `bt_session` cookie. It does NOT check Firestore role or custom claims. Role check is done client-side by portal/admin layouts. | Correct: middleware only gates on cookie presence; role is enforced client-side and by Firestore rules |
| Admin Data Operations: "7 admin pages" | Update required | Now 9 admin pages: +bundles, +class-types | Update count |
| `POST /api/contact` — Input schema shows `"category": "'general' \| 'booking' \| 'feedback' \| 'technical' \| 'other'"` | Update required | Actual Zod schema: `z.enum(['general', 'class-info', 'booking-help', 'dietary-allergy', 'private-event', 'technical', 'feedback'])` | Correct the enum values |
| `RESEND_ADMIN_EMAIL` not mentioned in Resend section | Update required | Env var used in webhook for admin booking notifications | Add to Resend section |
| Firebase Auth role note: "Middleware reads the cookie (JWT) then fetches the role from Firestore for admin checks" | Update required | Middleware reads bt_session cookie (plain boolean string) and does NOT fetch from Firestore. Role fetch happens client-side. | Correct the middleware description |

---

### docs/07-mvp-roadmap.md

| Statement or section | Current status | Code evidence | Required action |
|---|---|---|---|
| Phase 5 task 5 "Spot availability pre-check — In create-intent, verify spotsAvailable > 0 — Not started" | Update required | `create-intent/route.ts` already checks spotsAvailable > 0 for single sessions and each bundle session before creating PaymentIntent. Returns 400 if full. | Mark as Completed |
| Session Bundles feature entirely absent from roadmap | Update required | Bundles fully implemented: admin CRUD, public browser, booking wizard, payments, emails | Add as completed phase or sub-tasks |
| Dynamic Class Types (BTClassType) entirely absent | Update required | `src/app/admin/class-types/page.tsx` and Firestore `class_types` collection fully implemented | Add as completed items |
| Phase 0 task 1 "Add firestore.rules — awaiting deployment" | Mark as partial | Rules file exists. Production deployment status confirmed via HOSTING-AND-DEPLOYMENT.md (live mode). | Mark deployment as completed (inferred from live production) |
| Phase 3 task 4 "Booking cancellation with Stripe refund" — No | Partially implemented | Users can cancel bookings (no refund); cancellation email is sent. The gap is Stripe refund only. | Update to Partial |

---

### docs/08-claude-md.md

| Statement or section | Current status | Code evidence | Required action |
|---|---|---|---|
| Context section — missing `BundleBookingContext.tsx` | Update required | Exists at `src/context/BundleBookingContext.tsx` | Add to context section |
| Key Folders/Files table — missing `src/context/BundleBookingContext.tsx` | Update required | File exists | Add row |
| Key Folders/Files table — missing `src/app/admin/bundles/page.tsx`, `src/app/admin/class-types/page.tsx` | Update required | Both exist | Add rows |
| MVP Scope — missing session bundles and class-types as completed | Update required | Both implemented | Add checkmarks |
| Business Requirements — Class Types section shows fixed slugs `kidsAfterSchool`/`youngAdultWeekend` | Mark as partial | Class types are now dynamic (stored in `class_types` Firestore collection via `BTClassType`). The kiro spec `dynamic-class-types` is implemented. Slugs are still used in code but can be admin-managed. | Add note that class types are now dynamic |
| Booking Flow steps only covers single-session wizard | Update required | Bundle wizard also exists with same steps | Note that both single-session and bundle wizards follow same 6-step pattern |
| `.env.local.example` referenced in Key Files table | Update required | File does not exist in repo | Remove reference |
| `RESEND_ADMIN_EMAIL` missing from Important Warnings | Update required | Env var needed for admin booking notifications | Add to warnings |

---

### docs/payment-init-debug-notes.md

| Statement or section | Current status | Code evidence | Required action |
|---|---|---|---|
| Root cause, files changed, verification steps | Accurate — historical operational record | Matches current `firebase-admin.ts` and `create-intent/route.ts` implementations | Add header noting this is a current operational guide |
| Architecture reminder diagram | Accurate | Matches current implementation | No change |
| RESEND_FROM_EMAIL env var not mentioned in env list | Minor gap | Used in resend.ts | Add to env list in this doc |
| `RESEND_ADMIN_EMAIL` not in env list | Minor gap | Used in webhook for admin notifications | Add to env list |

---

### docs/stripe-webhook-notes.md

| Statement or section | Current status | Code evidence | Required action |
|---|---|---|---|
| Architecture diagram and description | Accurate | Matches current implementation | No change |
| Stripe Events Handled table — only shows single-session path | Update required | Webhook also handles bundle payments via `handleBundlePaymentSucceeded` | Add bundle path to events table |
| Bundle booking ID scheme `{piId}_{sessionId}` not mentioned | Update required | Bundle bookings use this ID pattern in `handleBundlePaymentSucceeded` | Add note |
| Missing info about bundle confirmation email | Update required | `sendBundleConfirmationEmail` is called on bundle payment success | Document bundle email |
| Missing info about admin booking notification email | Update required | `sendAdminBookingNotification` called for both single and bundle payments | Document admin notification |
| "Files Changed" table mentions CheckoutForm.tsx changes removing Firestore calls | Accurate — historical | This is correct historical record of the refactor | Mark with historical header |

---

### docs/firestore-rules-notes.md

| Statement or section | Current status | Code evidence | Required action |
|---|---|---|---|
| Per-collection rule model table: sessions row shows "Decrement spotsAvailable only" as an authenticated user write | Update required (superseded) | After the webhook refactor, this rule was REMOVED. Sessions are now admin-only write. | Update table to reflect current rules |
| "The Booking Write Decision — What the current rules do" section | Superseded | The client-side create rule was removed as part of the webhook refactor. Bookings are now admin-only write via webhook. | Mark as superseded; reference stripe-webhook-notes.md |
| "Recommended next step — move booking creation server-side" | Superseded | This step was completed: webhook implemented, CheckoutForm refactored, client create rule removed | Mark as completed/superseded |
| "Code Paths That Will Fail Under These Rules" table includes `CheckoutForm.addDoc(bookings)` and `CheckoutForm.updateDoc(sessions)` | Update required | These code paths no longer exist. CheckoutForm was refactored to remove all Firestore writes. | Remove or mark as deleted code paths |
| Missing `bundles` collection rule | Update required | `firestore.rules` includes `match /bundles/{bundleId}` | Add to table |
| Missing `class_types` collection rule | Update required | `firestore.rules` includes `match /class_types/{docId}` | Add to table |
| `contact_messages` not in the rule model table | Update required | `match /contact_messages/{docId}` exists in rules | Add to table |
| `booking_drafts` not in the rule model table | Update required | `match /booking_drafts/{docId}` with deny-all exists in rules | Add to table |

---

### docs/HOSTING-AND-DEPLOYMENT.md

| Statement or section | Current status | Code evidence | Required action |
|---|---|---|---|
| Entire file | Accurate | Consistent with codebase infrastructure (Stripe, Firebase, Vercel, Resend, GoDaddy) | No changes needed |
| Firestore rules file references | Accurate | `firestore.rules` exists | No change |

---

### docs/README.md (docs index)

| Statement or section | Current status | Code evidence | Required action |
|---|---|---|---|
| Document index table | Partially accurate | Missing HOSTING-AND-DEPLOYMENT.md from index | Add missing doc |
| Feature list — "Firestore data model (10 collections)" | Update required | Now at minimum 12 collections: +class_types, +bundles | Update count |
| Feature list — Bundles feature absent | Update required | Fully implemented | Add |

---

## 2. Summary

### Files reviewed
- Source files: all files under `src/` (130+ files including tests)
- Kiro specs: 10 spec directories
- Documentation: 13 Markdown files (README.md + docs/*)

### Files requiring updates
All documentation files require updates. Summary by severity:

**Critical inaccuracies (misinformation about how the system works):**
- `docs/02-current-features.md` — incorrect claim about Firebase custom claims in middleware
- `docs/05-data-model-recommendation.md` — claims `firestore.rules` is missing when it exists and is comprehensive
- `docs/06-api-and-integrations.md` — claims create-intent and emails/send have no auth; both verify Firebase ID tokens
- `docs/04-user-flows.md` — claims no Stripe webhook handler when it's implemented; claims emails sent from CheckoutForm when they're sent from webhook

**Missing implemented features:**
- Session Bundles feature (admin CRUD, bundle browser, bundle booking wizard, bundle payments, bundle emails) — absent from most docs
- Dynamic Class Types (BTClassType, admin/class-types page) — absent from most docs
- User booking cancellation with email — described as "not implemented" when it exists (without Stripe refund)
- `bundle-cancellation` email type — absent from email docs
- `RESEND_ADMIN_EMAIL` env var — absent from env var lists
- Admin booking notification emails — not documented

**Documented features not implemented:**
- `.env.local.example` file — referenced in docs but does not exist in repo
- Firebase custom claims admin check in middleware — described but not in code

**Planned features incorrectly described as implemented or missing:**
- Guest Express Checkout: `.kiro/specs/guest-express-checkout/` directory referenced in git status but no files present — Planned, requirements not yet written
- Session Safety Report: `.kiro/specs/session-safety-report/` directory referenced in git status but no files present — Planned

**Conflicting documentation:**
- `docs/firestore-rules-notes.md` still describes the old client-side booking creation model as current code, while `docs/stripe-webhook-notes.md` documents the correct webhook-based model
- `docs/07-mvp-roadmap.md` Phase 5 task 5 marks spot availability pre-check as not started when it is implemented

**Unresolved questions:**
1. Was `firebase deploy --only firestore:rules` run against production? `HOSTING-AND-DEPLOYMENT.md` suggests the app is live, but no explicit confirmation of rules deployment in docs.
2. Is `firestore.indexes.json` deployed? The file exists but no doc confirms deployment.
3. The `safe-deployment-workflow` kiro spec tasks.md is modified per git status — what is the current deployment workflow?
4. The `bt_session` cookie is set with `SameSite=Lax; Secure` — does this work correctly in the local dev context (http)?
5. `payment.receiptUrl` is always `null` in booking documents — receipt links in the portal my-payments page will never work.

### Validation commands run
- `npm run lint`: 138 problems (65 errors, 73 warnings). All errors are `@typescript-eslint/no-explicit-any` in `src/types/index.ts` and other files. No code was changed.
- `npm run build`: Failed — "Error: Neither apiKey nor config.authenticator provided" from Stripe SDK. Cause: `STRIPE_SECRET_KEY` env var not set in worktree environment. This is expected in a read-only worktree context without secrets. No code failures.

### Confirmation
- No application code (`.ts`, `.tsx`, `.js`, `.json`, `.css`, `firestore.rules`) was changed during this audit.
- No production systems were modified.
