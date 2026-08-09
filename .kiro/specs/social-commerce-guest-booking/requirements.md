# Requirements Document

## Introduction

Social Commerce Guest Booking extends the existing Blooming Tastebuds guest express checkout capability to social messaging platforms (WhatsApp, Instagram, Messenger). Prospective customers who discover BT through social channels can discover available cooking sessions and complete a booking with minimum friction — without account creation. Social channels serve as booking acquisition/conversation channels while the existing website guest checkout remains the core booking and payment engine. A channel-neutral architecture with platform-specific adapters ensures reusability and prevents duplicated booking/payment logic.

## Glossary

- **Social_Booking_Service**: The channel-neutral service layer that manages social booking session state, generates secure checkout tokens, and orchestrates the conversation-to-checkout flow
- **Channel_Adapter**: A platform-specific module that translates between the unified Social_Booking_Service interface and a specific social platform's messaging API (WhatsApp, Instagram, or Messenger)
- **Meta_Webhook_Handler**: The single API endpoint that receives and verifies webhook events from all Meta social platforms (WhatsApp, Instagram, Messenger)
- **Guest_Checkout_Token**: A cryptographically secure, short-lived, one-time-use token that maps a social booking session to a guest checkout URL
- **Social_Booking_Session**: A Firestore document tracking the lifecycle of a booking initiated through a social channel, from conversation start to checkout completion or expiry
- **Booking_Attribution**: Metadata attached to a confirmed booking recording which acquisition channel and campaign drove the booking
- **Deep_Link**: A URL containing a Guest_Checkout_Token and optional UTM parameters that routes a social channel user directly to a pre-populated guest checkout page for a specific session
- **Session_Inventory**: The shared pool of cooking session availability (spotsAvailable in the sessions collection) consumed by both website and social channel bookings
- **Platform_Feasibility_Document**: A pre-implementation investigation document classifying each Meta platform's messaging API capabilities, permissions, and limitations for conversational booking
- **Stripe_Webhook**: The existing payment_intent.succeeded webhook handler that remains the authoritative creator of booking documents

## Requirements

### Requirement 1: Platform Feasibility Investigation

**User Story:** As a technical lead, I want to understand the current capabilities and limitations of Meta's messaging APIs, so that implementation proceeds with accurate knowledge of what each platform supports.

#### Acceptance Criteria

1. WHEN implementation begins, THE Social_Booking_Service development team SHALL produce a Platform_Feasibility_Document covering WhatsApp Cloud API, WhatsApp Flows, Instagram Messaging API, Facebook Messenger Platform, Meta Webhooks, and Meta App Review/permissions within 5 business days of implementation kickoff
2. THE Platform_Feasibility_Document SHALL classify each platform's capability as "Supported", "Partially Supported", or "Not Supported" (with a cited limitation) for: sending structured messages, receiving user responses, sending interactive buttons/quick replies, sending links, and webhook delivery guarantees, and SHALL document the numeric rate limits (requests per second and daily message caps) for each platform with references to official Meta documentation
3. THE Platform_Feasibility_Document SHALL document the required Meta App Review permissions for each channel and estimated review timelines based on Meta's published guidance or documented community-reported averages
4. THE Platform_Feasibility_Document SHALL identify any platform restrictions (including session window limits, template approval requirements, media type constraints, and message format limitations) that would require modifications to the proposed conversation flow, mapping each restriction to the specific flow step it affects

### Requirement 2: Channel-Neutral Social Booking Architecture

**User Story:** As a developer, I want a reusable channel-neutral architecture, so that adding new social platforms does not require duplicating booking or payment logic.

#### Acceptance Criteria

