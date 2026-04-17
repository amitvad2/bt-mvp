# Firestore Rules — Design Notes

---

## What Was Added

`firestore.rules` was created at the repository root. It covers all nine Firestore collections used by the app.

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
| `sessions` | Yes | — | Decrement `spotsAvailable` only | Full CRUD |
| `venues` | Yes | — | — | Full CRUD |
| `classes` | Yes | — | — | Full CRUD |
| `recipes` | Yes | — | — | Full CRUD |
| `instructors` | Yes | — | — | Full CRUD |
| `users` | No | Own doc only | Own doc only (no delete) | Read all |
| `students` | No | Own (parentUid match) | Own only; parentUid locked | Read all |
| `bookings` | No | Own (bookedByUid match) | Create (validated) + cancel | Full CRUD |

---

## Assumptions

1. **Admin role stored in Firestore.** The codebase stores `role: 'admin'` in `users/{uid}` — there are no Firebase custom claims set anywhere. Rules use `get()` to read the role.

2. **Middleware is a UI fence, not a security layer.** `src/middleware.ts` checks only for the presence of a `bt_session=true` cookie, which is a plain boolean set by `document.cookie`. Any browser user can craft this cookie. The Firestore rules are the sole enforcement mechanism for data security.

3. **Public reads are intentional.** The public homepage renders a Leaflet session map (`SessionMapFinder.tsx`) without authentication. This component queries `sessions` and `venues`. Both collections need `allow read: if true` to work on the unauthenticated homepage.

4. **Young adults do not have student documents.** When a young adult books, `CheckoutForm.tsx` sets `studentId = user.uid` and skips the student `updateDoc` call (`if (state.student !== 'self' && state.studentId)`). No student document is touched for young-adult bookings, so the students rules are irrelevant to that path.

5. **`parentUid` is immutable after creation.** The student update rule enforces `request.resource.data.parentUid == resource.data.parentUid`. This prevents any client from transferring a student to another parent via a direct SDK call, even if they somehow obtained a valid auth token.

---

## The Booking Write Decision

### The problem

`CheckoutForm.tsx` writes the booking document directly from the browser with the Firebase client SDK:

```typescript
// src/app/book/[sessionId]/payment/CheckoutForm.tsx — line 80
const docRef = await addDoc(collection(db, 'bookings'), bookingData);
```

This happens after `stripe.confirmPayment()` succeeds but **before** any server-side verification that the Stripe charge actually completed.

**Risks of this approach:**
- A user who inspects the code could call `addDoc` directly — creating a fake booking with fabricated payment data — unless the rules validate the fields.
- If the user's network drops after Stripe charges their card but before the `addDoc` call completes, payment is taken but no booking exists in Firestore.
- Decrementing `spotsAvailable` also happens client-side (a separate `updateDoc`), creating a window where payment succeeds but the spot is never decremented.

### What the current rules do

The create rule validates the minimum required invariants:
```
allow create: if isSignedIn()
  && request.resource.data.bookedByUid == request.auth.uid  // can't book as someone else
  && request.resource.data.termsAccepted == true             // T&Cs were accepted
  && request.resource.data.status == 'confirmed'             // valid status
  && request.resource.data.payment.status in ['pending', 'paid'];
```

**What this does NOT protect against:** A logged-in user can still create a booking document with a fabricated `stripePaymentIntentId`. The rules cannot call the Stripe API to verify the charge. This is the inherent limitation of client-side booking creation.

### Why this approach is acceptable for now

- The booking form is behind Firebase Auth — an anonymous user cannot write bookings.
- The field constraints prevent the most obvious injection patterns.
- For an MVP cooking class business with a low attack surface, this is a pragmatic trade-off.

### Recommended next step — move booking creation server-side

The proper fix closes the gap entirely:

1. **Create `/api/webhooks/stripe/route.ts`** — a Next.js API route that:
   - Verifies the Stripe webhook signature using `STRIPE_WEBHOOK_SECRET`
   - On `payment_intent.succeeded`: writes the booking via `adminDb` (Firebase Admin SDK, which bypasses security rules)
   - Decrements `spotsAvailable` in the same operation via a Firestore transaction
   - Sends the confirmation email

2. **In `CheckoutForm.tsx`** — remove the `addDoc`, `updateDoc`, and email calls. Just redirect to a "payment received — booking pending" page.

3. **After step 1 is live** — tighten the Firestore rule:
   ```
   // Replace the current 'allow create' rule with:
   allow create: if false;  // all booking writes go through the webhook
   ```

4. **Also tighten the `sessions` update rule** — once the webhook decrements `spotsAvailable` server-side, change:
   ```
   // Replace the spotsAvailable user-update rule with:
   // (remove the second 'allow update' block on sessions entirely)
   ```

---

## Code Paths That Will Fail Under These Rules

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
| `CheckoutForm.addDoc(bookings)` | Creates booking doc | `allow create: if isSignedIn && ...` ✓ |
| `CheckoutForm.updateDoc(sessions)` | `{spotsAvailable: increment(-1)}` | `allow update: if isSignedIn && affectedKeys == ['spotsAvailable'] && ...` ✓ |
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

## Recommended Follow-up Tasks (in priority order)

1. **Deploy these rules immediately** — the database has been open since the project started.
2. **Add a Stripe webhook handler** (`/api/webhooks/stripe`) and move booking creation server-side. Once done, replace the client-create rule with `allow create: if false`.
3. **Migrate admin role to Firebase custom claims** — eliminates the `get()` read on every admin operation and makes admin checks instant without a round-trip to Firestore.
4. **Add a `firestore.indexes.json`** — the `bookings where bookedByUid == X` query and `sessions where status == open` query will need composite indexes if Firestore prompts for them in the console.
