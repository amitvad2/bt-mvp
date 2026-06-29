# Requirements Document

## Introduction

This document captures the Firestore security rules for the Blooming Tastebuds MVP application. These rules enforce data access control at the database layer — the actual security boundary for all Firestore collections. The rules are implemented in `firestore.rules` and apply to all client SDK reads and writes. The Firebase Admin SDK (used in server-side API routes and the Stripe webhook) bypasses these rules entirely.

The system must prevent unauthorised access, privilege escalation, and field-level tampering while allowing legitimate user workflows: public browsing, user registration, student management, booking viewing, and booking cancellation.

## Glossary

- **Security_Rules**: The Firestore security rules engine that evaluates `allow` predicates for every client SDK operation.
- **Caller**: The authenticated or unauthenticated Firebase user making the request.
- **Admin_SDK**: Firebase Admin SDK running server-side (API routes, Stripe webhook). Bypasses all Security_Rules.
- **Client_SDK**: Firebase client SDK running in the browser. Subject to all Security_Rules.
- **isSignedIn**: Helper function returning `true` when `request.auth != null`.
- **callerRole**: Helper function that reads `users/{uid}.role` from Firestore to determine the caller's role.
- **isAdmin**: Helper function returning `true` when the caller is signed in and their role equals `'admin'`.
- **isOwner**: Helper function returning `true` when the caller is signed in and `request.auth.uid == uid`.
- **affectedKeys**: Firestore expression `request.resource.data.diff(resource.data).affectedKeys()` — the set of keys changed by the write operation.
- **Public_Collection**: A collection whose documents can be read without authentication (`gallery`, `sessions`, `venues`, `classes`, `recipes`, `instructors`).
- **Server_Only_Collection**: A collection that denies all Client_SDK access (`booking_drafts`).
- **BTUser**: A user profile document stored in `users/{uid}`.
- **Student**: A child profile document stored in `students/{studentId}`, owned by a parent user.
- **Booking**: A booking document stored in `bookings/{bookingId}`, created exclusively by the Stripe webhook via Admin_SDK.
- **booking_draft**: A temporary payment intent payload stored in `booking_drafts/{paymentIntentId}`, created and consumed exclusively by server-side API routes via Admin_SDK.
- **contact_message**: A contact form submission stored in `contact_messages/{docId}`, created exclusively by the contact API route via Admin_SDK.

---

## Requirements

### Requirement 1: Helper Function — Authentication Check

**User Story:** As the Security_Rules engine, I need a reliable way to determine whether a request comes from an authenticated user, so that rules protecting private data can enforce authentication as a precondition.

#### Acceptance Criteria

1. THE Security_Rules SHALL expose a helper `isSignedIn()` that returns `true` when `request.auth != null`.
2. WHEN `request.auth` is `null` (unauthenticated request), THE Security_Rules SHALL evaluate `isSignedIn()` as `false`.
3. WHEN `request.auth` is non-null (authenticated request), THE Security_Rules SHALL evaluate `isSignedIn()` as `true`.
4. THE Security_Rules SHALL use `isSignedIn()` as a precondition in all rules that protect non-public data.

---

### Requirement 2: Helper Function — Role Lookup

**User Story:** As the Security_Rules engine, I need to retrieve the authenticated caller's role from Firestore, so that admin-only operations can be gated on the stored role rather than on a client-supplied claim.

#### Acceptance Criteria

1. THE Security_Rules SHALL expose a helper `callerRole()` that reads `users/{request.auth.uid}.role` from Firestore.
2. THE Security_Rules SHALL expose a helper `isAdmin()` that returns `true` when `isSignedIn()` is `true` AND `callerRole() == 'admin'`.
3. WHEN the caller's role document does not contain `'admin'`, THE Security_Rules SHALL evaluate `isAdmin()` as `false`.
4. THE Security_Rules SHALL expose a helper `isOwner(uid)` that returns `true` when `isSignedIn()` is `true` AND `request.auth.uid == uid`.
5. WHEN the caller's UID does not match the provided `uid` argument, THE Security_Rules SHALL evaluate `isOwner(uid)` as `false`.

---

### Requirement 3: Public Content Collections

**User Story:** As a website visitor, I want to view sessions, galleries, venues, classes, recipes, and instructor information without signing in, so that I can browse the site before creating an account.

#### Acceptance Criteria

