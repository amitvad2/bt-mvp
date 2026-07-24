# Implementation Plan: Session Bundles

## Overview

This plan implements the Session Bundles feature for Blooming Tastebuds — enabling admins to group multiple sessions into discounted packages that users can book in a single transaction. The implementation progresses from type definitions through infrastructure (security rules, API extensions), admin UI, public display, booking wizard, portal updates, email templates, and finally testing.

## Tasks

- [x] 1. Type definitions and data model
  - [x] 1.1 Add Bundle and BundleBookingWizardState types to src/types/index.ts
    - Add `BundleStatus` type (`'active' | 'closed' | 'cancelled'`)
    - Add `Bundle` interface with all fields: id, name, classId, className, classType, sessionIds, bundlePrice, totalIndividualPrice, status, venueId, venueName, createdAt
    - Add `BundleBookingWizardState` interface
    - Extend `Booking` interface with optional `bundleId?: string`, `bundleName?: string`, `overbooking?: boolean` fields
    - _Requirements: 1.6, 4.5, 7.1_

  - [x] 1.2 Add Firestore indexes for bundles collection
    - Add composite index for `bundles` collection (status + classId) to `firestore.indexes.json`
    - Add composite index for `bookings` collection (bundleId + bookedByUid) to `firestore.indexes.json`
    - _Requirements: 7.4, 6.1_

- [x] 2. Firestore security rules
  - [x] 2.1 Add bundles collection rules to firestore.rules
    - Add `match /bundles/{bundleId}` rule with public read and admin-only write
    - Verify existing bookings rules support the new `{paymentIntentId}_{sessionId}` document ID pattern without changes
    - _Requirements: 1.1, 7.1_

- [x] 3. Checkpoint - Ensure types compile and rules are valid
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Admin bundles page
  - [x] 4.1 Create admin bundles page at src/app/admin/bundles/page.tsx
    - Create `'use client'` page component with bundle list table
    - Implement Firestore reads for all bundles (show active, closed, cancelled with status indicators)
    - Add Create, Edit, Delete actions with confirmation modal for delete
    - Follow existing admin page patterns (venues, classes, sessions pages)
    - _Requirements: 1.1, 7.6_

  - [x] 4.2 Create BundleForm component at src/app/admin/bundles/BundleForm.tsx
    - Build React Hook Form + Zod schema with: name (3–100 chars), class selector, session multi-select, bundle price
    - Implement session selector that filters by selected classId and status 'open'
    - Auto-calculate totalIndividualPrice from selected sessions
    - Validate bundlePrice > 0 and <= totalIndividualPrice
    - Validate 2–20 sessions selected
    - Display inline validation errors per field
    - On edit: prevent removal of sessions that have existing bookings (query bookings by bundleId + sessionId)
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 7.5_

  - [x] 4.3 Create BundleForm CSS module at src/app/admin/bundles/BundleForm.module.css
    - Style the form layout, session selector grid, price summary, and validation error messages
    - Follow existing admin form styling patterns
    - _Requirements: 1.1_

  - [x] 4.4 Add admin bundles page CSS module at src/app/admin/bundles/page.module.css
    - Style the bundles list table with status badges, action buttons
    - Follow existing admin page styling patterns (sessions, classes pages)
    - _Requirements: 1.1_

  - [x] 4.5 Add "Bundles" nav link to admin layout
    - Update `src/app/admin/layout.tsx` to include a "Bundles" navigation item pointing to `/admin/bundles`
    - Use lucide-react `Package` icon (or similar) consistent with existing nav items
    - _Requirements: 1.1_

- [x] 5. Checkpoint - Ensure admin bundles page works
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Bundle booking context and middleware
  - [x] 6.1 Create BundleBookingContext at src/context/BundleBookingContext.tsx
    - Implement `BundleBookingProvider` component with `BundleBookingWizardState`
    - Persist state to sessionStorage under key `bundle_booking_{bundleId}`
    - Expose `useBundleBooking()` hook with getters/setters for each wizard field
    - Load bundle document and associated sessions on mount
    - Follow same pattern as existing `BookingContext.tsx`
    - _Requirements: 3.1, 3.2_

  - [x] 6.2 Update middleware to protect bundle booking routes
    - Add `/book/bundle/*` pattern to auth-required routes in `src/middleware.ts`
    - Ensure `bt_session` cookie check applies to bundle wizard routes
    - _Requirements: 3.1_

