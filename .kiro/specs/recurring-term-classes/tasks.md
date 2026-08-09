# Implementation Plan: Recurring Term Classes

## Overview

This plan implements the `commitment: 'term'` extension to the BTClass system. Work is structured to build foundational types first, then admin creation, public display, booking flow, portal/admin views, and finally testing. Each task builds incrementally on previous steps — no orphaned code.

## Tasks

- [x] 1. Extend type definitions and shared utilities
  - [x] 1.1 Extend BTClass and Booking types in `src/types/index.ts`
    - Add `commitment: 'perSession' | 'term'` to BTClass interface
    - Add optional term fields: `termStartDate`, `termEndDate`, `termPrice`, `recurrenceDays`, `spotsAvailable`
    - Add `bookingType?: 'term'` and `classId?: string` fields to Booking interface
    - Add `recurrenceDays?: string[]`, `termStartDate?: string`, `termEndDate?: string` to Booking
    - _Requirements: 1.4, 4.2, 4.3_

  - [x] 1.2 Create term utility functions in `src/lib/term-utils.ts`
    - `formatRecurrenceDays(days: string[]): string` — e.g. "Every Mon, Wed, Fri"
    - `formatTermPrice(pence: number): string` — e.g. "£120.00 for the term"
    - `isTermClassActive(termEndDate: string, spotsAvailable: number): boolean`
    - `isTermClassExpired(termEndDate: string): boolean`
    - _Requirements: 3.3, 3.4, 7.1_

- [x] 2. Admin class form — commitment selector and term fields
  - [x] 2.1 Add commitment selector and TermFields sub-component to admin class form
    - Add radio group for `commitment`: "Per Session" / "Term" to the existing class form
    - Create `TermFields.tsx` sub-component with inputs for termStartDate, termEndDate, termPrice, recurrenceDays (day checkboxes)
    - Conditionally render TermFields when commitment === 'term'
    - Hide term fields and show existing per-session fields when commitment === 'perSession'
    - _Requirements: 1.1, 1.2, 1.3_

  - [x] 2.2 Extend class form Zod schema with term validation
    - Add `commitment` field to the class form schema with discriminated union or refinement
    - Validate termEndDate > termStartDate, termPrice > 0, recurrenceDays.length >= 1 when commitment === 'term'
    - Ensure form submission saves `spotsAvailable` equal to `maxSize` for new term classes
    - Ensure per-session classes save with `commitment: 'perSession'` and no term fields
    - _Requirements: 1.4, 1.5, 1.6, 1.7, 1.8_

  - [x] 2.3 Write property test: term field visibility controlled by commitment value
    - **Property 1: Term field visibility is controlled by commitment value**
    - **Validates: Requirements 1.2, 1.3**

  - [x] 2.4 Write property test: term class validation rejects invalid configurations
    - **Property 2: Term class validation rejects invalid configurations**
    - **Validates: Requirements 1.5, 1.6, 1.7**

