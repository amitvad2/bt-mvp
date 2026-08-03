# Implementation Plan: Safe Deployment Workflow

## Overview

This plan implements a two-phase safe deployment pipeline for the Blooming Tastebuds MVP. Phase 1 establishes branch protection and verifies Vercel preview deployments. Phase 2 creates a Firebase dev project, scopes environment variables, and isolates Stripe to test mode for preview/local environments. All tasks involve external service configuration and local file edits — no application source code changes.

## Tasks

- [x] 1. Phase 1 — GitHub Branch Protection + Vercel Preview Verification
  - [x] 1.1 Create GitHub Ruleset `protect-main` for the `bt-mvp` repository
    - Navigate to GitHub → Repository Settings → Rules → New ruleset
    - Ruleset name: `protect-main`
    - Target: Branch name pattern `main`
    - Enforcement: Active
    - Bypass list: Repository administrator
    - Enable rules: Require pull request before merging, Required approvals: 1, Allow self-approval: Yes, Block force pushes, Block branch deletion
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

  - [x] 1.2 Verify branch protection is enforced
    - Attempt `git push origin main` directly — confirm push is rejected with an error
    - Attempt `git push --force origin main` — confirm push is rejected
    - Confirm `main` branch cannot be deleted from GitHub UI
    - _Requirements: 2.5, 2.7, 7.5_

  - [x] 1.3 Verify Vercel preview deployments trigger for feature branches
    - Create a test branch: `git checkout -b feature/test-preview`
    - Make a trivial change (e.g., add a comment to `README.md`)
    - Push: `git push -u origin feature/test-preview`
    - Confirm a Preview deployment appears in the Vercel Dashboard with status "Ready"
    - Visit the generated preview URL — confirm HTTP 200 on root path
    - Verify the deployment status check appears on the GitHub PR (if PR is opened)
    - _Requirements: 1.2, 1.3, 3.1, 3.5, 3.6_

  - [x] 1.4 Verify production is unaffected
    - Visit `bloomingtastebuds.com` — confirm HTTP 200, site functions normally
    - Confirm no new deployments were triggered on the Production environment in Vercel Dashboard
    - _Requirements: 3.8, 7.1_

  - [x] 1.5 Verify self-approval and PR merge workflow
    - Open a Pull Request from `feature/test-preview` → `main`
    - Self-approve the PR
    - Confirm PR shows "Approved" status and merge is permitted
    - Merge the PR and confirm production deployment triggers
    - Delete the test branch locally and remotely
    - _Requirements: 2.4, 6.4, 6.5, 6.6_

- [x] 2. Checkpoint — Phase 1 complete
  - Ensure all Phase 1 verification checks pass, ask the user if questions arise.

- [ ] 3. Phase 2 — Firebase Dev Project Setup
  - [x] 3.1 Create Firebase project `bt-mvp-dev` in Firebase Console
    - Go to Firebase Console → Add project → Name: `bt-mvp-dev`
    - Ensure it is on a separate Google Cloud project from `bt-mvp-d057f`
    - Enable Firebase Authentication with email/password and Google OAuth providers
    - Create Firestore database (start in test mode initially)
    - Enable Firebase Storage
    - _Requirements: 4.1, 4.2, 4.6_

  - [x] 3.2 Deploy security rules to `bt-mvp-dev`
    - Run `firebase deploy --only firestore:rules --project bt-mvp-dev` to deploy `firestore.rules`
    - Run `firebase deploy --only storage --project bt-mvp-dev` to deploy `storage.rules`
    - Confirm both deployments succeed without errors
    - _Requirements: 4.3, 4.4, 4.7_

  - [x] 3.3 Generate service account key for `bt-mvp-dev`
    - In Firebase Console → Project Settings → Service accounts → Generate new private key
    - Confirm the JSON contains `project_id`, `private_key`, and `client_email`
    - Store the key securely — do NOT commit to version control
    - _Requirements: 4.5, 4.9_

  - [x] 3.4 Update `.firebaserc` to add the `dev` alias
    - Add `"dev": "bt-mvp-dev"` to the `projects` object in `.firebaserc`
    - Final structure: `{ "projects": { "default": "bt-mvp-d057f", "dev": "bt-mvp-dev" } }`
    - _Requirements: 4.7_

