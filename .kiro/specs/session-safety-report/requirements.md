# Requirements Document: Admin Session Register and Safety Report

## 1. Purpose

Provide Blooming Tastebuds administrators with a dedicated "Session Register and Safety Report" view for any individual session. The report combines confirmed booking data, student attendance details, medical/allergy declarations, emergency contacts, and authorised collectors into a structured operational document that supports safe session delivery. The feature separates an ordinary session register (suitable for display at the venue) from a restricted safety summary containing sensitive health information, ensuring appropriate access control, privacy, and auditability.

## 2. Background

Blooming Tastebuds runs children's cooking classes where instructors handle allergens, sharp tools, and heat. Safe session delivery requires the admin/instructor to know — before the session starts — which children have medical conditions, food or airborne allergies, EpiPen requirements, medication, respiratory issues, or support needs. Currently, this information is stored per-booking in Firestore (`medicalInfo`, `emergencyContact`, `questionnaire` fields on booking documents and, for account bookings, on linked `students/{id}` profiles). There is no consolidated session-level view that aggregates all participants' safety information into a printable, auditable register.

The upcoming guest-express-checkout feature (spec: `guest-express-checkout`) introduces guest bookings with richer embedded safety data (`medicalSnapshot`, `allergyDietarySnapshot`, `emergencyContactSnapshot`, `authorisedCollectorSnapshot`, `safetyReviewStatus`). This feature must handle both existing account-booking data structures and the new guest-booking data model seamlessly.

## 3. Current-State Summary

| Aspect | Current State |
|--------|--------------|
| Admin session list | `/admin/sessions` — CRUD for session dates; no per-session register view |
| Admin bookings | `/admin/bookings` — flat list of all bookings; search/filter by student name or booking ID |
| Booking data model | `bookings/{piId}` contains `medicalInfo`, `emergencyContact`, `questionnaire`, `studentName`, `bookedByUid`, `bookedByName`, `sessionId`, `status` |
| Guest bookings (planned) | `bookingMode: 'guest'`, embedded `guestContact`, `childSnapshot`, `medicalSnapshot`, `allergyDietarySnapshot`, `emergencyContactSnapshot`, `authorisedCollectorSnapshot`, `safetyReviewStatus` |
| Account bookings | `bookedByUid` links to `users/{uid}`; `studentId` links to `students/{id}` (contains `medicalInfo`, `emergencyContact`, `questionnaire`) |
| Safety review | Planned in guest spec (GUEST-FR-013): `safetyReviewStatus` enum, admin queue |
| Session register | Does not exist |
| Print/export | No print or export capability in admin panel |
| Instructor access | No instructor-specific portal or restricted data view |
| Audit logging | No audit trail for data access or report generation |

## 4. Feature Scope

**In scope:**
- Session Register view accessible from the admin sessions page for any individual session
- Report header with session metadata (class, date, time, venue, instructor, capacity, status)
- Ordinary register table: student name, age, booking reference, booking mode, source, status, parent/guardian name, contact number, medical/allergy flag, emergency-contact flag, authorised collector, safety-review status, sign-in/sign-out fields
- Restricted safety summary: detailed medical, allergy, dietary, medication, EpiPen, emergency contact, authorised collector, and operational review information per student
- Session-level safety summary statistics (counts of allergies, EpiPens, medical conditions, etc.)
- Safety review status management (view, update, add notes)
- Searching, sorting, and filtering of the register
- Print-optimised layouts (register and safety report)
- Access control (admin-only; instructor access recorded as open question)
- Audit logging for report views, prints, exports, and review status changes
- Handling of both account bookings and guest bookings (from guest-express-checkout spec)
- Handling of missing/incomplete data with clear messaging
- Error states and empty states

**Out of scope:** See Section 22 (Non-Goals).

## 5. Actors and Personas

| Actor | Description |
|-------|-------------|
| **BT_Administrator** | Blooming Tastebuds staff who manages sessions, reviews bookings, accesses safety information, generates registers, and performs safety reviews. Has full admin access. |
| **Instructor** | Teaching staff assigned to a specific session who may need controlled access to the session register and safety summary for their assigned sessions. Access model is an open question. |
| **Parent_Guardian** | Adult who supplied child, medical, emergency, and collection information during booking. Does NOT have access to the session register or safety report. |
| **Student** | Child attending the session. Subject of the register and safety data. Cannot access the system. |
| **BT_Backend** | The trusted server-side system (Next.js API routes + Firebase Admin SDK) that retrieves, combines, validates, and presents booking/safety data for the report. |

## 6. Primary User Journey

1. BT_Administrator signs in → authenticated with `admin` role
2. Admin navigates to Admin panel → opens Sessions page (`/admin/sessions`)
3. Admin identifies a session by date, class name, venue, and status
4. Admin clicks "Session Register & Safety Report" action for the chosen session
5. System loads all confirmed bookings for that session (account + guest)
6. System displays the **report header** (session metadata, capacity summary, generation timestamp)
7. System displays the **ordinary register** — student list with flags but no medical narratives
8. Admin can search, sort, and filter the register
9. Admin opens the **restricted safety summary** (separate view/section)
10. System displays session-level safety statistics (total students with allergies, EpiPens, conditions, etc.)
11. System displays per-student safety detail (allergy, medical, medication, emergency contact, authorised collector)
12. Admin reviews safety statuses; updates review status and adds restricted notes as needed
13. Admin prints or exports the register and/or safety report for operational use
14. System records audit entry for the view, any print/export, and any review status changes

## 7. Glossary

- **Session_Register**: The ordinary attendance register listing confirmed students for a session with flag indicators but no detailed medical narratives.
- **Safety_Report**: The restricted safety summary containing detailed medical, allergy, medication, emergency contact, and authorised collector information for session participants.
- **Safety_Review_Status**: An enumerated field (`not_required` | `pending` | `reviewed` | `contact_parent` | `cannot_accommodate`) tracking admin review of medical/allergy declarations.
- **Booking_Snapshot**: The medical, emergency, and allergy data captured at booking time and stored on the booking document. This is the authoritative source for the report (not the current student profile).
- **Booking_Mode**: A discriminator field (`account` | `guest`) distinguishing authenticated bookings from guest bookings.
- **Booking_Source**: Metadata recording the channel through which the booking was initiated (e.g., `website`, `whatsapp_express`, `qr_express`).
- **BT_Backend**: The trusted server-side system comprising Next.js API routes and Firebase Admin SDK.
- **Restricted_Note**: An admin-only operational note attached to a student's safety review, never visible to parents.
- **Authorised_Collector**: A named individual permitted to collect the child after the session.
- **Session_Safety_Statistics**: Aggregated counts at the top of the safety report (total with food allergies, airborne allergies, EpiPens, medical conditions, support needs, incomplete contacts, pending reviews, contact-parent, cannot-accommodate).


## 8. Functional Requirements

### Requirement SSR-FR-001: Session Register Entry Point

**ID:** SSR-FR-001
**Title:** Session Register Entry Point from Admin Sessions Page

**User Story:** As a BT_Administrator, I want to access the session register and safety report for any individual session from the sessions management page, so that I can prepare for session delivery.

#### Acceptance Criteria

1. THE Admin_Sessions_Page SHALL display a "Session Register & Safety Report" action for each session in the sessions list.
2. WHEN the BT_Administrator clicks the register action for a session, THE BT_Backend SHALL navigate to the session register view for that specific session.
3. THE Session_Register_View SHALL be accessible at a route that identifies the session by its Firestore document ID.
4. THE Session_Register_View SHALL NOT use guessable sequential IDs or include medical data in URL parameters.

**Priority:** Must have
**Dependencies:** None
**Assumptions:** The admin sessions page (`/admin/sessions`) already exists and lists sessions.

---

### Requirement SSR-FR-002: Report Header and Session Identification

**ID:** SSR-FR-002
**Title:** Report Header with Session Metadata

**User Story:** As a BT_Administrator, I want the register to clearly identify which session it belongs to, so that I can confirm I am viewing the correct session and avoid cross-session confusion.

#### Acceptance Criteria

1. THE Session_Register_View SHALL display a report header containing: class name, recipe name, session date, session time (start and end), venue name, instructor name, session status, number of confirmed students, total capacity (spotsTotal), count of students with allergy/medical flags, report generation timestamp, and the name of the admin who generated the report.
2. THE Report_Header SHALL identify the session unambiguously by displaying at minimum the class name, date, time, and venue.
3. THE BT_Backend SHALL prevent cross-session data mixing by loading bookings exclusively where `booking.sessionId` matches the target session document ID.
4. IF the session document does not exist in Firestore, THEN THE BT_Backend SHALL display a "Session not found" error message.

