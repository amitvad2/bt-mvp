# Implementation Plan: Booking Wizard — Test Coverage & Formalisation

## Overview

This plan adds test coverage to the existing booking wizard implementation. The code is not being rebuilt — all tasks are additive. Work falls into three groups:

1. **Dependency setup** — install `fast-check` and configure a shared test helper directory
2. **Property-based tests** — one test per correctness property defined in `design.md`
3. **Unit / component tests** — example-based tests for wizard steps and API routes where no tests exist yet

All tests live in `src/__tests__/` mirroring the source structure. The test runner is Vitest (`npm run test:run`).

---

## Tasks

- [ ] 1. Install fast-check and create shared test fixtures
  - Run `npm install --save-dev fast-check` to add the PBT library
  - Create `src/__tests__/booking-wizard/` directory (all booking wizard tests live here)
  - Create `src/__tests__/booking-wizard/fixtures.ts` — export shared fast-check arbitraries for `MedicalInfo`, `EmergencyContact`, `Questionnaire`, `Student`, `Session`, and `BookingWizardState`
  - The `sessionArb` arbitrary must produce `Session` objects with valid `ageMin`/`ageMax` pairs (ageMin < ageMax), valid YYYY-MM-DD `date` strings, positive integer `price` in pence, and `classType` drawn from `['kidsAfterSchool', 'youngAdultWeekend']`
  - _Requirements: prerequisite for all test tasks below_

- [ ] 2. Property tests — `BookingContext` state persistence (Properties 1 & 9)
  - Create `src/__tests__/booking-wizard/booking-context-persistence.property.test.ts`
  - Mock `firebase/firestore` (`getDoc`) and `@/lib/firebase` so `BookingProvider` does not hit Firestore
  - Use `jsdom`'s `sessionStorage` (already in the Vitest environment via `test.environment: 'jsdom'`)

  - [ ]* 2.1 Write property test for Property 1 — state sessionStorage round-trip
    - **Property 1: State SessionStorage Round-Trip**
    - *For any* `BookingWizardState` with more than just `sessionId`, serialising it to `sessionStorage` via `JSON.stringify` and restoring it via `JSON.parse` must produce a deeply equal object
    - Use `fc.assert(fc.property(bookingWizardStateArb, state => ...))` with ≥ 100 runs
    - Directly test the serialisation/deserialisation logic extracted from `BookingContext`; do not render the full provider for this property
    - Tag: `// Feature: booking-wizard, Property 1: State SessionStorage Round-Trip`
    - **Validates: Requirements 9.1, 9.2, 9.3**

  - [ ]* 2.2 Write property test for Property 9 — corrupted sessionStorage silent discard
    - **Property 9: Corrupted SessionStorage — Silent Discard**
    - *For any* string that is not valid JSON, the restore-from-sessionStorage logic must not throw and must return the default `{ sessionId }` state
    - Generate corrupt strings with `fc.string()` filtered to exclude strings parseable as objects
    - Test the `try/catch` parse block in isolation (extract the logic into a `restoreFromStorage(raw: string, sessionId: string)` helper if needed — see task 2.3)
    - Tag: `// Feature: booking-wizard, Property 9: Corrupted SessionStorage Silent Discard`
    - **Validates: Requirement 9.3**

  - [ ] 2.3 Minor code improvement — extract `restoreFromStorage` helper
    - In `src/context/BookingContext.tsx`, extract the `sessionStorage` parse block into a small exported helper `restoreFromStorage(raw: string, sessionId: string): BookingWizardState`
    - This makes Property 9 directly unit-testable without rendering the full provider in a jsdom + React environment
    - The existing `useEffect` in `BookingProvider` calls `restoreFromStorage` and calls `setState` with the result — behaviour is unchanged
    - _Requirements: 9.3_

- [ ] 3. Property test — `calculateAgeOnDate` age validation (Property 2)
  - Create `src/__tests__/booking-wizard/age-validation.property.test.ts`

  - [ ] 3.1 Export `calculateAgeOnDate` from the student page
    - In `src/app/book/[sessionId]/student/page.tsx`, change `function calculateAgeOnDate` to `export function calculateAgeOnDate`
    - This is the only code change needed; no logic changes
    - _Requirements: 2.3, 2.4_

  - [ ]* 3.2 Write property test for Property 2 — age validation boundary
    - **Property 2: Age Validation Boundary**
    - *For any* date-of-birth string and session date string, `calculateAgeOnDate(dob, sessionDate)` must return the correct calendar age (birthday-adjusted), and the selection guard must permit the student if and only if `ageMin ≤ age ≤ ageMax`
    - Generate `dob` and `sessionDate` as arbitrary YYYY-MM-DD strings where `sessionDate > dob` (student is alive on the session date); generate `ageMin` and `ageMax` as small integers where `ageMin ≤ ageMax`
    - For boundary dates (birthday is exactly the session date), verify the age is not off-by-one
    - Use `fc.assert(fc.property(...))` with ≥ 100 runs
    - Tag: `// Feature: booking-wizard, Property 2: Age Validation Boundary`
    - **Validates: Requirements 2.3, 2.4, 2.7, 2.8**

