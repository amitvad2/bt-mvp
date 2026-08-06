# Implementation Plan: Guest Express Checkout

## Overview

Implement a parallel, unauthenticated booking path for Blooming Tastebuds that allows parents to book cooking sessions via shareable links without creating a Firebase account. The implementation uses TypeScript, Next.js App Router, Stripe Payment Element, Cloudflare Turnstile for bot protection, and Vercel KV for rate limiting.

## Tasks

- [x] 1. Foundation — Types, Feature Flag, and Utilities
  - [x] 1.1 Add guest checkout types to src/types/index.ts
    - Add `BookingMode`, `BookingSource`, `SafetyReviewStatus` types
    - Add `GuestParentDetails`, `GuestChildDetails`, `GuestMedicalInfo`, `GuestAllergyDietaryInfo` interfaces
    - Add `GuestEmergencyContact`, `GuestAuthorisedCollector`, `GuestConsentRecord`, `ConsentAudit` interfaces
    - Add `GuestSessionInfo`, `GuestBooking`, `GuestBookingDraft` interfaces
    - Augment existing `Booking` interface with optional guest fields (`bookingMode`, `bookingSource`, `safetyReviewStatus`, embedded snapshots)
    - _Requirements: GUEST-DATA-001 (18.1–18.12), GUEST-FR-017 (17.3, 17.4)_

  - [x] 1.2 Create feature flag utility
    - Create `src/lib/feature-flags.ts` with `isGuestCheckoutEnabled()` function
    - Read from `process.env.NEXT_PUBLIC_GUEST_CHECKOUT_ENABLED`
    - Return `true` only when value is exactly `'true'`
    - _Requirements: GUEST-FR-016 (16.1)_

  - [x] 1.3 Create Cloudflare Turnstile verification utility
    - Create `src/lib/turnstile.ts` with `verifyTurnstileToken(token, ip?)` function
    - POST to `https://challenges.cloudflare.com/turnstile/v0/siteverify`
    - Use `TURNSTILE_SECRET_KEY` environment variable
    - Return boolean success result
    - _Requirements: GUEST-SEC-001 (22.1, 22.4)_

  - [x] 1.4 Create Vercel KV rate limiting utility
    - Create `src/lib/rate-limit.ts` with `checkRateLimit(identifier, limit, windowSeconds)` function
    - Install `@vercel/kv` package
    - Implement sliding window counter using KV `incr` and `expire`
    - Return `{ allowed, remaining, resetAt }` result
    - _Requirements: GUEST-SEC-001 (22.2)_

  - [x] 1.5 Create Zod validation schemas for guest intent API
    - Create `src/app/api/payments/create-guest-intent/schemas.ts`
    - Define `parentDetailsSchema`, `childDetailsSchema`, `medicalInfoSchema`
    - Define `emergencyContactSchema`, `authorisedCollectorSchema`, `consentsSchema`
    - Define `allergyDietaryInfoSchema`, `bookingSourceSchema`
    - Define combined `createGuestIntentSchema` with all nested schemas
    - Mandatory consents use `z.literal(true)` to enforce acceptance
    - _Requirements: GUEST-FR-008 (8.3), GUEST-FR-003 (3.4)_

  - [x] 1.6 Write property tests for foundation utilities
    - **Property 1: Age Validation Correctness** — Test that age validation accepts child IFF age at session date is within [ageMin, ageMax]
    - **Property 10: Feature Flag API Gating** — Test that feature flag utility returns true only when env var is exactly 'true'
    - **Validates: Requirements 3.2, 3.3, 8.5, 16.1, 16.2, 16.4**

