# 05 — Data Model Recommendation

All collections live in **Firebase Firestore**. The TypeScript types that define each entity's shape are in [src/types/index.ts](../src/types/index.ts).

---

## Existing Entities (implemented in code)

---

### 1. `users`

**Purpose:** Stores the profile of every registered user (parents, young adults, admins).

**Collection:** `users/{uid}`

| Field | Type | Notes |
|-------|------|-------|
| `uid` | string | Firebase Auth UID (document ID) |
| `role` | `'parent' \| 'youngAdult' \| 'admin'` | Set at sign-up; drives UI and access control |
| `firstName` | string | |
| `lastName` | string | |
| `email` | string | Mirrors Firebase Auth email |
| `phone` | string? | Optional |
| `createdAt` | Timestamp | |

**Relationships:** One-to-many → `students` (via `students.parentUid`)

**Status:** Exists in code. Created in `AuthContext.signUp()`.

---

### 2. `students`

**Purpose:** Represents a child or young-adult student who attends classes. Parents own multiple student records; a young adult is their own student (bookings use `student: 'self'`).

**Collection:** `students/{id}`

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | Auto-generated Firestore ID |
| `parentUid` | string | Reference to `users/{uid}` |
| `firstName` | string | |
| `lastName` | string | |
| `dateOfBirth` | string | `YYYY-MM-DD` |
| `medicalInfo` | `MedicalInfo?` | Cached from last booking; updated on each booking |
| `emergencyContact` | `EmergencyContact?` | Cached as above |
| `questionnaire` | `Questionnaire?` | Dietary/allergy answers |
| `createdAt` | Timestamp | |

**Relationships:** Many-to-one → `users`; One-to-many → `bookings`

**Status:** Exists in code.

**Recommended additions:**
- `photoUrl?: string` — optional profile picture
- `notes?: string` — admin-visible notes

---

### 3. `venues`

**Purpose:** Physical locations where classes take place.

**Collection:** `venues/{id}`

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | Auto-generated |
| `name` | string | Display name (e.g. "Harrow Community Centre") |
| `address` | string | Street address |
| `postcode` | string? | For map geocoding |
| `lat` | number? | Decimal latitude |
| `lng` | number? | Decimal longitude |
| `createdAt` | Timestamp | |

**Relationships:** One-to-many → `classes`, `sessions`

**Status:** Exists in code.

**Recommended additions:**
- `phone?: string`
- `parkingNotes?: string`
- `accessibilityNotes?: string`

---

### 4. `classes`

**Purpose:** A class definition / template (e.g. "After School Club — Harrow"). Sessions are instances of classes.

**Collection:** `classes/{id}`

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | Auto-generated |
| `type` | `'kidsAfterSchool' \| 'youngAdultWeekend'` | Drives questionnaire, age validation |
| `name` | string | Human-readable (e.g. "After School Club") |
| `dayOfWeek` | string | e.g. `"Monday"`, `"Saturday"` |
| `startTime` | string | `HH:MM` |
| `endTime` | string | `HH:MM` |
| `ageMin` | number | Minimum student age in years |
| `ageMax` | number | Maximum student age in years |
| `maxSize` | number | Max spots per session |
| `instructor` | string | Instructor name (denormalised; see Instructor entity) |
| `venueId` | string | Reference to `venues/{id}` |
| `venueName` | string? | Denormalised for display |
| `commitment` | `'perSession'` | Currently only per-session pricing |
| `price` | number | Price in pence (e.g. 2500 = £25.00) |
| `createdAt` | Timestamp | |

**Relationships:** Many-to-one → `venues`; One-to-many → `sessions`

**Status:** Exists in code.

**Recommended additions:**
- `instructorId?: string` — reference to `instructors/{id}` (currently stored as a free-text name string)
- `description?: string` — short course description for display on courses page

---

### 5. `sessions`

**Purpose:** A single scheduled instance of a class (e.g. Monday 14 April 2025, After School Club, Harrow).

