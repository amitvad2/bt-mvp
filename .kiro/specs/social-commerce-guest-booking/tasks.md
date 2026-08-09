# Implementation Plan: Social Commerce Guest Booking

## Overview

This plan implements the Social Commerce Guest Booking feature in phases, starting with the foundation (types, token service, deep-link resolution, attribution tracking, admin enhancements) then layering channel adapters. Each task builds incrementally on previous work, wiring components together at integration points. The implementation uses TypeScript strict mode, Next.js 16 App Router, Firebase Admin SDK for server writes, and the existing @vercel/kv rate limiting infrastructure.

## Tasks

- [x] 1. Define domain types and shared interfaces
  - [x] 1.1 Add Social Booking types to src/types/index.ts
    - Add `SocialChannel`, `SocialBookingState`, `SocialBookingSession`, `CampaignAttribution`, `AcquisitionMetadata` types
    - Add `ParsedSocialEvent` discriminated union type for normalised webhook events
    - Add `TokenValidationResult` type (valid with session context, or invalid with reason)
    - Add `SessionSummary`, `BookingConfirmation` interfaces for adapter communication
    - Extend `BookingSource` union with any missing social sources
    - _Requirements: 2.1, 2.2, 4.2, 6.1, 8.1_

  - [x] 1.2 Create Channel Adapter interface
    - Create `src/lib/social-booking/adapters/types.ts`
    - Define `ChannelAdapter` interface with methods: `sendSessionList`, `sendCheckoutLink`, `sendBookingConfirmation`, `sendNoSessionsMessage`, `sendSessionUnavailableMessage`, `sendHelpMessage`, `sendErrorMessage`, `parseEvent`
    - Export all adapter-related types
    - _Requirements: 2.2, 2.8_

  - [x] 1.3 Create Social Booking Service interface
    - Create `src/lib/social-booking/service.ts` with the `SocialBookingService` interface
    - Define methods: `handleInboundMessage`, `generateCheckoutToken`, `validateAndConsumeToken`, `confirmBooking`, `sendSocialConfirmation`, `getAvailableSessions`
    - _Requirements: 2.1, 2.4, 2.5, 2.6_

- [x] 2. Implement Token Generation and Validation Service
  - [x] 2.1 Implement token generation logic
    - Create `src/lib/social-booking/token.ts`
    - Implement `generate(socialBookingSessionId, sessionId)`: 32 random bytes → URL-safe base64 (43 chars), SHA-256 hash stored on Social_Booking_Session doc, set `tokenExpiresAt` to now + 15 minutes
    - Use `crypto.randomBytes(32)` and `crypto.createHash('sha256')`
    - Store only the hex-encoded hash in Firestore, never the raw token
    - _Requirements: 6.1, 6.2, 6.3, 6.5_

  - [x] 2.2 Implement token validation and consumption logic
    - Implement `validateAndConsume(rawToken)`: compute SHA-256 hash, query `social_booking_sessions` for matching `checkoutTokenHash`, verify `tokenExpiresAt > now` and `tokenConsumed !== true`
    - Use Firestore transaction to atomically set `tokenConsumed = true` — only the first concurrent request succeeds
    - Return `TokenValidationResult` with session context on success or error reason on failure
    - _Requirements: 6.4, 6.7, 6.8_

  - [x] 2.3 Write property test for token format (Property 5)
    - **Property 5: Token Format and Randomness**
    - Generate many tokens, verify each is exactly 43 characters containing only `[A-Za-z0-9_-]`
    - **Validates: Requirements 6.1, 6.5**

  - [x] 2.4 Write property test for token hash storage (Property 6)
    - **Property 6: Token Hash Storage**
    - Generate tokens, verify stored hash equals hex SHA-256 of raw token and never equals raw token
    - **Validates: Requirements 6.2, 6.7**

  - [x] 2.5 Write property test for token expiry (Property 7)
    - **Property 7: Token Expiry**
    - Generate tokens with time offsets, verify 15-minute boundary using `vi.useFakeTimers()`
    - **Validates: Requirements 6.3**

  - [x] 2.6 Write property test for token single-use (Property 8)
    - **Property 8: Token Single-Use**
    - Generate valid tokens, validate twice, verify first succeeds and second returns 'consumed'
    - **Validates: Requirements 6.4, 6.8**

