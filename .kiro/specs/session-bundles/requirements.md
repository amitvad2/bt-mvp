# Requirements Document

## Introduction

Session Bundles allow administrators to group multiple related sessions (e.g. every Saturday for a month) into a single bookable package. Users can book the entire bundle in one transaction at a discounted price, while individual sessions within the bundle remain independently bookable. This feature streamlines the booking experience for recurring attendees and provides a pricing incentive for commitment.

## Glossary

- **Bundle**: A named grouping of two or more sessions from the same class that can be booked together in a single transaction
- **Bundle_Price**: The total price in pence for booking all sessions in a bundle, which is less than or equal to the sum of individual session prices
- **Session**: An individual dated class instance stored in the `sessions` Firestore collection
- **Admin_Panel**: The administrative interface at `/admin/*` used to manage all platform content
- **Booking_Wizard**: The 6-step flow at `/book/[sessionId]/` that guides users through booking a session
- **Bundle_Booking**: A set of individual booking documents created atomically when a user purchases a bundle
- **Spots_Available**: The integer count of remaining places on a session
- **Stripe_Webhook**: The server-side handler that processes `payment_intent.succeeded` events and creates booking documents
- **Bundle_Browser**: The public-facing UI component that displays available bundles alongside individual sessions

## Requirements

### Requirement 1: Bundle Creation by Admin

**User Story:** As an admin, I want to create a bundle by selecting multiple sessions from the same class, so that I can offer grouped bookings to users.

#### Acceptance Criteria

1. THE Admin_Panel SHALL provide a bundle management page at `/admin/bundles` for creating, editing, and deleting bundles
2. WHEN an admin creates a bundle, THE Admin_Panel SHALL require a bundle name between 3 and 100 characters, a selection of two to 20 sessions from the same class, and a bundle price in pence
3. WHEN an admin selects sessions for a bundle, THE Admin_Panel SHALL only display sessions with status `open` that belong to the same `classId`
4. THE Admin_Panel SHALL validate that the Bundle_Price is greater than zero and less than or equal to the sum of the individual session prices, and that the bundle name is not empty and does not exceed 100 characters
5. IF bundle validation fails, THEN THE Admin_Panel SHALL display an inline error message indicating which field failed validation and SHALL NOT save the bundle
6. WHEN a bundle is saved, THE Admin_Panel SHALL store the bundle document in a `bundles` Firestore collection with fields: id, name, classId, className, classType, sessionIds, bundlePrice, totalIndividualPrice, status (one of `active`, `inactive`), venueId, venueName, createdAt
7. WHEN an admin deletes a bundle, THE Admin_Panel SHALL remove the bundle document from the `bundles` Firestore collection and no longer display it on the bundle management page

### Requirement 2: Bundle Display on Public Site

**User Story:** As a user browsing classes, I want to see available bundles alongside individual sessions, so that I can choose whether to book a single session or a discounted package.

#### Acceptance Criteria

1. WHEN sessions are displayed on the public classes page or portal find-class page, THE Bundle_Browser SHALL show available bundles as distinct cards with a "Bundle" badge, positioned above the individual session listings
2. THE Bundle_Browser SHALL display the bundle name, number of sessions included, the bundle price in pounds (formatted as £X.XX), and the per-session saving displayed as an absolute amount in pounds (calculated as: (sum of individual session prices minus bundle price) divided by number of sessions)
3. WHEN a bundle contains one or more sessions with zero Spots_Available but at least one session with Spots_Available greater than zero, THE Bundle_Browser SHALL display that bundle with a "Limited Availability" indicator
4. WHEN all sessions in a bundle have zero Spots_Available, THE Bundle_Browser SHALL display that bundle with status "Full" and SHALL disable the bundle booking action
5. THE Bundle_Browser SHALL display the dates of all sessions included in the bundle in chronological order using the format "ddd DD MMM YYYY" (e.g., "Sat 15 Mar 2025")
6. WHEN a user selects a bundle card, THE Bundle_Browser SHALL navigate the user to the booking wizard for that bundle, passing the bundle identifier as a route parameter

