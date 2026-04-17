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
| `category` | `'cooking-classes' \| 'cakes' \| 'cookies' \| 'breads'?` | Filter category |
| `createdAt` | Timestamp | |

**Relationships:** None

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

gallery       ← standalone
testimonials  ← standalone (new)
```

---

## Firestore Security Rules (MISSING — Critical)

No `firestore.rules` file was found in the repository. Without security rules, **Firestore defaults to locked mode in production but this must be explicitly verified**. The following rules should be implemented:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Public read: gallery
    match /gallery/{docId} {
      allow read: if true;
      allow write: if request.auth != null && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }

    // Public read: testimonials (once created)
    match /testimonials/{docId} {
      allow read: if resource.data.published == true;
      allow write: if isAdmin();
    }

    // Authenticated users read their own data
    match /users/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
      allow read: if isAdmin();
    }

    // Students: parent owns, admin reads all
    match /students/{docId} {
      allow read, write: if request.auth != null &&
        request.auth.uid == resource.data.parentUid;
      allow read, write: if isAdmin();
    }

    // Sessions: public read (for browse); admin write
    match /sessions/{docId} {
      allow read: if true;
      allow write: if isAdmin();
    }

    // Bookings: owner reads own; admin reads all; write via server-side only
    match /bookings/{docId} {
      allow read: if request.auth != null &&
        request.auth.uid == resource.data.bookedByUid;
      allow read, write: if isAdmin();
    }

    // Venues, Classes, Recipes, Instructors: public read; admin write
    match /{collection}/{docId}
      if collection in ['venues', 'classes', 'recipes', 'instructors'] {
      allow read: if true;
      allow write: if isAdmin();
    }

    function isAdmin() {
      return request.auth != null &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }
  }
}
```

> **Action required:** Create `firestore.rules` and deploy via `firebase deploy --only firestore:rules`.
