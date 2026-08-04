# Blooming Tastebuds — MVP

A full-stack Next.js web application for **Blooming Tastebuds**, a UK cooking class business. Parents and young adults discover sessions, register, and book classes; admins manage all content via a built-in admin panel.

---

## What It Does

- **Public website** — homepage, about, gallery, testimonials, contact, terms pages
- **Authentication** — email/password + Google OAuth; parent and young-adult roles
- **User portal** — session discovery (map + list), booking management, student profiles, payment history
- **Multi-step booking wizard** — student selection, medical info, dietary questionnaire, T&Cs, Stripe payment, confirmation
- **Session bundles** — discounted multi-session packages with their own booking wizard
- **Admin panel** — CRUD for venues, classes, sessions, bundles, class types, recipes, gallery, instructors, bookings, contact inbox
- **Stripe payments** — PaymentIntent flow with webhook-based server-side booking creation
- **Email notifications** — Resend (booking confirmation, cancellation, admin notifications)
- **Interactive maps** — Leaflet session finder on homepage and portal

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js (App Router) | 16.1.6 |
| Language | TypeScript | 5.x |
| UI Runtime | React | 19.2.3 |
| Auth | Firebase Auth (email/password + Google OAuth) | 12.9.0 |
| Database | Firebase Firestore | 12.9.0 |
| File Storage | Firebase Storage | 12.9.0 |
| Server SDK | Firebase Admin SDK | 13.6.1 |
| Payments | Stripe (PaymentIntent + Elements) | 20.3.1 |
| Email | Resend | 6.9.2 |
| Maps | Leaflet + React-Leaflet | 1.9.4 / 5.0.0 |
| Forms | React Hook Form + Zod | 7.71.1 / 4.3.6 |
| Icons | Lucide React | 0.574.0 |
| Styling | CSS Modules + CSS custom properties | — |
| Deployment | Vercel | — |
| Testing | Vitest + Testing Library + fast-check | — |

No component library (Tailwind, Material UI, Chakra) — all UI is hand-crafted with CSS Modules.

---

## Local Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Create `.env.local` in the repo root with the variables listed below (no `.env.local.example` file exists; use this README as the reference):

```bash
# Firebase client SDK (safe to expose)
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=

# Firebase Admin SDK — full service account JSON as a single-line string
# Download from Firebase Console → Project Settings → Service Accounts → Generate new private key
FIREBASE_ADMIN_SERVICE_ACCOUNT={"type":"service_account","project_id":"...","private_key":"...","client_email":"..."}

# Stripe
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...   # From: stripe listen output (local) or Stripe Dashboard (prod)

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Resend (omit to skip emails silently in local dev)
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=noreply@yourdomain.com   # Must match verified Resend domain in production
RESEND_ADMIN_EMAIL=admin@yourdomain.com    # Receives booking and contact notifications
```

### 3. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 4. Forward Stripe webhooks (local only)

In a second terminal:

```bash
stripe listen --forward-to http://localhost:3000/api/webhooks/stripe
```

Copy the `whsec_...` secret and set it as `STRIPE_WEBHOOK_SECRET` in `.env.local`. Restart the dev server.

### 5. Run tests

```bash
npm test          # watch mode
npm run test:run  # single run
```

### 6. Lint

```bash
npm run lint
```

---

## Architecture Overview

### Payment and Booking Flow

Booking creation is exclusively server-side:

1. Client calls `POST /api/payments/create-intent` with a Bearer token + booking payload
2. Server verifies Firebase ID token, reads authoritative price from Firestore, creates a Stripe PaymentIntent, writes a `booking_drafts/{piId}` document via Firebase Admin SDK
3. Client renders Stripe `<PaymentElement>` and calls `stripe.confirmPayment()`
4. Stripe sends `payment_intent.succeeded` webhook to `POST /api/webhooks/stripe`
5. Webhook reads the draft, runs a Firestore transaction (idempotency check + capacity decrement + booking creation), sends confirmation email via Resend, deletes the draft
6. Confirmation page polls Firestore until the booking document appears

The browser never writes to the `bookings` or `booking_drafts` collections. Firestore security rules deny client writes to both.

### Route Protection

- `src/middleware.ts` — Edge middleware checks the `bt_session` cookie (set on login). Redirects unauthenticated users away from `/book/*` and `/admin/*`.
- The cookie is a plain boolean — it is a UX gate, not a security boundary. Real security is enforced by Firestore rules and server-side token verification in API routes.
- Admin role (`users/{uid}.role == 'admin'`) is enforced client-side by the portal/admin layouts and server-side by Firestore security rules.

### Firebase Security

- Firestore rules: `firestore.rules` (deploy: `firebase deploy --only firestore:rules`)
- Storage rules: `storage.rules`
- See [docs/firestore-rules-notes.md](docs/firestore-rules-notes.md) for rule design decisions

---

## Deployment

The app is deployed to **Vercel**. Firebase services (Auth, Firestore, Storage) are cloud-hosted.

- All environment variables must be set in Vercel → Project Settings → Environment Variables
- Stripe webhook endpoint must be registered in Stripe Dashboard → Webhooks pointing to `https://yourdomain.com/api/webhooks/stripe` with events `payment_intent.succeeded` and `payment_intent.payment_failed`
- `firebase deploy --only firestore:rules` must be run to deploy updated Firestore rules
- See [docs/HOSTING-AND-DEPLOYMENT.md](docs/HOSTING-AND-DEPLOYMENT.md) for the full hosting and DNS reference

---

## Documentation

| Doc | Purpose |
|-----|---------|
| [docs/01-codebase-overview.md](docs/01-codebase-overview.md) | Tech stack, directory structure, routing, config |
| [docs/02-current-features.md](docs/02-current-features.md) | Inventory of what is built |
| [docs/03-gap-analysis-vs-requirements.md](docs/03-gap-analysis-vs-requirements.md) | Requirements vs. code |
| [docs/04-user-flows.md](docs/04-user-flows.md) | User journeys: current state + missing steps |
| [docs/05-data-model-recommendation.md](docs/05-data-model-recommendation.md) | Firestore collections and schema |
| [docs/06-api-and-integrations.md](docs/06-api-and-integrations.md) | All API routes and third-party integrations |
| [docs/07-mvp-roadmap.md](docs/07-mvp-roadmap.md) | Phased build plan with statuses |
| [docs/08-claude-md.md](docs/08-claude-md.md) | AI-optimised context for coding sessions |
| [docs/HOSTING-AND-DEPLOYMENT.md](docs/HOSTING-AND-DEPLOYMENT.md) | Hosting, DNS, env vars, deployment reference |
| [docs/firestore-rules-notes.md](docs/firestore-rules-notes.md) | Firestore rules design and deployment |
| [docs/stripe-webhook-notes.md](docs/stripe-webhook-notes.md) | Webhook architecture, test steps, edge cases |
| [docs/payment-init-debug-notes.md](docs/payment-init-debug-notes.md) | Firebase Admin SDK setup and payment debugging |