- [ ] 4. Property test — price invariant (Property 3) and auth invariant (Property 4)
  - Create `src/__tests__/booking-wizard/create-intent.property.test.ts`
  - Mock `@/lib/firebase-admin` (provide `adminDb`, `adminAuth`, `adminInitError: null`) and `@/lib/stripe` following the pattern in `src/__tests__/contact/api-contact-route.test.ts`
  - Mock `firebase-admin` `FieldValue.serverTimestamp()` to return `'SERVER_TIMESTAMP'`

  - [ ]* 4.1 Write property test for Property 3 — price invariant
    - **Property 3: Price Invariant — Server-Authoritative Amount**
    - *For any* request body that includes an `amount`, `price`, or other numeric field alongside a valid `sessionId`, the Stripe PaymentIntent must be created with `amount` equal to `sessionData.price` from the mocked Firestore document — never with any value from the request body
    - Generate arbitrary integer `clientSuppliedAmount` values (including zero, negative, and values that differ from the Firestore price) and an arbitrary `firestorePrice` (positive integer in pence)
    - Assert that `stripe.paymentIntents.create` was called with `amount === firestorePrice`
    - Use `fc.assert(fc.property(...))` with ≥ 100 runs
    - Tag: `// Feature: booking-wizard, Property 3: Price Invariant`
    - **Validates: Requirements 7.2, 11.3, 14.1**

  - [ ]* 4.2 Write property test for Property 4 — auth invariant
    - **Property 4: Auth Invariant — UID from Verified Token Only**
    - *For any* request body that contains a `bookedByUid` field, the `booking_drafts` document written to Firestore must have `bookedByUid` equal to the UID returned by `adminAuth.verifyIdToken` — never the body's value
    - Generate arbitrary `tokenUid` strings and `bodyUid` strings (ensuring they differ); mock `adminAuth.verifyIdToken` to return `{ uid: tokenUid }`
    - Assert that `adminDb.doc(...).set(...)` was called with `bookedByUid === tokenUid`
    - Tag: `// Feature: booking-wizard, Property 4: Auth Invariant`
    - **Validates: Requirements 7.1, 11.2, 14.1**

- [ ] 5. Checkpoint — run the test suite
  - Run `npm run test:run` and ensure all tests added so far pass with no regressions
  - Fix any import or mock issues before continuing

- [ ] 6. Property tests — webhook idempotency, capacity, and draft lifecycle (Properties 5, 6, 7)
  - Create `src/__tests__/booking-wizard/stripe-webhook.property.test.ts`
  - Mock `@/lib/firebase-admin`, `firebase-admin`, `@/lib/stripe`, `@/lib/resend`, and the `next/server` `NextResponse` following the pattern in `src/__tests__/contact/api-contact-route.test.ts`
  - Provide a `buildMockTransaction` helper that simulates Firestore `runTransaction` with in-memory state so properties can be exercised without a real Firestore instance

  - [ ]* 6.1 Write property test for Property 5 — idempotency
    - **Property 5: Idempotency — One Booking Per PaymentIntent**
    - *For any* valid `booking_draft`, delivering the `payment_intent.succeeded` webhook event N times (N ≥ 1) must result in exactly 1 document created in `bookings` and exactly 1 `spotsAvailable` decrement on the session
    - Generate arbitrary `N` values (1–5) and verify the idempotency guard (`existingBooking.exists` check) prevents double-writes
    - Tag: `// Feature: booking-wizard, Property 5: Idempotency`
    - **Validates: Requirements 8.5, 13.1, 13.2**

  - [ ]* 6.2 Write property test for Property 6 — capacity invariant
    - **Property 6: Capacity Invariant**
    - *For any* session where `spotsAvailable = N > 0`, one successful webhook event must leave `spotsAvailable = N - 1`; for any session where `spotsAvailable ≤ 0`, the webhook must set `overbooking: true` on the booking doc and leave `spotsAvailable` unchanged
    - Generate arbitrary positive and zero/negative `spotsAvailable` values; assert the correct branch is taken
    - Tag: `// Feature: booking-wizard, Property 6: Capacity Invariant`
    - **Validates: Requirements 8.4, 8.6, 13.4**

  - [ ]* 6.3 Write property test for Property 7 — draft lifecycle
    - **Property 7: Draft Lifecycle Invariant**
    - *For any* PaymentIntent ID, after the webhook processes a `payment_intent.succeeded` event the draft must be deleted; after `payment_intent.payment_failed` the draft must exist with `paymentStatus: 'failed'`
    - Generate arbitrary PaymentIntent IDs as strings; simulate both event types; assert draft state after each
    - Tag: `// Feature: booking-wizard, Property 7: Draft Lifecycle`
    - **Validates: Requirements 8.12, 8.13, 12.7**