**Priority:** Must have
**Dependencies:** SSR-FR-001
**Assumptions:** Session documents contain `className`, `recipeName`, `date`, `startTime`, `endTime`, `venueName`, `instructorName`, `status`, `spotsAvailable`, `spotsTotal`.

---

### Requirement SSR-FR-003: Booking Inclusion and Exclusion Rules

**ID:** SSR-FR-003
**Title:** Booking Inclusion and Exclusion Criteria

**User Story:** As a BT_Administrator, I want the register to include only confirmed paid bookings for the target session, so that the attendance list accurately reflects who is expected to attend.

#### Acceptance Criteria

1. THE Session_Register_View SHALL include bookings where `sessionId` matches the target session AND `status` equals `confirmed`.
2. THE Session_Register_View SHALL include both account bookings (`bookingMode: 'account'` or absent) and guest bookings (`bookingMode: 'guest'`).
3. THE Session_Register_View SHALL exclude bookings with status `cancelled`.
4. THE Session_Register_View SHALL exclude bookings with payment status `refunded` or `failed`.
5. THE Session_Register_View SHALL exclude draft bookings (documents in `booking_drafts` collection).
6. THE Session_Register_View SHALL exclude bookings belonging to other sessions.
7. WHEN a BT_Administrator explicitly activates a "Show cancelled" filter, THE Session_Register_View SHALL display cancelled bookings visually distinguished from active bookings (e.g., strikethrough or muted styling).
8. THE Session_Register_View SHALL NOT include cancelled bookings in active student totals or safety statistics.

**Priority:** Must have
**Dependencies:** SSR-FR-001
**Assumptions:** All confirmed bookings have `payment.status: 'paid'`. Cancelled bookings retain `payment.status: 'paid'` but have `status: 'cancelled'`.

---

### Requirement SSR-FR-004: Ordinary Session Register Fields

**ID:** SSR-FR-004
**Title:** Ordinary Register — Student Attendance List

**User Story:** As a BT_Administrator, I want a clear attendance list with key identifiers and safety flags for each student, so that I can manage sign-in/sign-out and quickly identify students needing safety attention without exposing detailed medical narratives.

#### Acceptance Criteria

1. THE Session_Register SHALL display the following columns for each confirmed student: student name, age at session date (calculated from date of birth), booking reference (last 8 characters of PaymentIntent ID, uppercased), booking mode (`account` or `guest`), booking source label, booking status, parent/guardian name, parent/guardian mobile phone number, medical/allergy flag (yes/no indicator), emergency-contact flag (complete/incomplete indicator), authorised collector name, safety-review status badge, sign-in field (time or checkbox), and sign-out field (time or checkbox).
2. THE Session_Register SHALL NOT display detailed medical narratives, allergy specifics, medication details, or emergency contact phone numbers in the ordinary register view.
3. WHEN a booking has `bookingMode: 'guest'`, THE Session_Register SHALL display the `guestContact` name as the parent/guardian and `guestContact.telephone` as the parent mobile.
4. WHEN a booking has `bookingMode: 'account'` (or bookingMode is absent for legacy bookings), THE Session_Register SHALL display `bookedByName` as the parent/guardian name.
5. THE Session_Register SHALL calculate student age at session date using the child's `dateOfBirth` (from `childSnapshot` for guests, or from the linked `students/{id}` document for account bookings, or from the booking medical snapshot).

**Priority:** Must have
**Dependencies:** SSR-FR-003
**Assumptions:** Parent mobile phone may not be available for all legacy account bookings.

---

### Requirement SSR-FR-005: Safety-Review Status Management

**ID:** SSR-FR-005
**Title:** Safety-Review Status Display and Updates

**User Story:** As a BT_Administrator, I want to view and update the safety-review status for each student, so that I can track which students have been assessed and flag any that require parent contact or cannot be accommodated.

#### Acceptance Criteria

1. THE Session_Register_View SHALL display the current `safetyReviewStatus` for each booking as a colour-coded badge: `not_required` (grey), `pending` (amber), `reviewed` (green), `contact_parent` (orange), `cannot_accommodate` (red).
2. THE BT_Administrator SHALL be able to update the `safetyReviewStatus` of any booking to: `not_required`, `pending`, `reviewed`, `contact_parent`, or `cannot_accommodate`.
3. WHEN a booking is created (by the webhook) with any of the following declarations — food allergies, airborne allergy, EpiPen required, medication, respiratory problems, medical conditions, additional support needs, or incomplete emergency contact information — THE BT_Backend SHALL auto-set `safetyReviewStatus` to `pending`.
4. WHEN a booking has no higher-risk declarations, THE BT_Backend SHALL set `safetyReviewStatus` to `not_required`.
5. THE BT_Administrator SHALL be able to add a restricted operational note to a booking's safety review record.
6. WHEN a safety-review status is updated, THE BT_Backend SHALL record who made the change and the timestamp of the change.
7. THE Restricted_Note SHALL never appear in any parent-facing content, confirmation emails, or public views.
8. THE Session_Register_View SHALL NOT make clinical decisions or recommendations about whether a child is safe to attend.

**Priority:** Must have
**Dependencies:** SSR-FR-003, guest-express-checkout spec (GUEST-FR-013)
**Assumptions:** `safetyReviewStatus` field exists on guest bookings per GUEST-DATA-001. For legacy account bookings without this field, the system must derive or default it.


## 9. Session-Selection Requirements

### Requirement SSR-FR-006: Session Identification and Selection

**ID:** SSR-FR-006
**Title:** Session Identification for Report Generation

**User Story:** As a BT_Administrator, I want to select a session by its identifying attributes (date, class name, venue, time, instructor, status), so that I generate the register for the correct session without ambiguity.

#### Acceptance Criteria

1. THE Admin_Sessions_Page SHALL display sufficient identifying information (date, class name, class type, time, venue, instructor, status) for the BT_Administrator to distinguish between sessions.
2. THE Session_Register_View SHALL generate a report for exactly ONE session identified by its Firestore document ID.
3. IF two sessions share the same date and class name (e.g., different venues), THE Admin_Sessions_Page SHALL display venue and time to disambiguate.
4. THE BT_Backend SHALL validate that the session document ID provided in the route corresponds to an existing session in Firestore before loading booking data.
5. IF the session ID is invalid or does not exist, THEN THE BT_Backend SHALL display a clear "Session not found" error without revealing internal document paths.

**Priority:** Must have
**Dependencies:** SSR-FR-001
**Assumptions:** Session documents are uniquely identified by their Firestore document ID.

---

## 10. Student-Register Requirements

### Requirement SSR-FR-007: Register Data for Account Bookings

**ID:** SSR-FR-007
**Title:** Register Data Retrieval for Account (Authenticated) Bookings

**User Story:** As a BT_Administrator, I want account bookings displayed correctly in the register, so that I see the student's name, parent details, and safety flags regardless of how they booked.

#### Acceptance Criteria

1. WHEN a booking has `bookingMode: 'account'` (or `bookingMode` is absent for legacy bookings), THE BT_Backend SHALL use the booking-time snapshot data (`medicalInfo`, `emergencyContact`, `questionnaire` fields on the booking document) as the authoritative data source.
2. THE BT_Backend SHALL display `bookedByName` as the parent/guardian name for account bookings.
3. THE BT_Backend SHALL display `studentName` as the student name for account bookings.
4. IF the booking document is missing `medicalInfo`, `emergencyContact`, or `questionnaire` fields (legacy booking), THEN THE BT_Backend SHALL display "Information incomplete — parent follow-up required" rather than implying "no medical issues".
5. THE BT_Backend SHALL NEVER display a false "No allergies" or "No medical conditions" message when the corresponding data field is absent or null.

**Priority:** Must have
**Dependencies:** SSR-FR-003, SSR-FR-004
**Assumptions:** Existing account bookings store booking-time snapshot data on the booking document (written by the webhook from `booking_drafts`).

---

### Requirement SSR-FR-008: Register Data for Guest Bookings

**ID:** SSR-FR-008
**Title:** Register Data Retrieval for Guest (Unauthenticated) Bookings

**User Story:** As a BT_Administrator, I want guest bookings displayed correctly in the register using their embedded snapshot data, so that guest participants appear alongside account participants seamlessly.

#### Acceptance Criteria

1. WHEN a booking has `bookingMode: 'guest'`, THE BT_Backend SHALL use the embedded snapshot fields (`childSnapshot`, `medicalSnapshot`, `allergyDietarySnapshot`, `emergencyContactSnapshot`, `authorisedCollectorSnapshot`) as the authoritative data source.
2. THE BT_Backend SHALL display `childSnapshot.firstName` + `childSnapshot.lastName` as the student name for guest bookings.
3. THE BT_Backend SHALL display `guestContact.firstName` + `guestContact.lastName` as the parent/guardian name for guest bookings.
4. THE BT_Backend SHALL display `guestContact.telephone` as the parent mobile for guest bookings.
5. THE BT_Backend SHALL calculate the student's age at session date from `childSnapshot.dateOfBirth`.
6. THE BT_Backend SHALL NOT require a `bookedByUid` or `studentId` field for guest bookings to render correctly.