- [x] 2. Guest Payment API — POST /api/payments/create-guest-intent
  - [x] 2.1 Implement the guest payment intent route handler
    - Create `src/app/api/payments/create-guest-intent/route.ts`
    - Implement feature flag check (403 if disabled)
    - Parse JSON body with 64KB payload limit
    - Rate limit check per IP (5 req/60s) via Vercel KV
    - Turnstile token verification
    - Submission reference deduplication (5-min window in KV)
    - Zod schema validation
    - Session lookup from Firestore (validate open, future, spots > 0)
    - Child age validation against session ageMin/ageMax
    - Mandatory consent validation
    - Create Stripe PaymentIntent with Firestore-authoritative price (GBP)
    - Include only safe metadata: bookingMode, sessionId, source, draftId, env
    - Save `booking_drafts/{piId}` with full payload
    - If draft save fails: cancel PaymentIntent, return 500
    - Return `{ clientSecret, paymentIntentId }`
    - _Requirements: GUEST-FR-008 (8.1–8.13), GUEST-SEC-001 (22.1–22.5), GUEST-SEC-002 (23.1)_

  - [x] 2.2 Write property tests for guest payment API
    - **Property 2: Session Eligibility Gate** — For any session state, validation returns eligible=true IFF status is open, date future, spots > 0
    - **Property 3: Mandatory Consent Enforcement** — Submission rejected IFF any mandatory consent is false
    - **Property 5: Server-Authoritative Price** — PaymentIntent amount always equals Firestore session price regardless of client-supplied value
    - **Property 13: Zod Schema Validation Consistency** — Schema accepts valid inputs and rejects invalid inputs consistently
    - **Property 14: Draft Failure Triggers PaymentIntent Cancellation** — If draft write fails, PaymentIntent is cancelled
    - **Validates: Requirements 2.1–2.5, 6.1, 6.3, 8.3–8.11**

  - [x] 2.3 Write unit tests for guest payment API
    - Test invalid session ID returns 400
    - Test closed/cancelled/full/past session returns 400
    - Test underage and overage child rejected
    - Test missing mandatory consents returns 400
    - Test bot verification failure returns 400
    - Test rate-limited requests return 429
    - Test duplicate submission reference returns 409
    - Test Stripe metadata contains no PII or medical data
    - Test feature flag disabled returns 403
    - _Requirements: GUEST-TEST-001 (32.1–32.15)_

- [x] 3. Webhook Modifications — Guest Booking Mode Handling
  - [x] 3.1 Extend webhook to handle guest bookings
    - Modify `src/app/api/webhooks/stripe/route.ts`
    - Add `bookingMode` check in `handlePaymentIntentSucceeded`
    - Branch to new `handleGuestPaymentSucceeded` when `draft.bookingMode === 'guest'`
    - Validate consent records exist in draft
    - Call `determineSafetyReviewStatus(draft)` to set review status
    - Atomic booking creation + capacity decrement in Firestore transaction
    - Build `GuestBooking` document with all embedded snapshots
    - Idempotent check (skip if booking already exists)
    - Send guest confirmation email via Resend
    - Delete draft after successful creation
    - Ensure existing authenticated booking flow is unchanged
    - _Requirements: GUEST-FR-009 (9.1–9.10), GUEST-FR-017 (17.1–17.4)_

  - [x] 3.2 Implement safety review status determination
    - Create `determineSafetyReviewStatus(draft)` utility function
    - Return `'pending'` if any high-risk declarations: foodAllergies, epipenRequired, respiratoryProblems, airborneAllergies, non-empty medicalConditions
    - Return `'not_required'` otherwise
    - _Requirements: GUEST-FR-013 (13.1, 13.2)_

  - [x] 3.3 Implement guest confirmation email template
    - Add `sendGuestConfirmationEmail(draft)` function
    - Include: parent first name, child first name, class name, date, time, venue, amount, booking reference (last 8 chars of PI ID)
    - Exclude: medical details, allergy info, emergency contacts, full PI ID
    - Prefix subject with `[PREVIEW]` when `isPreview` is true
    - Restrict recipients to `PREVIEW_EMAIL_RECIPIENTS` in Preview mode
    - _Requirements: GUEST-FR-011 (11.1–11.4), GUEST-SEC-002 (23.5)_

  - [x] 3.4 Write property tests for webhook and safety review
    - **Property 7: Guest Booking Data Completeness** — Resulting booking document contains all required embedded snapshots matching draft data
    - **Property 8: Safety Review Status Classification** — Returns 'pending' IFF any high-risk declaration is true
    - **Property 9: Webhook Idempotency** — At most one booking and one decrement per PaymentIntent ID
    - **Validates: Requirements 9.3–9.9, 13.1, 13.2, 18.1–18.12, 21.4, 21.5**

  - [x] 3.5 Write unit tests for webhook guest handling
    - Test successful guest booking creation with correct snapshots
    - Test spotsAvailable decremented exactly once
    - Test duplicate webhook skipped (idempotent)
    - Test payment_failed does not create booking
    - Test missing draft handled gracefully
    - Test missing consent in draft prevents booking creation
    - Test confirmation email content excludes medical data
    - Test safetyReviewStatus set correctly
    - Test existing authenticated booking flow unaffected
    - _Requirements: GUEST-TEST-002 (33.1–33.8)_

