# 03 — Gap Analysis vs. Requirements

Legend:
- **Yes** = fully implemented
- **Partial** = code exists but incomplete
- **No** = not found in codebase

---

## Public Marketing Pages

| Requirement | Exists? | Evidence in Code | Missing Pieces | Priority | Recommended Approach |
|-------------|---------|-----------------|----------------|----------|---------------------|
| Homepage describing mission and classes | Yes | `src/app/(public)/page.tsx` — hero, features grid, founder section | None significant | — | — |
| About Us page with founder story | Yes | `src/app/(public)/about/page.tsx`, `public/founder.jpg` | Photo gallery section on About Us could be richer | Low | Add a small in-page gallery component |
| Photo gallery | Yes | `src/app/(public)/gallery/page.tsx` + `GalleryClient.tsx` — pulls from Firestore `gallery` collection | — | — | — |
| Footer with YouTube, Facebook, Instagram, LinkedIn | Yes | `src/components/layout/Footer.tsx` — all four social links present | Verify actual URLs are correct/live | Low | Update href values with real social URLs |
| Dedicated Courses page describing the two class types | **No** | No `/courses` route exists | Full page with visual descriptions, schedules, pricing, FAQs for each course type | High | Add `src/app/(public)/courses/page.tsx` as a static page |
| Testimonials page | Yes | `src/app/(public)/testimonies/page.tsx` | Reviews are hardcoded — not managed via CMS/Firestore | Medium | Add `testimonials` Firestore collection + admin CRUD |
| Contact / feedback page | **Yes** ✓ | `src/app/(public)/contact/page.tsx` — combined Contact & Feedback with form, sidebar, and FAQ | — | — | Implemented Apr 2026 |

---

## Authentication & User Management

| Requirement | Exists? | Evidence in Code | Missing Pieces | Priority | Recommended Approach |
|-------------|---------|-----------------|----------------|----------|---------------------|
| User sign-up | Yes | `src/app/auth/signup/page.tsx` — email + Google OAuth, role selection | — | — | — |
| Email/password login | Yes | `src/app/auth/login/page.tsx` | — | — | — |
| Forgot password | Yes | `src/app/auth/forgot-password/page.tsx` — calls Firebase `sendPasswordResetEmail` | — | — | — |
| User dashboard | Yes | `src/app/portal/dashboard/page.tsx` | — | — | — |
| Two user roles (parent / young adult) | Yes | `UserRole` type in `src/types/index.ts`; logic in AuthContext and booking wizard | — | — | — |
| Account settings / edit profile | Partial | `src/app/portal/account/page.tsx` exists | Save-back to Firestore and password-change UI not confirmed complete | Medium | Wire form submit to Firestore `updateDoc` + Firebase `updatePassword` |

---

## Class Discovery

| Requirement | Exists? | Evidence in Code | Missing Pieces | Priority | Recommended Approach |
|-------------|---------|-----------------|----------------|----------|---------------------|
| Browse classes by venue | Yes | `portal/find-class/page.tsx` — Firestore query + venue filter | — | — | — |
| Browse classes by class type | Yes | Filter by `kidsAfterSchool` / `youngAdultWeekend` in find-class | — | — | — |
| Browse classes by date | Yes | Date-range filter on find-class page | — | — | — |
| Map view of sessions | Yes | Leaflet map in `SessionMapFinder.tsx` and `find-class/page.tsx` | Requires venue lat/lng data to be populated | Low | Admin venue form already captures lat/lng |
| Session spot availability | Yes | `spotsAvailable` field on `Session`; decremented on booking | — | — | — |

---

## Booking Flow

| Requirement | Exists? | Evidence in Code | Missing Pieces | Priority | Recommended Approach |
|-------------|---------|-----------------|----------------|----------|---------------------|
| Booking flow entry point | Yes | "Book Now" in find-class → `/book/[sessionId]/student` | — | — | — |
| Student selection / addition | Yes | `book/.../student/page.tsx` — list existing students + add new | — | — | — |
| Medical information capture | Yes | `book/.../medical/page.tsx` — full MedicalInfo + EmergencyContact forms | — | — | — |
| Emergency contact capture | Yes | Part of medical step; `EmergencyContact` interface fully typed | — | — | — |
| Student questionnaire (dietary/allergy) | Yes | `book/.../questionnaire/page.tsx` — for kids class type only | — | — | — |
| Terms and conditions acceptance | Yes | `book/.../terms/page.tsx` — checkbox gate; timestamp recorded | — | — | — |
| Payment via Stripe | Yes | `book/.../payment/page.tsx` + `CheckoutForm.tsx` + `/api/payments/create-intent` | — | — | — |
| Payment via PayPal | **No** | Only Stripe is integrated | Entire PayPal integration absent | Medium | Add PayPal SDK or use Stripe's PayPal option via `payment_method_types: ['paypal']` |
| Booking confirmation | Yes | `book/.../confirmation/page.tsx` + confirmation email via Resend | — | — | — |
| Prevent double-booking same session | Partial | `spotsAvailable` decremented on success, but no pre-check before payment | Race condition possible | High | Add Firestore transaction check before creating PaymentIntent |
| Booking cancellation by user | **No** | No UI or API route for user-initiated cancellations | Cancel button, refund flow, Stripe refund API call, email | High | Add cancel endpoint + Stripe `refunds.create()` + update booking status |

---

## Student Profiles

