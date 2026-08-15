# Safety Review for Authenticated Bookings — Bugfix Design

## Overview

The Stripe webhook handler creates booking documents for both guest and authenticated users, but only calls `determineSafetyReviewStatus(draft)` inside the guest branch. Authenticated bookings therefore never receive a `safetyReviewStatus` field, making them invisible to the admin Safety Review Queue (which queries `safetyReviewStatus in ['pending', 'contact_parent']`). This is a child safety gap — high-risk medical declarations from authenticated bookings are never surfaced for admin review.

The fix is minimal: call `determineSafetyReviewStatus(draft)` in the authenticated booking branch and write the resulting status to the booking document. The function already accepts the correct shape (`{ medicalInfo?: GuestMedicalInfo }`) and the draft already contains `medicalInfo` from the booking wizard context.

## Glossary

- **Bug_Condition (C)**: An authenticated booking (non-guest) whose student has high-risk medical declarations — the booking document is created without a `safetyReviewStatus` field
- **Property (P)**: The booking document SHALL include a `safetyReviewStatus` field set to `'pending'` (high-risk) or `'not_required'` (no risk), based on the output of `determineSafetyReviewStatus(draft)`
- **Preservation**: Guest booking safety review logic, all existing authenticated booking fields, admin queue query behavior — these must remain unchanged
- **determineSafetyReviewStatus**: Function in `src/lib/guest-validation.ts` that inspects `draft.medicalInfo` and returns `'pending'` or `'not_required'`
- **Booking Draft**: Server-side document in `booking_drafts/{piId}` created by the payment intent route, containing the full wizard payload including `medicalInfo`
- **Safety Review Queue**: Admin page at `/admin/safety-reviews` that queries bookings with `safetyReviewStatus in ['pending', 'contact_parent']`

## Bug Details

### Bug Condition

The bug manifests when an authenticated parent books a session for a student who has medical declarations (allergies, epipen, respiratory problems, or medical conditions). The Stripe webhook's term booking handler splits into `if (isGuest)` and `else` branches — only the guest branch calls `determineSafetyReviewStatus(draft)` and writes `safetyReviewStatus` to the booking document. The authenticated branch omits this entirely.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type BookingDraft
  OUTPUT: boolean
  
  RETURN input.bookingMode ≠ 'guest'
         AND (
           input.medicalInfo.foodAllergies = true OR
           input.medicalInfo.epipenRequired = true OR
           input.medicalInfo.respiratoryProblems = true OR
           input.medicalInfo.airborneAllergies = true OR
           (input.medicalInfo.medicalConditions ≠ null
            AND input.medicalInfo.medicalConditions.trim().length > 0)
         )
