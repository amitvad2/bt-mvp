# Project Structure

## Top-Level Layout

```
bt-mvp/
├── src/                    # All application source code
├── public/                 # Static assets (images, videos, favicon)
├── docs/                   # Architecture and planning docs (not deployed)
├── .kiro/steering/         # AI steering rules
├── firestore.rules         # Firestore security rules
├── firestore.indexes.json  # Composite index definitions
├── storage.rules           # Firebase Storage security rules
├── firebase.json           # Firebase CLI config
├── next.config.ts          # Next.js config (security headers)
├── vitest.config.ts        # Vitest test runner config
├── eslint.config.mjs       # ESLint flat config
└── package.json
```

## Source Tree (`src/`)

```
src/
├── app/                          # Next.js App Router
│   ├── (public)/                 # Route group — public marketing pages (no auth)
│   │   ├── page.tsx              # Homepage (hero, map, CTA)
│   │   ├── HomeCtaButtons.tsx    # 'use client' island for homepage CTAs
│   │   ├── about/                # About page
│   │   ├── classes/              # Public classes listing (ClassesClient.tsx)
│   │   ├── contact/              # Contact form (ContactForm.tsx)
│   │   ├── gallery/              # Photo gallery (GalleryClient.tsx)
│   │   ├── terms/                # Terms & Conditions
│   │   └── testimonies/          # Testimonials (hardcoded; ExpandableReview.tsx)
│   │
│   ├── auth/                     # Unauthenticated auth pages
│   │   ├── login/
│   │   ├── signup/               # Role selection (parent | youngAdult) + Google OAuth
│   │   └── forgot-password/
│   │
│   ├── portal/                   # Authenticated user portal (any role)
│   │   ├── layout.tsx            # Sidebar nav; role-guards client-side; parent-only shows My Students
│   │   ├── dashboard/            # Welcome tiles
│   │   ├── find-class/           # Session browser
│   │   ├── my-classes/           # Upcoming + past bookings; cancel action
│   │   ├── my-payments/          # Payment history
│   │   ├── my-students/          # Parent-only: manage children profiles
│   │   ├── account/              # Profile management
│   │   └── support/              # Help / contact link
│   │
│   ├── book/[sessionId]/         # 6-step booking wizard (dynamic route)
│   │   ├── layout.tsx            # Mounts BookingProvider; progress stepper
│   │   ├── student/              # Step 1 — select student or 'self'
│   │   ├── medical/              # Step 2 — medical info + emergency contact
│   │   ├── questionnaire/        # Step 3 — dietary questionnaire (skipped for youngAdultWeekend)
│   │   ├── terms/                # Step 4 — T&Cs acceptance
│   │   ├── payment/              # Step 5 — Stripe Elements checkout
│   │   └── confirmation/         # Step 6 — polls Firestore until booking doc appears
│   │
│   ├── admin/                    # Admin panel (admin role required)
│   │   ├── layout.tsx            # Sidebar nav; role check redirects non-admins to portal
│   │   ├── dashboard/            # Overview / stats
│   │   ├── venues/               # CRUD — venue locations
│   │   ├── classes/              # CRUD — class definitions (type, schedule, price)
│   │   ├── sessions/             # CRUD — session instances (date, recipe, instructor, spots)
│   │   ├── recipes/              # CRUD — recipe library
│   │   ├── gallery/              # CRUD — gallery images with category tagging
│   │   ├── instructors/          # CRUD — instructor profiles
│   │   ├── bookings/             # Read + manage all bookings
│   │   └── contact/              # Contact message inbox (read / status updates)
│   │
│   ├── api/                      # Next.js API route handlers (server-side)
│   │   ├── payments/create-intent/route.ts   # Creates Stripe PaymentIntent + booking_draft
│   │   ├── emails/send/route.ts              # Sends confirmation / cancellation emails via Resend
│   │   ├── contact/route.ts                  # Saves contact messages + notifies admin via email
│   │   └── webhooks/stripe/route.ts          # Handles payment_intent.succeeded / failed
│   │
│   ├── layout.tsx                # Root layout — mounts AuthProvider, sets <html lang>
│   └── globals.css               # Global CSS tokens, utility classes (btn, badge, card, modal, etc.)
│
├── components/
│   ├── layout/
│   │   ├── Header.tsx            # Public site header with nav + auth state
│   │   └── Footer.tsx            # Public site footer
│   ├── home/
│   │   ├── HeroCanvas.tsx        # Animated canvas element for homepage hero
│   │   ├── HeroCanvasSection.tsx # Section wrapper for HeroCanvas
│   │   ├── MagicCursor.tsx       # Custom cursor effect
│   │   ├── MagicCursorSection.tsx
│   │   ├── MapView.tsx           # Leaflet map (dynamically imported, ssr: false)
│   │   ├── SessionMapFinder.tsx  # Map + session list combo ('use client')
│   │   └── SessionMapSection.tsx # Section wrapper for map
│   └── sessions/
│       └── SessionBrowser.tsx    # Filterable session list for portal/find-class
│
├── context/
│   ├── AuthContext.tsx           # Firebase auth state + Firestore profile; exposes useAuth()
│   └── BookingContext.tsx        # Wizard state persisted to sessionStorage; exposes useBooking()
│
├── lib/
│   ├── firebase.ts               # Firebase client SDK init — exports auth, db, storage
│   ├── firebase-admin.ts         # Admin SDK init — exports adminDb, adminAuth, adminStorage, adminInitError
│   ├── stripe.ts                 # Stripe server-side client (lazy singleton)
│   ├── resend.ts                 # Resend email client
│   └── gallery-categories.ts    # normalizeCategory() + PUBLIC_CATEGORIES / ADMIN_CATEGORIES constants
│
├── types/
│   └── index.ts                  # All shared TypeScript interfaces and types (single source of truth)
│
├── __tests__/                    # Vitest tests mirroring src structure
│   ├── auth/                     # signup-schema.test.ts
│   ├── components/               # ClassesClient, HomeCtaButtons, SessionBrowser, TestimoniesCtaButtons
│   ├── contact/                  # AdminContactPage, api-contact-route, contact-schema, ContactForm
│   ├── gallery/                  # gallery-categories, GalleryClient
│   └── pages/                    # HomePage
│
├── test/
│   └── setup.ts                  # Imports @testing-library/jest-dom (global DOM matchers)
│
└── middleware.ts                 # Edge middleware — UX-layer route protection via bt_session cookie
```

