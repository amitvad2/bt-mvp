# Term Booking Summary Clarity — Bugfix Design

## Overview

The express booking summary card (`SessionInfoStep.tsx`) renders identically for single and term sessions. When a parent opens a term booking link, they see only a single date and a flat price with no indication that multiple recurring sessions are included. The fix conditionally renders term-specific information (recurrence pattern, date range, session count, programme price label) when `sessionType === 'term'` and the required term fields are present, while preserving the existing single-session rendering path unchanged.

## Glossary

- **Bug_Condition (C)**: The session has `sessionType === 'term'` — the summary card fails to communicate term-specific details
- **Property (P)**: When the bug condition holds, the card displays recurrence pattern, date range, session count, and programme price
- **Preservation**: When the bug condition does NOT hold (`sessionType !== 'term'`), the card renders exactly as it does today — single date, flat price, same layout
- **SessionInfoStep**: The React component at `src/app/express-booking/[sessionId]/steps/SessionInfoStep.tsx` that renders the session summary card
- **GuestSessionInfo**: The TypeScript interface in `src/types/index.ts` carrying session data including optional term fields (`sessionType`, `termStartDate`, `termEndDate`, `dayOfWeek`)
- **term-utils**: Utility module at `src/lib/term-utils.ts` containing `formatRecurrenceDays`, `formatTermPrice`, and `formatProgrammeDescription`

## Bug Details

### Bug Condition

The bug manifests when a parent opens an express booking link for a term class session. The `SessionInfoStep` component unconditionally formats the `date` field as a single calendar date and renders the price as a flat `£X.XX` value. It completely ignores the `sessionType`, `termStartDate`, `termEndDate`, and `dayOfWeek` fields that are already available on the `GuestSessionInfo` object.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type GuestSessionInfo
  OUTPUT: boolean

  RETURN input.sessionType = 'term'
