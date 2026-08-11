# Implementation Plan: Term Session Management

## Overview

This plan implements the term session feature for Blooming Tastebuds, enabling admins to create a single session document representing an entire term of recurring classes with an embedded date-recipe schedule. The implementation follows an incremental approach: types and utility functions first, then admin UI, public display, booking flow modifications, and finally portal integration.

## Tasks

- [x] 1. Define types and create pure utility functions
  - [x] 1.1 Add ScheduleEntry interface and extend Session/Booking types
    - Add `ScheduleEntry` interface to `src/types/index.ts` with fields: `date`, `recipeId`, `recipeName`, `recipePhotoUrl`, `status`
    - Extend the existing `Session` interface with optional term fields: `sessionType`, `termStartDate`, `termEndDate`, `dayOfWeek`, `schedule`
    - Extend the existing `Booking` interface with optional `bookingType` field
    - _Requirements: 1.2, 1.3, 5.3, 9.4_

  - [x] 1.2 Implement term schedule utility functions
    - Create `src/lib/term-schedule-utils.ts` with the following pure functions:
    - `generateSchedule(startDate: string, endDate: string, dayOfWeek: string): ScheduleEntry[]` — generates the term schedule array
    - `validateTermDates(startDate: string, endDate: string, dayOfWeek: string): { valid: boolean; error?: string }` — validates date range and day occurrence
    - `getActiveSessionCount(schedule: ScheduleEntry[]): number` — returns count of entries with status 'active'
    - `insertDate(schedule: ScheduleEntry[], newDate: string): ScheduleEntry[]` — inserts a new entry maintaining chronological order
    - `getNextUpcoming(schedule: ScheduleEntry[], referenceDate: string): ScheduleEntry | null` — finds the next active entry on or after reference date
    - `getDisplaySchedule(schedule: ScheduleEntry[]): Array<{ date: string; recipeName: string; recipePhotoUrl: string }>` — filters active entries, substitutes "Recipe to be announced" for unassigned
    - _Requirements: 1.3, 1.4, 1.5, 1.6, 3.1, 3.2, 3.4, 4.2, 4.3, 4.4, 7.4_

  - [x] 1.3 Write property tests for schedule generation (Property 1)
    - **Property 1: Schedule generation produces valid date occurrences**
    - Test that for any valid start/end/dayOfWeek, generated entries all fall on the correct day, are chronologically sorted, have empty recipe fields and 'active' status
    - Create `src/__tests__/properties/term-schedule-generation.property.test.ts`
    - **Validates: Requirements 1.3, 1.4**

  - [x] 1.4 Write property tests for date validation (Property 2)
    - **Property 2: Invalid date range validation rejects bad inputs**
    - Test that endDate <= startDate returns error, and dayOfWeek not occurring in range returns error
    - Create `src/__tests__/properties/term-date-validation.property.test.ts`
    - **Validates: Requirements 1.5, 1.6**

  - [x] 1.5 Write property tests for active session count (Property 4)
    - **Property 4: Active session count excludes skipped entries**
    - Test that computed count equals entries where status === 'active' and is <= total length
    - Create `src/__tests__/properties/term-active-count.property.test.ts`
    - **Validates: Requirements 3.1, 3.4, 4.3**

  - [x] 1.6 Write property tests for date insertion (Property 5)
    - **Property 5: Make-up date insertion maintains chronological order**
    - Test that inserting any date into a sorted schedule maintains ascending order
    - Create `src/__tests__/properties/term-date-insertion.property.test.ts`
    - **Validates: Requirements 3.2**

  - [x] 1.7 Write property tests for next upcoming date (Property 8)
    - **Property 8: Next upcoming date is the earliest active date in the future**
    - Test that result is the smallest active date >= reference date, or null if none exists
    - Create `src/__tests__/properties/term-next-upcoming.property.test.ts`
    - **Validates: Requirements 7.4**

  - [x] 1.8 Write property tests for public display filtering (Property 6)
    - **Property 6: Public schedule display shows only active entries with correct recipe text**
    - Test that only active entries appear, assigned recipes show name/photo, unassigned show "Recipe to be announced"
    - Create `src/__tests__/properties/term-public-display.property.test.ts`
    - **Validates: Requirements 4.2, 4.3, 4.4**