- [ ] 7. Property test — questionnaire skip invariant (Property 8)
  - Create `src/__tests__/booking-wizard/questionnaire-skip.property.test.ts`
  - Reuse the mocks from task 6

  - [ ]* 7.1 Write property test for Property 8 — no questionnaire on youngAdultWeekend bookings
    - **Property 8: Questionnaire Skip — No Questionnaire on youngAdultWeekend Bookings**
    - *For any* booking draft where `classType = 'youngAdultWeekend'`, the resulting `bookings/{piId}` document must have `questionnaire: null`
    - Generate arbitrary `Questionnaire` objects on the draft (simulating a bug where it leaked through) and assert the `buildBookingDoc` function copies `null` from the draft for youngAdult sessions
    - Additionally verify that `create-intent` stores `questionnaire: null` in the draft when `classType = 'youngAdultWeekend'` — generate arbitrary bodies for youngAdult bookings and assert the draft's questionnaire field
    - Tag: `// Feature: booking-wizard, Property 8: Questionnaire Skip Invariant`
    - **Validates: Requirements 3.9, 4.2, 1.7**

- [ ] 8. Checkpoint — run the full property test suite
  - Run `npm run test:run` and verify all 9 property tests pass (Properties 1–9)
  - Review fast-check shrink output for any failures and fix accordingly

- [ ] 9. Unit tests — `create-intent` API route
  - Create `src/__tests__/booking-wizard/api-create-intent.test.ts`
  - Reuse the mock pattern from `src/__tests__/contact/api-contact-route.test.ts`

  - [ ]* 9.1 Write unit tests for `create-intent` happy path and error branches
    - Test returns 401 when `Authorization` header is missing
    - Test returns 401 when `verifyIdToken` rejects (invalid token)
    - Test returns 400 when `sessionId` is missing from the request body
    - Test returns 400 when the session document does not exist in Firestore
    - Test returns 400 when `session.status !== 'open'`
    - Test returns 400 when `session.spotsAvailable <= 0`
    - Test returns 403 when `studentId` is provided and `students/{studentId}.parentUid` does not match the verified UID
    - Test returns 500 when Firebase Admin SDK `adminInitError` is set
    - Test happy path: returns 200 with `clientSecret` and `paymentIntentId`; verify `adminDb.doc().set` is called with `bookedByUid` from the token (not the body); verify `stripe.paymentIntents.create` is called with `amount` from Firestore
    - Test returns 500 and cancels the PaymentIntent when the `booking_drafts` write fails
    - _Requirements: 7.1–7.12, 11.2, 11.3, 11.4, 12.1–12.3_

- [ ] 10. Unit tests — Stripe webhook route
  - Create `src/__tests__/booking-wizard/api-webhook-stripe.test.ts`

  - [ ]* 10.1 Write unit tests for webhook event handling
    - Test returns 400 when Stripe signature verification fails (invalid `Stripe-Signature` header)
    - Test returns 200 with `{ received: true }` for unhandled event types
    - Test `payment_intent.succeeded`: booking doc is created with correct fields copied from draft
    - Test `payment_intent.succeeded`: `payment.status` is set to `'paid'` and `payment.amount` matches `paymentIntent.amount`
    - Test `payment_intent.succeeded`: when booking already exists, no write occurs (idempotency)
    - Test `payment_intent.succeeded`: when `spotsAvailable <= 0`, booking is created with `overbooking: true`
    - Test `payment_intent.succeeded`: when draft is missing, logs error and returns 200 without creating a booking
    - Test `payment_intent.payment_failed`: draft is updated with `paymentStatus: 'failed'` and `failureMessage`
    - Test unhandled exception in handler: returns 500
    - _Requirements: 8.1–8.14, 13.1–13.4_

