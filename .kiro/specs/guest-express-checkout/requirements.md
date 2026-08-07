# Requirements Document

## Introduction

Enable parents and guardians to book children's cooking sessions at Blooming Tastebuds without creating a Firebase account. The guest express checkout provides a streamlined, mobile-first booking experience accessible via shareable links distributed through WhatsApp, social media, QR codes, and the website — reducing friction for first-time bookers while maintaining safety, payment integrity, and data protection standards.

The existing booking flow requires Firebase authentication (email/password or Google OAuth) before a parent can book a session. While this provides account management benefits, it creates significant friction for parents discovering Blooming Tastebuds through WhatsApp groups, social media posts, or QR codes at events. These parents want to book quickly without committing to account creation. The guest express checkout addresses this by providing a parallel, unauthenticated booking path that collects all necessary child safety information and processes payment securely.

### Current-State Summary

| Aspect | Current State |
|--------|--------------|
| Authentication | Firebase Auth required (email/password + Google OAuth) |
| Booking route | `/book/[sessionId]/*` — protected by Edge middleware (`bt_session` cookie) |
| Payment API | `POST /api/payments/create-intent` — requires `Authorization: Bearer <idToken>` |
| Webhook | Creates booking in `bookings/{paymentIntentId}`, decrements `spotsAvailable` |
| Booking model | Requires `bookedByUid` (Firebase UID), links to `students/{studentId}` |
| Medical/safety data | Stored in `students/{studentId}` profile, limited fields (MedicalInfo, EmergencyContact, Questionnaire) |
| Confirmation | Polls Firestore via client SDK using authenticated read (`bookedByUid == request.auth.uid`) |
| Admin views | Assume every booking has `bookedByUid`; no source/mode tracking |
| Feature flags | None currently in use |
| Middleware | Blocks `/book/*` for unauthenticated users |

### Feature Scope

**In scope:**
- Public guest booking route (`/express-booking/[sessionId]`) with no login requirement
- Multi-step mobile-first form collecting parent, child, medical, emergency, consent, and payment details
- New guest payment API endpoint (`POST /api/payments/create-guest-intent`)
- Guest-aware webhook processing with consent validation and safety-review status
- Guest confirmation page accessible without Firebase login
- Admin visibility of guest bookings in existing booking/session/register views
- Safety-review workflow for medical/allergy declarations
- Feature flag control (`NEXT_PUBLIC_GUEST_CHECKOUT_ENABLED`)
- Source tracking for analytics (WhatsApp, Facebook, Instagram, QR, website, Google)
- Shareable guest booking links for admin distribution
- Preview deployment on Vercel (not production)

**Out of scope:** See Non-Goals section.

### Actors and Personas

| Actor | Description |
|-------|-------------|
| **Parent_Guardian** | Adult booking a cooking session for their child without creating a Blooming Tastebuds account. Typically discovering the business through WhatsApp groups, social media, or school events. |
| **Child_Student** | The participant (aged 5–12 for After School Club) attending the cooking session. Cannot book for themselves. |
| **BT_Administrator** | Blooming Tastebuds staff who manages sessions, reviews bookings, accesses safety information, and distributes guest booking links. |
| **Instructor** | Teaching staff who needs the session register and safety summary for participants on the day. |
| **Stripe_Provider** | External payment processing service handling card payments via Payment Element. |
| **BT_Backend** | The trusted server-side system (Next.js API routes + Firebase Admin SDK) that validates data, creates payment intents, processes webhooks, and creates bookings. |

### User Journeys

#### Guest Express Booking (Happy Path)

1. Parent receives guest booking link (via WhatsApp, social media, QR code, or website)
2. Parent opens `/express-booking/[sessionId]?source=whatsapp` — no login required
3. System displays session info: class name, date, time, venue, age range, price, availability
4. Parent enters parent details (first name, last name, email, phone) and child details (first name, last name, date of birth)
5. System validates child age against session age range
6. Parent enters medical information, allergy details (conditional fields based on declarations)
7. Parent enters emergency contact and authorised collector details
8. Parent reviews and accepts mandatory consents; optionally selects marketing consents
9. Parent reviews complete booking summary
10. System validates all fields server-side, verifies session availability
11. Payment Element renders; parent completes payment
12. Stripe webhook fires; BT_Backend creates booking, decrements capacity, sends confirmation email
13. Guest confirmation page displays booking reference and summary
14. Booking appears in admin panel with source label and safety-review status

#### Admin Link Distribution

1. BT_Administrator navigates to admin sessions page
2. Admin copies guest booking link for a specific session
3. Admin shares link via WhatsApp, social media, or prints QR code
4. Link includes session ID and source parameter for analytics

#### Safety Review

1. Guest booking is created with medical/allergy declarations
2. System sets `safetyReviewStatus: 'pending'`
3. BT_Administrator sees booking in safety-review queue
4. Admin reviews medical info, contacts parent if needed, updates status
5. Instructor accesses restricted safety summary for session register

## Glossary

- **Guest_Booking**: A booking made without Firebase authentication, identified by payment intent ID, containing embedded parent contact and child snapshots rather than linked user/student documents.
- **Express_Checkout_Form**: The multi-step mobile-first form at `/express-booking/[sessionId]` collecting all guest booking information.
- **Guest_Payment_API**: The server-side endpoint `POST /api/payments/create-guest-intent` that validates guest data and creates Stripe PaymentIntents without requiring authentication tokens.
- **Booking_Draft**: A Firestore document in `booking_drafts/{paymentIntentId}` storing the complete booking payload between payment initiation and webhook confirmation.
- **Safety_Review_Status**: An enumerated field (`not_required | pending | reviewed | contact_parent | cannot_accommodate`) tracking admin review of medical/allergy declarations.
- **Authorised_Collector**: A named individual (other than the parent) permitted to collect the child after the session.
- **Feature_Flag**: The environment variable `NEXT_PUBLIC_GUEST_CHECKOUT_ENABLED` controlling visibility and availability of guest checkout.
- **Booking_Mode**: A discriminator field (`account | guest`) distinguishing authenticated bookings from guest bookings.
- **Booking_Source**: An analytics metadata field recording the channel through which the booking was initiated (e.g., `whatsapp_express`, `facebook_express`, `qr_express`).
- **BT_Backend**: The trusted server-side system comprising Next.js API routes and Firebase Admin SDK.
- **Stripe_Payment_Element**: Stripe's pre-built UI component for collecting payment details, supporting cards, Apple Pay, Google Pay, and other methods.
- **Consent_Audit**: A structured record of each individual consent value, timestamp, version, and the name of the person who accepted.

## Requirements

### Requirement 1: Public Guest Booking Route

**ID:** GUEST-FR-001

**User Story:** As a Parent_Guardian, I want to access a booking page without creating an account, so that I can quickly book my child into a cooking session discovered via a shared link.

#### Acceptance Criteria

1. THE Express_Checkout_Form SHALL be accessible at `/express-booking/[sessionId]` without requiring Firebase authentication.
2. WHEN a Parent_Guardian navigates to `/express-booking/[sessionId]`, THE BT_Backend SHALL load the session document from Firestore using the session ID path parameter.
3. WHEN the session document is loaded successfully, THE Express_Checkout_Form SHALL display the session price, date, time, venue name, class name, age range, and current availability.
4. WHEN a `source` query parameter is present in the URL, THE BT_Backend SHALL store the value as analytics metadata on the booking.
5. THE BT_Backend SHALL accept the following source values: `whatsapp`, `facebook`, `instagram`, `website`, `qr`, `google`.
6. THE Express_Checkout_Form SHALL NOT use the `source` parameter for authentication or authorisation decisions.