1. THE Social_Booking_Service SHALL implement a channel-neutral core that contains no imports, references, or conditional logic specific to any single social platform's SDK or API types
2. THE Social_Booking_Service SHALL use Channel_Adapter modules to translate between the core service and platform-specific messaging APIs, where each Channel_Adapter implements a unified adapter interface consumed by the core
3. THE Social_Booking_Service SHALL share the same Session_Inventory as the website guest checkout (sessions Firestore collection)
4. THE Social_Booking_Service SHALL delegate all payment processing to the existing Stripe PaymentIntent flow and the existing Guest_Payment_API endpoint
5. THE Stripe_Webhook SHALL remain the sole authoritative creator of confirmed booking documents
6. THE Social_Booking_Service SHALL NOT implement separate booking creation or payment logic for any social channel
7. IF a Channel_Adapter encounters a platform-specific error during message delivery, THEN THE Social_Booking_Service SHALL handle the failure without affecting other channels or the core booking state, and SHALL update the Social_Booking_Session with an error status
8. WHEN a new Channel_Adapter is added, THE Social_Booking_Service core module SHALL require no code modifications to support the new platform

### Requirement 3: Unified Meta Webhook Endpoint

**User Story:** As a developer, I want a single webhook endpoint for all Meta platforms, so that webhook management is simplified and consistent.

#### Acceptance Criteria

1. THE Meta_Webhook_Handler SHALL expose a single API route (POST /api/webhooks/meta) that receives events from WhatsApp, Instagram, and Messenger
2. WHEN a webhook event is received, THE Meta_Webhook_Handler SHALL verify the request signature using the Meta App Secret and the X-Hub-Signature-256 header
3. IF signature verification fails, THEN THE Meta_Webhook_Handler SHALL reject the request with HTTP 403 and log the verification failure including the request IP and timestamp
4. IF the X-Hub-Signature-256 header is missing from the request, THEN THE Meta_Webhook_Handler SHALL reject the request with HTTP 403 without attempting to parse the body
5. WHEN a valid webhook event is received, THE Meta_Webhook_Handler SHALL determine the originating channel (whatsapp, instagram, or messenger) from the event payload structure
6. IF the webhook event payload does not match any recognised channel format, THEN THE Meta_Webhook_Handler SHALL respond with HTTP 200 (to prevent Meta retries) and log the unrecognised payload structure
7. THE Meta_Webhook_Handler SHALL route verified events to the appropriate Channel_Adapter for processing
8. THE Meta_Webhook_Handler SHALL respond with HTTP 200 within 5 seconds to acknowledge receipt to Meta's servers
9. THE Meta_Webhook_Handler SHALL implement idempotent event processing by storing processed event IDs in Firestore with a 24-hour TTL and skipping events whose ID has already been recorded
10. WHEN the Meta_Webhook_Handler receives a GET request with hub.mode equal to "subscribe" and hub.verify_token matching the configured META_WEBHOOK_VERIFY_TOKEN, THE Meta_Webhook_Handler SHALL respond with HTTP 200 and the hub.challenge value as the response body

### Requirement 4: Social Booking Session Lifecycle

**User Story:** As a customer messaging through a social channel, I want my booking journey tracked seamlessly, so that I can resume or complete the process without losing progress.

#### Acceptance Criteria

1. WHEN a customer initiates a booking conversation (sends a case-insensitive match of "Book", "Classes", "Hi", or clicks a CTA), THE Social_Booking_Service SHALL create a Social_Booking_Session document in the social_booking_sessions Firestore collection with state 'started'
2. THE Social_Booking_Session document SHALL contain: id, channel (one of 'whatsapp', 'instagram', 'messenger'), externalConversationId, externalUserId, state, sessionId (nullable), checkoutTokenHash (nullable), source, campaign, createdAt, expiresAt, and updatedAt fields
3. WHEN a customer selects a session, THE Social_Booking_Service SHALL update the Social_Booking_Session state to 'selecting-session' and record the selected sessionId
4. IF the customer selects a session that is no longer available (status is not 'open' or spotsAvailable is 0), THEN THE Social_Booking_Service SHALL NOT transition to 'selecting-session' and SHALL inform the customer via the Channel_Adapter that the session is unavailable
5. WHEN a checkout URL is generated, THE Social_Booking_Service SHALL update the Social_Booking_Session state to 'checkout-created' and store the checkoutTokenHash
6. WHEN the associated Stripe PaymentIntent enters a pending state, THE Social_Booking_Service SHALL update the Social_Booking_Session state to 'payment-pending'
7. WHEN the Stripe_Webhook confirms the booking, THE Social_Booking_Service SHALL update the Social_Booking_Session state to 'confirmed'
8. WHEN a Social_Booking_Session exceeds its expiresAt timestamp without reaching 'confirmed' state, THE Social_Booking_Service SHALL update the state to 'expired'
9. THE Social_Booking_Session expiresAt SHALL default to 30 minutes from creation
10. IF a customer already has an active (non-expired, non-confirmed) Social_Booking_Session on the same channel, THEN THE Social_Booking_Service SHALL reuse the existing session rather than creating a duplicate

