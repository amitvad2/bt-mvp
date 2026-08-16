# Requirements Document

## Introduction

Redesign the term session booking card in the SessionBrowser component so that parents clearly understand they are committing to a full block of sessions with a single upfront payment. Terms can take many forms — 4 Saturdays in a month, 5 weekdays in a single week, mixed days across weeks — so the card copy must adapt to any scheduling pattern rather than assuming a single recurring weekday. The current card uses ambiguous labels ("Term price", "Term Period") and duplicates information, causing confusion about what is being purchased. This redesign replaces unclear labelling with plain-English copy, adds per-session price breakdown, shows individual session dates, and removes redundant elements — all without changing booking logic or introducing new CSS classes.

## Glossary

- **Term_Card**: The session card rendered in `SessionBrowser.tsx` (lines 314–433) for term-type session blocks, displaying class details, pricing, and a booking call-to-action.
- **Commitment_Banner**: A short, readable callout sentence displayed above the details table that communicates the upfront payment commitment to the parent.
- **Details_Table**: The `<dl>` element within the Term_Card that presents session metadata (sessions, time, spaces, venue, instructor) in label–value rows.
- **Price_Row**: The section of the Term_Card that displays the total cost and per-session breakdown for the term block.
- **Session_Dates_Row**: A new detail row within the Details_Table that lists individual session dates derived from `ts.schedule`.
- **activeCount**: The number of non-cancelled sessions in the term block.
- **ts.price**: The total term price stored in pence (integer).
- **ts.schedule**: An array of scheduled session objects, each containing a `date` field (YYYY-MM-DD string) and a `status` field.

## Requirements

### Requirement 1: Replace Term Badge Row with Commitment Banner

**User Story:** As a parent, I want to see a clear statement about the term commitment above the session details, so that I understand I am paying upfront for all sessions in the block.

#### Acceptance Criteria

1. WHEN a term card is rendered, THE Term_Card SHALL remove the existing `termBadgeRow` div (containing the "Term" badge and session count text).
2. WHEN a term card is rendered AND `activeCount` is greater than 0 AND `termStartDate` is defined, THE Term_Card SHALL display a Commitment_Banner between the card header and the Details_Table containing a small "Term" badge followed by contextual commitment text and the phrase "— one upfront payment."
3. THE Commitment_Banner text SHALL adapt to the scheduling pattern:
   - IF all active sessions fall on the same weekday (determined by checking `ts.schedule` dates), THEN the text SHALL read: "Book all {activeCount} {dayName} sessions for the full {month} term — one upfront payment." (e.g. "Book all 4 Saturday sessions for the full September term — one upfront payment.")
   - IF active sessions span multiple different weekdays, THEN the text SHALL read: "Book all {activeCount} sessions for the full {month} term — one upfront payment." (e.g. "Book all 5 sessions for the full September term — one upfront payment.")
4. WHEN a term card is rendered, THE Commitment_Banner SHALL span the full card width, use a muted background colour, and render text at the same size as the existing `termSessionCount` element, applying only existing CSS classes from `styles.*`.
5. IF `activeCount` is 0 OR `termStartDate` is undefined, THEN THE Term_Card SHALL NOT display the Commitment_Banner.

### Requirement 2: Rewrite the Price Row as Total Term Price

**User Story:** As a parent, I want to see the total price for the whole term clearly, so that I know exactly what I am paying upfront.

#### Acceptance Criteria

1. WHEN a term card is rendered with activeCount greater than zero, THE Price_Row SHALL display the text: "All {activeCount} sessions · £{total}" where total equals `(ts.price / 100).toFixed(2)`.
2. THE Price_Row SHALL NOT display a per-session breakdown.
3. THE Price_Row SHALL NOT display the previous label "Term price".
4. IF activeCount is zero, THEN THE Price_Row SHALL display the text "£{total}" where total equals `(ts.price / 100).toFixed(2)`, without any session count.
5. IF `ts.schedule` is null or undefined, THEN THE Price_Row SHALL treat activeCount as zero.

### Requirement 3: Remove Duplicate Date Range from Card Subtitle

**User Story:** As a parent, I want to see the date range in only one place on the card, so that the layout is clean and not repetitive.

#### Acceptance Criteria