**Priority:** Must have
**Dependencies:** SSR-FR-003, SSR-FR-004, guest-express-checkout spec (GUEST-DATA-001)
**Assumptions:** Guest bookings follow the data model defined in GUEST-DATA-001.

---

### Requirement SSR-FR-009: Handling Missing and Incomplete Data

**ID:** SSR-FR-009
**Title:** Missing Data Display and Safety Messaging

**User Story:** As a BT_Administrator, I want clear indicators when booking data is missing or incomplete, so that I never mistake absent data for a declaration of "no issues" and can follow up with parents.

#### Acceptance Criteria

1. WHEN a booking field (medical, allergy, emergency contact, authorised collector) is `null`, `undefined`, or an empty object, THE Session_Register_View SHALL display "Not provided" in the corresponding field.
2. WHEN an emergency contact is missing required fields (name or phone), THE Session_Register_View SHALL display "Information incomplete" with an incomplete flag indicator.
3. WHEN medical/allergy fields are absent on a booking, THE Session_Register_View SHALL display "Parent follow-up required" and set the safety flag to indicate missing data.
4. THE Session_Register_View SHALL NEVER display "No allergies", "No medical conditions", or any affirmative "clear" message when the corresponding data field is absent.
5. WHEN a legacy account booking lacks the `questionnaire` field entirely, THE Session_Register_View SHALL display "Legacy booking — dietary information not collected" in the allergy/dietary section.
6. THE Session_Register_View SHALL visually distinguish between "actively declared no issues" (field present with negative value) and "field not collected/absent".

**Priority:** Must have
**Dependencies:** SSR-FR-007, SSR-FR-008
**Assumptions:** Legacy bookings created before the guest checkout feature may have minimal or absent medical/emergency data.


## 11. Allergy and Medical-Reporting Requirements

### Requirement SSR-FR-010: Restricted Safety Summary — Allergy and Dietary Detail

**ID:** SSR-FR-010
**Title:** Restricted Safety Summary — Allergy, Dietary, and Airborne Information

**User Story:** As a BT_Administrator, I want to see detailed allergy, dietary, and airborne allergy information for each student in a restricted view, so that I can assess safety requirements and brief the instructor before the session.

#### Acceptance Criteria

1. THE Safety_Report SHALL display the following allergy/dietary fields for each student: food allergies declared (yes/no), allergen details, dietary requirements, airborne allergy declared (yes/no), airborne allergen details, known reactions, symptoms, and any food restrictions.
2. THE Safety_Report SHALL display this information in a restricted section separate from the ordinary register.
3. WHEN allergy data comes from a guest booking, THE BT_Backend SHALL read from `allergyDietarySnapshot` on the booking document.
4. WHEN allergy data comes from an account booking, THE BT_Backend SHALL read from the `questionnaire` field on the booking document (booking-time snapshot).
5. THE Safety_Report SHALL clearly label the source of data (booking snapshot) so the admin understands it reflects booking-time declarations.
6. IF allergy/dietary fields are absent, THEN THE Safety_Report SHALL display "Not provided" and SHALL NOT display "No allergies" or "None declared".

**Priority:** Must have
**Dependencies:** SSR-FR-003, SSR-FR-007, SSR-FR-008
**Assumptions:** Account bookings use the `questionnaire` field (`dietaryRequirements`, `airborneAllergy`, `reactionDetails`, `symptoms`) while guest bookings use `allergyDietarySnapshot` with richer fields.

---

### Requirement SSR-FR-011: Restricted Safety Summary — Medical and Medication Detail

**ID:** SSR-FR-011
**Title:** Restricted Safety Summary — Medical Conditions, Medication, and EpiPen

**User Story:** As a BT_Administrator, I want to see detailed medical conditions, medication, and EpiPen requirements for each student, so that I can ensure appropriate preparations are made for the session.

#### Acceptance Criteria

1. THE Safety_Report SHALL display the following medical/medication fields for each student: EpiPen required (yes/no), EpiPen details, medication details, parent medication instructions, contact-parent-before-session flag, medical conditions declared (yes/no), condition details, respiratory problems declared (yes/no), respiratory details, recent operations or injuries, vision impairment, hearing impairment, additional support needs, and other safety information.
2. WHEN medical data comes from a guest booking, THE BT_Backend SHALL read from `medicalSnapshot` on the booking document.
3. WHEN medical data comes from an account booking, THE BT_Backend SHALL read from `medicalInfo` on the booking document (booking-time snapshot).
4. THE Safety_Report SHALL highlight EpiPen-required students with a prominent visual indicator.
5. THE Safety_Report SHALL highlight students with respiratory problems with a visual indicator.
6. IF any medical field is absent, THEN THE Safety_Report SHALL display "Not provided" for that specific field.

**Priority:** Must have
**Dependencies:** SSR-FR-003, SSR-FR-007, SSR-FR-008
**Assumptions:** Account booking `medicalInfo` contains boolean flags (`allergies`, `conditions`, `respiratoryProblems`, `visionImpairment`, `hearingImpairment`) plus text fields (`otherMedicalNotes`, `additionalSupportNeeds`). Guest booking `medicalSnapshot` contains richer structured data.

---

### Requirement SSR-FR-012: Session-Level Safety Statistics

**ID:** SSR-FR-012
**Title:** Session-Level Safety Summary Statistics

**User Story:** As a BT_Administrator, I want a quick summary of safety-relevant counts at the top of the safety report, so that I can immediately understand the overall safety profile of the session.

#### Acceptance Criteria

1. THE Safety_Report SHALL display the following session-level statistics at the top of the restricted safety section: total confirmed students, number with food allergies, number with airborne allergies, number requiring medication or EpiPen, number with medical conditions, number with additional support needs, number with incomplete emergency contacts, number with `safetyReviewStatus: 'pending'`, number with `safetyReviewStatus: 'contact_parent'`, and number with `safetyReviewStatus: 'cannot_accommodate'`.
2. THE Session_Safety_Statistics SHALL be calculated from the confirmed bookings only (excluding cancelled).
3. THE Session_Safety_Statistics SHALL correctly count based on the presence and value of the relevant fields, not merely the absence of fields.
4. WHEN a field is absent (not collected), THE BT_Backend SHALL NOT count it as "no issue" — it SHALL be excluded from the count or counted separately as "incomplete".

**Priority:** Must have
**Dependencies:** SSR-FR-010, SSR-FR-011
**Assumptions:** Statistics are derived from booking-time snapshot data.


## 12. Emergency-Contact and Collection Requirements

### Requirement SSR-FR-013: Emergency Contact Display

**ID:** SSR-FR-013
**Title:** Emergency Contact Information in Safety Report

**User Story:** As a BT_Administrator, I want to see emergency contact details for each student in the restricted safety view, so that I can reach someone quickly in an emergency.

#### Acceptance Criteria

1. THE Safety_Report SHALL display the following emergency contact fields for each student: contact name, relationship to child, primary phone number, alternative phone number, and email address.
2. WHEN emergency contact data comes from a guest booking, THE BT_Backend SHALL read from `emergencyContactSnapshot` on the booking document.
3. WHEN emergency contact data comes from an account booking, THE BT_Backend SHALL read from the `emergencyContact` field on the booking document.
4. IF emergency contact data is missing or incomplete (no name or no phone), THEN THE Safety_Report SHALL display "Emergency contact incomplete — parent follow-up required" with a prominent warning indicator.
5. THE Safety_Report SHALL NOT display emergency contact phone numbers in the ordinary register (only the restricted safety view).

**Priority:** Must have
**Dependencies:** SSR-FR-007, SSR-FR-008
**Assumptions:** Emergency contact availability varies between account bookings (may be absent on older bookings) and guest bookings (mandatory in the guest form).

---

### Requirement SSR-FR-014: Authorised Collector Display

**ID:** SSR-FR-014
**Title:** Authorised Collector Information

**User Story:** As a BT_Administrator, I want to know who is authorised to collect each child after the session, so that children are only released to approved individuals.

#### Acceptance Criteria

