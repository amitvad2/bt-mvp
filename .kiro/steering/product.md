# Blooming Tastebuds — Product Overview

Blooming Tastebuds is a UK-based cooking class business with two programme types:

- **After School Club** (`kidsAfterSchool`) — children aged 5–12, Mondays 3:30–4:30 pm
- **Weekend Classes** (`youngAdultWeekend`) — young adults (university starters), Saturdays or Sundays 10:30 am–12:30 pm

## User Roles

| Role | Description |
|------|-------------|
| `parent` | Books sessions on behalf of their children (students). Has access to "My Students" in the portal. |
| `youngAdult` | Books sessions for themselves. No student management. Dietary questionnaire is skipped. |
| `admin` | Full access to the admin panel. Can only be assigned server-side (Firebase Console or Admin SDK) — the sign-up form explicitly blocks creating `admin` accounts. |

## Public Site Pages

| Page | URL | Notes |
|------|-----|-------|
| Homepage | `/` | Hero canvas, magic cursor, session map finder |
| Classes | `/classes` | Filterable session list (`ClassesClient.tsx`) |
| Gallery | `/gallery` | Photo gallery with category filter (`GalleryClient.tsx`) |
| About | `/about` | Static marketing page |
| Contact | `/contact` | Contact form → `POST /api/contact` |
| Testimonials | `/testimonies` | Hardcoded reviews with expandable detail (`ExpandableReview.tsx`) |
| Terms | `/terms` | Static terms & conditions |

## Authenticated Portal Pages

| Page | URL | Roles |
|------|-----|-------|
| Dashboard | `/portal/dashboard` | All |
| Find a Class | `/portal/find-class` | All |
| My Classes | `/portal/my-classes` | All — upcoming + past; cancel action sends cancellation email |
| My Payments | `/portal/my-payments` | All |
| My Students | `/portal/my-students` | `parent` only |
| Manage Account | `/portal/account` | All |
| Support | `/portal/support` | All |

## Admin Panel Pages

| Page | URL | Purpose |
|------|-----|---------|
| Overview | `/admin/dashboard` | Summary stats |
| Venues | `/admin/venues` | CRUD — physical locations |
| Classes | `/admin/classes` | CRUD — class types with schedule, price, age range |
| Sessions | `/admin/sessions` | CRUD — individual session dates linked to a class |
| Recipes | `/admin/recipes` | CRUD — recipe library |
| Gallery | `/admin/gallery` | CRUD — upload/manage gallery images |
| Instructors | `/admin/instructors` | CRUD — instructor profiles |
| Bookings | `/admin/bookings` | Read + manage all bookings |
| Contact Inbox | `/admin/contact` | Read contact messages, update status |

## Core User Journeys

1. **Discovery** — Browse sessions on the public site (homepage map, `/classes` page)
2. **Registration** — Sign up as parent or young adult (email/password or Google OAuth). Google sign-in prompts for role on first login only.
3. **Booking Wizard** — 6-step flow at `/book/[sessionId]/`:
   - Step 1 `student/` — Select existing student or 'self' (young adults)
   - Step 2 `medical/` — Medical info + emergency contact
   - Step 3 `questionnaire/` — Dietary questionnaire (skipped for `youngAdultWeekend`)
   - Step 4 `terms/` — T&Cs acceptance
   - Step 5 `payment/` — Stripe Elements checkout
   - Step 6 `confirmation/` — Polls Firestore until booking document appears
4. **Payment Flow** — `POST /api/payments/create-intent` creates a `PaymentIntent` and a `booking_draft` document. The Stripe webhook (`payment_intent.succeeded`) then creates the booking and decrements session capacity.
5. **Portal** — Authenticated dashboard for managing bookings, students, payments, and account details.
6. **Cancellation** — User cancels from "My Classes". Firestore `bookings/{id}` is updated client-side (status → `cancelled`), then `/api/emails/send` is called to send a cancellation confirmation email.

## Key Business Rules