**Priority:** Must have
**Dependencies:** Feature flag (GUEST-FR-016) must be enabled.

### Requirement 2: Session Validation on Route Load

**ID:** GUEST-FR-002

**User Story:** As a Parent_Guardian, I want to receive clear feedback if a session is unavailable, so that I do not waste time filling out a form for a session I cannot book.

#### Acceptance Criteria

1. IF the session ID does not correspond to an existing Firestore document, THEN THE Express_Checkout_Form SHALL display a "Session not found" error and prevent form progression.
2. IF the session status is `closed`, `cancelled`, or `full`, THEN THE Express_Checkout_Form SHALL display an appropriate message explaining the session is not accepting bookings.
3. IF the session date is in the past, THEN THE Express_Checkout_Form SHALL display a message that the session has already taken place.
4. IF the session `spotsAvailable` equals zero, THEN THE Express_Checkout_Form SHALL display a "Session full" message.
5. WHEN the session is valid and open, THE Express_Checkout_Form SHALL proceed to display the multi-step form.

**Priority:** Must have
**Dependencies:** GUEST-FR-001

### Requirement 3: Multi-Step Guest Form — Parent and Child Details

**ID:** GUEST-FR-003

**User Story:** As a Parent_Guardian, I want to provide my contact details and my child's information in a clear step-by-step form, so that Blooming Tastebuds has the correct booking and contact information.

#### Acceptance Criteria

1. THE Express_Checkout_Form SHALL present Step 1 collecting: parent first name, parent last name, parent email address, parent telephone number, child first name, child last name, and child date of birth.
2. WHEN the child's date of birth is entered, THE Express_Checkout_Form SHALL validate that the child's age falls within the session's `ageMin` and `ageMax` range.
3. IF the child's calculated age is outside the session age range, THEN THE Express_Checkout_Form SHALL display an error message and prevent progression to the next step.
4. THE Express_Checkout_Form SHALL validate all fields using client-side Zod schemas before allowing progression.
5. THE Express_Checkout_Form SHALL preserve entered data when navigating between steps.

**Priority:** Must have
**Dependencies:** GUEST-FR-001

### Requirement 4: Multi-Step Guest Form — Medical and Allergy Information

**ID:** GUEST-FR-004

**User Story:** As a Parent_Guardian, I want to declare my child's medical conditions and allergies, so that Blooming Tastebuds can assess safety requirements and accommodate needs where possible.

#### Acceptance Criteria

1. THE Express_Checkout_Form SHALL present Step 2 collecting medical and allergy information with the following fields: food allergies, dietary requirements, airborne allergies, allergen details, known reactions, symptoms, EpiPen required (yes/no), EpiPen details, medication details, respiratory problems, medical conditions, recent operations or injuries, vision impairment, hearing impairment, additional support needs, and other safety information.
2. WHEN the Parent_Guardian declares an EpiPen is required, THE Express_Checkout_Form SHALL display additional EpiPen detail fields.
3. WHEN the Parent_Guardian declares food allergies, THE Express_Checkout_Form SHALL display additional allergen detail, reaction, and symptom fields.
4. THE Express_Checkout_Form SHALL display a disclaimer stating that accommodation of declared needs is not automatic and will be assessed by Blooming Tastebuds staff.
5. THE Express_Checkout_Form SHALL NOT include medical or allergy information in URLs, Stripe metadata, analytics events, application logs, or WhatsApp messages.

**Priority:** Must have
**Dependencies:** GUEST-FR-003

### Requirement 5: Multi-Step Guest Form — Emergency Contact and Authorised Collector

**ID:** GUEST-FR-005

**User Story:** As a Parent_Guardian, I want to provide emergency contact and collection details, so that Blooming Tastebuds can reach someone in an emergency and release my child only to authorised individuals.

#### Acceptance Criteria

1. THE Express_Checkout_Form SHALL present Step 3 collecting emergency contact details: contact name, relationship to child, mobile phone number, alternative phone number, and email address.
2. THE Express_Checkout_Form SHALL present authorised collector details: collector name, relationship to child, collector phone number, and a same-as-parent indicator.
3. WHEN the same-as-parent indicator is selected, THE Express_Checkout_Form SHALL auto-populate collector fields with parent details from Step 1.
4. THE BT_Backend SHALL store emergency contact and authorised collector as separate data concepts in the booking document.
5. THE Express_Checkout_Form SHALL validate that at least one phone number is provided for both emergency contact and authorised collector.

**Priority:** Must have
**Dependencies:** GUEST-FR-003

### Requirement 6: Multi-Step Guest Form — Consent Collection

**ID:** GUEST-FR-006

**User Story:** As a Parent_Guardian, I want to review and accept required consents before payment, so that I understand the terms under which my child participates and how their data is processed.

#### Acceptance Criteria

1. THE Express_Checkout_Form SHALL present Step 4 with the following mandatory consents (all must be accepted): parent/guardian authority confirmation, accuracy of information provided, health and safety data processing consent, emergency assistance authorisation, and terms and cancellation policy acceptance, and privacy notice acknowledgement.
2. THE Express_Checkout_Form SHALL present the following optional consents (unticked by default): photography and promotional use, email marketing communications, and WhatsApp marketing communications.
3. IF any mandatory consent is not accepted, THEN THE Express_Checkout_Form SHALL prevent progression to the review and payment step.
4. THE Express_Checkout_Form SHALL NOT pre-tick optional consent checkboxes.
5. WHEN consents are submitted, THE BT_Backend SHALL record each individual consent value, the acceptance timestamp, the consent version identifiers, the name of the accepting person, the source channel, and the submission timestamp.

**Priority:** Must have
**Dependencies:** GUEST-FR-003

### Requirement 7: Review Summary and Payment Gating

**ID:** GUEST-FR-007

**User Story:** As a Parent_Guardian, I want to review all my entered information before paying, so that I can verify accuracy and understand exactly what I am committing to.

#### Acceptance Criteria

1. THE Express_Checkout_Form SHALL display a complete summary on Step 5 showing: parent details, child details, medical/allergy summary, emergency contact, authorised collector, all consent selections, session details (class, date, time, venue, price), and total amount due.
2. THE Express_Checkout_Form SHALL NOT render the Stripe Payment Element until all the following conditions are met: all mandatory form fields are complete, server-side validation passes, all mandatory consents are accepted, the session status is `open`, session `spotsAvailable` is greater than zero, and the child's age is within the eligible range.
3. WHEN any gating condition is not met, THE Express_Checkout_Form SHALL display a clear message explaining what prevents payment.
4. THE Express_Checkout_Form SHALL allow the Parent_Guardian to navigate back to previous steps to correct information before payment.

**Priority:** Must have
**Dependencies:** GUEST-FR-003, GUEST-FR-004, GUEST-FR-005, GUEST-FR-006

### Requirement 8: Guest Payment Intent Creation API

**ID:** GUEST-FR-008