1. WHEN a term card is rendered, THE Term_Card SHALL NOT render the `<p className={styles.sessionSchedule}>` subtitle element that displays `dateRangeStr` below the class name — the element SHALL be removed from the DOM, not merely hidden.
2. THE Details_Table SHALL remain the single location where the date range is displayed.
3. THE `dateBadge` div (which previously showed the start date's day and abbreviated month) SHALL be removed from the `cardTop` div entirely — the card header SHALL contain only the `cardTitleBlock`.

### Requirement 4: Remove Date Range and Day Rows from Details Table

**User Story:** As a parent, I want only essential information in the details table, so that the card is scannable and not cluttered with redundant data.

#### Acceptance Criteria

1. WHEN the Details_Table is rendered for a term class entry, THE Term_Card SHALL NOT render a detail row labelled "Dates" (previously "Term Period") displaying `dateRangeStr`.
2. WHEN the Details_Table is rendered for a term class entry, THE Term_Card SHALL NOT render a detail row labelled "Day" displaying `ts.dayOfWeek`.
3. THE `dateRangeStr` variable MAY still be computed but SHALL NOT be rendered anywhere in the term card DOM.

### Requirement 5: Add Individual Session Dates Row

**User Story:** As a parent, I want to see the exact dates of each session in the term, so that I can check my availability before booking.

#### Acceptance Criteria

1. WHEN `ts.schedule` is defined and contains one or more entries with `status === 'active'`, THE Details_Table SHALL display a row labelled "Sessions" as the first row in the table.
2. THE Session_Dates_Row SHALL list individual session dates (from entries where `s.status === 'active'`) as a comma-separated string formatted as "{day} {month}" (e.g. "5 Sept, 12 Sept, 19 Sept, 26 Sept") using `en-GB` locale with `day: 'numeric'` and `month: 'short'` options, ordered chronologically by date.
3. THE Session_Dates_Row SHALL exclude sessions where `s.status === 'skipped'` from the displayed list.
4. IF `ts.schedule` is undefined, or all entries in `ts.schedule` have `status === 'skipped'`, THEN THE Details_Table SHALL NOT render the Session_Dates_Row.
5. IF the comma-separated date string exceeds 60 characters in length, THEN THE Session_Dates_Row SHALL truncate the display after the last fully-visible date that fits within 60 characters and append "… +{n} more" where {n} is the count of remaining undisplayed active sessions.

### Requirement 6: Move Age Range to Card Heading

**User Story:** As a parent, I want to see the target age group prominently at the top of the card, so that I can quickly tell if the class is suitable for my child.

#### Acceptance Criteria

1. WHEN `ts.ageMin` and `ts.ageMax` are both non-null, THE Term_Card SHALL render a `<p>` subtitle element inside the `cardTitleBlock` div (directly below the `<h3>` class name), displaying "{ts.ageMin}–{ts.ageMax} yrs" using an en-dash (U+2013) separator, styled with the existing `styles.sessionSchedule` class.
2. THE Details_Table SHALL NOT render a separate age detail row — the age range SHALL appear only in the card heading subtitle.
3. IF either `ts.ageMin` or `ts.ageMax` is null, THEN THE Term_Card SHALL NOT render the age range subtitle.

### Requirement 7: Preserve Unchanged Elements

**User Story:** As a developer, I want the redesign to be scoped precisely to the term card layout changes, so that no other functionality is affected.

#### Acceptance Criteria

1. THE Term_Card SHALL NOT modify the single-session card rendered by the `sessions.map(...)` block in SessionBrowser.tsx (the block beginning with `sessions.length > 0 && (` and rendering individual per-date session cards).
2. THE Term_Card SHALL NOT introduce new CSS class names — only class names already defined in `SessionBrowser.module.css` and global utility classes defined in `globals.css` at the time the redesign begins SHALL be used.
3. THE Term_Card SHALL NOT modify the "See what they'll cook & learn" expandable section, the TermScheduleView component rendered within it, the "Book Now" button, or the "Book as a Guest" link.
4. THE Term_Card SHALL NOT modify routing logic, the `onBook` callback invocation, the booking flow, or the SessionBrowser component's Props interface (`onBook` and `showGuestOption`).
5. THE Term_Card SHALL NOT modify the filter controls, the view toggle (map/list), the BundleBrowser section, or the result count display.

### Requirement 8: Remove Category Row from Details Table

**User Story:** As a parent, I want only relevant scheduling information in the details table, so that I can focus on what matters for booking decisions.

#### Acceptance Criteria

1. WHEN the Details_Table is rendered for a term class entry, THE Term_Card SHALL NOT render a detail row labelled "Category" displaying `badge.displayName`.
2. The `badge` variable and `getClassTypeBadge` call MAY still be used elsewhere (e.g. for date badge colouring in single-session cards) but SHALL NOT produce a visible row in the term card's Details_Table.

### Requirement 9: Remove Date Badge from Card Header

**User Story:** As a parent, I want a cleaner card header that focuses on the class name and age suitability, without a redundant date indicator that duplicates information shown elsewhere.

#### Acceptance Criteria

1. WHEN a term card is rendered, THE `cardTop` div SHALL NOT contain the `dateBadge` div (the element that previously rendered the start date's day number and abbreviated month in a coloured square).
2. THE `cardTop` div SHALL contain only the `cardTitleBlock` div (holding the class name heading and age range subtitle).
3. THE `dateBadge` element SHALL be removed from the DOM entirely, not merely hidden.

### Requirement 10: Show Time as From–To Range

**User Story:** As a parent, I want to see both the start and end time of sessions, so that I can plan my schedule around drop-off and pick-up.

#### Acceptance Criteria

1. WHEN the Details_Table is rendered for a term class entry, THE "Time" detail row SHALL display a from–to time range in the format "{startHour}:{startMin} {AM/PM} – {endHour}:{endMin} {AM/PM}" (e.g. "11:00 AM – 12:30 PM").
2. THE start time SHALL be derived from `ts.startTime` (HH:MM string) using 12-hour format with AM/PM suffix.
3. THE end time SHALL be derived from `ts.endTime` (HH:MM string) using the same 12-hour format with AM/PM suffix.
4. THE en-dash separator " – " SHALL be used between start and end times.
