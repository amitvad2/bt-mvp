# Implementation Plan

## Overview

Fix the cancellation email route to CC the admin (`RESEND_ADMIN_EMAIL`) on cancellation and bundle-cancellation emails. The fix is limited to `src/app/api/emails/send/route.ts`. The workflow follows the bug condition methodology: explore the bug with tests, verify preservation of existing behavior, implement the fix, then validate.

## Tasks

- [ ] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Cancellation Emails Missing Admin CC
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bug exists
  - **Scoped PBT Approach**: Scope the property to the concrete failing cases: `type: 'cancellation'` and `type: 'bundle-cancellation'` with any valid email and subject
  - Create test file at `src/__tests__/emails/cancellation-admin-cc.test.ts`
  - Mock the Resend SDK (`vi.mock('@/lib/resend')`) and Firebase Admin Auth (`vi.mock('@/lib/firebase-admin')`)
  - Mock `adminAuth.verifyIdToken()` to return a valid decoded token
  - Test that when `POST /api/emails/send` is called with `type: 'cancellation'` and `RESEND_ADMIN_EMAIL` is configured, `resend.emails.send()` is called with a `cc` field containing the admin email
  - Test that when `POST /api/emails/send` is called with `type: 'bundle-cancellation'` and `RESEND_ADMIN_EMAIL` is configured, `resend.emails.send()` is called with a `cc` field containing the admin email
  - Test that when `RESEND_ADMIN_EMAIL` is not set and a cancellation email is sent, the email still sends to the user without a CC field and a warning is logged
  - Run tests on UNFIXED code with `npm run test:run`
  - **EXPECTED OUTCOME**: Tests FAIL (this is correct - it proves the bug exists because `resend.emails.send()` is currently called without a `cc` field for cancellation emails)
  - Document counterexamples found (e.g., "`resend.emails.send()` called with `{ from, to, subject, html }` — no `cc` field present for cancellation type")
  - Mark task complete when tests are written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 2.1, 2.2, 2.3_

- [ ] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Confirmation and Error Behaviour Unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - Create test file at `src/__tests__/emails/cancellation-admin-cc-preservation.test.ts`
  - Mock the Resend SDK (`vi.mock('@/lib/resend')`) and Firebase Admin Auth (`vi.mock('@/lib/firebase-admin')`)
  - Observe: `POST /api/emails/send` with `type: 'confirmation'` sends email with no `cc` field on unfixed code
  - Observe: `POST /api/emails/send` with missing required fields (`to`, `subject`, `type`) returns 400 on unfixed code
  - Observe: `POST /api/emails/send` without valid `Authorization` header returns 401 on unfixed code
  - Observe: `POST /api/emails/send` when `RESEND_API_KEY` is not configured returns 500 on unfixed code
  - Write property-based tests capturing observed behavior:
    - For all non-cancellation email types (e.g., `'confirmation'`), `resend.emails.send()` is called WITHOUT a `cc` field
    - For requests with missing required fields, route returns 400 regardless of email type
    - For requests without valid auth, route returns 401 regardless of email type
    - For requests when `RESEND_API_KEY` is not configured, route returns 500
  - Run tests on UNFIXED code with `npm run test:run`
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [ ] 3. Fix for cancellation emails not CC'ing admin

  - [ ] 3.1 Implement the fix in `src/app/api/emails/send/route.ts`
    - Read `process.env.RESEND_ADMIN_EMAIL` into a local variable after HTML template is built
    - Add conditional logic to determine CC recipients based on email type:
      - If `type === 'cancellation'` or `type === 'bundle-cancellation'`:
        - If `RESEND_ADMIN_EMAIL` is set and non-empty → `cc = [RESEND_ADMIN_EMAIL]`
        - If `RESEND_ADMIN_EMAIL` is not set or empty → `cc = undefined`, log `console.warn('RESEND_ADMIN_EMAIL not configured — cancellation email sent without admin CC')`
      - For all other types → `cc = undefined` (no CC)
    - Build `sendOptions` object with `from`, `to`, `subject`, `html`, and conditionally include `cc` only when defined
    - Pass `sendOptions` to `resend.emails.send()`
    - No changes to HTML email templates or other logic
    - _Bug_Condition: isBugCondition(input) where input.type IN ['cancellation', 'bundle-cancellation'] AND RESEND_ADMIN_EMAIL is configured AND cc is not included_
    - _Expected_Behavior: resend.emails.send() called with cc = [RESEND_ADMIN_EMAIL] for cancellation types_
    - _Preservation: Confirmation emails, error responses (400, 401, 500), from address logic, and HTML templates remain unchanged_
    - _Requirements: 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4_

  - [ ] 3.2 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Cancellation Emails Include Admin CC
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior (admin CC on cancellation emails)
    - When this test passes, it confirms the expected behavior is satisfied
    - Run bug condition exploration test from step 1 with `npm run test:run`
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed — `resend.emails.send()` now includes `cc: [RESEND_ADMIN_EMAIL]` for cancellation types)
    - _Requirements: 2.1, 2.2, 2.3_

  - [ ] 3.3 Verify preservation tests still pass
    - **Property 2: Preservation** - Confirmation and Error Behaviour Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run preservation property tests from step 2 with `npm run test:run`
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions — confirmation emails still have no CC, error paths unchanged)
    - Confirm all tests still pass after fix (no regressions)
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [ ] 4. Checkpoint - Ensure all tests pass
  - Run full test suite with `npm run test:run`
  - Verify all existing tests pass alongside the new tests
  - Ensure no regressions in other email-related tests
  - Ask the user if questions arise

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

- The only file modified by the fix is `src/app/api/emails/send/route.ts`
- `RESEND_ADMIN_EMAIL` environment variable already exists in the project but is unused in this route
- Tests use Vitest with the Resend SDK mocked — inspect `resend.emails.send()` call arguments to verify CC behavior
- The exploration test (task 1) is expected to FAIL on unfixed code — this is intentional and confirms the bug exists
- The preservation tests (task 2) are expected to PASS on unfixed code — this captures the baseline behavior
- After the fix (task 3.1), the exploration test should PASS and preservation tests should still PASS