**User Story:** As the BT_Backend, I want to validate all guest booking data server-side and create a Stripe PaymentIntent using the authoritative Firestore price, so that payment cannot be manipulated and bookings are only initiated for valid sessions.

#### Acceptance Criteria

1. THE BT_Backend SHALL expose a new endpoint `POST /api/payments/create-guest-intent` that does NOT require a Firebase authentication token.
2. THE BT_Backend SHALL NOT modify the existing authenticated `POST /api/payments/create-intent` endpoint.
3. WHEN a request is received, THE BT_Backend SHALL validate the request payload using server-side Zod schemas covering all form fields, consent records, and emergency contact data.
4. THE BT_Backend SHALL verify the session exists in Firestore, has status `open`, has a date in the future, and has `spotsAvailable` greater than zero.
5. THE BT_Backend SHALL validate the child's age against the session's `ageMin` and `ageMax` fields.
6. THE BT_Backend SHALL read the authoritative price from the Firestore session document and ignore any client-supplied amount value.
7. THE BT_Backend SHALL validate that all mandatory consent fields are accepted.
8. THE BT_Backend SHALL validate that emergency contact and authorised collector data are complete and valid.
9. WHEN all validations pass, THE BT_Backend SHALL create a Stripe PaymentIntent with the Firestore-authoritative amount in GBP.
10. THE BT_Backend SHALL save a `booking_drafts/{paymentIntentId}` document containing the complete guest booking payload.
11. IF the Firestore draft save fails after PaymentIntent creation, THEN THE BT_Backend SHALL cancel the PaymentIntent and return an error to the client.
12. THE BT_Backend SHALL return only the `clientSecret` and `paymentIntentId` values needed to render the Stripe Payment Element.
13. THE BT_Backend SHALL include only the following in Stripe PaymentIntent metadata: booking mode (`guest`), source channel, session ID, and draft document ID. No personal or medical data.

**Priority:** Must have
**Dependencies:** GUEST-FR-001, GUEST-SEC-001

### Requirement 9: Guest Webhook Processing

**ID:** GUEST-FR-009

**User Story:** As the BT_Backend, I want to process Stripe webhook events for guest bookings correctly, so that bookings are created atomically with capacity decremented and confirmation emails sent.

#### Acceptance Criteria

1. WHEN a `payment_intent.succeeded` event is received for a guest booking draft, THE BT_Backend SHALL identify the booking as guest mode from the draft document.
2. THE BT_Backend SHALL validate that the draft contains valid consent records before creating the booking.
3. THE BT_Backend SHALL create the booking document idempotently (booking ID = PaymentIntent ID) within a Firestore transaction that also decrements `spotsAvailable` by exactly one.
4. THE BT_Backend SHALL preserve existing overbooking controls (create booking with `overbooking: true` flag if spots are zero at webhook time).
5. THE BT_Backend SHALL store all data as embedded snapshots: guest parent contact, child details, medical information, allergy/dietary information, emergency contact, authorised collector, consent audit, payment record, and session snapshot.
6. THE BT_Backend SHALL set the `safetyReviewStatus` field based on the medical/allergy declarations in the booking.
7. WHEN the booking is created successfully, THE BT_Backend SHALL send a confirmation email to the parent's email address.
8. THE BT_Backend SHALL delete or archive the booking draft after successful booking creation.
9. IF a duplicate webhook event is received for an existing booking, THEN THE BT_Backend SHALL skip processing without creating duplicate bookings, decrements, or emails.
10. IF a `payment_intent.payment_failed` event is received, THEN THE BT_Backend SHALL NOT create a booking document.

**Priority:** Must have
**Dependencies:** GUEST-FR-008

### Requirement 10: Guest Confirmation Page

**ID:** GUEST-FR-010

**User Story:** As a Parent_Guardian, I want to see confirmation that my booking was successful after payment, so that I have reassurance and a reference number without needing to log in.

#### Acceptance Criteria

1. THE BT_Backend SHALL serve a guest confirmation page at `/express-booking/[sessionId]/confirmation` that is accessible without Firebase authentication.
2. THE Guest_Confirmation_Page SHALL support a delay between payment completion and webhook-created booking availability.
3. THE Guest_Confirmation_Page SHALL NOT perform direct unauthenticated Firestore reads from the client SDK.
4. THE BT_Backend SHALL provide a secure, short-lived, server-mediated access mechanism for the guest confirmation page to retrieve booking status.
5. THE Guest_Confirmation_Page SHALL NOT include reusable secrets or tokens in the URL.
6. WHEN the booking is confirmed, THE Guest_Confirmation_Page SHALL display: payment status, booking reference, child's first name, class name, session date, session time, venue name, amount paid, and a message confirming safety information was received.
7. THE Guest_Confirmation_Page SHALL NOT display detailed medical or allergy information.
8. WHILE the webhook has not yet processed, THE Guest_Confirmation_Page SHALL display: "Payment received. We are finalising your booking."

**Priority:** Must have
**Dependencies:** GUEST-FR-009

### Requirement 11: Guest Confirmation Email

**ID:** GUEST-FR-011

**User Story:** As a Parent_Guardian, I want to receive a confirmation email after my booking is completed, so that I have a permanent record of the booking details.

#### Acceptance Criteria

1. WHEN the webhook creates a guest booking, THE BT_Backend SHALL send a confirmation email to the parent's email address provided in the booking.
2. THE Confirmation_Email SHALL contain: parent's first name, child's first name, class name, session date, session time, venue name, amount paid, booking reference, arrival information, Blooming Tastebuds contact details, and a message confirming safety information was received.
3. THE Confirmation_Email SHALL NOT contain detailed medical or allergy information.
4. WHILE the system is deployed in Preview mode, THE Confirmation_Email SHALL prefix the subject line with `[PREVIEW]` and send only to approved test recipients.

**Priority:** Must have
**Dependencies:** GUEST-FR-009

### Requirement 12: Guest Bookings in Admin Views

**ID:** GUEST-FR-012

**User Story:** As a BT_Administrator, I want to see guest bookings alongside account bookings in all admin views, so that I have a complete picture of session participants and capacity.

#### Acceptance Criteria

1. THE Admin_Booking_List SHALL display guest bookings alongside authenticated bookings without errors when `bookedByUid` is absent.
2. THE Admin_Booking_List SHALL display a booking mode indicator (`account` or `guest`) and a source label for each booking.
3. THE Admin_Session_View SHALL include guest bookings in session participant counts and capacity calculations.
4. THE Admin_Register SHALL display for each participant: student name, age, booking mode, source, booking status, medical flag (yes/no), emergency contact flag (yes/no), authorised collector name, sign-in field, and sign-out field.
5. THE BT_Backend SHALL provide a restricted safety summary view displaying: student name, dietary requirements, allergies, airborne allergies, medication/EpiPen details, medical needs, emergency contact, authorised collector, safety review status, and operational notes.
6. THE Restricted_Safety_Summary SHALL NOT be accessible to unauthenticated users or non-admin/non-instructor roles.

**Priority:** Must have
**Dependencies:** GUEST-FR-009, GUEST-DATA-001

### Requirement 13: Safety Review Workflow

**ID:** GUEST-FR-013

**User Story:** As a BT_Administrator, I want to review medical and allergy declarations from guest bookings, so that I can assess whether accommodations are possible and contact parents if clarification is needed.

#### Acceptance Criteria