- [x] 3. Block per-session booking for term class sessions
  - [x] 3.1 Update middleware and booking page guard for term sessions
    - Update `src/middleware.ts` to check if a session belongs to a term class and redirect to `/classes` with an error
    - Alternatively, add a client-side guard in the booking wizard layout that reads the session's parent class and blocks if `commitment === 'term'`
    - _Requirements: 2.2, 2.4_

  - [x] 3.2 Filter term sessions from public bookable listings
    - Update `ClassesClient.tsx` to exclude individual sessions from term classes in the bookable session list
    - Sessions with a parent class where `commitment === 'term'` should not show "Book Now" or appear as standalone bookable items
    - _Requirements: 2.3_

  - [x] 3.3 Write property test: term sessions are not individually bookable
    - **Property 3: Term sessions are not individually bookable**
    - **Validates: Requirements 2.2, 2.3, 2.4**

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Public display — TermClassCard and term class detail view
  - [x] 5.1 Create TermClassCard component
    - Create `src/components/sessions/TermClassCard.tsx` with CSS Module
    - Display: class name, "Term" badge, recurrence days (formatted), term period, time slot, venue, term price, spots remaining or "Full" state, "Book Now" / "View Schedule" CTA
    - Use `formatRecurrenceDays()` and `formatTermPrice()` from term-utils
    - Disable booking CTA and show "Full" when spotsAvailable === 0
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x] 5.2 Integrate TermClassCard into ClassesClient and portal Find a Class
    - Update `ClassesClient.tsx` to render TermClassCard for classes where `commitment === 'term'`
    - Filter: only show term classes where `spotsAvailable > 0` AND current date <= termEndDate
    - Update portal `find-class` page similarly
    - _Requirements: 3.1, 7.1, 7.3_

  - [x] 5.3 Create term class detail/schedule view with recipe photos
    - Create a modal or expandable section triggered from TermClassCard's "View Schedule" button
    - Fetch sessions where `classId === termClass.id`, ordered by date
    - Display each session: date, day of week, recipe name, recipe photo thumbnail (or "To be announced" placeholder)
    - Show consistent photo sizing with alt text for accessibility
    - Also display class name, recurrenceDays, term period, time, venue, termPrice, and booking CTA
    - _Requirements: 10.2, 10.3, 10.4, 10.5, 10.7_

  - [x] 5.4 Write property test: term class display conditions
    - **Property 4: Term class display conditions**
    - **Validates: Requirements 3.1, 3.5, 7.1, 7.3**

  - [x] 5.5 Write property test: term class schedule displays recipe assignments
    - **Property 11: Term class schedule displays recipe assignments**
    - **Validates: Requirements 10.2, 10.3**

- [x] 6. Term booking wizard
  - [x] 6.1 Create TermBookingContext provider
    - Create `src/context/TermBookingContext.tsx` following the same pattern as BookingContext
    - Fetch BTClass document by classId, validate `commitment === 'term'`, `spotsAvailable > 0`, `termEndDate >= today`
    - Store wizard state in sessionStorage under key `booking_term_<classId>`
    - Expose `useTermBooking()` hook
    - _Requirements: 4.1, 7.2_

  - [x] 6.2 Create term booking wizard route at `/book-term/[classId]/`
    - Create `src/app/book-term/[classId]/layout.tsx` — mounts TermBookingProvider, progress stepper
    - Create step pages: `student/`, `medical/`, `questionnaire/`, `terms/`, `payment/`, `confirmation/`
    - Reuse existing step components where possible, adapting to use TermBookingContext
    - Payment step uses `termPrice` from the class document
    - Confirmation step polls for booking doc with matching classId
    - _Requirements: 4.1, 4.2_

  - [x] 6.3 Update middleware for `/book-term/*` route protection
    - Add `/book-term/*` to the middleware's authenticated route patterns
    - Ensure `bt_session` cookie check applies to term booking routes
    - _Requirements: 4.1_

- [x] 7. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Extend create-intent API for term bookings
  - [x] 8.1 Add term booking path to `POST /api/payments/create-intent`
    - Detect term booking when request body includes `classId` and `bookingType: 'term'` (no sessionId)
    - Read class doc from Firestore, validate `commitment === 'term'`, `spotsAvailable > 0`, `termEndDate >= today`
    - Use `class.termPrice` as PaymentIntent amount (server-authoritative)
    - Write `booking_drafts/{piId}` with `bookingType: 'term'`, classId, className, recurrenceDays, termStartDate, termEndDate, and all wizard fields
    - Return 400 for expired term or full class
    - _Requirements: 4.1, 4.6, 7.2_

  - [x] 8.2 Write property test: term booking uses class-level price
    - **Property 5: Term booking uses class-level price**
    - **Validates: Requirements 4.1**

- [x] 9. Extend Stripe webhook for term booking creation
  - [x] 9.1 Add term booking handler to webhook `payment_intent.succeeded`
    - Check `draft.bookingType === 'term'` and route to `handleTermPaymentSucceeded`
    - Implement `handleTermPaymentSucceeded`: idempotency check, read class in transaction, check spotsAvailable, create booking doc with `bookingType: 'term'` and classId, decrement spotsAvailable, delete draft
    - Handle overbooking edge case (flag `overbooking: true` if spots already 0)
    - _Requirements: 4.2, 4.3, 4.4, 4.5_

  - [x] 9.2 Write property test: term booking creates exactly one booking document
    - **Property 6: Term booking creates exactly one booking document**
    - **Validates: Requirements 4.2, 4.5**

  - [x] 9.3 Write property test: spots decrement on term booking
    - **Property 7: Spots decrement on term booking**
    - **Validates: Requirements 4.4**

