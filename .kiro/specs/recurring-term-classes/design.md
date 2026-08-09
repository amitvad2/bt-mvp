# Design Document: Recurring Term / Programme Classes

## Overview

This feature extends the Blooming Tastebuds class system with a `commitment: 'term'` option on the existing `BTClass` type. A Term / Programme Class is a multi-session offering where a participant pays one fixed package price to attend all included sessions within a defined programme period. The design reuses the existing `classes`, `sessions`, and `bookings` Firestore collections — no new collections are introduced.

A programme may be:
- **Recurring on selected weekdays** (traditional term: "Every Mon & Wed, 6 Jan – 28 Mar")
- **Consecutive over several days** (holiday workshop: "5-Day Workshop, 24–28 Aug")
- **Composed of explicitly created session dates** (irregular schedule)

Key design goals:
- **Backward compatibility**: Per-session classes (`commitment: 'perSession'`) and existing term classes continue to work identically.
- **Minimal schema divergence**: Programme-specific fields are optional extensions on the existing `BTClass` document. `commitment: 'term'` persisted value is unchanged.
- **Flexible scheduling**: `recurrenceDays` is optional; child sessions are the authoritative operational schedule.
- **Recipe + skills visibility**: Sessions carry recipe assignments, photos, and skills/learning outcomes displayed to participants in the programme schedule.
- **Single payment**: One Stripe PaymentIntent covers the entire programme. The webhook creates one booking document referencing the class (not individual sessions).
- **Guest access**: Programme bookings must support both authenticated and guest checkout paths.
- **Register integration**: Session Register must resolve programme participants for each child session regardless of booking origin.

## Architecture

```mermaid
flowchart TD
    subgraph Admin
        A[Admin Class Form] -->|commitment selector| B{Term or Per-Session?}
        B -->|term| C[Save BTClass with term fields]
        B -->|perSession| D[Save BTClass as before]
        C --> E[Create Sessions for recipe planning]
    end

    subgraph Public
        F[Classes Page / Find a Class] -->|reads classes + sessions| G{commitment?}
        G -->|term| H[Display Term Card with schedule]
        G -->|perSession| I[Display session cards as before]
    end

    subgraph Booking
        H -->|Book Term| J[/book-term/classId/ wizard]
        J --> K[POST /api/payments/create-intent]
        K -->|reads class.termPrice| L[Stripe PaymentIntent]
        L --> M[Webhook: payment_intent.succeeded]
        M -->|bookingType=term| N[Create term booking + decrement class.spotsAvailable]
    end

    subgraph Portal
        O[My Classes] -->|queries bookings| P{bookingType?}
        P -->|term| Q[Show term card with recurring schedule + recipe list]
        P -->|undefined/perSession| R[Show per-session card as before]
    end
```

## Components and Interfaces

### 1. Admin Class Form (`src/app/admin/classes/`)

The existing class creation/edit form gains a **commitment selector** (radio group or toggle) that conditionally reveals term-specific fields.

| Component | Change |
|-----------|--------|
| `ClassForm.tsx` (or equivalent) | Add `commitment` radio: "Per Session" / "Term". Conditionally render `TermFields` sub-component. |
| `TermFields.tsx` (new) | Inputs for `termStartDate`, `termEndDate`, `termPrice`, `recurrenceDays` multi-select (Mon–Sun checkboxes). |

**Zod schema extension** (`classFormSchema`):
- `commitment`: `z.enum(['perSession', 'term'])`
- When `commitment === 'term'`: require `termStartDate`, `termEndDate`, `termPrice`, `recurrenceDays`
- Validation: `termEndDate > termStartDate`, `termPrice > 0`, `recurrenceDays.length >= 1`

### 2. Admin Sessions Page (`src/app/admin/sessions/`)

Existing session CRUD page. No structural changes needed — sessions are created under any class. The sessions page already links sessions to a `classId`. For term classes, the session's `spotsAvailable` and `status` are informational only (not used for booking).

The session list view for a term class will display a "Recipe Schedule" label and show recipe name + photo alongside each session date.

### 3. Public Display Components

#### 3a. Term Class Card (`TermClassCard.tsx`)

A new card component rendered by `ClassesClient.tsx` when the class has `commitment === 'term'`. Displays:
- Class name, "Term" badge
- Recurring days formatted (e.g. "Every Mon, Wed, Fri")
- Term period (e.g. "6 Jan – 28 Mar 2025")
- Time slot (e.g. "3:30–4:30 pm")
- Venue
- Price (e.g. "£120.00 for the term")
- Spots remaining or "Full" state
- "Book Now" or "View Schedule" CTA