- **Webhook-authoritative booking creation**: the Stripe `payment_intent.succeeded` webhook is the single source of truth for creating bookings and decrementing session capacity. No booking is ever created from the browser.
- **Price is server-authoritative**: `create-intent` reads `session.price` from Firestore. The client never sends an `amount` field.
- **Booking document ID = Stripe PaymentIntent ID**: ensures idempotency — duplicate webhook deliveries are handled by checking whether the booking doc already exists inside a Firestore transaction.
- **`booking_drafts`**: stores the full wizard payload between payment initiation and webhook execution. Draft ID = PaymentIntent ID. Deleted after successful booking creation.
- **Overbooking handling**: if `spotsAvailable <= 0` at webhook time, the booking is still created (payment was taken) but flagged with `overbooking: true` for manual review.
- **Dietary questionnaire is skipped** for `youngAdultWeekend` class type.
- **Age validation** runs client-side against `session.ageMin` / `session.ageMax` during student selection.
- **Testimonials are hardcoded** — not stored in Firestore.
- **`bt_session` cookie** is a plain boolean set by `AuthContext` for Edge middleware UX gating only. It is not a verified security token. Firestore rules are the actual security boundary.
- **Admin accounts** cannot be created through the public sign-up flow — `admin` role is explicitly blocked in the Firestore `users` create rule.

## Firestore Data Model

### Key Type Definitions (from `src/types/index.ts`)

**`BTUser`** — stored in `users/{uid}`
```ts
{ uid, role: 'parent' | 'youngAdult' | 'admin', firstName, lastName, email, phone?, createdAt }
```

**`Student`** — stored in `students/{studentId}` (parent-owned)
```ts
{ id, parentUid, firstName, lastName, dateOfBirth, medicalInfo?, emergencyContact?, questionnaire?, createdAt }
```

**`BTClass`** — stored in `classes/{classId}`
```ts
{ id, type: 'kidsAfterSchool' | 'youngAdultWeekend', name, dayOfWeek, startTime, endTime, ageMin, ageMax, maxSize, instructor, venueId, venueName?, commitment: 'perSession', price (pence), createdAt }
```

**`Session`** — stored in `sessions/{sessionId}`
```ts
{ id, classId, className, classType, date (YYYY-MM-DD), recipeId, recipeName?, spotsAvailable, spotsTotal, status: 'open'|'full'|'cancelled'|'closed', venueId, venueName, instructorId?, instructorName?, startTime, endTime, ageMin, ageMax, price (pence), createdAt }
```

**`Booking`** — stored in `bookings/{paymentIntentId}`
```ts
{ id, sessionId, sessionDate, className, venueName, bookedByUid, bookedByName, studentId, studentName, status: 'confirmed'|'cancelled', medicalInfo, emergencyContact?, questionnaire?, termsAccepted, termsAcceptedAt, payment: { stripePaymentIntentId, amount, currency, status: 'pending'|'paid'|'refunded', receiptUrl? }, createdAt }
```

**`ContactMessage`** — stored in `contact_messages/{docId}`
```ts
{ id, name, email, phone?, category, message, consentToReply, source: 'contact-page', status: 'new'|'read'|'replied'|'closed', userId?, createdAt }
```

**`GalleryImage`** — stored in `gallery/{docId}`
```ts
{ id, imageUrl, description, altText, order, category?: 'cooking-classes'|'personal-gallery', createdAt }
```

**`Instructor`** — stored in `instructors/{docId}`
```ts
{ id, name, gender: 'male'|'female'|'non-binary'|'prefer-not-to-say', expertise: string[], bio, photoUrl?, order, createdAt }
```

### Pricing Convention
- All prices stored as **integers in pence** (e.g. `1500` = £15.00)
- Display with: `(price / 100).toFixed(2)` prefixed with `£`

### Date Convention
- Session dates stored as `YYYY-MM-DD` strings in Firestore
- `createdAt` / `updatedAt` use Firestore `serverTimestamp()` on write