### Requirement 3: Bundle Booking Flow

**User Story:** As a user, I want to book all sessions in a bundle through a single booking wizard flow, so that I only need to complete the process once and make one payment.

#### Acceptance Criteria

1. WHEN a user selects a bundle to book, THE Booking_Wizard SHALL navigate to `/book/bundle/[bundleId]/student`
2. THE Booking_Wizard SHALL follow the same 6-step flow (student → medical → questionnaire → terms → payment → confirmation) for bundle bookings as for individual session bookings, applying the same conditional logic per class type (e.g., skipping the questionnaire step for youngAdultWeekend bundles)
3. WHEN the user reaches the payment step, THE Booking_Wizard SHALL display the Bundle_Price (the pre-defined price stored on the bundle entity, in pence) as the total amount to pay
4. WHEN the user reaches the confirmation step, THE Booking_Wizard SHALL display all session dates included in the bundle booking, listed in chronological order with each entry showing the date (formatted as DD MMM YYYY) and session time
5. IF any session within the bundle has zero spots available at the time the user initiates the booking wizard, THEN THE Booking_Wizard SHALL display an error message indicating which session dates are fully booked and SHALL prevent the user from proceeding to the payment step
6. WHEN payment succeeds via the Stripe webhook, THE System SHALL create one booking document per session included in the bundle and SHALL decrement spots available for each session within a single Firestore transaction
7. IF the Stripe payment for a bundle booking fails, THEN THE Booking_Wizard SHALL display an error message indicating the payment was unsuccessful and SHALL retain all wizard form data so the user can retry payment without re-entering information

### Requirement 4: Bundle Payment Processing

**User Story:** As the system, I want to process bundle payments through a single Stripe PaymentIntent, so that the user is charged once for the entire bundle.

#### Acceptance Criteria

1. WHEN a bundle booking reaches the payment step, THE System SHALL create a single Stripe PaymentIntent with the Bundle_Price amount in GBP currency and store `bundleId` in the PaymentIntent metadata to distinguish it from single-session payments
2. THE System SHALL store a `booking_draft` document with ID equal to the PaymentIntent ID, containing the bundleId, all sessionIds, and the wizard payload (bookedByUid, bookedByName, bookedByEmail, studentId, studentName, medicalInfo, emergencyContact, questionnaire, termsAccepted, className, venueName, and per-session date/time fields) before payment is initiated
3. WHEN the Stripe_Webhook receives `payment_intent.succeeded` for a booking_draft containing a bundleId, THE System SHALL create one booking document per session in the bundle within a single Firestore transaction, using `{paymentIntentId}_{sessionId}` as each booking document ID
4. WHEN the Stripe_Webhook creates bundle bookings, THE System SHALL decrement Spots_Available by 1 on each session in the bundle within the same Firestore transaction
5. WHEN the Stripe_Webhook creates bundle bookings, THE System SHALL store a shared `bundleId` field on each booking document to link them together
6. IF a booking document with ID `{paymentIntentId}_{sessionId}` already exists when the webhook fires, THEN THE System SHALL skip creation for that session and treat the event as a duplicate delivery without returning an error
7. IF the Firestore transaction fails during bundle booking creation, THEN THE System SHALL return a 500 status to Stripe so the webhook is retried, and SHALL NOT create any partial bookings

### Requirement 5: Bundle Spots and Availability

**User Story:** As the system, I want to enforce spot availability across all sessions in a bundle, so that users are informed of capacity constraints before purchasing.

#### Acceptance Criteria

1. WHEN a user initiates a bundle booking, THE System SHALL check spotsAvailable on every session included in the bundle before creating the PaymentIntent, and SHALL reject the booking attempt if any session has zero spotsAvailable
2. IF any session in a bundle has zero spotsAvailable at PaymentIntent creation time, THEN THE System SHALL reject the booking attempt and return a response identifying each full session by session ID and session date
3. IF any session in a bundle has zero spotsAvailable at webhook processing time, THEN THE System SHALL create one booking document per session in the bundle and flag each booking document with `overbooking: true` for manual review
4. WHEN a bundle booking is confirmed via the payment_intent.succeeded webhook, THE System SHALL decrement spotsAvailable by one on each session in the bundle within a single Firestore transaction