## Routing Conventions

Next.js **App Router** with route groups (folders in parentheses don't affect the URL):

| Route group | Auth required | Role | URL prefix |
|-------------|--------------|------|------------|
| `(public)` | No | Any | `/`, `/about`, `/classes`, `/gallery`, `/contact`, `/terms`, `/testimonies` |
| `auth` | No (redirects if logged in) | Any | `/auth/login`, `/auth/signup`, `/auth/forgot-password` |
| `portal` | Yes (client-side guard) | `parent`, `youngAdult`, `admin` | `/portal/*` |
| `book/[sessionId]` | Yes (middleware) | Any authenticated | `/book/:sessionId/*` |
| `admin` | Yes (middleware + client guard) | `admin` only | `/admin/*` |

**Route protection layers:**
1. `src/middleware.ts` — Edge middleware checks `bt_session` cookie for `/book/*` and `/admin/*`. Cookie is a plain boolean set by `AuthContext` — it is a UX gate, NOT a cryptographic verification.
2. `AdminLayout` — Client-side check: redirects non-admins to `/portal/dashboard`.
3. `PortalLayout` — Client-side check: redirects unauthenticated users to `/auth/login`.
4. Firestore security rules — the actual security boundary for all data access.

## Key Architectural Patterns

### Server vs. Client Components
- Pages default to **Server Components** unless they need interactivity
- Client islands are marked `'use client'` at the top and named with descriptive suffixes (e.g. `HomeCtaButtons.tsx`, `GalleryClient.tsx`, `ClassesClient.tsx`)
- All admin pages are `'use client'` because they do live Firestore reads + CRUD modals
- All portal pages are `'use client'` for the same reason
- Leaflet maps are always `next/dynamic` imported with `ssr: false`

### Data Access
- **Client-side reads**: Firebase client SDK (`db` from `@/lib/firebase`) directly from components/pages
- **Server-side writes**: Firebase Admin SDK only (`adminDb` from `@/lib/firebase-admin`) — used in all API routes and the webhook handler
- **Never** create bookings from the browser; all booking creation goes through the Stripe webhook (`payment_intent.succeeded`)
- **Never** trust client-supplied price or amount — the payment intent API reads price from Firestore server-side
- No custom REST API layer for Firestore data; only Stripe, email, and contact have API routes

### Authentication Flow
- `AuthContext` maintains two state values: `user` (Firebase Auth) and `btUser` (Firestore `users/{uid}` profile)
- Both must be non-null for a user to be fully signed in
- `bt_session` cookie is set eagerly at sign-in/sign-up so middleware sees it immediately on redirect
- `adminAuth.verifyIdToken(token)` is used in server API routes to verify the caller's identity; token is passed as `Authorization: Bearer <idToken>` header

### Forms
- All forms use **React Hook Form + Zod** — define a Zod schema, pass to `zodResolver`
- Import `zodResolver` from `@hookform/resolvers/zod`
- Form state is local to the component; multi-step wizard state lives in `BookingContext`
- Server-side API routes re-validate with Zod independently of the client schema

### Styling
- CSS Modules per component (`.module.css` colocated with the component file)
- Global utility classes (`.btn`, `.badge`, `.card`, `.modal`, `.spinner`, `.alert`, etc.) are defined in `src/app/globals.css`
- Global design tokens (colours, spacing, radii) are CSS custom properties in `globals.css`
- No utility-class framework (no Tailwind)

### Type Definitions
- All shared types live in `src/types/index.ts` — add new entities here, never inline
- Prices are stored in **pence** (integer), not pounds (e.g. `2500` = £25.00)
- Dates are stored as `YYYY-MM-DD` strings in Firestore
- `createdAt` / `updatedAt` fields use Firestore `serverTimestamp()` on write; they are `any` typed due to the `Timestamp | Date` duality

### Firestore Collections

| Collection | Written by | Read by |
|-----------|-----------|---------|
| `users` | Client SDK (sign-up) + Admin SDK | Client SDK (own doc), Admin SDK |
| `students` | Client SDK (parent) | Client SDK (own), Admin SDK |
| `sessions` | Admin SDK (admin panel) | Client SDK (public) |
| `classes` | Admin SDK (admin panel) | Client SDK (public) |
| `venues` | Admin SDK (admin panel) | Client SDK (public) |
| `recipes` | Admin SDK (admin panel) | Client SDK (public) |
| `instructors` | Admin SDK (admin panel) | Client SDK (public) |
| `gallery` | Admin SDK (admin panel) | Client SDK (public) |
| `bookings` | Admin SDK (webhook only) | Client SDK (own), Admin SDK |
| `booking_drafts` | Admin SDK (create-intent) | Admin SDK (webhook) — no client access |
| `contact_messages` | Admin SDK (contact API) | Admin SDK (admin inbox) — no client access |

### Email Templates
Emails are inline HTML strings rendered in API routes. Two route handlers send email:
- `api/webhooks/stripe/route.ts` — sends booking confirmation after `payment_intent.succeeded`
- `api/emails/send/route.ts` — sends confirmation or cancellation triggered by portal actions (requires `Authorization: Bearer <idToken>`)
- `api/contact/route.ts` — sends admin notification email on contact form submission

### State Management
- Auth state: `AuthContext` (wraps entire app in root layout)
- Booking wizard state: `BookingContext` (scoped to `book/[sessionId]` layout, persisted to `sessionStorage` under key `booking_<sessionId>`)
- No global state library (no Redux, Zustand, etc.)