1. THE Security_Rules SHALL allow any unauthenticated or authenticated Client_SDK request to read documents from the `gallery` collection.
2. THE Security_Rules SHALL allow any unauthenticated or authenticated Client_SDK request to read documents from the `sessions` collection.
3. THE Security_Rules SHALL allow any unauthenticated or authenticated Client_SDK request to read documents from the `venues` collection.
4. THE Security_Rules SHALL allow any unauthenticated or authenticated Client_SDK request to read documents from the `classes` collection.
5. THE Security_Rules SHALL allow any unauthenticated or authenticated Client_SDK request to read documents from the `recipes` collection.
6. THE Security_Rules SHALL allow any unauthenticated or authenticated Client_SDK request to read documents from the `instructors` collection.
7. WHEN a Client_SDK request attempts to write to `gallery`, `sessions`, `venues`, `classes`, `recipes`, or `instructors`, THE Security_Rules SHALL deny the write unless `isAdmin()` is `true`.
8. IF a Client_SDK request attempts to write to a Public_Collection without admin role, THEN THE Security_Rules SHALL return a permission-denied error.

---

### Requirement 4: Server-Only Collection — booking_drafts

**User Story:** As the system architect, I want `booking_drafts` to be completely inaccessible to any browser client, so that raw payment intent payloads containing sensitive booking data are never exposed via client reads.

#### Acceptance Criteria

1. THE Security_Rules SHALL deny all Client_SDK read operations on the `booking_drafts` collection.
2. THE Security_Rules SHALL deny all Client_SDK write operations on the `booking_drafts` collection.
3. WHEN any Client_SDK request (authenticated or unauthenticated) targets `booking_drafts/{docId}`, THE Security_Rules SHALL return a permission-denied error.
4. THE Security_Rules SHALL express the `booking_drafts` deny-all rule as `allow read, write: if false` to make the intent explicit.

---

### Requirement 5: Contact Messages Collection

**User Story:** As the system architect, I want contact form submissions to be writable only by the server-side API, so that clients cannot forge or delete contact messages, while admins can manage them via the inbox.

#### Acceptance Criteria

1. THE Security_Rules SHALL deny all Client_SDK `create` operations on the `contact_messages` collection.
2. THE Security_Rules SHALL deny all Client_SDK `delete` operations on the `contact_messages` collection.
3. WHEN a Client_SDK request attempts to create or delete a `contact_messages` document, THE Security_Rules SHALL return a permission-denied error regardless of authentication state.
4. THE Security_Rules SHALL allow a Client_SDK `read` operation on `contact_messages/{docId}` only when `isAdmin()` is `true`.
5. THE Security_Rules SHALL allow a Client_SDK `update` operation on `contact_messages/{docId}` only when `isAdmin()` is `true`.
6. WHEN a non-admin authenticated user attempts to read `contact_messages`, THE Security_Rules SHALL return a permission-denied error.

---

### Requirement 6: User Profiles — Read Access

**User Story:** As an authenticated user, I want to read my own profile document so that the application can display my name and role, and admins need read access to manage user accounts.

#### Acceptance Criteria

1. THE Security_Rules SHALL allow a Client_SDK `read` on `users/{uid}` when `isOwner(uid)` is `true`.
2. THE Security_Rules SHALL allow a Client_SDK `read` on `users/{uid}` when `isAdmin()` is `true`.
3. WHEN a Client_SDK request attempts to read `users/{uid}` and the caller's UID does not match `uid` and the caller is not admin, THE Security_Rules SHALL return a permission-denied error.
4. WHEN an unauthenticated Client_SDK request attempts to read any `users/{uid}` document, THE Security_Rules SHALL return a permission-denied error.

---

### Requirement 7: User Profiles — Create (Registration)

**User Story:** As a new user, I want to create my own profile document during sign-up, so that my role and display name are stored in Firestore, while the system prevents me from creating an admin account or a profile for another user.

#### Acceptance Criteria

1. THE Security_Rules SHALL allow a Client_SDK `create` on `users/{uid}` only when `isOwner(uid)` is `true`.
2. THE Security_Rules SHALL allow a Client_SDK `create` on `users/{uid}` only when `request.resource.data.uid == request.auth.uid`.
3. THE Security_Rules SHALL allow a Client_SDK `create` on `users/{uid}` only when `request.resource.data.role` is one of `['parent', 'youngAdult']`.
4. IF a Client_SDK create request sets `role` to `'admin'`, THEN THE Security_Rules SHALL deny the operation.
5. IF a Client_SDK create request sets `uid` to a value different from `request.auth.uid`, THEN THE Security_Rules SHALL deny the operation.
6. IF an unauthenticated Client_SDK request attempts to create `users/{uid}`, THEN THE Security_Rules SHALL deny the operation.

---

### Requirement 8: User Profiles — Update (Profile Editing)