END FUNCTION
```

### Examples

- **Example 1**: Parent books for child with `foodAllergies: true` → booking created without `safetyReviewStatus` → admin never sees it in the Safety Review Queue
- **Example 2**: Parent books for child with `epipenRequired: true` and `medicalConditions: "severe nut allergy"` → booking created without `safetyReviewStatus` → admin unaware of epipen requirement
- **Example 3**: Parent books for child with `respiratoryProblems: true` → booking created without `safetyReviewStatus` → no pre-session preparation for respiratory support
- **Example 4 (non-bug)**: Parent books for child with no medical flags (all false, empty medicalConditions) → currently no `safetyReviewStatus` field (should be `'not_required'` for consistency, but not a safety risk)

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Guest bookings must continue to receive `safetyReviewStatus` via the existing guest branch logic
- All existing fields on authenticated booking documents (medicalInfo, emergencyContact, questionnaire, payment, bookedByUid, studentId, etc.) must remain unchanged
- The admin Safety Review Queue query (`safetyReviewStatus in ['pending', 'contact_parent']`) must continue to work without modification
- The `determineSafetyReviewStatus` function itself must not be modified
- Admin status update workflow (changing status to 'reviewed', 'contact_parent', or 'cannot_accommodate') must continue to work for both guest and authenticated bookings

**Scope:**
All inputs that do NOT involve the authenticated booking branch in the Stripe webhook should be completely unaffected by this fix. This includes:
- Guest booking creation (entire guest branch)
- Payment failure handling
- Email sending logic
- Spot decrement logic
- Social booking confirmations
- Overbooking detection

## Hypothesized Root Cause

Based on the code analysis, the root cause is clear:

1. **Missing function call in authenticated branch**: The webhook handler at `src/app/api/webhooks/stripe/route.ts` line ~830 splits on `if (isGuest)`. The guest branch (line ~833) calls `const safetyReviewStatus = determineSafetyReviewStatus(draft)` and includes it in the booking document. The `else` branch (authenticated bookings, line ~880+) simply omits this call entirely.

2. **Historical oversight**: The safety review feature was likely implemented for guest bookings first (per the original requirement `GUEST-FR-013`), and the authenticated booking path was not updated when the feature was extended to cover all bookings.

3. **No type enforcement**: The `termBookingDoc` is typed as `Record<string, any>`, so TypeScript does not enforce the presence of `safetyReviewStatus` on the authenticated booking object.

4. **Function is already generic**: `determineSafetyReviewStatus` accepts `{ medicalInfo?: GuestMedicalInfo }` — it doesn't require the input to be a guest booking. The authenticated draft already has `medicalInfo` in the same shape, so the function can be called directly without any adaptation.

## Correctness Properties

Property 1: Bug Condition - Authenticated Bookings Receive Safety Review Status

_For any_ authenticated booking draft where the student has high-risk medical declarations (foodAllergies, epipenRequired, respiratoryProblems, airborneAllergies, or non-empty medicalConditions), the fixed webhook handler SHALL write `safetyReviewStatus: 'pending'` to the booking document, causing it to appear in the admin Safety Review Queue.

**Validates: Requirements 2.1, 2.2**

Property 2: Preservation - Guest Booking Safety Review Unchanged

_For any_ guest booking draft, the fixed webhook handler SHALL produce exactly the same booking document as the original code, preserving the existing `safetyReviewStatus` field assignment and all other guest booking fields.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4**

Property 3: Non-Risky Authenticated Bookings Receive Not Required Status

_For any_ authenticated booking draft where the student has NO high-risk medical declarations (all flags false, medicalConditions empty or null), the fixed webhook handler SHALL write `safetyReviewStatus: 'not_required'` to the booking document.

**Validates: Requirements 2.3**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `src/app/api/webhooks/stripe/route.ts`

**Location**: The `else` branch of the `if (isGuest)` conditional inside the term booking transaction (approximately line 880+)

**Specific Changes**:

1. **Add safety review status calculation**: Call `determineSafetyReviewStatus(draft)` at the start of the `else` (authenticated) branch, before constructing `termBookingDoc`:
   ```typescript
   } else {
       // Authenticated term booking — uses linked user/student docs
       const safetyReviewStatus = determineSafetyReviewStatus(draft);
       
       termBookingDoc = {
           // ... existing fields ...
       };
   }
   ```

2. **Add `safetyReviewStatus` field to authenticated booking document**: Include the computed status in the `termBookingDoc` object:
   ```typescript
   termBookingDoc = {
       // ... existing fields ...
       medicalInfo: draft.medicalInfo ?? null,
       emergencyContact: draft.emergencyContact ?? null,
       // Add safety review status
       safetyReviewStatus,
       // ... remaining fields ...
   };
   ```

3. **No import changes needed**: `determineSafetyReviewStatus` is already imported at the top of the file from `@/lib/guest-validation`.

4. **No admin page changes needed**: The Safety Review Queue already queries `where('safetyReviewStatus', 'in', ['pending', 'contact_parent'])` — authenticated bookings with `safetyReviewStatus: 'pending'` will automatically appear.

5. **No function modification needed**: `determineSafetyReviewStatus` already accepts the generic `{ medicalInfo?: GuestMedicalInfo }` shape which matches the authenticated draft structure.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write a unit test that simulates the webhook handler processing an authenticated booking draft with high-risk medical info, then asserts that `safetyReviewStatus` is present in the resulting booking document. Run this on the UNFIXED code to observe failures.

**Test Cases**:
1. **Authenticated booking with foodAllergies**: Create a draft with `bookingMode: 'authenticated'` and `medicalInfo.foodAllergies: true` — assert `safetyReviewStatus` is `'pending'` (will fail on unfixed code)
2. **Authenticated booking with epipenRequired**: Create a draft with `medicalInfo.epipenRequired: true` — assert `safetyReviewStatus` is `'pending'` (will fail on unfixed code)
3. **Authenticated booking with medicalConditions**: Create a draft with `medicalInfo.medicalConditions: "asthma"` — assert `safetyReviewStatus` is `'pending'` (will fail on unfixed code)
4. **Authenticated booking with no risk factors**: Create a draft with all medical flags false — assert `safetyReviewStatus` is `'not_required'` (will fail on unfixed code because the field is missing entirely)

**Expected Counterexamples**:
- The authenticated booking document does not contain a `safetyReviewStatus` field at all
- Root cause confirmed: the function call is simply absent from the authenticated branch

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**
```
FOR ALL draft WHERE isBugCondition(draft) DO
  bookingDoc := processWebhook_fixed(draft)
  ASSERT bookingDoc.safetyReviewStatus = 'pending'
  ASSERT bookingDoc appears in admin safety review query
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL draft WHERE draft.bookingMode = 'guest' DO
  ASSERT processWebhook_original(draft) = processWebhook_fixed(draft)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many combinations of medical info flags to cover the full input domain