- [x] 3. Implement rate limiting for social booking
  - [x] 3.1 Extend rate limiter for social booking use cases
    - Create `src/lib/social-booking/rate-limit.ts` that wraps existing `@vercel/kv` infrastructure
    - Implement token generation rate limit: 10 tokens/hour per `externalUserId` (key: `social_token_rate:<externalUserId>`)
    - Implement deep link resolution rate limit: 20 requests/min per IP (key: `social_deeplink_rate:<IP>`)
    - Implement failed token attempt tracking: 5 failures/10min per IP (key: `social_token_fail:<IP>`)
    - Implement IP blocking: `social_ip_block:<IP>` with 1800s TTL after 5 failures
    - Return `Retry-After` header value in seconds
    - _Requirements: 11.3, 11.4, 11.5_

  - [x] 3.2 Write property test for token generation rate limiting (Property 15)
    - **Property 15: Token Generation Rate Limiting**
    - Generate N requests per user, verify threshold at 10/hour
    - **Validates: Requirements 11.3**

  - [x] 3.3 Write property test for deep link rate limiting (Property 16)
    - **Property 16: Deep Link Rate Limiting**
    - Generate N requests per IP, verify threshold at 20/min
    - **Validates: Requirements 11.4**

  - [x] 3.4 Write property test for IP blocking (Property 17)
    - **Property 17: IP Blocking After Failed Attempts**
    - Generate failure sequences, verify block at 5 failures within 10 minutes, verify 30-minute block duration
    - **Validates: Requirements 11.5**

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement Social Booking Session lifecycle management
  - [x] 5.1 Implement session lifecycle in Social Booking Service
    - Create `src/lib/social-booking/session-manager.ts`
    - Implement `createOrReuseSession(channel, externalUserId, externalConversationId)`: check for active (non-expired, non-confirmed) session on same channel/user; reuse if found, create new if not
    - Implement state transitions: `started → selecting-session → checkout-created → payment-pending → confirmed`
    - Implement expiry: set `expiresAt` to 30 minutes from creation, any read of an expired session updates state to `expired`
    - Enforce valid state machine transitions — reject invalid transitions
    - _Requirements: 4.1, 4.2, 4.3, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10_

  - [x] 5.2 Implement session discovery query
    - Implement `getAvailableSessions()`: query Firestore `sessions` collection where `status === 'open'`, `spotsAvailable > 0`, `date > today`, order by date ascending, limit 5
    - Map results to `SessionSummary` objects with formatted date, time, price (£XX.XX), age range
    - _Requirements: 5.2, 5.3, 5.4_

  - [x] 5.3 Write property test for session state machine (Property 10)
    - **Property 10: Session State Machine Transitions**
    - Generate random event sequences, verify only valid state transitions occur
    - **Validates: Requirements 4.1, 4.3, 4.5, 4.6, 4.7, 4.8**

  - [x] 5.4 Write property test for session availability filtering (Property 9)
    - **Property 9: Session Availability Filtering**
    - Generate random session collections with mixed states/dates/spots, verify filtering rules and max 5 results
    - **Validates: Requirements 5.2, 5.3, 5.4**

  - [x] 5.5 Write property test for active session reuse (Property 18)
    - **Property 18: Active Session Reuse**
    - Generate active sessions + same-user triggers, verify reuse instead of duplication
    - **Validates: Requirements 4.10**

  - [x] 5.6 Write property test for unavailable session rejection (Property 19)
    - **Property 19: Unavailable Session Rejection**
    - Generate sessions with status ≠ open or spots = 0, verify rejection and no state transition
    - **Validates: Requirements 4.4**

- [x] 6. Implement Deep Link Resolution page
  - [x] 6.1 Create /guest/book/[token] route
    - Create `src/app/guest/book/[token]/page.tsx` as a Server Component
    - Extract token from URL params, extract optional UTM params from search params
    - Call `TokenService.validateAndConsume(token)`
    - On valid + bookable session: redirect to `/express-booking/[sessionId]?source=social_<channel>&campaign=<name>`
    - On invalid/expired/consumed: render error page with message and restart instructions
    - On session unavailable: render session-unavailable page with restart instructions
    - Apply deep link rate limiting (20 req/min per IP) and IP blocking (5 failures → 30min block)
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 11.4, 11.5_

  - [x] 6.2 Implement UTM parameter validation and storage
    - Validate UTM params: only `[A-Za-z0-9._-]`, max 128 chars per value
    - Ignore invalid params, preserve valid ones
    - Store valid UTM data on Social_Booking_Session `campaign` field
    - Pass through to redirect URL as query params
    - _Requirements: 7.5, 9.1, 9.2, 9.3_

  - [x] 6.3 Write property test for deep link resolution redirect (Property 11)
    - **Property 11: Deep Link Resolution Redirect**
    - Generate valid tokens + sessions, verify redirect URL contains correct sessionId, source, and campaign params
    - **Validates: Requirements 7.1, 7.3, 7.4**

  - [x] 6.4 Write property test for UTM parameter validation (Property 12)
    - **Property 12: UTM Parameter Validation**
    - Generate random strings of various characters/lengths, verify accept/reject boundary at 128 chars and allowed charset
    - **Validates: Requirements 7.5, 9.1, 9.3**

