# Implementation Plan: Term Card Redesign

## Overview

Refactor the term session card in `SessionBrowser.tsx` to clearly communicate upfront term commitment to parents. The implementation extracts three pure helper functions for testable logic, modifies JSX in the `termSessions.map` block only, and reuses existing CSS classes throughout. Additional changes streamline the card by removing the date badge, relocating the age range to the heading, removing redundant detail rows (Dates, Day, Category), and showing a from–to time range. Property-based tests validate helper function correctness; unit tests cover component rendering changes.

## Tasks

- [x] 1. Create helper functions module
  - [x] 1.1 Create `src/components/sessions/term-card-utils.ts` with `getCommitmentBannerText` function
    - Accept `schedule: ScheduleEntry[]` and `termStartDate: string` parameters
    - Filter schedule to active entries, compute weekday for each active date
    - If all weekdays identical → return `"Book all {n} {dayName} sessions for the full {month} term — one upfront payment."`
    - If weekdays differ → return `"Book all {n} sessions for the full {month} term — one upfront payment."`
    - Extract month name from `termStartDate` using `en-GB` locale
    - _Requirements: 1.2, 1.3_

  - [x] 1.2 Add `formatSessionDates` function to `src/components/sessions/term-card-utils.ts`
    - Accept `schedule: ScheduleEntry[]` parameter
    - Filter to active entries, sort chronologically by date
    - Format each date as `"{day} {month}"` using `Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' })`
    - Join with `", "`
    - If total string length > 60 chars, truncate after the last complete date that fits within 60 chars and append `"… +{n} more"`
    - _Requirements: 5.1, 5.2, 5.3, 5.5_

  - [x] 1.3 Add `formatTermPrice` function to `src/components/sessions/term-card-utils.ts`
    - Accept `activeCount: number` and `priceInPence: number` parameters
    - If `activeCount > 0` → return `"All {activeCount} sessions · £{(priceInPence/100).toFixed(2)}"`
    - If `activeCount === 0` → return `"£{(priceInPence/100).toFixed(2)}"`
    - _Requirements: 2.1, 2.4, 2.5_

- [x] 2. Write property-based tests for helper functions
  - [x] 2.1 Write property test for `getCommitmentBannerText` — weekday adaptation
    - **Property 1: Banner text adapts to schedule weekday pattern**
    - **Validates: Requirements 1.3**
    - Generate random schedules where all active dates share a weekday → assert banner contains that weekday name
    - Generate random schedules where active dates span multiple weekdays → assert banner contains no weekday name and uses generic phrasing
    - Use `fast-check` arbitrary to generate `ScheduleEntry[]` with 1–12 entries, random YYYY-MM-DD dates, random active/skipped statuses
    - Test file: `src/__tests__/components/sessions/term-card-utils.property.test.ts`

  - [x] 2.2 Write property test for `formatTermPrice` — price format correctness
    - **Property 2: Price row format reflects active count**
    - **Validates: Requirements 2.1, 2.4, 2.5**
    - For any `activeCount > 0` and valid `priceInPence` (positive integer) → assert output matches `"All {n} sessions · £{formatted}"`
    - For `activeCount === 0` → assert output matches `"£{formatted}"` with no session count prefix
    - Use `fast-check` `nat()` and `integer({ min: 0 })` arbitraries

  - [x] 2.3 Write property test for `formatSessionDates` — filtering and ordering
    - **Property 3: Session dates contain only active entries in chronological order**
    - **Validates: Requirements 5.2, 5.3**
    - Generate random schedules with mix of active/skipped entries → assert output contains only active dates in ascending order
    - Assert no date from a skipped entry appears in the output string

  - [x] 2.4 Write property test for `formatSessionDates` — truncation at 60 characters
    - **Property 4: Session dates truncation respects 60-character limit**
    - **Validates: Requirements 5.5**
    - Generate schedules with many active entries (6–12) to trigger truncation → assert visible portion is ≤ 60 chars (excluding suffix)
    - Assert suffix matches `"… +{n} more"` where n is the count of undisplayed active sessions
    - Assert no partial dates appear in the visible portion

