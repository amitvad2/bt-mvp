# Requirements Document

## Introduction

The Booking Wizard is a 6-step multi-page flow at `/book/[sessionId]/` that allows authenticated Blooming Tastebuds users to book a cooking class session. The wizard collects participant information, medical details, dietary preferences (where applicable), terms acceptance, and processes payment via Stripe. State is accumulated across steps using `BookingContext`, which is persisted to `sessionStorage` under the key `booking_<sessionId>` so that page refreshes and Stripe redirects do not lose the user's progress.

The wizard supports two distinct user roles:
- **Parents** (`parent` role) who book on behalf of child students (aged 5–12, `kidsAfterSchool` sessions)
- **Young Adults** (`youngAdult` role) who book for themselves (`youngAdultWeekend` sessions)

Booking creation is entirely server-authoritative: no booking document is ever created from the browser. The Stripe webhook (`payment_intent.succeeded`) is the single source of truth for finalising a booking and decrementing session capacity.

---

## Glossary

- **Booking_Wizard**: The 6-step multi-page flow at `/book/[sessionId]/` that guides an authenticated user from student selection through to booking confirmation.
- **BookingContext**: The React context that accumulates wizard state across all steps and persists it to `sessionStorage` under `booking_<sessionId>`.
- **Session**: A specific date/time instance of a cooking class stored in Firestore under `sessions/{sessionId}`, carrying price, capacity, age range, and class type.
- **Student**: A child profile stored in Firestore under `students/{studentId}`, owned by a `parent` user via the `parentUid` field.
- **BTUser**: The authenticated user's Firestore profile stored in `users/{uid}`, containing `role`, `firstName`, `lastName`, and `email`.
- **Booking_Draft**: A Firestore document stored in `booking_drafts/{paymentIntentId}` that holds the complete wizard payload between PaymentIntent creation and webhook execution.
- **Booking**: A confirmed booking document stored in `bookings/{paymentIntentId}`, created exclusively by the Stripe webhook.
- **PaymentIntent**: A Stripe object representing a payment transaction. Its ID is used as the `Booking_Draft` document ID and the final `Booking` document ID.
- **Create_Intent_API**: The Next.js API route `POST /api/payments/create-intent` that verifies the caller's identity, reads the session price from Firestore, creates a Stripe `PaymentIntent`, and persists a `Booking_Draft`.
- **Stripe_Webhook**: The Next.js API route `POST /api/webhooks/stripe` that handles `payment_intent.succeeded` and `payment_intent.payment_failed` events.
- **MedicalInfo**: A structured object capturing boolean health flags (allergies, conditions, operations, vision/hearing impairments, glasses, respiratory problems) and free-text notes for other medical details and additional support needs.
- **EmergencyContact**: A contact record (name, relationship, email, phone) required only for `kidsAfterSchool` sessions.
- **Questionnaire**: A seven-question dietary and allergy questionnaire required only for `kidsAfterSchool` sessions.
- **ClassType**: Either `kidsAfterSchool` (children aged 5–12) or `youngAdultWeekend` (young adults).
- **Age_Validation**: Client-side check that a student's calculated age on the session date falls within `session.ageMin` and `session.ageMax`.
- **Overbooking_Flag**: The boolean field `overbooking: true` added to a `Booking` document when the webhook detects `spotsAvailable <= 0` at transaction time.
- **Idempotency_Guard**: The Firestore transaction check inside the Stripe webhook that skips booking creation if a `bookings/{paymentIntentId}` document already exists.
- **Strict_Mode_Guard**: A `useRef(false)` flag on the payment page that prevents React 19 Strict Mode's double-invocation from creating two PaymentIntents.
- **Confirmation_Poller**: The confirmation page's polling loop that repeatedly reads `bookings/{paymentIntentId}` from Firestore until the webhook-created document appears or the poll limit is exhausted.

---

## Requirements

### Requirement 1: Wizard Entry and Session Loading

**User Story:** As an authenticated user, I want to access the booking wizard for a specific session, so that the wizard is pre-loaded with the correct session information before I start filling in my details.

#### Acceptance Criteria