- [x] 7. Bundle booking wizard routes
  - [x] 7.1 Create bundle wizard layout at src/app/book/bundle/[bundleId]/layout.tsx
    - Mount `BundleBookingProvider` with bundleId from params
    - Render progress stepper (same 6 steps as single-session wizard)
    - Create layout CSS module for stepper styling
    - _Requirements: 3.1, 3.2_

  - [x] 7.2 Create student step at src/app/book/bundle/[bundleId]/student/page.tsx
    - Implement student selection (existing students for parents, 'self' for youngAdults)
    - Save selection to BundleBookingContext
    - Navigate to medical step on continue
    - _Requirements: 3.2_

  - [x] 7.3 Create medical step at src/app/book/bundle/[bundleId]/medical/page.tsx
    - Implement medical info + emergency contact form (React Hook Form + Zod)
    - Pre-fill from selected student's stored data if available
    - Save to BundleBookingContext and navigate to questionnaire/terms
    - _Requirements: 3.2_

  - [x] 7.4 Create questionnaire step at src/app/book/bundle/[bundleId]/questionnaire/page.tsx
    - Implement dietary questionnaire form
    - Skip this step automatically for `youngAdultWeekend` classType bundles (redirect to terms)
    - Save to BundleBookingContext
    - _Requirements: 3.2_

  - [x] 7.5 Create terms step at src/app/book/bundle/[bundleId]/terms/page.tsx
    - Render terms & conditions with acceptance checkbox
    - Save termsAccepted to BundleBookingContext
    - Navigate to payment step
    - _Requirements: 3.2_

  - [x] 7.6 Create payment step at src/app/book/bundle/[bundleId]/payment/page.tsx
    - Display bundle price as total amount (formatted £XX.XX)
    - Call `POST /api/payments/create-intent` with `bundleId` and wizard payload
    - Handle 400 response (full sessions) — display which sessions are full, prevent payment
    - Mount Stripe Elements for card input
    - Confirm payment via Stripe.js
    - On failure: display error, retain form data for retry
    - _Requirements: 3.3, 3.5, 3.7, 4.1_

  - [x] 7.7 Create confirmation step at src/app/book/bundle/[bundleId]/confirmation/page.tsx
    - Poll Firestore for booking documents matching bundleId + bookedByUid
    - Display all session dates in chronological order with date and time
    - Show success state when all bookings appear
    - _Requirements: 3.4, 3.6_

  - [x] 7.8 Create CSS modules for bundle wizard steps
    - Create shared wizard step styles at `src/app/book/bundle/[bundleId]/bundle-wizard.module.css`
    - Style payment error states, session availability warnings, confirmation list
    - _Requirements: 3.1_

- [x] 8. Checkpoint - Ensure bundle wizard compiles and navigates
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. API: create-intent bundle code path
  - [x] 9.1 Extend POST /api/payments/create-intent for bundle bookings
    - Detect `bundleId` in request body to trigger bundle code path
    - Verify auth token → get verifiedUid
    - Read `bundles/{bundleId}` from Firestore — validate status is 'active'
    - Read all session documents — verify each has spotsAvailable > 0
    - If any session full: return 400 with `{ error, fullSessions: [{sessionId, date}] }`
    - Create Stripe PaymentIntent with amount = bundlePrice, metadata = { bundleId }
    - Save booking_draft with bundleId, sessionIds, per-session denormalized data, full wizard payload
    - Return { clientSecret, paymentIntentId }
    - On draft write failure after PI creation: cancel PI, return 500
    - _Requirements: 4.1, 4.2, 5.1, 5.2_

- [x] 10. Webhook: bundle fan-out handler
  - [x] 10.1 Extend Stripe webhook for bundle booking creation
    - Detect `bundleId` in booking_draft to branch into bundle handler
    - Implement `handleBundlePaymentSucceeded` function
    - In single Firestore transaction: create N booking documents (ID: `{piId}_{sessionId}`), decrement spotsAvailable on each session
    - Set shared `bundleId` field on each booking document
    - Set `overbooking: true` on bookings where session had spotsAvailable === 0
    - Implement idempotency: skip creation if booking doc already exists
    - On transaction failure: return 500 (Stripe retries)
    - On success: send bundle confirmation email, delete draft
    - _Requirements: 4.3, 4.4, 4.5, 4.6, 4.7, 5.3, 5.4_

