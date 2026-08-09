# Requirements Document

## Introduction

Migrate the Blooming Tastebuds Firebase infrastructure from the US (nam5) region to Europe (europe-west2 / London). The migration covers both the dev project (bt-mvp-dev) and production project (bt-mvp-d057f), replacing each with new Firebase projects provisioned in europe-west2. The dev environment is migrated first to validate the process before touching production. Firebase does not support changing the region of an existing project, so new projects must be created and all data, rules, auth users, and configuration must be transferred.

## Glossary

- **Firebase_Project**: A Google Cloud project with Firebase services enabled, identified by a unique project ID
- **Source_Project**: The existing Firebase project in the nam5 (US) region being migrated from (bt-mvp-dev for dev, bt-mvp-d057f for production)
- **Target_Project**: The new Firebase project created in the europe-west2 (London) region
- **Migration_Operator**: The developer performing the migration steps
- **Firebase_CLI**: The Firebase command-line tool used to deploy rules, manage projects, and export/import data
- **GCloud_CLI**: The Google Cloud command-line tool used for data export/import operations
- **Firestore_Export**: A GCS-based backup of all Firestore collections created via `gcloud firestore export`
- **Auth_Export**: A JSON file containing Firebase Authentication user records exported via Firebase Admin SDK
- **Storage_Migration**: The process of copying Firebase Storage files from the source bucket to the target bucket using `gsutil`
- **Service_Account**: A JSON credential file used by Firebase Admin SDK for server-side authentication
- **Environment_Variables**: Configuration values stored in `.env.local` (local) and Vercel project settings (deployed)
- **Authorized_Domains**: The list of domains permitted to initiate OAuth sign-in flows in Firebase Authentication settings
- **OAuth_Consent_Screen**: The Google Cloud configuration that controls which domains and redirect URIs are allowed for Google sign-in
- **Vercel_Preview**: Vercel deployment environments for non-production branches, used for testing before production deployment
- **Vercel_Production**: The live Vercel deployment serving the public-facing application

## Requirements

### Requirement 1: Create New Dev Firebase Project in Europe

**User Story:** As a Migration_Operator, I want to create a new Firebase project in the europe-west2 region to replace bt-mvp-dev, so that the development environment serves data from the London region.

#### Acceptance Criteria

1. WHEN the Migration_Operator creates the Target_Project, THE Firebase_Project SHALL be provisioned with Firestore set to europe-west2 (London) region
2. WHEN the Target_Project is created, THE Firebase_Project SHALL have Firebase Authentication enabled with email/password and Google sign-in providers active and accepting sign-in requests
3. WHEN the Target_Project is created, THE Firebase_Project SHALL have a Firebase Storage bucket provisioned in the europe-west2 region
4. WHEN the Target_Project is created, THE Firebase_Project SHALL have a web app registered to generate the client SDK configuration values (apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId)
5. WHEN the Target_Project is created, THE Firebase_Project SHALL have a service account generated with permissions for Firestore, Authentication, and Storage, producing a JSON credential containing project_id, private_key, and client_email fields
6. WHEN the Target_Project is created, THE Firebase_Project SHALL be on the Blaze (pay-as-you-go) billing plan to support Authentication, Firestore, and Storage services

### Requirement 2: Create New Production Firebase Project in Europe

**User Story:** As a Migration_Operator, I want to create a new Firebase project in the europe-west2 region to replace bt-mvp-d057f, so that the production environment serves data from the London region.

#### Acceptance Criteria

1. WHEN all acceptance criteria of the dev migration (Requirement 1) pass successfully, THE Migration_Operator SHALL create the production Target_Project with Firestore provisioned in the europe-west2 (London) region
2. WHEN the production Target_Project is created, THE Firebase_Project SHALL have Firebase Authentication enabled with email/password and Google sign-in providers, verified by successfully creating a test user with email/password and completing a Google sign-in OAuth flow
3. WHEN the production Target_Project is created, THE Firebase_Project SHALL have a Firebase Storage bucket provisioned in the europe-west2 region
4. WHEN the production Target_Project is created, THE Firebase_Project SHALL have a web app registered that produces the complete client SDK configuration (apiKey, authDomain, projectId, storageBucket, messagingSenderId, and appId)
5. WHEN the production Target_Project is created, THE Firebase_Project SHALL have Firestore security rules and Storage security rules deployed matching the rules defined in the repository firestore.rules and storage.rules files