1. WHEN an authenticated user navigates to `/book/[sessionId]/student`, THE Booking_Wizard SHALL mount a `BookingProvider` scoped to that `sessionId`.
2. WHEN the `BookingProvider` mounts, THE Booking_Wizard SHALL fetch the `Session` document from Firestore at `sessions/{sessionId}` and store it in `BookingContext`.
3. WHEN a previously saved `BookingWizardState` exists in `sessionStorage` under the key `booking_{sessionId}`, THE Booking_Wizard SHALL restore that state into `BookingContext` before the session fetch completes.
4. WHILE the `Session` document is being fetched, THE Booking_Wizard SHALL display a loading spinner and prevent the user from interacting with wizard steps.
5. IF the `Session` document does not exist in Firestore, THE Booking_Wizard SHALL display an appropriate error state.
6. THE Booking_Wizard SHALL display a progress stepper in the header that shows all applicable steps for the current class type.
7. WHEN the class type is `youngAdultWeekend`, THE Booking_Wizard SHALL omit the `questionnaire` step from the progress stepper.
8. WHEN the class type is `kidsAfterSchool`, THE Booking_Wizard SHALL include the `questionnaire` step in the progress stepper.

---

### Requirement 2: Student Selection (Step 1)

**User Story:** As a parent, I want to select which child will attend the session, and as a young adult, I want to confirm I am booking for myself, so that the correct participant is linked to my booking.

#### Acceptance Criteria

1. WHEN the authenticated user's role is `youngAdult`, THE Booking_Wizard SHALL display a "Booking for yourself" confirmation screen and bypass the student list.
2. WHEN the authenticated user's role is `parent`, THE Booking_Wizard SHALL fetch and display all `Student` documents where `parentUid` equals the authenticated user's UID.
3. WHEN a `parent` user selects a student, THE Booking_Wizard SHALL calculate the student's age on the session date using the formula: years elapsed from `dateOfBirth` to `session.date`, adjusted for month/day boundary.
4. WHEN the calculated student age is outside the range `[session.ageMin, session.ageMax]` (inclusive), THE Booking_Wizard SHALL prevent selection and display a validation error naming the student, their calculated age, and the allowed age range.
5. WHEN a `youngAdult` user attempts to select 'self' for a `kidsAfterSchool` session, THE Booking_Wizard SHALL prevent selection and display a validation error.
6. WHEN a `parent` user clicks "Add New Student", THE Booking_Wizard SHALL display an inline form capturing `firstName`, `lastName`, and `dateOfBirth`.
7. WHEN a `parent` user submits the new student form, THE Booking_Wizard SHALL validate the new student's age against the session age range before saving the Firestore document.
8. IF the new student's age fails validation, THE Booking_Wizard SHALL prevent the Firestore write and display a validation error.
9. WHEN a user explicitly selects an existing valid student or explicitly submits a valid new student form, THE Booking_Wizard SHALL store the student in `BookingContext` and navigate to the `medical` step.
10. WHEN the student is 'self', THE Booking_Wizard SHALL store `student: 'self'` in `BookingContext` and leave `studentId` undefined.
11. WHEN the student is a `Student` document, THE Booking_Wizard SHALL store the student object and its `id` as `studentId` in `BookingContext`.

---

### Requirement 3: Medical Information (Step 2)

**User Story:** As a user, I want to provide accurate medical information for the participant, so that Blooming Tastebuds instructors can ensure a safe experience.

#### Acceptance Criteria

1. THE Booking_Wizard SHALL present a `MedicalInfo` form containing boolean checkboxes for: allergies, conditions, recentOperations, visionImpairment, hearingImpairment, glassesRequired, and respiratoryProblems.
2. THE Booking_Wizard SHALL present required free-text fields for `otherMedicalNotes` and `additionalSupportNeeds`.
3. WHEN a previously selected `Student` document contains a `medicalInfo` object, THE Booking_Wizard SHALL pre-populate the medical form with that data.
4. WHEN the session class type is `kidsAfterSchool`, THE Booking_Wizard SHALL additionally display an `EmergencyContact` form collecting: name, relationship, email, and phone.
5. WHEN the session class type is `youngAdultWeekend`, THE Booking_Wizard SHALL omit the `EmergencyContact` form.
6. THE Booking_Wizard SHALL require successful form submission before allowing navigation away from the medical step; the user SHALL NOT be able to skip this step.
7. WHEN the form is submitted successfully, THE Booking_Wizard SHALL store `MedicalInfo` in `BookingContext`.
8. WHEN the session class type is `kidsAfterSchool` and the form is submitted, THE Booking_Wizard SHALL store `EmergencyContact` in `BookingContext` and navigate to the `questionnaire` step. IF the `EmergencyContact` storage operation fails after `MedicalInfo` is stored, THE Booking_Wizard SHALL continue navigation to the `questionnaire` step.
9. WHEN the session class type is `youngAdultWeekend` and the form is submitted, THE Booking_Wizard SHALL navigate directly to the `terms` step, bypassing the `questionnaire` step.