1. WHEN a guest booking is created with higher-risk medical or allergy declarations (food allergies, EpiPen required, respiratory problems, airborne allergies, or medical conditions declared), THE BT_Backend SHALL set the `safetyReviewStatus` to `pending`.
2. WHEN a guest booking has no higher-risk declarations, THE BT_Backend SHALL set the `safetyReviewStatus` to `not_required`.
3. THE Admin_Safety_Queue SHALL display all bookings with `safetyReviewStatus` of `pending` or `contact_parent`.
4. THE BT_Administrator SHALL be able to update the safety review status to: `reviewed`, `contact_parent`, or `cannot_accommodate`.
5. THE BT_Administrator SHALL be able to add operational notes and identify follow-up actions on the safety review.

**Priority:** Must have
**Dependencies:** GUEST-FR-009, GUEST-FR-012

### Requirement 14: Website and WhatsApp Entry Points

**ID:** GUEST-FR-014

**User Story:** As a Parent_Guardian, I want to see a "Book as a guest — no account required" option on the website, so that I know I can book without signing up.

#### Acceptance Criteria

1. WHILE the Feature_Flag is enabled, THE Website SHALL display a "Book as a guest — no account required" option alongside existing sign-in and register options on session booking entry points.
2. WHILE the Feature_Flag is disabled, THE Website SHALL NOT display any guest booking options or buttons.
3. THE BT_Administrator SHALL be able to copy guest booking links (website and WhatsApp-formatted) for specific sessions from the admin panel.
4. THE Guest_Booking_Links SHALL NOT contain personal or medical information.

**Priority:** Must have
**Dependencies:** GUEST-FR-016

### Requirement 15: Stripe Payment Element Integration

**ID:** GUEST-FR-015

**User Story:** As a Parent_Guardian, I want to pay securely using a familiar payment interface, so that I can complete my booking with confidence.

#### Acceptance Criteria

1. THE Express_Checkout_Form SHALL use the Stripe Payment Element (not Payment Links or Checkout Sessions) for collecting payment details.
2. WHEN the `clientSecret` is returned from the Guest_Payment_API, THE Express_Checkout_Form SHALL initialise the Stripe Payment Element with the provided secret.
3. WHEN payment confirmation succeeds, THE Express_Checkout_Form SHALL redirect to the guest confirmation page.
4. IF payment fails with a card or validation error, THEN THE Express_Checkout_Form SHALL display the error message to the Parent_Guardian and allow retry.

**Priority:** Must have
**Dependencies:** GUEST-FR-008

### Requirement 16: Feature Flag Control

**ID:** GUEST-FR-016

**User Story:** As a BT_Administrator, I want guest checkout to be controlled by a feature flag, so that the feature can be tested in Preview without affecting production.

#### Acceptance Criteria

1. THE BT_Backend SHALL use the environment variable `NEXT_PUBLIC_GUEST_CHECKOUT_ENABLED` to control guest checkout availability.
2. WHILE the Feature_Flag is set to `false` or is absent, THE Express_Checkout_Form route SHALL reject all booking attempts and return a "feature not available" response.
3. WHILE the Feature_Flag is disabled, THE Website SHALL NOT display guest booking buttons or advertise guest booking links.
4. WHILE the Feature_Flag is disabled, THE Guest_Payment_API SHALL reject all requests with a 403 response.
5. WHILE the Feature_Flag is disabled, THE authenticated booking journey SHALL remain completely unaffected.
6. THE Feature_Flag SHALL be set to `true` for Vercel Preview deployments and `false` for production deployment.

**Priority:** Must have
**Dependencies:** None

### Requirement 17: No Fake Firebase User Creation

**ID:** GUEST-FR-017

**User Story:** As the BT_Backend, I want to avoid creating dummy Firebase accounts for guest bookings, so that the user management system remains clean and accurate.

#### Acceptance Criteria

1. THE BT_Backend SHALL NOT create a Firebase Authentication user for guest bookings.
2. THE BT_Backend SHALL NOT generate or assign a fake Firebase UID to guest booking documents.
3. THE Guest_Booking document SHALL store a `bookingMode: 'guest'` field to distinguish from authenticated bookings.
4. THE Guest_Booking document SHALL store parent contact details as an embedded `guestContact` object rather than referencing a `users/{uid}` document.

**Priority:** Must have
**Dependencies:** GUEST-FR-009

### Requirement 18: Guest Booking Data Model

**ID:** GUEST-DATA-001

**User Story:** As the BT_Backend, I want a well-defined data model for guest bookings, so that all necessary information is captured and queryable by admin views.

#### Acceptance Criteria

1. THE Guest_Booking document SHALL include the field `bookingMode` with value `account` or `guest`.
2. THE Guest_Booking document SHALL include the field `bookingSource` with one of: `website`, `website_express`, `whatsapp_express`, `facebook_express`, `instagram_express`, `qr_express`, `google_express`, `unknown`.
3. THE Guest_Booking document SHALL include a `guestContact` object containing: `firstName`, `lastName`, `email`, and `telephone`.
4. THE Guest_Booking document SHALL include a `childSnapshot` object containing: `firstName`, `lastName`, and `dateOfBirth`.
5. THE Guest_Booking document SHALL include a `medicalSnapshot` object containing the full medical information declared at booking time.
6. THE Guest_Booking document SHALL include an `allergyDietarySnapshot` object containing food allergy, dietary requirement, and airborne allergy details.
7. THE Guest_Booking document SHALL include an `emergencyContactSnapshot` object containing: name, relationship, mobile, alternative number, and email.
8. THE Guest_Booking document SHALL include an `authorisedCollectorSnapshot` object containing: name, relationship, phone, and same-as-parent indicator.
9. THE Guest_Booking document SHALL include a `consentAudit` object containing: each individual mandatory consent value, each optional consent value, acceptance timestamp, consent version identifiers, accepted-by name, source channel, and submission timestamp.
10. THE Guest_Booking document SHALL include a `safetyReviewStatus` field with initial value set by the webhook based on medical declarations.
11. THE Guest_Booking document SHALL include a `sessionSnapshot` object containing: session ID, class name, class type, date, time, venue, and price at time of booking.
12. THE Guest_Booking document SHALL include a `payment` object consistent with the existing booking payment structure.

**Priority:** Must have
**Dependencies:** None

### Requirement 19: Booking Draft for Guest Checkout

**ID:** GUEST-DATA-002

**User Story:** As the BT_Backend, I want to persist the complete guest booking payload in a draft document, so that the webhook can create the full booking without relying on client state.

#### Acceptance Criteria

1. THE Guest_Payment_API SHALL create a `booking_drafts/{paymentIntentId}` document containing the complete validated payload: guest contact, child details, medical info, allergy/dietary details, emergency contact, authorised collector, consent audit, session ID, booking mode, and source.
2. THE Booking_Draft document SHALL have the same ID as the Stripe PaymentIntent ID for idempotent lookup.
3. THE Booking_Draft document SHALL include a `bookingMode: 'guest'` field.
4. THE Booking_Draft document SHALL include a `createdAt` server timestamp.

**Priority:** Must have
**Dependencies:** GUEST-FR-008

### Requirement 20: Consent Audit Trail

**ID:** GUEST-FR-018

**User Story:** As the BT_Backend, I want to maintain a complete audit trail of all consents given during guest checkout, so that the business can demonstrate compliance with data protection requirements.