- [ ] 4. Phase 2 — Vercel Environment Variable Scoping
  - [x] 4.1 Add Preview-scoped Firebase environment variables in Vercel Dashboard
    - Navigate to Vercel Dashboard → Project Settings → Environment Variables
    - Add `NEXT_PUBLIC_FIREBASE_API_KEY` with Dev Firebase value, scoped to "Preview"
    - Add `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` as `bt-mvp-dev.firebaseapp.com`, scoped to "Preview"
    - Add `NEXT_PUBLIC_FIREBASE_PROJECT_ID` as `bt-mvp-dev`, scoped to "Preview"
    - Add `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` as `bt-mvp-dev.appspot.com`, scoped to "Preview"
    - Add `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` with Dev value, scoped to "Preview"
    - Add `NEXT_PUBLIC_FIREBASE_APP_ID` with Dev value, scoped to "Preview"
    - _Requirements: 5.1, 5.2, 5.9_

  - [x] 4.2 Add Preview-scoped Firebase Admin service account in Vercel Dashboard
    - Add `FIREBASE_ADMIN_SERVICE_ACCOUNT` with the `bt-mvp-dev` service account JSON (single-line), scoped to "Preview"
    - Do NOT modify the existing Production-scoped value
    - _Requirements: 5.3, 5.4, 5.9_

  - [x] 4.3 Add Preview-scoped app URL in Vercel Dashboard
    - Add `NEXT_PUBLIC_APP_URL` scoped to "Preview" — set to the Vercel system variable `VERCEL_URL` prefixed with `https://` or leave as a known preview URL pattern
    - Confirm Production-scoped `NEXT_PUBLIC_APP_URL` remains `https://bloomingtastebuds.com`
    - _Requirements: 5.6, 5.9_

- [ ] 5. Phase 2 — Stripe Test Mode Configuration
  - [x] 5.1 Configure Stripe test-mode keys in Vercel Dashboard (Preview scope)
    - In Stripe Dashboard → Developers → API keys → Toggle "Test mode"
    - Copy `pk_test_*` publishable key and `sk_test_*` (or `rk_test_*`) secret key
    - Add `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` with the `pk_test_` key, scoped to "Preview" in Vercel
    - Add `STRIPE_SECRET_KEY` with the `sk_test_` key, scoped to "Preview" in Vercel
    - Do NOT modify existing Production-scoped Stripe keys
    - _Requirements: 8.1, 8.2, 8.5, 5.10_

  - [x] 5.2 Configure Stripe test webhook (optional, for Preview deployments)
    - In Stripe Dashboard (Test mode) → Developers → Webhooks → Add endpoint
    - Point at a Preview deployment URL + `/api/webhooks/stripe`
    - Copy the `whsec_*` signing secret
    - Add `STRIPE_WEBHOOK_SECRET` with the test webhook secret, scoped to "Preview" in Vercel
    - If webhook testing is deferred, this step can be skipped per Requirement 5.11
    - _Requirements: 5.11, 8.6_

- [ ] 6. Phase 2 — Local Environment Configuration
  - [x] 6.1 Update `.env.local` to use Dev Firebase and Stripe test keys
    - Replace all `NEXT_PUBLIC_FIREBASE_*` values with Dev Firebase project values
    - Replace `FIREBASE_ADMIN_SERVICE_ACCOUNT` with the `bt-mvp-dev` service account JSON
    - Replace `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` with `pk_test_` key
    - Replace `STRIPE_SECRET_KEY` with `sk_test_` key
    - Set `NEXT_PUBLIC_APP_URL` to `http://localhost:3000`
    - _Requirements: 5.5, 8.4_

  - [x] 6.2 Update `.env.local.example` with comments noting Production vs Dev values
    - Add inline comments to each variable indicating whether the value shown is for Production or Dev
    - Document that `.env.local` should use Dev/test values for local development
    - _Requirements: 5.5_