---

### Requirement 4: Dietary Questionnaire (Step 3 — `kidsAfterSchool` only)

**User Story:** As a parent, I want to provide dietary and allergy information for my child, so that instructors can accommodate specific needs and keep the environment safe.

#### Acceptance Criteria

1. WHEN the session class type is `kidsAfterSchool`, THE Booking_Wizard SHALL display a `Questionnaire` form with exactly seven questions covering: dietary requirements, airborne allergy, reaction details on skin contact/ingestion, symptoms to watch for, epipen information, same-table tolerance with allergenic ingredients, and "may contain traces" tolerance.
2. WHEN the session class type is `youngAdultWeekend`, THE Booking_Wizard SHALL skip this step entirely and not render the questionnaire page.
3. WHEN a previously selected `Student` document contains a `questionnaire` object, THE Booking_Wizard SHALL pre-populate the questionnaire form with that data.
4. THE Booking_Wizard SHALL enforce a maximum of 250 characters per questionnaire answer field.
5. WHEN all questionnaire fields are completed and the form is submitted, THE Booking_Wizard SHALL store the `Questionnaire` in `BookingContext` and navigate to the `terms` step. IF any required questionnaire field is empty upon submission, THE Booking_Wizard SHALL block navigation until all fields contain a value.

---

### Requirement 5: Terms and Conditions Acceptance (Step 4)

**User Story:** As a user, I want to review my booking summary and accept the terms and conditions, so that I am fully informed before committing to payment.

#### Acceptance Criteria

1. THE Booking_Wizard SHALL display a booking summary showing: class name, participant name, session date, venue name, and price (formatted in GBP).
2. THE Booking_Wizard SHALL display the key terms: accuracy of medical information, allergen-aware kitchen disclaimer, cancellation policy (full refund if cancelled 48+ hours before), and child drop-off/collection obligation (for kids sessions).
3. THE Booking_Wizard SHALL display a checkbox that the user must actively check to accept the terms.
4. WHILE the terms checkbox is unchecked AND `BookingContext.termsAccepted` is not `true`, THE Booking_Wizard SHALL disable the "Go to Payment" button.
5. WHEN `BookingContext.termsAccepted` is `true` (whether from the current interaction or restored from a previous session via `sessionStorage`), THE Booking_Wizard SHALL enable the "Go to Payment" button regardless of the visual checkbox state.
6. WHEN the user clicks "Go to Payment" with terms accepted, THE Booking_Wizard SHALL navigate to the `payment` step.

---

### Requirement 6: Payment Initialisation (Step 5)

**User Story:** As a user, I want to pay securely for my booking, so that my spot in the session is reserved.

#### Acceptance Criteria

1. WHEN the payment page mounts and both `BookingContext` and `AuthContext` are fully loaded, THE Booking_Wizard SHALL call `POST /api/payments/create-intent` exactly once with the full wizard payload.
2. THE Booking_Wizard SHALL use a `useRef(false)` guard to prevent React Strict Mode's double-invocation from calling `create-intent` more than once per page load.
3. WHEN `state.termsAccepted` is false at the time of payment page mount, THE Booking_Wizard SHALL display an error and NOT call `create-intent`.
4. WHEN `state.session.price` is absent at the time of payment page mount, THE Booking_Wizard SHALL display an error and NOT call `create-intent`.
5. THE Booking_Wizard SHALL attach a Firebase ID token in the `Authorization: Bearer <idToken>` header of the `create-intent` request.
6. WHEN `create-intent` returns a successful HTTP 200 response containing a `clientSecret`, THE Booking_Wizard SHALL initialise Stripe Elements with that `clientSecret` and render the `CheckoutForm` component.
7. WHILE the `clientSecret` is being fetched, THE Booking_Wizard SHALL display a "Initialising secure checkout..." loading state.
8. IF `create-intent` returns an error, THE Booking_Wizard SHALL display the error message and a "Retry" button that reloads the page. WHEN no API error has occurred, the system MAY display error messages for client-side validation failures (such as missing terms acceptance or missing session data) without showing a retry button.
9. THE Booking_Wizard SHALL display the price to the user formatted as `£X.XX` using `(session.price / 100).toFixed(2)`. The displayed amount is informational only; the authoritative amount is always read server-side.