### Requirement 5: Session Discovery via Social Channels

**User Story:** As a prospective customer, I want to discover available cooking sessions through my preferred social platform, so that I can find and book a class without visiting the website.

#### Acceptance Criteria

1. WHEN a customer requests available sessions, THE Channel_Adapter SHALL query the same sessions Firestore collection used by the website and return results within 3 seconds
2. THE Channel_Adapter SHALL display only sessions where status is 'open', spotsAvailable is greater than 0, and date is after the current server date, ordered by date ascending (earliest first)
3. THE Channel_Adapter SHALL present session information including: class name, date (formatted as day DD Mon, e.g. "Sat 19 Jul"), start time (formatted as HH:MM, e.g. "10:30"), venue name, age range (e.g. "5–12"), available spots (integer), and price (formatted as £XX.XX)
4. THE Channel_Adapter SHALL present a maximum of 5 upcoming sessions, selected as the 5 earliest by date from the filtered results
5. WHEN no sessions are available, THE Channel_Adapter SHALL inform the customer that no upcoming sessions are currently available and include the website URL where they can check for future sessions
6. IF the Firestore query fails or times out, THEN THE Channel_Adapter SHALL send the customer a message indicating that sessions cannot be retrieved at this time and suggest trying again shortly

### Requirement 6: Secure Guest Checkout Token Generation

**User Story:** As a system architect, I want checkout tokens to be cryptographically secure and short-lived, so that social booking links cannot be guessed, reused, or exploited.

#### Acceptance Criteria

1. WHEN a customer selects a session via a social channel, THE Social_Booking_Service SHALL generate a Guest_Checkout_Token using a cryptographically secure random generator (minimum 32 bytes, URL-safe base64 encoded)
2. THE Social_Booking_Service SHALL store only the SHA-256 hash of the Guest_Checkout_Token in the Social_Booking_Session document (never the raw token)
3. THE Guest_Checkout_Token SHALL expire 15 minutes after the server-side generation timestamp, regardless of client-side clock values
4. THE Guest_Checkout_Token SHALL be single-use — once a checkout page is successfully loaded with the token, THE Social_Booking_Service SHALL mark the token hash as consumed in the Social_Booking_Session document within a Firestore transaction to prevent concurrent redemption
5. THE Guest_Checkout_Token SHALL contain no personally identifiable information and SHALL be derived solely from random bytes
6. IF an expired, invalid, or already-consumed Guest_Checkout_Token is presented, THEN THE Social_Booking_Service SHALL return an error page displaying a message indicating the link has expired or is no longer valid, along with instructions to restart the booking via the original social channel
7. WHEN the Social_Booking_Service receives a Guest_Checkout_Token for validation, THE Social_Booking_Service SHALL compute the SHA-256 hash of the presented token and compare it against the stored hash to verify authenticity
8. IF two or more concurrent requests present the same valid Guest_Checkout_Token, THEN THE Social_Booking_Service SHALL allow only the first request to consume the token and reject subsequent requests with the expired/invalid error page

### Requirement 7: Guest Checkout Deep-Linking

**User Story:** As a customer, I want to click a link in my social channel and land directly on the checkout page for my selected session, so that the booking process is fast and frictionless.

#### Acceptance Criteria