#### 3b. Term Class Detail / Schedule View

When a parent clicks on a term class (or a dedicated detail route), they see the **full session schedule with recipe assignments**:
- Each row: date, day of week, recipe name, recipe photo thumbnail
- This reads from the `sessions` sub-collection where `classId === termClass.id`, ordered by `date`

Implementation options:
1. **Inline expansion** on the classes page (accordion or modal)
2. **Dedicated route** `/classes/[classId]` (new page)

Recommendation: Use an **expandable detail section** or modal triggered from the term class card. This avoids a new route and keeps the browsing experience unified.

### 4. Term Booking Wizard (`src/app/book-term/[classId]/`)

A new dynamic route parallel to the existing `/book/[sessionId]/` wizard. The term booking wizard has the same steps but is keyed by `classId` instead of `sessionId`.

| Route | Step | Notes |
|-------|------|-------|
| `/book-term/[classId]/student/` | Step 1 | Select student or 'self' |
| `/book-term/[classId]/medical/` | Step 2 | Medical info + emergency contact |
| `/book-term/[classId]/questionnaire/` | Step 3 | Dietary (skipped for youngAdultWeekend) |
| `/book-term/[classId]/terms/` | Step 4 | T&Cs acceptance |
| `/book-term/[classId]/payment/` | Step 5 | Stripe Elements — uses `termPrice` |
| `/book-term/[classId]/confirmation/` | Step 6 | Polls for booking doc with `classId` |

**`TermBookingContext`** — a new context provider (following the same pattern as `BookingContext`) that:
- Fetches the `BTClass` document by `classId`
- Validates `commitment === 'term'`, `spotsAvailable > 0`, and `termEndDate >= today`
- Stores wizard state in `sessionStorage` under `booking_term_<classId>`

### 5. Payment Intent for Term Bookings

`POST /api/payments/create-intent` gains a **term code path** triggered when the request body includes `classId` and `bookingType: 'term'` (no `sessionId`).

```
Term path:
  1. Verify auth token
  2. Read class doc from Firestore → validate commitment === 'term', spotsAvailable > 0, termEndDate >= today
  3. Use class.termPrice as amount
  4. Create Stripe PaymentIntent
  5. Write booking_drafts/{piId} with bookingType: 'term', classId, className, recurrenceDays, termStartDate, termEndDate, etc.
```

### 6. Webhook: Term Booking Handler

Inside `handlePaymentIntentSucceeded`, after checking `draft.bookingType`:

```
if (draft.bookingType === 'term') {
    await handleTermPaymentSucceeded(paymentIntent, draft);
    return;
}
```

`handleTermPaymentSucceeded`:
1. Idempotency check: does `bookings/{piId}` exist?
2. Read `classes/{classId}` inside transaction
3. Check `spotsAvailable > 0` (overbooking flag if not)
4. Create booking document with `bookingType: 'term'`, `classId`, term fields
5. Decrement `classes/{classId}.spotsAvailable` by 1
6. Send term confirmation email
7. Delete draft

### 7. Portal: My Classes

`MyClassesClient.tsx` reads bookings for the current user. For bookings with `bookingType === 'term'`:
- Display a term-specific card showing class name, recurring days, term period, time, venue
- Optionally fetch sessions for this class to show the recipe schedule
- Cancel action: updates booking status + increments `classes/{classId}.spotsAvailable`

### 8. Admin: Bookings & Class Detail

- Bookings list: term bookings show a "Term" badge, linking to the class rather than a session.
- Class detail view: when viewing a term class, show `spotsAvailable` / `maxSize` and a list of enrolled students (queried from `bookings` where `classId === thisClass.id && bookingType === 'term' && status === 'confirmed'`).

## Data Models

### BTClass (Extended)

```typescript
export interface BTClass {
    id: string;
    type: string;                      // 'kidsAfterSchool' | 'youngAdultWeekend' | custom slug
    name: string;
    dayOfWeek: string;                 // Primary day (retained for per-session; informational for term)
    startTime: string;
    endTime: string;
    ageMin: number;
    ageMax: number;
    maxSize: number;
    instructor: string;
    venueId: string;
    venueName?: string;
    commitment: 'perSession' | 'term';
    price: number;                     // Per-session price in pence (used when commitment === 'perSession')
    // --- Term-specific fields (present only when commitment === 'term') ---
    termStartDate?: string;            // YYYY-MM-DD
    termEndDate?: string;              // YYYY-MM-DD
    termPrice?: number;                // Total term price in pence
    recurrenceDays?: string[];         // e.g. ['Monday', 'Wednesday', 'Friday']
    spotsAvailable?: number;           // Decremented on term booking; initialised to maxSize
    createdAt: any;
}
```

