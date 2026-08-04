# Firestore Rules — Design Notes

> **Status note (2026-08):** `firestore.rules` has been implemented and deployed to project `bt-mvp-d057f`. The webhook-based booking architecture described in "Recommended next step" below has been completed. Several sections of this document describe historical state — see per-section notes.

---

## What Was Added

`firestore.rules` was created at the repository root. It covers all Firestore collections used by the app.

### Helper functions

| Function | Purpose |
|----------|---------|
| `isSignedIn()` | True when `request.auth != null` |
| `callerRole()` | Reads `users/{callerUid}.role` from Firestore — costs one read per evaluation |
| `isAdmin()` | `isSignedIn() && callerRole() == 'admin'` |
| `isOwner(uid)` | `isSignedIn() && request.auth.uid == uid` |

**Admin role costs a Firestore read.** The `callerRole()` function does a `get()` on the `users` collection every time it is called. This is the standard Firebase pattern when roles are stored in Firestore rather than in custom claims. It only fires on admin-gated write paths and admin reads — public reads never touch it. If you want to eliminate this overhead entirely, migrate admin role to [Firebase custom claims](https://firebase.google.com/docs/auth/admin/custom-claims) and replace `callerRole()` with `request.auth.token.role`.

---

### Per-collection rule model

| Collection | Public read | Authenticated user read | Authenticated user write | Admin |
|------------|------------|------------------------|--------------------------|-------|
| `gallery` | Yes | — | — | Full CRUD |
| `sessions` | Yes | — | No client write (webhook-only for spotsAvailable) | Full CRUD |
| `venues` | Yes | — | — | Full CRUD |
| `classes` | Yes | — | — | Full CRUD |
| `recipes` | Yes | — | — | Full CRUD |
| `instructors` | Yes | — | — | Full CRUD |
| `class_types` | Yes | — | — | Full CRUD |
| `bundles` | Yes | — | — | Full CRUD |
| `users` | No | Own doc only | Own doc only (no delete) | Read all |
| `students` | No | Own (parentUid match) | Own only; parentUid locked | Read all |
| `bookings` | No | Own (bookedByUid match) | Cancel only (status update) | Full CRUD |
| `booking_drafts` | No | No | No | Deny all (Admin SDK only) |
| `contact_messages` | No | Admin only | Admin only (status update) | Full CRUD |

> **Note:** The `sessions` `spotsAvailable` client-decrement rule has been removed. The `bookings` client-create rule has been removed. Both operations are exclusively performed by the Stripe webhook handler via Firebase Admin SDK, which bypasses security rules.

---

## Assumptions

1. **Admin role stored in Firestore.** The codebase stores `role: 'admin'` in `users/{uid}` — there are no Firebase custom claims set anywhere. Rules use `get()` to read the role.

2. **Middleware is a UI fence, not a security layer.** `src/middleware.ts` checks only for the presence of a `bt_session=true` cookie, which is a plain boolean set by `document.cookie`. Any browser user can craft this cookie. The Firestore rules are the sole enforcement mechanism for data security.

3. **Public reads are intentional.** The public homepage renders a Leaflet session map (`SessionMapFinder.tsx`) without authentication. This component queries `sessions` and `venues`. Both collections need `allow read: if true` to work on the unauthenticated homepage.

4. **Young adults do not have student documents.** When a young adult books, `CheckoutForm.tsx` sets `studentId = user.uid` and skips the student `updateDoc` call (`if (state.student !== 'self' && state.studentId)`). No student document is touched for young-adult bookings, so the students rules are irrelevant to that path.

5. **`parentUid` is immutable after creation.** The student update rule enforces `request.resource.data.parentUid == resource.data.parentUid`. This prevents any client from transferring a student to another parent via a direct SDK call, even if they somehow obtained a valid auth token.

---

## The Booking Write Decision

> **COMPLETED (2026-08):** The webhook-based booking architecture described below has been fully implemented. `CheckoutForm.tsx` no longer writes to Firestore. The `allow create` rule for `bookings` has been set to `false`, and the `spotsAvailable` client-update rule on `sessions` has been removed.

### Historical context

Previously, `CheckoutForm.tsx` wrote the booking document directly from the browser with the Firebase client SDK (`addDoc(collection(db, 'bookings'), bookingData)`) and decremented `spotsAvailable` via a separate `updateDoc`. This created race conditions and fraud risks.

### Current architecture (implemented)

All booking creation is exclusively server-side:

1. `/api/payments/create-intent` — verifies Firebase ID token, reads authoritative price from Firestore, creates Stripe PaymentIntent, writes `booking_drafts/{piId}` via Admin SDK.
2. `/api/webhooks/stripe` — on `payment_intent.succeeded`: reads draft, runs Firestore transaction (idempotency + capacity check + `bookings/{piId}` creation + `spotsAvailable` decrement), updates student profile, sends confirmation email, deletes draft.
3. `CheckoutForm.tsx` — no Firestore writes; just handles Stripe Elements UI and navigation.

The Firestore rules reflect this:
```
// bookings — no client create; only admin can write
allow create: if false;

// sessions — no client spotsAvailable write
// (user-update block removed entirely)

// booking_drafts — deny all client access; Admin SDK bypasses rules
match /booking_drafts/{docId} {
  allow read, write: if false;
}
```

---

## Code Paths Verification

> **Note (2026-08):** The two rows marked `OUTDATED` below describe code paths that no longer exist in the codebase. `CheckoutForm.tsx` no longer writes to `bookings` or `sessions` — all such writes go through the Stripe webhook handler via Firebase Admin SDK.

None of the existing client code paths break — every operation in the codebase matches a rule. Below is the verification:

| Code path | Operation | Rule that covers it |
|-----------|-----------|---------------------|
| `AuthContext.signUp` | `setDoc(users/{uid})` | `allow create: if isOwner(uid)` ✓ |
| `AuthContext.signInWithGoogle` | `setDoc(users/{uid})` | `allow create: if isOwner(uid)` ✓ |
| `AuthContext.onAuthStateChanged` | `getDoc(users/{uid})` | `allow read: if isOwner(uid)` ✓ |
| `AccountPage.update` | `updateDoc(users/{uid})` | `allow update: if isOwner(uid)` ✓ |
| `MyStudentsPage.fetch` | `getDocs(students where parentUid==uid)` | `allow read: if parentUid==auth.uid` ✓ |
| `MyStudentsPage.add` | `addDoc(students)` with `parentUid=user.uid` | `allow create: if parentUid==auth.uid` ✓ |
| `MyStudentsPage.edit` | `updateDoc(students/{id})` | `allow update: if parentUid==auth.uid && parentUid unchanged` ✓ |
| `MyStudentsPage.delete` | `deleteDoc(students/{id})` | `allow delete: if parentUid==auth.uid` ✓ |
| `StudentSelectionPage.fetch` | `getDocs(students where parentUid==uid)` | `allow read: if parentUid==auth.uid` ✓ |
| `StudentSelectionPage.add` | `addDoc(students)` | `allow create: if parentUid==auth.uid` ✓ |
| `BookingContext.fetch` | `getDoc(sessions/{id})` | `allow read: if true` ✓ |
| `FindClassPage.fetch sessions` | `getDocs(sessions where status==open)` | `allow read: if true` ✓ |
| `FindClassPage.fetch venues` | `getDocs(venues)` | `allow read: if true` ✓ |
| ~~`CheckoutForm.addDoc(bookings)`~~ | ~~Creates booking doc~~ | **OUTDATED** — CheckoutForm no longer writes to bookings; webhook handler uses Admin SDK |
| ~~`CheckoutForm.updateDoc(sessions)`~~ | ~~`{spotsAvailable: increment(-1)}`~~ | **OUTDATED** — CheckoutForm no longer decrements spots; webhook handler uses Admin SDK |
| `CheckoutForm.updateDoc(students)` | Updates medicalInfo/emergencyContact/questionnaire | `allow update: if parentUid==auth.uid && parentUid unchanged` ✓ |
| `MyClassesPage.fetch` | `getDocs(bookings where bookedByUid==uid)` | `allow read: if bookedByUid==auth.uid` ✓ |
| `MyClassesPage.cancel` | `updateDoc(bookings/{id}, {status, cancelledAt})` | `allow update: if bookedByUid==auth.uid && status==cancelled && affectedKeys==...` ✓ |
| `MyPaymentsPage.fetch` | `getDocs(bookings where bookedByUid==uid)` | `allow read: if bookedByUid==auth.uid` ✓ |
| `ConfirmationPage.fetch` | `getDoc(bookings/{id})` | `allow read: if bookedByUid==auth.uid` ✓ |
| `GalleryClient.fetch` | `getDocs(gallery)` | `allow read: if true` ✓ |
| `SessionMapFinder.fetch` | `getDocs(sessions)`, `getDocs(venues)` | `allow read: if true` ✓ |
| All `admin/*` pages | Full CRUD on all collections | `allow write: if isAdmin()` ✓ |
| `AdminDashboard.fetch users` | `getDocs(users)` | `allow read: if isAdmin()` ✓ |

---

## Deploying the Rules

```bash
# Install Firebase CLI if not already installed
npm install -g firebase-tools

# Log in
firebase login

# Deploy only Firestore rules (does not touch Storage, Hosting, etc.)
firebase deploy --only firestore:rules --project YOUR_PROJECT_ID
```

Or deploy both Firestore and Storage rules together:
```bash
firebase deploy --only firestore:rules,storage --project YOUR_PROJECT_ID
```

**Verify in Firebase Console:** Firestore → Rules → check the "Published" tab matches the file contents.

---

## Follow-up Tasks

1. ✅ **Deploy rules** — deployed to `bt-mvp-d057f`. Re-deploy after any rule changes: `firebase deploy --only firestore:rules --project bt-mvp-d057f`.
2. ✅ **Add Stripe webhook handler** (`/api/webhooks/stripe`) and move booking creation server-side — completed. Client-create rule is now `allow create: if false`.
3. 🔲 **Migrate admin role to Firebase custom claims** — eliminates the `get()` read on every admin operation and makes admin checks instant without a round-trip to Firestore.
4. 🔲 **Add a `firestore.indexes.json`** — the `bookings where bookedByUid == X` query and `sessions where status == open` query will need composite indexes if Firestore prompts for them in the console.
