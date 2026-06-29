# Tech Stack

## Core Framework & Language

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js App Router | 16.1.6 |
| Language | TypeScript (strict) | 5.x |
| UI Runtime | React | 19.2.3 |
| Styling | CSS Modules + CSS custom properties | — |

No component library (Material UI, Chakra, etc.) — all UI is hand-crafted with CSS Modules.

## Backend & Infrastructure

| Service | Purpose |
|---------|---------|
| Firebase Auth | Email/password + Google OAuth (via `signInWithPopup`) |
| Firebase Firestore | Primary database — client SDK for reads, Admin SDK for writes |
| Firebase Storage | File/image uploads (`adminStorage` exported from `firebase-admin.ts`) |
| Firebase Admin SDK | Server-side Firestore + Auth + Storage (API routes, webhooks) |
| Stripe | Payments — `PaymentIntent` creation + webhook event handling |
| Resend | Transactional email — booking confirmations, cancellations, contact notifications |
| Vercel | Hosting / serverless Next.js runtime |

## Key Libraries

| Library | Version | Purpose |
|---------|---------|---------|
| `react-hook-form` | ^7.71.1 | Form state management throughout the app |
| `zod` | ^4.3.6 | Schema validation — used with `zodResolver` from `@hookform/resolvers` |
| `@hookform/resolvers` | ^5.2.2 | Connects Zod schemas to React Hook Form |
| `leaflet` + `react-leaflet` | 1.9.4 / 5.0.0 | Interactive session maps (always `next/dynamic` with `ssr: false`) |
| `lucide-react` | ^0.574.0 | Icon set used throughout admin, portal, and public pages |
| `firebase` | ^12.9.0 | Client SDK — browser-side reads and auth |
| `firebase-admin` | ^13.6.1 | Server-only — Firestore writes, Auth token verification, Storage |
| `stripe` | ^20.3.1 | Server-side Stripe client |
| `@stripe/react-stripe-js` + `@stripe/stripe-js` | ^5.6.0 / ^8.7.0 | Client-side Stripe Elements (`Elements`, `CardElement`) |
| `resend` | ^6.9.2 | Email delivery client |

## Testing

| Tool | Version | Purpose |
|------|---------|---------|
| `vitest` | ^4.1.4 | Test runner — replaces Jest |
| `@testing-library/react` | ^16.3.2 | Component rendering and interaction |
| `@testing-library/user-event` | ^14.6.1 | Realistic user interaction simulation |
| `@testing-library/jest-dom` | ^6.9.1 | DOM matchers (`toBeInTheDocument`, etc.) — imported in `src/test/setup.ts` |
| `jsdom` | ^29.0.2 | Browser environment simulation |
| `@vitejs/plugin-react` | ^6.0.1 | React JSX transform for Vitest |

Tests live in `src/__tests__/` mirroring the source structure. A CSS module proxy plugin in `vitest.config.ts` stubs `.module.css` imports so `styles.anyClass === 'anyClass'` in tests.

### Test Mocking Patterns
- Firebase modules are mocked with `vi.mock('@/context/AuthContext', ...)` at the top of test files
- `fetch` is stubbed with `vi.stubGlobal('fetch', vi.fn())`
- `vi.clearAllMocks()` is called in `beforeEach` to reset state between tests
- Next.js `Link` is mocked as a plain `<a>` tag in component tests

## Common Commands

```bash
# Development
npm run dev          # Start dev server at http://127.0.0.1:3000

# Production
npm run build        # Next.js production build
npm start            # Start production server

# Quality
npm run lint         # ESLint (config in eslint.config.mjs)
npm run test         # Vitest in watch mode
npm run test:run     # Vitest single run (use this in CI / non-interactive)

# Firebase
firebase deploy --only firestore:rules   # Deploy Firestore security rules
firebase deploy --only storage           # Deploy Storage rules
```

## Environment Variables

All secrets are in `.env.local` (gitignored). See `.env.local.example` for the full list.

Key groups:
- `NEXT_PUBLIC_FIREBASE_*` — Firebase client SDK config (browser-safe)
- `FIREBASE_ADMIN_SERVICE_ACCOUNT` — Full JSON service account as a single-line string (server-side only). Must contain `project_id`, `private_key`, and `client_email`.
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` / `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET`
- `RESEND_API_KEY` / `RESEND_FROM_EMAIL` / `RESEND_ADMIN_EMAIL`
- `NEXT_PUBLIC_APP_URL` — used in email templates for dashboard links

### Admin SDK Initialisation
`src/lib/firebase-admin.ts` exports `adminDb`, `adminAuth`, `adminStorage`, and `adminInitError`. All API routes check `adminInitError` before attempting Firestore writes and return a `500` with a descriptive message if the SDK failed to initialise.

## TypeScript Path Alias

`@/*` maps to `src/*` — always use this alias for imports within `src/`.

```ts
import { BTUser } from '@/types'
import { db } from '@/lib/firebase'
import { adminDb } from '@/lib/firebase-admin'
```

## Security Headers

`next.config.ts` applies the following headers to all routes:
- `X-Frame-Options: SAMEORIGIN`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
