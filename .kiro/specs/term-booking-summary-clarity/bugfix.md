# Bugfix Requirements Document

## Introduction

When a parent opens the express booking link for a **term class session** (via `/express-booking/[sessionId]`), the session summary card displays only a single date (e.g., "Saturday, 5 September 2026") and a flat price (e.g., "£100.00"). It does not communicate that this is a recurring term class with multiple sessions included. This is confusing for parents who cannot determine whether they are paying for a single Saturday or the full term of 4 Saturdays.

The root cause is that `SessionInfoStep.tsx` in the express-booking flow ignores the term-specific fields (`sessionType`, `termStartDate`, `termEndDate`, `dayOfWeek`) that are already loaded into `GuestSessionInfo` by the server page component. The component renders identically for both single sessions and term sessions.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN `sessionType` is `'term'` AND the express booking summary card is rendered THEN the system displays only the `date` field as a single date (e.g., "Saturday, 5 September 2026") with no indication that it is a recurring class

1.2 WHEN `sessionType` is `'term'` AND the express booking summary card is rendered THEN the system does not display the term date range (`termStartDate` to `termEndDate`)

1.3 WHEN `sessionType` is `'term'` AND the express booking summary card is rendered THEN the system does not display the recurrence pattern (e.g., "Every Saturday")

1.4 WHEN `sessionType` is `'term'` AND the express booking summary card is rendered THEN the system does not display the number of sessions included in the term

1.5 WHEN `sessionType` is `'term'` AND the express booking summary card shows the price THEN the system displays a flat price (e.g., "£100.00") without clarifying it covers the full programme

### Expected Behavior (Correct)

2.1 WHEN `sessionType` is `'term'` AND `dayOfWeek` is present AND the express booking summary card is rendered THEN the system SHALL display the recurrence pattern as "Every {dayOfWeek}" (e.g., "Every Saturday") in place of the single formatted date

2.2 WHEN `sessionType` is `'term'` AND `termStartDate` and `termEndDate` are present AND the express booking summary card is rendered THEN the system SHALL display the term date range formatted as "{startDay} {startMonth} – {endDay} {endMonth} {endYear}" using en-GB short month names (e.g., "5 Sep – 26 Sep 2026")

2.3 WHEN `sessionType` is `'term'` AND `termStartDate` and `termEndDate` are present AND the express booking summary card is rendered THEN the system SHALL display the number of sessions calculated as the count of `dayOfWeek` occurrences between `termStartDate` and `termEndDate` inclusive, formatted as "{count} sessions" (e.g., "4 sessions")

2.4 WHEN `sessionType` is `'term'` AND the express booking summary card shows the price THEN the system SHALL display the price as "£{price / 100 to 2 decimal places} for the programme" (e.g., "£100.00 for the programme")

2.5 IF `sessionType` is `'term'` AND any of `dayOfWeek`, `termStartDate`, or `termEndDate` are missing or empty THEN the system SHALL fall back to displaying the session using the single-date format as if `sessionType` were `'single'`

### Unchanged Behavior (Regression Prevention)

3.1 WHEN `sessionType` is `'single'` or absent THEN the system SHALL CONTINUE TO display a single formatted date (e.g., "Saturday, 5 September 2026") using the `date` field formatted in en-GB locale with weekday, day, month, and year

3.2 WHEN `sessionType` is `'single'` or absent THEN the system SHALL CONTINUE TO display the price as a flat amount formatted as "£X.XX" (price in pence divided by 100, to 2 decimal places) without any programme label or session-count qualifier

3.3 WHEN `sessionType` is `'single'` or absent THEN the system SHALL CONTINUE TO display time as "`startTime` – `endTime`", venue as the `venueName` string, ages as "`ageMin`–`ageMax` years", and availability as "`spotsAvailable` spot(s) remaining" using the same layout and format as rendered prior to the fix

3.4 WHEN `sessionType` is `'term'` THEN the system SHALL CONTINUE TO display time as "`startTime` – `endTime`", venue as the `venueName` string, ages as "`ageMin`–`ageMax` years", and availability as "`spotsAvailable` spot(s) remaining" in the same format as single sessions

3.5 IF `sessionType` contains an unrecognised value (neither `'single'`, `'term'`, nor absent) THEN the system SHALL render the session card using the single-session format as defined in criteria 3.1, 3.2, and 3.3

---

## Bug Condition

```pascal
FUNCTION isBugCondition(X)
  INPUT: X of type GuestSessionInfo
  OUTPUT: boolean

  // Returns true when the session is a term session viewed in express-booking flow
  RETURN X.sessionType = 'term'
END FUNCTION
```

## Property Specification

```pascal
// Property: Fix Checking — Term sessions show recurring class information
FOR ALL X WHERE isBugCondition(X) DO
  card ← renderSessionInfoStep(X)
  ASSERT card.contains(recurrenceLabel(X.dayOfWeek))
    AND card.contains(dateRange(X.termStartDate, X.termEndDate))
    AND card.contains(sessionCount(X))
    AND card.contains(programmePrice(X.price))
END FOR
```

## Preservation Goal

```pascal
// Property: Preservation Checking — Single sessions render unchanged
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT renderSessionInfoStep(X) = renderSessionInfoStep'(X)
END FOR
```