---

### Requirement 7: Create Intent API

**User Story:** As the system, I want the payment intent creation to be secure and authoritative, so that users cannot manipulate pricing or book sessions that are unavailable.

#### Acceptance Criteria

1. WHEN `POST /api/payments/create-intent` is called, THE Create_Intent_API SHALL verify the `Authorization: Bearer <idToken>` header using Firebase Admin SDK's `verifyIdToken` and reject requests without a valid token with HTTP 401.
2. THE Create_Intent_API SHALL read the session `price` from Firestore at `sessions/{sessionId}` and SHALL NOT accept any `amount` field from the request body.
3. WHEN the session document does not exist, THE Create_Intent_API SHALL return HTTP 400.
4. WHEN `session.status` is not `'open'`, THE Create_Intent_API SHALL return HTTP 400 with the message "This session is no longer accepting bookings."
5. WHEN `session.spotsAvailable` is 0 or less, THE Create_Intent_API SHALL return HTTP 400 with the message "Sorry, this session is now full."
6. WHEN the `sessionId` field is missing from the request body, THE Create_Intent_API SHALL return HTTP 400.
7. WHEN a `studentId` is provided in the request body, THE Create_Intent_API SHALL verify that the `students/{studentId}` document exists and that its `parentUid` equals the verified UID; if not, return HTTP 403.
8. THE Create_Intent_API SHALL check `adminInitError` before any Firestore operation and return HTTP 500 if the Firebase Admin SDK failed to initialise.
9. WHEN all validations pass, THE Create_Intent_API SHALL create a Stripe `PaymentIntent` in GBP with the server-read `amount`, `automatic_payment_methods: { enabled: true }`, and metadata containing `sessionId`, `studentId`, `bookedByUid`, `className`, and `env`.
10. WHEN the Stripe `PaymentIntent` is created successfully, THE Create_Intent_API SHALL write a `booking_drafts/{paymentIntentId}` document containing the full wizard payload with `bookedByUid` taken from the verified token.
11. IF the `booking_drafts` Firestore write fails after the `PaymentIntent` has been created, THE Create_Intent_API SHALL attempt to cancel the `PaymentIntent` and SHALL return HTTP 500 regardless of whether the cancellation succeeds, ensuring the user is never charged for an unbookable session.
12. WHEN both the `PaymentIntent` and draft write succeed, THE Create_Intent_API SHALL return HTTP 200 with `{ clientSecret, paymentIntentId }`.

---

### Requirement 8: Stripe Webhook — Booking Creation

**User Story:** As the system, I want booking creation to happen exclusively in the Stripe webhook after payment confirmation, so that bookings are never created without a verified, successful payment.

#### Acceptance Criteria

1. WHEN `POST /api/webhooks/stripe` receives a request, THE Stripe_Webhook SHALL verify the Stripe signature using `STRIPE_WEBHOOK_SECRET` and SHALL reject requests that fail signature verification with HTTP 400 without processing any event data.
2. WHEN a `payment_intent.succeeded` event is received, THE Stripe_Webhook SHALL look up the `booking_drafts/{paymentIntentId}` document.
3. IF no draft document exists for a `payment_intent.succeeded` event, THE Stripe_Webhook SHALL log a critical error and return HTTP 200 without creating a booking (manual intervention required).
4. THE Stripe_Webhook SHALL create the `bookings/{paymentIntentId}` document and decrement `session.spotsAvailable` by 1 atomically within a single Firestore transaction.
5. WHEN the `bookings/{paymentIntentId}` document already exists inside the Firestore transaction while processing a `payment_intent.succeeded` event, THE Stripe_Webhook SHALL skip the booking creation and spot decrement operations and return HTTP 200.
6. WHEN `session.spotsAvailable <= 0` at transaction time, THE Stripe_Webhook SHALL still create the booking document but SHALL add `overbooking: true` to the document for manual review, without decrementing `spotsAvailable`.
7. WHEN `session.status` is not `'open'` at transaction time, THE Stripe_Webhook SHALL create the booking document without decrementing `spotsAvailable`.
8. THE Stripe_Webhook SHALL set the booking's `payment.status` to `'paid'` and `payment.amount` to the `PaymentIntent.amount`.
9. THE Stripe_Webhook SHALL set `termsAcceptedAt` using Firestore `serverTimestamp()` on the created booking document.
10. WHEN a real student (not 'self') is linked to the booking, THE Stripe_Webhook SHALL attempt to update `students/{studentId}` with the `medicalInfo`, `emergencyContact`, and `questionnaire` from the draft; this update is best-effort and SHALL NOT fail the booking if the student update fails.
11. WHEN the booking is created, THE Stripe_Webhook SHALL attempt to send a confirmation email to `draft.bookedByEmail` via Resend; this is best-effort and SHALL NOT fail the booking if email sending fails.
12. WHEN the booking is created successfully, THE Stripe_Webhook SHALL delete the `booking_drafts/{paymentIntentId}` document; deletion failure SHALL NOT affect the booking result.
13. WHEN a `payment_intent.payment_failed` event is received, THE Stripe_Webhook SHALL update `booking_drafts/{paymentIntentId}` with `paymentStatus: 'failed'` and a `failureMessage` for observability.
14. WHEN any unhandled exception occurs in the webhook handler, THE Stripe_Webhook SHALL return HTTP 500 so Stripe retries the event.

