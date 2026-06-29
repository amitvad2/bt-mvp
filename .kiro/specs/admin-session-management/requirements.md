# Requirements Document

## Introduction

The Admin Session Management feature provides authenticated admin users with a CRUD interface at `/admin/sessions` for scheduling, editing, and deleting individual cooking class session dates. Each session is an instance of a parent `BTClass` document. When a session is created, several fields are denormalised from the parent class so that downstream consumers (booking wizard, session browser, homepage map) can read a single self-contained document. The feature also enforces a safety check before deletion when confirmed bookings exist.

## Glossary

- **Session**: A single dated occurrence of a cooking class, stored in the `sessions` Firestore collection.
- **BTClass**: A recurring class template stored in the `classes` collection. Defines type, schedule, price, venue, and age range.
- **Admin_Page**: The Next.js `'use client'` page component at `src/app/admin/sessions/page.tsx`.
- **Denormalisation**: The act of copying fields from a parent document onto a child document at write time to avoid join queries at read time.
- **className**: The human-readable display name of a session, always derived from `BTClass.type` — never entered manually by the admin.
- **classType**: The `BTClass.type` value copied onto the session (`'kidsAfterSchool'` or `'youngAdultWeekend'`).
- **spotsTotal**: The maximum number of participants for a session, copied from `BTClass.maxSize`.
- **spotsAvailable**: The current number of open booking slots. Set by the admin at creation; decremented by the Stripe webhook on each confirmed payment.
- **Confirmed_Booking**: A document in the `bookings` collection with `status == 'confirmed'` and a matching `sessionId`.

---

## Requirements

### Requirement 1: Session Listing

**User Story:** As an admin, I want to see all sessions ordered by date descending, so that I can quickly find recent and upcoming sessions.

#### Acceptance Criteria

1. WHEN the Admin_Page loads, THE Admin_Page SHALL fetch all documents from the `sessions` collection ordered by `date` descending and display them in a table.
2. WHEN sessions are displayed, THE Admin_Page SHALL show the session date, `className`, `venueName`, `spotsAvailable`, and `status` for each row.
3. WHEN `spotsAvailable` is greater than 5, THE Admin_Page SHALL render the spots badge with a green style.
4. WHEN `spotsAvailable` is between 1 and 5 inclusive, THE Admin_Page SHALL render the spots badge with an amber style.
5. WHEN `spotsAvailable` is 0, THE Admin_Page SHALL render the spots badge with a red style.
6. WHEN the data is loading, THE Admin_Page SHALL display a spinner and suppress the session table.

---

### Requirement 2: Session Creation with Denormalisation

**User Story:** As an admin, I want to create a new session by selecting a base class and entering a date, so that inherited class properties are automatically applied without me re-entering them.

#### Acceptance Criteria

1. WHEN an admin submits the Add Session form with a valid `classId` and `date`, THE Admin_Page SHALL derive `className` as `'Kids After School Club'` if `BTClass.type` is `'kidsAfterSchool'`, or `'Weekend Workshop'` if `BTClass.type` is `'youngAdultWeekend'`.
2. WHEN an admin submits the Add Session form, THE Admin_Page SHALL copy `classType` from `BTClass.type` onto the new Session document.
3. WHEN an admin submits the Add Session form, THE Admin_Page SHALL copy `venueId` and `venueName` from the selected `BTClass` onto the new Session document.
4. WHEN an admin submits the Add Session form, THE Admin_Page SHALL copy `price` from `BTClass.price` onto the new Session document, defaulting to `1500` if `BTClass.price` is absent.
5. WHEN an admin submits the Add Session form, THE Admin_Page SHALL copy `startTime` and `endTime` from the selected `BTClass` onto the new Session document.
6. WHEN an admin submits the Add Session form, THE Admin_Page SHALL copy `spotsTotal` from `BTClass.maxSize` onto the new Session document, defaulting to `15` if `BTClass.maxSize` is absent.
7. WHEN an admin submits the Add Session form, THE Admin_Page SHALL copy `ageMin` and `ageMax` from the selected `BTClass` onto the new Session document, defaulting to `5` and `12` respectively if absent.
8. WHEN a `recipeId` is selected, THE Admin_Page SHALL look up the matching Recipe document and denormalise `recipeName` onto the new Session document.
9. WHEN an `instructorId` is selected, THE Admin_Page SHALL look up the matching Instructor document and denormalise `instructorName` onto the new Session document.
10. THE Admin_Page SHALL NOT expose `className`, `classType`, `venueId`, `venueName`, `price`, `startTime`, `endTime`, `spotsTotal`, `ageMin`, or `ageMax` as editable form fields during session creation.

---

### Requirement 3: Session Editing

**User Story:** As an admin, I want to edit an existing session's date, recipe, instructor, status, and spot availability, so that I can correct or update session details without recreating it.

#### Acceptance Criteria

