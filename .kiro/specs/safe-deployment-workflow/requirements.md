# Requirements Document

## Introduction

The Safe Deployment Workflow establishes a structured development and deployment pipeline for the Blooming Tastebuds MVP project (`bt-mvp`). Currently, the `main` branch auto-deploys directly to production via Vercel, and a single Firebase project serves both development and live traffic. This creates risk: any accidental push or untested code change can immediately affect paying customers.

This spec defines the branch strategy, GitHub branch protection, Vercel preview deployment usage, and Firebase environment isolation — all designed to ensure new features can be developed and tested without touching the live production site at `bloomingtastebuds.com`.

The implementation is incremental:
1. **Phase 1 (Minimum Viable):** Branch protection + preview deployments
2. **Phase 2:** Firebase dev environment isolation + Stripe test mode

All setup steps are reversible, and no production environment variables, Firebase config, or Vercel production settings are modified during implementation.

---

## Glossary

- **Production_Environment**: The live deployment at `bloomingtastebuds.com` served by Vercel from the `main` branch, connected to the production Firebase project.
- **Preview_Deployment**: A unique Vercel deployment URL automatically generated for every non-`main` branch push, accessible only via its URL and not mapped to the production domain.
- **Production_Firebase**: The existing Firebase project used by the live site, containing real user data, bookings, and payment records.
- **Dev_Firebase**: A second Firebase project (`bt-mvp-dev`) used exclusively by preview deployments and local development, containing only test data.
- **Branch_Protection_Ruleset**: A GitHub repository ruleset that enforces pull request requirements on the `main` branch.
- **Feature_Branch**: A short-lived Git branch following the naming convention `feature/*` where new development occurs.
- **Promotion_Flow**: The defined path code follows from creation to production: `feature/*` → `main` → production.
- **Environment_Scope**: Vercel's mechanism for associating environment variables with specific deployment contexts (Production, Preview, or Development).
- **Vercel_Dashboard**: The web interface at `vercel.com` where project settings, environment variables, and deployment configurations are managed.
- **GitHub_Ruleset**: GitHub's newer branch protection mechanism (replacing legacy branch protection rules) that applies rules to branches matching specified patterns.
- **Pull_Request**: A GitHub mechanism for proposing changes from one branch to another, enabling code review before merging.
- **Developer**: The solo developer and project owner who implements features and manages the repository.

---

## Requirements

### Requirement 1: Branch Naming Strategy

**User Story:** As a developer, I want a clear branch naming convention and promotion flow, so that I always know which branch maps to which environment and how code progresses to production.

#### Acceptance Criteria

1. THE Developer SHALL maintain `main` as the production branch that auto-deploys to `bloomingtastebuds.com` via Vercel.
2. THE Developer SHALL create all new feature work on branches following the naming convention `feature/<short-description>` (e.g., `feature/session-bundles`, `feature/admin-analytics`).
3. WHEN a feature branch is pushed to the remote repository, THE Vercel_Dashboard SHALL generate a unique Preview_Deployment URL for that branch.
4. THE Promotion_Flow SHALL follow: `feature/*` → `main` → Production_Environment.
5. THE Developer SHALL NOT create branches with naming patterns that conflict with Vercel's reserved prefixes or GitHub's protected patterns.

---

### Requirement 2: GitHub Branch Protection

**User Story:** As a developer, I want the `main` branch to be protected from accidental direct pushes, so that all changes go through a reviewed pull request before reaching production.

#### Acceptance Criteria

1. THE Developer SHALL create a GitHub_Ruleset targeting the `main` branch in the `bt-mvp` repository settings.
2. WHEN the Branch_Protection_Ruleset is active, THE GitHub_Ruleset SHALL require a Pull_Request before any code can be merged into `main`.
3. WHEN the Branch_Protection_Ruleset is active, THE GitHub_Ruleset SHALL require at least 1 approval on the Pull_Request before merging is permitted.
4. IF the Developer is the sole contributor to the repository, THEN THE GitHub_Ruleset SHALL permit self-approval of Pull_Requests (the PR author can approve their own PR).
5. WHEN a developer attempts to push directly to `main` (via `git push origin main`) or force-push to `main` (via `git push --force origin main`), THE GitHub_Ruleset SHALL reject the push with an error message indicating that a Pull_Request is required.
6. THE GitHub_Ruleset SHALL include the repository administrator in the "bypass list" so that ruleset rules can be overridden when bypass is explicitly selected during a push or merge.
7. WHEN the Branch_Protection_Ruleset is active, THE GitHub_Ruleset SHALL prevent deletion of the `main` branch.
8. THE Branch_Protection_Ruleset SHALL be reversible by deleting the ruleset from the repository settings without affecting existing code or deployment history.