- [x] 7. Implement Attribution Propagation
  - [x] 7.1 Extend create-guest-intent to propagate social attribution
    - Modify `src/app/api/payments/create-guest-intent/route.ts` to accept `source` and `campaign` query params from the redirect URL
    - Write `source`, `campaign`, and `socialBookingSessionId` fields to the `booking_drafts` document
    - Do not modify any existing fields or the existing request schema
    - _Requirements: 8.3, 15.2_

  - [x] 7.2 Extend Stripe webhook to write acquisition metadata
    - Modify `src/app/api/webhooks/stripe/route.ts` in the guest payment handler
    - When draft contains social attribution fields, add `acquisition: { bookingSource, campaign, socialBookingSessionId }` to the booking document
    - If social attribution is missing, write `bookingSource: 'website_express'` for guest bookings
    - Use same Firestore transaction and document structure as website-originated bookings
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 15.3, 15.4, 15.7_

  - [x] 7.3 Write property test for attribution propagation (Property 13)
    - **Property 13: Attribution Propagation Round-Trip**
    - Generate attribution data, trace through session → draft → booking, verify all fields propagated correctly
    - **Validates: Requirements 8.1, 8.3, 9.6**

- [x] 8. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Implement Meta Webhook Handler
  - [x] 9.1 Create POST /api/webhooks/meta route
    - Create `src/app/api/webhooks/meta/route.ts`
    - Implement signature verification: read raw body, compute HMAC-SHA256 with `META_APP_SECRET`, compare to `X-Hub-Signature-256` header (timing-safe comparison)
    - Reject with HTTP 403 if signature invalid or header missing
    - Implement replay protection: reject events with timestamp > 5 minutes old
    - Implement idempotency: check event ID against Vercel KV (`meta_event:<eventId>` with 24h TTL), skip if already processed
    - Determine channel from payload structure and route to appropriate adapter
    - Delegate to `SocialBookingService.handleInboundMessage()`
    - Return HTTP 200 within 5 seconds
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 11.1, 11.6_

  - [x] 9.2 Implement GET verification challenge handler
    - In same route file, implement GET handler
    - Check `hub.mode === 'subscribe'` and `hub.verify_token === META_WEBHOOK_VERIFY_TOKEN`
    - Return `hub.challenge` with 200, or 403 if token mismatch or mode invalid
    - _Requirements: 3.10, 11.7, 11.8_

  - [x] 9.3 Write property test for webhook signature verification (Property 1)
    - **Property 1: Webhook Signature Verification**
    - Generate random payloads + random keys, verify HMAC acceptance/rejection boundary
    - **Validates: Requirements 3.2, 3.3, 3.4, 11.1**

  - [x] 9.4 Write property test for channel routing (Property 2)
    - **Property 2: Channel Routing from Payload Structure**
    - Generate payloads with WhatsApp/Instagram/Messenger structures, verify correct routing
    - **Validates: Requirements 3.5, 3.7**

  - [x] 9.5 Write property test for event idempotency (Property 3)
    - **Property 3: Event Idempotency**
    - Generate random events, process twice, verify no duplicate sessions or adapter responses
    - **Validates: Requirements 3.9**

  - [x] 9.6 Write property test for replay protection (Property 4)
    - **Property 4: Replay Protection**
    - Generate events with timestamps ±5 min, verify acceptance boundary
    - **Validates: Requirements 11.6**

