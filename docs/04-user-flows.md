# 04 — User Flows

---

## Flow 1: Visitor Browsing Site

### Current State in Code
- `/` (homepage) — SSR server component. Hero and banner CTA buttons are auth-aware (`HomeCtaButtons.tsx`): logged-out users see "Register Free" / "Register Now"; logged-in users see "My Portal" instead. No register prompt is shown to logged-in users.
- `/about` — SSR server component. Bottom CTA is auth-aware (`AboutCtaSection.tsx`): logged-out see "Get Started → /auth/signup"; logged-in see "Find a Class → /portal/find-class".
- `/testimonies` — SSR server component. Bottom CTA buttons are auth-aware (`TestimoniesCtaButtons.tsx`): logged-out see "Register Now" + "Find a Class"; logged-in see "Find a Class" + "My Portal".
- `/about` — Founder story and mission.
- `/gallery` — Fetches `gallery` Firestore collection; renders category-filtered image grid.
- `/testimonies` — Hardcoded reviews rendered via `ExpandableReview`.
- `/terms` — Static T&C text.
- Header nav links all route correctly.
- Footer social icons link to social platforms.

### Missing Steps
- No `/courses` page explaining the two class formats in detail (schedules, pricing, age ranges, what students learn).
- No SEO `<head>` metadata (OG tags, description) on public pages.
- Testimonials not editable via admin (hardcoded in TSX).

### Suggested Implementation
1. Add `src/app/(public)/courses/page.tsx` — static page with two sections: "After School Club" (5–12, Mondays 3:30–4:30) and "Weekend Classes" (university starters, Sat/Sun 10:30–12:30). Include pricing, FAQ, CTA button to `/auth/signup`.
2. Add `generateMetadata()` exports to `page.tsx` files.
3. Move testimonials to a `testimonials` Firestore collection; add admin management page.

---

## Flow 2: User Registration

### Current State in Code
```
/auth/signup
  → Role selection (parent / youngAdult)
  → Email + name + password form  OR  Google OAuth button
  → Firebase createUserWithEmailAndPassword / signInWithPopup
  → Firestore: create users/{uid} document
  → Redirect → /portal/dashboard
```
Implemented in `src/app/auth/signup/page.tsx` and `src/context/AuthContext.tsx`.

### Missing Steps
- No email verification step (Firebase `sendEmailVerification` not called).
- No onboarding screen after first sign-up (e.g. "Add your first student").
- No T&C acceptance at registration time (only at booking time).

### Suggested Implementation
1. After `createUserWithEmailAndPassword`, call `sendEmailVerification(user)`.
2. Add an `/auth/verify-email` page that polls `user.emailVerified`.
3. Add an optional onboarding modal on first portal visit (detected via `btUser.createdAt` vs. last login).

---

## Flow 3: Login / Forgot Password

### Current State in Code
```
/auth/login
  → Email + password  OR  Google Sign-In button
  → Firebase signInWithEmailAndPassword / signInWithPopup
  → Sets bt_session cookie
  → Redirect → /portal/dashboard  (or originally requested URL)

/auth/forgot-password
  → Email input
  → Firebase sendPasswordResetEmail
  → Inline success/error message
```
Both implemented in `src/app/auth/login/page.tsx` and `src/app/auth/forgot-password/page.tsx`.

### Missing Steps
- No redirect to original page after login (e.g. if user hits `/book/…` unauthenticated, after login they land on `/portal/dashboard` rather than the booking page).
- No "remember me" option.

### Suggested Implementation
1. In middleware, store the intended URL in a `?redirect=` query param.
2. On successful login in `AuthContext`, read `router.query.redirect` and navigate there.

---

## Flow 4: User Dashboard

### Current State in Code
```
/portal/dashboard
  → Personalised greeting (firstName from btUser)
  → Quick-action cards: Find a Class / My Bookings / My Students / My Payments
```
Implemented in `src/app/portal/dashboard/page.tsx`. Sidebar navigation links to all portal sections.

### Missing Steps
- No upcoming class summary on the dashboard (only links, no data).
- No "next class" countdown widget.