- [x] 11. Checkpoint - Ensure API routes compile
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Bundle browser component
  - [x] 12.1 Create BundleBrowser component at src/components/sessions/BundleBrowser.tsx
    - Fetch active bundles from Firestore (status === 'active')
    - Display as cards with "Bundle" badge, name, session count, price (£XX.XX), per-session saving
    - Show session dates in chronological order (ddd DD MMM YYYY format)
    - Derive and display availability status: "Available", "Limited Availability", or "Full"
    - Disable booking action when all sessions are full
    - Navigate to `/book/bundle/{bundleId}/student` on card click
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [x] 12.2 Create BundleBrowser CSS module at src/components/sessions/BundleBrowser.module.css
    - Style bundle cards with badge, pricing highlight, availability indicators, date list
    - _Requirements: 2.1_

  - [x] 12.3 Integrate BundleBrowser into SessionBrowser and public classes page
    - Import and render `BundleBrowser` above session listings in `src/components/sessions/SessionBrowser.tsx`
    - Ensure bundle cards appear on both `/classes` and `/portal/find-class`
    - _Requirements: 2.1_

- [x] 13. Portal my-classes update
  - [x] 13.1 Create BundleGroupCard component at src/components/portal/BundleGroupCard.tsx
    - Display bundle bookings grouped under a single card showing bundle name
    - List all session dates in chronological order with date, time, venue
    - Show single "Cancel Bundle" action (hide individual cancel buttons for bundle sessions)
    - Hide "Cancel Bundle" if bundle booking is already cancelled
    - _Requirements: 6.1, 6.4, 6.6_

  - [x] 13.2 Create BundleGroupCard CSS module at src/components/portal/BundleGroupCard.module.css
    - Style grouped card layout, session list, cancel action button
    - _Requirements: 6.1_

  - [x] 13.3 Update portal my-classes page to group bundle bookings
    - Modify `src/app/portal/my-classes/page.tsx` to detect bookings with `bundleId`
    - Group bookings by `bundleId` and render using `BundleGroupCard`
    - Render non-bundle bookings as before (individual cards)
    - _Requirements: 6.1_

  - [x] 13.4 Implement bundle cancellation logic in my-classes page
    - On "Cancel Bundle" click: run Firestore transaction to update all bundle bookings to 'cancelled' and increment spotsAvailable on each session
    - Allow cancellation regardless of session dates (past or future)
    - On transaction failure: show error message, no partial updates
    - On success: call `/api/emails/send` with type 'bundle-cancellation' payload
    - _Requirements: 6.2, 6.5, 6.7_

- [x] 14. Email templates
  - [x] 14.1 Add bundle confirmation email template to webhook
    - In the webhook's bundle success path, build HTML email with:
      - Subject line containing bundle name
      - Participant name, total amount as £XX.XX
      - All session dates in chronological order with start time and venue
      - Link to My Classes portal page using NEXT_PUBLIC_APP_URL
    - Send via Resend; log failure but don't block booking creation
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [x] 14.2 Add bundle cancellation email template to emails/send API
    - Support `type: 'bundle-cancellation'` in `src/app/api/emails/send/route.ts`
    - Build HTML email with: bundle name, all cancelled session dates with venue and time, link to My Classes
    - Send single email for entire bundle cancellation
    - _Requirements: 6.3_

- [x] 15. Checkpoint - Ensure full feature compiles end-to-end
  - Ensure all tests pass, ask the user if questions arise.

