# Cancellation Email Admin Copy Bugfix Design

## Overview

When a user cancels a booking (single or bundle) from the portal "My Classes" page, the `/api/emails/send` route sends the cancellation confirmation email only to the user. The admin (`RESEND_ADMIN_EMAIL`) is never CC'd, meaning they have no email notification of cancellations and must manually check Firestore or the admin panel. The fix adds a `cc` field to the Resend `emails.send()` call for `cancellation` and `bundle-cancellation` email types, using the `RESEND_ADMIN_EMAIL` environment variable. If the env var is missing, the email still sends to the user with a warning logged.

## Glossary

- **Bug_Condition (C)**: The condition that triggers the bug — when a cancellation or bundle-cancellation email is sent via `/api/emails/send` and the admin is not CC'd
- **Property (P)**: The desired behavior — the admin email (`RESEND_ADMIN_EMAIL`) is included as a CC recipient on cancellation emails
- **Preservation**: Existing confirmation email behavior, error handling, and authentication checks that must remain unchanged by the fix
- **`sendEmail` route**: The POST handler in `src/app/api/emails/send/route.ts` that sends transactional emails via the Resend SDK
- **`RESEND_ADMIN_EMAIL`**: Environment variable holding the admin's email address (e.g., `bloomingtastebuds@gmail.com`)
- **Resend SDK `cc` field**: The `cc` option in the Resend `emails.send()` payload that accepts an array of CC recipients

## Bug Details

### Bug Condition

The bug manifests when a user cancels a booking (single session or bundle) from the portal and the `/api/emails/send` route processes the email. The `resend.emails.send()` call only includes `to: [to]` without any `cc` field, so the admin never receives a copy of the cancellation notification.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type EmailSendRequest
  OUTPUT: boolean
  
  RETURN input.type IN ['cancellation', 'bundle-cancellation']
         AND input.to IS valid email address
         AND adminEmail (RESEND_ADMIN_EMAIL) IS configured
         AND NOT adminEmailIncludedAsCC(input)