### Requirement 6: Bundle Cancellation

**User Story:** As a user, I want to cancel an entire bundle booking, so that all sessions are released together.

#### Acceptance Criteria

1. WHEN a user views a bundle booking in "My Classes", THE Portal SHALL display all sessions in the bundle grouped under a single bundle card showing the bundle name, all session dates in chronological order, and a single "Cancel Bundle" action
2. WHEN a user cancels a bundle booking, THE Portal SHALL update the status of all booking documents linked by the same bundleId to `cancelled` and increment Spots_Available by one on each session in the bundle within a single Firestore transaction
3. WHEN a bundle booking is cancelled, THE System SHALL send a single cancellation confirmation email listing the bundle name, all cancelled session dates with their venue and time, and a link to the "My Classes" portal page
4. THE Portal SHALL not allow cancellation of individual sessions within a bundle booking — the "Cancel" action SHALL be hidden on individual session rows within a bundle group, and only the bundle-level "Cancel Bundle" action SHALL be available
5. IF the bundle cancellation transaction fails, THEN THE System SHALL not update any booking status or Spots_Available, and SHALL display an error message indicating the cancellation could not be completed and to try again
6. WHILE a bundle booking has status `cancelled`, THE Portal SHALL not display the "Cancel Bundle" action for that bundle
7. IF a user attempts to cancel a bundle where one or more sessions have a date in the past, THEN THE Portal SHALL still allow the cancellation and process it for all sessions in the bundle regardless of session date

### Requirement 7: Bundle Lifecycle Management

**User Story:** As an admin, I want to manage the lifecycle of bundles, so that expired or irrelevant bundles are no longer shown to users.

#### Acceptance Criteria

1. THE Bundle SHALL have a status field with values: `active`, `closed`, `cancelled`, where newly created bundles are assigned the status `active` by default
2. WHEN all session dates in a bundle have passed (i.e., the current date is after the last session's scheduled date), THE System SHALL automatically set the bundle status to `closed`
3. WHEN an admin cancels a bundle, THE Admin_Panel SHALL set the bundle status to `cancelled`, prevent new bookings against that bundle, and retain all existing bookings in their current status unaffected
4. WHILE a bundle has status `closed` or `cancelled`, THE Bundle_Browser SHALL not display that bundle to users
5. WHEN an admin edits a bundle and attempts to remove a session that has at least one booking against it, THE Admin_Panel SHALL prevent the removal and display an error message indicating which session cannot be removed due to existing bookings
6. WHILE a bundle has status `closed` or `cancelled`, THE Admin_Panel SHALL still display that bundle in the admin bundle list so that admins can view its details and booking history

### Requirement 8: Bundle in Booking Confirmation Email

**User Story:** As a user who has booked a bundle, I want to receive a confirmation email listing all the sessions I am booked into, so that I have a complete record.

#### Acceptance Criteria

1. WHEN the Stripe_Webhook successfully creates all bundle bookings, THE System SHALL send a single confirmation email to the user's registered email address within 30 seconds of transaction completion
2. THE confirmation email SHALL list the bundle name, the participant name, the total amount paid formatted as £XX.XX, and each session in the bundle in chronological date order showing its date (formatted as weekday, day month, e.g. "Saturday, 15 March"), start time, and venue name
3. THE confirmation email SHALL include a link to the user's "My Classes" portal page using the `NEXT_PUBLIC_APP_URL` environment variable
4. IF the confirmation email fails to send, THEN THE System SHALL log the failure and continue without blocking the booking creation or returning an error to the webhook response
5. THE confirmation email SHALL use a subject line that contains the bundle name to distinguish it from individual session confirmation emails
