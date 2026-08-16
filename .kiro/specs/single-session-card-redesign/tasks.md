# Implementation Plan: Single Session Card Redesign

## Overview

Simplify the single session card in `SessionBrowser.tsx` to reduce visual clutter. The implementation removes the date badge, removes the stats strip, adds a consolidated heading subtitle (day · time range · age), removes redundant detail rows (Category, Minimum Age, Maximum Age), and updates time computation to show a from–to range. All changes are confined to the `sessions.map(...)` block. No new CSS classes are introduced.

## Tasks

- [x] 1. Remove date badge from card header
  - Remove the `dateBadge` div (containing `badgeDay` and `badgeMonth` spans) from the `cardTop` block
  - `cardTop` div now contains only `cardTitleBlock`
  - _Requirements: 1.1, 1.2, 1.3_

- [x] 2. Remove stats strip
  - Remove the `statsStrip` div and all four `statItem` children (spaces, day abbreviation, start time, duration)
  - Remove the associated computed variables (`durationMins`, `durationHours`, `durationLabel`) if no longer used
  - _Requirements: 2.1, 2.2_

- [x] 3. Add heading subtitle with day, time range, and age
  - Add `<p className={styles.sessionSchedule}><strong>{dayFull} · {timeRangeS}{ageRange}</strong></p>` inside `cardTitleBlock` directly below the `<h3>` class name
  - Compute `dayFull` from `s.date` using `toLocaleDateString('en-GB', { weekday: 'long' })`
  - Append ` · {s.ageMin}–{s.ageMax} yrs` conditionally when both `s.ageMin` and `s.ageMax` are non-null
  - Use `<strong>` element for bold rendering
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 6.3_

- [x] 4. Compute time range from start and end time
  - Parse `s.endTime` (HH:MM string) into hours and minutes
  - Compute `endHourS` (12h format), `endPeriodS` (AM/PM), `endTimeS` display string
  - Update start time computation to include AM/PM in `startTimeS`
  - Set `timeRangeS = "${startTimeS} – ${endTimeS}"`
  - Remove unused `durationMins`, `durationHours`, `durationLabel` variables (previously used only by the stats strip)
  - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [x] 5. Remove Category row from Details Table
  - Remove the `<dt>Category</dt><dd>{badge.displayName}</dd>` detail row
  - The `badge` variable may still be computed but is no longer rendered
  - _Requirements: 5.1, 5.2_

- [x] 6. Remove Minimum Age and Maximum Age rows from Details Table
  - Remove the `<dt>Minimum Age</dt><dd>{s.ageMin} yrs</dd>` detail row
  - Remove the `<dt>Maximum Age</dt><dd>{s.ageMax} yrs</dd>` detail row
  - Age range is now communicated via the Heading Subtitle (task 3)
  - _Requirements: 6.1, 6.2, 6.3_

## Notes

- All tasks are complete — no further implementation needed
- Each task references specific requirements for traceability
- No new CSS classes were introduced — only existing `styles.*` classes are reused
- The `s.endTime` field was already present on the Session interface and required no schema changes
- The term session card (`termSessions.map` block) is not affected by any of these changes

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1", "2", "5", "6"] },
    { "id": 1, "tasks": ["4"] },
    { "id": 2, "tasks": ["3"] }
  ]
}
```