---

### Requirement 3: Vercel Preview Deployments

**User Story:** As a developer, I want every feature branch to automatically receive a testable preview URL, so that I can verify changes in a production-like environment before merging.

#### Acceptance Criteria

1. WHEN a commit is pushed to any non-`main` branch, THE Vercel_Dashboard SHALL automatically create a Preview_Deployment with a unique URL in the format `<project>-<hash>-<scope>.vercel.app`.
2. THE Preview_Deployment SHALL use environment variables scoped to the "Preview" environment in the Vercel_Dashboard, not the "Production" scoped values.
3. WHEN a Preview_Deployment completes successfully, THE Vercel_Dashboard SHALL display the deployment URL in the GitHub Pull_Request as a deployment status check with a "success" state.
4. IF a Preview_Deployment build fails, THEN THE Vercel_Dashboard SHALL display a "failure" status check in the GitHub Pull_Request and the build error details SHALL be viewable in the Vercel_Dashboard deployment logs.
5. THE Developer SHALL verify that Preview_Deployments are functioning by confirming that the deployment status shows "Ready" in the Vercel_Dashboard deployments list and that the preview URL returns an HTTP 200 response on the root path after pushing a test branch.
6. THE Preview_Deployment SHALL be accessible via its unique URL without requiring Vercel account authentication (Deployment Protection disabled or set to allow public access), shareable with stakeholders for review, and SHALL NOT be reachable via the `bloomingtastebuds.com` domain or any subdomain of it.
7. WHEN a feature branch is deleted after merging, THE Vercel_Dashboard SHALL retain the Preview_Deployment history indefinitely (until manually deleted) but the deployment URL SHALL no longer receive updates from new commits.
8. THE Production_Environment at `bloomingtastebuds.com` SHALL NOT experience downtime, configuration changes, or content changes as a result of any Preview_Deployment build or configuration.

---

### Requirement 4: Firebase Dev Project Setup

**User Story:** As a developer, I want a separate Firebase project for preview deployments and local development, so that test data and development activity never mix with real production data.

#### Acceptance Criteria

1. THE Developer SHALL create a new Firebase project named `bt-mvp-dev` in the Firebase Console, hosted on a separate Google Cloud project from the production Firebase project.
2. WHEN the Dev_Firebase project is created, THE Developer SHALL enable Firebase Authentication with the same providers configured in Production_Firebase (email/password and Google OAuth).
3. WHEN the Dev_Firebase project is created, THE Developer SHALL configure Firestore security rules that cover the same collection paths as Production_Firebase (users, students, sessions, classes, venues, recipes, instructors, gallery, bookings, booking_drafts, contact_messages) with no production data copied.
4. WHEN the Dev_Firebase project is created, THE Developer SHALL deploy the `storage.rules` file from the repository to the Dev_Firebase project so that Storage security rules are identical to Production_Firebase.
5. THE Developer SHALL generate a service account JSON key for `bt-mvp-dev` containing the required fields (`project_id`, `private_key`, `client_email`) to be used as the `FIREBASE_ADMIN_SERVICE_ACCOUNT` value in preview deployments.
6. THE Dev_Firebase project SHALL contain only test data created during development and testing; Production_Firebase data SHALL NOT be copied or migrated to it.
7. THE Developer SHALL add a `dev` alias in the `.firebaserc` file pointing to the `bt-mvp-dev` project and deploy the same `firestore.rules` and `storage.rules` files using `firebase deploy --only firestore:rules,storage --project bt-mvp-dev` to maintain security rule parity.
8. IF the Dev_Firebase project needs to be decommissioned, THE Developer SHALL be able to delete it from the Firebase Console and remove the dev alias from `.firebaserc` without affecting Production_Firebase or the production deployment.
9. THE Developer SHALL NOT commit the Dev_Firebase service account JSON key file to version control; the key SHALL be stored only in the Vercel_Dashboard environment variables (Preview scope) and in the local `.env.local` file which is gitignored.

---

### Requirement 5: Vercel Environment Variable Scoping

**User Story:** As a developer, I want Vercel to automatically use the correct Firebase credentials based on the deployment type, so that preview deployments connect to Dev_Firebase and production deployments connect to Production_Firebase without manual switching.

#### Acceptance Criteria