**Collection:** `sessions/{id}`

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | Auto-generated |
| `classId` | string | Reference to `classes/{id}` |
| `className` | string | Denormalised |
| `classType` | `ClassType` | Denormalised |
| `date` | string | `YYYY-MM-DD` |
| `recipeId` | string | Reference to `recipes/{id}` |
| `recipeName` | string? | Denormalised |
| `spotsAvailable` | number | Decremented on booking |
| `spotsTotal` | number | Max capacity |
| `status` | `'open' \| 'full' \| 'cancelled' \| 'closed'` | |
| `venueId` | string | Reference to `venues/{id}` |
| `venueName` | string | Denormalised |
| `instructorId` | string? | Reference to `instructors/{id}` |
| `instructorName` | string? | Denormalised |
| `startTime` | string | `HH:MM` |
| `endTime` | string | `HH:MM` |
| `ageMin` | number | Denormalised from class |
| `ageMax` | number | Denormalised from class |
| `price` | number | In pence; may override class price |
| `createdAt` | Timestamp | |

**Relationships:** Many-to-one → `classes`, `venues`, `recipes`, `instructors`; One-to-many → `bookings`

**Status:** Exists in code.

---

### 6. `recipes`

**Purpose:** A cooking recipe used in a session.

**Collection:** `recipes/{id}`

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | Auto-generated |
| `name` | string | Recipe display name |
| `description` | string | Ingredients/method summary |
| `photoUrl` | string? | Firebase Storage URL |
| `createdAt` | Timestamp | |

**Relationships:** One-to-many → `sessions`

**Status:** Exists in code.

**Recommended additions:**
- `allergenTags?: string[]` — e.g. `['gluten', 'dairy', 'nuts']` for pre-filtering by dietary needs
- `difficulty?: 'easy' \| 'medium' \| 'hard'`

---

### 7. `instructors`

**Purpose:** A cooking instructor who delivers sessions.

**Collection:** `instructors/{id}`

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | Auto-generated |
| `name` | string | |
| `gender` | `'male' \| 'female' \| 'non-binary' \| 'prefer-not-to-say'` | |
| `expertise` | `string[]` | e.g. `['Baking', 'Italian']` |
| `bio` | string | Short biography |
| `photoUrl` | string? | Firebase Storage URL |
| `order` | number | Display order in admin/About page |
| `createdAt` | Timestamp | |

**Relationships:** One-to-many → `sessions` (via `sessions.instructorId`)

**Status:** Exists in code.

---

### 8. `bookings`

**Purpose:** Records a confirmed booking of a student for a session, including payment and consent data.

**Collection:** `bookings/{id}`

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | Auto-generated (or Stripe PaymentIntent ID as idempotency key) |
| `sessionId` | string | Reference to `sessions/{id}` |
| `sessionDate` | string | Denormalised `YYYY-MM-DD` |
| `className` | string | Denormalised |
| `venueName` | string | Denormalised |
| `bookedByUid` | string | Reference to `users/{uid}` |
| `bookedByName` | string | Denormalised |
| `studentId` | string | Reference to `students/{id}` (or `'self'` for young adults) |
| `studentName` | string | Denormalised |
| `status` | `'confirmed' \| 'cancelled'` | |
| `medicalInfo` | `MedicalInfo` | Snapshot at time of booking |
| `emergencyContact` | `EmergencyContact?` | Snapshot at time of booking |
| `questionnaire` | `Questionnaire?` | Snapshot at time of booking |
| `termsAccepted` | boolean | Must be `true` to book |
| `termsAcceptedAt` | Timestamp | Audit timestamp |
| `payment.stripePaymentIntentId` | string | |
| `payment.amount` | number | In pence |
| `payment.currency` | string | e.g. `'gbp'` |
| `payment.status` | `'pending' \| 'paid' \| 'refunded'` | |
| `payment.receiptUrl` | string? | Stripe-hosted receipt URL |
| `createdAt` | Timestamp | |

**Relationships:** Many-to-one → `sessions`, `users`, `students`

**Status:** Exists in code.

**Recommended additions:**
- `termsVersion: string` — which version of T&Cs was accepted
- `cancelledAt?: Timestamp`
- `cancelledByUid?: string`
- `refundId?: string` — Stripe refund ID