1. THE Session_Register SHALL display the authorised collector name for each student in the ordinary register view.
2. THE Safety_Report SHALL display the full authorised collector details: name, relationship to child, phone number, and same-as-parent indicator.
3. WHEN authorised collector data comes from a guest booking, THE BT_Backend SHALL read from `authorisedCollectorSnapshot` on the booking document.
4. WHEN authorised collector data comes from an account booking, THE BT_Backend SHALL use parent contact details if no separate collector is specified.
5. IF authorised collector information is not available, THE Session_Register SHALL display "Not specified" in the collector column.

**Priority:** Must have
**Dependencies:** SSR-FR-004, SSR-FR-007, SSR-FR-008
**Assumptions:** Authorised collector is a new concept introduced by the guest-express-checkout spec. Legacy account bookings will not have this data.

---

## 13. Safety-Review Requirements

### Requirement SSR-FR-015: Safety-Review Status Workflow within Register

**ID:** SSR-FR-015
**Title:** Safety-Review Workflow — Status Transitions and Notes

**User Story:** As a BT_Administrator, I want to update safety-review statuses and add operational notes directly from the session register view, so that I can complete my safety review without navigating away.

#### Acceptance Criteria

1. THE Session_Register_View SHALL provide an inline action to change the `safetyReviewStatus` of any booking to: `not_required`, `pending`, `reviewed`, `contact_parent`, or `cannot_accommodate`.
2. WHEN the BT_Administrator updates a safety-review status, THE BT_Backend SHALL record the new status, the admin's user ID, and the timestamp of the change on the booking document.
3. THE Session_Register_View SHALL provide an action to add or edit a restricted operational note for a booking.
4. THE Restricted_Note SHALL be stored on the booking document and accessible only to admin users.
5. THE Restricted_Note SHALL NEVER appear in parent-facing content, emails, or non-admin views.
6. WHEN a safety-review status or note is changed, THE BT_Backend SHALL create an audit record (see SSR-OPS-001).
7. THE Safety_Report SHALL display the current review status, restricted note (if any), reviewer name, and review timestamp for each student.

**Priority:** Must have
**Dependencies:** SSR-FR-005
**Assumptions:** The `safetyReviewStatus` field and review metadata will be stored directly on the booking document.

---

## 14. Data-Source and Data-Quality Requirements

### Requirement SSR-DATA-001: Booking-Time Snapshot as Authoritative Source

**ID:** SSR-DATA-001
**Title:** Data Source — Booking-Time Snapshot Priority

**User Story:** As a BT_Administrator, I want the register to show the medical/safety data declared at booking time, so that I see exactly what the parent provided when they booked rather than potentially outdated or changed profile data.

#### Acceptance Criteria

1. THE BT_Backend SHALL use booking-time snapshot data (stored on the booking document itself) as the authoritative data source for the session register and safety report.
2. THE BT_Backend SHALL NOT read from `students/{id}` or `users/{uid}` profiles to populate the register, unless the booking document lacks the required fields AND a fallback lookup is explicitly approved.
3. FOR guest bookings, THE BT_Backend SHALL read all data from embedded snapshot fields on the booking document (`childSnapshot`, `medicalSnapshot`, `allergyDietarySnapshot`, `emergencyContactSnapshot`, `authorisedCollectorSnapshot`, `guestContact`).
4. FOR account bookings, THE BT_Backend SHALL read medical data from `medicalInfo`, emergency contact from `emergencyContact`, and dietary from `questionnaire` fields on the booking document.
5. THE Safety_Report SHALL indicate the data source as "Booking snapshot — declared [booking date]" to inform the admin that information may not reflect post-booking changes.

**Priority:** Must have
**Dependencies:** None
**Assumptions:** The Stripe webhook writes booking-time snapshot data onto the booking document at creation time. This is confirmed in the current webhook handler code.

---

### Requirement SSR-DATA-002: Handling Duplicate and Post-Payment Changes

**ID:** SSR-DATA-002
**Title:** One Entry Per Confirmed Booking — No Duplicates

**User Story:** As a BT_Administrator, I want exactly one register entry per confirmed booking, with no duplicates from webhook retries or data inconsistencies.

#### Acceptance Criteria

1. THE Session_Register_View SHALL display exactly one entry per confirmed booking document for the target session.
2. THE BT_Backend SHALL NOT create duplicate register entries if a student has multiple cancelled-then-rebooked entries for the same session (each booking document is a separate entry).
3. IF a booking has been cancelled and a new booking exists for the same student in the same session, THE Session_Register_View SHALL show only the confirmed booking in the default view (cancelled visible via filter).
4. THE Session_Register_View SHALL update automatically when the underlying data changes (e.g., a cancellation or refund occurs after the report was generated). The report is read-only except for safety-review status and notes.

**Priority:** Must have
**Dependencies:** SSR-FR-003
**Assumptions:** Booking document ID = PaymentIntent ID ensures uniqueness per payment.


## 15. Access-Control Requirements

### Requirement SSR-SEC-001: Admin-Only Access to Session Register

**ID:** SSR-SEC-001
**Title:** Access Control — Admin Authentication and Authorisation

**User Story:** As the BT_Backend, I want to ensure only authenticated admin users can access the session register and safety report, so that children's personal and health information is protected from unauthorised access.

#### Acceptance Criteria

1. IF a user is not authenticated (no valid Firebase session), THEN THE BT_Backend SHALL deny access to the Session_Register_View and return a redirect to the login page.
2. IF an authenticated user does not have the `admin` role, THEN THE BT_Backend SHALL deny access to the Session_Register_View and redirect to the portal dashboard.
3. IF a parent or `youngAdult` role user attempts to access the register URL directly, THEN THE BT_Backend SHALL deny access and display a "Permission denied" message.
4. THE BT_Backend SHALL enforce access control server-side (not just UI hiding) — Firestore security rules and/or API route guards must validate the caller's admin role.
5. THE Session_Register_View URL SHALL NOT be guessable or enumerable (uses Firestore document IDs, not sequential integers).
6. THE Session_Register_View SHALL NOT include medical data in URL parameters or query strings.

**Priority:** Must have
**Dependencies:** None
**Assumptions:** Admin role verification follows the existing pattern: Edge middleware checks `bt_session` cookie for `/admin/*`, AdminLayout checks `btUser.role === 'admin'`, and Firestore rules enforce `isAdmin()` for data reads.

---

### Requirement SSR-SEC-002: Instructor Access Control (Open Question)

**ID:** SSR-SEC-002
**Title:** Instructor Access — Limited Session-Specific Access

**User Story:** As an Instructor assigned to a session, I want controlled access to the safety information for my assigned session only, so that I can prepare for safe session delivery.

#### Acceptance Criteria

1. IF instructor access is approved, THE BT_Backend SHALL restrict instructor access to only sessions where the instructor is the assigned instructor (matched by `session.instructorId`).
2. IF instructor access is approved, THE Instructor SHALL NOT have access to sessions they are not assigned to.
3. IF instructor access is approved, THE Instructor_Access SHALL be time-windowed (accessible only from a defined period before the session until after session completion).
4. IF instructor access is approved, THE Instructor SHALL NOT have bulk export or CSV download capability.
5. IF instructor access is approved, THE Instructor_Access SHALL be audited (who viewed, when, which session).
6. IF instructor access is approved, THE Instructor_Access SHALL be automatically removed when the instructor assignment ends.
7. THE implementation SHALL NOT invent a new authentication model for instructors — this is recorded as an open decision (see Section 25, Open Questions).

**Priority:** Should have (contingent on open question resolution)
**Dependencies:** SSR-SEC-001, Open Question #1
**Assumptions:** No instructor portal currently exists. Instructors are managed as data records (`instructors/{id}`) but are not Firebase Auth users with system access.

---

## 16. Privacy and Sensitive-Data Requirements

### Requirement SSR-SEC-003: Privacy and Data Protection Controls

**ID:** SSR-SEC-003
**Title:** Privacy Controls for Medical and Personal Data

**User Story:** As the BT_Backend, I want to protect children's health information from inappropriate access, leakage, or exposure, so that the system complies with data protection principles and maintains parent trust.

#### Acceptance Criteria

1. THE Session_Register_View SHALL NOT be publicly accessible — no unauthenticated access, no public URLs, no shareable links without authentication.
2. THE BT_Backend SHALL NOT include medical data in Stripe metadata, analytics events, application error logs, email bodies, WhatsApp messages, or URL parameters.
3. THE BT_Backend SHALL NOT store or cache medical data in browser localStorage, sessionStorage, or cookies.
4. THE Session_Register_View SHALL display a confidential header stating: "Confidential: contains personal and health-related information about children. Handle in accordance with data protection policy."
5. THE BT_Backend SHALL NOT expose the session register or safety report to search engine indexing (page must include `noindex, nofollow` meta tags or be behind auth-only routes).
6. THE BT_Backend SHALL retrieve safety data server-side (via Firebase Admin SDK) and serve it only to authenticated admin clients — no direct Firestore client SDK reads of other users' medical data.
7. THE Print_Layout SHALL include the confidential marking on every printed page.
8. THE BT_Backend SHALL NOT send medical data as email attachments or via unrestricted download links.