1. THE Social_Booking_Service SHALL generate Deep_Links in the format /guest/book/[token] that resolve to the existing guest express checkout page pre-populated with the selected session's class name, date, time, venue, and price
2. WHEN a customer opens a Deep_Link, THE Social_Booking_Service SHALL validate the Guest_Checkout_Token (existence, expiry, consumption status) and verify the associated session is still bookable (status is 'open' and spotsAvailable is greater than 0)
3. WHEN a valid Deep_Link is opened and the session is bookable, THE Social_Booking_Service SHALL redirect the customer to the existing /express-booking/[sessionId] page with a source query parameter identifying the originating social channel (e.g., source=social_whatsapp, source=social_instagram, source=social_messenger)
4. WHEN a Deep_Link is resolved, THE Social_Booking_Service SHALL append the social booking session context as query parameters on the redirect URL: source (channel identifier) and campaign (campaign name from the Social_Booking_Session, if present)
5. THE Deep_Link SHALL support optional UTM parameters (utm_source, utm_medium, utm_campaign) with a maximum length of 128 characters per parameter value for marketing campaign tracking
6. IF the Deep_Link token is valid but the associated session is no longer bookable (status is not 'open' or spotsAvailable is 0), THEN THE Social_Booking_Service SHALL display an error page informing the customer that the session is no longer available and suggesting they restart the booking via their social channel

### Requirement 8: Booking Attribution Tracking

**User Story:** As a business owner, I want to know which social channel and campaign each booking came from, so that I can measure the effectiveness of social marketing efforts.

#### Acceptance Criteria

1. WHEN a booking is created via a social channel flow, THE Stripe_Webhook SHALL record on the booking document: bookingSource set to the originating channel (whatsapp_express, instagram_express, or facebook_express), campaign set to the campaign identifier string (maximum 128 characters) or null if no campaign was associated, and socialBookingSessionId set to the Social_Booking_Session document ID
2. WHEN a booking is created via the website (authenticated or guest), THE Stripe_Webhook SHALL record bookingSource as 'website' for authenticated bookings or 'website_express' for guest express checkout bookings
3. THE Social_Booking_Service SHALL propagate the channel, campaign, and Social_Booking_Session ID from the Social_Booking_Session document through the booking draft, so that these fields are available to the Stripe_Webhook at booking creation time
4. IF the Social_Booking_Session referenced by the booking draft does not exist or is in 'expired' state at webhook processing time, THEN THE Stripe_Webhook SHALL still create the booking and record bookingSource from the draft data with campaign set to null
5. THE admin bookings panel SHALL display the bookingSource as a labelled badge and the campaign name (when present) for each booking in the bookings list view
6. THE admin bookings panel SHALL support filtering bookings by bookingSource, allowing selection of individual sources (website, website_express, whatsapp_express, instagram_express, facebook_express) or all sources

### Requirement 9: Deep Link Marketing Campaigns

**User Story:** As a marketing manager, I want to create trackable deep links for social media campaigns, so that I can measure which campaigns drive bookings.

#### Acceptance Criteria

1. THE Social_Booking_Service SHALL accept deep links with UTM query parameters in the format /guest/book/[token]?utm_source=X&utm_medium=Y&utm_campaign=Z, where each UTM parameter value is a maximum of 128 characters containing only alphanumeric characters, hyphens, underscores, and periods
2. WHEN a Deep_Link with one or more UTM parameters (utm_source, utm_medium, utm_campaign) is used, THE Social_Booking_Service SHALL store all provided UTM parameter values on the Social_Booking_Session document in a campaign object containing source, medium, and campaign fields
3. IF any UTM parameter value exceeds 128 characters or contains characters outside the allowed set, THEN THE Social_Booking_Service SHALL ignore that parameter and proceed with token validation using any remaining valid UTM values
4. THE admin bookings panel SHALL display campaign attribution (source, medium, and campaign name) on bookings that originated from deep links containing UTM parameters
5. THE admin sessions page SHALL provide a link-generation control for each session that allows the admin to enter optional utm_source, utm_medium, and utm_campaign values and produces a copyable deep link URL with those parameters appended
6. WHEN a booking is confirmed via the Stripe_Webhook for a social booking session that has campaign data, THE Stripe_Webhook SHALL include the campaign object (source, medium, campaign) in the booking document's acquisition metadata

### Requirement 10: Data Protection in Social Channels

**User Story:** As a data protection officer, I want sensitive information kept out of social messaging platforms, so that we comply with data minimisation principles.

#### Acceptance Criteria