- [x] 10. Implement WhatsApp Channel Adapter (Phase 2)
  - [x] 10.1 Implement WhatsApp adapter
    - Create `src/lib/social-booking/adapters/whatsapp.ts`
    - Implement `ChannelAdapter` interface for WhatsApp Cloud API
    - Implement `parseEvent`: extract message type, sender ID, message text/button reply from WhatsApp webhook payload
    - Implement `sendSessionList`: use interactive list messages (up to 10 options) or buttons (up to 3)
    - Implement `sendCheckoutLink`: send text message with CTA URL button
    - Implement `sendBookingConfirmation`: send confirmation with class name, date, time, venue only
    - Implement `sendHelpMessage`, `sendNoSessionsMessage`, `sendSessionUnavailableMessage`, `sendErrorMessage`
    - All Meta API calls wrapped in try/catch with single retry after 2s on failure
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7_

  - [x] 10.2 Write property test for data minimisation (Property 14)
    - **Property 14: Data Minimisation in Social Messages**
    - Generate sessions with sensitive fields, verify none appear in outbound adapter messages
    - **Validates: Requirements 10.1, 10.3, 10.5, 10.7, 16.3, 16.4**

  - [x] 10.3 Write unit tests for WhatsApp adapter
    - Test trigger word detection (case-insensitive "Book", "Classes", "Hi")
    - Test unrecognised command sends help message
    - Test interactive button/list message format
    - Test retry on API failure
    - _Requirements: 12.1, 12.7_

- [x] 11. Implement Instagram Channel Adapter (Phase 3)
  - [x] 11.1 Implement Instagram adapter
    - Create `src/lib/social-booking/adapters/instagram.ts`
    - Implement `ChannelAdapter` interface for Instagram Messaging API
    - Implement `parseEvent`: extract message type, sender ID from Instagram DM webhook payload
    - Implement `sendSessionList`: structured text messages with quick reply buttons
    - Implement `sendCheckoutLink`: send clickable URL
    - Implement `sendBookingConfirmation`: class name, date, time, venue, booking ref (last 8 chars of PI ID)
    - Retry once after 2s on failure, log without affecting session state
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6_

  - [x] 11.2 Write unit tests for Instagram adapter
    - Test DM trigger detection and session list format
    - Test quick reply handling
    - Test retry behaviour on API failure
    - _Requirements: 13.1, 13.6_

- [x] 12. Implement Messenger Channel Adapter (Phase 4)
  - [x] 12.1 Implement Messenger adapter
    - Create `src/lib/social-booking/adapters/messenger.ts`
    - Implement `ChannelAdapter` interface for Messenger Platform Send API
    - Implement `parseEvent`: extract message type, sender ID from Messenger webhook payload
    - Implement `sendSessionList`: structured templates or quick replies with session info
    - Implement `sendCheckoutLink`: send deep link as clickable URL
    - Implement `sendBookingConfirmation`: class name, date, time, venue, booking ref — no sensitive data
    - Respond within 5 seconds, retry once after 2s on failure
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6_

  - [x] 12.2 Write unit tests for Messenger adapter
    - Test trigger detection and session option presentation
    - Test structured template format
    - Test retry behaviour and error isolation
    - _Requirements: 14.1, 14.6_

- [x] 13. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 14. Wire Social Booking Service core orchestration
  - [x] 14.1 Implement SocialBookingService core
    - Create `src/lib/social-booking/index.ts` implementing the `SocialBookingService` interface
    - Wire `handleInboundMessage`: detect trigger words, route to session discovery or selection handling
    - Wire `generateCheckoutToken`: call TokenService, update session state to 'checkout-created', apply rate limit
    - Wire `validateAndConsumeToken`: delegate to TokenService
    - Wire `confirmBooking`: update session state to 'confirmed', trigger social confirmation
    - Wire `sendSocialConfirmation`: resolve adapter from session channel, call `sendBookingConfirmation`
    - Wire `getAvailableSessions`: delegate to session discovery query
    - Register adapters by channel — no platform-specific imports in core
    - _Requirements: 2.1, 2.2, 2.4, 2.5, 2.6, 2.7, 2.8_

  - [x] 14.2 Wire Stripe webhook to trigger social confirmation
    - In `src/app/api/webhooks/stripe/route.ts`, after guest booking creation with social attribution:
    - Asynchronously call `SocialBookingService.confirmBooking()` and `sendSocialConfirmation()`
    - Do not block the webhook response — fire and forget with error logging
    - _Requirements: 16.1, 16.2, 16.5, 16.6_