- It catches edge cases like `medicalConditions: "   "` (whitespace-only) or `medicalInfo: null`
- It provides strong guarantees that guest booking behavior is unchanged

**Test Plan**: Observe behavior on UNFIXED code for guest bookings with various medical info combinations, then write property-based tests capturing that behavior.

**Test Cases**:
1. **Guest booking preservation**: Verify guest bookings with high-risk medical info continue to receive `safetyReviewStatus: 'pending'` after the fix
2. **Authenticated field preservation**: Verify all existing fields on authenticated bookings (medicalInfo, emergencyContact, questionnaire, payment, etc.) are unchanged
3. **Admin query compatibility**: Verify that the admin Safety Review Queue query returns both guest and authenticated bookings with `'pending'` status
4. **Null medicalInfo handling**: Verify that an authenticated draft with `medicalInfo: null` receives `safetyReviewStatus: 'not_required'` without throwing

### Unit Tests

- Test `determineSafetyReviewStatus` with various authenticated draft shapes (already covered by existing tests in `src/__tests__/lib/guest-validation.test.ts`)
- Test the webhook handler authenticated branch produces a booking doc with `safetyReviewStatus`
- Test edge cases: `medicalInfo: null`, `medicalInfo: undefined`, whitespace-only `medicalConditions`
- Test that guest branch behavior is unchanged

### Property-Based Tests

- Generate random `medicalInfo` objects with boolean flags and string conditions — verify `determineSafetyReviewStatus` output matches expected logic for all combinations
- Generate random authenticated booking drafts — verify the booking document always contains a valid `safetyReviewStatus` field (`'pending'` or `'not_required'`)
- Generate random guest booking drafts — verify the output is identical to the original (unfixed) function

### Integration Tests

- Test full webhook processing flow for an authenticated booking with high-risk medical info — verify the Firestore document contains `safetyReviewStatus: 'pending'`
- Test that the admin Safety Review Queue page renders authenticated bookings after the fix
- Test the complete booking wizard → payment → webhook → admin queue flow for an authenticated user with allergies