1. THE Channel_Adapter SHALL NOT include medical information, allergy details, emergency contact details, or payment card information in any social channel messages
2. THE Channel_Adapter SHALL NOT store medical, allergy, emergency, or payment information in Meta webhook payloads, conversation metadata, or platform-accessible storage
3. THE Social_Booking_Service SHALL limit social channel conversation content to: class discovery (class name, date, time, venue, price, available spots), session selection, booking initiation, and booking status messages (limited to class name, date, time, venue, and booking reference)
4. WHEN sensitive booking information is required (parent details, child details, medical info, emergency contacts, dietary/allergy info, T&Cs acceptance), THE Social_Booking_Service SHALL collect this information exclusively through the BT secure guest checkout page
5. THE Social_Booking_Session document SHALL NOT store any medical, allergy, emergency contact, or payment information
6. IF a customer sends a message containing patterns matching sensitive data (card numbers, NHS numbers, or detailed medical descriptions), THEN THE Channel_Adapter SHALL NOT echo or store the sensitive content, SHALL respond with a message directing the customer to provide such information only on the secure checkout page, and SHALL discard the sensitive content from conversation logs within the Social_Booking_Session
7. THE Channel_Adapter SHALL NOT include customer email addresses, phone numbers, or full names in outbound social channel messages — outbound messages SHALL address the customer only by first name or the platform's native display name
8. THE Social_Booking_Service SHALL log each social booking session lifecycle event (creation, state transitions, expiry) with channel, timestamp, and session ID to provide an auditable record of data handling without recording message content

### Requirement 11: Security Controls

**User Story:** As a security engineer, I want robust security controls on the social booking flow, so that the system is protected from abuse and unauthorised access.

#### Acceptance Criteria

1. THE Meta_Webhook_Handler SHALL validate webhook signatures using HMAC-SHA256 with the Meta App Secret and the X-Hub-Signature-256 header before processing any event payload
2. THE Social_Booking_Service SHALL store Meta platform access tokens exclusively as server-side environment variables (never prefixed with NEXT_PUBLIC_)
3. IF the token generation rate limit is exceeded (maximum 10 tokens per externalUserId per hour), THEN THE Social_Booking_Service SHALL reject the request with HTTP 429 and include a Retry-After header indicating the number of seconds until the limit resets
4. IF the Deep_Link resolution rate limit is exceeded (maximum 20 requests per IP per minute), THEN THE Social_Booking_Service SHALL reject the request with HTTP 429 and include a Retry-After header indicating the number of seconds until the limit resets
5. IF a Guest_Checkout_Token is presented that does not match any stored hash, THEN THE Social_Booking_Service SHALL increment a failed-attempt counter for the requesting IP and block the IP for 30 minutes after 5 consecutive failures within a 10-minute window
6. THE Social_Booking_Service SHALL implement replay protection by rejecting webhook events whose entry-level timestamp is older than 5 minutes relative to the server's current time, responding with HTTP 403
7. WHEN the Meta_Webhook_Handler receives a GET request with hub.mode equal to "subscribe" and hub.verify_token matching the configured META_WEBHOOK_VERIFY_TOKEN, THE Meta_Webhook_Handler SHALL respond with HTTP 200 and the hub.challenge value as the response body
8. IF the Meta_Webhook_Handler receives a GET verification challenge where hub.verify_token does not match the configured token or hub.mode is not "subscribe", THEN THE Meta_Webhook_Handler SHALL respond with HTTP 403

### Requirement 12: WhatsApp Channel Adapter (Phase 2)

**User Story:** As a customer who uses WhatsApp, I want to discover and initiate a class booking through WhatsApp, so that I can book from my most-used messaging app.

#### Acceptance Criteria