- [x] 16. Property-based tests
  - [x]* 16.1 Write property test for bundle validation schema
    - **Property 1: Bundle validation schema**
    - Test that bundles are accepted iff: name 3–100 chars, 2–20 sessions from same classId with status 'open', bundlePrice integer > 0 and <= sum of session prices
    - **Validates: Requirements 1.2, 1.4**

  - [x]* 16.2 Write property test for session filter logic
    - **Property 2: Session filter for bundle creation**
    - Test that filtering returns exactly sessions with status 'open' AND matching classId
    - **Validates: Requirements 1.3**

  - [x]* 16.3 Write property test for bundle document completeness
    - **Property 3: Bundle document completeness**
    - Test that valid input produces a document with all required fields and status defaults to 'active'
    - **Validates: Requirements 1.6, 7.1**

  - [x]* 16.4 Write property test for per-session saving calculation
    - **Property 4: Per-session saving calculation**
    - Test `(totalIndividualPrice - bundlePrice) / N` converted to pounds with 2 decimal places
    - **Validates: Requirements 2.2**

  - [x]* 16.5 Write property test for bundle availability status derivation
    - **Property 5: Bundle availability status derivation**
    - Test: all sessions 0 spots → "Full"; mixed → "Limited Availability"; all > 0 → "Available"
    - **Validates: Requirements 2.3, 2.4**

  - [x]* 16.6 Write property test for session dates chronological ordering
    - **Property 6: Session dates chronological ordering**
    - Test that any array of YYYY-MM-DD date strings is sorted ascending
    - **Validates: Requirements 2.5, 3.4**

  - [ ]* 16.7 Write property test for pre-payment availability gate
    - **Property 7: Pre-payment availability gate**
    - Test that if any session has 0 spots, request is rejected with full session details
    - **Validates: Requirements 3.5, 5.1, 5.2**

  - [ ]* 16.8 Write property test for bundle booking transaction atomicity
    - **Property 8: Bundle booking transaction atomicity — creation**
    - Test that N sessions produce exactly N bookings + N spot decrements, or zero on failure
    - **Validates: Requirements 3.6, 4.4, 4.7, 5.4**

  - [ ]* 16.9 Write property test for PaymentIntent amount equals bundle price
    - **Property 9: PaymentIntent amount equals bundle price**
    - Test that PI amount === bundlePrice and metadata contains bundleId
    - **Validates: Requirements 4.1**

  - [ ]* 16.10 Write property test for booking draft completeness
    - **Property 10: Booking draft completeness for bundles**
    - Test that draft contains bundleId, all sessionIds, per-session data, and full wizard payload
    - **Validates: Requirements 4.2**

  - [x]* 16.11 Write property test for booking document ID scheme
    - **Property 11: Booking document ID scheme**
    - Test that N bookings have IDs matching `{piId}_{sessionId}` pattern
    - **Validates: Requirements 4.3**

  - [x]* 16.12 Write property test for bundle linkage invariant
    - **Property 12: Bundle linkage invariant**
    - Test that all bookings from a bundle share the same bundleId value
    - **Validates: Requirements 4.5**

  - [ ]* 16.13 Write property test for webhook idempotency
    - **Property 13: Webhook idempotency**
    - Test that processing same event twice creates zero additional documents
    - **Validates: Requirements 4.6**

  - [ ]* 16.14 Write property test for overbooking flag
    - **Property 14: Overbooking flag on zero-spots sessions**
    - Test that bookings for sessions with 0 spots get `overbooking: true`
    - **Validates: Requirements 5.3**

  - [ ]* 16.15 Write property test for bundle cancellation atomicity
    - **Property 15: Bundle cancellation atomicity**
    - Test that all N statuses become 'cancelled' + N spots incremented, or zero changes on failure
    - **Validates: Requirements 6.2, 6.5**

  - [ ]* 16.16 Write property test for cancellation regardless of session dates
    - **Property 16: Cancellation regardless of session dates**
    - Test that cancellation proceeds for all sessions regardless of past/future dates
    - **Validates: Requirements 6.7**

  - [ ]* 16.17 Write property test for auto-close lifecycle
    - **Property 17: Auto-close lifecycle**
    - Test that bundles with all session dates before today get status 'closed'
    - **Validates: Requirements 7.2**

  - [ ]* 16.18 Write property test for admin cancel prevents new bookings
    - **Property 18: Admin cancel prevents new bookings**
    - Test that bundles with status 'cancelled' reject new booking attempts
    - **Validates: Requirements 7.3**

  - [x]* 16.19 Write property test for public display filter
    - **Property 19: Public display filter**
    - Test that only bundles with status 'active' are returned by public query
    - **Validates: Requirements 7.4**

  - [ ]* 16.20 Write property test for prevent removal of booked sessions
    - **Property 20: Prevent removal of booked sessions**
    - Test that editing a bundle rejects removal of sessions with existing bookings
    - **Validates: Requirements 7.5**

  - [ ]* 16.21 Write property test for bundle confirmation email completeness
    - **Property 21: Bundle confirmation email completeness**
    - Test that email contains bundle name in subject, participant name, £XX.XX amount, all dates chronologically with time and venue
    - **Validates: Requirements 8.2, 8.5**

  - [ ]* 16.22 Write property test for cancellation email completeness
    - **Property 22: Cancellation email completeness**
    - Test that email contains bundle name, all cancelled session dates with venue/time, and My Classes link
    - **Validates: Requirements 6.3**

