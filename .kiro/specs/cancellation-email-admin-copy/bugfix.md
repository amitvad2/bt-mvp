# Bugfix Requirements Document

## Introduction

When a user cancels a booking from the portal "My Classes" page, a cancellation confirmation email is sent only to the user who made the cancellation. The business admin (bloomingtastebuds@gmail.com) does not receive a copy of the cancellation email. This means the admin has no email notification that a cancellation has occurred and must manually check Firestore or the admin panel to discover cancellations. The admin should receive the same cancellation email (or a copy via CC/BCC) so they are immediately aware of all booking cancellations.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a user cancels a booking from the portal "My Classes" page AND the `/api/emails/send` route processes a cancellation email THEN the system sends the cancellation email only to the user's email address without including the admin email (RESEND_ADMIN_EMAIL)

1.2 WHEN a user cancels a bundle booking from the portal "My Classes" page AND the `/api/emails/send` route processes a bundle-cancellation email THEN the system sends the bundle cancellation email only to the user's email address without including the admin email (RESEND_ADMIN_EMAIL)

### Expected Behavior (Correct)

2.1 WHEN a user cancels a booking from the portal "My Classes" page AND the `/api/emails/send` route processes a cancellation email THEN the system SHALL send the cancellation email to both the user's email address AND the admin email (RESEND_ADMIN_EMAIL) as a CC recipient

2.2 WHEN a user cancels a bundle booking from the portal "My Classes" page AND the `/api/emails/send` route processes a bundle-cancellation email THEN the system SHALL send the bundle cancellation email to both the user's email address AND the admin email (RESEND_ADMIN_EMAIL) as a CC recipient

2.3 WHEN the RESEND_ADMIN_EMAIL environment variable is not configured AND a cancellation or bundle-cancellation email is sent THEN the system SHALL still send the cancellation email to the user without failing, and log a warning that the admin email was not included

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a confirmation email (type "confirmation") is sent via the `/api/emails/send` route THEN the system SHALL CONTINUE TO send the email only to the user's email address (no admin CC for booking confirmations, as those are handled separately by the Stripe webhook)

3.2 WHEN the `/api/emails/send` route receives a request with missing required fields (to, subject, type) THEN the system SHALL CONTINUE TO return a 400 error response

3.3 WHEN the `/api/emails/send` route receives a request without valid authentication THEN the system SHALL CONTINUE TO return a 401 Unauthorised response

3.4 WHEN the RESEND_API_KEY is not configured THEN the system SHALL CONTINUE TO return a 500 error indicating the email service is not configured
