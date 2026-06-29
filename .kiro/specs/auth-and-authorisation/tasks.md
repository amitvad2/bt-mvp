# Implementation Plan: Auth and Authorisation — Test Coverage

## Overview

This is a retro-spec for existing functionality. All production code is already implemented. The implementation plan focuses exclusively on **adding test coverage** for the authentication and authorisation system. This includes:

- Unit tests for `AuthContext` methods
- Property-based tests for the correctness properties defined in the design
- Unit tests for Edge middleware route logic
- Unit tests for sign-up Zod schema validation
- Integration tests for Firestore security rules (emulator-based)

The test runner is **Vitest** (`npm run test:run`). Property-based tests use **fast-check**. Tests live in `src/__tests__/` mirroring the source structure.

---

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1"] },
    { "wave": 2, "tasks": ["2", "3", "4"] },
    { "wave": 3, "tasks": ["5", "6", "7"] },
    { "wave": 4, "tasks": ["8"] },
    { "wave": 5, "tasks": ["9"] },
    { "wave": 6, "tasks": ["10"] },
    { "wave": 7, "tasks": ["11"] }
  ]
}
```

**Reading the graph**: Each wave depends on all prior waves completing. Tasks 2, 3, and 4 can be done in parallel after Task 1. Tasks 5, 6, and 7 (property tests) depend on their respective unit test tasks being in place first (shared mocks/setup). Task 8 (layout tests) can proceed once 5, 6, 7 are complete. Firestore integration tests (10) are independent of the Vitest suite but require the emulator.

---

## Tasks

- [ ] 1. Install fast-check and configure it for Vitest
  - Install `fast-check` as a dev dependency: `npm install --save-dev fast-check`
  - Verify the `fast-check` import resolves correctly in `vitest.config.ts` (no special configuration needed — it is a plain ESM package)
  - Add a single smoke-test assertion (`fc.assert(fc.property(fc.integer(), n => typeof n === 'number'))`) in a temporary file to confirm fast-check runs under Vitest, then delete the file
  - _Requirements: All property-based tests (1.7, 1.8, 3.2, 3.3, 6.1, 6.4, 7.1, 7.3, 8.1)_

- [ ] 2. Write unit tests for AuthContext — sign-up and sign-in happy paths
  - Create `src/__tests__/auth/AuthContext.test.ts`
  - Mock Firebase Auth (`createUserWithEmailAndPassword`, `signInWithEmailAndPassword`, `onAuthStateChanged`, `signOut`) and Firestore (`getDoc`, `setDoc`) using `vi.mock('firebase/auth')` and `vi.mock('firebase/firestore')`
  - Write tests for:
    - `signUp`: verify `createUserWithEmailAndPassword` is called with email/password, `setDoc` is called with the correct `users/{uid}` payload, and `btUser` state reflects the created profile
    - `signIn`: verify `signInWithEmailAndPassword` is called with correct args
    - `signIn` error propagation: mock Firebase to throw `auth/wrong-password`, verify the error re-throws from `signIn`
    - `signUp` with Firestore failure: mock `setDoc` to throw, verify error propagates and `btUser` remains null
    - `logOut`: verify `signOut` is called and `btUser` is cleared
    - `resetPassword`: verify `sendPasswordResetEmail` is called with the email
  - Use `vi.clearAllMocks()` in `beforeEach`
  - _Requirements: 1.1, 1.4, 1.5, 2.1, 2.4, 4.1, 5.1_

  - [ ]* 2.1 Write unit tests for `onAuthStateChanged` handler — btUser loading behaviour
    - Test: when `onAuthStateChanged` fires with a Firebase user, `getDoc` is called for `users/{uid}` and `btUser` is set to the returned document data
    - Test: when `onAuthStateChanged` fires with a Firebase user but `getDoc` returns a non-existent doc (`exists() === false`), `btUser` is set to null
    - Test: when `onAuthStateChanged` fires with null (sign-out event), `btUser` is set to null and cookie is expired
    - Test: `loading` is `true` before the first `onAuthStateChanged` fires and `false` after
    - _Requirements: 2.2, 2.3, 2.5, 12.1, 12.2_

- [ ] 3. Write unit tests for sign-up Zod schema validation
  - Create `src/__tests__/auth/signup-schema.test.ts` (or extend the existing `src/__tests__/auth/signup-schema.test.ts` if it exists)
  - Write example-based tests:
    - Valid payload with role `'parent'` passes
    - Valid payload with role `'youngAdult'` passes
    - Payload with role `'admin'` fails with a type error
    - Password `< 8 chars` fails with the correct message
    - `password !== confirmPassword` fails on `confirmPassword` field
    - Empty `firstName` or `lastName` fails
    - Invalid email format fails
  - _Requirements: 1.6, 1.7, 1.8_

- [ ] 4. Write unit tests for Edge middleware — example-based cases
  - Create `src/__tests__/auth/middleware.test.ts`
  - Import the `middleware` function and `config` export from `src/middleware.ts`
  - Helper: create a mock `NextRequest` using `new Request(url, { headers: { cookie: '...' } })` wrapped by `new NextRequest()`
  - Write example tests:
    - GET `/book/abc` without cookie → redirect to `/auth/login?redirect=/book/abc`
    - GET `/admin/dashboard` without cookie → redirect to `/auth/login?redirect=/admin/dashboard`
    - GET `/auth/login` with `bt_session=true` cookie → redirect to `/portal/dashboard`
    - GET `/auth/signup` with `bt_session=true` cookie → redirect to `/portal/dashboard`
    - GET `/portal/dashboard` without cookie → `NextResponse.next()` (no redirect)
    - GET `/portal/dashboard` with cookie → `NextResponse.next()` (no redirect)
    - GET `/book/abc` with `bt_session=true` → `NextResponse.next()` (passes through to client layer)
    - Assert `config.matcher` contains exactly `['/book/:path*', '/admin/:path*', '/auth/:path*']`
  - _Requirements: 7.1, 7.2, 7.3, 7.5_

- [ ] 5. Write property-based tests for AuthContext — cookie correctness and auth state
  - Extend `src/__tests__/auth/AuthContext.test.ts`
  - Import `fast-check` as `fc`
  - Each `fc.assert` call uses `{ numRuns: 100 }` minimum

  - [ ]* 5.1 Property test: bt_session cookie value is always exactly 'true'
    - **Property 2: Cookie-State Consistency**
    - **Validates: Requirements 6.1, 6.4**
    - For any valid `{ email, password, firstName, lastName }` combination (generated with `fc.record`), calling `signUp` with role `'parent'` or `'youngAdult'` (after mocking Firebase) should result in `document.cookie` containing `bt_session=true`
    - Assert the cookie value is not a UID, email, role string, or JWT-shaped string (does not contain `.` characters that would indicate a JWT)
    - Run for signIn and signInWithGoogle as well
    - Tag: `// Feature: auth-and-authorisation, Property 2: Cookie value is exactly 'true'`

  - [ ]* 5.2 Property test: signUp always produces btUser with matching fields
    - For any valid combination of `(firstName, lastName, role)` where `role ∈ ['parent', 'youngAdult']`, after `signUp` resolves successfully, `btUser.firstName === firstName`, `btUser.lastName === lastName`, `btUser.role === role`, and `btUser.role !== 'admin'`
    - Use `fc.record({ firstName: fc.string({ minLength: 2 }), lastName: fc.string({ minLength: 2 }), role: fc.constantFrom('parent', 'youngAdult') })`
    - Tag: `// Feature: auth-and-authorisation, Property 1: Admin Role Invariant`
    - **Validates: Requirements 1.1, 1.6**

  - [ ]* 5.3 Property test: both user and btUser non-null after any successful auth
    - **Property 2 (partial) + 12.3 combined**
    - For any successful `signUp` call, both `user` (mocked Firebase user) and `btUser` should be non-null in the context
    - **Validates: Requirements 12.3**
    - Tag: `// Feature: auth-and-authorisation, Property 2 partial: Dual-state completeness`

  - [ ]* 5.4 Property test: returning Google user role is never overwritten
    - **Property 5: Returning Google User Role Preservation**
    - **Validates: Requirements 3.3**
    - For any pair `(storedRole, passedRole)` where both are `UserRole` values, when `getDoc` returns a profile with `storedRole`, calling `signInWithGoogle(passedRole)` should result in `btUser.role === storedRole`
    - Use `fc.tuple(fc.constantFrom('parent', 'youngAdult', 'admin'), fc.constantFrom('parent', 'youngAdult'))`
    - Tag: `// Feature: auth-and-authorisation, Property 5: Returning Google User Role Preservation`

  - [ ]* 5.5 Property test: Google displayName decomposition
    - **Property 4: Google Sign-In displayName Decomposition**
    - **Validates: Requirements 3.2, 3.5**
    - For any displayName string with at least one space, `firstName` should equal the part before the first space and `lastName` the remainder
    - For displayName with no spaces, `firstName` equals the full string and `lastName` is `''`
    - For null displayName, both `firstName` and `lastName` are `''`
    - Use `fc.string()` with various space configurations
    - Tag: `// Feature: auth-and-authorisation, Property 4: displayName decomposition`