### Requirement 3: Migrate Firestore Data

**User Story:** As a Migration_Operator, I want to export all Firestore data from the Source_Project and import it into the Target_Project, so that all existing collections (users, students, sessions, classes, venues, recipes, instructors, gallery, bookings, booking_drafts, contact_messages) are preserved.

#### Acceptance Criteria

1. WHEN the Migration_Operator exports Firestore data, THE GCloud_CLI SHALL create a Firestore_Export containing all collections from the Source_Project into a GCS bucket that is accessible to both the Source_Project and the Target_Project
2. WHEN the Firestore_Export is complete, THE GCloud_CLI SHALL import the export into the Target_Project Firestore database in the europe-west2 region
3. WHEN the import is complete, THE Target_Project SHALL contain all documents from the following collections: users, students, sessions, classes, venues, recipes, instructors, gallery, bookings, booking_drafts, contact_messages, and the document count per collection in the Target_Project SHALL match the document count per collection in the Source_Project
4. IF the Firestore_Export or import fails due to insufficient permissions, THEN THE Migration_Operator SHALL verify that both projects have the Cloud Firestore API enabled, that the service account has the `roles/datastore.importExportAdmin` role, and that the GCS bucket grants `roles/storage.admin` to the service accounts of both projects
5. IF the Firestore import fails for a reason other than permissions, THEN THE Migration_Operator SHALL re-attempt the import from the existing GCS export without re-exporting, and verify that no partial data remains by confirming document counts match the Source_Project after the retry succeeds

### Requirement 4: Migrate Firebase Authentication Users

**User Story:** As a Migration_Operator, I want to export all Auth users from the Source_Project and import them into the Target_Project, so that existing users can sign in to the new project without re-registering.

#### Acceptance Criteria

1. WHEN the Migration_Operator exports auth users, THE Firebase_CLI SHALL export all user records (including UIDs, email addresses, password hashes, and hash algorithm configuration) from the Source_Project to a JSON or CSV file
2. WHEN the auth export is complete, THE Firebase_CLI SHALL import all user records into the Target_Project using the exported hash algorithm parameters (hash algorithm, signer key, salt separator, rounds) and preserving each user's UID, email address, password hash, emailVerified status, displayName, and provider data
3. WHEN users are imported, THE Target_Project SHALL allow existing users to sign in with their current email/password credentials without requiring a password reset
4. IF a user signed up via Google OAuth, THEN THE Target_Project SHALL preserve the Google provider link so that Google sign-in continues to work for that user
5. IF one or more user records fail to import, THEN THE Firebase_CLI SHALL report the count of failed records and identify each failed user by UID and email so the Migration_Operator can resolve the failures individually
6. WHEN the import completes, THE Migration_Operator SHALL verify that the total number of user records in the Target_Project matches the total number exported from the Source_Project

### Requirement 5: Migrate Firebase Storage Files

**User Story:** As a Migration_Operator, I want to copy all files from the Source_Project Storage bucket to the Target_Project Storage bucket, so that all uploaded images and files are available in the new project.

#### Acceptance Criteria

1. WHEN the Migration_Operator initiates the storage migration, THE GCloud_CLI SHALL copy all files from the Source_Project default Storage bucket to the Target_Project default Storage bucket preserving the directory structure and file metadata including content-type
2. WHEN the storage copy is complete, THE Target_Project Storage bucket SHALL contain all files that existed in the Source_Project Storage bucket with identical paths and matching file sizes
3. IF a file fails to copy, THEN THE GCloud_CLI SHALL output the failed file path and error reason to the terminal and continue copying remaining files
4. WHEN the storage copy is complete, THE Migration_Operator SHALL update all Firestore documents containing Storage URLs (gallery imageUrl fields and instructor photoUrl fields) to reference the Target_Project bucket name in place of the Source_Project bucket name

