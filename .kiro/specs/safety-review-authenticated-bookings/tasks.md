# Implementation Plan

## Overview

Fix authenticated bookings missing `safetyReviewStatus` field by calling `determineSafetyReviewStatus(draft)` in the authenticated booking branch of the Stripe webhook handler. Uses bug condition methodology: explore the bug with a failing test, write preservation tests, implement the fix, then verify both pass.

## Tasks

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Authenticated Bookings Missing Safety Review Status
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bug exists
  - **Scoped PBT Approach**: Scope the property to authenticated booking drafts with high-risk medical declarations — for all combinations of medical flags (foodAllergies, epipenRequired, respiratoryProblems, airborneAllergies, non-empty medicalConditions), the booking document must contain `safetyReviewStatus: 'pending'`
  - Add test in `src/__tests__/api/webhook-guest.test.ts` following the existing mock patterns (hoisted mocks for `adminDb`, `stripe`, `resend`, `determineSafetyReviewStatus`)
  - Create an authenticated draft (no `bookingMode: 'guest'`) with `medicalInfo` containing at least one high-risk flag set to true
  - Process through the webhook handler and assert the resulting booking document contains `safetyReviewStatus` field
  - The test assertions should match the Expected Behavior: `safetyReviewStatus === 'pending'` when any high-risk declaration is present
  - Run test on UNFIXED code with `npm run test:run -- src/__tests__/api/webhook-guest.test.ts`
  - **EXPECTED OUTCOME**: Test FAILS because the authenticated branch never calls `determineSafetyReviewStatus` — the booking document will not have a `safetyReviewStatus` field
  - Document counterexample: `determineSafetyReviewStatus` is never called for authenticated bookings, so `safetyReviewStatus` is `undefined` instead of `'pending'`
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 2.1_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Guest Booking Safety Review Unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - Observe: Guest booking with high-risk medical info → `determineSafetyReviewStatus` is called with the draft → `safetyReviewStatus: 'pending'` is written to booking document (existing behavior confirmed by `webhook-guest.test.ts`)
  - Observe: Guest booking with no medical risk → `safetyReviewStatus: 'not_required'` is written to booking document
  - Observe: Authenticated booking document retains all existing fields (medicalInfo, emergencyContact, questionnaire, payment, bookedByUid, studentId, etc.)
  - Write property-based test using Vitest + `fast-check`: for all guest booking drafts with arbitrary medical info combinations, the webhook handler produces a booking document with `safetyReviewStatus` matching the output of `determineSafetyReviewStatus(draft)`
  - Write property-based test: for all authenticated booking drafts, existing fields (bookedByUid, studentId, medicalInfo, emergencyContact, questionnaire, payment, status, termsAccepted) remain unchanged in the output booking document
  - Verify tests pass on UNFIXED code with `npm run test:run -- src/__tests__/api/webhook-guest.test.ts`
  - **EXPECTED OUTCOME**: Tests PASS because guest branch and authenticated field structure are already correct on unfixed code
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.4_

- [x] 3. Fix for authenticated bookings missing safety review status
  - [x] 3.1 Implement the fix
    - In `src/app/api/webhooks/stripe/route.ts`, locate the `else` branch (authenticated term booking) inside the term booking transaction
    - Add `const safetyReviewStatus = determineSafetyReviewStatus(draft);` at the start of the `else` block, before `termBookingDoc` construction
    - Add `safetyReviewStatus,` field to the `termBookingDoc` object in the authenticated branch (after `questionnaire` field)
    - No import changes needed — `determineSafetyReviewStatus` is already imported from `@/lib/guest-validation`
    - No admin page changes needed — the query already picks up any booking with `safetyReviewStatus in ['pending', 'contact_parent']`
    - _Bug_Condition: isBugCondition(input) where input.bookingMode ≠ 'guest' AND has high-risk medical declarations_
    - _Expected_Behavior: bookingDoc.safetyReviewStatus = determineSafetyReviewStatus(draft) for all authenticated bookings_
    - _Preservation: Guest branch unchanged, all existing authenticated booking fields unchanged_
    - _Requirements: 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4_

  - [x] 3.2 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Authenticated Bookings Receive Safety Review Status
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior (`safetyReviewStatus: 'pending'` for high-risk authenticated bookings)
    - When this test passes, it confirms the expected behavior is satisfied
    - Run bug condition exploration test: `npm run test:run -- src/__tests__/api/webhook-guest.test.ts`
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed — `determineSafetyReviewStatus` is now called in authenticated branch)
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 3.3 Verify preservation tests still pass
    - **Property 2: Preservation** - Guest Booking Safety Review Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run preservation property tests: `npm run test:run -- src/__tests__/api/webhook-guest.test.ts`
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions — guest bookings and existing authenticated fields unchanged)
    - Confirm all tests still pass after fix (no regressions)

- [x] 4. Checkpoint - Ensure all tests pass
  - Run full test suite: `npm run test:run`
  - Ensure all tests pass, ask the user if questions arise.


## Task Dependency Graph

```json
{
  "waves": [
    ["1", "2"],
    ["3.1"],
    ["3.2", "3.3"],
    ["4"]
  ]
}
```

## Notes

- The fix is a single function call addition — `determineSafetyReviewStatus(draft)` is already imported and accepts the correct shape
- Tests use existing mock patterns from `src/__tests__/api/webhook-guest.test.ts`
- Property-based tests use `fast-check` via Vitest for generating medical info combinations
- No admin page changes needed — the query already handles any booking with `safetyReviewStatus in ['pending', 'contact_parent']`