**User Story:** As an authenticated user, I want to update my display name and phone number, so that my profile stays current, while the system prevents me from modifying my role, UID, or creation timestamp.

#### Acceptance Criteria

1. THE Security_Rules SHALL allow a Client_SDK `update` on `users/{uid}` only when `isOwner(uid)` is `true`.
2. THE Security_Rules SHALL allow a Client_SDK `update` on `users/{uid}` only when `affectedKeys().hasOnly(['firstName', 'lastName', 'phone', 'updatedAt'])`.
3. THE Security_Rules SHALL deny a Client_SDK `update` on `users/{uid}` that attempts to change `role`.
4. THE Security_Rules SHALL deny a Client_SDK `update` on `users/{uid}` that attempts to change `uid`.
5. THE Security_Rules SHALL deny a Client_SDK `update` on `users/{uid}` that attempts to change `createdAt`.
6. IF a Client_SDK update includes any key outside `['firstName', 'lastName', 'phone', 'updatedAt']`, THEN THE Security_Rules SHALL deny the entire operation.
7. THE Security_Rules SHALL enforce that `request.resource.data.role == resource.data.role` after an update to prevent role escalation via full-document overwrites.
8. THE Security_Rules SHALL enforce that `request.resource.data.uid == resource.data.uid` after an update to prevent UID tampering.
9. THE Security_Rules SHALL enforce that `request.resource.data.createdAt == resource.data.createdAt` after an update to prevent timestamp manipulation.

---

### Requirement 9: User Profiles — Delete Protection

**User Story:** As the system architect, I want to ensure no client can delete user profile documents, so that account data is preserved and deletions require administrative intervention.

#### Acceptance Criteria

1. THE Security_Rules SHALL NOT include a `delete` rule for `users/{uid}` documents, causing all Client_SDK delete attempts to be implicitly denied.
2. WHEN any Client_SDK request attempts to delete a `users/{uid}` document, THE Security_Rules SHALL return a permission-denied error.

---

### Requirement 10: Students — Read Access

**User Story:** As a parent, I want to read my students' profiles so that I can view and manage my children's information, while ensuring no other user can access another family's student data.

#### Acceptance Criteria

1. THE Security_Rules SHALL allow a Client_SDK `read` on `students/{studentId}` when `isOwner(resource.data.parentUid)` is `true`.
2. THE Security_Rules SHALL allow a Client_SDK `read` on `students/{studentId}` when `isAdmin()` is `true`.
3. WHEN a Client_SDK read on `students/{studentId}` is made by a caller whose UID does not match `resource.data.parentUid` and who is not admin, THE Security_Rules SHALL return a permission-denied error.
4. WHEN an unauthenticated Client_SDK request attempts to read any `students/{studentId}` document, THE Security_Rules SHALL return a permission-denied error.

---

### Requirement 11: Students — Create

**User Story:** As a signed-in parent, I want to create a student profile for my child with basic biographical details, so that I can book sessions on their behalf, while the system prevents clients from setting sensitive health or webhook-managed fields at creation time.

#### Acceptance Criteria

1. THE Security_Rules SHALL allow a Client_SDK `create` on `students/{studentId}` only when `isSignedIn()` is `true`.
2. THE Security_Rules SHALL allow a Client_SDK `create` on `students/{studentId}` only when `request.resource.data.parentUid == request.auth.uid`.
3. THE Security_Rules SHALL allow a Client_SDK `create` on `students/{studentId}` only when `request.resource.data.keys().hasOnly(['firstName', 'lastName', 'dateOfBirth', 'parentUid', 'createdAt'])`.
4. IF a Client_SDK create request includes the `medicalInfo` field, THEN THE Security_Rules SHALL deny the operation.
5. IF a Client_SDK create request includes the `emergencyContact` field, THEN THE Security_Rules SHALL deny the operation.
6. IF a Client_SDK create request includes the `questionnaire` field, THEN THE Security_Rules SHALL deny the operation.
7. IF a Client_SDK create request sets `parentUid` to a value different from `request.auth.uid`, THEN THE Security_Rules SHALL deny the operation.

---

### Requirement 12: Students — Update

**User Story:** As a parent, I want to update my student's basic details (name, date of birth), so that corrections can be made, while the system prevents any client from modifying sensitive health fields that are managed exclusively by the booking webhook.

#### Acceptance Criteria