---

### 9. `gallery`

**Purpose:** Photo gallery images displayed on the public gallery page.

**Collection:** `gallery/{id}`

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | Auto-generated |
| `imageUrl` | string | Firebase Storage URL |
| `description` | string | Caption text |
| `altText` | string | Accessibility alt attribute |
| `order` | number | Sort order |
| `category` | `'cooking-classes' \| 'personal-gallery'` | Filter category. Legacy values `'cakes'`, `'cookies'`, `'breads'` are normalised to `'personal-gallery'` at read time via `normalizeCategory()` in `src/lib/gallery-categories.ts` — no data migration required. |
| `createdAt` | Timestamp | |

**Relationships:** None

**Status:** Exists in code.

---

### 10. `contact_messages`

**Purpose:** Stores contact/feedback submissions from the public `/contact` page. Written exclusively via the Admin SDK (no direct client writes). Reviewed by admin via the `/admin/contact` inbox.

**Collection:** `contact_messages/{id}`

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | Auto-generated Firestore ID |
| `name` | string | Submitter's full name |
| `email` | string | Submitter's email address |
| `phone` | string? | Optional phone number |
| `category` | `ContactCategory` | `'general' \| 'class-info' \| 'booking-help' \| 'dietary-allergy' \| 'private-event' \| 'technical' \| 'feedback'` |
| `message` | string | Message body (min 10 chars) |
| `consentToReply` | boolean | Submitter gave consent to be contacted |
| `source` | `'contact-page'` | Origin of submission (for future multi-source support) |
| `status` | `ContactStatus` | `'new' \| 'read' \| 'replied' \| 'closed'` — managed by admin |
| `userId` | string? | Firebase Auth UID if the submitter was logged in |
| `createdAt` | Timestamp | Server-set creation time |

**TypeScript types:** `ContactCategory`, `ContactStatus`, `ContactMessage` — defined in `src/types/index.ts`.

**Firestore rules:**
```
match /contact_messages/{docId} {
  allow create, delete: if false;  // all creates via Admin SDK
  allow read, update: if isAdmin();
}
```

**Relationships:** Optional link to `users/{userId}` if the submitter was authenticated.

**Status:** Exists in code.

---

### 11. `class_types`

**Purpose:** Dynamic programme configuration. Replaces a formerly hardcoded TypeScript type enum. Admins can manage class types (e.g. "Kids After School Club", "Young Adult Weekend") via the admin panel without code changes.

**Collection:** `class_types/{id}`

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | Auto-generated Firestore ID |
| `slug` | string | URL-safe unique identifier (e.g. `kidsAfterSchool`) — used as the `classType` value on Session documents |
| `displayName` | string | Human-readable name (e.g. "Kids After School Club") |
| `shortLabel` | string | Abbreviated label for badges |
| `badgeColor` | `BadgeColor` | `'amber' \| 'green' \| 'indigo' \| 'red' \| 'gray'` — used for session badges |
| `skipQuestionnaire` | boolean | If true, dietary questionnaire is skipped in booking wizard |
| `requireEmergencyContact` | boolean | If true, emergency contact is required |
| `defaultAgeMin` | number | Default minimum age for this class type |
| `defaultAgeMax` | number | Default maximum age |
| `defaultMaxSize` | number | Default maximum session size |
| `defaultPrice` | number | Default price in pence |
| `order` | number | Display sort order |
| `createdAt` | Timestamp | |

**TypeScript type:** `BTClassType` — defined in `src/types/index.ts`.

**Firestore rules:** Public read (needed by session browser + booking wizard); admin-only write.

**Status:** Exists in code.

---

### 12. `bundles`

**Purpose:** Grouped session packages sold at a discounted price. A bundle links 2–20 sessions from the same class, with a bundle price lower than the sum of individual session prices.

