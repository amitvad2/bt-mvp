# Requirements Document

## Introduction

This document captures the authentication and authorisation system for Blooming Tastebuds. The system uses a dual-layer model: Firebase Auth provides the raw identity layer (`user`), and a Firestore profile document (`btUser`, stored in `users/{uid}`) provides the application-level identity including role. Both layers must be non-null for a user to be considered fully signed in. Route protection is handled at three layers: Edge middleware (cookie-based UX gate), client-side layout guards (role-aware), and Firestore security rules (the actual security boundary).

This is a retro-spec documenting existing, deployed capability.

## Glossary

- **AuthContext**: The React context (`src/context/AuthContext.tsx`) that manages both auth layers and exposes auth methods to the application.
- **BTUser**: The Firestore user profile document stored at `users/{uid}`, containing `uid`, `role`, `firstName`, `lastName`, `email`, `phone?`, and `createdAt`.
- **Firebase_Auth**: The Firebase Authentication service managing raw identity — email/password and Google OAuth.
- **Firestore**: The Firebase Firestore database; the primary data store and the actual security boundary for data access.
- **bt_session**: A plain boolean cookie (`bt_session=true`) set by AuthContext at sign-in. Used exclusively by Edge middleware as a UX convenience gate. It is NOT a cryptographically verified security token.
- **Edge_Middleware**: The Next.js Edge middleware at `src/middleware.ts` that inspects the `bt_session` cookie to protect `/book/*` and `/admin/*` routes before a page renders.
- **AdminLayout**: The client-side layout at `src/app/admin/layout.tsx` that enforces `btUser.role === 'admin'` before rendering the admin panel.
- **PortalLayout**: The client-side layout at `src/app/portal/layout.tsx` that enforces `user !== null` before rendering the portal.
- **UserRole**: The TypeScript union type `'parent' | 'youngAdult' | 'admin'` from `src/types/index.ts`.
- **onAuthStateChanged**: The Firebase Auth listener that fires on every auth state change and is the source of truth for the `user` state.
- **Google_OAuth**: Sign-in via Google using `signInWithPopup` with `GoogleAuthProvider`.
- **Admin_SDK**: The Firebase Admin SDK used server-side (API routes, webhooks) to bypass Firestore security rules.

---

## Requirements

### Requirement 1: User Registration via Email and Password

**User Story:** As a new visitor, I want to create an account using my email address and password, so that I can access the portal and book cooking sessions.

#### Acceptance Criteria

1. WHEN a user submits a valid email, password (minimum 8 characters), first name, last name, and role (`parent` or `youngAdult`), THE AuthContext SHALL create a Firebase Auth account and a Firestore `users/{uid}` profile document containing all provided fields plus a `createdAt` server timestamp.
2. WHEN registration completes, THE AuthContext SHALL set the `bt_session` cookie eagerly (before `onAuthStateChanged` fires) with a 7-day `max-age`, `SameSite=Lax`, and `Secure` attributes.
3. WHEN registration completes, THE AuthContext SHALL set `btUser` state to the newly created profile so the application reflects the signed-in state without waiting for a Firestore read.
4. WHEN a user attempts to register with an email address already in use, THE Firebase_Auth SHALL return an `auth/email-already-in-use` error code.
5. IF a Firestore profile write fails after Firebase Auth account creation, THEN THE AuthContext SHALL propagate the error to the caller, and `btUser` state SHALL remain null for that session.
6. THE Sign-up form SHALL only expose `parent` and `youngAdult` as selectable roles — the `admin` role SHALL NOT be present as an option.
7. WHEN a user submits the sign-up form with a password shorter than 8 characters, THE Zod_Validator SHALL reject the submission with a validation error before calling AuthContext.
8. WHEN a user submits the sign-up form with mismatched password and confirm-password fields, THE Zod_Validator SHALL reject the submission with a validation error before calling AuthContext.

---

### Requirement 2: User Sign-In via Email and Password

**User Story:** As a registered user, I want to sign in with my email and password, so that I can access my portal and manage my bookings.

#### Acceptance Criteria

1. WHEN a user provides a valid email and password, THE AuthContext SHALL call `signInWithEmailAndPassword` and, upon success, set the `bt_session` cookie eagerly with a 7-day `max-age`, `SameSite=Lax`, and `Secure` attributes.
2. WHEN `onAuthStateChanged` fires after sign-in, THE AuthContext SHALL fetch the `users/{uid}` Firestore document and set `btUser` state with the profile data.
3. IF the `users/{uid}` document does not exist for an authenticated user, THEN THE AuthContext SHALL log a warning and set `btUser` to null, leaving the user in a partially signed-in state.
4. WHEN a sign-in attempt fails due to invalid credentials, THE Firebase_Auth SHALL return an appropriate error code, and THE AuthContext SHALL propagate the error to the caller without modifying auth state.
5. WHILE the `loading` state is `true`, THE AuthContext SHALL prevent layouts from rendering protected content.