1. THE Security_Rules SHALL allow a Client_SDK `update` on `students/{studentId}` only when `resource.data.parentUid == request.auth.uid`.
2. THE Security_Rules SHALL allow a Client_SDK `update` on `students/{studentId}` only when `affectedKeys().hasOnly(['firstName', 'lastName', 'dateOfBirth', 'updatedAt'])`.
3. THE Security_Rules SHALL deny a Client_SDK `update` on `students/{studentId}` that attempts to change `parentUid`.
4. THE Security_Rules SHALL deny a Client_SDK `update` on `students/{studentId}` that attempts to change `medicalInfo`.
5. THE Security_Rules SHALL deny a Client_SDK `update` on `students/{studentId}` that attempts to change `emergencyContact`.
6. THE Security_Rules SHALL deny a Client_SDK `update` on `students/{studentId}` that attempts to change `questionnaire`.
7. IF a Client_SDK update includes any key outside `['firstName', 'lastName', 'dateOfBirth', 'updatedAt']`, THEN THE Security_Rules SHALL deny the entire operation.
8. THE Security_Rules SHALL enforce that `request.resource.data.parentUid == resource.data.parentUid` after an update.

---

### Requirement 13: Students — Delete

**User Story:** As a parent, I want to delete a student profile I own, so that I can remove a child no longer attending classes, while the system ensures only the owning parent can perform this action.

#### Acceptance Criteria

1. THE Security_Rules SHALL allow a Client_SDK `delete` on `students/{studentId}` only when `isSignedIn()` is `true` AND `resource.data.parentUid == request.auth.uid`.
2. WHEN a Client_SDK delete request is made by a caller whose UID does not match `resource.data.parentUid`, THE Security_Rules SHALL return a permission-denied error.
3. WHEN an unauthenticated Client_SDK request attempts to delete a student document, THE Security_Rules SHALL return a permission-denied error.

---

### Requirement 14: Bookings — No Client Create

**User Story:** As the system architect, I want to ensure that no browser client can ever create a booking document directly, so that all bookings are exclusively created by the Stripe webhook via Admin_SDK after payment confirmation.

#### Acceptance Criteria

1. THE Security_Rules SHALL NOT include an `allow create` rule for `bookings/{bookingId}`, causing all Client_SDK create attempts to be implicitly denied.
2. WHEN any Client_SDK request attempts to create a `bookings/{bookingId}` document, THE Security_Rules SHALL return a permission-denied error regardless of authentication state.
3. THE Security_Rules SHALL include a comment explicitly stating that the absence of a `create` rule is intentional.

---

### Requirement 15: Bookings — Read Access

**User Story:** As a signed-in user, I want to read my own booking documents, so that the confirmation page and "My Classes" portal page can display booking details, including polling for a booking that hasn't been created yet.

#### Acceptance Criteria

1. THE Security_Rules SHALL allow a Client_SDK `read` on `bookings/{bookingId}` when `isSignedIn()` is `true` AND `resource.data.bookedByUid == request.auth.uid`.
2. THE Security_Rules SHALL allow a Client_SDK `read` on `bookings/{bookingId}` when `isSignedIn()` is `true` AND `resource == null` (document does not yet exist), to support confirmation page polling.
3. WHEN a signed-in user reads a booking whose `bookedByUid` does not match their UID, THE Security_Rules SHALL return a permission-denied error.
4. WHEN an unauthenticated user attempts to read any booking document, THE Security_Rules SHALL return a permission-denied error.
5. THE Security_Rules SHALL allow a Client_SDK `read` on `bookings/{bookingId}` when `isAdmin()` is `true`.

---

### Requirement 16: Bookings — Cancellation Update

**User Story:** As a signed-in user, I want to cancel my own booking by updating its status to `'cancelled'`, so that I can withdraw from a session I can no longer attend, while the system prevents any other field from being modified.

#### Acceptance Criteria

1. THE Security_Rules SHALL allow a Client_SDK `update` on `bookings/{bookingId}` only when `isSignedIn()` is `true` AND `resource.data.bookedByUid == request.auth.uid`.
2. THE Security_Rules SHALL allow a Client_SDK `update` on `bookings/{bookingId}` only when `request.resource.data.status == 'cancelled'`.
3. THE Security_Rules SHALL allow a Client_SDK `update` on `bookings/{bookingId}` only when `affectedKeys().hasOnly(['status', 'cancelledAt'])`.
4. IF a Client_SDK update on a booking includes any key outside `['status', 'cancelledAt']`, THEN THE Security_Rules SHALL deny the entire operation.
5. IF a Client_SDK update on a booking sets `status` to any value other than `'cancelled'`, THEN THE Security_Rules SHALL deny the operation.
6. THE Security_Rules SHALL allow a Client_SDK `write` on `bookings/{bookingId}` when `isAdmin()` is `true`.