- [ ] 11. Component tests — `StudentSelectionPage`
  - Create `src/__tests__/booking-wizard/StudentSelectionPage.test.tsx`
  - Mock `@/context/BookingContext` and `@/context/AuthContext` via `vi.mock`
  - Mock `firebase/firestore` and `@/lib/firebase`
  - Mock `next/navigation` (`useRouter`)

  - [ ]* 11.1 Write component tests for the parent flow
    - Renders student cards when `btUser.role === 'parent'` and students are returned
    - Shows validation error when a selected student's age is out of range
    - Calls `setStudent` and navigates to `/medical` when a valid student is selected
    - Shows the "Add New Student" form when the add button is clicked
    - Blocks the Firestore `addDoc` call and shows error when the new student's age fails validation
    - _Requirements: 2.2–2.9, 2.11_

  - [ ]* 11.2 Write component tests for the youngAdult flow
    - Renders "Booking for yourself" card when `btUser.role === 'youngAdult'`
    - Shows validation error when 'self' is selected on a `kidsAfterSchool` session
    - Calls `setStudent('self')` and navigates to `/medical` on a `youngAdultWeekend` session
    - _Requirements: 2.1, 2.5, 2.10_

- [ ] 12. Component tests — `TermsAcceptancePage`
  - Create `src/__tests__/booking-wizard/TermsAcceptancePage.test.tsx`
  - Mock `@/context/BookingContext` and `next/navigation`

  - [ ]* 12.1 Write component tests for terms step behaviour
    - "Go to Payment" button is disabled when `termsAccepted` is `false` in context state
    - "Go to Payment" button is enabled when `termsAccepted` is `true` (restored from sessionStorage)
    - Checking the checkbox calls `setTermsAccepted(true)` on the context
    - Clicking "Go to Payment" with `termsAccepted === true` navigates to `/payment`
    - Displays session price formatted as `£X.XX` from `state.session.price`
    - _Requirements: 5.1–5.6_

- [ ] 13. Component tests — `ConfirmationPage`
  - Create `src/__tests__/booking-wizard/ConfirmationPage.test.tsx`
  - Mock `firebase/firestore` (`getDoc`), `@/context/BookingContext`, and `next/navigation` (`useSearchParams`)

  - [ ]* 13.1 Write component tests for the confirmation polling loop
    - Shows "Confirming Your Booking..." spinner while polling
    - Displays booking detail card when the `bookings/{piId}` document is found on the first poll
    - Calls `clearState` on mount regardless of polling outcome
    - Shows "Payment Received" fallback message when all 8 polling attempts are exhausted
    - _Requirements: 10.1–10.8_

- [ ] 14. Final checkpoint — full test suite
  - Run `npm run test:run` — all tests must pass (no skips, no failures)
  - Confirm test output lists tests from `src/__tests__/booking-wizard/` alongside the existing `auth/`, `contact/`, `gallery/`, `components/`, and `pages/` test suites
  - Fix any TypeScript type errors surfaced during the test run

---

## Notes

- Tasks marked `*` are optional and can be skipped for a faster MVP
- `fast-check` is a new `devDependency` — the only dependency change in this plan
- `calculateAgeOnDate` needs to be exported (task 3.1) — the only production code change in this plan
- `restoreFromStorage` extraction (task 2.3) is a minor refactor with no behavioural change; it is strongly recommended because it makes Property 9 trivially testable
- All property tests run ≥ 100 iterations by default via fast-check's `fc.assert`
- Each property test file is tagged with `// Feature: booking-wizard, Property N: <text>` for traceability back to `design.md`
- API route tests follow the established `vi.hoisted` + `vi.mock` pattern from `src/__tests__/contact/api-contact-route.test.ts`
- Stripe `stripe.webhooks.constructEvent` must be mocked to return a well-formed `Stripe.Event` object in webhook tests

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1"] },
    { "wave": 2, "tasks": ["2", "3", "4"] },
    { "wave": 3, "tasks": ["5"] },
    { "wave": 4, "tasks": ["6", "7"] },
    { "wave": 5, "tasks": ["8"] },
    { "wave": 6, "tasks": ["9", "10", "11", "12", "13"] },
    { "wave": 7, "tasks": ["14"] }
  ]
}
```