- [ ] 6. Write property-based tests for sign-up Zod schema
  - Extend `src/__tests__/auth/signup-schema.test.ts`

  - [ ]* 6.1 Property test: any password of length 0–7 is rejected
    - **Property 9: Sign-Up Input Validation — Short Passwords Universally Rejected**
    - **Validates: Requirements 1.7**
    - `fc.assert(fc.property(fc.string({ maxLength: 7 }), shortPw => schema.safeParse({ ...validBase, password: shortPw, confirmPassword: shortPw }).success === false), { numRuns: 200 })`
    - Tag: `// Feature: auth-and-authorisation, Property 9: Short passwords rejected`

  - [ ]* 6.2 Property test: any mismatched password/confirmPassword pair is rejected
    - **Property 10: Sign-Up Input Validation — Password Mismatch Universally Rejected**
    - **Validates: Requirements 1.8**
    - `fc.assert(fc.property(fc.tuple(fc.string({ minLength: 8 }), fc.string({ minLength: 8 })).filter(([a, b]) => a !== b), ([pw, cpw]) => schema.safeParse({ ...validBase, password: pw, confirmPassword: cpw }).success === false), { numRuns: 200 })`
    - Tag: `// Feature: auth-and-authorisation, Property 10: Password mismatch rejected`

  - [ ]* 6.3 Property test: admin role value always rejected by schema
    - **Property 1 (Zod layer): Admin Role Invariant**
    - **Validates: Requirements 1.6, 10.1**
    - `fc.assert(fc.property(fc.constant('admin'), adminRole => schema.safeParse({ ...validBase, role: adminRole }).success === false), { numRuns: 50 })`
    - Also test any arbitrary non-enum string as role: `fc.string().filter(r => !['parent', 'youngAdult'].includes(r))`
    - Tag: `// Feature: auth-and-authorisation, Property 1: Admin role invariant (schema layer)`