1. THE Developer SHALL configure `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`, `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`, and `NEXT_PUBLIC_FIREBASE_APP_ID` with Production_Firebase values scoped to the "Production" environment in the Vercel_Dashboard.
2. THE Developer SHALL configure the same `NEXT_PUBLIC_FIREBASE_*` variables with Dev_Firebase values scoped to the "Preview" environment in the Vercel_Dashboard.
3. THE Developer SHALL configure `FIREBASE_ADMIN_SERVICE_ACCOUNT` with the Production_Firebase service account JSON scoped to "Production" in the Vercel_Dashboard.
4. THE Developer SHALL configure `FIREBASE_ADMIN_SERVICE_ACCOUNT` with the Dev_Firebase service account JSON scoped to "Preview" in the Vercel_Dashboard.
5. THE Developer SHALL configure the local `.env.local` file to use Dev_Firebase values for all `NEXT_PUBLIC_FIREBASE_*` variables and the `FIREBASE_ADMIN_SERVICE_ACCOUNT`, so that local development uses the dev environment.
6. THE Developer SHALL configure `NEXT_PUBLIC_APP_URL` scoped to "Production" as `https://bloomingtastebuds.com` and scoped to "Preview" as the Vercel preview URL (or `http://localhost:3000` for local development).
7. WHEN a Preview_Deployment builds, THE Vercel_Dashboard SHALL inject the Preview-scoped environment variables, causing the deployment to connect to Dev_Firebase.
8. WHEN the Production_Environment builds, THE Vercel_Dashboard SHALL inject the Production-scoped environment variables, causing the deployment to connect to Production_Firebase.
9. THE Developer SHALL NOT modify any existing Production-scoped environment variables in the Vercel_Dashboard during this setup; all new Preview-scoped variables SHALL be additions.
10. THE Developer SHALL configure `STRIPE_SECRET_KEY` and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` with Stripe test-mode keys scoped to "Preview" so that preview deployments use the Stripe test environment.
11. THE Developer SHALL configure `STRIPE_WEBHOOK_SECRET` scoped to "Preview" with a webhook secret corresponding to a Stripe test-mode webhook endpoint pointed at the preview deployment URL, or omit it if webhook testing is deferred.

---

### Requirement 6: Day-to-Day Developer Workflow

**User Story:** As a developer, I want a clear step-by-step workflow for developing, testing, and deploying new features, so that I can confidently ship changes without risking the live site.

#### Acceptance Criteria

1. WHEN starting new feature work, THE Developer SHALL create a new branch from `main` using `git checkout -b feature/<short-description>`.
2. WHEN the feature branch has local commits ready for testing, THE Developer SHALL push to the remote with `git push -u origin feature/<short-description>` to trigger a Preview_Deployment.
3. WHEN the Preview_Deployment build succeeds and the unique Vercel preview URL returns an HTTP 200 response, THE Developer SHALL test the feature using that URL, verifying it connects to Dev_Firebase by confirming the browser-loaded `NEXT_PUBLIC_FIREBASE_PROJECT_ID` matches the Dev_Firebase project ID (not the Production_Firebase project ID).
4. WHEN testing is complete on the preview URL, THE Developer SHALL open a Pull_Request from the feature branch to `main` on GitHub.
5. WHEN the Pull_Request is approved (self-approval permitted for solo project), THE Developer SHALL merge the Pull_Request using the GitHub web interface or CLI.
6. WHEN the Pull_Request is merged to `main`, THE Vercel_Dashboard SHALL automatically deploy the updated `main` branch to the Production_Environment at `bloomingtastebuds.com`.
7. WHEN the production deployment completes, THE Developer SHALL perform a smoke test on `bloomingtastebuds.com` that verifies: the homepage loads with HTTP 200, the new feature's primary UI element or page is visible, and at least one authenticated action (login or page navigation in the portal) completes without error.
8. WHEN the feature is confirmed working in production (all smoke test checks pass), THE Developer SHALL delete the feature branch both locally (`git branch -d feature/<short-description>`) and remotely (`git push origin --delete feature/<short-description>`).
9. IF the Preview_Deployment build fails after pushing the feature branch, THEN THE Developer SHALL check the build logs in the Vercel_Dashboard, fix the failing code on the feature branch, and push again to trigger a new Preview_Deployment before proceeding with the Pull_Request.
10. IF the production deployment fails or the smoke test reveals a defect after merging to `main`, THEN THE Developer SHALL revert the merge commit on `main` via a new Pull_Request and redeploy, restoring the previous working state within 30 minutes of defect detection.

---

### Requirement 7: Production Safety Guarantees

**User Story:** As a project owner, I want guarantees that the production site is never affected during feature development or environment setup, so that paying customers always have a working experience.

#### Acceptance Criteria

1. THE Production_Environment at `bloomingtastebuds.com` SHALL continue to serve traffic from the `main` branch with zero downtime (no HTTP 5xx errors attributable to setup changes, no DNS resolution changes, no deployment interruptions) during all setup and configuration steps defined in this spec.
2. THE Production_Firebase project SHALL NOT have any data modified, collections altered, security rules changed, or service accounts regenerated as part of implementing this workflow.
3. THE Production-scoped environment variables in the Vercel_Dashboard SHALL NOT be modified, deleted, or overwritten during the implementation of this workflow.
4. WHEN Preview_Deployments connect to Dev_Firebase, THE Preview_Deployment SHALL NOT be able to read from or write to Production_Firebase collections, verified by confirming that the `NEXT_PUBLIC_FIREBASE_PROJECT_ID` environment variable injected into the Preview_Deployment matches the Dev_Firebase project ID and not the Production_Firebase project ID.
5. WHEN a developer works on a feature branch, THE `main` branch SHALL remain unchanged until a Pull_Request is explicitly approved and merged.
6. IF any setup step fails or needs to be reverted, THE Developer SHALL be able to remove the configuration (ruleset, environment variables, Firebase project) without requiring a redeployment of the Production_Environment and without modifying any Production-scoped settings in Vercel, GitHub, or Firebase.
7. THE `bloomingtastebuds.com` domain mapping in GoDaddy SHALL NOT be modified during implementation of this workflow.
8. WHEN Phase 2 (Firebase Dev Project Setup) is complete, THE Developer SHALL verify isolation by performing a test write from a Preview_Deployment and confirming the written document appears in Dev_Firebase Firestore and does not appear in Production_Firebase Firestore.

---

### Requirement 8: Stripe Test Mode Isolation

**User Story:** As a developer, I want preview deployments to use Stripe test mode, so that no real payments are processed during development and testing.

#### Acceptance Criteria

1. THE Developer SHALL configure `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` with a Stripe test-mode publishable key (prefixed with `pk_test_`) scoped to "Preview" in the Vercel_Dashboard.
2. THE Developer SHALL configure `STRIPE_SECRET_KEY` with a Stripe test-mode secret key (prefixed with `sk_test_` or `rk_test_`) scoped to "Preview" in the Vercel_Dashboard.
3. WHEN a Preview_Deployment processes a payment, THE Preview_Deployment SHALL use the Stripe test-mode API, verifiable by confirming the payment appears in the Stripe Dashboard under "Test mode" and that Stripe test card numbers (e.g., `4242 4242 4242 4242`) are accepted.
4. THE Developer SHALL configure `.env.local` to use Stripe test-mode keys (`pk_test_` prefixed publishable key, `sk_test_` or `rk_test_` prefixed secret key) so that local development also uses the test environment.
5. THE Production-scoped Stripe keys in the Vercel_Dashboard SHALL NOT be modified during this setup.
6. WHERE webhook testing is needed on preview deployments, THE Developer SHALL create a separate Stripe webhook endpoint in test mode pointed at a specific Preview_Deployment URL (appended with `/api/webhooks/stripe`), with its own `STRIPE_WEBHOOK_SECRET` scoped to "Preview" in the Vercel_Dashboard.
7. IF a Preview_Deployment or local development environment is configured with a Stripe key that does not contain the `_test_` prefix segment, THEN THE Developer SHALL treat this as a misconfiguration and replace the key with a valid test-mode key before processing any payments.

---

### Requirement 9: Incremental Implementation Order

**User Story:** As a developer, I want to implement this workflow incrementally, so that I get immediate value from branch protection and previews without needing to complete all setup at once.

#### Acceptance Criteria

1. THE Developer SHALL implement Phase 1 first: GitHub Branch_Protection_Ruleset creation, followed by verification that Vercel Preview_Deployments generate accessible preview URLs for non-`main` branches by pushing a test branch and confirming a deployment URL appears in the Vercel_Dashboard deployments list.
2. WHEN Phase 1 is complete, THE Developer SHALL have a working minimum viable workflow where feature branches get preview URLs and `main` requires a Pull_Request.
3. THE Developer SHALL implement Phase 2 second: Dev_Firebase project creation, environment variable scoping in the Vercel_Dashboard, Stripe test-mode key configuration, and `.env.local` update.
4. WHEN Phase 2 is complete, THE Developer SHALL verify data isolation by confirming that a Preview_Deployment reads from and writes to Dev_Firebase (not Production_Firebase) by creating a test record in the preview deployment and confirming it appears only in the Dev_Firebase Firestore console.
5. EACH phase SHALL be independently functional: after Phase 1, preview URLs and branch protection operate without Firebase isolation (previews use production Firebase until Phase 2 is applied); after Phase 2, full data and payment isolation is active.
6. IF a phase's verification step fails, THEN THE Developer SHALL resolve the failure before proceeding to the next phase, and SHALL be able to revert that phase's configuration changes without affecting prior completed phases or the Production_Environment.