### Requirement 6: Deploy Security Rules and Indexes

**User Story:** As a Migration_Operator, I want to deploy Firestore rules, Firestore indexes, and Storage rules to the Target_Project, so that the new project has the same security configuration as the source.

#### Acceptance Criteria

1. WHEN the Migration_Operator deploys rules, THE Firebase_CLI SHALL deploy the firestore.rules file to the Target_Project using the command `firebase deploy --only firestore:rules` with the Target_Project set as the active project in .firebaserc
2. WHEN the Migration_Operator deploys indexes, THE Firebase_CLI SHALL deploy the firestore.indexes.json file to the Target_Project using the command `firebase deploy --only firestore:indexes`
3. WHEN the Migration_Operator deploys storage rules, THE Firebase_CLI SHALL deploy the storage.rules file to the Target_Project using the command `firebase deploy --only storage`
4. IF a deployment command exits with a non-zero status code, THEN THE Firebase_CLI SHALL display an error message indicating the failure reason and THE Migration_Operator SHALL re-run the failed deployment after resolving the issue
5. WHEN all three deployments complete with exit code 0, THE Target_Project SHALL enforce the Firestore security rules, composite indexes, and Storage security rules as defined in the repository's firestore.rules, firestore.indexes.json, and storage.rules files respectively

### Requirement 7: Update Local Environment Variables

**User Story:** As a Migration_Operator, I want to update .env.local with the new Firebase project configuration values, so that local development connects to the Target_Project.

#### Acceptance Criteria

1. WHEN the dev Target_Project configuration is available in the Firebase Console, THE Migration_Operator SHALL update the following variables in .env.local with non-empty values from the Target_Project: NEXT_PUBLIC_FIREBASE_API_KEY, NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN, NEXT_PUBLIC_FIREBASE_PROJECT_ID, NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET, NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID, NEXT_PUBLIC_FIREBASE_APP_ID
2. WHEN the Target_Project Service_Account JSON is downloaded from Firebase Console, THE Migration_Operator SHALL update FIREBASE_ADMIN_SERVICE_ACCOUNT in .env.local with the full service account JSON as a single-line string containing at minimum the fields: project_id, private_key, and client_email
3. WHEN the environment variables are updated and the application is started locally, THE application SHALL initialize without setting adminInitError and the console log SHALL display the Target_Project project_id confirming the Admin SDK connected to the correct project
4. IF any of the 6 NEXT_PUBLIC_FIREBASE_* variables are empty or FIREBASE_ADMIN_SERVICE_ACCOUNT is missing required fields (project_id, private_key, client_email), THEN THE application SHALL fail to connect to Firebase services and display an error indicating which configuration is invalid
5. WHEN the environment variables are updated, THE .env.local file SHALL contain no residual Source_Project configuration values in any NEXT_PUBLIC_FIREBASE_* or FIREBASE_ADMIN_SERVICE_ACCOUNT variable

### Requirement 8: Update Vercel Environment Variables

**User Story:** As a Migration_Operator, I want to update the Vercel project environment variables to point to the Target_Projects, so that deployed preview and production environments connect to the correct Firebase projects.

#### Acceptance Criteria

1. WHEN the dev Target_Project is verified, THE Migration_Operator SHALL update the Vercel Preview environment variables with the dev Target_Project values for all NEXT_PUBLIC_FIREBASE_* variables (apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId) and the FIREBASE_ADMIN_SERVICE_ACCOUNT containing the dev Target_Project service account JSON
2. WHEN the production Target_Project is verified, THE Migration_Operator SHALL update the Vercel Production environment variables with the production Target_Project values for all NEXT_PUBLIC_FIREBASE_* variables (apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId) and the FIREBASE_ADMIN_SERVICE_ACCOUNT containing the production Target_Project service account JSON
3. WHEN environment variables are updated in Vercel for a given environment (Preview or Production), THE Migration_Operator SHALL trigger a redeployment of that environment to apply the new configuration
4. WHEN the redeployment is complete, THE Migration_Operator SHALL verify the deployed application connects to the Target_Project by confirming that Firebase Authentication, Firestore reads, and Storage access operate against the Target_Project in the europe-west2 region
5. IF a redeployment fails or the deployed application does not connect to the Target_Project services after environment variable update, THEN THE Migration_Operator SHALL revert the Vercel environment variables to the previous Source_Project values and trigger a redeployment to restore the prior working state

