# Requirements Document

## Introduction

Recurring Term / Programme Classes extends the existing `classes` collection by using the `commitment: 'term'` option alongside the current `commitment: 'perSession'` value. A Term / Programme Class is a multi-session class offering where a participant pays one fixed package price to attend all included sessions within a defined programme period.

A programme may be:
- **Recurring on selected weekdays** — e.g. "Every Monday & Wednesday, 6 Jan – 28 Mar 2025"
- **Consecutive over several days** — e.g. "5-Day Holiday Workshop, 24–28 August 2025"
- **Composed of explicitly created session dates** — e.g. irregular dates chosen by Admin

This feature reuses the existing `classes`, `sessions`, and `bookings` Firestore collections — no new collections are introduced. Sessions are created under programme classes for operational purposes (recipe planning, skills tracking, attendance register, instructor assignment), but they are not individually bookable. The booking and payment flow diverges based on the `commitment` field: per-session classes work exactly as before, while programme classes use a single payment covering the entire programme period.

Existing sessions remain the operational units for:
- Recipes and recipe photos
- Skills / learning outcomes
- Attendance and participant register
- Instructor planning
- Date/time delivery

## Glossary

- **BTClass**: An existing document in the `classes` Firestore collection. Extended with a `commitment` field that can be `'perSession'` or `'term'`.
- **Term_Class** (Programme Class): A BTClass document where `commitment` equals `'term'`. It represents a multi-session programme sold as one package. It may represent a weekly recurring term, a consecutive-day holiday workshop, or another fixed programme.
- **Programme_Session**: A normal existing `sessions` document that belongs to a Term_Class. Each session represents one actual delivery date. It may contain: date, time, recipe, recipe photo, skills/learning outcomes, instructor, and venue.
- **Recurrence_Days**: An optional array of day-of-week strings (e.g. `['Monday', 'Wednesday', 'Friday']`) stored on a Term_Class. Useful for recurring schedule generation and display. Not the sole source of truth for actual session dates — where child sessions exist, the actual sessions define the operational schedule.
- **Term_Period**: The `termStartDate` and `termEndDate` fields on a Term_Class that define the date range of the programme.
- **Term_Price** (Programme Price): A price in pence stored as `termPrice` on the BTClass document, representing the single fixed cost for the entire programme (all sessions included). For example, `termPrice: 6000` means £60.00 for the complete programme, not £60 per session.
- **Term_Booking** (Programme Booking): A booking document in the existing `bookings` collection where `bookingType` equals `'term'`. It references a `classId` rather than a single `sessionId` and grants the participant access to all sessions within the programme period.
- **Spots_Available**: For programme classes, a `spotsAvailable` field on the BTClass document itself (distinct from per-session spot tracking on individual session documents). Decremented by one per participant booking.
- **Admin_Panel**: The admin interface at `/admin/*` used by Blooming Tastebuds staff to manage the platform.
- **Booking_Wizard**: The multi-step checkout flow used by authenticated parents and young adults to complete a programme booking.
- **Public_Classes_Page**: The public-facing classes listing at `/classes` and the portal's Find a Class page.
- **Portal**: The authenticated user area at `/portal/*`.
- **Programme_Schedule**: The ordered list of sessions within a Term_Class showing the date, recipe name, recipe photo, and skills/learning outcomes for each session day — displayed publicly on the programme detail view so participants can see what will be taught.
- **Session_Register**: The admin attendance register for a specific child session, showing all confirmed participants enrolled in the parent programme regardless of how they booked (authenticated, guest, or social-channel origin).
- **Skills**: An optional array of strings (e.g. `['chopping', 'mixing', 'creative plating']`) stored on a Programme_Session representing the learning outcomes or culinary skills taught in that session.

## Requirements

### Requirement 1: Extend Class Creation with Programme Commitment

**User Story:** As an admin, I want to create a multi-session programme class that supports both recurring weekly schedules and consecutive/explicit date ranges, so that I can offer school-term classes and holiday workshops using the same feature.

