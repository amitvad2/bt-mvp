# Requirements Document

## Introduction

The contact system allows any visitor to the Blooming Tastebuds public website to submit an enquiry or piece of feedback via a web form. The form collects the visitor's name, email address, optional phone number, an enquiry category, a message body, and explicit consent to be contacted back. On submission the system validates the data client-side (React Hook Form + Zod), then POSTs it to a server-side API route that re-validates independently, persists the message to Firestore, and dispatches an admin notification email via Resend. The admin inbox at `/admin/contact` lets admin users read messages, expand their full content, and progress their status through a defined lifecycle.

## Glossary

- **ContactForm**: The React client component at `src/app/(public)/contact/ContactForm.tsx` that renders and submits the enquiry form.
- **Contact_API**: The Next.js API route at `src/app/api/contact/route.ts` that receives, validates, and persists contact submissions.
- **Contact_Schema**: The Zod validation schema that defines the shape and constraints of a valid contact submission, instantiated independently in both `ContactForm` and `Contact_API`.
- **ContactMessage**: The Firestore document type stored in the `contact_messages` collection, as defined in `src/types/index.ts`.
- **Admin_Inbox**: The admin panel page at `/admin/contact` (`src/app/admin/contact/page.tsx`) that displays, filters, and allows status management of `ContactMessage` documents.
- **escapeHtml**: The pure function in `Contact_API` that replaces `&`, `<`, `>`, `"`, and `'` with their HTML entity equivalents before user-supplied strings are interpolated into the notification email template.
- **Resend**: The third-party transactional email service used to dispatch the admin notification email.
- **ContactStatus**: The string union `'new' | 'read' | 'replied' | 'closed'` representing the lifecycle state of a `ContactMessage`.
- **ContactCategory**: The string union `'general' | 'class-info' | 'booking-help' | 'dietary-allergy' | 'private-event' | 'technical' | 'feedback'` representing the type of enquiry.

---

## Requirements

### Requirement 1: Form Field Validation

**User Story:** As a website visitor, I want clear validation on every form field, so that I understand what information is required before my message is sent.

#### Acceptance Criteria

1. THE `ContactForm` SHALL render fields for name, email address, phone (optional), enquiry category, message, and a consent checkbox.
2. WHEN a user submits the form with a name shorter than 2 characters, THE `ContactForm` SHALL display the error message "Name is required" inline beneath the name field and prevent submission.
3. WHEN a user submits the form with an email address that does not match the standard email format, THE `ContactForm` SHALL display the error message "Enter a valid email address" inline beneath the email field and prevent submission.
4. WHEN a user submits the form without selecting an enquiry category, THE `ContactForm` SHALL display the error message "Please select an enquiry type" inline beneath the category field and prevent submission.
5. WHEN a user submits the form with a message body shorter than 10 characters, THE `ContactForm` SHALL display the error message "Please enter at least 10 characters" inline beneath the message field and prevent submission.
6. WHEN a user submits the form without checking the consent checkbox, THE `ContactForm` SHALL display the error message "Please consent to being contacted back" inline beneath the checkbox and prevent submission.
7. WHERE a phone number is provided, THE `ContactForm` SHALL accept it without format validation and include it in the submission payload.

---

### Requirement 2: Form Submission States

**User Story:** As a website visitor, I want clear feedback when I submit the form, so that I know whether my message was sent successfully or encountered an error.

#### Acceptance Criteria

1. WHEN a valid form is submitted and the server returns a `200` response, THE `ContactForm` SHALL hide the form, replace the "Send a Message" heading with a "Message sent!" heading, and display the confirmation message "Thanks for getting in touch. Your message has been sent and we'll reply within 2 business days."
2. WHEN a valid form is submitted and the server returns a non-`200` response, THE `ContactForm` SHALL display the server-supplied error message inline above the form fields, and the form SHALL remain visible and re-submittable.
3. WHEN a fetch call throws a network error, THE `ContactForm` SHALL display "Could not send your message. Please check your connection and try again." inline above the form fields.
4. WHILE a submission request is in-flight, THE `ContactForm` SHALL disable the submit button and change its label to "Sending…".
5. WHEN a submission request completes (either success or failure), THE `ContactForm` SHALL re-enable the submit button.

---

### Requirement 3: Server-Side Schema Validation

**User Story:** As a system operator, I want the API route to validate every submission independently of the client, so that invalid or malicious payloads are rejected even if client-side validation is bypassed.

#### Acceptance Criteria

1. THE `Contact_API` SHALL define a `Contact_Schema` that is structurally identical to the client-side schema and is evaluated independently on every request.
2. WHEN a `POST` request body fails `Contact_Schema` validation, THE `Contact_API` SHALL return an HTTP `400` response containing `{ error: 'Invalid submission', issues: { <fieldErrors> } }` and SHALL NOT write to Firestore.
3. WHEN a `POST` request body passes `Contact_Schema` validation, THE `Contact_API` SHALL proceed to persist the message.
4. THE `Contact_Schema` SHALL reject any payload where `consentToReply` is not the boolean `true`.
5. THE `Contact_Schema` SHALL reject any `category` value that is not one of the seven defined `ContactCategory` values.
6. THE `Contact_API` SHALL NOT accept a `userId` field from the client; the `userId` field is intentionally absent from `Contact_Schema`.

