# 01 — Codebase Overview

## Project Purpose

Blooming Tastebuds is a cooking-class business that provides:

- **After School Club** — kids aged 5–12, Mondays 3:30–4:30 pm
- **Weekend Classes** — young adults (university starters), Saturdays or Sundays 10:30 am–12:30 pm

This repository (`bt-mvp`) is the full-stack web application that allows:
- Parents and young adults to discover sessions, register, and book
- Admins to manage venues, classes, sessions, recipes, instructors, and the gallery

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
| Payments | Stripe | 20.3.1 |
| Stripe UI | @stripe/react-stripe-js | 5.6.0 |
| Email | Resend | 6.9.2 |
| Maps | Leaflet + React-Leaflet | 1.9.4 / 5.0.0 |
| Forms | React Hook Form + Zod | 7.71.1 / 4.3.6 |
| Icons | Lucide React | 0.574.0 |
| Styling | CSS Modules + CSS custom properties | — |
| Deployment | Vercel (inferred from `.vercel/` directory) | — |

**No component library (e.g., Material UI, Chakra) is used** — all UI is hand-crafted with CSS Modules.

---

## Directory Structure

```
bt-mvp/
├── src/
│   ├── app/                         # Next.js App Router root
│   │   ├── (public)/               # Route group: public pages
│   │   │   ├── layout.tsx           # Wraps Header + Footer
│   │   │   ├── page.tsx             # Homepage
│   │   │   ├── about/page.tsx
│   │   │   ├── gallery/
│   │   │   │   ├── page.tsx
│   │   │   │   └── GalleryClient.tsx
│   │   │   ├── testimonies/
│   │   │   │   ├── page.tsx
│   │   │   │   └── ExpandableReview.tsx
│   │   │   └── terms/page.tsx
│   │   │
│   │   ├── auth/                    # Route group: unauthenticated auth pages
│   │   │   ├── layout.tsx           # Two-column brand + form layout
│   │   │   ├── login/page.tsx
│   │   │   ├── signup/page.tsx
│   │   │   └── forgot-password/page.tsx
│   │   │
│   │   ├── portal/                  # Route group: authenticated user portal
│   │   │   ├── layout.tsx           # Sidebar + top nav layout
│   │   │   ├── dashboard/page.tsx
│   │   │   ├── find-class/page.tsx  # Map + list session browser
│   │   │   ├── my-classes/page.tsx
│   │   │   ├── my-payments/page.tsx
│   │   │   ├── my-students/page.tsx
│   │   │   ├── account/page.tsx
│   │   │   └── support/page.tsx
│   │   │
│   │   ├── book/[sessionId]/        # Dynamic booking wizard
│   │   │   ├── layout.tsx           # Progress bar layout
│   │   │   ├── student/page.tsx     # Step 1: pick student
│   │   │   ├── medical/page.tsx     # Step 2: medical info
│   │   │   ├── questionnaire/page.tsx # Step 3: dietary questionnaire
│   │   │   ├── terms/page.tsx       # Step 4: accept T&Cs
│   │   │   ├── payment/
│   │   │   │   ├── page.tsx         # Step 5: payment wrapper
│   │   │   │   └── CheckoutForm.tsx # Stripe Elements component
│   │   │   └── confirmation/page.tsx # Step 6: success
│   │   │
│   │   ├── admin/                   # Route group: admin panel
│   │   │   ├── layout.tsx           # Admin sidebar layout
│   │   │   ├── dashboard/page.tsx
│   │   │   ├── bookings/page.tsx
│   │   │   ├── classes/page.tsx
│   │   │   ├── contact/page.tsx
│   │   │   ├── gallery/page.tsx
│   │   │   ├── instructors/page.tsx
│   │   │   ├── recipes/page.tsx
│   │   │   ├── sessions/page.tsx
│   │   │   └── venues/page.tsx
│   │   │
│   │   ├── api/
│   │   │   ├── payments/create-intent/route.ts
│   │   │   ├── emails/send/route.ts
│   │   │   ├── contact/route.ts
│   │   │   └── webhooks/stripe/route.ts
│   │   │
│   │   ├── layout.tsx               # Root layout — AuthProvider wrapper
│   │   └── globals.css
│   │
│   ├── components/
│   │   ├── home/
│   │   │   ├── HeroCanvas.tsx
│   │   │   ├── HeroCanvasSection.tsx
│   │   │   ├── MagicCursor.tsx
│   │   │   ├── MagicCursorSection.tsx
│   │   │   ├── MapView.tsx
│   │   │   ├── SessionMapFinder.tsx
│   │   │   └── SessionMapSection.tsx
│   │   └── layout/
│   │       ├── Header.tsx
│   │       └── Footer.tsx
│   │
│   ├── context/
│   │   ├── AuthContext.tsx          # Firebase auth state + role
│   │   └── BookingContext.tsx       # Multi-step booking state (sessionStorage)
│   │
│   ├── lib/
│   │   ├── firebase.ts              # Firebase client SDK init
│   │   ├── firebase-admin.ts        # Firebase Admin SDK init
│   │   ├── stripe.ts                # Stripe server-side client
│   │   ├── resend.ts                # Resend email client
│   │   └── gallery-categories.ts   # normalizeCategory() + shared category constants
│   │
│   ├── types/
│   │   └── index.ts                 # All shared TypeScript interfaces
│   │
│   └── middleware.ts                # Next.js Edge middleware: route protection
│
├── public/
│   ├── blooming_tastebuds_favicon.ico
│   ├── founder.jpg (nisha-portrait.jpg)
│   ├── images/                      # Hero, gallery, and review photos
│   └── videos/                      # Hero background video (hero-loop.mp4)
│
├── .env.local.example               # Environment variable template
├── storage.rules                    # Firebase Storage security rules
├── next.config.ts
├── tsconfig.json
└── package.json
```