END FUNCTION
```

### Examples

- **Single cancellation**: User cancels "After School Club" booking for 2025-02-10. Email sent to `parent@example.com` only. Admin (`bloomingtastebuds@gmail.com`) receives nothing. **Expected**: Admin is CC'd on the same email.
- **Bundle cancellation**: User cancels a bundle of 4 sessions. Email sent to `youngadult@example.com` only. Admin receives nothing. **Expected**: Admin is CC'd on the same bundle cancellation email.
- **Missing admin email**: `RESEND_ADMIN_EMAIL` is not set. User cancels a booking. **Expected**: Email still sends to user without CC, and a warning is logged.
- **Confirmation email (non-bug)**: User receives a booking confirmation. **Expected**: No admin CC — this email type is unaffected.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Confirmation emails (type `"confirmation"`) must continue to send only to the user's email address with no CC
- The 400 error response for missing required fields (`to`, `subject`, `type`) must remain unchanged
- The 401 Unauthorised response for missing/invalid auth tokens must remain unchanged
- The 500 error response for unconfigured `RESEND_API_KEY` must remain unchanged
- The `from` address logic (using `RESEND_FROM_EMAIL` or fallback to `onboarding@resend.dev`) must remain unchanged
- HTML email template content for all email types must remain unchanged
- The Resend domain verification error handling (403 → helpful message) must remain unchanged

**Scope:**
All inputs where `type` is NOT `'cancellation'` or `'bundle-cancellation'` should be completely unaffected by this fix. This includes:
- Confirmation emails (`type === 'confirmation'`)
- Any future email types that may be added
- All error paths (missing fields, auth failures, API key issues)
- The `to` recipient — the user must always receive the email regardless of CC behaviour

## Hypothesized Root Cause

Based on the bug description and code review, the root cause is straightforward:

1. **Missing `cc` field in `resend.emails.send()` call**: The current implementation at line ~108 of `route.ts` passes only `from`, `to`, `subject`, and `html` to `resend.emails.send()`. The Resend SDK supports a `cc` field (array of email addresses), but it was never added for cancellation email types.

2. **No conditional logic for email type**: The send call is a single shared invocation for all email types. There is no branching that differentiates the recipient list based on whether the email is a confirmation vs. cancellation.

3. **`RESEND_ADMIN_EMAIL` is available but unused in this route**: The environment variable exists and is used elsewhere (e.g., contact notifications), but was not wired into the cancellation email flow in this route handler.

## Correctness Properties

Property 1: Bug Condition - Admin CC on Cancellation Emails

_For any_ email send request where `type` is `'cancellation'` or `'bundle-cancellation'` AND `RESEND_ADMIN_EMAIL` is configured, the fixed `POST /api/emails/send` handler SHALL include `RESEND_ADMIN_EMAIL` in the `cc` field of the Resend SDK call, ensuring the admin receives a copy of the cancellation notification.

**Validates: Requirements 2.1, 2.2**

Property 2: Preservation - Confirmation and Error Behaviour Unchanged

_For any_ email send request where `type` is NOT `'cancellation'` or `'bundle-cancellation'` (e.g., `'confirmation'`), OR where the request triggers an error path (missing fields, auth failure, API key unconfigured), the fixed code SHALL produce exactly the same behaviour as the original code, preserving the existing recipient list (no CC), error responses, and email content.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4**

Property 3: Graceful Degradation - Missing Admin Email

_For any_ email send request where `type` is `'cancellation'` or `'bundle-cancellation'` AND `RESEND_ADMIN_EMAIL` is NOT configured (undefined or empty string), the fixed handler SHALL still send the cancellation email to the user without a CC field, and log a warning indicating the admin email was not included.

**Validates: Requirements 2.3**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `src/app/api/emails/send/route.ts`

**Function**: `POST` handler

**Specific Changes**:

1. **Read `RESEND_ADMIN_EMAIL` from environment**: After the HTML template is built and before the `resend.emails.send()` call, read `process.env.RESEND_ADMIN_EMAIL` into a local variable.

2. **Determine CC recipients based on email type**: Add conditional logic to build a `cc` array:
   - If `type === 'cancellation'` or `type === 'bundle-cancellation'`:
     - If `RESEND_ADMIN_EMAIL` is set and non-empty → `cc = [RESEND_ADMIN_EMAIL]`
     - If `RESEND_ADMIN_EMAIL` is not set or empty → `cc = undefined`, log a warning
   - For all other types (e.g., `'confirmation'`) → `cc = undefined` (no CC)

3. **Pass `cc` to `resend.emails.send()`**: Add the `cc` field to the send options object, conditionally including it only when it has a value:
   ```typescript
   const sendOptions: any = {
     from: `Blooming Tastebuds <${fromEmail}>`,
     to: [to],
     subject: subject,
     html: html,
   };
   if (cc) {
     sendOptions.cc = cc;
   }
   await resend.emails.send(sendOptions);
   ```

4. **Log warning for missing admin email on cancellation types**: Add a `console.warn()` when the email type is a cancellation variant but `RESEND_ADMIN_EMAIL` is not configured.

5. **No changes to email templates**: The HTML content remains identical — only the recipient list changes.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write tests that mock the Resend SDK and call the email send route with cancellation-type payloads. Inspect the arguments passed to `resend.emails.send()` to verify the `cc` field is absent. Run these tests on the UNFIXED code to observe failures and understand the root cause.

**Test Cases**:
1. **Single Cancellation Test**: POST with `type: 'cancellation'` — assert `resend.emails.send()` was called with a `cc` field containing the admin email (will fail on unfixed code because no `cc` is passed)
2. **Bundle Cancellation Test**: POST with `type: 'bundle-cancellation'` — assert `resend.emails.send()` was called with `cc` containing the admin email (will fail on unfixed code)
3. **Missing Admin Email Test**: POST with `type: 'cancellation'` when `RESEND_ADMIN_EMAIL` is undefined — assert email is still sent to user without CC and a warning is logged (may fail on unfixed code depending on implementation)

**Expected Counterexamples**:
- `resend.emails.send()` is called without a `cc` field for cancellation emails
- Root cause confirmed: the send call has no awareness of email type when determining recipients

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := sendEmail_fixed(input)
  ASSERT resend.emails.send was called with cc = [RESEND_ADMIN_EMAIL]
  ASSERT result.success === true
  ASSERT email was sent to input.to (user still receives it)
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT sendEmail_original(input) = sendEmail_fixed(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain (varying email types, recipient addresses, data payloads)
- It catches edge cases that manual unit tests might miss (e.g., unusual email types, empty strings)
- It provides strong guarantees that behavior is unchanged for all non-cancellation inputs

**Test Plan**: Observe behavior on UNFIXED code first for confirmation emails and error paths, then write property-based tests capturing that behavior.

**Test Cases**:
1. **Confirmation Email Preservation**: Verify that `type: 'confirmation'` emails are sent with no `cc` field before and after the fix
2. **Error Path Preservation**: Verify that missing fields still return 400, invalid auth still returns 401, and missing API key still returns 500
3. **Email Content Preservation**: Verify that the HTML content of all email types is unchanged by the fix
4. **From Address Preservation**: Verify that the `from` field logic is unchanged

### Unit Tests

- Test that `type: 'cancellation'` includes admin CC when `RESEND_ADMIN_EMAIL` is set
- Test that `type: 'bundle-cancellation'` includes admin CC when `RESEND_ADMIN_EMAIL` is set
- Test that `type: 'confirmation'` does NOT include admin CC
- Test graceful fallback when `RESEND_ADMIN_EMAIL` is not set (warning logged, email still sent)
- Test that user always receives the email regardless of CC behavior

### Property-Based Tests

- Generate random email types and verify only cancellation variants include CC
- Generate random environment configurations (with/without `RESEND_ADMIN_EMAIL`) and verify correct CC/warning behavior
- Generate random request payloads for non-cancellation types and verify no change in send behavior

### Integration Tests

- Test full cancellation flow: cancel booking → API call → verify both user and admin receive email
- Test full bundle cancellation flow: cancel bundle → API call → verify both user and admin receive email
- Test confirmation flow remains unchanged after fix is applied