---

### Requirement 4: Firestore Persistence

**User Story:** As a system operator, I want every valid contact submission to be durably stored, so that messages are never lost and can be reviewed asynchronously.

#### Acceptance Criteria

1. WHEN a `POST` request body passes `Contact_Schema` validation, THE `Contact_API` SHALL write a new document to the `contact_messages` Firestore collection using the Firebase Admin SDK.
2. THE `Contact_API` SHALL set the `status` field of the new document to `'new'`.
3. THE `Contact_API` SHALL set the `source` field of the new document to `'contact-page'`.
4. THE `Contact_API` SHALL set the `createdAt` field to `admin.firestore.FieldValue.serverTimestamp()`.
5. WHERE a phone number is present in the validated payload, THE `Contact_API` SHALL include the `phone` field in the Firestore document.
6. IF the Firebase Admin SDK is uninitialised (`adminInitError` is truthy), THEN THE `Contact_API` SHALL return an HTTP `500` response with `{ error: 'Service temporarily unavailable' }` and SHALL NOT attempt a Firestore write.
7. WHEN the Firestore write succeeds, THE `Contact_API` SHALL return an HTTP `200` response containing `{ success: true, id: <documentId> }`.

---

### Requirement 5: HTML Escaping for Email Safety

**User Story:** As a system operator, I want all user-supplied content to be HTML-escaped before it is inserted into the admin notification email, so that cross-site scripting payloads embedded in form fields cannot execute in an email client.

#### Acceptance Criteria

1. THE `escapeHtml` function SHALL replace every occurrence of `&` with `&amp;`, `<` with `&lt;`, `>` with `&gt;`, `"` with `&quot;`, and `'` with `&#39;` in the input string.
2. WHEN building the notification email HTML, THE `Contact_API` SHALL apply `escapeHtml` to the `name`, `email`, `phone` (when present), `message`, and category label fields before interpolating them into the template.
3. WHEN the `name`, `email`, or `message` fields contain no HTML special characters, THE `escapeHtml` function SHALL return the original string unchanged.
4. THE `escapeHtml` function SHALL handle strings containing multiple distinct special characters within a single input and escape each occurrence independently.

---

### Requirement 6: Admin Notification Email (Non-Fatal)

**User Story:** As the business owner, I want to receive an email notification whenever a new enquiry is submitted, so that I can respond promptly without having to check the admin panel.

#### Acceptance Criteria

1. WHEN a Firestore write succeeds, THE `Contact_API` SHALL attempt to send an HTML notification email to the configured admin email address via Resend.
2. THE `Contact_API` SHALL set the `replyTo` field of the notification email to the submitter's email address.
3. THE `Contact_API` SHALL use `RESEND_ADMIN_EMAIL` as the recipient when the environment variable is set, and SHALL fall back to `bloomingtastebuds@gmail.com` when it is not set.
4. IF the Resend API call throws an error, THEN THE `Contact_API` SHALL log the error and SHALL continue, returning the `200` success response to the client unaffected.
5. THE `Contact_API` SHALL NOT send a notification email when `Contact_Schema` validation fails.

---

### Requirement 7: Admin Inbox — Message Listing and Filtering

**User Story:** As an admin user, I want to view all contact messages in a filterable inbox, so that I can find and prioritise messages that need attention.

#### Acceptance Criteria

1. WHEN the `Admin_Inbox` page loads, THE `Admin_Inbox` SHALL fetch all documents from `contact_messages` ordered by `createdAt` descending and display them in a table.
2. THE `Admin_Inbox` SHALL display a badge showing the count of messages with status `'new'` when that count is greater than zero.
3. WHEN a user selects a filter button, THE `Admin_Inbox` SHALL display only messages whose `status` matches the selected filter value.
4. WHEN no messages match the active filter, THE `Admin_Inbox` SHALL display an empty-state message indicating no messages exist for that status.
5. WHEN a user clicks the expand button on a message row, THE `Admin_Inbox` SHALL reveal the full `message` body and the consent indicator for that message.
6. WHEN a user clicks the expand button on an already-expanded message row, THE `Admin_Inbox` SHALL collapse the detail view for that message.

---

### Requirement 8: Admin Inbox — Status Management

**User Story:** As an admin user, I want to update the status of a contact message, so that the team can track which enquiries have been read, replied to, or closed.

#### Acceptance Criteria

1. WHEN an admin user changes the status dropdown for a message, THE `Admin_Inbox` SHALL call `updateDoc` on the corresponding `contact_messages` Firestore document with the new `ContactStatus` value and an `updatedAt` server timestamp.
2. WHEN the `updateDoc` call succeeds, THE `Admin_Inbox` SHALL update the in-memory message list so the status change is reflected immediately in the UI without requiring a page reload.
3. THE `Admin_Inbox` SHALL support transitioning a message to any of the four `ContactStatus` values: `'new'`, `'read'`, `'replied'`, `'closed'`.
4. IF the `updateDoc` call fails, THEN THE `Admin_Inbox` SHALL log the error to the console and leave the displayed status unchanged.