- [x] 2. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Implement admin panel term session creation
  - [x] 3.1 Create Zod validation schema for term session form
    - Add term session form schema in the admin sessions page (or a colocated file)
    - Include fields: sessionType, termStartDate, termEndDate, dayOfWeek, spotsTotal, price, classId, venueId, instructorId, startTime, endTime, ageMin, ageMax
    - Add cross-field validation: endDate > startDate, dayOfWeek occurs in range (using `validateTermDates`)
    - _Requirements: 1.1, 1.5, 1.6_

  - [x] 3.2 Extend AdminSessions page with term session type toggle and creation form
    - Modify `src/app/admin/sessions/page.tsx` to add a session type selector ('single' | 'term')
    - When 'term' is selected, show term-specific fields (termStartDate, termEndDate, dayOfWeek) instead of single date field
    - On submit, call `generateSchedule()` to create the embedded schedule array
    - Write the term session document to Firestore via client SDK with all required fields including auto-generated schedule
    - Display term sessions in the list with date range instead of single date
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 6.1, 6.5_

  - [x] 3.3 Create TermScheduleEditor component for recipe assignment and schedule management
    - Create `src/app/admin/sessions/TermScheduleEditor.tsx`
    - Display the schedule as an ordered list of dates with current recipe assignment
    - Allow recipe selection per entry from a recipe picker (fetches from `recipes` collection)
    - On recipe select: update that entry's recipeId, recipeName, recipePhotoUrl in Firestore immediately (auto-save)
    - Allow clearing a recipe (reset fields to empty strings)
    - Allow marking entries as 'skipped' (set status to 'skipped')
    - Allow adding a make-up date (inserts new entry using `insertDate()`)
    - Show active session count (using `getActiveSessionCount()`)
    - Visually distinguish skipped dates from active dates
    - Create accompanying `TermScheduleEditor.module.css`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4_

  - [x] 3.4 Write property test for recipe assignment round-trip (Property 3)
    - **Property 3: Recipe assignment round-trip preserves data**
    - Test that assigning a recipe sets all three fields correctly and clearing resets to empty strings
    - Create `src/__tests__/properties/term-recipe-assignment.property.test.ts`
    - **Validates: Requirements 2.2, 2.4**

  - [x] 3.5 Write unit tests for TermScheduleEditor component
    - Create `src/__tests__/components/TermScheduleEditor.test.ts`
    - Test rendering of schedule entries, recipe assignment interaction, skip/add actions
    - _Requirements: 2.1, 2.2, 3.1, 3.2_

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement public term schedule display
  - [x] 5.1 Create TermScheduleView shared component
    - Create `src/components/sessions/TermScheduleView.tsx` and `TermScheduleView.module.css`
    - Accept a `schedule: ScheduleEntry[]` prop
    - Use `getDisplaySchedule()` to filter and format entries
    - Render each active entry showing: date, recipe name (or "Recipe to be announced"), recipe photo (with ChefHat fallback from lucide-react)
    - Display total active session count
    - _Requirements: 4.2, 4.3, 4.4, 4.5_

  - [x] 5.2 Extend SessionBrowser and ClassesClient to display term sessions
    - Modify `src/components/sessions/SessionBrowser.tsx` to handle term sessions
    - Show date range (termStartDate – termEndDate) instead of single date for term sessions
    - Show price, spots available, and "Term" badge for term sessions
    - Add a "View Schedule" expandable section or detail modal that renders `TermScheduleView`
    - Ensure single sessions continue to display as before
    - _Requirements: 4.1, 4.5, 9.2_

  - [x] 5.3 Write unit tests for TermScheduleView component
    - Create `src/__tests__/components/TermScheduleView.test.ts`
    - Test rendering with active/skipped entries, unassigned recipes, fallback photos
    - _Requirements: 4.2, 4.3, 4.4_