#### Acceptance Criteria

1. THE BT_Backend SHALL record each individual mandatory consent value (accepted: true/false) separately in the consent audit.
2. THE BT_Backend SHALL record each individual optional consent value (photography, email marketing, WhatsApp marketing) separately in the consent audit.
3. THE BT_Backend SHALL record the timestamp of consent acceptance with server-side precision.
4. THE BT_Backend SHALL record the consent document version identifiers (Terms version, Privacy Notice version) active at the time of acceptance.
5. THE BT_Backend SHALL record the full name of the person who accepted the consents (from the parent details).
6. THE BT_Backend SHALL record the source channel through which consent was given.
7. THE BT_Backend SHALL record the form submission timestamp.

**Priority:** Must have
**Dependencies:** GUEST-FR-006

### Requirement 21: Payment Idempotency and Duplicate Prevention

**ID:** GUEST-FR-019

**User Story:** As the BT_Backend, I want to prevent duplicate payments and bookings from rapid form resubmission, so that parents are not charged twice and capacity is not double-decremented.

#### Acceptance Criteria

1. THE Guest_Payment_API SHALL generate a unique submission reference for each payment initiation request.
2. THE Guest_Payment_API SHALL reject duplicate submissions using the same reference within a reasonable time window.
3. THE BT_Backend SHALL use Stripe's built-in PaymentIntent idempotency to prevent duplicate charges.
4. THE Stripe_Webhook_Handler SHALL create at most one booking document per PaymentIntent ID regardless of how many webhook events are received.
5. THE Stripe_Webhook_Handler SHALL decrement `spotsAvailable` at most once per PaymentIntent ID.

**Priority:** Must have
**Dependencies:** GUEST-FR-008, GUEST-FR-009

### Requirement 22: Bot Protection and Rate Limiting

**ID:** GUEST-SEC-001

**User Story:** As the BT_Backend, I want to protect the guest payment API from automated abuse, so that bots cannot exhaust session capacity or generate fraudulent payment attempts.

#### Acceptance Criteria

1. THE Guest_Payment_API SHALL implement server-side CAPTCHA or bot verification before processing payment requests.
2. THE Guest_Payment_API SHALL enforce rate limiting per IP address to prevent abuse.
3. THE Guest_Payment_API SHALL enforce a maximum request payload size to prevent oversized submissions.
4. IF bot verification fails, THEN THE Guest_Payment_API SHALL reject the request with a generic error message that does not reveal internal details.
5. THE Guest_Payment_API SHALL NOT include stack traces, internal paths, or medical information in error responses.

**Priority:** Must have
**Dependencies:** None

### Requirement 23: Medical Data Protection

**ID:** GUEST-SEC-002

**User Story:** As the BT_Backend, I want to ensure medical and allergy data is never exposed through insecure channels, so that children's health information remains confidential.

#### Acceptance Criteria

1. THE BT_Backend SHALL NOT include medical or allergy data in Stripe PaymentIntent metadata.
2. THE BT_Backend SHALL NOT include medical or allergy data in URL parameters or query strings.
3. THE BT_Backend SHALL NOT log medical or allergy data in application logs or error reports.
4. THE BT_Backend SHALL NOT include medical or allergy data in analytics events or tracking pixels.
5. THE BT_Backend SHALL NOT include medical or allergy data in confirmation emails or WhatsApp messages.
6. THE Firestore_Security_Rules SHALL prevent unauthenticated clients from reading guest booking documents containing medical data.
7. THE Firestore_Security_Rules SHALL restrict medical data access to admin and authorised instructor roles.

**Priority:** Must have
**Dependencies:** GUEST-DATA-001

### Requirement 24: Firestore Security Rules for Guest Data

**ID:** GUEST-SEC-003

**User Story:** As the BT_Backend, I want Firestore security rules to protect guest booking data, so that sensitive information is only accessible to authorised admin users.

#### Acceptance Criteria

1. THE Firestore_Security_Rules SHALL deny all client-side reads and writes to `booking_drafts/{docId}` documents (existing rule preserved).
2. THE Firestore_Security_Rules SHALL deny unauthenticated client-side reads of `bookings/{docId}` documents for guest bookings (no `bookedByUid` to match).
3. THE Firestore_Security_Rules SHALL allow admin-role users to read all booking documents including guest bookings.
4. THE Firestore_Security_Rules SHALL preserve existing authenticated booking access rules (users can read their own bookings by `bookedByUid`).
5. THE Firestore_Security_Rules SHALL NOT create a new publicly readable collection for guest booking data.

**Priority:** Must have
**Dependencies:** GUEST-DATA-001

### Requirement 25: Guest Confirmation Page Security

**ID:** GUEST-SEC-004

**User Story:** As the BT_Backend, I want the guest confirmation page to access booking status securely without exposing reusable tokens, so that booking details are not accessible to third parties.

#### Acceptance Criteria

1. THE Guest_Confirmation_Page SHALL NOT include long-lived secrets or bearer tokens in the URL.
2. THE BT_Backend SHALL provide a short-lived, server-mediated mechanism for the confirmation page to check booking status.
3. THE Guest_Confirmation_Page SHALL display only non-sensitive summary information (reference, child first name, class, date, time, venue, amount).
4. THE Guest_Confirmation_Page SHALL NOT display detailed medical, allergy, or emergency contact information.

**Priority:** Must have
**Dependencies:** GUEST-FR-010

### Requirement 26: Admin Register View

**ID:** GUEST-OPS-001

**User Story:** As a BT_Administrator or Instructor, I want a session register that includes guest-booked participants, so that I have a complete attendance and safety record for the session.

#### Acceptance Criteria

1. THE Admin_Register SHALL display all participants for a session regardless of booking mode (account or guest).
2. THE Admin_Register SHALL display for each participant: student name, calculated age, booking mode badge, source label, booking status, medical flag indicator, emergency contact flag indicator, authorised collector name, sign-in time field, and sign-out time field.
3. THE Admin_Register SHALL NOT assume every booking has a `bookedByUid` field.
4. WHEN a booking has `bookingMode: 'guest'`, THE Admin_Register SHALL display the guest contact name in place of the linked user profile name.

**Priority:** Must have
**Dependencies:** GUEST-FR-012, GUEST-DATA-001

### Requirement 27: Admin Guest Link Management

**ID:** GUEST-OPS-002

**User Story:** As a BT_Administrator, I want to easily generate and copy guest booking links for sessions, so that I can distribute them through WhatsApp and social media quickly.

#### Acceptance Criteria

1. THE Admin_Session_View SHALL provide a "Copy Guest Link" action for each open session when the Feature_Flag is enabled.
2. THE Admin_Session_View SHALL provide a "Copy WhatsApp Link" action that formats the guest URL with WhatsApp share protocol.
3. WHILE the Feature_Flag is disabled, THE Admin_Session_View SHALL NOT display guest link actions.
4. THE Generated_Links SHALL contain only the session ID and source parameter; no personal or medical data.

**Priority:** Should have
**Dependencies:** GUEST-FR-016

### Requirement 28: Mobile-First Multi-Step Form

**ID:** GUEST-UX-001

**User Story:** As a Parent_Guardian using a mobile phone, I want the guest booking form to be optimised for small screens, so that I can complete the booking easily on my phone after tapping a WhatsApp link.