### Requirement 9: Update Firebase CLI Configuration

**User Story:** As a Migration_Operator, I want to update .firebaserc to reference the new Target_Projects, so that Firebase CLI commands deploy to the correct projects.

#### Acceptance Criteria

1. WHEN both Target_Projects are created, THE Migration_Operator SHALL update the .firebaserc file so that the "projects" object maps the "default" alias to the production Target_Project ID and the "dev" alias to the dev Target_Project ID
2. WHEN .firebaserc is updated, THE Migration_Operator SHALL verify the active project by running `firebase use` and confirming the output displays the expected Target_Project ID for the selected alias
3. WHEN the Migration_Operator runs `firebase deploy` with the "default" alias active, THE Firebase_CLI SHALL deploy firestore.rules, firestore.indexes.json, and storage.rules to the production Target_Project as configured in firebase.json
4. IF `firebase use` reports an error or displays a project ID that does not match the expected Target_Project ID, THEN THE Migration_Operator SHALL correct the alias mapping in .firebaserc before proceeding with any deployment

### Requirement 10: Configure OAuth and Authorized Domains

**User Story:** As a Migration_Operator, I want to configure Google OAuth credentials and authorized domains for the Target_Projects, so that Google sign-in works correctly on all deployment URLs.

#### Acceptance Criteria

1. WHEN the Target_Project is created, THE Migration_Operator SHALL add the following domains to the Firebase Authentication authorized domains list: localhost, the production domain, the Vercel preview URL wildcard pattern ({project-name}-*.vercel.app), and {project-id}.firebaseapp.com
2. WHEN Google sign-in is configured, THE Target_Project SHALL have an OAuth consent screen configured in Google Cloud Console that includes the application name, a support email address, and the email scope (email, profile, openid)
3. WHEN the OAuth consent screen is configured, THE OAuth_Consent_Screen SHALL include the production domain and the Vercel preview domain pattern ({project-name}-*.vercel.app) as authorized JavaScript origins and authorized redirect URIs
4. IF the Vercel deployment uses a custom domain, THEN THE authorized domains list in both Firebase Authentication and the OAuth consent screen SHALL include that custom domain
5. WHEN OAuth configuration is complete, THE application SHALL allow users to sign in with Google via signInWithPopup on localhost, Vercel preview deployments, and the production domain without receiving an auth/unauthorized-domain error
6. THE Firebase client configuration SHALL set the authDomain value to {project-id}.firebaseapp.com to ensure the OAuth popup flow resolves to the correct Firebase project
7. IF a user attempts Google sign-in from a domain not present in the Firebase Authentication authorized domains list, THEN THE application SHALL display an error message indicating that sign-in is unavailable on that domain

### Requirement 11: Verify Dev Migration Before Production

**User Story:** As a Migration_Operator, I want to verify that the dev Target_Project works correctly with the application before migrating production, so that any issues are caught without affecting live users.

#### Acceptance Criteria