| Requirement | Exists? | Evidence in Code | Missing Pieces | Priority | Recommended Approach |
|-------------|---------|-----------------|----------------|----------|---------------------|
| Add/manage children (parents) | Yes | `portal/my-students/page.tsx` + `students` Firestore collection | — | — | — |
| Reuse medical info for returning students | Partial | Medical info stored on `Student` doc + on each `Booking` doc | Pre-fill works in booking wizard; but no clear "update profile" sync after booking | Medium | After booking, write medical info back to the student document |
| Date of birth / age validation | Yes | DOB captured at student creation; age checked against session `ageMin`/`ageMax` | — | — | — |

---

## Admin Tools

| Requirement | Exists? | Evidence in Code | Missing Pieces | Priority | Recommended Approach |
|-------------|---------|-----------------|----------------|----------|---------------------|
| Venue master (CRUD) | Yes | `admin/venues/page.tsx` | — | — | — |
| Class master (CRUD) | Yes | `admin/classes/page.tsx` | — | — | — |
| Session master (CRUD) | Yes | `admin/sessions/page.tsx` | Bulk session creation (e.g. recurring weekly) not present | Medium | Add a "create recurring sessions" helper |
| Recipe master (CRUD) | Yes | `admin/recipes/page.tsx` | — | — | — |
| Photo gallery master (CRUD) | Yes | `admin/gallery/page.tsx` | — | — | — |
| Instructor master (CRUD) | Yes | `admin/instructors/page.tsx` | — | — | — |
| Bookings view | Partial | `admin/bookings/page.tsx` — read-only | No cancel/refund action; no export | High | Add cancel action + Stripe refund; add CSV export |
| Testimonials master (CRUD) | **No** | Testimonials are hardcoded in the public page | New admin section + Firestore collection | Medium | Add `admin/testimonials/page.tsx` + `testimonials` collection |
| Contact / feedback inbox | **Yes** ✓ | `admin/contact/page.tsx` — lists `contact_messages`, status filter, expandable rows, status updates | — | — | Implemented Apr 2026 |
| Admin stats / analytics | Partial | `admin/dashboard/page.tsx` — basic counts | No revenue chart, no booking trend, no export | Low | Add charting library (Recharts) + aggregate queries |

---

## Payments & Finance

| Requirement | Exists? | Evidence in Code | Missing Pieces | Priority | Recommended Approach |
|-------------|---------|-----------------|----------------|----------|---------------------|
| Stripe payment at booking time | Yes | Full Stripe Elements flow in booking wizard | — | — | — |
| Payment status tracked | Yes | `booking.payment.status` field; `receiptUrl` stored | — | — | — |
| Payment history for users | Yes | `portal/my-payments/page.tsx` | — | — | — |
| Stripe webhook handler | **No** | `STRIPE_WEBHOOK_SECRET` env var present but no route | Cannot reliably track async payment events (failures, disputes) | High | Add `/api/webhooks/stripe/route.ts` with signature verification |
| Refunds (admin-initiated) | **No** | No refund route or UI | Admin cannot issue refunds from within the app | High | Add Stripe `refunds.create()` call tied to booking cancellation |
| PayPal support | **No** | Not present | Full PayPal SDK integration or Stripe PayPal payment method | Medium | Evaluate Stripe's PayPal gateway vs. native PayPal JS SDK |

---

## Notifications & Communications

| Requirement | Exists? | Evidence in Code | Missing Pieces | Priority | Recommended Approach |
|-------------|---------|-----------------|----------------|----------|---------------------|
| Booking confirmation email | Yes | `api/emails/send/route.ts` type=`confirmation` via Resend | — | — | — |
| Cancellation email | Partial | Template exists in email route | No trigger path from admin/user cancellation UI | Medium | Wire up when cancellation UI is built |
| Pre-class reminder email | **No** | No scheduler | Scheduled job (Vercel Cron / Cloud Scheduler) needed | Medium | Use Vercel Cron Jobs + `/api/reminders/route.ts` |
| Password reset email | Yes | Firebase Auth handles this natively | — | — | — |
| Contact / feedback form with admin notification | **Yes** ✓ | `src/app/(public)/contact/page.tsx` + `POST /api/contact` — writes to Firestore `contact_messages`, sends admin email via Resend | — | — | Implemented Apr 2026 |

---

## Non-Functional Requirements

| Requirement | Exists? | Evidence in Code | Missing Pieces | Priority | Recommended Approach |
|-------------|---------|-----------------|----------------|----------|---------------------|
| Mobile-responsive design | Yes | CSS Modules with responsive layouts; mobile menu in Header | — | — | — |
| Route protection (auth) | Yes | `src/middleware.ts` — protects `/book/*` and `/admin/*` | — | — | — |
| Firestore security rules | **No** | `storage.rules` present; no `firestore.rules` file | All Firestore access is unrestricted without rules | Critical | Add `firestore.rules` with proper collection-level access control |
| Input validation | Yes | Zod schemas + React Hook Form on all forms | — | — | — |
| Error handling on API routes | Partial | Try/catch in API routes; client error states in forms | No global error boundary | Low | Add Next.js `error.tsx` pages |
| Loading states | Yes | Spinner components used throughout portal and booking wizard | — | — | — |
| SEO meta tags | Partial | Next.js default `<head>`; no custom `metadata` exports on public pages | No OG tags, no sitemap, no robots.txt | Low | Add `generateMetadata()` to public pages |
