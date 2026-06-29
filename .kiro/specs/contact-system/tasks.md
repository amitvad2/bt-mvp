# Implementation Plan: Contact System — Gap Coverage Tasks

## Overview

The core contact-system feature is already implemented and has baseline test coverage across four test files. This task list targets the **gaps** in that coverage — specifically, property-based tests for universal correctness properties (HTML escaping, schema validation universality, Firestore document invariants, email non-fatality, admin inbox filter/badge/status logic) plus a security regression test for the `userId` exclusion rule.

All new test tasks use **fast-check** for property-based testing. Install it before starting:

```bash
npm install --save-dev fast-check
```

## Task Dependency Graph

```json
{
  "waves": [
    {
      "wave": 1,
      "tasks": ["1"],
      "description": "Install fast-check dependency — required by all property test tasks"
    },
    {
      "wave": 2,
      "tasks": ["2"],
      "description": "escapeHtml property tests — isolated pure-function, no external deps"
    },
    {
      "wave": 3,
      "tasks": ["3", "4"],
      "description": "Schema property tests and userId security test — both read from Contact_Schema / route.ts; independent of each other"
    },
    {
      "wave": 4,
      "tasks": ["5"],
      "description": "API route property tests — depend on understanding schema (wave 3) and escapeHtml (wave 2)"
    },
    {
      "wave": 5,
      "tasks": ["6"],
      "description": "Admin inbox property tests — independent component, can run after checkpoint"
    },
    {
      "wave": 6,
      "tasks": ["7"],
      "description": "Final checkpoint"
    }
  ]
}
```

---

## Tasks

- [ ] 1. Install fast-check property-testing library
  - Run `npm install --save-dev fast-check` to add fast-check to devDependencies
  - Verify it appears in `package.json` under `devDependencies`
  - Confirm `npm run test:run` still passes all existing tests after install
  - _Requirements: prerequisite for all property test tasks_

- [ ] 2. Property-based tests for `escapeHtml` — create new test file
  - Create `src/__tests__/contact/escape-html.property.test.ts`
  - Extract or re-implement `escapeHtml` as a pure exported helper OR import the function by testing it through the API route with mocked dependencies. If the function is not exported, add an export to `route.ts` or extract it to `src/lib/escape-html.ts` and import it in `route.ts`
  - Sub-tasks:
    - [ ]* 2.1 Write property test: escapeHtml completeness
      - **Property 1: escapeHtml completeness**
      - **Validates: Requirements 5.1, 5.3, 5.4**
      - Use `fc.string()` to generate arbitrary strings
      - Assert: the output contains no raw `&`, `<`, `>`, `"`, `'` characters (i.e. each appears only as its entity or not at all)
      - Assert: characters not in the special set appear unchanged in the output
      - Use at least 200 iterations (set via `{ numRuns: 200 }`)
      - Include a check that plain alphanumeric strings are returned unchanged
      - Tag comment: `// Feature: contact-system, Property 1: escapeHtml completeness`
    - [ ]* 2.2 Write example test: correct entity for each individual character
      - Verify `escapeHtml('&')` returns `'&amp;'`, `escapeHtml('<')` returns `'&lt;'`, etc.
      - Covers the specific entity mapping for all 5 characters
      - _Requirements: 5.1_
    - [ ]* 2.3 Write edge-case test: empty string and string with no special characters
      - `escapeHtml('')` returns `''`
      - `escapeHtml('hello world 123')` returns unchanged
      - _Requirements: 5.3_

- [ ] 3. Property-based and regression tests for Contact_Schema — extend existing schema test file
  - Work within `src/__tests__/contact/contact-schema.property.test.ts` (new file) or extend `contact-schema.test.ts`
  - Sub-tasks:
    - [ ]* 3.1 Write property test: schema rejects all invalid payloads
      - **Property 2: Server schema rejects all invalid payloads**
      - **Validates: Requirements 3.2, 3.5**
      - Use `fc.record({ name: fc.string({ maxLength: 1 }), ... })` to generate payloads that violate exactly one constraint at a time
      - Cover: name length < 2, invalid email format, invalid category string, message length < 10, `consentToReply: false`, `consentToReply: undefined`
      - For each generated invalid payload, `schema.safeParse(payload).success` must be `false`
      - Tag comment: `// Feature: contact-system, Property 2: schema rejects all invalid payloads`
    - [ ]* 3.2 Write property test: phone accepts any string value
      - **Property 6: Phone field accepted for any string value**
      - **Validates: Requirements 1.7, 4.5**
      - Use `fc.string({ minLength: 1 })` for the phone field combined with a valid base payload
      - Assert `schema.safeParse({ ...validBase, phone }).success === true` for any non-empty phone string
      - Tag comment: `// Feature: contact-system, Property 6: phone accepted for any string value`
    - [ ]* 3.3 Write example test: all 7 category values are accepted
      - Already partially covered in `contact-schema.test.ts` — add explicit check that ONLY the 7 defined values are valid and a random string outside the set is rejected
      - _Requirements: 3.5_

- [ ] 4. Security regression test: `userId` excluded from Firestore document
  - Work within `src/__tests__/contact/api-contact-route.test.ts`
  - Note: the existing test `'includes userId when provided'` asserts the OPPOSITE of the security requirement — this test is incorrect and must be corrected or removed
  - Sub-tasks:
    - [ ] 4.1 Correct the incorrect `userId` test
      - Remove or rewrite the test `'includes userId when provided'` which incorrectly asserts that `userId` is written to Firestore
      - Looking at the actual route code: `userId` is NOT destructured from `result.data`, so it is never written — the test was asserting incorrect behaviour
      - Add a test: `'does NOT include userId in Firestore document even when supplied in payload'`
      - Assert that `mockAdd.mock.calls[0][0]` does NOT have a `userId` property when the request body includes `userId: 'user-abc'`
      - _Requirements: 3.6_