---

### Requirement 3: User Sign-In via Google OAuth

**User Story:** As a visitor, I want to sign in or register using my Google account, so that I can authenticate without creating a separate password.

#### Acceptance Criteria

1. WHEN a user initiates Google sign-in, THE AuthContext SHALL call `signInWithPopup` with `GoogleAuthProvider` and, upon success, set the `bt_session` cookie eagerly.
2. WHEN a Google sign-in results in a first-time login (no existing `users/{uid}` document), THE AuthContext SHALL create a new Firestore profile using the `displayName` from the Google account (split on the first space for `firstName` and `lastName`), and the `role` passed in from the sign-up page.
3. WHEN a Google sign-in results in a returning user (existing `users/{uid}` document), THE AuthContext SHALL load the stored profile and SHALL ignore the `role` parameter passed to `signInWithGoogle` — the stored role is used unchanged.
4. WHEN a Google sign-in popup is dismissed or fails, THE AuthContext SHALL propagate the error to the caller without modifying auth state or setting the cookie.
5. WHERE the `displayName` from Google is absent or null, THE AuthContext SHALL store empty strings for `firstName` and `lastName` in the Firestore profile.

---

### Requirement 4: User Sign-Out

**User Story:** As a signed-in user, I want to sign out, so that my session is cleared and my account is protected.

#### Acceptance Criteria

1. WHEN a user calls `logOut`, THE AuthContext SHALL call Firebase `signOut`, clear `btUser` state to null, and expire the `bt_session` cookie by setting `expires=Thu, 01 Jan 1970 00:00:00 GMT`.
2. WHEN sign-out completes, THE `user` state SHALL be set to null by `onAuthStateChanged`.
3. WHEN sign-out completes, THE Edge_Middleware SHALL redirect any subsequent request to `/book/*` or `/admin/*` to `/auth/login`.

---

### Requirement 5: Password Reset

**User Story:** As a user who has forgotten their password, I want to request a password reset email, so that I can regain access to my account.

#### Acceptance Criteria

1. WHEN a user provides a valid email address on the forgot-password page, THE AuthContext SHALL call `sendPasswordResetEmail` via Firebase Auth.
2. IF the email address provided does not correspond to a registered Firebase Auth account, THEN THE Firebase_Auth SHALL handle the non-existent email case per its standard behaviour (Firebase does not expose whether an email is registered for security reasons).

---

### Requirement 6: The bt_session Cookie Lifecycle

**User Story:** As a system, I need a cookie-based signal so that Edge middleware can gate protected routes before the Firebase Auth SDK initialises on the client.

#### Acceptance Criteria

1. THE AuthContext SHALL set `bt_session=true` with `max-age=604800` (7 days), `path=/`, `SameSite=Lax`, and `Secure` attributes during `signUp`, `signIn`, and `signInWithGoogle` before any redirect or navigation occurs.
2. THE AuthContext SHALL also set the `bt_session` cookie inside the `onAuthStateChanged` callback when a Firebase Auth user is present, to handle page refreshes and returning sessions.
3. WHEN a user signs out, THE AuthContext SHALL expire the `bt_session` cookie by setting `expires=Thu, 01 Jan 1970 00:00:00 GMT` and `path=/`.
4. THE `bt_session` cookie SHALL NOT contain any user identity, role, or cryptographic token — it SHALL only be the plain string `true`.
5. THE Edge_Middleware SHALL treat the presence of any non-empty `bt_session` cookie value as indicating an authenticated session for the purpose of UX gating only.

---

### Requirement 7: Edge Middleware Route Protection

**User Story:** As the system, I need Edge middleware to redirect unauthenticated users away from booking and admin routes before the page renders, so that the user experience is seamless.

#### Acceptance Criteria

1. WHEN an unauthenticated request (no `bt_session` cookie) arrives at any path matching `/book/*` or `/admin/*`, THE Edge_Middleware SHALL redirect to `/auth/login` with a `redirect` query parameter set to the original pathname.
2. WHEN an authenticated request (valid `bt_session` cookie) arrives at `/auth/login`, `/auth/signup`, or `/auth/forgot-password`, THE Edge_Middleware SHALL redirect to `/portal/dashboard`.
3. THE Edge_Middleware SHALL NOT protect `/portal/*` routes — portal route protection is delegated to PortalLayout (client-side).
4. THE Edge_Middleware SHALL pass all requests to `/portal/*` through without inspection.
5. THE Edge_Middleware SHALL only match against the paths configured in the `matcher` array: `/book/:path*`, `/admin/:path*`, and `/auth/:path*`.