#### Acceptance Criteria

1. WHEN the admin creates or edits a class, THE Admin_Panel SHALL display a commitment selector with options "Per Session" and "Term / Programme".
2. WHEN the admin selects "Term / Programme" as the commitment, THE Admin_Panel SHALL display additional fields for: termStartDate, termEndDate, termPrice (in pence), and optionally recurrenceDays (multi-select of Monday through Sunday).
3. WHEN the admin selects "Per Session" as the commitment, THE Admin_Panel SHALL hide all programme-specific fields and display only the existing per-session class fields.
4. WHEN the admin submits a valid programme class form, THE Admin_Panel SHALL save the BTClass document to the `classes` collection with `commitment: 'term'`, the programme-specific fields, and `spotsAvailable` set equal to `maxSize`.
5. IF the termEndDate is on or before the termStartDate, THEN THE Admin_Panel SHALL display a validation error and prevent submission.
6. IF the termPrice is zero or negative, THEN THE Admin_Panel SHALL display a validation error and prevent submission.
7. recurrenceDays SHALL be optional for programme classes. It is required only when the programme uses a recurring weekly schedule. For consecutive-day or explicit-date programmes, Admin may leave recurrenceDays empty and create child sessions manually.
8. THE Admin_Panel SHALL continue to save per-session classes exactly as before with `commitment: 'perSession'` and no programme-specific fields.
9. THE termPrice field SHALL represent the total package price for the complete programme (all sessions), not a per-session price. The UI label SHALL clearly indicate this (e.g. "Package Price for Full Programme").

### Requirement 2: Sessions Under Programme Classes

**User Story:** As an admin, I want to create sessions under programme classes for recipe planning, skills tracking, and operational delivery, so that I can assign recipes, skills, and photos to specific days and make this schedule visible to participants on the public programme detail page.

#### Acceptance Criteria

1. THE Admin_Panel SHALL allow sessions to be created under a Term_Class using the existing sessions management page, following the same process as per-session classes.
2. WHEN a session belongs to a Term_Class (the parent class has `commitment: 'term'`), THE System SHALL mark that session as not individually bookable.
3. THE Public_Classes_Page SHALL NOT display individual sessions belonging to a Term_Class as separately bookable items.
4. THE Booking_Wizard SHALL NOT allow navigation to `/book/[sessionId]` for sessions that belong to a Term_Class.
5. WHEN displaying sessions under a Term_Class in the Admin_Panel, THE Admin_Panel SHALL show the recipe assignment, recipe photo, skills/learning outcomes, and date for operational planning purposes.
6. WHEN a session under a Term_Class has a recipe assigned, THE System SHALL store the recipeId, recipeName, and recipePhotoUrl on the session document so that the programme schedule is available for public display.
7. Sessions under a Term_Class MAY store an optional `skills` field (array of strings) representing the learning outcomes or culinary skills taught in that session.
8. THE Admin_Panel SHALL provide a UI to add, edit, and remove skills/learning outcomes for each session under a Term_Class.
9. Child sessions under a Term_Class SHALL be the authoritative operational schedule. Where child sessions exist, they define the actual delivery dates regardless of recurrenceDays.
10. Child sessions MAY optionally override the class-level default start time and end time for individual session dates.

### Requirement 3: Display Programme Classes on Public Site

**User Story:** As a parent or young adult, I want to see available programme classes on the public site with a clear package price and schedule, so that I can understand the offering and decide to enrol.

#### Acceptance Criteria