- [ ] 5. Property-based tests for API route — extend `api-contact-route.test.ts`
  - Add property-based tests to `src/__tests__/contact/api-contact-route.test.ts` using fast-check and the existing mock setup
  - Sub-tasks:
    - [ ]* 5.1 Write property test: Firestore document invariants for valid payloads
      - **Property 3: Valid payload Firestore document invariants**
      - **Validates: Requirements 3.3, 4.1, 4.2, 4.3, 4.5, 4.7**
      - Generate valid payloads using `fc.record({ name: fc.string({ minLength: 2 }), email: fc.emailAddress(), category: fc.constantFrom(...7 values...), message: fc.string({ minLength: 10 }), consentToReply: fc.constant(true), phone: fc.option(fc.string({ minLength: 1 })) })`
      - For each: assert response status `200`, `json.success === true`, `mockCollection` called with `'contact_messages'`, `mockAdd` called with object containing `status: 'new'`, `source: 'contact-page'`, `createdAt: 'SERVER_TIMESTAMP'`
      - Assert `phone` field present in `mockAdd` argument iff payload included phone
      - Tag comment: `// Feature: contact-system, Property 3: valid payload Firestore document invariants`
    - [ ]* 5.2 Write property test: email non-fatality
      - **Property 4: Email notification non-fatality**
      - **Validates: Requirements 6.4**
      - Use `fc.oneof(fc.constant(new Error('Resend network error')), fc.constant(new Error('Rate limit')), fc.constant(new Error('Invalid API key')))` to generate different Resend failure modes
      - For each: mock `mockSendEmail.mockRejectedValueOnce(error)`, POST a valid body, assert response is still `200` with `{ success: true }`
      - Tag comment: `// Feature: contact-system, Property 4: email non-fatality`
    - [ ]* 5.3 Write property test: HTML escaping applied to all string fields in email
      - **Property 5: HTML escaping in email template**
      - **Validates: Requirements 5.2**
      - Generate payloads where string fields contain random injections of `<`, `>`, `&`, `"`, `'`
      - Use `fc.stringOf(fc.constantFrom(...'<>\'&"abcdefghij...'))` for name, message
      - After the API call, inspect `mockSendEmail.mock.calls[0][0].html`
      - Assert the html string does not contain raw `<script`, `<img`, `onerror`, and more broadly: for each raw special char injected, assert the raw char does not appear in the html (only its entity form does)
      - Tag comment: `// Feature: contact-system, Property 5: HTML escaping in email template`

- [ ] 6. Property-based tests for Admin Inbox — extend `AdminContactPage.test.tsx`
  - Add property-based tests to `src/__tests__/contact/AdminContactPage.test.tsx` using fast-check
  - The existing mock helpers (`makeDoc`, `mockGetDocs`) can be reused with fast-check generators
  - Sub-tasks:
    - [ ]* 6.1 Write property test: badge count equals number of 'new' messages
      - **Property 7: Admin inbox badge count**
      - **Validates: Requirements 7.2**
      - Use `fc.array(fc.record({ status: fc.constantFrom('new','read','replied','closed') }), { minLength: 0, maxLength: 20 })` to generate message arrays
      - For each array: mock `getDocs` to return those messages, render, assert the badge shows the exact count of messages with `status === 'new'` (or is absent when count is 0)
      - Tag comment: `// Feature: contact-system, Property 7: badge count equals number of new messages`
    - [ ]* 6.2 Write property test: filter shows only matching messages
      - **Property 8: Admin inbox filter correctness**
      - **Validates: Requirements 7.3**
      - Generate an array of messages and a random filter status
      - Render, click the filter button for the chosen status
      - Assert: every visible row's status-select value matches the filter; rows with non-matching status are not in the document
      - Tag comment: `// Feature: contact-system, Property 8: filter correctness`
    - [ ]* 6.3 Write property test: status update round-trip
      - **Property 9: Status update round-trip**
      - **Validates: Requirements 8.1, 8.2**
      - Generate a random target `ContactStatus` value using `fc.constantFrom('new','read','replied','closed')`
      - For each: render with a message, select the generated status, assert `mockUpdateDoc` called with that status, assert the select now shows the new status value
      - Tag comment: `// Feature: contact-system, Property 9: status update round-trip`
    - [ ]* 6.4 Write edge-case test: expand / collapse toggle
      - Click expand → message body visible
      - Click collapse (same button) → message body no longer in document
      - This is a round-trip property: expand + collapse should restore original state
      - _Requirements: 7.5, 7.6_

- [ ] 7. Final checkpoint — Ensure all tests pass
  - Run `npm run test:run` and confirm zero failures
  - Confirm fast-check property tests are running (check console for `Property 1:`, `Property 2:`, etc. tag output)
  - Confirm the corrected `userId` test (task 4.1) passes
  - Ask the user if any questions arise before marking this plan complete

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP pass — but Property 1 (`escapeHtml`) and the `userId` security fix (Task 4.1, not optional) should be considered high priority
- Task 4.1 is NOT marked optional — it is a security regression fix
- The `fast-check` library integrates naturally with Vitest: use `import { fc } from 'fast-check'` and wrap assertions in `fc.assert(fc.property(...))` or the async variant `fc.asyncProperty`
- All property tests should run at minimum 100 iterations; `escapeHtml` property tests should run 200 iterations
- Existing passing tests must not be broken by any change in this plan