- [x] 4. Checkpoint — Verify API layer
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Guest Booking Status API — GET /api/guest-booking-status
  - [x] 5.1 Implement the guest booking status route handler
    - Create `src/app/api/guest-booking-status/route.ts`
    - Feature flag check (403 if disabled)
    - Rate limit check (30 req/IP/60s for polling)
    - Validate `pi` query param matches Stripe PI format (`pi_*`)
    - Validate `session` query param present
    - Read `bookings/{pi}` from Firestore
    - Verify booking's sessionId matches provided session param (prevent enumeration)
    - Return `{ status: 'pending' }` if booking not yet created
    - Return non-sensitive summary if confirmed: status, reference (last 8 chars), childFirstName, className, date, startTime, endTime, venueName, amountPaid
    - Never return medical/allergy/emergency data
    - _Requirements: GUEST-FR-010 (10.1–10.8), GUEST-SEC-004 (25.1–25.4)_

  - [x] 5.2 Write property test for confirmation response
    - **Property 11: Confirmation Response Non-Sensitivity** — Response contains only allowed fields; never medical/allergy/emergency/full PI ID/parent email/phone/child last name
    - **Validates: Requirements 10.6, 25.1–25.4**

  - [x] 5.3 Write unit tests for guest booking status API
    - Test pending state (booking not yet created)
    - Test confirmed state returns correct summary fields
    - Test invalid PI format rejected
    - Test mismatched session ID rejected
    - Test feature flag disabled returns 403
    - Test rate limiting enforced
    - _Requirements: GUEST-FR-010, GUEST-SEC-004_

- [x] 6. Guest Form UI — Route and Context Setup
  - [x] 6.1 Create guest booking route server component
    - Create `src/app/express-booking/[sessionId]/page.tsx` as Server Component
    - Load session document from Firestore using Admin SDK
    - Check feature flag — render "feature not available" if disabled
    - Validate session (exists, open, future, spots > 0)
    - Render appropriate error messages for invalid sessions
    - Pass session data to GuestBookingClient
    - Extract `source` query parameter for analytics
    - _Requirements: GUEST-FR-001 (1.1–1.6), GUEST-FR-002 (2.1–2.5), GUEST-FR-016 (16.2), GUEST-UX-003 (30.1–30.5)_

  - [x] 6.2 Create GuestBookingContext provider
    - Create `src/app/express-booking/[sessionId]/GuestBookingContext.tsx`
    - Define `GuestBookingWizardState` and `GuestBookingContextType` interfaces
    - Implement sessionStorage persistence (key: `guest_booking_${sessionId}`)
    - Provide state setters: setParentDetails, setChildDetails, setMedicalInfo, setAllergyDietaryInfo, setEmergencyContact, setAuthorisedCollector, setConsents
    - Implement goToStep and clearState methods
    - Restore state from sessionStorage on mount
    - _Requirements: GUEST-FR-003 (3.5), GUEST-UX-001 (28.3)_

  - [x] 6.3 Create GuestBookingClient orchestrator component
    - Create `src/app/express-booking/[sessionId]/GuestBookingClient.tsx` ('use client')
    - Wrap with GuestBookingContext provider
    - Render ProgressIndicator showing current step (0–5)
    - Conditionally render step components based on currentStep
    - Handle API submission and error display
    - Implement client-side error handling (blocking errors, retry, validation scroll)
    - _Requirements: GUEST-FR-001, GUEST-UX-001 (28.2), GUEST-UX-002 (29.2)_

  - [x] 6.4 Create CSS Modules for guest booking
    - Create `src/app/express-booking/[sessionId]/styles/GuestBooking.module.css`
    - Create `src/app/express-booking/[sessionId]/styles/Steps.module.css`
    - Mobile-first layout (320px minimum)
    - Touch-friendly inputs (44px minimum tap targets)
    - Responsive design scaling up to desktop
    - Progress indicator styling
    - Form field and error message styling
    - _Requirements: GUEST-UX-001 (28.1, 28.4)_

