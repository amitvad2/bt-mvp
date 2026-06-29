# Design Document — Contact System

## Overview

The contact system is a full-stack feature spanning a public-facing form, a server-side API route, and an admin inbox. It lets any visitor send an enquiry to the Blooming Tastebuds team, persists the message to Firestore using the Admin SDK, and notifies the admin via Resend. The admin inbox lets privileged users triage and update the status of every received message.

This document describes the existing implementation, its data contracts, the `escapeHtml` XSS mitigation, and the correctness properties that should be continuously verified.

---

## Architecture

```mermaid
flowchart TD
    A[Visitor: /contact page] -->|React Hook Form + Zod| B[ContactForm.tsx\nclient-side validation]
    B -->|POST /api/contact\nJSON body| C[Contact_API route.ts\nserver-side Zod validation]
    C -->|adminDb.collection('contact_messages').add(...)| D[(Firestore\ncontact_messages)]
    C -->|resend.emails.send(...)| E[Resend\nAdmin notification email]
    E -->|email failure is non-fatal| C
    D -->|getDocs query| F[Admin_Inbox /admin/contact\nclient-side Firestore read]
    F -->|updateDoc| D
```

**Key invariants of this architecture:**
- Client-side and server-side validation are both present but defined independently. Bypassing the browser cannot skip server validation.
- Firestore writes use the Admin SDK only. The `contact_messages` collection has no public Firestore client SDK write rules.
- Email failure is caught inside a nested try/catch and never propagates to the HTTP response.
- `userId` is excluded from the server schema — client-supplied UIDs are untrusted and ignored.

---

## Components and Interfaces

### ContactForm (`src/app/(public)/contact/ContactForm.tsx`)

A `'use client'` React component that manages three state values:

| State | Type | Purpose |
|-------|------|---------|
| `loading` | `boolean` | Controls button disabled state and label |
| `submitted` | `boolean` | When `true`, swaps form for the success view |
| `serverError` | `string` | When non-empty, renders an inline error alert |

**Submit flow:**
1. `handleSubmit(onSubmit)` — React Hook Form calls `onSubmit` only after the Zod resolver passes.
2. `onSubmit` sets `loading = true`, clears `serverError`, then `fetch('/api/contact', ...)`.
3. On non-`ok` response: `setServerError(json.error || fallback)`.
4. On network throw: `setServerError('Could not send your message...')`.
5. On `ok` response: `setSubmitted(true)`.
6. `finally`: `setLoading(false)`.

**Category constants:**
```ts
const CATEGORIES = [
  { value: 'general',         label: 'General enquiry' },
  { value: 'class-info',      label: 'Class information' },
  { value: 'booking-help',    label: 'Booking help' },
  { value: 'dietary-allergy', label: 'Dietary / allergy question' },
  { value: 'private-event',   label: 'Private event / school enquiry' },
  { value: 'technical',       label: 'Technical issue' },
  { value: 'feedback',        label: 'Feedback' },
];
```

---

### Contact API Route (`src/app/api/contact/route.ts`)

A Next.js App Router `POST` handler. Processing steps in order:

1. **Admin SDK guard** — if `adminInitError` is truthy, return `500` immediately.
2. **Parse body** — `await req.json()`.
3. **Server-side Zod validation** — `schema.safeParse(body)`. On failure: `400`.
4. **Destructure validated fields** — `{ name, email, phone, category, message, consentToReply }`.
5. **Build Firestore document** — set `source: 'contact-page'`, `status: 'new'`, `createdAt: serverTimestamp()`.
6. **Firestore write** — `adminDb.collection('contact_messages').add(docData)`.
7. **Email notification** (non-fatal try/catch):
   - Apply `escapeHtml` to all string fields.
   - Send HTML email via `resend.emails.send(...)` with `replyTo: email`.
8. **Return** `{ success: true, id: ref.id }`.

---

### Zod Schema Shape

Both `ContactForm.tsx` and `route.ts` define this schema independently:

```ts
z.object({
  name:           z.string().min(2, 'Name is required'),
  email:          z.string().email('Enter a valid email address'),
  phone:          z.string().optional(),
  category:       z.enum([
                    'general', 'class-info', 'booking-help',
                    'dietary-allergy', 'private-event', 'technical', 'feedback'
                  ]),
  message:        z.string().min(10, 'Please enter at least 10 characters'),
  consentToReply: z.boolean().refine(v => v === true, { message: 'Consent is required' }),
  // userId intentionally absent
})
```