1. WHEN a customer sends a booking trigger message (case-insensitive exact match of "Book", "Classes", or "Hi") to the BT WhatsApp Business number, THE WhatsApp Channel_Adapter SHALL respond with a greeting and available session options (maximum 5 sessions, matching Requirement 5 criteria)
2. THE WhatsApp Channel_Adapter SHALL use WhatsApp interactive message templates (list messages for up to 10 options, or buttons for up to 3 options) to present session options
3. WHEN a customer selects a session via an interactive button or list reply, THE WhatsApp Channel_Adapter SHALL generate a Guest_Checkout_Token (per Requirement 6) and send the Deep_Link (per Requirement 7) to the customer as a text message with a call-to-action URL button
4. IF the selected session is no longer available at selection time (status is not 'open' or spotsAvailable is 0), THEN THE WhatsApp Channel_Adapter SHALL inform the customer that the session is no longer available and re-present the current available sessions
5. WHEN a booking is confirmed via the Stripe_Webhook, THE WhatsApp Channel_Adapter SHALL send a booking confirmation message to the customer containing: class name, date, time, and venue (no medical or payment details)
6. THE WhatsApp Channel_Adapter SHALL use the WhatsApp Cloud API via server-side API calls with the WhatsApp Business Account access token
7. WHEN a customer sends a message that does not match any recognised trigger, THE WhatsApp Channel_Adapter SHALL respond with a helpful message listing the available commands (e.g., "Send 'Book' to see available classes")

### Requirement 13: Instagram Channel Adapter (Phase 3)

**User Story:** As a customer who discovers BT on Instagram, I want to initiate a booking through Instagram DMs, so that I can book without leaving the platform I'm browsing.

#### Acceptance Criteria

1. WHEN a customer sends a booking trigger message (case-insensitive exact match of "Book", "Classes", or "Hi") through Instagram Direct Messages, THE Instagram Channel_Adapter SHALL respond with available session options (maximum 5 sessions, matching Requirement 5 criteria)
2. THE Instagram Channel_Adapter SHALL use the Instagram Messaging API to send structured responses with session details formatted as text messages with quick reply buttons for session selection
3. WHEN a customer selects a session via a quick reply, THE Instagram Channel_Adapter SHALL generate a Guest_Checkout_Token (per Requirement 6) and send the Deep_Link to the customer as a clickable URL
4. WHEN a booking is confirmed via the Stripe_Webhook, THE Instagram Channel_Adapter SHALL send a confirmation message to the customer through Instagram DMs containing: class name, date, time, venue, and booking reference (last 8 characters of PaymentIntent ID) — no medical or payment details
5. THE Instagram Channel_Adapter SHALL reuse the same Social_Booking_Service core logic as the WhatsApp Channel_Adapter
6. IF the Instagram Messaging API returns an error or is unreachable when sending a session list or Deep_Link, THEN THE Instagram Channel_Adapter SHALL retry once after 2 seconds and, if the retry fails, log the failure without affecting the Social_Booking_Session state

### Requirement 14: Messenger Channel Adapter (Phase 4)

**User Story:** As a customer who uses Facebook Messenger, I want to discover and book a cooking class through Messenger, so that I can use my preferred platform.

#### Acceptance Criteria

1. WHEN a customer sends a recognised booking trigger message ("Book", "book", "Classes", "classes", or "Hi") through Facebook Messenger, THE Messenger Channel_Adapter SHALL respond within 5 seconds with available session options including: class name, date, time, venue name, age range, available spots, and price (formatted as £XX.XX), limited to a maximum of 5 upcoming sessions
2. THE Messenger Channel_Adapter SHALL use the Messenger Platform Send API to present session options with structured templates or quick replies
3. WHEN a customer selects a session, THE Messenger Channel_Adapter SHALL generate a Guest_Checkout_Token and send the Deep_Link to the customer
4. WHEN a booking is confirmed via the Stripe_Webhook, THE Messenger Channel_Adapter SHALL send a confirmation message to the customer through Messenger containing: class name, date, time, venue, and a booking reference (last 8 characters of PaymentIntent ID), and SHALL NOT include medical, allergy, emergency contact, payment card, or full PaymentIntent ID information
5. THE Messenger Channel_Adapter SHALL reuse the same Social_Booking_Service core logic as the WhatsApp and Instagram Channel_Adapters
6. IF the Messenger Platform Send API returns an error or is unreachable when sending a session list or Deep_Link, THEN THE Messenger Channel_Adapter SHALL retry the send once after 2 seconds and, if the retry fails, log the failure with the externalUserId and conversation context without affecting the Social_Booking_Session state

### Requirement 15: Existing Booking Flow Regression Protection