1. WHEN a Term_Class has `spotsAvailable` greater than zero and the current date is on or before the termEndDate, THE Public_Classes_Page SHALL display the Term_Class with its name, schedule description, termStartDate, termEndDate, time slot, venue, and termPrice.
2. THE Public_Classes_Page SHALL visually distinguish programme offerings from per-session offerings using a "Term" badge or label.
3. WHEN displaying a Term_Class, THE Public_Classes_Page SHALL format the termPrice as a single amount for the programme (e.g. "£60.00 for the programme" or "£120.00 for the term").
4. WHEN a Term_Class has recurrenceDays populated, THE Public_Classes_Page SHALL display them as a human-readable schedule description (e.g. "Every Mon, Wed, Fri").
5. WHEN a Term_Class has recurrenceDays empty or absent AND child sessions exist, THE Public_Classes_Page SHALL display the programme period and session count instead (e.g. "5-Day Workshop, 24–28 Aug 2025").
6. WHEN a Term_Class has `spotsAvailable` equal to zero, THE Public_Classes_Page SHALL display the class as "Full" and disable the booking action.

### Requirement 4: Book a Programme Class

**User Story:** As a parent, I want to book my child into a programme class with a single payment covering the whole programme, so that my child can attend every scheduled session without rebooking each day.

#### Acceptance Criteria

1. WHEN a user selects a Term_Class to book, THE Booking_Wizard SHALL use the termPrice from the BTClass document as the payment amount for the Stripe PaymentIntent.
2. WHEN payment succeeds via the Stripe webhook, THE System SHALL create a single booking document in the `bookings` collection with `bookingType: 'term'` and a `classId` referencing the Term_Class.
3. THE Term_Booking document SHALL include the classId, className, recurrenceDays (if applicable), termStartDate, termEndDate, venueName, bookedByUid (if authenticated), studentId (if applicable), studentName, and the payment details.
4. WHEN payment succeeds, THE System SHALL decrement the `spotsAvailable` count on the BTClass document by one within a Firestore transaction.
5. THE System SHALL NOT create individual booking documents for each session day within the programme — one booking document covers the entire programme.
6. WHEN the `booking_drafts` document is created for a programme booking, THE System SHALL store `bookingType: 'term'` and `classId` in the draft so the webhook can distinguish programme bookings from per-session bookings.
7. A participant booking a multi-session programme (e.g. a 5-day holiday workshop) SHALL pay once and be enrolled for all sessions in the programme through a single checkout flow.

### Requirement 5: Programme Bookings in the User Portal

**User Story:** As a parent, I want to see my child's programme enrolment in the portal with the full schedule, so that I know which days the child attends.

#### Acceptance Criteria

1. WHEN a user has active programme bookings, THE Portal SHALL display each Term_Booking in the "My Classes" section showing the programme name, date range, session count, schedule description, time slot, and venue.
2. THE Portal SHALL display the programme schedule derived from recurrenceDays and the class time slot (for recurring programmes) or from the actual child sessions (for consecutive/explicit programmes).
3. WHEN a user cancels a Term_Booking from the portal, THE System SHALL update the booking status to "cancelled", increment `spotsAvailable` on the BTClass document by one, and send a cancellation confirmation email via the existing email API.
4. IF a programme booking originated from guest checkout, no portal display is required unless/until that guest creates an account and the booking is linked.

### Requirement 6: Programme Bookings in Admin

**User Story:** As an admin, I want to view and manage programme bookings and see enrolled participants alongside their session details, so that I can see all enrolments in one place and plan operational delivery.

#### Acceptance Criteria

1. THE Admin_Panel SHALL display programme bookings in the existing bookings management page, identifiable by a "Term" label or badge.
2. WHEN an admin views a Term_Class in the classes page, THE Admin_Panel SHALL display the current `spotsAvailable` count and a list of students enrolled via programme bookings.
3. WHEN an admin cancels a Term_Booking, THE Admin_Panel SHALL update the booking status to "cancelled" and increment `spotsAvailable` on the BTClass document by one.
4. THE Admin_Panel SHALL allow Admin to see all child sessions under a programme class with recipe, recipe photo, skills/learning outcomes, and date for each session.
5. THE Admin_Panel SHALL allow Admin to open the Session Register for each child session belonging to a programme class.

### Requirement 7: Programme Auto-Close