- [x] 7. Checkpoint — Phase 2 verification
  - Ensure all Phase 2 verification checks pass, ask the user if questions arise.

- [ ] 8. Phase 2 — Verification and Data Isolation Checks
  - [x] 8.1 Verify Preview deployment uses Dev Firebase
    - Push a feature branch to trigger a new Preview deployment (after env vars are configured)
    - Visit the preview URL and inspect `NEXT_PUBLIC_FIREBASE_PROJECT_ID` in the browser (via view-source or DevTools Network tab)
    - Confirm the value is `bt-mvp-dev`, NOT `bt-mvp-d057f`
    - _Requirements: 5.7, 7.4_

  - [x] 8.2 Verify data isolation between Dev and Production Firebase
    - On the Preview deployment, perform a test write (e.g., submit the contact form or create a test record)
    - Confirm the record appears in the `bt-mvp-dev` Firestore Console
    - Confirm the record does NOT appear in the `bt-mvp-d057f` (Production) Firestore Console
    - _Requirements: 4.6, 7.4, 7.8, 9.4_

  - [x] 8.3 Verify Stripe test mode on Preview deployment
    - On the Preview deployment, attempt a payment using Stripe test card `4242 4242 4242 4242`
    - Confirm the payment appears in the Stripe Dashboard under "Test mode"
    - Confirm no test transaction appears in live mode
    - _Requirements: 8.3, 8.5_

  - [x] 8.4 Verify local development uses Dev Firebase
    - Run `npm run dev` locally
    - Confirm the app connects to `bt-mvp-dev` (check network requests or console output)
    - Confirm `.env.local` is gitignored (service account key not exposed)
    - _Requirements: 5.5, 4.9_

  - [x] 8.5 Verify production remains unaffected
    - Visit `bloomingtastebuds.com` — confirm HTTP 200, no visual changes, existing functionality works
    - Confirm Production-scoped env vars in Vercel Dashboard are unchanged
    - Confirm Production Firebase project has no test records
    - _Requirements: 7.1, 7.2, 7.3_

- [ ] 9. Final checkpoint — Full workflow smoke test
  - Run the complete day-to-day workflow end-to-end: create feature branch → push → verify preview → open PR → self-approve → merge → confirm production deploy → smoke test production → delete branch. Ensure all tests pass, ask the user if questions arise.

## Notes

- This is an infrastructure/DevOps spec — all tasks involve external service configuration (GitHub, Vercel, Firebase Console, Stripe Dashboard) and local file edits
- No application source code (`src/`) is modified
- No automated test suites (Vitest/Jest) are needed — verification uses smoke tests and manual checklists
- Property-based testing is not applicable (no algorithmic logic to test)
- Each phase is independently functional: Phase 1 provides immediate value; Phase 2 adds full isolation
- All configuration changes are reversible without affecting production
- The service account key for `bt-mvp-dev` must NEVER be committed to version control

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3"] },
    { "id": 2, "tasks": ["1.4", "1.5"] },
    { "id": 3, "tasks": ["3.1"] },
    { "id": 4, "tasks": ["3.2", "3.3"] },
    { "id": 5, "tasks": ["3.4", "4.1", "4.2", "4.3"] },
    { "id": 6, "tasks": ["5.1", "5.2"] },
    { "id": 7, "tasks": ["6.1", "6.2"] },
    { "id": 8, "tasks": ["8.1", "8.4"] },
    { "id": 9, "tasks": ["8.2", "8.3", "8.5"] }
  ]
}
```