**User Story:** As an existing customer, I want the website booking experience to remain unchanged, so that the introduction of social channels does not disrupt my usual booking method.

#### Acceptance Criteria

1. THE Social_Booking_Service SHALL NOT modify the request schema, response schema, authentication requirements, or control flow of the existing authenticated booking endpoints (POST /api/payments/create-intent and the booking wizard at /book/[sessionId])
2. THE Social_Booking_Service SHALL NOT modify the request schema, response schema, or control flow of the existing guest express checkout endpoints (/express-booking/[sessionId] page and POST /api/payments/create-guest-intent)
3. THE Stripe_Webhook handler SHALL process authenticated bookings, existing guest bookings, and bundle bookings using the same code paths and producing the same Firestore document structures as prior to social channel introduction
4. THE Session_Inventory (spotsAvailable) SHALL be decremented within a single Firestore transaction by the Stripe_Webhook regardless of whether the booking originated from website or social channel, using the same transaction logic for all booking sources
5. THE Social_Booking_Service SHALL NOT perform any spotsAvailable read or write on the sessions collection outside of the existing Stripe_Webhook Firestore transaction
6. WHEN the Social_Booking_Service is deployed, THE existing booking flow regression test suite SHALL pass with zero failures against the authenticated booking flow, guest express checkout flow, and webhook processing logic
7. IF the Stripe_Webhook receives a payment_intent.succeeded event with social channel attribution metadata, THEN THE Stripe_Webhook SHALL create the booking document and decrement spotsAvailable using the same Firestore transaction and document structure as website-originated bookings, adding only the acquisition metadata field

### Requirement 16: Social Booking Confirmation Notifications

**User Story:** As a customer who booked via a social channel, I want to receive confirmation both by email and in my social channel, so that I have immediate confidence my booking is complete.

#### Acceptance Criteria

1. WHEN a booking initiated via a social channel is confirmed by the Stripe_Webhook, THE Social_Booking_Service SHALL send a confirmation email using the existing guest confirmation email template within the same webhook processing cycle
2. WHEN a booking initiated via a social channel is confirmed, THE Social_Booking_Service SHALL send a confirmation message through the originating social channel asynchronously without blocking the webhook response, using the channel and externalUserId from the associated Social_Booking_Session document
3. THE social channel confirmation message SHALL contain only: class name, date, time, venue, and a booking reference (last 8 characters of PaymentIntent ID)
4. THE social channel confirmation message SHALL NOT contain medical, allergy, emergency contact, payment card, or full PaymentIntent ID information
5. IF the social channel confirmation message fails to send after a maximum of 2 delivery attempts, THEN THE Social_Booking_Service SHALL log the failure including the Social_Booking_Session ID, channel, externalUserId, and error reason, without affecting the booking confirmation status or email delivery
6. IF the Social_Booking_Session document is unavailable or has been deleted when the Stripe_Webhook attempts to send the social channel confirmation, THEN THE Social_Booking_Service SHALL skip the social channel message, log the missing session reference, and proceed with email confirmation only

### Requirement 17: Admin Visibility and Management

**User Story:** As an admin, I want visibility into social channel bookings and their attribution, so that I can manage operations and understand acquisition performance.

#### Acceptance Criteria

1. THE admin bookings panel SHALL display each booking with a source attribution badge indicating the acquisition channel (WhatsApp, Instagram, Messenger, or Website)
2. THE admin bookings panel SHALL support filtering the bookings list by acquisition source, with options for each individual channel (WhatsApp, Instagram, Messenger, Website) and an "All" option that shows bookings from every source
3. THE admin dashboard SHALL display a summary of bookings by acquisition source for the current calendar month, showing the booking count and total revenue (in £) per source
4. THE admin sessions page SHALL provide a control to generate a social booking Deep_Link for a selected session and copy it to the clipboard, with a visual confirmation indicator displayed for at least 2 seconds after copying
5. WHEN generating a social booking link for a specific session, THE admin panel SHALL allow the admin to specify an optional campaign name (maximum 50 characters, alphanumeric, hyphens, and underscores only) that is appended as the utm_campaign parameter on the generated Deep_Link
6. IF the admin attempts to generate a social booking link for a session whose status is not 'open' or whose spotsAvailable is 0, THEN THE admin panel SHALL display a warning indicating the session is unavailable while still permitting link generation