1. WHEN the dev migration is complete, THE Migration_Operator SHALL verify Firestore connectivity by loading a public page that reads session data from the Target_Project and confirming that session documents are displayed, and by performing an Admin SDK write operation that creates a document in the Target_Project Firestore and confirming the document is persisted
2. WHEN the dev migration is complete, THE Migration_Operator SHALL verify authentication by signing in with an email/password test account and with Google OAuth, confirming that each method completes successfully and the authenticated user's btUser profile is loaded from the Target_Project Firestore users collection
3. WHEN the dev migration is complete, THE Migration_Operator SHALL verify Firebase Storage by uploading a test file through the admin gallery interface and confirming a valid download URL is returned, and by loading the gallery page and confirming that images are retrieved and rendered from the Target_Project Storage bucket
4. WHEN the dev migration is complete, THE Migration_Operator SHALL verify the Stripe webhook by completing a test payment through the booking wizard and confirming that a booking document with status "confirmed" appears in the Target_Project Firestore bookings collection and the corresponding session spotsAvailable is decremented by 1 within 60 seconds of payment completion
5. WHEN the dev migration is complete, THE Migration_Operator SHALL verify the contact form by submitting a test message and confirming that a contact_messages document is created in the Target_Project Firestore and the admin notification email is sent via Resend
6. WHEN the dev migration is complete, THE Migration_Operator SHALL verify admin CRUD operations by creating, reading, updating, and deleting a test record in at least one admin panel section (venues, classes, or sessions) and confirming each operation is reflected in the Target_Project Firestore
7. IF any single verification check in criteria 1 through 6 fails, THEN THE Migration_Operator SHALL record the failing check and its observed behavior, and SHALL NOT proceed with the production migration until all checks pass
8. WHEN all verification checks in criteria 1 through 6 pass, THE Migration_Operator SHALL proceed with the production migration

### Requirement 12: Update Stripe Webhook Endpoint

**User Story:** As a Migration_Operator, I want to ensure the Stripe webhook continues to function after migration, so that payment processing and booking creation are uninterrupted.

#### Acceptance Criteria

1. WHEN the Target_Project is deployed, THE application API routes SHALL initialize the Firebase Admin SDK using the Target_Project's FIREBASE_ADMIN_SERVICE_ACCOUNT environment variable, and the adminInitError export SHALL be null
2. IF the Stripe webhook URL changes due to redeployment, THEN THE Migration_Operator SHALL update the webhook endpoint in the Stripe Dashboard and confirm that a test event sent from Stripe returns an HTTP 200 response
3. WHEN a payment_intent.succeeded event is received after migration, THE webhook handler SHALL verify the Stripe signature using STRIPE_WEBHOOK_SECRET, read the corresponding booking_draft from the Target_Project Firestore, and create the booking document in the Target_Project Firestore within a transaction that decrements session capacity
4. IF the Firebase Admin SDK fails to initialize after migration (adminInitError is non-null), THEN THE webhook handler SHALL return an HTTP 500 response with an error message indicating the Admin SDK configuration is invalid
5. WHEN the webhook handler creates a booking document after migration, THE booking document SHALL contain the same fields and structure (sessionId, payment, status, studentId, bookedByUid, createdAt) as bookings created prior to migration

### Requirement 13: Decommission Source Projects

**User Story:** As a Migration_Operator, I want a plan to decommission the old Source_Projects after the migration is fully verified, so that there is no confusion about which projects are active.

#### Acceptance Criteria

1. WHILE the Target_Project has not yet passed verification, THE Source_Project SHALL remain active with all read and write permissions intact so that the Migration_Operator can roll back by re-pointing environment variables to the Source_Project within 1 hour
2. WHEN the Target_Project has passed verification and has operated without critical errors for a minimum observation period of 14 calendar days, THE Migration_Operator SHALL disable new writes to the Source_Project Firestore by removing all write permissions from its security rules while retaining read-only access for audit purposes
3. WHEN write permissions have been removed from the Source_Project, THE Migration_Operator SHALL revoke all Service_Account keys associated with the Source_Project and remove all Source_Project references from the .env.local file and Vercel environment variables
4. WHEN a critical error is detected in the Target_Project during the 14-day observation period, THE Migration_Operator SHALL restore Source_Project write permissions and re-point application environment variables to the Source_Project to resume service
5. IF the 14-day observation period completes and the Migration_Operator has confirmed that no rollback was required, THEN THE Migration_Operator SHALL disable all API access on the Source_Project and archive the project for a retention period of 90 days before permanent deletion
