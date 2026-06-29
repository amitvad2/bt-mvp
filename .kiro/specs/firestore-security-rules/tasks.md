# Implementation Plan: Firestore Security Rules — Emulator Test Suite

## Overview

The Firestore security rules (`firestore.rules`) already exist and enforce the access control described in `requirements.md`. This task list focuses exclusively on **adding an emulator-based integration test suite** that verifies every correctness property defined in `design.md`. Tests use `@firebase/rules-unit-testing` against the Firebase Local Emulator and run via Vitest.

No changes to `firestore.rules` itself are required unless a test exposes a gap.

---

## Task Dependency Graph

```
Task 1 (Install + configure)
    │
    ▼
Task 2 (Test helpers)
    │
    ├──▶ Task 3 (booking_drafts — Property 1)
    ├──▶ Task 4 (public collections — Properties 2 & 3)
    ├──▶ Task 5 (contact_messages — Property 12)
    │
    ▼
Task 6 (users create — Properties 4)
    │
    ▼
Task 7 (users read/update/delete — Properties 5, 6, 11)
    │
    ▼
Task 8 (students — Properties 9, 10)
    │
    ▼
Task 9 (bookings — Properties 7, 8)
    │
    ▼
Task 10 (Checkpoint + CI script)
```

---

## Tasks

- [ ] 1. Install test dependencies and configure emulator test environment
  - Install `@firebase/rules-unit-testing` as a dev dependency: `npm install --save-dev @firebase/rules-unit-testing`
  - Verify `firebase.json` has a `firestore.rules` path pointing to `firestore.rules` at project root
  - Add a `firestore` emulator entry to `firebase.json` `emulators` block with `port: 8080` if not already present
  - Create the test directory `src/__tests__/firestore-rules/`
  - _Requirements: 1.1 — 16.6 (all rules must be testable)_

- [ ] 2. Implement shared test helper utilities
  - Create `src/__tests__/firestore-rules/helpers.ts`
  - Implement `createTestEnv()` using `initializeTestEnvironment` — reads `firestore.rules` from disk and targets emulator at `127.0.0.1:8080`
  - Implement `makeUser(env, uid, role)` helper that returns an authenticated `RulesTestContext` for a user with the given role stored in the `users` collection
  - Implement `makeUnauth(env)` helper that returns an unauthenticated `RulesTestContext`
  - Re-export `assertFails` and `assertSucceeds` from `@firebase/rules-unit-testing`
  - Implement `seedDoc(env, collection, id, data)` helper that uses `withSecurityRulesDisabled` to write seed data bypassing rules (simulates Admin SDK writes)
  - _Requirements: All (foundational for all subsequent tests)_

- [ ] 3. Implement booking_drafts deny-all tests
  - Create `src/__tests__/firestore-rules/booking-drafts.test.ts`
  - Test: unauthenticated read on `booking_drafts/{id}` → `assertFails`
  - Test: authenticated non-admin read on `booking_drafts/{id}` → `assertFails`
  - Test: authenticated non-admin write (setDoc) on `booking_drafts/{id}` → `assertFails`
  - Test: authenticated admin-role user read on `booking_drafts/{id}` via Client SDK → `assertFails` (deny-all overrides even admin)
  - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [ ] 4. Implement public collections tests
  - Create `src/__tests__/firestore-rules/public-collections.test.ts`
  - Parameterise tests over all 6 collections: `gallery`, `sessions`, `venues`, `classes`, `recipes`, `instructors`
  - For each collection: unauthenticated `getDoc` on seeded doc → `assertSucceeds` (Property 2)
  - For each collection: authenticated (parent role) `getDoc` → `assertSucceeds` (Property 2)
  - For each collection × [unauthenticated, parent, youngAdult]: `setDoc` write attempt → `assertFails` (Property 3)
  - For each collection: admin-role user `setDoc` → `assertSucceeds`
  - _Requirements: 3.1 — 3.8_

- [ ] 5. Implement contact_messages tests
  - Create `src/__tests__/firestore-rules/contact-messages.test.ts`
  - Test: unauthenticated create → `assertFails` (Property 12)
  - Test: authenticated parent create → `assertFails` (Property 12)
  - Test: admin-role Client SDK create → `assertFails` (create is `if false` — Admin SDK is the only writer)
  - Test: any user delete on seeded doc → `assertFails` (Property 12)
  - Test: unauthenticated read → `assertFails`
  - Test: authenticated parent read → `assertFails`
  - Test: admin-role Client SDK read → `assertSucceeds`
  - Test: admin-role Client SDK update (status field) → `assertSucceeds`
  - _Requirements: 5.1 — 5.6_