### Requirement 18: MVP Phasing and Incremental Delivery

**User Story:** As a product owner, I want the feature delivered in incremental phases, so that value is delivered early and risk is managed progressively.

#### Acceptance Criteria

1. THE Social_Booking_Service Phase 1 (Foundation) SHALL deliver: domain model (SocialBookingSession type and Firestore collection), token generation/validation (per Requirements 6 and 7), guest checkout deep-linking, attribution tracking (per Requirement 8), and automated tests covering all acceptance criteria from Requirements 6, 7, 8, and 19
2. THE Social_Booking_Service Phase 2 (WhatsApp) SHALL deliver: WhatsApp Cloud API integration via Channel_Adapter, conversational session discovery, and booking initiation through WhatsApp
3. THE Social_Booking_Service Phase 3 (Instagram) SHALL deliver: Instagram Messaging API integration via Channel_Adapter, reusing the Social_Booking_Service core from Phase 2
4. THE Social_Booking_Service Phase 4 (Messenger) SHALL deliver: Facebook Messenger Platform integration via Channel_Adapter, reusing the Social_Booking_Service core from Phase 2
5. WHEN Phase 1 is complete, a guest SHALL be able to generate a Deep_Link for a session (via admin tool), open it, complete checkout on the existing express-booking page, and have acquisition attribution recorded on the confirmed booking — all without any Meta platform credentials configured
6. Phase 3 (Instagram) and Phase 4 (Messenger) each require Phase 2 (WhatsApp) completion as a prerequisite but may proceed independently of each other

### Requirement 19: Testing Requirements

**User Story:** As a quality engineer, I want comprehensive test coverage for the social booking feature, so that regressions are caught early and security properties are verified.

#### Acceptance Criteria

1. THE Social_Booking_Service test suite SHALL include property-based tests for Guest_Checkout_Token security covering all of the following cases: valid tokens accepted and resolved to the correct Social_Booking_Session, expired tokens (older than 15 minutes) rejected with an error page, already-consumed tokens rejected on second use, tokens with modified characters rejected, truncated tokens rejected, and tokens not matching any stored SHA-256 hash rejected
2. THE Social_Booking_Service test suite SHALL include tests for session availability filtering verifying that only sessions with status 'open', spotsAvailable greater than zero, and date in the future are returned, and that sessions with status 'closed', 'cancelled', or 'full', sessions with spotsAvailable equal to zero, and sessions with past dates are excluded from results
3. THE Social_Booking_Service test suite SHALL include attribution tracking tests verifying that the acquisition source (whatsapp, instagram, facebook, messenger, or website) is propagated from the Social_Booking_Session through the Guest_Checkout_Token to the booking_draft and persists on the confirmed booking document's acquisition object after the Stripe_Webhook fires
4. THE Social_Booking_Service test suite SHALL include idempotency tests verifying that a duplicate Meta webhook event does not create a duplicate Social_Booking_Session or trigger duplicate Channel_Adapter responses, and that a duplicate Stripe payment_intent.succeeded event does not create a second booking document, does not decrement spotsAvailable a second time, and does not send a second confirmation email
5. THE Social_Booking_Service test suite SHALL include regression tests verifying that the existing authenticated booking flow (portal booking wizard through Stripe webhook), the existing guest express checkout flow (/express-booking/[sessionId] through create-guest-intent through Stripe webhook), and the existing Stripe webhook handler all produce correct booking documents without modification from the social booking feature
6. THE Social_Booking_Service test suite SHALL include tests for Meta webhook signature verification (HMAC-SHA256 with Meta App Secret via X-Hub-Signature-256 header): valid signatures accepted with HTTP 200, invalid or missing signatures rejected with HTTP 403
7. THE Social_Booking_Service test suite SHALL include tests for the Meta webhook verification challenge: GET requests with valid hub.verify_token, hub.challenge, and hub.mode parameters return the hub.challenge value, and requests with an invalid hub.verify_token are rejected
