# Bugfix Requirements Document

## Introduction

When a parent adds allergen or medical information to an existing student profile and then books a session through their authenticated account, the booking does not appear in the admin Safety Review Queue. This is because the Stripe webhook only calls `determineSafetyReviewStatus()` for guest bookings — the authenticated booking branch never writes a `safetyReviewStatus` field to the booking document. Since the admin Safety Review Queue queries for `safetyReviewStatus in ['pending', 'contact_parent']`, authenticated bookings with high-risk medical declarations are completely invisible to administrators, creating a child safety gap.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN an authenticated parent books a session for a student who has high-risk medical declarations (foodAllergies, epipenRequired, respiratoryProblems, airborneAllergies, or non-empty medicalConditions) THEN the system creates a booking document without a `safetyReviewStatus` field

1.2 WHEN the admin Safety Review Queue page loads and queries for bookings with `safetyReviewStatus in ['pending', 'contact_parent']` THEN authenticated bookings with high-risk medical info are excluded from the results because they lack the field entirely

1.3 WHEN an authenticated parent books a session for a student who has no high-risk medical declarations THEN the system creates a booking document without a `safetyReviewStatus` field (no distinction between safe and risky bookings)

### Expected Behavior (Correct)

2.1 WHEN an authenticated parent books a session for a student who has high-risk medical declarations (foodAllergies, epipenRequired, respiratoryProblems, airborneAllergies, or non-empty medicalConditions) THEN the system SHALL set `safetyReviewStatus` to `'pending'` on the booking document

2.2 WHEN the admin Safety Review Queue page loads THEN authenticated bookings with `safetyReviewStatus` of `'pending'` or `'contact_parent'` SHALL appear in the query results alongside guest bookings

2.3 WHEN an authenticated parent books a session for a student who has no high-risk medical declarations THEN the system SHALL set `safetyReviewStatus` to `'not_required'` on the booking document

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a guest books a session with high-risk medical declarations in the booking draft THEN the system SHALL CONTINUE TO set `safetyReviewStatus` to `'pending'` on the guest booking document

3.2 WHEN a guest books a session without high-risk medical declarations THEN the system SHALL CONTINUE TO set `safetyReviewStatus` to `'not_required'` on the guest booking document

3.3 WHEN the admin updates the `safetyReviewStatus` of any booking (guest or authenticated) via the Safety Review Queue THEN the system SHALL CONTINUE TO persist the updated status and timestamp

3.4 WHEN the Stripe webhook processes a payment for an authenticated booking THEN the system SHALL CONTINUE TO create the booking document with all existing fields (medicalInfo, emergencyContact, questionnaire, payment, etc.) unchanged

---

## Bug Condition (Formal)

```pascal
FUNCTION isBugCondition(X)
  INPUT: X of type BookingDraft
  OUTPUT: boolean
  
  // Returns true when the booking is authenticated (not guest) AND
  // the student has high-risk medical declarations
  RETURN X.bookingMode ≠ 'guest' AND (
    X.medicalInfo.foodAllergies = true OR
    X.medicalInfo.epipenRequired = true OR
    X.medicalInfo.respiratoryProblems = true OR
    X.medicalInfo.airborneAllergies = true OR
    X.medicalInfo.medicalConditions.trim().length > 0
  )
END FUNCTION
```

```pascal
// Property: Fix Checking — Authenticated bookings get safety review status
FOR ALL X WHERE isBugCondition(X) DO
  result ← createBooking'(X)
  ASSERT result.safetyReviewStatus = 'pending'
END FOR
```

```pascal
// Property: Preservation Checking — Non-buggy inputs unchanged
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT createBooking(X) = createBooking'(X)
END FOR
```