### Session (Unchanged structure — behaviour change only)

Sessions under term classes:
- Created by admin for recipe planning
- `spotsAvailable` / `status` fields are informational (not used for booking gating)
- `recipeId` and `recipeName` carry the assigned recipe
- Session's `price` field is irrelevant for term classes (term price is on the class)

The `Recipe` type already has `photoUrl?` — this is displayed in the schedule view.

### Booking (Extended)

```typescript
export interface Booking {
    // ... existing fields ...

    // --- Term booking fields (present when bookingType === 'term') ---
    bookingType?: 'term';              // Absent or undefined = per-session (backward compat)
    classId?: string;                  // Reference to the term class
    recurrenceDays?: string[];         // Denormalized from class for portal display
    termStartDate?: string;            // YYYY-MM-DD
    termEndDate?: string;              // YYYY-MM-DD
}
```

For term bookings:
- `sessionId` is **not set** (or set to empty string for schema compat)
- `sessionDate` is **not set**
- `classId` is the term class document ID
- `className`, `venueName`, `startTime`, `endTime` are denormalized from the class

### Booking Draft (Term variant)

```typescript
// booking_drafts/{paymentIntentId} for term bookings
{
    stripePaymentIntentId: string;
    paymentStatus: 'pending' | 'failed';
    bookingType: 'term';
    classId: string;
    className: string;
    classType: string;
    venueName: string;
    startTime: string;
    endTime: string;
    recurrenceDays: string[];
    termStartDate: string;
    termEndDate: string;
    bookedByUid: string;
    bookedByName: string;
    bookedByEmail: string;
    studentId: string | null;
    studentName: string;
    medicalInfo: MedicalInfo | null;
    emergencyContact: EmergencyContact | null;
    questionnaire: Questionnaire | null;
    termsAccepted: boolean;
    createdAt: FieldValue;
}
```

### Recipe (Existing — no changes)