- [x] 10. Term booking confirmation email
  - [x] 10.1 Create term confirmation email template in webhook handler
    - Build inline HTML email with: class name, recurrenceDays (human-readable), termStartDate, termEndDate, time slot, venue, payment amount
    - Include recurring schedule description (e.g. "Every Mon, Wed, Fri — 3:30–4:30 pm, from 6 Jan 2025 to 28 Mar 2025")
    - Send via Resend using existing email mechanism in the webhook
    - _Requirements: 8.1, 8.2, 8.3_

  - [x] 10.2 Write property test: term booking confirmation email contains schedule
    - **Property 10: Term booking confirmation email contains schedule**
    - **Validates: Requirements 8.1, 8.2**

- [x] 11. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Portal My Classes for term bookings
  - [x] 12.1 Update portal My Classes to display term bookings
    - Update `MyClassesClient.tsx` to detect `bookingType === 'term'` on booking documents
    - Display term-specific card: class name, recurrenceDays, term period, time slot, venue
    - Show recurring schedule description (e.g. "Every Mon, Wed, Fri — 3:30–4:30 pm, 6 Jan – 28 Mar 2025")
    - Add cancel button that updates status to 'cancelled' and increments `spotsAvailable`
    - _Requirements: 5.1, 5.2, 5.3_

  - [x] 12.2 Write property test: spots increment on term cancellation
    - **Property 8: Spots increment on term cancellation**
    - **Validates: Requirements 5.3, 6.3**

- [x] 13. Admin bookings and class detail for term bookings
  - [x] 13.1 Update admin bookings page for term bookings
    - Show "Term" badge on term bookings in the bookings list
    - Display classId/className link instead of sessionId for term bookings
    - Support cancel action that updates booking status and increments spotsAvailable
    - _Requirements: 6.1, 6.3_

  - [x] 13.2 Update admin class detail view for term classes
    - Show `spotsAvailable` / `maxSize` for term classes
    - Query and display list of enrolled students from bookings where `classId === thisClass.id && bookingType === 'term' && status === 'confirmed'`
    - _Requirements: 6.2_

- [x] 14. Admin sessions display for term classes
  - [x] 14.1 Update admin sessions page for term class recipe schedule display
    - When viewing sessions under a term class, show recipe name, recipe photo, and date
    - Ensure recipe assignment stores recipeId, recipeName, and recipePhotoUrl on session doc
    - _Requirements: 2.1, 2.5, 2.6, 10.1_

- [x] 15. Backward compatibility and per-session path verification
  - [x] 15.1 Write property test: per-session bookings unchanged
    - **Property 9: Backward compatibility — per-session bookings unchanged**
    - **Validates: Requirements 9.1, 9.2, 9.3, 9.4**

  - [x] 15.2 Write integration tests for term booking flows
    - Full booking flow: create term class → book → webhook → verify booking doc created with correct fields
    - Cancellation flow: cancel term booking → verify spotsAvailable incremented
    - Expired term class: verify not displayed, booking rejected with 400
    - _Requirements: 4.2, 4.4, 5.3, 7.1, 7.2_