---

## Main Entry Points

| File | Role |
|------|------|
| [src/app/layout.tsx](../src/app/layout.tsx) | Root Next.js layout — mounts `AuthProvider` over entire app |
| [src/app/(public)/page.tsx](../src/app/(public)/page.tsx) | Homepage (`/`) |
| [src/app/auth/login/page.tsx](../src/app/auth/login/page.tsx) | Login entry point |
| [src/middleware.ts](../src/middleware.ts) | Edge middleware — enforces auth on `/book/*` and `/admin/*` |
| [src/context/AuthContext.tsx](../src/context/AuthContext.tsx) | Global auth provider |

---

## Routing / Pages

Next.js App Router with **route groups** and a **dynamic segment** for bookings.

### Public (no auth required)
| Route | File |
|-------|------|
| `/` | `src/app/(public)/page.tsx` |
| `/about` | `src/app/(public)/about/page.tsx` |
| `/gallery` | `src/app/(public)/gallery/page.tsx` |
| `/testimonies` | `src/app/(public)/testimonies/page.tsx` |
| `/terms` | `src/app/(public)/terms/page.tsx` |

### Auth
| Route | File |
|-------|------|
| `/auth/login` | `src/app/auth/login/page.tsx` |
| `/auth/signup` | `src/app/auth/signup/page.tsx` |
| `/auth/forgot-password` | `src/app/auth/forgot-password/page.tsx` |

### User Portal (auth required)
| Route | File |
|-------|------|
| `/portal/dashboard` | `src/app/portal/dashboard/page.tsx` |
| `/portal/find-class` | `src/app/portal/find-class/page.tsx` |
| `/portal/my-classes` | `src/app/portal/my-classes/page.tsx` |
| `/portal/my-payments` | `src/app/portal/my-payments/page.tsx` |
| `/portal/my-students` | `src/app/portal/my-students/page.tsx` |
| `/portal/account` | `src/app/portal/account/page.tsx` |
| `/portal/support` | `src/app/portal/support/page.tsx` |

### Booking Wizard (auth required, dynamic `[sessionId]`)
| Route | File |
|-------|------|
| `/book/[sessionId]/student` | `src/app/book/[sessionId]/student/page.tsx` |
| `/book/[sessionId]/medical` | `src/app/book/[sessionId]/medical/page.tsx` |
| `/book/[sessionId]/questionnaire` | `src/app/book/[sessionId]/questionnaire/page.tsx` |
| `/book/[sessionId]/terms` | `src/app/book/[sessionId]/terms/page.tsx` |
| `/book/[sessionId]/payment` | `src/app/book/[sessionId]/payment/page.tsx` |
| `/book/[sessionId]/confirmation` | `src/app/book/[sessionId]/confirmation/page.tsx` |

### Admin (admin role required)
| Route | File |
|-------|------|
| `/admin/dashboard` | `src/app/admin/dashboard/page.tsx` |
| `/admin/venues` | `src/app/admin/venues/page.tsx` |
| `/admin/classes` | `src/app/admin/classes/page.tsx` |
| `/admin/sessions` | `src/app/admin/sessions/page.tsx` |
| `/admin/recipes` | `src/app/admin/recipes/page.tsx` |
| `/admin/gallery` | `src/app/admin/gallery/page.tsx` |
| `/admin/instructors` | `src/app/admin/instructors/page.tsx` |
| `/admin/bookings` | `src/app/admin/bookings/page.tsx` |
| `/admin/contact` | `src/app/admin/contact/page.tsx` |

### API Routes
| Route | File | Method |
|-------|------|--------|
| `/api/payments/create-intent` | `src/app/api/payments/create-intent/route.ts` | POST |
| `/api/emails/send` | `src/app/api/emails/send/route.ts` | POST |
| `/api/contact` | `src/app/api/contact/route.ts` | POST |
| `/api/webhooks/stripe` | `src/app/api/webhooks/stripe/route.ts` | POST |

---