```typescript
export interface Recipe {
    id: string;
    name: string;
    description: string;
    photoUrl?: string;   // Used in term class schedule display
    createdAt: any;
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Term field visibility is controlled by commitment value

*For any* class form state, term-specific fields (termStartDate, termEndDate, termPrice, recurrenceDays) SHALL be visible if and only if the commitment value is 'term'.

**Validates: Requirements 1.2, 1.3**

### Property 2: Term class validation rejects invalid configurations

*For any* term class form submission where termEndDate <= termStartDate, OR termPrice <= 0, OR recurrenceDays is empty, the submission SHALL be rejected and the class document SHALL NOT be created.

**Validates: Requirements 1.5, 1.6, 1.7**

### Property 3: Term sessions are not individually bookable

*For any* session belonging to a class with `commitment === 'term'`, navigating to `/book/[sessionId]` SHALL be blocked and the session SHALL NOT appear as a separately bookable item on public pages.

**Validates: Requirements 2.2, 2.3, 2.4**

### Property 4: Term class display conditions

*For any* term class, it SHALL be displayed on public pages if and only if `spotsAvailable > 0` AND the current date is on or before `termEndDate`.

**Validates: Requirements 3.1, 3.5, 7.1, 7.3**

### Property 5: Term booking uses class-level price

*For any* term booking payment, the Stripe PaymentIntent amount SHALL equal the `termPrice` field from the BTClass document (server-authoritative, never from client).

**Validates: Requirements 4.1**

### Property 6: Term booking creates exactly one booking document

*For any* successful term payment, the system SHALL create exactly one booking document with `bookingType: 'term'` and `classId` referencing the term class — never individual booking documents per session day.

**Validates: Requirements 4.2, 4.5**

### Property 7: Spots decrement on term booking

*For any* successful term booking, the `spotsAvailable` count on the BTClass document SHALL be decremented by exactly one within a transaction.

**Validates: Requirements 4.4**

### Property 8: Spots increment on term cancellation

*For any* term booking cancellation, the `spotsAvailable` count on the BTClass document SHALL be incremented by exactly one.

**Validates: Requirements 5.3, 6.3**

### Property 9: Backward compatibility — per-session bookings unchanged

*For any* class with `commitment === 'perSession'`, the booking flow SHALL use the session-level price, create per-session booking documents, and display individual sessions as bookable — identically to the pre-feature behaviour.

**Validates: Requirements 9.1, 9.2, 9.3, 9.4**

### Property 10: Term booking confirmation email contains schedule

*For any* term booking confirmation email, the email body SHALL contain the class name, recurrenceDays as human-readable text, termStartDate, termEndDate, time slot, venue, and payment amount.

**Validates: Requirements 8.1, 8.2**

### Property 11: Term class schedule displays recipe assignments

*For any* term class detail view, the system SHALL display all sessions belonging to that class ordered by date, showing for each: the date, recipe name, and recipe photo.

**Validates: Requirements 2.5**

## Error Handling

| Scenario | Handler | Behaviour |
|----------|---------|-----------|
| Admin submits invalid term form | Client-side Zod validation | Show inline errors, prevent submission |
| User attempts to book expired term | `create-intent` API | Return 400 "Term has ended" |
| User attempts to book full term class | `create-intent` API | Return 400 "Class is full" |
| Webhook fires but class has 0 spots | Webhook transaction | Create booking with `overbooking: true` flag |
| Webhook fires but class doc not found | Webhook handler | Throw error → Stripe retries |
| Draft not found at webhook time | Webhook handler | Log error, return (no retry) |
| Term booking navigation to `/book/[sessionId]` for term session | Middleware or page guard | Redirect to classes page with error toast |
| Stripe PaymentIntent created but draft write fails | `create-intent` | Cancel PaymentIntent, return 500 |
| Cancellation fails to increment spots | Portal cancel handler | Log error; booking still marked cancelled |

## Testing Strategy

### Unit Tests (Vitest + Testing Library)

- **Admin form**: Validate commitment toggle shows/hides term fields; Zod schema rejects invalid term configs
- **Public display**: TermClassCard renders correct badge, formatted price, recurrence description
- **Portal display**: Term booking card shows schedule, cancel button present
- **Webhook handler**: Term booking creation logic with mocked Firestore transactions
- **Email**: Term confirmation email includes all required fields

### Property-Based Tests (Vitest + fast-check)

Property-based testing is applicable here because:
- Form validation logic is a pure function with diverse input space
- Price formatting and date logic have universal properties
- Booking type routing is deterministic based on input fields

**Configuration**: Minimum 100 iterations per property test.

**Library**: `fast-check` (already available in the project's test dependencies).

**Tag format**: `Feature: recurring-term-classes, Property {N}: {title}`

Tests to implement:
1. Term field visibility controlled by commitment (Property 1)
2. Term validation rejects all invalid configurations (Property 2)
3. Term sessions never appear as bookable (Property 3)
4. Term class display conditions hold for all date/spots combinations (Property 4)
5. Payment amount always equals server-side termPrice (Property 5)
6. One booking document per term payment (Property 6)
7. Spots decrement/increment atomicity (Properties 7, 8)
8. Per-session path unchanged regardless of term feature presence (Property 9)
9. Email body contains all schedule fields (Property 10)
10. Schedule view shows all sessions with recipes ordered by date (Property 11)

### Integration Tests

- Full booking flow: create term class → book → webhook → verify booking doc
- Cancellation flow: cancel term booking → verify spots incremented
- Expired term class: verify not displayed, booking rejected


## Required Design Changes (Post-Implementation Flexibility Enhancement)

This section documents design changes needed to support the broader programme model (holiday workshops, consecutive-day courses) while preserving all existing implemented behaviour.

### D1: Make `recurrenceDays` Optional in Schema

| Aspect | Detail |
|--------|--------|
| **Current Design** | `classFormSchema` requires `recurrenceDays.length >= 1` when `commitment === 'term'` |
| **Limitation** | Cannot create consecutive-day programmes (e.g. 24–28 Aug workshop) without selecting recurring days |
| **Recommended Change** | Remove the `recurrenceDays.length >= 1` validation from `superRefine`. Keep `recurrenceDays` as an optional field. Display logic falls back to child sessions when `recurrenceDays` is empty. |
| **Migration Impact** | None — existing documents with populated `recurrenceDays` remain valid |
| **Backward Compatibility** | Full — relaxing a validation only allows previously-invalid states; never breaks existing data |

### D2: Add `skills` Field to Session Type

| Aspect | Detail |
|--------|--------|
| **Current Design** | `Session` interface has no `skills` field |
| **Limitation** | Cannot store per-session learning outcomes (e.g. "chopping, mixing, creative plating") |
| **Recommended Change** | Add `skills?: string[]` to the `Session` TypeScript interface. Add a skills input (tag/chip UI) to the admin session form. Display skills in `TermClassScheduleModal` alongside recipe. |
| **Migration Impact** | None — new optional field; no existing documents affected |
| **Backward Compatibility** | Full — undefined/absent `skills` renders as "no skills to display" |

### D3: Guest Programme Checkout

| Aspect | Detail |
|--------|--------|
| **Current Design** | `/book-term/[classId]` requires `bt_session` cookie (authentication). No express/guest route for programme bookings. |
| **Limitation** | Parents without accounts cannot book programme classes. Holiday workshop bookings from social channels are blocked. |
| **Recommended Change** | Create `/express-book-term/[classId]` route mirroring the existing `/express-booking/[sessionId]` pattern. The route collects guest contact, child details, medical info, consents, and processes payment against `termPrice`. Webhook creates a term booking with `bookingMode: 'guest'` and no `bookedByUid`. |
| **Migration Impact** | New route addition only — no changes to existing routes or data |
| **Backward Compatibility** | Full — new route, does not affect authenticated flow |

### D4: Session Register Programme Participant Resolution

| Aspect | Detail |
|--------|--------|
| **Current Design** | `handleOpenRegister()` queries `where('sessionId', '==', session.id)`. Term bookings have `sessionId: ''` so they never appear. |
| **Limitation** | Programme participants are invisible in the session register for child sessions. |
| **Recommended Change** | In `handleOpenRegister`, detect if the session belongs to a term class. If so, ALSO query `where('classId', '==', session.classId) && where('bookingType', '==', 'term') && where('status', '==', 'confirmed')`. Merge both result sets (per-session + programme bookings) into the register display. |
| **Migration Impact** | Code change only — no data migration needed |
| **Backward Compatibility** | Full — adds results, never removes existing ones |

### D5: Flexible Public Display for Non-Recurring Programmes

| Aspect | Detail |
|--------|--------|
| **Current Design** | `TermClassCard` always calls `formatRecurrenceDays(recurrenceDays)` which returns empty string for `[]`. `TermClassScheduleModal` always shows recurrence text. |
| **Limitation** | Cards for consecutive-day programmes show no schedule description — just blank space where recurrence text would be. |
| **Recommended Change** | Add fallback logic: if `recurrenceDays` is empty/absent but child sessions exist, display "{N}-Day Programme, {startDate} – {endDate}" instead. The utility `formatProgrammeDescription(termClass, sessionCount?)` can handle both cases. |
| **Migration Impact** | Code change only — display logic |
| **Backward Compatibility** | Full — existing term classes with `recurrenceDays` populated continue to display identically |

### D6: Session-Level Time Override

| Aspect | Detail |
|--------|--------|
| **Current Design** | Admin session form does not expose `startTime`/`endTime` inputs. Values are always inherited from `parentClass.startTime`/`parentClass.endTime` during `handleSubmit`. |
| **Limitation** | All sessions in a programme must have the same time. Cannot model programmes where one day runs at a different time. |
| **Recommended Change** | Add optional `startTime` and `endTime` fields to the session form (pre-filled from parent class, editable). If blank, inherit from class. If set, override for that session. The `Session` type already has `startTime`/`endTime` fields — the data model supports it; only the admin form needs updating. |
| **Migration Impact** | None — existing sessions already have class-inherited times stored on the document |
| **Backward Compatibility** | Full — default behaviour unchanged; override is opt-in |

### D7: Package Price Label Clarity

| Aspect | Detail |
|--------|--------|
| **Current Design** | Payment page shows "Total Amount (Full Term)". TermClassCard uses `formatTermPrice()` → "£120.00 for the term". |
| **Limitation** | Wording assumes "term" — less clear for holiday workshops. |
| **Recommended Change** | Update `formatTermPrice()` or add a variant to support "£60.00 for the programme" / "£60.00 (package price)". Admin form label should say "Package Price for Full Programme (pence)" rather than "Term Price (Pence)". |
| **Migration Impact** | None — UI label change only |
| **Backward Compatibility** | Full — cosmetic text change |

### Data Model Extensions

#### Session (additional field)

```typescript
export interface Session {
    // ... existing fields unchanged ...
    skills?: string[];  // e.g. ['chopping', 'mixing', 'creative plating']
}
```

#### BTClass (no schema change — behaviour change only)

`recurrenceDays` remains `string[] | undefined` on the type. The change is in validation: the Zod schema no longer requires `recurrenceDays.length >= 1` when `commitment === 'term'`.

#### Booking (no change needed)

The existing term booking model already supports guest bookings via the `bookingMode: 'guest'` pattern used by per-session guest bookings. The `bookedByUid` is already optional in practice for guest flows.