- [ ] 17. Unit tests
  - [ ]* 17.1 Write unit tests for admin bundle form validation
    - Test field-level errors (name too short/long, price > total, < 2 sessions)
    - Test submit prevention with invalid data
    - Test session selector filtering by classId and status
    - _Requirements: 1.2, 1.3, 1.4, 1.5_

  - [ ]* 17.2 Write unit tests for BundleBrowser component
    - Test badge rendering, price display, availability indicators
    - Test "Full" state disables booking action
    - Test date formatting and chronological ordering
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [ ]* 17.3 Write unit tests for BundleGroupCard component
    - Test grouped display of bundle sessions
    - Test "Cancel Bundle" action visibility (shown when confirmed, hidden when cancelled)
    - Test individual cancel hidden within bundle group
    - _Requirements: 6.1, 6.4, 6.6_

  - [ ]* 17.4 Write unit tests for bundle wizard step navigation
    - Test conditional questionnaire skip for youngAdultWeekend
    - Test state persistence to sessionStorage
    - Test error display when sessions are full
    - _Requirements: 3.2, 3.5, 3.7_

  - [ ]* 17.5 Write unit tests for email template assembly
    - Test bundle confirmation email content (subject, dates, amount, link)
    - Test bundle cancellation email content (bundle name, dates, venue, link)
    - _Requirements: 8.2, 8.5, 6.3_

- [ ] 18. Integration tests
  - [ ]* 18.1 Write integration tests for create-intent bundle code path
    - Test end-to-end with mocked Firestore + Stripe
    - Test success path: creates PI and draft with all fields
    - Test rejection when any session has 0 spots
    - Test rejection when bundle status is not 'active'
    - Test auth token verification
    - _Requirements: 4.1, 4.2, 5.1, 5.2_

  - [ ]* 18.2 Write integration tests for webhook bundle handler
    - Test transaction fan-out creates N bookings
    - Test idempotency (duplicate event creates zero new docs)
    - Test overbooking flag set when spots are 0
    - Test transaction failure returns 500
    - Test email sent on success, logged on failure
    - _Requirements: 4.3, 4.4, 4.5, 4.6, 4.7, 5.3, 5.4, 8.1, 8.4_

  - [ ]* 18.3 Write integration tests for bundle cancellation
    - Test all-or-nothing transaction (statuses + spots)
    - Test cancellation works regardless of session dates
    - Test cancellation email sent on success
    - _Requirements: 6.2, 6.5, 6.7, 6.3_

- [x] 19. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation between major phases
- Property tests validate universal correctness properties from the design document using fast-check with minimum 100 iterations
- Unit tests validate specific UI rendering and form behavior
- Integration tests validate API routes with mocked infrastructure (Firestore, Stripe, Resend)
- All types go in `src/types/index.ts` — never inline type definitions
- Prices are always in pence (integer); display as `(price / 100).toFixed(2)` with `£` prefix
- CSS Modules colocated with components; global utilities from `globals.css`
- Test files go in `src/__tests__/bundles/` following the structure defined in the design document

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1"] },
    { "id": 2, "tasks": ["4.1", "4.3", "4.4", "4.5", "6.1", "6.2"] },
    { "id": 3, "tasks": ["4.2", "7.1"] },
    { "id": 4, "tasks": ["7.2", "7.3", "7.4", "7.5", "7.8"] },
    { "id": 5, "tasks": ["7.6", "7.7"] },
    { "id": 6, "tasks": ["9.1"] },
    { "id": 7, "tasks": ["10.1"] },
    { "id": 8, "tasks": ["12.1", "12.2", "13.1", "13.2", "14.1", "14.2"] },
    { "id": 9, "tasks": ["12.3", "13.3"] },
    { "id": 10, "tasks": ["13.4"] },
    { "id": 11, "tasks": ["16.1", "16.2", "16.3", "16.4", "16.5", "16.6", "16.11", "16.12", "16.19"] },
    { "id": 12, "tasks": ["16.7", "16.8", "16.9", "16.10", "16.13", "16.14", "16.15", "16.16", "16.17", "16.18", "16.20", "16.21", "16.22"] },
    { "id": 13, "tasks": ["17.1", "17.2", "17.3", "17.4", "17.5"] },
    { "id": 14, "tasks": ["18.1", "18.2", "18.3"] }
  ]
}
```