- [x] 7. Guest Form UI — Form Steps
  - [x] 7.1 Implement SessionInfoStep (Step 0)
    - Create `src/app/express-booking/[sessionId]/steps/SessionInfoStep.tsx`
    - Display session: class name, date, time, venue, age range, price, availability
    - Display "No account required" message prominently
    - "Continue" button to advance to Step 1
    - _Requirements: GUEST-FR-001 (1.3), GUEST-UX-002 (29.1)_

  - [x] 7.2 Implement ParentChildStep (Step 1)
    - Create `src/app/express-booking/[sessionId]/steps/ParentChildStep.tsx`
    - Use React Hook Form + Zod for: parent firstName, lastName, email, telephone; child firstName, lastName, dateOfBirth
    - Client-side age validation against session ageMin/ageMax (calculate age at session date)
    - Display error if child age outside range, prevent progression
    - Appropriate mobile keyboard types (email, tel, date)
    - Back/Next navigation
    - _Requirements: GUEST-FR-003 (3.1–3.5)_

  - [x] 7.3 Implement MedicalAllergyStep (Step 2)
    - Create `src/app/express-booking/[sessionId]/steps/MedicalAllergyStep.tsx`
    - Collect all medical fields: foodAllergies, dietaryRequirements, airborneAllergies, allergenDetails, knownReactions, symptoms, epipenRequired, epipenDetails, medicationDetails, respiratoryProblems, medicalConditions, recentOperations, visionImpairment, hearingImpairment, additionalSupportNeeds, otherSafetyInfo
    - Conditional fields: show EpiPen details when epipenRequired=true; show allergen/reaction/symptom details when foodAllergies=true
    - Display disclaimer about accommodation assessment
    - React Hook Form + Zod validation
    - _Requirements: GUEST-FR-004 (4.1–4.5)_

  - [x] 7.4 Implement EmergencyContactStep (Step 3)
    - Create `src/app/express-booking/[sessionId]/steps/EmergencyContactStep.tsx`
    - Emergency contact fields: name, relationship, mobile, alternativePhone, email
    - Authorised collector fields: name, relationship, phone, sameAsParent checkbox
    - When sameAsParent checked: auto-populate collector from parent details (Step 1)
    - Validate at least one phone number for both contacts
    - React Hook Form + Zod validation
    - _Requirements: GUEST-FR-005 (5.1–5.5)_

  - [x] 7.5 Implement ConsentStep (Step 4)
    - Create `src/app/express-booking/[sessionId]/steps/ConsentStep.tsx`
    - Mandatory consents (all must be accepted): parentGuardianAuthority, accuracyOfInformation, healthSafetyDataProcessing, emergencyAssistanceAuthorisation, termsAndCancellationPolicy, privacyNoticeAcknowledgement
    - Optional consents (unticked by default): photographyPromotionalUse, emailMarketing, whatsappMarketing
    - Prevent progression if any mandatory consent unchecked
    - Never pre-tick optional consents
    - _Requirements: GUEST-FR-006 (6.1–6.5)_

  - [x] 7.6 Implement ReviewPaymentStep (Step 5)
    - Create `src/app/express-booking/[sessionId]/steps/ReviewPaymentStep.tsx`
    - Display complete summary: parent details, child details, medical/allergy summary, emergency contact, authorised collector, all consent selections, session details, total amount
    - Gate Stripe Payment Element rendering until ALL conditions met: fields complete, server validation passes, mandatory consents accepted, session open, spots > 0, age valid
    - Display clear message explaining what blocks payment if any condition unmet
    - Allow back-navigation to correct information
    - Embed Cloudflare Turnstile widget (invisible mode)
    - On submit: POST to /api/payments/create-guest-intent with full payload + turnstile token
    - Initialise Stripe Payment Element with returned clientSecret
    - Handle payment success → redirect to confirmation page
    - Handle payment errors → display error, allow retry
    - Generate UUID submissionRef client-side for idempotency
    - _Requirements: GUEST-FR-007 (7.1–7.4), GUEST-FR-015 (15.1–15.4), GUEST-FR-019 (21.1)_

  - [x] 7.7 Write property test for same-as-parent auto-population
    - **Property 12: Same-as-Parent Auto-Population** — When sameAsParent is true, collector name equals parent full name and collector phone equals parent telephone
    - **Validates: Requirements 5.3**

  - [x] 7.8 Write unit tests for form step components
    - Test SessionInfoStep displays all session details
    - Test ParentChildStep age validation (accept/reject based on range)
    - Test MedicalAllergyStep conditional field display
    - Test EmergencyContactStep same-as-parent auto-fill
    - Test ConsentStep blocks progression without mandatory consents
    - Test ConsentStep optional consents unticked by default
    - Test ReviewPaymentStep gates payment correctly
    - Test form state preserved across step navigation
    - _Requirements: GUEST-TEST-004 (35.1–35.10)_