- [ ] 6. Checkpoint — Verify deny-all and public collection tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Implement users collection tests
  - Create `src/__tests__/firestore-rules/users.test.ts`
  - **Read access** (Property 11):
    - User A reads `users/userA` → `assertSucceeds`
    - User A reads `users/userB` → `assertFails`
    - Unauthenticated read → `assertFails`
    - Admin reads `users/userB` → `assertSucceeds`
  - **Create — role enforcement** (Property 4):
    - Create with `role: 'admin'` → `assertFails`
    - Create with `role: 'parent'` and matching uid → `assertSucceeds`
    - Create with `role: 'youngAdult'` and matching uid → `assertSucceeds`
    - Create with `uid` field != `request.auth.uid` → `assertFails`
  - **Update — field restriction** (Property 6):
    - Update with only `firstName` change → `assertSucceeds`
    - Update with `email` change → `assertFails`
    - Update with `uid` change → `assertFails`
    - Update with `createdAt` change → `assertFails`
    - Update with `role` change → `assertFails` (Property 5)
  - **Update — role immutability** (Property 5):
    - Existing `role: 'parent'`, update to `role: 'youngAdult'` → `assertFails`
    - Existing `role: 'youngAdult'`, update to `role: 'admin'` → `assertFails`
  - **Delete** (Requirement 9):
    - Owner delete attempt → `assertFails` (no delete rule)
  - _Requirements: 6.1 — 9.2_

- [ ] 8. Implement students collection tests
  - Create `src/__tests__/firestore-rules/students.test.ts`
  - **Read access**:
    - Parent reads own student (seeded with matching `parentUid`) → `assertSucceeds`
    - Different user reads student → `assertFails`
    - Unauthenticated read → `assertFails`
    - Admin reads any student → `assertSucceeds`
  - **Create — ownership and key restriction** (Property 10):
    - Create with `parentUid != request.auth.uid` → `assertFails`
    - Create with only allowed keys `['firstName','lastName','dateOfBirth','parentUid','createdAt']` → `assertSucceeds`
    - Create with extra key `medicalInfo` → `assertFails` (Property 9)
    - Create with extra key `emergencyContact` → `assertFails` (Property 9)
    - Create with extra key `questionnaire` → `assertFails` (Property 9)
    - Create by unauthenticated user → `assertFails`
  - **Update — field restriction** (Properties 9, 10):
    - Update `firstName` only (owner) → `assertSucceeds`
    - Update `parentUid` → `assertFails` (Property 10)
    - Update `medicalInfo` → `assertFails` (Property 9)
    - Update `emergencyContact` → `assertFails` (Property 9)
    - Update `questionnaire` → `assertFails` (Property 9)
    - Update by non-owner → `assertFails`
  - **Delete**:
    - Delete by owner → `assertSucceeds`
    - Delete by non-owner → `assertFails`
    - Unauthenticated delete → `assertFails`
  - _Requirements: 10.1 — 13.3_

- [ ] 9. Implement bookings collection tests
  - Create `src/__tests__/firestore-rules/bookings.test.ts`
  - **No client create** (Property 7):
    - Authenticated parent attempts `setDoc` on `bookings/{id}` → `assertFails`
    - Unauthenticated user attempts `setDoc` on `bookings/{id}` → `assertFails`
  - **Read access**:
    - Booking owner reads own booking (seeded with `bookedByUid`) → `assertSucceeds`
    - Different user reads booking → `assertFails`
    - Unauthenticated read → `assertFails`
    - Signed-in user reads non-existent booking doc (`resource == null` polling case) → `assertSucceeds`
    - Admin reads any booking → `assertSucceeds`
  - **Update — cancellation only** (Property 8):
    - Owner updates `{ status: 'cancelled', cancelledAt: timestamp }` → `assertSucceeds`
    - Owner updates `{ status: 'confirmed' }` → `assertFails`
    - Owner updates `{ status: 'cancelled', payment: {...} }` (extra key) → `assertFails`
    - Non-owner update → `assertFails`
    - Admin update → `assertSucceeds`
  - _Requirements: 14.1 — 16.6_

- [ ] 10. Final checkpoint — Full test suite passes
  - Ensure all tests pass, ask the user if questions arise.
  - Verify test count covers all 12 correctness properties from design.md
  - Add a `test:rules` npm script to `package.json`: `"test:rules": "vitest run src/__tests__/firestore-rules/"` for convenient isolated execution

---

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP — none exist here since all tasks are implementation tasks, not supplementary tests
- The Firebase Local Emulator must be running before the test suite executes: `firebase emulators:start --only firestore`
- Tests use `withSecurityRulesDisabled` (via `seedDoc` helper) to pre-populate documents that rules tests then read/update/delete — this simulates what the Admin SDK does in production
- All tests clean up after themselves by calling `testEnv.clearFirestore()` in `afterEach` or `afterAll`
- The `createTestEnv()` helper reads `firestore.rules` from the real file — any rule change is immediately picked up by the test suite without re-configuration
- Admin SDK writes are not tested here (they bypass rules by design); this suite tests only Client SDK behaviour