- [x] 16. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- All prices are in pence (integers) — never trust client-supplied amounts
- The term booking wizard reuses step logic from the existing per-session wizard where possible
- `spotsAvailable` is managed transactionally to prevent race conditions
- Backward compatibility is critical — existing per-session flows must remain unchanged

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1", "2.2", "3.1", "3.2"] },
    { "id": 2, "tasks": ["2.3", "2.4", "3.3", "5.1"] },
    { "id": 3, "tasks": ["5.2", "5.3", "6.1"] },
    { "id": 4, "tasks": ["5.4", "5.5", "6.2", "6.3"] },
    { "id": 5, "tasks": ["8.1"] },
    { "id": 6, "tasks": ["8.2", "9.1"] },
    { "id": 7, "tasks": ["9.2", "9.3", "10.1"] },
    { "id": 8, "tasks": ["10.2", "12.1"] },
    { "id": 9, "tasks": ["12.2", "13.1", "13.2", "14.1"] },
    { "id": 10, "tasks": ["15.1", "15.2"] }
  ]
}
```


---

## Post-Implementation Flexibility Enhancements

These tasks address gaps identified when broadening the existing term classes feature to support flexible multi-session programmes (holiday workshops, consecutive-day courses). All previously completed tasks remain valid and unchanged.

- [ ] 17. Make `recurrenceDays` optional for explicit-date programmes
  - [ ] 17.1 Update class form Zod schema to make `recurrenceDays` optional
    - Remove the `recurrenceDays.length >= 1` validation from `superRefine` in `src/app/admin/classes/schema.ts`
    - Keep `recurrenceDays` as an optional field (already typed as `z.array(z.string()).optional()`)
    - Update TermFields component to show recurrenceDays as optional with helper text: "Leave blank for consecutive-day or explicit-date programmes"
    - _Requirements: 1.7, 11.9_

  - [ ] 17.2 Update TermClassCard display for non-recurring programmes
    - When `recurrenceDays` is empty/absent, display "{N}-Day Programme, {startDate} – {endDate}" instead of empty recurrence text
    - Add a utility function `formatProgrammeDescription(termClass, sessionCount?)` in `src/lib/term-utils.ts`
    - Update `TermClassCard.tsx` to use fallback display logic
    - _Requirements: 3.5, 11.9_

  - [ ] 17.3 Update TermClassScheduleModal for non-recurring programmes
    - When `recurrenceDays` is empty, hide the recurrence text line in the modal header
    - Display the programme period and session count instead
    - _Requirements: 3.5, 10.9_

  - [ ] 17.4 Update property tests for optional recurrenceDays
    - Update Property 2 test to verify that empty `recurrenceDays` is accepted when `commitment === 'term'`
    - Add new property test: programmes with empty recurrenceDays still display correctly
    - _Requirements: 1.7, 11.8, 11.9_

- [ ] 18. Add session-level skills support
  - [ ] 18.1 Add `skills` field to Session type
    - Add `skills?: string[]` to the `Session` interface in `src/types/index.ts`
    - _Requirements: 2.7_

  - [ ] 18.2 Add skills input to admin session form
    - Add a tag/chip input for skills in the admin session create/edit modal
    - Allow adding multiple skills as free-text strings (e.g. "chopping", "mixing", "creative plating")
    - Persist `skills` array on the session document during save
    - _Requirements: 2.8_

  - [ ] 18.3 Display skills in TermClassScheduleModal
    - For each session row in the schedule, display skills as a comma-separated list or chip tags below the recipe name
    - Only show skills where the array is non-empty; omit the line when skills are not assigned
    - _Requirements: 10.8_

  - [ ] 18.4 Display skills in admin sessions page
    - Show skills alongside recipe name and photo in the sessions table for term class sessions
    - _Requirements: 2.5, 6.4_

- [ ] 19. Guest programme checkout
  - [ ] 19.1 Create express-book-term route at `/express-book-term/[classId]/`
    - Create the route structure mirroring `/express-booking/[sessionId]/`
    - Adapt the guest booking form to collect: parent/guardian contact, child details, medical info, dietary requirements, emergency contact, authorised collector, consents
    - Use `termPrice` from the class document for payment (server-authoritative)
    - No authentication required — no `bt_session` cookie check in middleware for this route
    - _Requirements: 13.1, 13.2, 13.3_

  - [ ] 19.2 Add term booking path to guest create-intent API
    - Extend `POST /api/payments/create-intent` to accept guest term bookings: `{ classId, bookingType: 'term', bookingMode: 'guest', guestContact, childSnapshot, ... }`
    - Validate class is term, spots available, not expired — same checks as authenticated path
    - Use `termPrice` as amount (server-authoritative)
    - Write `booking_drafts/{piId}` with `bookingType: 'term'`, `bookingMode: 'guest'`, guest data
    - _Requirements: 13.1, 13.4_

  - [ ] 19.3 Add guest term booking handler to webhook
    - In `handleTermPaymentSucceeded`, support drafts with `bookingMode: 'guest'`
    - Create booking document without `bookedByUid` — use `guestContact` and `childSnapshot` fields
    - Include consent audit, medical info, emergency contact in the booking document
    - Decrement `spotsAvailable` identically to authenticated term bookings
    - _Requirements: 13.3, 13.4, 13.5_

  - [ ] 19.4 Update middleware to allow `/express-book-term/*` without authentication
    - Add `/express-book-term` to routes that do NOT require `bt_session` cookie
    - _Requirements: 13.1_

  - [ ] 19.5 Support social-channel programme bookings
    - Ensure the social booking service (WhatsApp, Instagram, Messenger adapters) can create term booking drafts with `bookingType: 'term'` and `classId`
    - The existing social booking pattern collects guest data then creates a payment — extend to support programme class bookings
    - _Requirements: 13.6_

- [ ] 20. Session Register programme participant resolution
  - [ ] 20.1 Extend Session Register to query programme bookings
    - In `handleOpenRegister()` in `src/app/admin/sessions/page.tsx`:
      - Check if the session's parent class has `commitment === 'term'`
      - If so, ALSO query `bookings` where `classId === session.classId` AND `bookingType === 'term'` AND `status === 'confirmed'`
      - Merge programme booking participants into the register alongside any per-session bookings
    - _Requirements: 14.1, 14.2_

  - [ ] 20.2 Display guest and social-origin participants in register
    - Ensure register display handles bookings without `bookedByUid`
    - Use `guestContact`/`childSnapshot` fields for participant name, medical info, emergency contact
    - Show booking source badge (Website Guest, WhatsApp, Instagram, Messenger)
    - _Requirements: 14.3, 14.4, 14.5_

- [ ] 21. Session-level time override support
  - [ ] 21.1 Add optional time fields to admin session form
    - Add optional `startTime` and `endTime` inputs to the session create/edit form
    - Pre-fill from parent class defaults; allow override
    - If left blank, continue to inherit from parent class during save
    - If set, save the override values on the session document
    - _Requirements: 2.10, 11.5_

  - [ ] 21.2 Display session-specific times in programme schedule
    - In `TermClassScheduleModal`, show session-specific times where they differ from the class default
    - In confirmation email, include session-specific times where applicable
    - _Requirements: 10.9_

- [ ] 22. Package price label updates
  - [ ] 22.1 Update price labels for programme clarity
    - Update `formatTermPrice()` in `src/lib/term-utils.ts` to use "for the programme" wording
    - Update admin form label from "Term Price (Pence)" to "Package Price — Full Programme (Pence)"
    - Update payment page "Total Amount (Full Term)" to "Total Amount (Full Programme)"
    - _Requirements: 1.9_

- [ ] 23. Checkpoint - Ensure all new and existing tests pass
  - Run full test suite to verify no regressions
  - Add Holiday Workshop regression scenario test

- [ ] 24. Holiday Workshop regression test
  - [ ] 24.1 Write Holiday Workshop end-to-end regression test
    - Test scenario: Admin creates a "Junior Chefs Holiday Workshop" programme:
      - Age 5–11, dates 24–28 Aug, time 11:00–12:15, price £60 (6000 pence), no recurrenceDays
      - 5 child sessions with recipes and skills assigned
    - Authenticated parent books: single payment, one booking created, spots decremented
    - Guest parent books: single payment, one booking created, spots decremented
    - Session Register for each child session shows both participants
    - Verify all programme display components handle the consecutive-date case correctly
    - _Requirements: 11.1, 12.1, 13.1, 14.1_

## Post-Enhancement Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["17.1", "18.1", "22.1"] },
    { "id": 1, "tasks": ["17.2", "17.3", "17.4", "18.2", "18.3", "18.4"] },
    { "id": 2, "tasks": ["19.1", "19.4", "20.1", "21.1"] },
    { "id": 3, "tasks": ["19.2", "19.5", "20.2", "21.2"] },
    { "id": 4, "tasks": ["19.3"] },
    { "id": 5, "tasks": ["23", "24.1"] }
  ]
}
```
