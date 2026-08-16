# Requirements Document

## Introduction

The single session booking card in SessionBrowser.tsx was simplified to reduce visual noise. Parents need to scan cards quickly and the previous card had a decorative date badge, a redundant stats strip, duplicate age information, and an unhelpful category label. This redesign consolidates key information into the heading subtitle and removes redundant elements, matching the clarity improvements made to the term card.

## Glossary

- **Single_Session_Card**: The card rendered in the `sessions.map(...)` block in `SessionBrowser.tsx` for non-term sessions (individual per-date session cards).
- **Stats_Strip**: The `statsStrip` div that previously contained four summary tiles (spaces available, day abbreviation, start time, duration).
- **Heading_Subtitle**: The `<p className={styles.sessionSchedule}>` element rendered below the class name `<h3>` inside `cardTitleBlock`, displaying consolidated day, time, and age information.
- **Details_Table**: The `<dl>` element within the Single_Session_Card that presents session metadata (first lesson, spaces, venue, instructor) in label–value rows.

## Requirements

### Requirement 1: Remove Date Badge from Card Header

**User Story:** As a parent, I want a cleaner card header that focuses on the class name and key details, without a redundant date indicator that duplicates information shown in the details table.

#### Acceptance Criteria

1. WHEN a single session card is rendered, THE `cardTop` div SHALL NOT contain the `dateBadge` div (the element that previously rendered the session date's day number and abbreviated month in a coloured square).
2. THE `cardTop` div SHALL contain only the `cardTitleBlock` div (holding the class name heading and heading subtitle).
3. THE `dateBadge` element SHALL be removed from the DOM entirely, not merely hidden.

### Requirement 2: Remove Stats Strip

**User Story:** As a parent, I want to see session information without decorative tiles that duplicate data already visible elsewhere on the card.

#### Acceptance Criteria

1. WHEN a single session card is rendered, THE Single_Session_Card SHALL NOT render the `statsStrip` div or any of its `statItem` children (spaces, day abbreviation, start time, duration tiles).
2. THE `statsStrip` element SHALL be removed from the DOM entirely, not merely hidden.
3. The information previously shown in the stats strip (day, time, duration, spaces) SHALL be communicated through the Heading_Subtitle and/or the Details_Table instead.

### Requirement 3: Add Heading Subtitle with Day, Time Range, and Age Range

**User Story:** As a parent, I want to see the day, time, and age suitability at a glance directly under the class name, so that I can quickly decide if a session fits my schedule and child.

#### Acceptance Criteria

1. WHEN a single session card is rendered, THE `cardTitleBlock` SHALL contain a Heading_Subtitle `<p className={styles.sessionSchedule}>` element directly below the class name `<h3>`.
2. THE Heading_Subtitle SHALL render its content wrapped in a `<strong>` element for bold display.
3. THE Heading_Subtitle text SHALL always contain `"{dayFull} · {startTime} – {endTime}"` where `dayFull` is the full weekday name (e.g. "Monday"), and the time range uses 12-hour format with AM/PM.
4. WHEN `s.ageMin` and `s.ageMax` are both non-null, THE Heading_Subtitle text SHALL append ` · {ageMin}–{ageMax} yrs` after the time range (using an en-dash U+2013 between the age values).
5. WHEN either `s.ageMin` or `s.ageMax` is null, THE Heading_Subtitle SHALL NOT include the age range portion.
6. THE middle dot separator `·` (U+00B7) SHALL be used between the day, time range, and age range segments.

### Requirement 4: Show Time as From–To Range

**User Story:** As a parent, I want to see both the start and end time of a session, so that I can plan drop-off and pick-up.

#### Acceptance Criteria

1. THE time portion of the Heading_Subtitle SHALL display both start and end time in the format `"{H}:{MM} {AM/PM} – {H}:{MM} {AM/PM}"` (e.g. "10:00 AM – 11:30 AM") using 12-hour clock format.
2. THE start time SHALL be derived from `s.startTime` (HH:MM string) by parsing hours and minutes, computing 12-hour format and AM/PM suffix.
3. THE end time SHALL be derived from `s.endTime` (HH:MM string) using the same parsing logic as the start time.
4. THE en-dash separator ` – ` SHALL be used between start and end times.

### Requirement 5: Remove Category Row from Details Table

**User Story:** As a parent, I want only actionable information in the details table, so that I can focus on logistics like date, venue, and availability.

#### Acceptance Criteria

1. WHEN the Details_Table is rendered for a single session card, THE Single_Session_Card SHALL NOT render a detail row labelled "Category" displaying `badge.displayName`.
2. THE `badge` variable and `getClassTypeBadge` call MAY still be computed but SHALL NOT produce a visible row in the Single_Session_Card's Details_Table.

### Requirement 6: Remove Minimum Age and Maximum Age Rows from Details Table

**User Story:** As a parent, I want to see the age range as a single readable value rather than two separate threshold rows, so that I can instantly tell if my child is eligible.

#### Acceptance Criteria

1. WHEN the Details_Table is rendered for a single session card, THE Single_Session_Card SHALL NOT render a detail row labelled "Minimum Age".
2. WHEN the Details_Table is rendered for a single session card, THE Single_Session_Card SHALL NOT render a detail row labelled "Maximum Age".
3. Age range information SHALL be communicated exclusively through the Heading_Subtitle (per Requirement 3).

### Requirement 7: Preserve Unchanged Elements

**User Story:** As a developer, I want the redesign to be scoped precisely to the single session card layout changes, so that no other functionality is affected.

#### Acceptance Criteria

1. THE Single_Session_Card SHALL NOT modify the "First Lesson" detail row, the "Spaces Available" detail row, the Venue detail row, or the Instructor detail row — these SHALL continue to render with their existing labels and values.
2. THE Single_Session_Card SHALL NOT modify the price row ("Cost per session from") or its displayed value.
3. THE Single_Session_Card SHALL NOT modify the "View Recipe" expandable section or the recipe content rendered within it.
4. THE Single_Session_Card SHALL NOT modify the "Book Now" button, the "Book as a Guest" link, or the low-spots warning message.
5. THE Single_Session_Card SHALL NOT modify the term session card rendered by the `termSessions.map(...)` block.
6. THE Single_Session_Card SHALL NOT modify filter controls, the view toggle (map/list), the BundleBrowser section, the result count display, or the SessionBrowser component's Props interface.
7. THE Single_Session_Card SHALL NOT introduce new CSS class names — only class names already defined in `SessionBrowser.module.css` and global utility classes defined in `globals.css` SHALL be used.