#### Acceptance Criteria

1. THE Express_Checkout_Form SHALL be designed mobile-first with a responsive layout that works on screens from 320px width upward.
2. THE Express_Checkout_Form SHALL display a clear progress indicator showing the current step and total steps.
3. THE Express_Checkout_Form SHALL preserve all entered data when navigating between steps without page reloads.
4. THE Express_Checkout_Form SHALL use touch-friendly input sizes (minimum 44px tap targets) and appropriate mobile keyboard types (email, tel, date).
5. THE Express_Checkout_Form SHALL be fully keyboard-accessible with logical tab order and visible focus indicators.
6. THE Express_Checkout_Form SHALL display clear, specific error messages adjacent to the relevant form fields.
7. IF a validation error occurs, THEN THE Express_Checkout_Form SHALL scroll to and focus the first invalid field.

**Priority:** Must have
**Dependencies:** GUEST-FR-001

### Requirement 29: No Login Required Messaging

**ID:** GUEST-UX-002

**User Story:** As a Parent_Guardian, I want to clearly understand that no account is required, so that I feel confident proceeding without wondering if I need to sign up first.

#### Acceptance Criteria

1. THE Express_Checkout_Form SHALL display a visible "No account required" message on the initial session information display.
2. THE Express_Checkout_Form SHALL NOT display login, signup, or authentication prompts at any point during the guest journey.
3. WHILE the Feature_Flag is enabled on public session pages, THE Website SHALL display "Book as a guest — no account required" as an alternative to the existing authenticated booking path.

**Priority:** Should have
**Dependencies:** GUEST-FR-001

### Requirement 30: Blocked Session Messaging

**ID:** GUEST-UX-003

**User Story:** As a Parent_Guardian, I want to receive clear, helpful messages when a session cannot be booked, so that I understand why and know what to do next.

#### Acceptance Criteria

1. WHEN the session is full, THE Express_Checkout_Form SHALL display "This session is fully booked" with a suggestion to check other available sessions.
2. WHEN the session is cancelled, THE Express_Checkout_Form SHALL display "This session has been cancelled" with a contact suggestion.
3. WHEN the session date has passed, THE Express_Checkout_Form SHALL display "This session has already taken place."
4. WHEN the feature flag is disabled, THE Express_Checkout_Form SHALL display "Guest booking is not currently available."
5. WHEN the session does not exist, THE Express_Checkout_Form SHALL display "Session not found. Please check the link is correct."

**Priority:** Must have
**Dependencies:** GUEST-FR-002

### Requirement 31: Preview Branch and Environment

**ID:** GUEST-DEP-001

**User Story:** As the BT_Backend development team, I want guest checkout deployed to a Preview environment first, so that it can be thoroughly tested without risking production data or payments.

#### Acceptance Criteria

1. THE Guest_Checkout feature SHALL be developed on branch `feature/guest-express-checkout`.
2. THE Feature_Branch SHALL deploy to Vercel Preview using Preview-scoped environment variables.
3. THE Preview_Deployment SHALL use Stripe test API keys (`pk_test_*`, `sk_test_*`).
4. THE Preview_Deployment SHALL use a staging Firebase project or Firebase Emulator for data storage.
5. THE Preview_Deployment SHALL use safe test email recipients; confirmation emails SHALL NOT be sent to real parent email addresses.
6. THE Preview_Deployment SHALL configure a separate Stripe test webhook endpoint for `payment_intent.succeeded` and `payment_intent.payment_failed` events.
7. THE Production_Deployment SHALL require separate approval and SHALL NOT occur as part of the initial feature merge.

**Priority:** Must have
**Dependencies:** Safe Deployment Workflow spec (existing)

### Requirement 32: Guest Payment API Test Coverage

**ID:** GUEST-TEST-001

**User Story:** As the development team, I want comprehensive tests for the guest payment API, so that edge cases and security concerns are verified before deployment.

#### Acceptance Criteria

1. THE Test_Suite SHALL verify that requests with an invalid session ID return a 400 error.
2. THE Test_Suite SHALL verify that requests for a closed session return a 400 error.
3. THE Test_Suite SHALL verify that requests for a cancelled session return a 400 error.
4. THE Test_Suite SHALL verify that requests for a full session (spotsAvailable = 0) return a 400 error.
5. THE Test_Suite SHALL verify that requests for a past session return a 400 error.
6. THE Test_Suite SHALL verify that a client-supplied amount value is ignored and the Firestore price is used.
7. THE Test_Suite SHALL verify that an underage child (below session ageMin) is rejected.
8. THE Test_Suite SHALL verify that an overage child (above session ageMax) is rejected.
9. THE Test_Suite SHALL verify that missing mandatory consents result in a 400 error.
10. THE Test_Suite SHALL verify that invalid emergency contact data is rejected.
11. THE Test_Suite SHALL verify that bot verification failure results in rejection.
12. THE Test_Suite SHALL verify that rate-limited requests receive a 429 response.
13. THE Test_Suite SHALL verify that duplicate submission references are rejected.
14. THE Test_Suite SHALL verify that a failed draft Firestore write results in PaymentIntent cancellation.
15. THE Test_Suite SHALL verify that Stripe metadata contains no personal or medical data.

**Priority:** Must have
**Dependencies:** GUEST-FR-008

### Requirement 33: Webhook Test Coverage

**ID:** GUEST-TEST-002

**User Story:** As the development team, I want comprehensive webhook tests, so that guest booking creation is verified under all edge cases.

#### Acceptance Criteria

1. THE Test_Suite SHALL verify successful guest booking creation with correct embedded snapshots.
2. THE Test_Suite SHALL verify that `spotsAvailable` is decremented exactly once per successful booking.
3. THE Test_Suite SHALL verify that duplicate webhook events do not create duplicate bookings or decrements.
4. THE Test_Suite SHALL verify that `payment_intent.payment_failed` events do not create booking documents.
5. THE Test_Suite SHALL verify correct handling when a draft document is missing.
6. THE Test_Suite SHALL verify that confirmation email is sent with correct non-sensitive content.
7. THE Test_Suite SHALL verify that existing authenticated booking webhook processing is not regressed.
8. THE Test_Suite SHALL verify that `safetyReviewStatus` is set correctly based on medical declarations.

**Priority:** Must have
**Dependencies:** GUEST-FR-009

### Requirement 34: Firestore Security Rules Test Coverage

**ID:** GUEST-TEST-003

**User Story:** As the development team, I want security rules tested, so that guest data access is correctly restricted.

#### Acceptance Criteria

1. THE Test_Suite SHALL verify that unauthenticated clients cannot read `booking_drafts` documents.
2. THE Test_Suite SHALL verify that unauthenticated clients cannot read guest booking documents.
3. THE Test_Suite SHALL verify that guest booking medical data is not accessible to unauthenticated clients.
4. THE Test_Suite SHALL verify that existing authenticated booking access (read own, cancel own) is preserved.
5. THE Test_Suite SHALL verify that admin users can read all booking documents including guest bookings.

**Priority:** Must have
**Dependencies:** GUEST-SEC-003

### Requirement 35: UI and Accessibility Test Coverage

**ID:** GUEST-TEST-004

**User Story:** As the development team, I want UI behaviour verified, so that the guest form works correctly across scenarios.

#### Acceptance Criteria