### Suggested Implementation
1. On dashboard load, query `bookings where bookedByUid == uid, status == confirmed, sessionDate > today, orderBy sessionDate, limit 3`.
2. Display upcoming sessions in a summary card.

---

## Flow 5: Find a Class

### Current State in Code
```
/portal/find-class
  → Loads Firestore sessions (status: open, date >= today)
  → Renders filter controls (class type, venue, date range)
  → Toggle: Map View (Leaflet) | List View
  → Each session card: date, time, class name, venue, instructor, spots, price
  → "Book Now" button → /book/[sessionId]/student
```
Implemented in `src/app/portal/find-class/page.tsx` + `SessionMapFinder.tsx`.

### Missing Steps
- No "No classes found" empty state with CTA to notify admin.
- Map requires venue `lat`/`lng` to be populated by admin.
- No course-type landing page to guide users before they search.

### Suggested Implementation
1. Add an empty-state component with "No sessions available — check back soon!" message.
2. Add latitude/longitude geocoding helper in admin venue form (e.g. Google Maps Geocoding API).

---

## Flow 6: Select a Class / Session

### Current State in Code
Selecting a session happens within the Find a Class page (Flow 5). Clicking "Book Now" on a session card navigates to `/book/[sessionId]/student`, passing the `sessionId` via the URL.

`BookingContext` loads the session from Firestore on mount:
```
BookingContext.useEffect → getDoc(sessions/{sessionId}) → sets state.session
```

### Missing Steps
- No dedicated session detail page (description of recipe, instructor, what to bring).
- No ability to "view details" before committing to booking.

### Suggested Implementation
1. Add a session detail modal or `/session/[sessionId]` page showing recipe name, instructor bio, venue details.
2. Session detail page has "Book Now" CTA.

---

## Flow 7: Add / Select Student

### Current State in Code
```
/book/[sessionId]/student
  → For parent role:
      - Lists existing students from Firestore (students where parentUid == uid)
      - Each student card shows name, DOB, calculated age
      - Age validation against session.ageMin / session.ageMax
      - "Add New Student" inline form
  → For youngAdult role:
      - Pre-selects "self" (no child student needed)
  → Confirm → stores studentId + student in BookingContext → proceed to /medical
```
Implemented in `src/app/book/[sessionId]/student/page.tsx`.

### Missing Steps
- No warning if the student was already booked for this session.
- Adding a new student in the booking flow does not persist the full medical profile at that point (entered later in Flow 9).

### Suggested Implementation
1. Check `bookings` collection: `where sessionId == X AND studentId == Y` — if found, show "already booked" warning.
2. Allow pre-filling emergency contact and medical info when adding a new student mid-booking.

---

## Flow 8: Review Booking

### Current State in Code
The booking wizard does not have an explicit "Review" step. After Terms acceptance, the user proceeds directly to Payment. A summary of the booking (class, student, date, venue, price) is visible within the Payment page.

### Missing Steps
- No dedicated booking summary / review step between Terms and Payment.

### Suggested Implementation
1. Add a `review` step between `terms` and `payment` in the booking wizard.
2. Show: session date/time/venue, student name, class name, recipe, price.
3. Allow "Go Back" to edit any previous step.

---

## Flow 9: Medical Information & Emergency Contact

### Current State in Code
```
/book/[sessionId]/medical
  → MedicalInfo form: 7 boolean flags + free-text notes
  → EmergencyContact form: name, relationship, email, phone
  → Pre-fills from BookingContext.student.medicalInfo if available
  → Stores in BookingContext
  → On payment success (CheckoutForm.tsx):
      - booking.medicalInfo saved to Firestore
      - booking.emergencyContact saved to Firestore
      - students/{studentId}.medicalInfo updated (write-back)
```
Implemented in `src/app/book/[sessionId]/medical/page.tsx`.

### Missing Steps
- The write-back to the student document after payment is in `CheckoutForm.tsx` — confirm this is transactional or handled with proper error recovery.
- No ability to edit medical info independently from a booking (only from `my-students`).

### Suggested Implementation
1. Add an "Edit Health Info" section on `portal/my-students/page.tsx` for each student.
2. Ensure the medical write-back in `CheckoutForm.tsx` uses `setDoc` with `merge: true`.

