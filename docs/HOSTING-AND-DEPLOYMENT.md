# Hosting & Deployment Reference

This document lists everything needed to keep bloomingtastebuds.com running. Use it as a checklist if you ever change hosting, domain registrar, or deployment platform.

---

## Current Setup (as of July 2026)

| Service | Purpose | Account |
|---------|---------|---------|
| GoDaddy | Domain registrar (bloomingtastebuds.com) | — |
| Vercel | App hosting & deployment (Next.js) | amitvad2 |
| Firebase | Auth, Firestore DB, Storage | blooming-tastebuds project |
| Stripe | Payments (live mode) | Blooming Tastebuds |
| Resend | Transactional emails | amitvad2@gmail.com |
| GitHub | Source code repo | amitvad2/bt-mvp |

---

## DNS Records (GoDaddy)

| Type | Name | Value | Purpose |
|------|------|-------|---------|
| A | @ | 76.76.21.21 | Points root domain to Vercel |
| CNAME | www | cname.vercel-dns.com (or Vercel-specific hash) | Points www to Vercel |
| TXT | resend._domainkey | (long DKIM key from Resend) | Email authentication (DKIM) |
| MX | send | feedback-smtp.amazonses.com (priority 10) | Resend email sending |
| TXT | send | v=spf1 include:amazonses.com ~all | Resend SPF |
| TXT | _dmarc | v=DMARC1; p=none; | Email deliverability |
| TXT | @ | google-site-verification=... | Google Search Console (keep!) |

**Important:** If you change nameservers, all these records need to be recreated at the new DNS provider.

---

## Environment Variables (Vercel)

These must be set in Vercel → Project Settings → Environment Variables:

### Firebase
| Variable | Example | Notes |
|----------|---------|-------|
| FIREBASE_ADMIN_SERVICE_ACCOUNT | `{"project_id":...}` | Full JSON service account (single line). **Sensitive.** |
| NEXT_PUBLIC_FIREBASE_API_KEY | AIzaSy... | Browser-safe |
| NEXT_PUBLIC_FIREBASE_APP_ID | 1:123... | Browser-safe |
| NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN | project.firebaseapp.com | Browser-safe |
| NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID | 123456 | Browser-safe |
| NEXT_PUBLIC_FIREBASE_PROJECT_ID | blooming-tastebuds | Browser-safe |
| NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET | project.appspot.com | Browser-safe |

### Stripe
| Variable | Example | Notes |
|----------|---------|-------|
| STRIPE_SECRET_KEY | sk_live_... | **Sensitive.** Never expose. |
| NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY | pk_live_... | Browser-safe (intentionally public) |
| STRIPE_WEBHOOK_SECRET | whsec_... | **Sensitive.** Unique per webhook endpoint URL. |

### Resend (Email)
| Variable | Example | Notes |
|----------|---------|-------|
| RESEND_API_KEY | re_... | **Sensitive.** |
| RESEND_FROM_EMAIL | noreply@bloomingtastebuds.com | Must match verified domain in Resend |
| RESEND_ADMIN_EMAIL | bloomingtastebuds@gmail.com | Admin notification recipient |

### App
| Variable | Example | Notes |
|----------|---------|-------|
| NEXT_PUBLIC_APP_URL | https://www.bloomingtastebuds.com | Used in email links. Update if domain changes. |

---

## If You Change Domain Registrar (e.g., leave GoDaddy)

1. Transfer domain to new registrar
2. Recreate ALL DNS records listed above at the new provider
3. Wait for DNS propagation (up to 48 hours)
4. Verify Vercel still shows "Valid Configuration" for the domain
5. Verify Resend domain status still shows "Verified" (may need to re-verify)

---

## If You Change Deployment Platform (e.g., leave Vercel)

1. Set up the new platform to deploy the Next.js app from GitHub
2. Add ALL environment variables listed above to the new platform
3. Update DNS A/CNAME records to point to the new platform's IP/hostname
4. **Stripe webhook URL must be updated:**
   - Stripe Dashboard → Developers → Webhooks
   - Change endpoint URL from `https://www.bloomingtastebuds.com/api/webhooks/stripe` to the new URL
   - Copy the new webhook signing secret → update `STRIPE_WEBHOOK_SECRET`
5. Redeploy and test a booking end-to-end

---

## If You Change Payment Provider (e.g., leave Stripe)

This would require significant code changes. The following files depend on Stripe:
- `src/app/api/payments/create-intent/route.ts`
- `src/app/api/webhooks/stripe/route.ts`
- `src/app/book/[sessionId]/payment/page.tsx`
- `src/app/book/bundle/[bundleId]/payment/page.tsx`
- `src/lib/stripe.ts`
- All `@stripe/react-stripe-js` and `@stripe/stripe-js` imports

---

## If You Change Email Provider (e.g., leave Resend)

1. Replace `src/lib/resend.ts` with the new provider's client
2. Update email sending calls in:
   - `src/app/api/webhooks/stripe/route.ts` (confirmation emails)
   - `src/app/api/emails/send/route.ts` (cancellation emails)
   - `src/app/api/contact/route.ts` (contact form notifications)
3. Remove Resend DNS records from GoDaddy
4. Add new provider's DNS records (SPF, DKIM, DMARC)
5. Update `RESEND_API_KEY` and `RESEND_FROM_EMAIL` env vars (or rename them)

---

## Firebase Authorized Domains

Firebase Auth blocks Google sign-in on unrecognized domains. If you change domains:

1. Firebase Console → Authentication → Settings → Authorized domains
2. Add the new domain (e.g., `bloomingtastebuds.com`, `www.bloomingtastebuds.com`)
3. Keep `localhost` for local development

---

## Stripe Webhook Checklist

The webhook at `/api/webhooks/stripe` is critical — it creates bookings after payment.

If the endpoint URL changes:
1. Stripe Dashboard → Developers → Webhooks → Edit destination
2. Update the URL
3. Copy the new signing secret → update `STRIPE_WEBHOOK_SECRET` in env vars
4. Subscribe to events: `payment_intent.succeeded`, `payment_intent.payment_failed`
5. Test with Stripe CLI or a real £1 payment

---

## Firestore Rules & Indexes

If you redeploy Firebase (rare):
```bash
npx firebase-tools deploy --only firestore:rules
npx firebase-tools deploy --only firestore:indexes
```

Rules file: `firestore.rules`
Indexes file: `firestore.indexes.json`

---

## Quick Health Check After Any Change

1. ✅ Site loads at `https://www.bloomingtastebuds.com`
2. ✅ Google sign-in works (Firebase authorized domains)
3. ✅ Email/password sign-in works
4. ✅ Sessions load on `/classes` page (Firestore reads working)
5. ✅ Admin panel accessible at `/admin` (Firestore rules deployed)
6. ✅ Test booking completes (Stripe + webhook + email all working)
7. ✅ Confirmation email received with correct from-address
8. ✅ Cancellation from portal works and email is sent