**User Story:** As an admin, I want programme classes to automatically stop appearing as bookable once the programme end date has passed, so that participants cannot book into an expired programme.

#### Acceptance Criteria

1. WHEN the current date is past the termEndDate of a Term_Class, THE Public_Classes_Page SHALL exclude that Term_Class from listings available for booking.
2. WHEN the current date is past the termEndDate of a Term_Class, THE Booking_Wizard SHALL reject booking attempts for that class.
3. WHILE a Term_Class has `spotsAvailable` greater than zero and the current date is on or before the termEndDate, THE Public_Classes_Page SHALL display the Term_Class as available for booking.
4. Child sessions with dates in the past SHALL no longer be treated as future operational sessions in admin views.

### Requirement 8: Programme Booking Confirmation Email

**User Story:** As a parent, I want to receive a confirmation email after booking a programme class that includes the complete session schedule, so that I have a clear record of all attendance days.

#### Acceptance Criteria

1. WHEN a Term_Booking is created successfully via the Stripe webhook, THE System SHALL send a booking confirmation email containing the programme name, date range, time slot, venue, and payment amount.
2. THE confirmation email SHALL include the complete session schedule listing each session date and recipe (e.g. "Monday 24 August — Rainbow Fruit Salad, Tuesday 25 August — Colourful Pasta Salad").
3. THE confirmation email SHALL use the same email sending mechanism (Resend via the webhook handler) as existing per-session booking confirmations.
4. THE System SHALL NOT send separate confirmation emails for each child session — one email per programme booking.

### Requirement 9: Backward Compatibility

**User Story:** As a user of the existing system, I want per-session classes and bookings to continue working exactly as before, so that the programme feature does not disrupt existing functionality.

#### Acceptance Criteria

1. THE System SHALL treat all existing classes with `commitment: 'perSession'` identically to how they functioned before this feature — no changes to per-session booking, payment, display, or cancellation flows.
2. THE Booking_Wizard SHALL continue to use the session-level price and create per-session booking documents for classes with `commitment: 'perSession'`.
3. THE Public_Classes_Page SHALL continue to display individual sessions as bookable items for per-session classes.
4. THE existing `bookings` collection documents without a `bookingType` field SHALL be treated as per-session bookings by default.
5. Existing Term_Class documents with populated `recurrenceDays` SHALL continue to function unchanged.
6. Existing Term_Booking documents SHALL remain valid without any destructive migration.
7. Existing documents without the new optional fields (e.g. `skills`) SHALL remain valid.
8. No breaking change to persisted `commitment: 'term'` value is required — the value continues to represent the multi-session package model.

### Requirement 10: Programme Schedule Display

**User Story:** As a parent, I want to view the full programme schedule with recipes, photos, and skills when I select a programme class on the public site, so that I can see exactly what my child will learn on each day and make an informed decision before booking.

#### Acceptance Criteria

1. WHEN an admin assigns a recipe to a session under a Term_Class, THE Admin_Panel SHALL store the recipe name, recipe ID, and recipe photo URL on the session document.
2. WHEN a participant selects a Term_Class from the Public_Classes_Page to view details, THE programme detail view SHALL display the Programme_Schedule showing: date, recipe name, recipe photo, and skills/learning outcomes for each session day within the programme period.
3. THE programme detail view SHALL present the Programme_Schedule in chronological order by session date.
4. WHEN a session under a Term_Class does not yet have a recipe assigned, THE programme detail view SHALL display that session date with a placeholder indicating the recipe is "To be announced".
5. THE programme detail view SHALL display recipe photos at a consistent size with appropriate alt text for accessibility.
6. WHEN the admin updates the recipe assignment, photo, or skills for a session under a Term_Class, THE programme detail view SHALL reflect the updated information on the next page load.
7. THE programme detail view SHALL also display the programme name, date range, time slot, venue, termPrice, and a booking action alongside the Programme_Schedule.
8. WHEN a session has skills/learning outcomes assigned, THE programme detail view SHALL display them for that session. WHEN skills are not assigned, the display SHALL omit them rather than showing a placeholder.
9. THE programme detail view SHALL display session-specific start/end times where they differ from the programme default.