Validation failure response shape:
```ts
{ error: 'Invalid submission', issues: { [field]: string[] } }
```

---

### escapeHtml Function

```ts
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
```

The replacements must be applied in exactly this order: `&` first, to prevent double-escaping.

**Character mapping:**

| Raw | Escaped |
|-----|---------|
| `&` | `&amp;` |
| `<` | `&lt;` |
| `>` | `&gt;` |
| `"` | `&quot;` |
| `'` | `&#39;` |

Applied to: `name`, `email`, `phone` (when present), `message`, `categoryLabel` before HTML template interpolation.

---

### Admin Inbox (`src/app/admin/contact/page.tsx`)

A `'use client'` component with four state values:

| State | Type | Purpose |
|-------|------|---------|
| `messages` | `ContactMessage[]` | All loaded messages |
| `loading` | `boolean` | Shows spinner until fetch completes |
| `expandedId` | `string \| null` | ID of the currently expanded message row |
| `filterStatus` | `ContactStatus \| 'all'` | Active status filter |

**On mount:** fetches `contact_messages` ordered by `createdAt` descending via the Firestore client SDK.

**Status change:** `updateDoc(doc(db, 'contact_messages', id), { status, updatedAt: serverTimestamp() })` then updates local state optimistically.

**Filter logic:** `filterStatus === 'all' ? messages : messages.filter(m => m.status === filterStatus)`.

---

## Data Models

### ContactMessage (Firestore: `contact_messages/{docId}`)

```ts
interface ContactMessage {
  id:             string;           // Firestore document ID
  name:           string;           // min length 2
  email:          string;           // valid email format
  phone?:         string;           // optional, unvalidated format
  category:       ContactCategory;  // one of 7 enum values
  message:        string;           // min length 10
  consentToReply: boolean;          // always true (schema enforced)
  source:         'contact-page';   // always this literal
  status:         ContactStatus;    // lifecycle state
  userId?:        string;           // optional, never set by contact API
  createdAt:      Timestamp;        // Firestore serverTimestamp on create
}
```

### ContactCategory

```ts
type ContactCategory =
  | 'general' | 'class-info' | 'booking-help' | 'dietary-allergy'
  | 'private-event' | 'technical' | 'feedback';
```

### ContactStatus

```ts
type ContactStatus = 'new' | 'read' | 'replied' | 'closed';
```

Status lifecycle:
```
new → read → replied → closed
          ↓
        closed (from any state)
```

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

---

### Property 1: escapeHtml completeness

*For any* string containing any combination of the characters `&`, `<`, `>`, `"`, and `'`, calling `escapeHtml` should replace every occurrence of each character with its corresponding HTML entity, and every character that is not one of these five should be unchanged.

**Validates: Requirements 5.1, 5.3, 5.4**

---

### Property 2: Server schema rejects all invalid payloads

*For any* payload that is missing a required field, or that has a field value outside its defined constraints (name length < 2, invalid email format, unknown category, message length < 10, `consentToReply !== true`), the server-side `Contact_Schema` should return `success: false` and the API should return HTTP `400` without calling `mockAdd`.

**Validates: Requirements 3.2, 3.5**

---

### Property 3: Valid payload Firestore document invariants

*For any* payload that passes `Contact_Schema` validation, the `Contact_API` should write exactly one document to `contact_messages` containing: all submitted fields, `status: 'new'`, `source: 'contact-page'`, and `createdAt` set to `serverTimestamp()`. The API should return HTTP `200` with `{ success: true, id: <docId> }`. The `phone` field should be present in the document if and only if the payload included a non-undefined `phone` value.

**Validates: Requirements 3.3, 4.1, 4.2, 4.3, 4.5, 4.7**

---

### Property 4: Email notification non-fatality

*For any* valid payload, if the Resend API call rejects for any reason (network error, API error, timeout), the `Contact_API` should still return HTTP `200` with `{ success: true }`. The email failure must never surface as an error to the submitter.

**Validates: Requirements 6.4**

---

### Property 5: HTML escaping applied to all string fields before email dispatch

*For any* valid payload where any string field (`name`, `email`, `phone`, `message`) contains one or more of the characters `&`, `<`, `>`, `"`, `'`, the HTML string passed to `resend.emails.send` should not contain any of those characters in their raw unescaped form. Every occurrence should appear only as its HTML entity equivalent.

**Validates: Requirements 5.2**

---

### Property 6: Phone field accepted for any string value