- [x] 3. Checkpoint - Verify helper functions
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Modify term card JSX in SessionBrowser.tsx
  - [x] 4.1 Replace `termBadgeRow` with Commitment Banner
    - Import helper functions from `@/components/sessions/term-card-utils`
    - Remove the existing `termBadgeRow` div (containing "Term" badge and session count)
    - Add Commitment Banner: a div using `styles.termBadgeRow` class with a small "Term" badge (`badge badge-indigo`) followed by text from `getCommitmentBannerText(ts.schedule, ts.termStartDate)`
    - Only render banner when `activeCount > 0` AND `ts.termStartDate` is defined
    - Use `styles.termSessionCount` class for the text element
    - _Requirements: 1.1, 1.2, 1.4, 1.5_

  - [x] 4.2 Remove duplicate date range subtitle
    - Remove the `<p className={styles.sessionSchedule}>{dateRangeStr}</p>` element from the `cardTitleBlock` div
    - The element must be removed from the DOM, not hidden
    - _Requirements: 3.1, 3.2_

  - [x] 4.3 Rename "Term Period" label to "Dates" and add Session Dates row
    - Change `<dt>Term Period</dt>` to `<dt>Dates</dt>` in the Details Table
    - Add a new detail row after the "Dates" row: `<dt>Sessions</dt><dd>{formatSessionDates(ts.schedule)}</dd>`
    - Only render the Sessions row when `ts.schedule` is defined and has at least one active entry
    - _Requirements: 4.1, 4.2, 4.3, 5.1, 5.4_

  - [x] 4.4 Rename "Ages" label to "Age Range"
    - Change `<dt>Ages</dt>` to `<dt>Age Range</dt>` in the existing age detail row
    - Keep the value format `{ts.ageMin}–{ts.ageMax} yrs` with en-dash (U+2013) unchanged
    - Condition for rendering remains: `ts.ageMin != null && ts.ageMax != null`
    - _Requirements: 6.1, 6.2, 6.3_

  - [x] 4.5 Rewrite Price Row with `formatTermPrice`
    - Remove the existing `priceLabel` and `priceValue` spans
    - Replace with a single `<span className={styles.priceValue}>{formatTermPrice(activeCount, ts.price)}</span>`
    - Handle null/undefined `ts.schedule` by treating `activeCount` as 0
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 4.6 Remove date badge from card header
    - Remove the `dateBadge` div (containing `badgeDay` and `badgeMonth` spans) from the `cardTop` block
    - `cardTop` div now contains only `cardTitleBlock`
    - _Requirements: 9.1, 9.2, 9.3_

  - [x] 4.7 Move age range to card heading subtitle
    - Remove the `<dt>Age Range</dt>` row from the Details Table
    - Add `<p className={styles.sessionSchedule}>{ts.ageMin}–{ts.ageMax} yrs</p>` inside `cardTitleBlock`, directly below the `<h3>` class name
    - Render conditionally when both `ts.ageMin` and `ts.ageMax` are non-null
    - _Requirements: 6.1, 6.2, 6.3_

  - [x] 4.8 Remove Dates, Day, and Category rows from Details Table
    - Remove the "Dates" detail row (`<dt>Dates</dt><dd>{dateRangeStr}</dd>`)
    - Remove the "Day" detail row (`<dt>Day</dt><dd>{ts.dayOfWeek || '—'}</dd>`)
    - Remove the "Category" detail row (`<dt>Category</dt><dd>{badge.displayName}</dd>`)
    - _Requirements: 4.1, 4.2, 8.1_

  - [x] 4.9 Add from–to time range to Time row
    - Parse `ts.endTime` (HH:MM string) into hours and minutes
    - Compute `endPeriod` (AM/PM), `endHour` (12h format), `endTimeDisplay` string
    - Update start time computation to include AM/PM in `timeDisplay`
    - Set `timeRangeDisplay = "${timeDisplay} – ${endTimeDisplay}"`
    - Update Time row `<dd>` to use `{timeRangeDisplay}`
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

- [x] 5. Write unit tests for component rendering changes
  - [x] 5.1 Write unit tests for Commitment Banner rendering
    - Test banner renders with correct text when `activeCount > 0` and `termStartDate` defined
    - Test banner does NOT render when `activeCount === 0` or `termStartDate` undefined
    - Test banner contains "Term" badge
    - Test file: `src/__tests__/components/sessions/SessionBrowser.term-card.test.tsx`
    - _Requirements: 1.1, 1.2, 1.4, 1.5_

  - [x] 5.2 Write unit tests for label changes and subtitle removal
    - Assert "Dates" label replaces "Term Period"
    - Assert no `sessionSchedule` paragraph element in term card DOM
    - Assert "Age Range" label replaces "Ages"
    - Assert Sessions row appears when schedule has active entries
    - Assert Sessions row does NOT appear when schedule is undefined or all skipped
    - _Requirements: 3.1, 4.1, 5.1, 5.4, 6.1_

  - [x] 5.3 Write unit tests for Price Row format
    - Assert "Term price" label no longer appears
    - Assert price row text matches `formatTermPrice` output
    - Assert correct format when activeCount > 0 and when activeCount === 0
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 5.4 Write regression tests for unchanged elements
    - Assert "Book Now" button still renders
    - Assert "Book as a Guest" link renders when `showGuestOption` is true
    - Assert TermScheduleView renders when schedule is expanded
    - Assert single-session cards are not affected (render separately with original structure)
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [x] 6. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- All helper functions are co-located in `src/components/sessions/term-card-utils.ts` for tight coupling with the component
- No new CSS classes are introduced — only existing `styles.*` classes are reused
- The `fast-check` library must be installed as a dev dependency if not already present

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3"] },
    { "id": 2, "tasks": ["2.1", "2.2", "2.3"] },
    { "id": 3, "tasks": ["2.4"] },
    { "id": 4, "tasks": ["4.1", "4.2", "4.4"] },
    { "id": 5, "tasks": ["4.3", "4.5"] },
    { "id": 6, "tasks": ["4.6", "4.7", "4.8", "4.9"] },
    { "id": 7, "tasks": ["5.1", "5.2", "5.3", "5.4"] }
  ]
}
```