---

### Requirement 8: Admin Panel Client-Side Role Guard

**User Story:** As the system, I need the admin panel to verify the user's role client-side before rendering, so that non-admin authenticated users cannot access admin pages even if the cookie gate passes.

#### Acceptance Criteria

1. WHEN an authenticated user with `btUser.role !== 'admin'` navigates to any `/admin/*` route, THE AdminLayout SHALL redirect to `/portal/dashboard`.
2. WHEN an unauthenticated user (no `user`) navigates to any `/admin/*` route, THE AdminLayout SHALL redirect to `/auth/login` with the intended path as the `redirect` query parameter.
3. WHILE `loading` is `true`, THE AdminLayout SHALL render a loading screen and SHALL NOT render the admin panel content.
4. WHEN `btUser.role === 'admin'` and `user` is non-null and `loading` is `false`, THE AdminLayout SHALL render the full admin panel.

---

### Requirement 9: Portal Client-Side Authentication Guard

**User Story:** As the system, I need the portal to verify authentication client-side before rendering, so that users who lose their session mid-visit are redirected to login.

#### Acceptance Criteria

1. WHEN an unauthenticated request (no `user` and no `bt_session` cookie in `document.cookie`) reaches a `/portal/*` page, THE PortalLayout SHALL redirect to `/auth/login` with the current pathname as the `redirect` query parameter.
2. WHILE `loading` is `true` or `user` is null, THE PortalLayout SHALL render a loading screen.
3. WHEN `user` is non-null and `loading` is `false`, THE PortalLayout SHALL render the portal content and navigation.
4. THE PortalLayout SHALL show the "My Students" navigation item only WHEN `btUser.role === 'parent'`.

---

### Requirement 10: Firestore Role Assignment Rules

**User Story:** As the system, I need Firestore security rules to prevent any client from assigning the `admin` role, so that admin privilege escalation is impossible from the browser.

#### Acceptance Criteria

1. WHEN a client attempts to create a `users/{uid}` document with `role = 'admin'`, THE Firestore security rules SHALL deny the write.
2. WHEN a client creates a `users/{uid}` document, THE Firestore security rules SHALL only permit `role` values of `'parent'` or `'youngAdult'`.
3. THE `admin` role SHALL only be assignable server-side via the Firebase Admin SDK or the Firebase Console.
4. WHEN a client attempts to update the `role` field on their `users/{uid}` document, THE Firestore security rules SHALL deny the write.
5. WHEN a client attempts to update the `uid` field or the `createdAt` field on their `users/{uid}` document, THE Firestore security rules SHALL deny the write.

---

### Requirement 11: Firestore Profile Update Restrictions

**User Story:** As an authenticated user, I want to update my display name and phone number, so that my profile stays current — without being able to alter security-sensitive fields.

#### Acceptance Criteria

1. WHEN an authenticated user updates their `users/{uid}` document, THE Firestore security rules SHALL permit changes only to `firstName`, `lastName`, `phone`, and `updatedAt`.
2. WHEN an authenticated user attempts to update any field not in `['firstName', 'lastName', 'phone', 'updatedAt']`, THE Firestore security rules SHALL deny the write.
3. WHEN a client performs a full document overwrite (`setDoc` without `merge`) that includes unchanged values for `role`, `uid`, or `createdAt`, THE Firestore security rules SHALL still deny the write because the `affectedKeys` check will detect those fields are included in the diff.
4. THE Firestore security rules SHALL ensure that a user can only update their own profile (`uid` in the path must match `request.auth.uid`).

---

### Requirement 12: Dual Auth State Completeness

**User Story:** As the application, I need both the Firebase Auth user and the Firestore BTUser profile to be present before treating a session as fully signed in, so that role-dependent UI and data access is never rendered without a known role.

#### Acceptance Criteria

1. THE AuthContext SHALL expose a `loading` boolean that is `true` until `onAuthStateChanged` has fired and any Firestore profile fetch has completed.
2. WHEN `user` is non-null but `btUser` is null (profile fetch pending or failed), THE application SHALL NOT render role-gated content.
3. WHEN both `user` and `btUser` are non-null, THE AuthContext SHALL be considered in the fully signed-in state.
4. THE AuthContext SHALL expose `user`, `btUser`, `loading`, `signUp`, `signIn`, `signInWithGoogle`, `logOut`, and `resetPassword` as the complete public interface.