- [x] 15. Implement Admin Panel Enhancements
  - [x] 15.1 Add source attribution badges to admin bookings
    - Modify `src/app/admin/bookings/` page to display a labelled badge for each booking's `bookingSource`
    - Badge labels: "WhatsApp", "Instagram", "Messenger", "Website", "Website (Guest)"
    - Display campaign name when present
    - _Requirements: 8.5, 17.1_

  - [x] 15.2 Add source filtering to admin bookings
    - Add a filter dropdown to the admin bookings panel with options: All, Website, Website (Guest), WhatsApp, Instagram, Messenger
    - Filter bookings list by selected `bookingSource` value
    - _Requirements: 8.6, 17.2_

  - [x] 15.3 Add booking source summary to admin dashboard
    - Display summary of bookings by acquisition source for current calendar month
    - Show booking count and total revenue (£) per source
    - _Requirements: 17.3_

  - [x] 15.4 Add social booking link generator to admin sessions
    - Add a "Generate Social Link" control on `src/app/admin/sessions/` page for each session
    - Allow admin to enter optional campaign name (max 50 chars, `[A-Za-z0-9_-]` only)
    - Generate deep link URL: `/guest/book/[token]?utm_campaign=<name>`
    - Copy to clipboard with visual confirmation (2+ seconds)
    - Show warning if session is not 'open' or spotsAvailable is 0 (still allow generation)
    - _Requirements: 9.5, 17.4, 17.5, 17.6_

  - [x] 15.5 Write unit tests for admin source badges and filtering
    - Test each source renders correct badge label
    - Test filter by each source and "All"
    - _Requirements: 8.5, 8.6, 17.1, 17.2_

- [x] 16. Add Firestore security rules for social_booking_sessions
  - [x] 16.1 Update firestore.rules
    - Add deny-all rule for `social_booking_sessions` collection (server-side only via Admin SDK)
    - Add deny-all rule matching pattern: `match /social_booking_sessions/{docId} { allow read, write: if false; }`
    - _Requirements: 4.2, 10.5_

- [x] 17. Implement regression and integration tests
  - [x] 17.1 Write regression tests for existing booking flows
    - Verify authenticated booking flow unchanged (create-intent → webhook → booking doc)
    - Verify guest express checkout flow unchanged (create-guest-intent → webhook → booking doc)
    - Verify bundle booking flow unchanged
    - _Requirements: 15.1, 15.2, 15.3, 15.6, 19.5_

  - [x] 17.2 Write integration test for full social booking flow
    - Test end-to-end: trigger → session list → select → token → redirect → payment → booking with attribution
    - _Requirements: 19.3, 19.4_

  - [x] 17.3 Write webhook verification challenge tests
    - Test valid challenge returns hub.challenge with 200
    - Test invalid token returns 403
    - Test missing mode returns 403
    - _Requirements: 19.6, 19.7_

- [x] 18. Create test helpers and shared fixtures
  - [x] 18.1 Create shared test utilities
    - Create `src/__tests__/social-booking/helpers/generators.ts` with fast-check arbitraries for: tokens, webhook payloads, Social_Booking_Session documents, SessionSummary objects, UTM params
    - Create `src/__tests__/social-booking/helpers/mocks.ts` with Firestore/KV/Stripe/Meta API mocks
    - Create `src/__tests__/social-booking/helpers/fixtures.ts` with static test data
    - _Requirements: 19.1, 19.2_

- [x] 19. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- Phase 1 (Foundation) = Tasks 1–8: types, tokens, rate limiting, sessions, deep links, attribution
- Phase 2 (WhatsApp) = Tasks 9–10: webhook handler + WhatsApp adapter
- Phase 3 (Instagram) = Task 11: Instagram adapter
- Phase 4 (Messenger) = Task 12: Messenger adapter
- Admin enhancements (Task 15) can proceed in parallel with adapter phases
- The existing `/express-booking/[sessionId]` page and Stripe webhook remain the checkout + booking engine — social channels only funnel users there

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3", "18.1"] },
    { "id": 1, "tasks": ["2.1", "3.1", "16.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.4", "3.2", "3.3", "3.4"] },
    { "id": 3, "tasks": ["2.5", "2.6", "5.1", "5.2"] },
    { "id": 4, "tasks": ["5.3", "5.4", "5.5", "5.6", "6.1", "6.2"] },
    { "id": 5, "tasks": ["6.3", "6.4", "7.1"] },
    { "id": 6, "tasks": ["7.2", "7.3"] },
    { "id": 7, "tasks": ["9.1", "9.2"] },
    { "id": 8, "tasks": ["9.3", "9.4", "9.5", "9.6", "10.1"] },
    { "id": 9, "tasks": ["10.2", "10.3", "11.1", "15.1", "15.2"] },
    { "id": 10, "tasks": ["11.2", "12.1", "15.3", "15.4"] },
    { "id": 11, "tasks": ["12.2", "14.1", "15.5"] },
    { "id": 12, "tasks": ["14.2"] },
    { "id": 13, "tasks": ["17.1", "17.2", "17.3"] }
  ]
}
```