---

### Requirement 9: Session Storage Persistence

**User Story:** As a user, I want my booking progress to be preserved if I accidentally refresh the page or am redirected away by Stripe, so that I do not have to re-enter my information.

#### Acceptance Criteria

1. THE BookingContext SHALL persist wizard state to `sessionStorage` under the key `booking_{sessionId}` after every state update, provided the state contains more than just the `sessionId` field.
2. WHEN `BookingProvider` mounts, THE BookingContext SHALL attempt to read and restore state from `sessionStorage` under `booking_{sessionId}` before the Firestore session fetch resolves.
3. WHEN the restored `sessionStorage` value cannot be parsed as JSON, THE BookingContext SHALL silently discard it and continue with a fresh state.
4. WHEN the user reaches the confirmation page, THE BookingContext SHALL call `clearState`, which removes the `sessionStorage` entry and resets in-memory state to `{ sessionId }`.

---

### Requirement 10: Booking Confirmation (Step 6)

**User Story:** As a user, I want to see a confirmation of my booking after payment, so that I have confidence my spot is reserved.

#### Acceptance Criteria

1. WHEN the Stripe redirect returns to the confirmation page with a `?payment_intent=<id>` query parameter, THE Booking_Wizard SHALL use that value as the Firestore lookup key for `bookings/{id}`.
2. THE Booking_Wizard SHALL poll `bookings/{paymentIntentId}` in Firestore using a loop of up to 8 attempts with 1,500 ms between each attempt.
3. WHILE polling and the booking document has not yet appeared, THE Booking_Wizard SHALL display a "Confirming Your Booking..." loading state with a spinner.
4. WHEN the booking document is found during polling, THE Booking_Wizard SHALL display: booking reference (last 8 characters of the document ID in uppercase), class name, formatted session date, venue, and participant name.
5. WHEN all 8 polling attempts are exhausted without the booking document appearing, THE Booking_Wizard SHALL display a "Payment Received" message informing the user that the booking will appear in their dashboard within minutes, and SHALL show a truncated payment reference for support queries. WHILE active polling is in progress and the user navigates away and returns, THE Booking_Wizard SHALL display the loading state until all polling attempts are exhausted.
6. THE Booking_Wizard SHALL display navigation buttons to "Back to Dashboard" and "View My Classes" in both the found and exhausted states.
7. WHEN the confirmation page mounts, THE BookingContext SHALL call `clearState` to clean up `sessionStorage` regardless of whether the booking document is found.
8. WHEN the `bookings` document is located through any mechanism (not limited to polling), THE Booking_Wizard SHALL display the full booking detail card.

---

### Requirement 11: Security and Authentication

**User Story:** As the system owner, I want the booking flow to enforce authentication and prevent privilege escalation, so that only legitimate users can create bookings and no user can manipulate pricing.

#### Acceptance Criteria