## Reusable Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `Header` | `src/components/layout/Header.tsx` | Top nav with auth state, mobile menu |
| `Footer` | `src/components/layout/Footer.tsx` | Footer with social links |
| `SessionMapFinder` | `src/components/home/SessionMapFinder.tsx` | Leaflet map for session browsing |
| `SessionMapSection` | `src/components/home/SessionMapSection.tsx` | Lazy-loaded map section |
| `HeroCanvas` | `src/components/home/HeroCanvas.tsx` | Animated canvas hero |
| `MagicCursor` | `src/components/home/MagicCursor.tsx` | Custom interactive cursor |
| `CheckoutForm` | `src/app/book/[sessionId]/payment/CheckoutForm.tsx` | Stripe PaymentElement |
| `ExpandableReview` | `src/app/(public)/testimonies/ExpandableReview.tsx` | Collapsible testimonial card |
| `GalleryClient` | `src/app/(public)/gallery/GalleryClient.tsx` | Client-side gallery render |

---

## State Management

### AuthContext (`src/context/AuthContext.tsx`)
- Wraps the entire app via root layout
- Listens to `onAuthStateChanged` from Firebase Auth
- Fetches the `BTUser` document from Firestore (`users/{uid}`)
- Sets a `bt_session` cookie for middleware-level route protection
- Exposes: `user`, `btUser`, `loading`, `signUp`, `signIn`, `signInWithGoogle`, `logOut`, `resetPassword`

### BookingContext (`src/context/BookingContext.tsx`)
- Scoped to the `book/[sessionId]` route group via `book/[sessionId]/layout.tsx`
- Persists state to `sessionStorage` under key `booking_{sessionId}`
- Hydrates from sessionStorage on mount; survives page refreshes
- Tracks: `session`, `studentId`, `student`, `medicalInfo`, `emergencyContact`, `questionnaire`, `termsAccepted`
- Fetches Session document from Firestore on mount

---

## API Usage (Client → Firebase)

All data operations go through the Firebase client SDK (no custom REST API layer beyond Stripe/email):

| Operation | Collection | Where called |
|-----------|-----------|-------------|
| Read sessions (list) | `sessions` | `portal/find-class`, `SessionMapFinder` |
| Read session (single) | `sessions/{id}` | `BookingContext` |
| Read students | `students` | `book/.../student` |
| Write student | `students` | `book/.../student`, `portal/my-students` |
| Write booking | `bookings` | Stripe webhook handler only (Admin SDK) — never client-side |
| Decrement spots | `sessions/{id}` | Stripe webhook handler only (Admin SDK Firestore transaction) |
| Read bookings | `bookings` | `portal/my-classes`, `portal/my-payments`, `book/.../confirmation` |
| Read/write gallery | `gallery` | `portal/gallery` (admin), `(public)/gallery` |
| Read/write venues | `venues` | `admin/venues` |
| Read/write classes | `classes` | `admin/classes` |
| Read/write recipes | `recipes` | `admin/recipes` |
| Read/write instructors | `instructors` | `admin/instructors` |

---

## Config / Environment Files

| File | Purpose |
|------|---------|
| `.env.local.example` | Documents all required environment variables |
| `.env.local` | Actual secrets (gitignored) |
| `next.config.ts` | Minimal Next.js config |
| `tsconfig.json` | Strict TypeScript; path alias `@/*` → `src/*` |
| `storage.rules` | Firebase Storage: public read, authenticated write |
| `firestore.rules` | Firestore security rules — deployed to `bt-mvp-d057f` |
| `firebase.json` | Firebase CLI config — points rules files for deployment |
| `.firebaserc` | Firebase project alias (`default` → `bt-mvp-d057f`) |
| `eslint.config.mjs` | ESLint (default Next.js config) |

### Required Environment Variables
```
# Firebase Client
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID

# Firebase Admin (server-side)
FIREBASE_ADMIN_SERVICE_ACCOUNT   # JSON-encoded service account

# Stripe
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET

# App
NEXT_PUBLIC_APP_URL

# Email (optional — Resend)
RESEND_API_KEY
RESEND_FROM_EMAIL
```

---

## Deployment Clues

- A `.vercel/` directory exists in the repo root, indicating the project was or is deployed to **Vercel**.
- No custom server — relies on Vercel's serverless Next.js runtime.
- `npm run build` + `npm start` work for self-hosted deployment.
- Firebase services (Firestore, Auth, Storage) are cloud-hosted and require no additional infrastructure.

---

## How the App Currently Runs

```bash
# Install dependencies
npm install

# Copy and fill in environment variables
cp .env.local.example .env.local

# Start dev server (http://localhost:3000)
npm run dev

# Build for production
npm run build
npm start
```

The app boots as a standard Next.js 16 application. On first load, `AuthContext` initialises Firebase and listens for auth-state changes. The Edge middleware (`src/middleware.ts`) intercepts requests before page render and redirects unauthenticated users away from protected routes.