### Requirement 11: Flexible Programme Scheduling

**User Story:** As an admin, I want a multi-session programme to support recurring, consecutive, or explicitly created session dates so that I can run school-term classes and holiday workshops using the same feature.

#### Acceptance Criteria

1. A Term_Class SHALL be able to contain child sessions on consecutive dates (e.g. Monday through Friday of the same week).
2. A Term_Class SHALL be able to contain child sessions on recurring weekdays (e.g. every Monday & Wednesday over several weeks).
3. The operational schedule SHALL be derived from actual session documents where sessions exist.
4. recurrenceDays SHALL NOT be the sole source of truth for actual attendance dates — it is a display/generation aid.
5. Child sessions MAY override the class-level default time with session-specific start and end times.
6. Child sessions MAY have different recipes.
7. Child sessions MAY have different skills/learning outcomes.
8. Existing recurring term classes with populated recurrenceDays SHALL continue to function unchanged.
9. Admin SHALL NOT be required to enter recurrenceDays for programmes that use consecutive or explicitly created session dates.

### Requirement 12: Single Package Enrolment

**User Story:** As a parent, I want one purchase to enrol my child into the entire programme so that I don't have to book and pay for each day separately.

#### Acceptance Criteria

1. One successful Term_Booking SHALL represent enrolment in every child session belonging to the programme.
2. The system SHALL NOT create a separate paid booking per child session.
3. Programme capacity (spotsAvailable) SHALL decrease by exactly one per participant booking.
4. Session Register logic SHALL be able to resolve programme participants for each child session by querying bookings with matching `classId` and `bookingType: 'term'`.
5. The participant's medical, dietary, and emergency-contact snapshot SHALL be available for every child session register where the booking contains this information.

### Requirement 13: Guest Programme Checkout

**User Story:** As a parent who does not have an account, I want to book my child into a programme class through guest checkout, so that I can complete the booking without creating an account first.

#### Acceptance Criteria

1. THE System SHALL support guest checkout for Term / Programme bookings, following the same pattern as existing guest per-session checkout.
2. A guest programme booking SHALL NOT require a `bookedByUid`, Firebase `users/{uid}` record, or `students/{studentId}` record.
3. THE guest programme booking document SHALL contain sufficient participant, purchaser, medical, dietary, and emergency-contact data to support: confirmation email, admin display, session register, and participant safety reporting.
4. THE guest programme booking SHALL decrement `spotsAvailable` on the BTClass document by one, identical to authenticated programme bookings.
5. Guest programme bookings SHALL appear in the Admin bookings list and Session Register alongside authenticated bookings.
6. THE System SHALL support programme bookings originating from social channels (WhatsApp, Instagram, Facebook/Messenger) using the same guest booking model.

### Requirement 14: Session Register Programme Participant Resolution

**User Story:** As an admin, I want the Session Register for any programme session to show all enrolled participants regardless of how they booked, so that I can manage attendance and safety for each day of the programme.

#### Acceptance Criteria

1. FOR any child session belonging to a Term_Class, THE Session Register SHALL include all confirmed participants enrolled in the parent programme.
2. THE Session Register SHALL resolve programme participants by querying bookings where `classId` matches the session's parent class AND `bookingType === 'term'` AND `status === 'confirmed'`.
3. THE Session Register SHALL NOT depend on `bookedByUid` being present — guest and social-origin bookings SHALL appear alongside authenticated bookings.
4. THE Session Register SHALL display participant medical information, dietary requirements, and emergency contact details from the booking snapshot where available.
5. THE Session Register SHALL work for bookings created through: authenticated checkout, guest checkout, WhatsApp-originated guest checkout, Instagram-originated guest checkout, and Facebook/Messenger-originated guest checkout.