*For any* valid base payload (name, email, category, message, consentToReply all valid), if an arbitrary non-empty string is supplied for the optional `phone` field, `Contact_Schema` should still accept the payload as valid and the API should include that phone value in the Firestore document.

**Validates: Requirements 1.7, 4.5**

---

### Property 7: Admin inbox badge count equals number of 'new' messages

*For any* list of `ContactMessage` objects with varying statuses, the number displayed in the "new" badge in the `Admin_Inbox` should equal exactly the count of messages in that list whose `status` is `'new'`.

**Validates: Requirements 7.2**

---

### Property 8: Admin inbox filter correctness

*For any* list of messages with mixed statuses and any selected filter value (one of the four `ContactStatus` values), every row displayed in the `Admin_Inbox` should have a status matching the selected filter value, and no rows with a different status should be visible.

**Validates: Requirements 7.3**

---

### Property 9: Status update round-trip

*For any* `ContactMessage` and *for any* valid target `ContactStatus`, when an admin selects that status in the dropdown, `updateDoc` should be called with that exact status value, and the displayed status for that message in the UI should then match the newly selected value.

**Validates: Requirements 8.1, 8.2**

---

## Error Handling

| Scenario | Behaviour |
|----------|-----------|
| `adminInitError` truthy at startup | API returns `500 { error: 'Service temporarily unavailable' }` immediately |
| Zod validation failure | API returns `400 { error: 'Invalid submission', issues: {...} }` |
| `adminDb.collection(...).add()` throws | API returns `500 { error: 'Failed to send message. Please try again.' }` |
| `resend.emails.send()` throws | Error logged to console; API continues and returns `200` |
| `fetch` network error in ContactForm | Form shows "Could not send your message. Please check your connection and try again." |
| Non-`ok` HTTP response in ContactForm | Form shows the `json.error` field or fallback "Something went wrong. Please try again." |
| `updateDoc` fails in Admin_Inbox | Error logged to console; displayed status remains unchanged |

---

## Testing Strategy

### Test file locations (existing)

| File | What it covers |
|------|----------------|
| `src/__tests__/contact/ContactForm.test.tsx` | Field rendering, success/error state transitions, button disabled state, inline validation |
| `src/__tests__/contact/api-contact-route.test.ts` | Validation rejection (400), Firestore write, email dispatch, email non-fatality, `replyTo` |
| `src/__tests__/contact/contact-schema.test.ts` | Zod schema — valid/invalid examples for each field |
| `src/__tests__/contact/AdminContactPage.test.tsx` | Empty state, row rendering, badge count, expand/collapse, status update |

### Dual testing approach

**Unit/example tests** (already in place) cover:
- Concrete valid and invalid submission examples
- Specific error paths (`adminInitError`, Resend failure, network throw)
- UI state transitions

**Property-based tests** (gaps) should be added using **fast-check** (already installable as a dev dependency — `npm install --save-dev fast-check`):

| Property | Target file | fast-check generators |
|----------|-------------|----------------------|
| P1 — escapeHtml completeness | New: `src/__tests__/contact/escape-html.property.test.ts` | `fc.string()` including chars from `& < > " '` |
| P2 — Schema rejects all invalid payloads | New: `src/__tests__/contact/contact-schema.property.test.ts` | Mutate valid payload to violate each constraint |
| P3 — Firestore document invariants | Extend: `api-contact-route.test.ts` | `fc.record(...)` for valid ContactMessage fields |
| P4 — Email non-fatality | Extend: `api-contact-route.test.ts` | `fc.oneof(fc.constant(new Error('net')), ...)` |
| P5 — HTML escaping in email template | Extend: `api-contact-route.test.ts` | `fc.string()` with injected special chars |
| P6 — Phone accepted for any string | Extend: `contact-schema.property.test.ts` | `fc.string()` for phone field |
| P7 — Badge count | Extend: `AdminContactPage.test.tsx` | `fc.array(fc.record({status: fc.constantFrom(...)}))` |
| P8 — Filter correctness | Extend: `AdminContactPage.test.tsx` | Same array generator + `fc.constantFrom('new','read','replied','closed')` |
| P9 — Status update round-trip | Extend: `AdminContactPage.test.tsx` | `fc.constantFrom('new','read','replied','closed')` |

Each property test must run a minimum of **100 iterations** (fast-check default).

Tag format for each test:
```
// Feature: contact-system, Property N: <property title>
```

### Test commands

```bash
npm run test:run   # single run (CI)
npm run test       # watch mode (development)
```
