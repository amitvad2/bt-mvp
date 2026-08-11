# Requirements Document

## Introduction

This feature introduces a "term" session type to Blooming Tastebuds, replacing the tedious process of creating individual session documents for every date in a term. A single term session document represents an entire term (e.g. a 12-week After School Club run), with an embedded date-wise recipe schedule. Parents book the term as a whole, and the public "View Schedule" page displays the full recipe plan for the term.

The existing per-session model remains unchanged for ad-hoc or one-off classes. This feature adds an alternative workflow specifically for recurring term-based programmes.

## Glossary

- **Term_Session**: A Firestore document in the `sessions` collection with `sessionType: 'term'` that represents an entire term of recurring classes rather than a single date. Contains an embedded schedule of dates and recipes.
- **Schedule_Entry**: A single date-recipe pair within a Term_Session's embedded schedule array. Each entry specifies which recipe is taught on which date.
- **Session_Type**: A discriminator field (`'single' | 'term'`) on session documents distinguishing traditional per-date sessions from term sessions.
- **Admin_Panel**: The authenticated admin interface at `/admin/*` used by Blooming Tastebuds staff to manage classes, sessions, recipes, and bookings.
- **Term_Schedule**: The ordered array of Schedule_Entry objects embedded within a Term_Session document, representing the full term recipe plan.
- **Public_Schedule_Page**: The public-facing page (or section) that displays the term's date-wise recipe plan to parents before booking.
- **Booking_Wizard**: The multi-step authenticated flow at `/book/[sessionId]/*` that collects student, medical, and payment information.
- **Spots_Available**: An integer field on the Term_Session tracking remaining capacity for the entire term. Decremented once per booking (not per date).
- **Stripe_Webhook**: The `payment_intent.succeeded` event handler that authoritatively creates booking documents and decrements capacity.
- **Recipe**: A document in the `recipes` collection containing name, description, photo URL, and skills metadata.

## Requirements

### Requirement 1: Term Session Creation

**User Story:** As an admin, I want to create a single term session document with start date, end date, and day of week, so that I do not need to manually create individual session documents for every date in the term.

#### Acceptance Criteria

1. WHEN an admin selects session type "term" in the Admin_Panel session creation form, THE Admin_Panel SHALL display fields for term start date, term end date, day of week, spots total, and price (in pence).
2. WHEN an admin submits a valid term session creation form, THE Admin_Panel SHALL create a single Term_Session document in the `sessions` collection with `sessionType: 'term'`, the specified class reference, venue, instructor, time range, age range, and capacity.
3. WHEN the Term_Session document is created, THE Admin_Panel SHALL auto-generate the Term_Schedule as an ordered array of Schedule_Entry objects — one for each occurrence of the selected day of week between the start date and end date (inclusive).
4. THE Admin_Panel SHALL initialise each auto-generated Schedule_Entry with the date field populated and the recipeId and recipeName fields set to empty (unassigned).
5. IF the admin submits a term session form where the end date is before or equal to the start date, THEN THE Admin_Panel SHALL display a validation error and prevent submission.
6. IF the admin submits a term session form where the selected day of week does not occur between the start and end dates, THEN THE Admin_Panel SHALL display a validation error and prevent submission.

### Requirement 2: Date-wise Recipe Assignment

**User Story:** As an admin, I want to assign recipes to specific dates within a term session, so that parents can see which recipe their child will learn each week.

#### Acceptance Criteria

1. WHEN an admin opens a Term_Session for editing, THE Admin_Panel SHALL display the Term_Schedule as an ordered list of dates with their current recipe assignments.
2. WHEN an admin selects a recipe for a specific Schedule_Entry date, THE Admin_Panel SHALL update that Schedule_Entry's recipeId, recipeName, and recipePhotoUrl fields from the selected Recipe document.
3. THE Admin_Panel SHALL allow the admin to assign recipes to Schedule_Entry dates in any order (not required to be sequential).
4. WHEN an admin clears the recipe assignment from a Schedule_Entry, THE Admin_Panel SHALL set recipeId, recipeName, and recipePhotoUrl to empty on that entry.
5. THE Admin_Panel SHALL persist recipe assignment changes to the Term_Session document in Firestore immediately upon selection (auto-save per entry).

### Requirement 3: Term Schedule Management

**User Story:** As an admin, I want to add, remove, or skip specific dates within a term schedule, so that I can handle school holidays or exceptional closures.

#### Acceptance Criteria

1. WHEN an admin marks a Schedule_Entry date as "skipped", THE Admin_Panel SHALL set a `status` field on that entry to `'skipped'` and exclude it from the active schedule count.
2. WHEN an admin adds a make-up date to the Term_Schedule, THE Admin_Panel SHALL insert a new Schedule_Entry at the correct chronological position within the schedule array.
3. THE Admin_Panel SHALL display skipped dates visually distinct from active dates in the schedule list.
4. THE Admin_Panel SHALL recalculate the total number of active sessions (excluding skipped) and display it to the admin.

### Requirement 4: Public Term Schedule Display

**User Story:** As a parent, I want to view the full term schedule (dates and recipes) on the public site, so that I can see what my child will be cooking each week before I book.