1. THE Booking_Wizard SHALL be accessible only to authenticated users; unauthenticated users SHALL be redirected by Edge middleware before reaching any wizard step.
2. THE Create_Intent_API SHALL extract the authenticated user's UID exclusively from the verified Firebase ID token and SHALL NOT accept a `bookedByUid` field from the request body.
3. THE Create_Intent_API SHALL read the booking price exclusively from the Firestore `sessions/{sessionId}` document; no client-supplied `amount` or `price` field SHALL be used.
4. WHEN a `studentId` is provided, THE Create_Intent_API SHALL verify that `students/{studentId}.parentUid` equals the token-verified UID before proceeding.
5. THE Stripe_Webhook SHALL verify the Stripe signature on every incoming request before processing any event data.
6. THE Booking_Wizard SHALL never write to the `bookings` Firestore collection from the browser; all booking documents SHALL be created exclusively by the Stripe_Webhook using the Firebase Admin SDK.

---

### Requirement 12: Error Handling and Resilience

**User Story:** As a user, I want the system to handle errors gracefully throughout the booking flow, so that I understand what went wrong and can take action.

#### Acceptance Criteria

1. IF the Firebase Admin SDK fails to initialise, THE Create_Intent_API SHALL return HTTP 500 before creating a Stripe PaymentIntent.
2. IF the Stripe `PaymentIntent` creation fails, THE Create_Intent_API SHALL return HTTP 500 with a descriptive error message.
3. IF the `booking_drafts` write fails after `PaymentIntent` creation, THE Create_Intent_API SHALL attempt to cancel the `PaymentIntent` and SHALL return HTTP 500 regardless of whether the cancellation succeeds, so the user is never charged for a booking that cannot be confirmed.
4. WHEN the confirmation page cannot find the booking document after all polling attempts, THE Booking_Wizard SHALL NOT display an error state; it SHALL display a "processing" message with a payment reference and link to the dashboard.
5. IF the student profile update fails in the webhook, THE Stripe_Webhook SHALL log the error and continue; the booking creation SHALL NOT be rolled back.
6. IF the confirmation email fails to send, THE Stripe_Webhook SHALL log the error and continue; the booking creation SHALL NOT be rolled back.
7. IF the draft document deletion fails after booking creation, THE Stripe_Webhook SHALL log the error and continue; the booking creation SHALL NOT be rolled back.
8. WHEN the Stripe webhook handler throws an unhandled exception, THE Stripe_Webhook SHALL return HTTP 500 so that Stripe automatically retries the event.

---

### Requirement 13: Idempotency and Race Condition Safety

**User Story:** As the system owner, I want the booking creation process to be idempotent and safe under concurrent conditions, so that duplicate payments or race conditions never result in double bookings or inconsistent data.

#### Acceptance Criteria

1. THE Stripe_Webhook SHALL use the `PaymentIntent.id` as both the `Booking_Draft` document ID and the final `Booking` document ID to provide a natural idempotency key.
2. WHEN the `bookings/{paymentIntentId}` document already exists inside the Firestore transaction, THE Stripe_Webhook SHALL skip the set and decrement operations and return HTTP 200.
3. THE Create_Intent_API SHALL use a `useRef(false)` guard on the payment page (specifically a `useRef` initialised to `false` that is set to `true` on first invocation) to ensure only one `create-intent` call is made per page load, preventing React 19 Strict Mode's double-invocation from creating duplicate PaymentIntents.
4. THE Stripe_Webhook SHALL perform booking creation and spot decrement in a single Firestore transaction to ensure atomicity — either both succeed or neither is applied.

---

### Requirement 14: State Immutability and Data Integrity

**User Story:** As the system owner, I want the booking data stored in the draft and the final booking to be complete and accurate, so that no booking is created with missing or incorrect data.

#### Acceptance Criteria

1. WHEN the `Booking_Draft` is written by `Create_Intent_API`, THE Create_Intent_API SHALL record `bookedByUid` from the verified token, not from any client-supplied field.
2. WHEN the `Booking` document is written by `Stripe_Webhook`, THE Stripe_Webhook SHALL copy all data from the `Booking_Draft` and SHALL set `payment.amount` from `PaymentIntent.amount`, `payment.currency` from `PaymentIntent.currency`, and `payment.status` to `'paid'`. These payment field constraints apply exclusively to webhook-created booking documents.
3. THE Stripe_Webhook SHALL set `createdAt` and `termsAcceptedAt` using Firestore Admin `serverTimestamp()` on the booking document.
4. WHEN the student is 'self', THE Create_Intent_API SHALL store `studentId: null` in the draft and the booking SHALL have `studentId: null`.
5. THE Booking_Draft SHALL contain `termsAccepted: true` only if the user explicitly checked the terms checkbox during the wizard; THE Create_Intent_API SHALL default this to `false` if not provided.