- [ ] 7. Write property-based tests for Edge middleware
  - Extend `src/__tests__/auth/middleware.test.ts`

  - [ ]* 7.1 Property test: any /book/* or /admin/* path without cookie redirects to login
    - **Property 7: Middleware Unauthenticated Redirect Coverage**
    - **Validates: Requirements 7.1**
    - Generate arbitrary path suffixes and prepend `/book/` and `/admin/`
    - Assert redirect URL starts with `/auth/login` and `searchParams.get('redirect')` equals the original path
    - Use `fc.webSegment()` or `fc.string({ minLength: 1 }).map(s => s.replace(/[^a-z0-9-]/g, 'x'))` to generate path segments
    - Tag: `// Feature: auth-and-authorisation, Property 7: Unauthenticated protected route redirect`

  - [ ]* 7.2 Property test: any /portal/* path passes through regardless of cookie state
    - **Property 6: Middleware Pass-Through for /portal/* Routes**
    - **Validates: Requirements 7.3**
    - For any path starting with `/portal/` and any cookie presence (with or without `bt_session`), the middleware should return `NextResponse.next()` (no Location header in response)
    - Use `fc.string({ minLength: 1 }).map(s => '/portal/' + s)`
    - Tag: `// Feature: auth-and-authorisation, Property 6: Portal pass-through`

- [ ] 8. Write layout guard tests — AdminLayout and PortalLayout
  - Create `src/__tests__/auth/AdminLayout.test.tsx` and `src/__tests__/auth/PortalLayout.test.tsx`
  - Mock `useAuth` from `@/context/AuthContext` and `useRouter`/`usePathname` from `next/navigation`

  - [ ]* 8.1 Property test: AdminLayout redirects any non-admin role to /portal/dashboard
    - **Property 8: Non-Admin Role Guard in AdminLayout**
    - **Validates: Requirements 8.1**
    - For each role in `['parent', 'youngAdult']`, render `AdminLayout` with a mocked `btUser` carrying that role and a non-null `user`. Assert `router.push` is called with `/portal/dashboard`
    - Tag: `// Feature: auth-and-authorisation, Property 8: Non-admin role guard`

  - [ ]* 8.2 Example tests for AdminLayout
    - loading=true → renders "Checking admin permissions..." and does not call router.push
    - user=null → router.push called with `/auth/login?redirect=...`
    - btUser.role='admin', user non-null, loading=false → renders admin panel content (assert a nav item is present)
    - _Requirements: 8.2, 8.3, 8.4_

  - [ ]* 8.3 Example tests for PortalLayout
    - loading=true → renders loading screen
    - user=null and no bt_session cookie → router.push called with `/auth/login?redirect=...`
    - user non-null, loading=false, role='parent' → "My Students" nav item IS present
    - user non-null, loading=false, role='youngAdult' → "My Students" nav item is NOT present
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

- [ ] 9. Checkpoint — run full Vitest suite and fix any failures
  - Run `npm run test:run` and confirm all tests pass with zero failures
  - Ensure fast-check property tests show iteration counts in the Vitest output
  - Address any TypeScript compilation errors surfaced by the new test files
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 10. Write Firestore security rules integration tests using the emulator
  - Create `src/__tests__/firestore-rules/auth-rules.test.ts`
  - Use `@firebase/rules-unit-testing` package (install if not present: `npm install --save-dev @firebase/rules-unit-testing`)
  - Initialise a test app with `initializeTestEnvironment({ projectId: 'bt-mvp-test', firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') } })`
  - Create helper functions `authedApp(uid)` and `unauthApp()` for test setup

  - [ ]* 10.1 Firestore rule test: admin role creation is denied (Property 3 — Firestore layer)
    - **Property 3: Profile Field Immutability (creation variant)**
    - **Validates: Requirements 10.1, 10.2**
    - Test: `authedApp('user1').firestore().collection('users').doc('user1').set({ uid: 'user1', role: 'admin', ... })` → expect PERMISSION_DENIED
    - Test: `role: 'parent'` with own UID → expect allowed
    - Test: `role: 'youngAdult'` with own UID → expect allowed
    - Test: arbitrary non-enum role string → expect PERMISSION_DENIED
    - Tag: `// Feature: auth-and-authorisation, Property 3: Admin role invariant (Firestore layer)`

  - [ ]* 10.2 Firestore rule test: role field cannot be updated by client
    - **Validates: Requirements 10.4, 11.1**
    - Set up a `users/user1` doc with `role: 'parent'`
    - Test: authenticated as `user1`, attempt `update({ role: 'admin' })` → PERMISSION_DENIED
    - Test: authenticated as `user1`, attempt `update({ role: 'youngAdult' })` → PERMISSION_DENIED (role is immutable even to same value via affectedKeys)
    - Tag: `// Feature: auth-and-authorisation, Property 3: Role immutability (update)`

  - [ ]* 10.3 Firestore rule test: uid and createdAt fields cannot be updated
    - **Validates: Requirements 10.5, 11.2**
    - Test: authenticated as `user1`, attempt `update({ uid: 'user1' })` → PERMISSION_DENIED
    - Test: authenticated as `user1`, attempt `update({ createdAt: new Date() })` → PERMISSION_DENIED
    - Tag: `// Feature: auth-and-authorisation, Property 3: Field immutability (uid, createdAt)`

  - [ ]* 10.4 Firestore rule test: permitted profile fields can be updated
    - **Validates: Requirements 11.1**
    - Test: authenticated as `user1`, attempt `update({ firstName: 'New', updatedAt: serverTimestamp() })` → allowed
    - Test: authenticated as `user1`, attempt `update({ phone: '+447700900000' })` → allowed

  - [ ]* 10.5 Firestore rule test: cross-user profile update is denied
    - **Validates: Requirements 11.4**
    - Test: authenticated as `user2`, attempt to update `users/user1` with `{ firstName: 'Hacked' }` → PERMISSION_DENIED
    - Tag: `// Feature: auth-and-authorisation, Property 3: Cross-user update denied`

  - [ ]* 10.6 Firestore rule test: create profile with another user's UID is denied
    - **Validates: Requirements 10.1**
    - Test: authenticated as `user2`, attempt to create `users/user1` (UID mismatch) → PERMISSION_DENIED

- [ ] 11. Final checkpoint — run full test suite including emulator tests
  - Run `npm run test:run` for the Vitest suite
  - Run emulator tests: `firebase emulators:exec --only firestore "npx vitest run src/__tests__/firestore-rules/"`
  - Confirm all tests pass and no regressions introduced
  - Ensure all tests pass, ask the user if questions arise.

---

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster first pass. The non-optional tasks establish the mocking patterns and example-based test harness that the property tests depend on.
- All test files should use the `vi.clearAllMocks()` pattern in `beforeEach` (per existing project conventions in `tech.md`).
- The `fast-check` property tests complement, not replace, the example-based unit tests. Both are needed for comprehensive coverage.
- Firestore emulator tests (Task 10) require `firebase-tools` installed globally and the emulator running. They can be deferred if the emulator is not available in CI.
- The Zod schema tests in Task 3/6 can reuse or extend the existing `src/__tests__/auth/signup-schema.test.ts` file if it already contains schema imports.