**Priority:** Must have
**Dependencies:** SSR-SEC-001
**Assumptions:** The existing Firestore security rules already prevent non-admin client-side reads of other users' bookings. The register data will be served via a server-side route or API.


## 17. Screen, Print and Export Requirements

### Requirement SSR-REP-001: Print-Optimised Register Layout

**ID:** SSR-REP-001
**Title:** Printable Session Register

**User Story:** As a BT_Administrator, I want to print a clean, professional session register for use at the venue, so that I have a physical copy for sign-in/sign-out and quick reference.

#### Acceptance Criteria

1. THE Session_Register_View SHALL provide a "Print Register" action that invokes the browser print dialog.
2. THE Print_Layout SHALL include: report header (class name, date, time, venue, instructor), page numbers, generation timestamp, generated-by admin name, and confidential marking.
3. THE Print_Layout SHALL exclude all navigation elements, sidebar, buttons, and interactive controls.
4. THE Print_Layout SHALL present the register table in a clean, readable format suitable for A4 paper.
5. THE Print_Layout SHALL separate the ordinary register from the restricted safety summary — the admin can choose to print either or both.
6. THE Print_Layout SHALL include the confidential header on every page of printed output.

**Priority:** Must have
**Dependencies:** SSR-FR-004, SSR-FR-010
**Assumptions:** CSS `@media print` rules and a dedicated print stylesheet will handle the layout.

---

### Requirement SSR-REP-002: Print-Optimised Safety Report Layout

**ID:** SSR-REP-002
**Title:** Printable Restricted Safety Report

**User Story:** As a BT_Administrator, I want to print the restricted safety summary separately from the ordinary register, so that sensitive health information can be controlled separately from the attendance sheet.

#### Acceptance Criteria

1. THE Safety_Report SHALL provide a separate "Print Safety Report" action.
2. THE Printed_Safety_Report SHALL include: report header, session-level safety statistics, per-student safety detail, confidential marking on every page, page numbers, generation timestamp, and generated-by admin name.
3. THE Printed_Safety_Report SHALL NOT include navigation elements, action buttons, or interactive controls.
4. THE Printed_Safety_Report SHALL be formatted for readability with clear section breaks between students.

**Priority:** Must have
**Dependencies:** SSR-FR-010, SSR-FR-011, SSR-FR-012, SSR-FR-013
**Assumptions:** Safety report printing uses browser Print dialog with CSS print media rules.

---

### Requirement SSR-REP-003: PDF Export Assessment

**ID:** SSR-REP-003
**Title:** PDF Export — Browser Print-to-PDF vs System-Generated

**User Story:** As a BT_Administrator, I want to save the register and safety report as PDF files, so that I can store or share them digitally within secure channels.

#### Acceptance Criteria

1. THE Session_Register_View SHALL support PDF generation via browser "Print to PDF" functionality as the minimum viable approach.
2. THE BT_Backend SHALL assess whether system-generated PDF (server-side rendering) is required based on print quality, consistency across browsers, and operational needs. This decision is deferred to the design phase.
3. WHEN a PDF is generated (by either method), THE output SHALL include the same content and confidential markings as the printed version.
4. THE PDF SHALL NOT be stored at a publicly accessible URL.

**Priority:** Should have
**Dependencies:** SSR-REP-001, SSR-REP-002
**Assumptions:** Browser Print-to-PDF is adequate for MVP. Server-side PDF generation (e.g., via Puppeteer or a PDF library) is a potential enhancement.

---

### Requirement SSR-REP-004: CSV Export (Open Security Question)

**ID:** SSR-REP-004
**Title:** CSV Export — Security Considerations

**User Story:** As a BT_Administrator, I want to export register data as CSV for offline use, so that I can work with the data in spreadsheet tools if needed.

#### Acceptance Criteria