1. WHEN an admin clicks the edit button on a session row, THE Admin_Page SHALL open the session form modal pre-populated with the session's current `classId`, `date`, `recipeId`, `instructorId`, `status`, and `spotsAvailable`.
2. WHEN an admin submits the edit form, THE Admin_Page SHALL re-derive all denormalised fields from the selected `BTClass`, `Recipe`, and `Instructor` documents using the same rules as session creation.
3. WHEN an admin submits the edit form, THE Admin_Page SHALL write an `updatedAt` server timestamp alongside the updated fields to the `sessions` collection.
4. WHEN the Firestore write succeeds, THE Admin_Page SHALL update the session row in the local state without requiring a full page reload.
5. IF the Firestore write fails, THEN THE Admin_Page SHALL display an alert message informing the admin that the save failed.

---

### Requirement 4: Session Deletion with Safety Check

**User Story:** As an admin, I want to delete a session only after being warned about existing confirmed bookings, so that I do not accidentally orphan customer booking records.

#### Acceptance Criteria

1. WHEN an admin clicks the delete button on a session, THE Admin_Page SHALL query the `bookings` collection for documents where `sessionId` equals the session's `id` AND `status` equals `'confirmed'`.
2. WHEN confirmed bookings exist for the session, THE Admin_Page SHALL display a confirmation dialog warning the admin that the session has N confirmed booking(s) and that deleting it will NOT automatically cancel or refund those bookings.
3. WHEN no confirmed bookings exist for the session, THE Admin_Page SHALL display a standard confirmation dialog stating the deletion cannot be undone.
4. WHEN the admin confirms deletion, THE Admin_Page SHALL delete the session document from the `sessions` collection.
5. WHEN the Firestore delete succeeds, THE Admin_Page SHALL remove the session row from the local state immediately.
6. IF the Firestore delete fails with a `permission-denied` error code, THEN THE Admin_Page SHALL display an alert stating the admin does not have permission to delete this session.
7. IF the Firestore delete fails with any other error, THEN THE Admin_Page SHALL display an alert with the error message.

---

### Requirement 5: Status Management

**User Story:** As an admin, I want to set a session's status to open, closed, or cancelled, so that I can control whether the session is bookable by users.

#### Acceptance Criteria

1. THE Admin_Page SHALL offer exactly three selectable status values in the session form: `'open'`, `'closed'`, and `'cancelled'`.
2. WHEN a session is created without an explicit status, THE Admin_Page SHALL default the status to `'open'`.
3. WHEN a session's `status` is `'open'`, THE Admin_Page SHALL render the status badge with an indigo style.
4. WHEN a session's `status` is not `'open'`, THE Admin_Page SHALL render the status badge with a grey style.
5. THE Admin_Page SHALL NOT offer `'full'` as a manually selectable status option in the form, as that value is set programmatically by the booking system.

---

### Requirement 6: Spots Availability Constraint

**User Story:** As an admin, I want the system to ensure spot availability makes sense relative to class capacity, so that sessions cannot be oversold from the outset.

#### Acceptance Criteria

1. WHEN an admin creates a session, THE Admin_Page SHALL initialise `spotsAvailable` to `15` as the default value in the form.
2. WHEN an admin sets `spotsAvailable` on a new session, THE Session document SHALL store `spotsAvailable` as a value no greater than `spotsTotal` (inherited from `BTClass.maxSize`).
3. WHEN an admin edits `spotsAvailable` on an existing session, THE Session document SHALL store `spotsAvailable` as a non-negative integer.

---

### Requirement 7: Reference Data Loading

**User Story:** As an admin, I want the session form to be pre-populated with available classes, recipes, and instructors, so that I can select from existing records without typing free-form text.

#### Acceptance Criteria

1. WHEN the Admin_Page loads, THE Admin_Page SHALL fetch all documents from the `classes`, `recipes`, and `instructors` Firestore collections.
2. WHEN the Base Class Type select field is rendered, THE Admin_Page SHALL list each BTClass as an option showing its `type` and `venueName`.
3. WHEN the Recipe select field is rendered, THE Admin_Page SHALL list each Recipe by `name`, with a `'None'` option as the first entry.
4. WHEN the Instructor select field is rendered, THE Admin_Page SHALL list each Instructor by `name`, with a `'None'` option as the first entry.

---

### Requirement 8: Error Handling and Resilience

**User Story:** As an admin, I want clear feedback when data operations fail, so that I know when manual intervention is required.

#### Acceptance Criteria

1. IF the initial data fetch for sessions, classes, recipes, or instructors fails, THEN THE Admin_Page SHALL log the error to the console and set loading to false so the page does not remain in a perpetual loading state.
2. IF the session save operation fails, THEN THE Admin_Page SHALL display an alert with the text `'Error saving session.'`.
3. WHEN a session is saved successfully, THE Admin_Page SHALL close the modal and reflect the change in the session table without a full page reload.