- [x] 8. Confirmation Page UI
  - [x] 8.1 Create confirmation page route
    - Create `src/app/express-booking/[sessionId]/confirmation/page.tsx` (Server Component shell)
    - Create `src/app/express-booking/[sessionId]/confirmation/ConfirmationClient.tsx` ('use client')
    - Read paymentIntentId and sessionId from sessionStorage
    - Poll `GET /api/guest-booking-status?pi={piId}&session={sessionId}` every 2-3 seconds
    - Display "Payment received. We are finalising your booking." while pending
    - Display booking summary when confirmed: reference, child first name, class, date, time, venue, amount
    - Display "Your safety information has been received" message
    - Clear sessionStorage guest booking state on successful display
    - Never display medical/allergy/emergency details
    - No secrets or tokens in URL
    - _Requirements: GUEST-FR-010 (10.1–10.8), GUEST-SEC-004 (25.1–25.4)_

  - [x] 8.2 Write unit tests for confirmation page
    - Test pending state displays waiting message
    - Test confirmed state displays booking summary
    - Test no medical data displayed
    - Test sessionStorage cleared on confirmation display
    - _Requirements: GUEST-FR-010, GUEST-SEC-004_

- [x] 9. Checkpoint — Verify guest form and confirmation UI
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Admin Panel Modifications
  - [x] 10.1 Modify admin booking list for guest bookings
    - Update admin bookings page to handle null `bookedByUid` gracefully
    - Display `bookingMode` badge ("Account" / "Guest") on each booking row
    - Display `bookingSource` label (WhatsApp, QR Code, etc.) on each booking row
    - Show `guestContact.firstName + lastName` when `bookedByUid` is absent
    - Add filter/sort options by booking mode and source
    - _Requirements: GUEST-FR-012 (12.1–12.3)_

  - [x] 10.2 Modify admin session register for guest participants
    - Include guest bookings in session participant list
    - Display for each participant: name, calculated age, booking mode badge, source, status, medical flag (🏥), emergency flag (📞), authorised collector name, sign-in/sign-out fields
    - Guest participant name from `childSnapshot.firstName + lastName`
    - Parent/booker name from `guestContact.firstName + lastName`
    - _Requirements: GUEST-FR-012 (12.4), GUEST-OPS-001 (26.1–26.4)_

  - [x] 10.3 Implement restricted safety summary view
    - Display: student name, dietary requirements, allergies, airborne allergies, medication/EpiPen details, medical needs, emergency contact, authorised collector, safety review status, operational notes
    - Restrict access to admin and instructor roles only
    - _Requirements: GUEST-FR-012 (12.5, 12.6)_

  - [x] 10.4 Implement safety review queue
    - List all bookings where safetyReviewStatus is 'pending' or 'contact_parent'
    - Display: child name, parent name, parent email/phone, medical summary, status
    - Admin actions: update status to reviewed / contact_parent / cannot_accommodate
    - Admin can add operational notes
    - _Requirements: GUEST-FR-013 (13.3–13.5)_

  - [x] 10.5 Implement guest link management in admin sessions view
    - Add "Copy Guest Link" button on each open session (format: `/express-booking/{sessionId}?source=website_express`)
    - Add "Copy WhatsApp Link" button (format: `https://wa.me/?text=...` with encoded guest URL)
    - Hide both buttons when feature flag is disabled
    - Links contain only session ID and source parameter (no PII)
    - _Requirements: GUEST-FR-014 (14.3, 14.4), GUEST-OPS-002 (27.1–27.4)_

  - [x] 10.6 Add "Book as guest" option on public session pages
    - Display "Book as a guest — no account required" alongside sign-in/register options
    - Only visible when feature flag is enabled
    - Hidden when feature flag is disabled
    - _Requirements: GUEST-FR-014 (14.1, 14.2), GUEST-UX-002 (29.3)_

  - [x] 10.7 Write unit tests for admin panel modifications
    - Test guest booking renders without errors when bookedByUid absent
    - Test booking mode badge and source label display
    - Test safety queue filtering
    - Test guest link copy functionality
    - Test elements hidden when feature flag disabled
    - _Requirements: GUEST-FR-012, GUEST-FR-013, GUEST-OPS-002_