1. THE Test_Suite SHALL verify that the guest route is accessible without Firebase login.
2. THE Test_Suite SHALL verify that guest booking UI is hidden when the feature flag is disabled.
3. THE Test_Suite SHALL verify that mandatory consents are enforced before payment.
4. THE Test_Suite SHALL verify that optional consents remain optional (not pre-ticked).
5. THE Test_Suite SHALL verify that form state is preserved when navigating between steps.
6. THE Test_Suite SHALL verify that payment is gated until all conditions are met.
7. THE Test_Suite SHALL verify mobile usability on 320px viewport.
8. THE Test_Suite SHALL verify keyboard accessibility with logical tab order.
9. THE Test_Suite SHALL verify that clear error messages are displayed for validation failures.
10. THE Test_Suite SHALL verify that blocked sessions (full, cancelled, past, closed) display appropriate messages.

**Priority:** Must have
**Dependencies:** GUEST-UX-001

### Requirement 36: Preview End-to-End Acceptance

**ID:** GUEST-TEST-005

**User Story:** As the development team, I want a full end-to-end acceptance test on Preview, so that the complete guest journey is verified before production consideration.

#### Acceptance Criteria

1. THE Acceptance_Test SHALL verify the following end-to-end journey on the Preview deployment:
   - Step 1: Open guest booking link with source parameter — page loads without login
   - Step 2: Session info displays correctly (price, date, time, venue, availability)
   - Step 3: Enter valid parent details and child details
   - Step 4: Age validation passes for eligible child
   - Step 5: Enter medical information with conditional fields
   - Step 6: Enter emergency contact and authorised collector
   - Step 7: Accept all mandatory consents, leave optional consents unticked
   - Step 8: Review summary displays all entered data correctly
   - Step 9: Payment Element renders and accepts test card 4242424242424242
   - Step 10: Payment succeeds
   - Step 11: Confirmation page shows "finalising" then booking details
   - Step 12: Confirmation email received by test recipient
   - Step 13: Booking appears in admin booking list with guest mode and source label
   - Step 14: Session spots decremented by exactly one
   - Step 15: Safety review status set to pending (if medical declarations made)
   - Step 16: Admin register shows guest participant with all fields
   - Step 17: Restricted safety summary accessible to admin
   - Step 18: Repeat payment with same session — verify no duplicate
   - Step 19: Attempt booking for full session — verify rejection
   - Step 20: Attempt booking for cancelled session — verify rejection
   - Step 21: Attempt booking with feature flag disabled — verify rejection
   - Step 22: Verify existing authenticated booking flow is unaffected
   - Step 23: Verify no medical data in Stripe metadata
   - Step 24: Verify no medical data in confirmation email

**Priority:** Must have
**Dependencies:** All functional requirements

### Requirement 37: Abandoned Draft Cleanup

**ID:** GUEST-OPS-003

**User Story:** As the BT_Backend, I want abandoned booking drafts to be cleaned up, so that stale data does not accumulate in Firestore.

#### Acceptance Criteria

1. THE BT_Backend SHALL provide a mechanism to identify and archive or delete booking draft documents older than 24 hours that have not been processed by the webhook.
2. THE Cleanup_Mechanism SHALL NOT delete drafts for PaymentIntents that are still in a `requires_payment_method` or `requires_confirmation` state.

**Priority:** Could have
**Dependencies:** GUEST-DATA-002

### Requirement 38: Error Monitoring

**ID:** GUEST-OPS-004

**User Story:** As the BT_Backend, I want safe error reporting that does not expose sensitive data, so that operational issues can be diagnosed without compromising privacy.

#### Acceptance Criteria

1. THE BT_Backend SHALL log errors from the Guest_Payment_API and webhook without including medical data, allergy details, or full personal information in log messages.
2. THE BT_Backend SHALL include the PaymentIntent ID, session ID, and error type in log messages for debugging.
3. IF an error occurs during guest checkout, THEN THE Express_Checkout_Form SHALL display a generic user-friendly error message without revealing internal system details.

**Priority:** Must have
**Dependencies:** GUEST-FR-008

### Requirement 39: Non-Functional Performance and Compatibility

**ID:** GUEST-NFR-001

**User Story:** As a Parent_Guardian, I want the guest checkout to be fast and work on my device, so that I can complete the booking without frustration.

#### Acceptance Criteria

1. THE Guest_Payment_API SHALL respond within 3 seconds under normal load for payment intent creation (including Firestore read + Stripe API call).
2. THE Express_Checkout_Form SHALL achieve a Lighthouse Performance score of 70 or above on mobile.
3. THE Guest_Confirmation_Page SHALL resolve booking status within 15 seconds of payment completion under normal webhook latency.
4. THE Express_Checkout_Form SHALL gracefully degrade when Stripe Payment Element fails to load, showing a clear error and retry option.
5. IF the Firebase Admin SDK is not initialised, THEN THE Guest_Payment_API SHALL return a 500 error with a user-friendly message rather than crashing.
6. THE Express_Checkout_Form SHALL function correctly in the latest versions of Safari (iOS), Chrome (Android), Chrome (desktop), Firefox, and Edge.

**Priority:** Must have
**Dependencies:** GUEST-FR-001, GUEST-FR-008

## Non-Goals

The following items are explicitly out of scope for this feature:

1. **Guest bundle booking** — Guests can only book single sessions, not bundles.
2. **Native WhatsApp API integration** — Links are shareable via WhatsApp but no WhatsApp Business API is used.
3. **WhatsApp Flows** — No in-WhatsApp booking forms.
4. **Automated outbound WhatsApp confirmations** — Confirmation is via email only.
5. **PayPal or alternative payment providers** — Stripe only.
6. **Automatic guest-to-account creation** — Guest bookings do not create Firebase accounts.
7. **Guest self-service cancellation** — Guests must contact Blooming Tastebuds to cancel.
8. **Guest booking management portal** — No post-booking guest dashboard.
9. **Health data in WhatsApp or Stripe** — Medical info never leaves the secure backend.
10. **Replacing the authenticated booking flow** — The existing authenticated journey remains unchanged and primary.
11. **Direct production deployment** — Feature ships to Preview only; production requires separate approval.
12. **Production Stripe or Firestore changes** — All testing uses test-mode/dev resources.

## Assumptions

1. The Safe Deployment Workflow (existing spec) is implemented, providing Preview deployments with isolated environment variables.
2. A staging Firebase project (`bt-mvp-dev`) or Firebase Emulator is available for Preview testing.
3. Stripe test mode is configured for Preview deployments with test webhook endpoints.
4. The existing `booking_drafts` Firestore collection and security rules are adequate for guest drafts (same deny-all client access pattern).
5. Resend email service can be configured with test recipients for Preview.
6. The existing CSS Modules + globals.css design system is sufficient for the guest form UI (no new CSS framework needed).
7. React Hook Form + Zod will be used for form management and validation (consistent with existing codebase patterns).
8. Children's ages are calculated from `dateOfBirth` relative to the session date.
9. The existing Stripe Payment Element integration pattern (from `CheckoutForm.tsx`) can be reused for the guest form.
10. Prices continue to be stored in pence (integer) in Firestore.

## Risks

