# Implementation Plan

## Overview

This plan follows the exploratory bugfix workflow to fix the term booking summary clarity issue. The `SessionInfoStep.tsx` component currently renders identically for single and term sessions, failing to communicate recurrence pattern, date range, session count, and programme price for term bookings.

## Tasks

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Term Sessions Missing Recurring Class Information
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bug exists
  - **Scoped PBT Approach**: Scope the property to concrete term session cases: `sessionType: 'term'` with `dayOfWeek`, `termStartDate`, and `termEndDate` all present
  - Test file: `src/__tests__/express-booking/term-summary-bug-condition.test.tsx`
  - Use `fast-check` to generate term sessions with arbitrary valid `dayOfWeek` (from ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']), random `termStartDate`/`termEndDate` pairs (end >= start, within 2024-2030), and random `price` (positive integer in pence)
  - For each generated input, render `SessionInfoStep` and assert:
    - `formatRecurrenceDays([input.dayOfWeek])` text is present (e.g., "Every Saturday")
    - `formatTermDateRange(input.termStartDate, input.termEndDate)` text is present (e.g., "5 Sep – 26 Sep 2026")
    - `"{countTermSessions(input.termStartDate, input.termEndDate, input.dayOfWeek)} sessions"` text is present (e.g., "4 sessions")
    - `formatTermPrice(input.price)` text is present (e.g., "£100.00 for the programme")
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the bug exists because the component has no conditional branch for term sessions)
  - Document counterexamples found (e.g., "SessionInfoStep renders 'Saturday, 5 September 2026' instead of 'Every Saturday' for term session")
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Single/Non-Term Sessions Render Unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - Test file: `src/__tests__/express-booking/term-summary-preservation.test.tsx`
  - Observe on UNFIXED code: single sessions display full locale date (e.g., "Saturday, 5 September 2026") and flat price (e.g., "£100.00")
  - Observe on UNFIXED code: sessions with absent `sessionType` render in single-date format
  - Observe on UNFIXED code: sessions with unrecognised `sessionType` (e.g., "workshop") render in single-date format
  - Observe on UNFIXED code: term sessions with missing `dayOfWeek`/`termStartDate`/`termEndDate` render in single-date format
  - Use `fast-check` to generate random `GuestSessionInfo` objects with `sessionType !== 'term'` (arbitrarily from `['single', undefined, 'workshop', 'camp', '']`), random valid `date` strings, random `price` (positive integer in pence), and other required fields
  - Write property-based test asserting: for all non-term sessions, rendered output contains a full locale date string formatted with en-GB weekday/day/month/year and price formatted as "£X.XX" without "for the programme"
  - Write property-based test asserting: for term sessions with incomplete data (`sessionType: 'term'` but missing one or more of `dayOfWeek`, `termStartDate`, `termEndDate`), rendered output falls back to single-session format
  - Verify tests PASS on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.5, 2.5_

- [x] 3. Fix for term booking summary clarity

  - [x] 3.1 Add `countTermSessions` utility to `src/lib/term-utils.ts`
    - Implement `countTermSessions(termStartDate: string, termEndDate: string, dayOfWeek: string): number`
    - Iterate day-by-day from `termStartDate` to `termEndDate` inclusive
    - Count occurrences where `toLocaleDateString('en-GB', { weekday: 'long' })` matches `dayOfWeek`
    - Return count (0 if no matches or invalid inputs)
    - _Bug_Condition: isBugCondition(input) where input.sessionType = 'term'_
    - _Expected_Behavior: countTermSessions returns accurate count of dayOfWeek occurrences in date range_
    - _Requirements: 2.3_

  - [x] 3.2 Add `formatTermDateRange` utility to `src/lib/term-utils.ts`
    - Implement `formatTermDateRange(termStartDate: string, termEndDate: string): string`
    - Format as "{startDay} {startMonth} – {endDay} {endMonth} {endYear}" using en-GB short month names
    - Include year on start date only if start and end years differ
    - _Bug_Condition: isBugCondition(input) where input.sessionType = 'term'_
    - _Expected_Behavior: returns formatted string like "5 Sep – 26 Sep 2026"_
    - _Requirements: 2.2_

  - [x] 3.3 Update `SessionInfoStep.tsx` with conditional term rendering
    - Import `formatRecurrenceDays`, `formatTermPrice`, `countTermSessions`, `formatTermDateRange` from `@/lib/term-utils`
    - Add `isTermWithFullData` boolean: `session.sessionType === 'term' && !!session.dayOfWeek && !!session.termStartDate && !!session.termEndDate`
    - When `isTermWithFullData` is true:
      - Render "Schedule" label with `formatRecurrenceDays([session.dayOfWeek])` (e.g., "Every Saturday")
      - Render "Dates" row with `formatTermDateRange(session.termStartDate, session.termEndDate)` (e.g., "5 Sep – 26 Sep 2026")
      - Render "Sessions" row with `{countTermSessions(...)} sessions` (e.g., "4 sessions")
      - Render price with `formatTermPrice(session.price)` (e.g., "£100.00 for the programme")
    - When `isTermWithFullData` is false: preserve existing single-session rendering unchanged
    - Time, Venue, Ages, Availability rows remain identical for both paths
    - _Bug_Condition: isBugCondition(input) where input.sessionType = 'term'_
    - _Expected_Behavior: term sessions display recurrence, date range, session count, and programme price_
    - _Preservation: Single sessions and incomplete term sessions render unchanged per Requirements 3.1-3.5_
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x] 3.4 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Term Sessions Display Recurring Class Information
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior (recurrence pattern, date range, session count, programme price)
    - When this test passes, it confirms the expected behavior is satisfied
    - Run bug condition exploration test from step 1: `npx vitest --run src/__tests__/express-booking/term-summary-bug-condition.test.tsx`
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 3.5 Verify preservation tests still pass
    - **Property 2: Preservation** - Single/Non-Term Sessions Render Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run preservation property tests from step 2: `npx vitest --run src/__tests__/express-booking/term-summary-preservation.test.tsx`
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm all single-session rendering, fallback for incomplete term data, and unrecognised sessionType handling remain unchanged

- [x] 4. Checkpoint - Ensure all tests pass
  - Run full test suite: `npx vitest --run`
  - Ensure all tests pass, ask the user if questions arise
  - Verify no TypeScript errors: `npx tsc --noEmit`
  - Confirm lint passes: `npm run lint`

## Task Dependency Graph

```json
{
  "waves": [
    ["1", "2"],
    ["3.1", "3.2"],
    ["3.3"],
    ["3.4", "3.5"],
    ["4"]
  ]
}
```

## Notes

- Tasks 1 and 2 are independent and can be written in parallel
- Tasks 3.1 and 3.2 depend on tasks 1 and 2 being complete (exploration/preservation tests written first)
- Task 3.3 depends on 3.1 and 3.2 (utilities must exist before component imports them)
- Tasks 3.4 and 3.5 are verification only - re-run existing tests, do not write new ones
- The project uses Vitest + @testing-library/react + fast-check for property-based testing
- CSS Modules are used for styling; the vitest config stubs `.module.css` imports