- [x] 11. Checkpoint — Verify admin panel and full integration
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Remaining Property-Based Tests
  - [x] 12.1 Write property test for consent audit round-trip
    - **Property 4: Consent Audit Round-Trip** — Resulting consentAudit contains each consent value, acceptedAt, acceptedBy (parent full name), termsVersion, privacyNoticeVersion, sourceChannel, submissionTimestamp
    - **Validates: Requirements 6.5, 20.1–20.7**

  - [x] 12.2 Write property test for medical data exclusion
    - **Property 6: Medical Data Exclusion Invariant** — Stripe metadata, API errors, confirmation email, confirmation page response, and URL params never contain medical/allergy/dietary data
    - **Validates: Requirements 4.5, 8.13, 10.7, 23.1–23.5**

- [x] 13. Environment Configuration and Final Wiring
  - [x] 13.1 Update environment configuration
    - Add to `.env.local.example`: `NEXT_PUBLIC_GUEST_CHECKOUT_ENABLED`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `PREVIEW_EMAIL_RECIPIENTS`
    - Document Vercel Preview scoping for all new env vars
    - Ensure feature flag set to `true` for Preview, `false` for production
    - _Requirements: GUEST-FR-016 (16.6), GUEST-DEP-001 (31.2)_

  - [x] 13.2 Install required dependencies
    - Install `@vercel/kv` for rate limiting
    - Install `fast-check` as dev dependency for property-based tests
    - Verify `@cloudflare/turnstile` types if available, otherwise use inline type declarations
    - _Requirements: GUEST-SEC-001, GUEST-DEP-001_

  - [x] 13.3 Write integration tests for full guest booking flow
    - Test complete flow: form submission → API call → mock Stripe → mock webhook → booking created
    - Test admin views render guest bookings without errors
    - Test feature flag toggling hides/shows all guest components
    - Test existing authenticated booking flow unaffected
    - _Requirements: GUEST-TEST-005 (36.1)_

- [x] 14. Final Checkpoint — Full test suite green
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document using `fast-check`
- Unit tests validate specific examples and edge cases using Vitest
- All code uses TypeScript strict mode, CSS Modules for styling, React Hook Form + Zod for forms
- Prices are in pence (integer). Dates are YYYY-MM-DD strings.
- Branch: `feature/guest-express-checkout`. Deploy to Vercel Preview only.
- Stripe test keys (`pk_test_*`, `sk_test_*`) used in Preview.
- No medical data in Stripe metadata, URLs, logs, or emails.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3", "1.4"] },
    { "id": 1, "tasks": ["1.5", "13.1", "13.2"] },
    { "id": 2, "tasks": ["1.6", "2.1"] },
    { "id": 3, "tasks": ["2.2", "2.3", "3.2"] },
    { "id": 4, "tasks": ["3.1", "3.3"] },
    { "id": 5, "tasks": ["3.4", "3.5", "5.1"] },
    { "id": 6, "tasks": ["5.2", "5.3", "6.1", "6.4"] },
    { "id": 7, "tasks": ["6.2", "6.3"] },
    { "id": 8, "tasks": ["7.1", "7.2", "7.3", "7.4", "7.5"] },
    { "id": 9, "tasks": ["7.6"] },
    { "id": 10, "tasks": ["7.7", "7.8", "8.1"] },
    { "id": 11, "tasks": ["8.2", "10.1", "10.2", "10.3"] },
    { "id": 12, "tasks": ["10.4", "10.5", "10.6"] },
    { "id": 13, "tasks": ["10.7", "12.1", "12.2"] },
    { "id": 14, "tasks": ["13.3"] }
  ]
}
```