| # | Risk | Impact | Likelihood | Mitigation |
|---|------|--------|------------|------------|
| 1 | Processing children's health information without proper legal basis | Regulatory action, loss of trust | Low (consents collected) | Explicit health data processing consent; minimal data in external systems |
| 2 | Duplicate payment submissions creating multiple bookings | Financial loss, admin confusion | Medium | Idempotency keys, PaymentIntent-based booking IDs, duplicate webhook handling |
| 3 | Payment succeeds but webhook fails — parent charged with no booking | Poor customer experience | Low | Draft-based recovery; admin notification; manual intervention procedure |
| 4 | Guest booking data accessible to unauthorised users | Data breach | Low | Firestore deny-all for drafts; admin-only for guest bookings; no client-side reads |
| 5 | Session oversold due to race condition between availability check and webhook | Overbooking | Low | Firestore transaction with atomic decrement; overbooking flag for manual review |
| 6 | Incomplete allergy information leading to safety incident | Child safety | Medium | Clear form guidance; mandatory fields; safety review workflow; disclaimer |
| 7 | Medical data inadvertently exposed in logs, emails, or Stripe metadata | Privacy breach | Low | Explicit exclusion rules; no medical data in Stripe metadata; email content review |
| 8 | Preview deployment accidentally using production Firebase or Stripe config | Real data corruption, real charges | Low | Environment variable scoping (Vercel Preview scope); feature flag enforcement |
| 9 | Admin reports break due to assumption of `bookedByUid` on all bookings | Admin panel errors | Medium | Null-safe access patterns; bookingMode field; explicit guest contact fallback |
| 10 | Email delivery failures leaving parents without confirmation | Poor experience | Low | Retry logic; admin notification of failures; confirmation page shows reference |
| 11 | Abandoned drafts accumulating in Firestore | Storage costs, confusion | Low | Draft cleanup mechanism (operational requirement) |
| 12 | Rate-limit state management in serverless (no persistent process) | Rate limiting ineffective | Medium | External rate-limit store (Vercel KV, Upstash) or header-based approaches |

## Open Questions

| # | Question | Impact | Suggested Resolution |
|---|----------|--------|---------------------|
| 1 | What are the exact mandatory vs optional medical fields for the guest form? | Form design, validation logic | Align with existing `MedicalInfo` type + extended allergy fields |
| 2 | What is the approved wording for the photography/promotional consent? | Consent form content | Obtain from Blooming Tastebuds legal/compliance |
| 3 | What is the current version identifier for the Terms and Conditions? | Consent audit recording | Use document revision date or version number |
| 4 | What is the current version identifier for the Privacy Notice? | Consent audit recording | Use document revision date or version number |
| 5 | Are authorised collectors mandatory or optional for guest bookings? | Form validation | Recommend mandatory (matches existing safety requirements) |
| 6 | How should the child's age be calculated — at booking time or at session date? | Age validation logic | Calculate age at session date (more accurate) |
| 7 | What are the data retention periods for guest booking and medical data? | Storage, compliance | Define based on UK GDPR requirements for children's data |
| 8 | Should payment be blocked if severe safety declarations are made (e.g., cannot_accommodate)? | Business logic, UX | Allow payment; safety review happens post-booking (payment is refundable) |
| 9 | Which staff roles should access the restricted safety summary? | Access control, Firestore rules | Admin and designated instructors for their sessions |
| 10 | Will instructors have a separate portal in this MVP phase? | Instructor access to register | Defer; admin prints/shares register for now |
| 11 | What is the preferred CAPTCHA provider (reCAPTCHA, Turnstile, hCaptcha)? | Implementation choice | Recommend Cloudflare Turnstile (free, privacy-respecting) |
| 12 | Is the staging Firebase project (`bt-mvp-dev`) already provisioned? | Preview deployment readiness | Check Safe Deployment Workflow spec status |
| 13 | Who are the approved Preview email recipients for test confirmations? | Email testing | Blooming Tastebuds team email addresses |

## Requirement Traceability Summary

| Journey Stage | Requirement IDs | System Area |
|---------------|----------------|-------------|
| Parent opens guest link | GUEST-FR-001, GUEST-FR-016, GUEST-UX-002 | Route, Feature Flag, UI |
| Session info displayed | GUEST-FR-001, GUEST-FR-002, GUEST-UX-003 | Route, Validation, UI |
| Parent/child details entered | GUEST-FR-003, GUEST-UX-001 | Form Step 1, Validation |
| Age validation | GUEST-FR-003 | Form Step 1, Validation |
| Medical/allergy details | GUEST-FR-004, GUEST-SEC-002 | Form Step 2, Data Protection |
| Emergency contact + collector | GUEST-FR-005 | Form Step 3 |
| Consent collection | GUEST-FR-006, GUEST-FR-018 | Form Step 4, Audit |
| Review summary | GUEST-FR-007 | Form Step 5, UI |
| Payment gating | GUEST-FR-007, GUEST-FR-008 | Validation, API |
| Stripe Payment Element | GUEST-FR-015 | Payment UI |
| Payment API call | GUEST-FR-008, GUEST-SEC-001, GUEST-FR-019 | API, Security, Idempotency |
| Bot protection | GUEST-SEC-001 | API Security |
| Draft creation | GUEST-DATA-002 | Firestore |
| Payment completed | GUEST-FR-015 | Stripe |
| Webhook fires | GUEST-FR-009, GUEST-FR-019 | Webhook, Idempotency |
| Booking created | GUEST-FR-009, GUEST-DATA-001, GUEST-FR-017 | Webhook, Data Model |
| Capacity decremented | GUEST-FR-009 | Webhook, Firestore Transaction |
| Safety review status set | GUEST-FR-013 | Webhook, Admin |
| Confirmation email sent | GUEST-FR-011 | Webhook, Email |
| Guest confirmation page | GUEST-FR-010, GUEST-SEC-004 | UI, Security |
| Admin booking list | GUEST-FR-012, GUEST-OPS-001 | Admin UI |
| Admin register | GUEST-OPS-001 | Admin UI |
| Restricted safety summary | GUEST-FR-012, GUEST-SEC-002 | Admin UI, Security |
| Admin link distribution | GUEST-FR-014, GUEST-OPS-002 | Admin UI |
| Feature flag control | GUEST-FR-016 | Config, All Areas |
| Preview deployment | GUEST-DEP-001 | Infrastructure |
| Testing | GUEST-TEST-001 to GUEST-TEST-005 | QA |
| Firestore security | GUEST-SEC-003 | Security Rules |
| Data protection | GUEST-SEC-002 | All Areas |
| Error handling | GUEST-OPS-004 | API, Webhook, UI |
| Abandoned drafts | GUEST-OPS-003 | Operations |

## Definition of Done for the Requirements Phase

- [ ] All functional requirements reviewed and approved by stakeholder
- [ ] All acceptance criteria follow EARS patterns (WHEN/IF/WHILE/WHERE/THE...SHALL)
- [ ] All system names defined in the Glossary
- [ ] No vague or unmeasurable terms in acceptance criteria
- [ ] Each requirement tests one concept
- [ ] Open questions documented with suggested resolutions
- [ ] Risks identified with mitigations
- [ ] Non-goals explicitly stated
- [ ] Traceability matrix maps complete user journey to requirements
- [ ] No conflicts between requirements identified
- [ ] Data model requirements are consistent with existing codebase types
- [ ] Security requirements cover all sensitive data flows
- [ ] Testing requirements cover all critical paths