END FUNCTION
```

### Examples

- **Term session with all fields present**: Session has `sessionType: 'term'`, `dayOfWeek: 'Saturday'`, `termStartDate: '2026-09-05'`, `termEndDate: '2026-09-26'`, `price: 10000`. Currently displays "Saturday, 5 September 2026" and "£100.00". Should display "Every Saturday", "5 Sep – 26 Sep 2026", "4 sessions", and "£100.00 for the programme".
- **Term session spanning months**: `termStartDate: '2026-01-10'`, `termEndDate: '2026-03-28'`, `dayOfWeek: 'Saturday'`. Currently shows only "Saturday, 10 January 2026". Should show "Every Saturday", "10 Jan – 28 Mar 2026", "12 sessions", "£X.XX for the programme".
- **Term session with missing dayOfWeek**: `sessionType: 'term'`, `termStartDate` and `termEndDate` present but `dayOfWeek` is undefined. Should fall back to single-date format per requirement 2.5.
- **Single session (not affected)**: `sessionType: 'single'` or absent. Should continue to render as it does today — a full date string and flat price.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Single sessions (`sessionType !== 'term'` or absent) continue to display the full formatted date (e.g., "Saturday, 5 September 2026") using `en-GB` locale with weekday, day, month, year
- Single session prices continue to display as "£X.XX" without any qualifier
- Time, venue, age range, and availability display identically for both session types
- The "Express Booking" badge, "No account required" message, class name, class type, and Continue button remain unchanged regardless of session type
- Unrecognised `sessionType` values fall back to single-session rendering

**Scope:**
All inputs where `sessionType` is NOT `'term'` (including `'single'`, absent/undefined, or any unrecognised value) are completely unaffected by this fix. The rendering path for these sessions must produce identical output before and after the fix.

## Hypothesized Root Cause

Based on the bug description and code inspection, the root cause is straightforward:

1. **No conditional branching on `sessionType`**: `SessionInfoStep.tsx` has a single rendering path. It formats `session.date` into a locale string and renders `session.price / 100` directly. There is no `if (session.sessionType === 'term')` branch anywhere in the component.

2. **Term fields are available but unused**: The `GuestSessionInfo` interface already defines `sessionType?`, `termStartDate?`, `termEndDate?`, and `dayOfWeek?` as optional fields. The server page component loads these from Firestore. The component simply never reads them.

3. **No session count calculation exists**: While `term-utils.ts` has `formatRecurrenceDays` and `formatTermPrice`, there is no utility to count occurrences of a specific day-of-week between two dates. This function needs to be created.

4. **`formatProgrammeDescription` exists but uses "{N}-Day Programme" phrasing**: The existing utility uses "Day Programme" nomenclature, but requirements specify a simpler "{count} sessions" format and a separate date range line. A new `countTermSessions` utility is needed rather than reusing `formatProgrammeDescription`.

## Correctness Properties

Property 1: Bug Condition — Term sessions display recurring class information

_For any_ `GuestSessionInfo` where `sessionType === 'term'` AND `dayOfWeek`, `termStartDate`, and `termEndDate` are all present and non-empty, the rendered `SessionInfoStep` SHALL display: (a) "Every {dayOfWeek}" as the schedule label, (b) the term date range formatted as "{startDay} {startMonth} – {endDay} {endMonth} {endYear}" using en-GB short month names, (c) "{N} sessions" where N is the count of `dayOfWeek` occurrences between `termStartDate` and `termEndDate` inclusive, and (d) the price formatted as "£{price/100 to 2dp} for the programme".

**Validates: Requirements 2.1, 2.2, 2.3, 2.4**

Property 2: Bug Condition Fallback — Term sessions with missing fields fall back to single format

_For any_ `GuestSessionInfo` where `sessionType === 'term'` BUT any of `dayOfWeek`, `termStartDate`, or `termEndDate` are missing or empty, the rendered `SessionInfoStep` SHALL display the session using the single-date format (full locale date and flat price) identically to a single session.

**Validates: Requirements 2.5**

Property 3: Preservation — Single sessions render unchanged

_For any_ `GuestSessionInfo` where `sessionType !== 'term'` (including `'single'`, absent, or unrecognised values), the rendered `SessionInfoStep` SHALL produce the same output as the original unfixed component: full locale-formatted date, flat "£X.XX" price, and identical time/venue/ages/availability layout.

**Validates: Requirements 3.1, 3.2, 3.3, 3.5**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `src/lib/term-utils.ts`

**New Function**: `countTermSessions`

**Specific Changes**:
1. **Add `countTermSessions(termStartDate: string, termEndDate: string, dayOfWeek: string): number`**: Counts occurrences of `dayOfWeek` between `termStartDate` and `termEndDate` inclusive. Implementation iterates day-by-day from start to end, incrementing a counter when the day name matches `dayOfWeek`. Uses `toLocaleDateString('en-GB', { weekday: 'long' })` for day comparison.

2. **Add `formatTermDateRange(termStartDate: string, termEndDate: string): string`**: Formats the date range as "{startDay} {startMonth} – {endDay} {endMonth} {endYear}". Reuses the internal `formatShortDate` logic (which needs to be exported or inlined) with the year only on the end date when both dates share the same year.

---

**File**: `src/app/express-booking/[sessionId]/steps/SessionInfoStep.tsx`

**Function**: `SessionInfoStep` (default export)

**Specific Changes**:
1. **Import term utilities**: Add imports for `formatRecurrenceDays`, `formatTermPrice`, `countTermSessions`, and `formatTermDateRange` from `@/lib/term-utils`.

2. **Add term detection helper**: Create a local `isTermWithFullData` boolean:
   ```ts
   const isTermWithFullData =
     session.sessionType === 'term' &&
     !!session.dayOfWeek &&
     !!session.termStartDate &&
     !!session.termEndDate;
   ```

3. **Conditional Date/Schedule rendering**: Replace the single "Date" detail row with conditional logic:
   - If `isTermWithFullData`: render "Schedule" label with value `formatRecurrenceDays([session.dayOfWeek])` (e.g., "Every Saturday"), plus a "Dates" row with `formatTermDateRange(session.termStartDate, session.termEndDate)`, plus a "Sessions" row with `{countTermSessions(...)} sessions`.
   - Else: render the existing "Date" row with `formattedDate` unchanged.

4. **Conditional Price rendering**: Replace the price rendering:
   - If `isTermWithFullData`: render `formatTermPrice(session.price)` (e.g., "£100.00 for the programme").
   - Else: render `£${(session.price / 100).toFixed(2)}` as before.

5. **No changes to**: Time, Venue, Ages, Availability rows — these render identically for both paths (requirement 3.4).

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Render `SessionInfoStep` with term session data and assert that term-specific information is displayed. Run these tests on the UNFIXED code to observe failures and confirm the root cause.

**Test Cases**:
1. **Term session renders recurrence pattern**: Render with `sessionType: 'term'`, `dayOfWeek: 'Saturday'` → assert "Every Saturday" is in the document (will fail on unfixed code)
2. **Term session renders date range**: Render with `termStartDate: '2026-09-05'`, `termEndDate: '2026-09-26'` → assert "5 Sep – 26 Sep 2026" is in the document (will fail on unfixed code)
3. **Term session renders session count**: Render with the above dates + `dayOfWeek: 'Saturday'` → assert "4 sessions" is displayed (will fail on unfixed code)
4. **Term session renders programme price**: Render with `price: 10000` + term fields → assert "£100.00 for the programme" is displayed (will fail on unfixed code)

**Expected Counterexamples**:
- None of the term-specific text appears because the component has no conditional branch for `sessionType === 'term'`
- The component always renders the single-date format regardless of session type

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) AND hasFullTermData(input) DO
  card := renderSessionInfoStep(input)
  ASSERT card.contains(formatRecurrenceDays([input.dayOfWeek]))
  ASSERT card.contains(formatTermDateRange(input.termStartDate, input.termEndDate))
  ASSERT card.contains(countTermSessions(input.termStartDate, input.termEndDate, input.dayOfWeek) + " sessions")
  ASSERT card.contains(formatTermPrice(input.price))
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT renderSessionInfoStep_fixed(input) = renderSessionInfoStep_original(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many randomised `GuestSessionInfo` objects with `sessionType !== 'term'`
- It catches edge cases around missing fields, unusual class types, and boundary prices
- It provides strong guarantees that the single-session rendering path is completely unchanged

**Test Plan**: Observe the current rendering output for single sessions (already captured in the existing test suite), then write property-based tests that generate random single-session data and verify the rendered output matches the expected format.

**Test Cases**:
1. **Single session date format preservation**: For any session with `sessionType: 'single'` or absent, verify the full locale date string appears (weekday, day, month, year)
2. **Single session price format preservation**: For any session with `sessionType !== 'term'`, verify price displays as "£X.XX" without "for the programme"
3. **Fallback for incomplete term data**: For any session with `sessionType: 'term'` but missing `dayOfWeek`/`termStartDate`/`termEndDate`, verify it renders as a single session
4. **Unrecognised sessionType preservation**: For any session with an unknown `sessionType` value, verify single-session rendering

### Unit Tests

- `countTermSessions` correctly counts day occurrences for various date ranges and days of the week
- `countTermSessions` handles same start and end date (returns 1 if it matches the day, 0 otherwise)
- `countTermSessions` handles ranges spanning month/year boundaries
- `formatTermDateRange` produces "{day} {month} – {day} {month} {year}" format
- `formatTermDateRange` includes year on start date when years differ
- `SessionInfoStep` renders all term fields when `isTermWithFullData` is true
- `SessionInfoStep` falls back to single format when term fields are incomplete

### Property-Based Tests

- Generate random valid term sessions (random `dayOfWeek`, random date ranges within 2024-2030) and verify `countTermSessions` result equals an independent count implementation
- Generate random `GuestSessionInfo` with `sessionType !== 'term'` and verify the rendered output contains a full locale date string and flat price
- Generate random term sessions with deliberately missing fields and verify fallback to single-session rendering
- Property: `countTermSessions` always returns a value ≥ 0 and ≤ `(daysDifference / 7) + 1`

### Integration Tests

- Full express booking flow: load a term session page and verify the summary card shows recurrence, date range, session count, and programme price
- Full express booking flow: load a single session page and verify no term-specific UI appears
- Verify Continue button advances to step 1 regardless of session type