- [x] 6. Implement booking flow changes
  - [x] 6.1 Extend BookingContext for term session detection
    - Modify `src/context/BookingContext.tsx` to detect `sessionType: 'term'` from the fetched session
    - Store term-specific data (termStartDate, termEndDate, schedule) in context state
    - Expose `isTermSession` boolean for wizard steps to conditionally render
    - _Requirements: 5.2, 5.6, 9.3_

  - [x] 6.2 Extend payment step to show term booking summary
    - Modify `src/app/book/[sessionId]/payment/page.tsx`
    - When `isTermSession` is true, display term date range and total price instead of single session date
    - Display active session count alongside total price
    - _Requirements: 5.6_

  - [x] 6.3 Extend create-intent API route for term bookings
    - Modify `src/app/api/payments/create-intent/route.ts`
    - When the session has `sessionType: 'term'`, read `session.price` (same pattern as existing) and verify session status is 'open'
    - Check `spotsAvailable > 0` before creating the PaymentIntent
    - Store `bookingType: 'term'` in the booking draft document
    - _Requirements: 8.1, 8.2, 5.1_

  - [x] 6.4 Extend Stripe webhook for term booking processing
    - Modify `src/app/api/webhooks/stripe/route.ts`
    - When booking draft has `bookingType: 'term'`, create booking document with `bookingType: 'term'` field
    - Decrement `spotsAvailable` on the term session within a Firestore transaction
    - If `spotsAvailable` reaches 0 after decrement, set session status to `'full'`
    - If `spotsAvailable` was already <= 0, create booking with `overbooking: true`
    - Use same idempotency pattern (booking doc ID = PaymentIntent ID)
    - Send booking confirmation email including term date range and class name
    - _Requirements: 5.3, 5.4, 5.5, 6.3, 8.3, 8.4_

  - [x] 6.5 Write property test for capacity decrement (Property 7)
    - **Property 7: Booking decrements capacity and auto-transitions to full**
    - Test that spotsAvailable decrements by 1 and status becomes 'full' when it reaches 0
    - Create `src/__tests__/properties/term-capacity-decrement.property.test.ts`
    - **Validates: Requirements 5.4, 6.3**

  - [x] 6.6 Write property test for webhook idempotency (Property 9)
    - **Property 9: Webhook idempotency prevents duplicate bookings**
    - Test that processing same PaymentIntent ID multiple times creates exactly one booking
    - Create `src/__tests__/properties/term-webhook-idempotency.property.test.ts`
    - **Validates: Requirements 8.3**

  - [x] 6.7 Write integration tests for term booking flow
    - Create `src/__tests__/integration/term-booking-flow.test.ts`
    - Test create-intent with term session (reads price server-side, validates status/spots)
    - Test webhook processing (creates booking, decrements spots, handles overbooking)
    - _Requirements: 5.1, 5.3, 5.4, 8.1, 8.2_

- [x] 7. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Implement portal term booking display
  - [x] 8.1 Extend My Classes page for term bookings
    - Modify `src/app/portal/my-classes/page.tsx`
    - Display term bookings with class name, term date range, and a "Term" badge
    - Add "View Schedule" action that shows `TermScheduleView` (reuse shared component)
    - Display next upcoming session date using `getNextUpcoming()` for active term bookings
    - Ensure per-session bookings continue to display unchanged
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [x] 8.2 Write unit tests for portal term booking display
    - Create `src/__tests__/portal/term-my-classes.test.ts`
    - Test term badge rendering, "View Schedule" action, next upcoming date display
    - _Requirements: 7.1, 7.3, 7.4_

- [x] 9. Implement backward compatibility and session type defaulting
  - [x] 9.1 Ensure absent sessionType defaults to single-date behavior
    - Review and verify that all modified components (SessionBrowser, BookingContext, create-intent, webhook, portal) treat absent/undefined `sessionType` as 'single'
    - Add explicit fallback logic where needed: `const type = session.sessionType ?? 'single'`
    - Ensure no term-specific UI is rendered for sessions without `sessionType: 'term'`
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [x] 9.2 Write property test for session type defaulting (Property 10)
    - **Property 10: Absent sessionType defaults to single-date behavior**
    - Test that all system components treat absent sessionType as 'single'
    - Create `src/__tests__/properties/term-session-type-default.property.test.ts`
    - **Validates: Requirements 9.4**

- [x] 10. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties defined in the design document
- Unit tests validate specific UI interactions and edge cases
- Pure utility functions in `src/lib/term-schedule-utils.ts` are the core testable logic — all schedule operations are delegated there
- All admin CRUD uses the Firebase client SDK (existing pattern for admin pages)
- The webhook and create-intent API use the Admin SDK for server-authoritative operations
- Prices remain in pence (integer); dates as YYYY-MM-DD strings

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["1.3", "1.4", "1.5", "1.6", "1.7", "1.8"] },
    { "id": 3, "tasks": ["3.1", "5.1"] },
    { "id": 4, "tasks": ["3.2", "5.2", "6.1"] },
    { "id": 5, "tasks": ["3.3", "5.3", "6.2"] },
    { "id": 6, "tasks": ["3.4", "3.5", "6.3"] },
    { "id": 7, "tasks": ["6.4"] },
    { "id": 8, "tasks": ["6.5", "6.6", "6.7", "8.1"] },
    { "id": 9, "tasks": ["8.2", "9.1"] },
    { "id": 10, "tasks": ["9.2"] }
  ]
}
```