---

## Flow 10: Questionnaire

### Current State in Code
```
/book/[sessionId]/questionnaire
  → Only shown when session.classType == 'kidsAfterSchool'
  → Captures: dietary requirements, airborne allergy, reaction details, symptoms,
             epipen info, same-table preference, may-contain preference
  → Stores in BookingContext.questionnaire
  → Saved to booking document + student document on payment success
```
Implemented in `src/app/book/[sessionId]/questionnaire/page.tsx`.

### Missing Steps
- Questionnaire is skipped for `youngAdultWeekend` — confirm this is the intended design.
- No confirmation to the user that their allergy data was received (only in confirmation email).

### Suggested Implementation
- Include a brief acknowledgement line in the confirmation page: "We have noted your dietary requirements and allergy information."

---

## Flow 11: Accept Terms & Conditions

### Current State in Code
```
/book/[sessionId]/terms
  → Full T&C text rendered inline
  → Checkbox: "I agree to the Terms and Conditions"
  → Checkbox is required — cannot proceed without checking
  → Sets BookingContext.termsAccepted = true + termsAcceptedAt = new Date()
  → Saved to booking.termsAccepted + booking.termsAcceptedAt on payment success
```
Implemented in `src/app/book/[sessionId]/terms/page.tsx`.

### Missing Steps
- T&C text is not versioned — if T&Cs change, old bookings won't reflect which version was accepted.
- No "Print" or "Email me the T&Cs" option.

### Suggested Implementation
1. Add a `termsVersion` field to bookings (e.g. `"v1.0"`) matching a `terms` Firestore document.
2. When T&Cs update, bump version so acceptance audit trail remains valid.

---

## Flow 12: Payment

### Current State in Code
```
/book/[sessionId]/payment
  → page.tsx: calls POST /api/payments/create-intent (server action)
              receives clientSecret
              mounts <Elements stripe={stripe} options={{clientSecret}}>
              renders CheckoutForm

  CheckoutForm.tsx:
  → Renders <PaymentElement> (Stripe-hosted card UI)
  → On submit: stripe.confirmPayment({
        elements,
        confirmParams: { return_url: ... }
      })
  → On success (Stripe redirects back):
      - Creates booking document in Firestore
      - Decrements session.spotsAvailable
      - Updates student.medicalInfo
      - Calls POST /api/emails/send (confirmation email)
      - Navigates to /book/[sessionId]/confirmation
```
Implemented in `src/app/book/[sessionId]/payment/page.tsx` + `CheckoutForm.tsx` + `src/app/api/payments/create-intent/route.ts`.

### Missing Steps
- **No Stripe webhook handler** — if the redirect back to the app fails (e.g. network drop), the booking may never be created in Firestore even though payment succeeded.
- **No idempotency check** — re-submitting could theoretically create a duplicate booking.
- **PayPal not supported.**

### Suggested Implementation
1. Add `/api/webhooks/stripe/route.ts` to handle `payment_intent.succeeded` events as the authoritative booking creation trigger.
2. Move booking-creation logic from `CheckoutForm.tsx` into the webhook handler.
3. Use `payment_intent.id` as an idempotency key when writing the booking document.

---

## Flow 13: Booking Confirmation

### Current State in Code
```
/book/[sessionId]/confirmation
  → Reads session/booking data from BookingContext (client-side state)
  → Shows: class name, date, venue, student name, amount paid
  → CTA buttons: "View My Bookings" → /portal/my-classes
                 "Find Another Class" → /portal/find-class
  → Confirmation email sent from CheckoutForm (before redirect)
```
Implemented in `src/app/book/[sessionId]/confirmation/page.tsx`.

### Missing Steps
- If user navigates directly to `/confirmation` without prior booking state, the page may show blank data.
- No calendar download (`.ics` file).
- No share/referral option.

### Suggested Implementation
1. Add a `bookingId` URL param to confirmation page; hydrate from Firestore if BookingContext is empty.
2. Generate a downloadable `.ics` calendar event using the session date/time/venue.