1. IF CSV export is approved (see Open Question #4), THE Session_Register_View SHALL provide a "Download CSV" action.
2. IF CSV export is provided, THE BT_Backend SHALL require active admin authentication at the time of download (re-verify session).
3. IF CSV export is provided, THE BT_Backend SHALL display a warning dialog before download: "This file contains personal information about children. Handle securely and delete when no longer needed."
4. IF CSV export is provided, THE CSV file SHALL NOT be served from a public URL — it must be generated on-demand for the authenticated admin.
5. IF CSV export is provided, THE BT_Backend SHALL generate a session-specific filename (e.g., `register_[className]_[date].csv`) to prevent confusion between sessions.
6. IF CSV export is provided, THE BT_Backend SHALL create an audit record logging who exported, which session, and when.
7. IF CSV export is NOT approved, THE Session_Register_View SHALL NOT display any CSV/Excel download options.

**Priority:** Could have (contingent on open question resolution)
**Dependencies:** SSR-SEC-001, SSR-OPS-001, Open Question #4
**Assumptions:** CSV export introduces additional data-at-rest risks. Decision deferred.

---

### Requirement SSR-REP-005: Searching, Sorting, and Filtering

**ID:** SSR-REP-005
**Title:** Register Searching, Sorting, and Filtering

**User Story:** As a BT_Administrator, I want to search, sort, and filter the register, so that I can quickly find specific students or focus on those requiring safety attention.

#### Acceptance Criteria

1. THE Session_Register_View SHALL support sorting by: student name (alphabetical, default), safety-review status, and booking mode.
2. THE Session_Register_View SHALL support filtering by: students with allergy declarations, students with medical conditions, students requiring EpiPen/medication, students with pending safety reviews, booking mode (account/guest), booking source, and cancelled bookings (off by default).
3. THE Session_Register_View SHALL support free-text search by student name, parent name, or booking reference.
4. THE Default_View SHALL display all active confirmed students sorted alphabetically with cancelled bookings hidden.
5. THE Session_Register_View SHALL preserve active filters and sort order during the user's session (not lost on interaction with safety review or notes).

**Priority:** Must have
**Dependencies:** SSR-FR-004
**Assumptions:** Filtering and sorting are client-side operations on the loaded dataset (all confirmed bookings for one session are loaded at once).


## 18. User-Experience and Accessibility Requirements

### Requirement SSR-UX-001: Responsive and Accessible Register Layout

**ID:** SSR-UX-001
**Title:** Responsive Design and Accessibility Compliance

**User Story:** As a BT_Administrator, I want the session register to be usable on mobile, tablet, and desktop devices with accessible controls, so that I can review and manage safety information from any device.

#### Acceptance Criteria

1. THE Session_Register_View SHALL be responsive across mobile (320px+), tablet (768px+), and desktop (1024px+) viewports.
2. THE Session_Register_View SHALL use readable table layouts that scroll horizontally on smaller viewports rather than truncating data.
3. THE Session_Register_View SHALL use accessible headings (h1–h6 hierarchy) for report sections.
4. THE Session_Register_View SHALL support full keyboard navigation for all interactive elements (filters, sort controls, status updates, note editing, print actions).
5. THE Session_Register_View SHALL provide screen-reader labels for all flag indicators, badges, and icons.
6. THE Safety_Flags SHALL NOT rely on colour alone — they must include text labels or icons that convey meaning without colour perception.
7. THE Session_Register_View SHALL display loading states while data is being retrieved.
8. THE Session_Register_View SHALL provide confirmation prompts before export actions (print/PDF/CSV).

**Priority:** Must have
**Dependencies:** SSR-FR-001
**Assumptions:** The admin panel already provides a responsive layout framework via AdminLayout. The register will follow the same CSS Modules + globals.css pattern.

---

### Requirement SSR-UX-002: Separation of Register and Restricted Safety Information

**ID:** SSR-UX-002
**Title:** Clear Visual Separation of Ordinary Register and Restricted Data

**User Story:** As a BT_Administrator, I want the ordinary register and the restricted safety details to be clearly separated, so that I can show the attendance register to the instructor without accidentally exposing detailed medical narratives.

#### Acceptance Criteria

1. THE Session_Register_View SHALL present the ordinary register and the restricted safety summary as separate views or clearly delineated sections that can be navigated independently.
2. THE Restricted_Safety_Section SHALL require an explicit action to reveal (e.g., clicking "View Safety Details") — it SHALL NOT be visible by default on page load.
3. THE Restricted_Safety_Section SHALL display a prominent confidential banner when opened.
4. THE Print actions SHALL allow printing the ordinary register independently of the restricted safety summary.

**Priority:** Must have
**Dependencies:** SSR-FR-004, SSR-FR-010
**Assumptions:** The separation enables operational workflow where the register is displayed/printed for general use while the safety report is accessed only when reviewing medical information.

---

### Requirement SSR-UX-003: Error and Empty States

**ID:** SSR-UX-003
**Title:** Error Handling and Empty State Messaging

**User Story:** As a BT_Administrator, I want clear, helpful messages when something goes wrong or when a session has no bookings, so that I understand the situation and can take appropriate action.

#### Acceptance Criteria

1. IF the session is not found (invalid ID), THEN THE Session_Register_View SHALL display "Session not found. Please check the URL or return to the sessions list."
2. IF the session exists but has no confirmed bookings, THEN THE Session_Register_View SHALL display "No confirmed bookings for this session" with the session header still visible.
3. IF booking data fails to load (Firestore error), THEN THE Session_Register_View SHALL display "Unable to load register data. Please try again." without revealing internal error details.
4. IF emergency contact data is missing for a student, THEN THE Safety_Report SHALL display a warning indicator with "Emergency contact not provided — follow up required."
5. IF the report generation encounters a malformed legacy booking, THEN THE Session_Register_View SHALL display the available fields and flag the entry as "Data incomplete — legacy booking" rather than crashing.
6. IF permission is denied (non-admin user), THEN THE Session_Register_View SHALL display "You do not have permission to view this page" and provide a link to the portal dashboard.
7. IF a data export fails, THEN THE Session_Register_View SHALL display "Export failed. Please try again." without revealing internal details.

**Priority:** Must have
**Dependencies:** SSR-FR-001, SSR-SEC-001
**Assumptions:** Error messages follow existing admin panel patterns (no stack traces, no Firestore paths exposed to the user).


## 19. Audit and Operational Requirements

### Requirement SSR-OPS-001: Audit Trail for Report Access and Actions

**ID:** SSR-OPS-001
**Title:** Audit Logging for Views, Prints, Exports, and Status Changes

**User Story:** As a BT_Administrator, I want an audit trail recording who accessed safety information, when, and what actions they took, so that the business can demonstrate responsible data handling.

#### Acceptance Criteria

1. WHEN a BT_Administrator views the session register, THE BT_Backend SHALL create an audit record containing: admin user ID, admin name, session ID, action type (`view_register`), and timestamp.
2. WHEN a BT_Administrator views the restricted safety summary, THE BT_Backend SHALL create an audit record with action type `view_safety_report`.
3. WHEN a BT_Administrator prints the register or safety report, THE BT_Backend SHALL create an audit record with action type `print_register` or `print_safety_report`.
4. WHEN a BT_Administrator exports data (CSV or PDF), THE BT_Backend SHALL create an audit record with action type `export_csv` or `export_pdf`, including the session ID and export format.
5. WHEN a BT_Administrator changes a safety-review status, THE BT_Backend SHALL create an audit record with action type `status_change`, the previous status, the new status, and the booking reference.
6. WHEN a BT_Administrator adds or edits a restricted note, THE BT_Backend SHALL create an audit record with action type `note_change` and the booking reference.
7. THE Audit_Records SHALL contain references (session ID, booking ID, admin UID) but SHALL NOT contain medical narratives or allergy details in the audit log entries.
8. THE Audit_Records SHALL be stored in a Firestore collection accessible only to admin users.

**Priority:** Must have
**Dependencies:** SSR-SEC-001
**Assumptions:** Audit records are stored in a new `audit_logs` Firestore collection (or sub-collection). Retention period is an open question.

---

### Requirement SSR-OPS-002: Report Freshness and Data Consistency

**ID:** SSR-OPS-002
**Title:** Data Consistency and Report Updates

**User Story:** As a BT_Administrator, I want the register to reflect the current state of bookings including recent cancellations or status changes, so that I am working with accurate information.

#### Acceptance Criteria

1. THE Session_Register_View SHALL load fresh data from Firestore each time it is accessed (no stale cached version).
2. WHEN a booking is cancelled (status changed to `cancelled`) after the register is loaded, THE Session_Register_View SHALL reflect the change on the next load or when the admin manually refreshes.
3. WHEN a booking is refunded, THE Session_Register_View SHALL reflect the updated payment status on the next load.
4. WHEN a safety-review status is updated by the current admin, THE Session_Register_View SHALL update the display immediately without requiring a full page reload.
5. THE Report_Header generation timestamp SHALL reflect when the data was loaded, not a cached timestamp.

**Priority:** Must have
**Dependencies:** SSR-FR-001
**Assumptions:** Real-time Firestore listeners (onSnapshot) may be used for live updates, or simple read-on-load with manual refresh is acceptable for MVP.


## 20. Preview Deployment Requirements

### Requirement SSR-DEP-001: Preview Branch and Environment

**ID:** SSR-DEP-001
**Title:** Preview Deployment Configuration

**User Story:** As the development team, I want the session register feature deployed to a Vercel Preview environment first, so that it can be tested without affecting production.

#### Acceptance Criteria

1. THE Session_Register feature SHALL be developed on branch `feature/session-safety-report`.
2. THE Feature_Branch SHALL deploy to Vercel Preview automatically on push.
3. THE Preview_Deployment SHALL use a staging Firebase project or emulator for data storage — no real children's data.
4. THE Preview_Deployment SHALL use non-production test data that does not contain real medical information or real children's names.
5. THE Preview_Deployment SHALL restrict access to approved test users only.
6. THE Production_Deployment SHALL NOT occur as part of the initial feature merge — it requires separate approval.
7. THE Production_Environment SHALL remain unchanged until the feature is explicitly approved for production release.

**Priority:** Must have
**Dependencies:** Safe Deployment Workflow spec (existing)
**Assumptions:** The Vercel Preview deployment infrastructure exists per the safe-deployment-workflow spec.

---

## 21. Testing and Acceptance Requirements

### Requirement SSR-TEST-001: Session Selection Tests

**ID:** SSR-TEST-001
**Title:** Test Coverage — Session Selection and Validation

**User Story:** As the development team, I want comprehensive tests for session selection logic, so that the register always operates on the correct session.

#### Acceptance Criteria

1. THE Test_Suite SHALL verify that a valid session ID loads the correct session data and bookings.
2. THE Test_Suite SHALL verify that an unknown/invalid session ID displays a "Session not found" error.
3. THE Test_Suite SHALL verify that a cancelled session still allows register access (admin may need to view historical data).
4. THE Test_Suite SHALL verify that a session with no bookings displays the empty state correctly.
5. THE Test_Suite SHALL verify that a session with mixed bookings (confirmed + cancelled) shows only confirmed by default.

**Priority:** Must have
**Dependencies:** SSR-FR-001, SSR-FR-006
**Assumptions:** Tests use Vitest with mocked Firestore data.

---

### Requirement SSR-TEST-002: Booking Inclusion and Exclusion Tests

**ID:** SSR-TEST-002
**Title:** Test Coverage — Booking Filtering Logic

**User Story:** As the development team, I want tests verifying that only correct bookings appear in the register, so that no incorrect inclusions or exclusions occur.

#### Acceptance Criteria

1. THE Test_Suite SHALL verify that confirmed bookings for the target session are included.
2. THE Test_Suite SHALL verify that cancelled bookings are excluded from the default view.
3. THE Test_Suite SHALL verify that refunded bookings are excluded.
4. THE Test_Suite SHALL verify that failed payment bookings are excluded.
5. THE Test_Suite SHALL verify that draft bookings (from `booking_drafts`) are excluded.
6. THE Test_Suite SHALL verify that bookings for other sessions (different `sessionId`) are excluded.
7. THE Test_Suite SHALL verify that cancelled bookings appear when the "Show cancelled" filter is active.

**Priority:** Must have
**Dependencies:** SSR-FR-003
**Assumptions:** Tests cover both Firestore query logic and UI rendering logic.

---

### Requirement SSR-TEST-003: Student Data Rendering Tests

**ID:** SSR-TEST-003
**Title:** Test Coverage — Account and Guest Booking Data Rendering

**User Story:** As the development team, I want tests verifying that both account and guest bookings render correctly in the register, including edge cases.

#### Acceptance Criteria

1. THE Test_Suite SHALL verify that account bookings display `bookedByName` as parent and `studentName` as student.
2. THE Test_Suite SHALL verify that guest bookings display `guestContact` name as parent and `childSnapshot` name as student.
3. THE Test_Suite SHALL verify that bookings missing `bookedByUid` (guest bookings) do not cause rendering errors.
4. THE Test_Suite SHALL verify that bookings missing `medicalInfo` display "Information incomplete" not "No medical issues".
5. THE Test_Suite SHALL verify that bookings missing `emergencyContact` display the incomplete warning.
6. THE Test_Suite SHALL verify that legacy bookings (no `questionnaire` field) display the legacy data message.
7. THE Test_Suite SHALL verify that student age is correctly calculated from date of birth relative to session date.

**Priority:** Must have
**Dependencies:** SSR-FR-007, SSR-FR-008, SSR-FR-009
**Assumptions:** Test fixtures include representative account booking, guest booking, and legacy booking documents.

---

### Requirement SSR-TEST-004: Safety Summary and Review Tests

**ID:** SSR-TEST-004
**Title:** Test Coverage — Safety Report and Review Workflow

**User Story:** As the development team, I want tests verifying the safety summary displays correctly and review status updates work, so that the safety workflow is reliable.

#### Acceptance Criteria

1. THE Test_Suite SHALL verify that allergy details from guest `allergyDietarySnapshot` render correctly.
2. THE Test_Suite SHALL verify that dietary/allergy details from account `questionnaire` render correctly.
3. THE Test_Suite SHALL verify that airborne allergy information is displayed when declared.
4. THE Test_Suite SHALL verify that EpiPen-required students are highlighted.
5. THE Test_Suite SHALL verify that medical conditions from `medicalInfo`/`medicalSnapshot` render correctly.
6. THE Test_Suite SHALL verify that support needs are displayed.
7. THE Test_Suite SHALL verify that `safetyReviewStatus` badges display with correct colours.
8. THE Test_Suite SHALL verify that absent fields show "Not provided" not "No allergies".
9. THE Test_Suite SHALL verify that safety-review status can be updated and persisted.
10. THE Test_Suite SHALL verify that restricted notes can be added and are stored on the booking document.

**Priority:** Must have
**Dependencies:** SSR-FR-010, SSR-FR-011, SSR-FR-015
**Assumptions:** Tests mock Firestore write operations for status updates.

---

### Requirement SSR-TEST-005: Access Control Tests

**ID:** SSR-TEST-005
**Title:** Test Coverage — Authentication and Authorisation

**User Story:** As the development team, I want tests verifying that access control is correctly enforced, so that unauthorised users cannot view children's safety information.

#### Acceptance Criteria

1. THE Test_Suite SHALL verify that unauthenticated users are denied access (redirect to login).
2. THE Test_Suite SHALL verify that parent-role users are denied access (redirect to portal).
3. THE Test_Suite SHALL verify that youngAdult-role users are denied access.
4. THE Test_Suite SHALL verify that admin-role users are granted access.
5. THE Test_Suite SHALL verify that instructor access is restricted to assigned sessions (if instructor access is implemented).
6. THE Test_Suite SHALL verify that direct URL access without authentication is blocked.

**Priority:** Must have
**Dependencies:** SSR-SEC-001
**Assumptions:** Tests mock AuthContext and btUser role.

---

### Requirement SSR-TEST-006: Print and Export Tests

**ID:** SSR-TEST-006
**Title:** Test Coverage — Print Layout and Export Functionality

**User Story:** As the development team, I want tests verifying that print and export outputs are correct, so that operational documents are reliable.

#### Acceptance Criteria

1. THE Test_Suite SHALL verify that the print layout includes report header, data, and confidential marking.
2. THE Test_Suite SHALL verify that the print layout excludes navigation elements and interactive buttons.
3. THE Test_Suite SHALL verify that CSV export (if implemented) requires active admin authentication.
4. THE Test_Suite SHALL verify that CSV export triggers an audit record.
5. THE Test_Suite SHALL verify that CSV files are not served from public URLs.
6. THE Test_Suite SHALL verify that the confidential marking appears on printed output.

**Priority:** Must have
**Dependencies:** SSR-REP-001, SSR-REP-004
**Assumptions:** Print layout tests verify CSS `@media print` classes are applied correctly.

---

### Requirement SSR-TEST-007: Audit Logging Tests

**ID:** SSR-TEST-007
**Title:** Test Coverage — Audit Trail Verification

**User Story:** As the development team, I want tests verifying that audit records are correctly created for all reportable actions.

#### Acceptance Criteria

1. THE Test_Suite SHALL verify that viewing the register creates a `view_register` audit record.
2. THE Test_Suite SHALL verify that viewing the safety report creates a `view_safety_report` audit record.
3. THE Test_Suite SHALL verify that printing creates the appropriate audit record.
4. THE Test_Suite SHALL verify that exporting creates an audit record with session ID and format.
5. THE Test_Suite SHALL verify that safety-review status changes create a `status_change` audit record.
6. THE Test_Suite SHALL verify that restricted note changes create a `note_change` audit record.
7. THE Test_Suite SHALL verify that audit records do NOT contain medical narratives.

**Priority:** Must have
**Dependencies:** SSR-OPS-001
**Assumptions:** Tests mock Firestore write calls to the audit collection.

---

### Requirement SSR-TEST-008: Regression Tests

**ID:** SSR-TEST-008
**Title:** Test Coverage — Regression Against Existing Features

**User Story:** As the development team, I want regression tests confirming that the session register feature does not break existing admin functionality.

#### Acceptance Criteria

1. THE Test_Suite SHALL verify that the admin booking list (`/admin/bookings`) continues to function correctly after the feature is deployed.
2. THE Test_Suite SHALL verify that the admin sessions page (`/admin/sessions`) continues to function correctly.
3. THE Test_Suite SHALL verify that the authenticated booking flow (payment → webhook → booking creation) is unaffected.
4. THE Test_Suite SHALL verify that the Stripe webhook handler creates bookings correctly (no regression).
5. THE Test_Suite SHALL verify that session capacity management (spotsAvailable decrement) is unaffected.

**Priority:** Must have
**Dependencies:** All functional requirements
**Assumptions:** Regression tests run as part of the test suite before merge.


## 22. Non-Functional Requirements

### Performance

1. THE Session_Register_View SHALL load and render the complete register for a session with up to 20 confirmed bookings within 3 seconds on a standard connection.
2. THE Safety_Report restricted section SHALL load within 2 seconds after the admin requests it (data may already be loaded with the register).
3. THE Print_Layout SHALL render within 1 second of the print action being triggered.

### Data Consistency

4. THE Session_Register_View SHALL display consistent data — all bookings for the same session, loaded from the same Firestore snapshot, with no partial updates visible during rendering.
5. THE BT_Backend SHALL prevent cross-session data leakage — a register for session A SHALL NEVER include bookings from session B.
6. THE Session_Register_View SHALL display exactly one entry per confirmed booking document (no duplicates from rendering logic).

### Read-Only Behaviour

7. THE Session_Register_View SHALL be read-only with respect to booking data — the admin cannot edit parent details, student details, medical information, or payment information from the register.
8. THE ONLY writable fields in the Session_Register_View SHALL be: safety-review status, restricted operational notes, and sign-in/sign-out records.

### Responsiveness to Changes

9. WHEN a booking is cancelled or refunded after the register was initially loaded, THE Session_Register_View SHALL reflect the change on the next data refresh.
10. WHEN a new booking is confirmed for the session (via webhook), THE Session_Register_View SHALL include it on the next data refresh.

---

## 23. Non-Goals

The following items are explicitly out of scope for this feature:

1. **Changing the booking-payment architecture** — The register reads existing booking documents; it does not modify how bookings are created.
2. **Collecting information through WhatsApp** — Data collection is handled by the booking flow, not the register.
3. **Sending full medical reports via WhatsApp** — Medical data is never sent via messaging channels.
4. **Auto-emailing safety reports to instructors** — Reports are accessed on-demand, not distributed automatically.
5. **Public report links** — No publicly accessible URLs for reports.
6. **Parent access to the session report** — Parents cannot see other children's data or the session register.
7. **Clinical or medical decision-making** — The report presents data; it does not determine whether a child is safe to attend.
8. **Auto-determining a child is safe to attend** — Safety assessment is a human decision by the admin.
9. **Production deployment** — This feature ships to Preview first; production deployment requires separate approval.
10. **Instructor role creation** — If no approved instructor role/auth model exists, instructor access is deferred.
11. **Long-term analytics or dashboards** — The register is an operational tool, not an analytics platform.
12. **Replacing booking snapshot with latest student profile data** — Booking-time snapshot remains authoritative unless explicitly approved otherwise.
13. **Editing parent-supplied information** — Admin can only add notes, not modify the original declarations.
14. **Bulk operations across multiple sessions** — The register is single-session only.

---

## 24. Assumptions

1. The guest-express-checkout spec (GUEST-DATA-001, GUEST-FR-012, GUEST-FR-013, GUEST-OPS-001) will be implemented, providing guest booking data with embedded snapshots and `safetyReviewStatus`.
2. The Stripe webhook handler writes booking-time snapshot data (`medicalInfo`, `emergencyContact`, `questionnaire`) onto every booking document at creation time.
3. A staging Firebase project or emulator is available for Preview testing (per the safe-deployment-workflow spec).
4. The existing Firestore security rules prevent non-admin client-side reads of other users' booking documents.
5. The admin panel responsive layout (AdminLayout) provides the structural framework for the register pages.
6. CSS Modules + globals.css is the styling approach (consistent with the existing codebase).
7. No instructor portal currently exists — instructors are data records, not authenticated system users.
8. Session documents contain `instructorId` and `instructorName` for instructor assignment.
9. Children's ages are calculated from `dateOfBirth` relative to the session `date` field.
10. The existing `Booking` TypeScript type will need extension to support `safetyReviewStatus`, `bookingMode`, `bookingSource`, `guestContact`, and snapshot fields.
11. Prices are stored in pence (integer) — not relevant to this feature but noted for consistency.
12. The admin is the only role with full register access at launch.

---

## 25. Risks

| # | Risk | Impact | Likelihood | Mitigation |
|---|------|--------|------------|------------|
| 1 | Unauthorised access to children's health information | Data breach, regulatory action, loss of trust | Low | Server-side auth, Firestore rules, audit logging |
| 2 | Unnecessary printing or export of sensitive data | Data on paper/devices outside secure environment | Medium | Confirmation dialogs, confidential markings, audit |
| 3 | Outdated booking-snapshot data shown as current | Admin acts on stale information | Medium | Clear "snapshot from [date]" labelling |
| 4 | Missing emergency contacts not flagged prominently | Child safety risk if contact needed | Medium | Prominent warning indicators, pending review auto-flag |
| 5 | Conflicting data schemas between account and guest bookings | Rendering errors, missing fields | Medium | Unified display layer with null-safe access patterns |
| 6 | Legacy incomplete bookings crash the register | Admin cannot access register | Low | Defensive rendering, "data incomplete" fallback |
| 7 | Cross-session data mixing | Wrong safety information for wrong child | Low | Strict `sessionId` query filter, single-session scope |
| 8 | Instructor access too broad | Instructor sees data for sessions they are not assigned to | Medium | Restrict by `instructorId` match, time-windowed access |
| 9 | CSV export saved on personal devices | Data on insecure devices | Medium | Warning dialogs, audit, consider restricting to print-only |
| 10 | Report shared insecurely (photo, email) | Data leakage | Medium | Confidential markings, staff training (out of scope for tech) |
| 11 | Cached report data in browser | Data persists on shared device | Low | No localStorage/sessionStorage for medical data, no sensitive caching |
| 12 | Production data used in Preview environment | Real children's data exposed in non-production | Low | Staging Firebase, synthetic test data, approved test users only |
| 13 | Missing data interpreted as "no medical issue" | False sense of safety | High | "Not provided" messaging, NEVER false negatives, pending review flag |
| 14 | Cancelled students incorrectly included in active register | Operational confusion | Low | Default filter excludes cancelled, visually distinct when shown |

---

## 26. Open Questions

| # | Question | Impact | Suggested Resolution |
|---|----------|--------|---------------------|
| 1 | Should instructors have direct portal access or receive an admin-provided printed register? | Access model, security, UX | Defer instructor portal; admin prints/shares register for now |
| 2 | Should instructors see emergency contact details directly? | Privacy, operational need | Include emergency name/phone for safety; exclude email and alternative |
| 3 | Browser printing only, or system-generated PDF (server-side)? | Quality, consistency, implementation effort | Start with browser Print-to-PDF; assess server-side PDF in design |
| 4 | Is CSV export required for the register? | Security risk, operational flexibility | Defer; provide print/PDF only for MVP due to data-at-rest concerns |
| 5 | Should the register and safety report be separate downloads or one combined document? | Operational workflow, security | Separate — register for venue use, safety report for admin preparation |
| 6 | Which roles should view the restricted medical/safety details beyond admin? | Access control model | Admin only at launch; instructor access as future enhancement |
| 7 | What time window should instructor access be limited to (if approved)? | Security | 24 hours before session to 4 hours after session end |
| 8 | What is the audit retention period? | Storage, compliance | Minimum 12 months; align with UK GDPR children's data guidance |
| 9 | What should happen with printed copies after the session? | Physical data security | Out of scope for tech; recommend secure disposal policy |
| 10 | Should parent contact details (mobile) appear in the ordinary register or only in the safety report? | Convenience vs. privacy | Include in register — needed for operational contact |
| 11 | Is authorised collector mandatory for all bookings? | Data completeness | Mandatory for guest (per GUEST-FR-005); optional for legacy account bookings |
| 12 | Should cancelled bookings be visible via filter or completely hidden? | Operational need | Visible via explicit filter with visual distinction |
| 13 | Which specific declarations should trigger `pending` safety-review status? | Safety workflow accuracy | Food allergy, airborne allergy, EpiPen, medication, respiratory, medical condition, support needs, incomplete emergency contact |
| 14 | Can admin edit parent-supplied information, or only add operational notes? | Data integrity | Notes only — no editing of parent declarations |
| 15 | Should review status change history be visible to the admin? | Audit transparency | Yes — show who changed, when, previous status |
| 16 | What should the confidential header wording be? | Legal, compliance | "Confidential: contains personal and health-related information about children. Handle in accordance with data protection policy. Do not leave unattended." |
| 17 | Is a staging Firebase project available for Preview testing? | Deployment readiness | Check safe-deployment-workflow spec status |
| 18 | Who are the approved test users for Preview deployment? | Testing | Blooming Tastebuds admin team email addresses |
| 19 | Should the register support past sessions (historical access)? | Operational need | Yes — admin should be able to access registers for past sessions |
| 20 | Should emergency contact details be masked in the ordinary register (showing only flag)? | Privacy balance | Yes — show flag only in register; full details in safety report |

---

## 27. Requirement Traceability Summary

| Journey Stage | Requirement IDs | System Area |
|---------------|----------------|-------------|
| Admin signs in and navigates to sessions | SSR-SEC-001 | Authentication, Admin Layout |
| Admin selects a session | SSR-FR-001, SSR-FR-006 | Admin Sessions Page, Navigation |
| Report header displays | SSR-FR-002 | Session data retrieval, UI |
| Bookings loaded and filtered | SSR-FR-003, SSR-DATA-001, SSR-DATA-002 | Firestore query, data model |
| Ordinary register displays | SSR-FR-004, SSR-FR-007, SSR-FR-008 | Register table, data rendering |
| Safety flags shown | SSR-FR-005, SSR-FR-009 | Flag indicators, missing data handling |
| Search/sort/filter register | SSR-REP-005 | Client-side filtering |
| Open restricted safety summary | SSR-FR-010, SSR-FR-011, SSR-FR-012, SSR-UX-002 | Safety report section |
| View emergency contacts | SSR-FR-013 | Safety report detail |
| View authorised collectors | SSR-FR-014 | Register + safety detail |
| Update safety-review status | SSR-FR-005, SSR-FR-015 | Status management, audit |
| Add restricted note | SSR-FR-015 | Note management, audit |
| Print register | SSR-REP-001 | Print layout, confidential marking |
| Print safety report | SSR-REP-002 | Print layout, confidential marking |
| Export PDF | SSR-REP-003 | PDF generation |
| Export CSV (if approved) | SSR-REP-004 | CSV generation, auth, audit |
| Access control enforced | SSR-SEC-001, SSR-SEC-002, SSR-SEC-003 | Auth, Firestore rules |
| Audit recorded | SSR-OPS-001 | Audit collection |
| Preview deployment | SSR-DEP-001 | Vercel, staging Firebase |
| Testing coverage | SSR-TEST-001 – SSR-TEST-008 | Vitest, integration |

---

## 28. Definition of Done for the Requirements Phase

The requirements phase is considered complete when:

1. All sections of this document are populated with clear, testable requirements.
2. Every acceptance criterion follows an EARS pattern (WHEN/IF/WHILE/WHERE ... THE ... SHALL).
3. All requirement IDs are unique and follow the defined format (SSR-FR-xxx, SSR-DATA-xxx, SSR-SEC-xxx, SSR-UX-xxx, SSR-REP-xxx, SSR-OPS-xxx, SSR-DEP-xxx, SSR-TEST-xxx).
4. Dependencies on the guest-express-checkout spec are explicitly referenced.
5. Open questions are documented with suggested resolutions.
6. Risks are identified with impact and mitigation strategies.
7. Non-goals are stated to prevent scope creep.
8. The traceability matrix maps the primary user journey to requirement IDs.
9. The document has been reviewed and approved by the Blooming Tastebuds administrator.
10. No requirement contains vague terms ("quickly", "adequate", "user-friendly") without measurable criteria.