**Collection:** `bundles/{id}`

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | Auto-generated Firestore ID |
| `name` | string | Bundle display name (3–100 characters) |
| `classId` | string | Reference to `classes/{id}` |
| `className` | string | Denormalised class name |
| `classType` | string | Denormalised class type slug |
| `sessionIds` | string[] | Array of 2–20 `sessions/{id}` references, all from the same classId |
| `bundlePrice` | number | Total bundle price in pence (must be > 0 and <= totalIndividualPrice) |
| `totalIndividualPrice` | number | Sum of all session prices in pence (informational) |
| `status` | `BundleStatus` | `'active' \| 'closed' \| 'cancelled'` |
| `venueId` | string | Reference to `venues/{id}` |
| `venueName` | string | Denormalised |
| `createdAt` | Timestamp | |

**TypeScript types:** `BundleStatus`, `Bundle` — defined in `src/types/index.ts`.

**Firestore rules:** Public read; admin-only write.

**Booking IDs for bundle bookings:** `{paymentIntentId}_{sessionId}` — created by webhook fan-out transaction.

**Status:** Exists in code.

---

### 13. `booking_drafts`

**Purpose:** Temporary server-side state written by `POST /api/payments/create-intent` before the Stripe PaymentIntent is confirmed. Read and deleted by the Stripe webhook after booking creation. Enables the webhook to reconstruct the full booking without relying on browser state.

**Collection:** `booking_drafts/{paymentIntentId}`

| Field | Type | Notes |
|-------|------|-------|
| `stripePaymentIntentId` | string | Same as document ID |
| `paymentStatus` | `'pending' \| 'failed'` | Updated to 'failed' by `payment_intent.payment_failed` webhook |
| `sessionId` | string? | Set for single-session bookings |
| `bundleId` | string? | Set for bundle bookings |
| `sessionIds` | string[]? | All session IDs for bundle bookings |
| `sessions` | object[]? | Per-session denormalized data (date, startTime, endTime, venueName) for bundle bookings |
| Full booking payload | ... | All wizard state: bookedByUid, bookedByName, bookedByEmail, studentId, studentName, medicalInfo, emergencyContact, questionnaire, termsAccepted, className, venueName, etc. |
| `createdAt` | Timestamp | |

**Firestore rules:** `allow read, write: if false` — all access via Firebase Admin SDK only.

**Lifecycle:** Created by `create-intent` → read by webhook → deleted by webhook on success. If abandoned (user never completes payment), document remains indefinitely (needs cleanup cron).

**Status:** Exists in code.

---

## Recommended New Entities (not yet in codebase)

---

### 10. `testimonials` _(new)_

**Purpose:** Customer reviews displayed on the public testimonials page. Currently hardcoded; should be DB-driven.

**Collection:** `testimonials/{id}`

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | Auto-generated |
| `authorName` | string | Reviewer display name |
| `authorRole` | string? | e.g. `"Parent of Emily, age 9"` |
| `rating` | number | 1–5 stars |
| `text` | string | Full review text |
| `photoUrl` | string? | Author photo (optional) |
| `published` | boolean | Admin approval toggle |
| `order` | number | Display order |
| `createdAt` | Timestamp | |

**Relationships:** None (standalone)

---

### 11. `medicalInfo` on student vs. booking — Clarification

Currently, medical info is stored in two places:
- `students/{id}.medicalInfo` — the "latest" cached version
- `bookings/{id}.medicalInfo` — an immutable snapshot at booking time

This dual-write is intentional: the booking snapshot preserves the data as it was when consent was given. The student document holds the reusable pre-fill. This design is correct — keep it.

---

## Entity Relationship Summary

```
users (1) ──── (n) students
  │                   │
  │                   └──── (n) bookings
  │
  └──── (n) bookings

venues (1) ──── (n) classes
                     │
                     └──── (n) sessions ──── (n) bookings
                                │
                    recipes (1) ┘
                    instructors (1) ┘

gallery           ← standalone
testimonials      ← standalone (new)
contact_messages  ← standalone; optional soft-link to users/{userId}
```

---

## Firestore Security Rules

`firestore.rules` exists in the repository root and covers all collections. See [docs/firestore-rules-notes.md](../docs/firestore-rules-notes.md) for the full design, per-collection rule model, and deployment instructions.

To deploy rules:
```bash
firebase deploy --only firestore:rules
```