#### Acceptance Criteria

1. WHEN a parent navigates to the public classes listing page and a Term_Session has status `'open'`, THE Public_Schedule_Page SHALL display the term session with its date range, price, and spots available.
2. WHEN a parent selects a Term_Session to view details, THE Public_Schedule_Page SHALL display the full Term_Schedule showing each active date, recipe name, and recipe photo (where assigned).
3. THE Public_Schedule_Page SHALL exclude Schedule_Entry items with status `'skipped'` from the displayed schedule.
4. WHEN a Schedule_Entry has no recipe assigned, THE Public_Schedule_Page SHALL display "Recipe to be announced" for that date.
5. THE Public_Schedule_Page SHALL display the total number of active sessions in the term alongside the term price.

### Requirement 5: Term Booking Flow

**User Story:** As a parent, I want to book the entire term as a single transaction, so that I secure my child's place for all sessions without booking each week individually.

#### Acceptance Criteria

1. WHEN a parent initiates booking on a Term_Session, THE Booking_Wizard SHALL use the Term_Session's price as the payment amount (read server-side from Firestore, not client-supplied).
2. THE Booking_Wizard SHALL follow the same step sequence as per-session bookings: student selection, medical info, dietary questionnaire (if applicable), terms acceptance, and payment.
3. WHEN the Stripe_Webhook receives `payment_intent.succeeded` for a term booking, THE Stripe_Webhook SHALL create a single Booking document with `bookingType: 'term'` and a reference to the Term_Session ID.
4. WHEN the Stripe_Webhook creates a term booking, THE Stripe_Webhook SHALL decrement `spotsAvailable` on the Term_Session document by 1 within a Firestore transaction.
5. IF Spots_Available on the Term_Session is less than or equal to 0 at webhook processing time, THEN THE Stripe_Webhook SHALL create the booking with `overbooking: true` for manual admin review.
6. THE Booking_Wizard SHALL display the term date range and total price on the payment step to confirm what the parent is booking.

### Requirement 6: Term Session Status Management

**User Story:** As an admin, I want to control the visibility and availability of term sessions, so that I can prepare a term session before making it available for booking.

#### Acceptance Criteria

1. THE Admin_Panel SHALL support the following statuses for Term_Session: `'draft'`, `'open'`, `'full'`, `'closed'`, and `'cancelled'`.
2. WHILE a Term_Session has status `'draft'`, THE Public_Schedule_Page SHALL NOT display the term session to parents.
3. WHEN Spots_Available reaches 0 on a Term_Session, THE Stripe_Webhook SHALL automatically update the Term_Session status to `'full'`.
4. WHEN an admin changes a Term_Session status to `'cancelled'`, THE Admin_Panel SHALL prevent new bookings against that term session.
5. THE Admin_Panel SHALL allow an admin to manually transition a Term_Session between statuses (draft → open, open → closed, etc.).

### Requirement 7: Term Booking Display in Portal

**User Story:** As a parent, I want to see my term bookings in my portal with the full schedule, so that I can reference upcoming dates and recipes.

#### Acceptance Criteria

1. WHEN a parent views "My Classes" in the portal, THE Portal SHALL display term bookings with the class name, term date range, and a "View Schedule" action.
2. WHEN a parent selects "View Schedule" on a term booking, THE Portal SHALL display the full Term_Schedule from the associated Term_Session document showing dates, recipe names, and recipe photos.
3. THE Portal SHALL visually distinguish term bookings from per-session bookings in the "My Classes" list (using a badge or label indicating "Term").
4. THE Portal SHALL display the next upcoming session date from the Term_Schedule for each active term booking.

### Requirement 8: Integration with Existing Payment Flow

**User Story:** As a developer, I want the term booking payment to use the existing Stripe integration patterns, so that payment handling remains consistent and secure.

#### Acceptance Criteria

1. WHEN the `create-intent` API route receives a term booking request, THE API SHALL read the Term_Session's price field from Firestore server-side to set the PaymentIntent amount.
2. THE API SHALL store the booking draft in `booking_drafts` with a `bookingType: 'term'` field and the Term_Session ID.
3. WHEN the Stripe_Webhook processes a term booking draft, THE Stripe_Webhook SHALL use the same idempotency pattern (booking doc ID = PaymentIntent ID) as per-session bookings.
4. THE Stripe_Webhook SHALL send a booking confirmation email for term bookings that includes the term date range and class name.

### Requirement 9: Backward Compatibility

**User Story:** As an admin, I want existing per-session workflows to remain unchanged, so that the term session feature does not break the current booking system.

#### Acceptance Criteria

1. THE Admin_Panel SHALL continue to support creating single-date sessions (with `sessionType: 'single'` or absent/undefined for backward compatibility).
2. THE Public_Schedule_Page SHALL display both single sessions and term sessions, clearly distinguishing between them.
3. THE Booking_Wizard SHALL handle both per-session bookings and term bookings using the same URL structure (`/book/[sessionId]/*`), routing logic based on the session's `sessionType` field.
4. WHEN a session document has no `sessionType` field, THE system SHALL treat the session as a single-date session (backward compatible default).
