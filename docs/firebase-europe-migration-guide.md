# Firebase Europe Migration Guide

Migrate Blooming Tastebuds Firebase from US (nam5) → Europe (europe-west2 / London).

**Strategy**: Dev first → verify → Production second.

---

## Prerequisites

- Firebase CLI installed: `npm install -g firebase-tools`
- Google Cloud CLI installed: https://cloud.google.com/sdk/docs/install
- Logged in to both: `firebase login` and `gcloud auth login`
- Access to Vercel dashboard or CLI (`npm i -g vercel`)

---

## Phase 1: Create New Dev Project in Europe

### 1.1 Create the Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click **Add project**
3. Name it something like `bt-mvp-dev-eu` (the project ID must be globally unique)
4. Disable Google Analytics (not needed for dev)
5. Click **Create project**

### 1.2 Upgrade to Blaze Plan

1. In the new project, click the ⚙️ gear → **Usage and billing** → **Details & settings**
2. Click **Modify plan** → Select **Blaze (pay-as-you-go)**
3. Link a billing account

### 1.3 Provision Firestore in europe-west2

1. In the Firebase Console, go to **Firestore Database** → **Create database**
2. Select **Start in test mode** (you'll deploy your actual security rules in Phase 5)
3. Choose location: **europe-west2 (London)**
4. Click **Create**

### 1.4 Enable Authentication Providers

1. Go to **Authentication** → **Sign-in method**
2. Enable **Email/Password**
3. Enable **Google** — set a support email address and click Save

### 1.5 Provision Firebase Storage in europe-west2

1. Go to **Storage** → **Get started**
2. Accept the default rules for now (you'll deploy your own later)
3. Choose location: **europe-west2**
4. Click **Done**

> Note the bucket name — it will be something like `bt-mvp-dev-eu.firebasestorage.app`

### 1.6 Register a Web App

1. Go to **Project Settings** (gear icon) → **General** → **Your apps**
2. Click the **</>** (web) icon
3. Register app name: `Blooming Tastebuds Dev`
4. Don't enable Firebase Hosting
5. Copy the `firebaseConfig` object — you'll need these values:

```
apiKey: "..."
authDomain: "bt-mvp-dev-eu.firebaseapp.com"
projectId: "bt-mvp-dev-eu"
storageBucket: "bt-mvp-dev-eu.firebasestorage.app"
messagingSenderId: "..."
appId: "..."
```

### 1.7 Generate a Service Account Key

1. Go to **Project Settings** → **Service accounts**
2. Click **Generate new private key**
3. Download the JSON file
4. You'll paste this as a single line in `.env.local` later

---

## Phase 2: Migrate Firestore Data (Dev)

### 2.1 Enable Firestore Import/Export APIs

```bash
# On the SOURCE project
gcloud services enable firestore.googleapis.com --project=bt-mvp-dev

# On the TARGET project
gcloud services enable firestore.googleapis.com --project=bt-mvp-dev-eu
```

### 2.2 Create Two GCS Buckets (US for export, EU for import)

Firestore can only export/import to a bucket in its own region. Source is nam5 (US), target is europe-west2. You need two buckets and a copy step in between.

```bash
# US bucket — for exporting from the nam5 source
gcloud storage buckets create gs://bt-mvp-migration-temp-us \
  --location=us \
  --project=bt-mvp-dev

# EU bucket — for importing into the europe-west2 target
# (you may have already created this one)
gcloud storage buckets create gs://bt-mvp-migration-temp \
  --location=europe-west2 \
  --project=bt-mvp-dev
```

### 2.3 Grant Firestore Service Agents Access to Buckets

Project numbers:
- bt-mvp-dev: `921267945862`
- bt-mvp-dev-eu: `560205096770`

```bash
# Source Firestore agent → US bucket (for export)
gcloud storage buckets add-iam-policy-binding gs://bt-mvp-migration-temp-us \
  --member="serviceAccount:service-921267945862@gcp-sa-firestore.iam.gserviceaccount.com" \
  --role="roles/storage.admin"

# Target Firestore agent → EU bucket (for import)
gcloud storage buckets add-iam-policy-binding gs://bt-mvp-migration-temp \
  --member="serviceAccount:service-560205096770@gcp-sa-firestore.iam.gserviceaccount.com" \
  --role="roles/storage.admin"
```

### 2.4 Grant Import/Export Permissions

```bash
# Source project — export permission
gcloud projects add-iam-policy-binding bt-mvp-dev \
  --member="serviceAccount:service-921267945862@gcp-sa-firestore.iam.gserviceaccount.com" \
  --role="roles/datastore.importExportAdmin"

# Target project — import permission
gcloud projects add-iam-policy-binding bt-mvp-dev-eu \
  --member="serviceAccount:service-560205096770@gcp-sa-firestore.iam.gserviceaccount.com" \
  --role="roles/datastore.importExportAdmin"
```

### 2.5 Export Firestore from Source (to US bucket)

```bash
gcloud firestore export gs://bt-mvp-migration-temp-us/dev-export \
  --project=bt-mvp-dev
```

Wait for the operation to complete. Note the output URI prefix:
```
metadata:
  outputUriPrefix: gs://bt-mvp-migration-temp-us/dev-export/2025-07-15T10:30:00_12345
```

### 2.6 Copy Export from US Bucket to EU Bucket

```bash
gcloud storage cp -r gs://bt-mvp-migration-temp-us/dev-export gs://bt-mvp-migration-temp/
```

### 2.7 Import Firestore into Target (from EU bucket)

```bash
gcloud firestore import gs://bt-mvp-migration-temp/dev-export/<TIMESTAMP_FOLDER> \
  --project=bt-mvp-dev-eu
```

> Use the exact timestamp folder name from the export output (e.g. `2025-07-15T10:30:00_12345`).

### 2.8 Verify Document Counts

Open both projects in Firebase Console → Firestore and spot-check that these collections exist and have the same document counts:
- users
- students
- sessions
- classes
- venues
- recipes
- instructors
- gallery
- bookings
- booking_drafts
- contact_messages

---

## Phase 3: Migrate Auth Users (Dev)

### 3.1 Export Users from Source

```bash
firebase auth:export users-dev.json --format=json --project=bt-mvp-dev
```

This creates a `users-dev.json` file with all user records. The output also shows the **hash config** — save these values:

```
Hash algorithm: SCRYPT
Signer key: <base64 string>
Salt separator: <base64 string>
Rounds: 8
Memory cost: 14
```

### 3.2 Import Users into Target

```bash
firebase auth:import users-dev.json \
  --project=bt-mvp-dev-eu \
  --hash-algo=scrypt \
  --hash-key=<SIGNER_KEY> \
  --salt-separator=<SALT_SEPARATOR> \
  --rounds=8 \
  --mem-cost=14
```

> Replace `<SIGNER_KEY>` and `<SALT_SEPARATOR>` with the values from the export step.

### 3.3 Verify

Check Firebase Console → Authentication on the new project. User count should match. Try signing in with a test account.

---

## Phase 4: Migrate Storage Files (Dev)

### 4.1 Copy Files Between Buckets

```bash
gcloud storage cp -r gs://bt-mvp-dev.firebasestorage.app/* gs://bt-mvp-dev-eu.firebasestorage.app/
```

> Replace bucket names with your actual bucket names. Check your source bucket name in Firebase Console → Storage.

### 4.2 Verify

Check Firebase Console → Storage on the new project. All folders and files should be present.

### 4.3 Update Storage URLs in Firestore

After importing Firestore data, any `imageUrl` or `photoUrl` fields will still reference the old bucket. You need to update these.

Run this script once (create a temporary `scripts/update-storage-urls.js` file):

```javascript
// Run this with Node.js using the new project's service account
const admin = require('firebase-admin');
const serviceAccount = require('./path-to-new-service-account.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const OLD_BUCKET = 'bt-mvp-dev.firebasestorage.app';
const NEW_BUCKET = 'bt-mvp-dev-eu.firebasestorage.app';

async function updateUrls() {
  // Update gallery imageUrl fields
  const gallerySnap = await db.collection('gallery').get();
  for (const doc of gallerySnap.docs) {
    const data = doc.data();
    if (data.imageUrl && data.imageUrl.includes(OLD_BUCKET)) {
      await doc.ref.update({
        imageUrl: data.imageUrl.replace(OLD_BUCKET, NEW_BUCKET)
      });
      console.log(`Updated gallery/${doc.id}`);
    }
  }

  // Update instructor photoUrl fields
  const instructorSnap = await db.collection('instructors').get();
  for (const doc of instructorSnap.docs) {
    const data = doc.data();
    if (data.photoUrl && data.photoUrl.includes(OLD_BUCKET)) {
      await doc.ref.update({
        photoUrl: data.photoUrl.replace(OLD_BUCKET, NEW_BUCKET)
      });
      console.log(`Updated instructors/${doc.id}`);
    }
  }

  console.log('Done!');
}

updateUrls();
```

---

## Phase 5: Deploy Security Rules and Indexes

### 5.1 Update .firebaserc (dev alias only for now)

Edit `.firebaserc`:

```json
{
  "projects": {
    "default": "bt-mvp-d057f",
    "dev": "bt-mvp-dev-eu"
  }
}
```

### 5.2 Switch to Dev Project and Deploy

```bash
firebase use dev

# Deploy all rules and indexes
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
firebase deploy --only storage
```

### 5.3 Verify

```bash
firebase use
# Should output: bt-mvp-dev-eu
```

Check Firebase Console → Firestore → Rules and Storage → Rules to confirm your rules are deployed.

---

## Phase 6: Configure OAuth and Authorized Domains

### 6.1 Add Authorized Domains in Firebase Auth

Go to Firebase Console → Authentication → Settings → Authorized domains. Add:

- `localhost`
- `bt-mvp-dev-eu.firebaseapp.com` (should be auto-added)
- Your Vercel preview pattern: `bloomingtastebuds-*.vercel.app` (or your actual Vercel project name pattern)
- Your production domain (e.g., `bloomingtastebuds.co.uk`) if applicable

### 6.2 Configure OAuth Consent Screen

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → Select your new project
2. Navigate to **APIs & Services** → **OAuth consent screen**
3. Choose **External** user type
4. Fill in:
   - App name: `Blooming Tastebuds`
   - User support email: your email
   - Authorized domains: `bloomingtastebuds.co.uk`, `vercel.app`
   - Developer contact email: your email
5. Add scopes: `email`, `profile`, `openid`
6. Save

### 6.3 Verify OAuth Credentials

1. Go to **APIs & Services** → **Credentials**
2. You should see a "Web client" auto-created by Firebase
3. Click it and verify:
   - **Authorized JavaScript origins** includes: `http://localhost:3000`, your Vercel URL, your production domain
   - **Authorized redirect URIs** includes: `https://bt-mvp-dev-eu.firebaseapp.com/__/auth/handler`

---

## Phase 7: Update Local Environment Variables

### 7.1 Update .env.local

Replace the Firebase values in `.env.local` with the new project's config:

```bash
# --- Firebase (Client SDK) ---
NEXT_PUBLIC_FIREBASE_API_KEY=<new-api-key>
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=bt-mvp-dev-eu.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=bt-mvp-dev-eu
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=bt-mvp-dev-eu.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=<new-sender-id>
NEXT_PUBLIC_FIREBASE_APP_ID=<new-app-id>
```

### 7.2 Update Service Account

Open the downloaded service account JSON, minify it to a single line, and replace the `FIREBASE_ADMIN_SERVICE_ACCOUNT` value:

```bash
FIREBASE_ADMIN_SERVICE_ACCOUNT={"type":"service_account","project_id":"bt-mvp-dev-eu","private_key_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n","client_email":"firebase-adminsdk-xxxxx@bt-mvp-dev-eu.iam.gserviceaccount.com",...}
```

> Tip: Use `cat service-account.json | jq -c .` to minify the JSON to a single line.

### 7.3 Test Locally

```bash
npm run dev
```

Verify:
- No `adminInitError` in the server console
- The console shows the new project ID
- Public pages load session data
- You can sign in with email/password
- You can sign in with Google

---

## Phase 8: Update Vercel Environment Variables (Preview)

### 8.1 Update via Vercel Dashboard

1. Go to [Vercel Dashboard](https://vercel.com/) → Your project → **Settings** → **Environment Variables**
2. For the **Preview** environment, update:
   - `NEXT_PUBLIC_FIREBASE_API_KEY` → new value
   - `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` → `bt-mvp-dev-eu.firebaseapp.com`
   - `NEXT_PUBLIC_FIREBASE_PROJECT_ID` → `bt-mvp-dev-eu`
   - `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` → `bt-mvp-dev-eu.firebasestorage.app`
   - `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` → new value
   - `NEXT_PUBLIC_FIREBASE_APP_ID` → new value
   - `FIREBASE_ADMIN_SERVICE_ACCOUNT` → new single-line JSON

### 8.2 Trigger a Preview Redeployment

Push a commit to a non-main branch, or use:
```bash
vercel --env preview
```

### 8.3 Verify the Preview Deployment

- Visit the preview URL
- Check Firestore data loads
- Test sign-in (email + Google)
- Test a booking flow (Stripe test mode)

---

## Phase 9: Full Dev Verification Checklist

Run through each of these before touching production:

| # | Check | How to Verify |
|---|-------|--------------|
| 1 | Firestore reads | Public /classes page shows sessions |
| 2 | Firestore writes (Admin SDK) | Admin panel → create a test venue |
| 3 | Email/password sign-in | Log in with existing test account |
| 4 | Google sign-in | Log in with Google — no auth/unauthorized-domain error |
| 5 | Storage upload | Admin → Gallery → upload a test image |
| 6 | Storage display | Gallery page shows migrated + new images |
| 7 | Stripe webhook | Complete a test booking → booking doc appears in new Firestore |
| 8 | Contact form | Submit → contact_messages doc created + admin email sent |
| 9 | Admin CRUD | Create, edit, delete a test session |

If all pass → proceed to production migration.

---

## Phase 10: Production Migration

Repeat Phases 1–8 for production. Key differences:

### 10.1 Create Production Firebase Project

- Name: something like `bt-mvp-prod-eu` (pick your preferred ID)
- Location: **europe-west2 (London)**
- Same setup: Blaze plan, Auth providers, Storage, web app, service account

### 10.2 Migrate Production Firestore

Same two-bucket approach. Production source (bt-mvp-d057f) is also in nam5, so you need the US bucket for export.

```bash
# Get production project number
gcloud projects describe bt-mvp-d057f --format="value(projectNumber)"
# Get new prod project number
gcloud projects describe bt-mvp-prod-eu --format="value(projectNumber)"

# Grant Firestore agents access (replace <PROD_NUM> and <NEW_PROD_NUM>)
gcloud storage buckets add-iam-policy-binding gs://bt-mvp-migration-temp-us \
  --member="serviceAccount:service-<PROD_NUM>@gcp-sa-firestore.iam.gserviceaccount.com" \
  --role="roles/storage.admin"

gcloud storage buckets add-iam-policy-binding gs://bt-mvp-migration-temp \
  --member="serviceAccount:service-<NEW_PROD_NUM>@gcp-sa-firestore.iam.gserviceaccount.com" \
  --role="roles/storage.admin"

# Grant import/export roles
gcloud projects add-iam-policy-binding bt-mvp-d057f \
  --member="serviceAccount:service-<PROD_NUM>@gcp-sa-firestore.iam.gserviceaccount.com" \
  --role="roles/datastore.importExportAdmin"

gcloud projects add-iam-policy-binding bt-mvp-prod-eu \
  --member="serviceAccount:service-<NEW_PROD_NUM>@gcp-sa-firestore.iam.gserviceaccount.com" \
  --role="roles/datastore.importExportAdmin"

# Export from production → US bucket
gcloud firestore export gs://bt-mvp-migration-temp-us/prod-export \
  --project=bt-mvp-d057f

# Copy to EU bucket
gcloud storage cp -r gs://bt-mvp-migration-temp-us/prod-export gs://bt-mvp-migration-temp/

# Import into new production from EU bucket
gcloud firestore import gs://bt-mvp-migration-temp/prod-export/<TIMESTAMP_FOLDER> \
  --project=bt-mvp-prod-eu
```

### 10.3 Migrate Production Auth Users

```bash
firebase auth:export users-prod.json --format=json --project=bt-mvp-d057f

firebase auth:import users-prod.json \
  --project=bt-mvp-prod-eu \
  --hash-algo=scrypt \
  --hash-key=<PROD_SIGNER_KEY> \
  --salt-separator=<PROD_SALT_SEPARATOR> \
  --rounds=8 \
  --mem-cost=14
```

### 10.4 Migrate Production Storage

```bash
gcloud storage cp -r gs://bt-mvp-d057f.firebasestorage.app/* gs://bt-mvp-prod-eu.firebasestorage.app/
```

Run the URL update script against the production target project too (with production bucket names).

### 10.5 Deploy Rules to Production

Update `.firebaserc`:

```json
{
  "projects": {
    "default": "bt-mvp-prod-eu",
    "dev": "bt-mvp-dev-eu"
  }
}
```

```bash
firebase use default
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
firebase deploy --only storage
```

### 10.6 Configure Production OAuth

Same as Phase 6, but for the production project. Make sure to add:
- Your production domain (e.g., `bloomingtastebuds.co.uk`)
- Vercel production URL
- `localhost` (for dev against prod — optional)

### 10.7 Update Vercel Production Environment Variables

In Vercel Dashboard → Settings → Environment Variables → **Production**:
- Update all `NEXT_PUBLIC_FIREBASE_*` values to the production target project config
- Update `FIREBASE_ADMIN_SERVICE_ACCOUNT` to the production target service account JSON

### 10.8 Trigger Production Redeployment

```bash
# Push to main, or manually redeploy in Vercel dashboard
vercel --prod
```

### 10.9 Verify Stripe Webhook

The Stripe webhook URL shouldn't change (it's your Vercel production URL + `/api/webhooks/stripe`). The webhook handler uses `FIREBASE_ADMIN_SERVICE_ACCOUNT` from env, so it will automatically point to the new project after redeployment.

Verify by sending a test webhook event from Stripe Dashboard → Webhooks → Send test webhook.

---

## Phase 11: Commit .firebaserc Update

```bash
git add .firebaserc
git commit -m "chore: update .firebaserc to europe-west2 projects"
git push
```

---

## Phase 12: Decommission Old Projects

**Wait 14 days** after production is stable, then:

1. Deploy read-only Firestore rules to old projects:
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read: if true;
      allow write: if false;
    }
  }
}
```

2. Revoke old service account keys (Firebase Console → Project Settings → Service accounts)
3. After 90 days with no issues, archive/delete the old projects

---

## Quick Reference: What Changes vs. What Stays the Same

| Item | Changes? | Notes |
|------|----------|-------|
| `NEXT_PUBLIC_FIREBASE_*` | ✅ Yes | All 6 values change |
| `FIREBASE_ADMIN_SERVICE_ACCOUNT` | ✅ Yes | New service account JSON |
| `.firebaserc` | ✅ Yes | New project IDs |
| `STRIPE_SECRET_KEY` | ❌ No | Stripe account unchanged |
| `STRIPE_WEBHOOK_SECRET` | ❌ No | Same webhook endpoint URL |
| `RESEND_API_KEY` | ❌ No | Email service unchanged |
| `NEXT_PUBLIC_APP_URL` | ❌ No | Domain unchanged |
| `KV_REST_API_*` | ❌ No | Vercel KV unchanged |
| `TURNSTILE_*` | ❌ No | Cloudflare unchanged |
| Stripe webhook URL | ❌ No | Same Vercel URL |
| Firestore rules file | ❌ No | Same rules, deployed to new project |
| Application code | ❌ No | No code changes needed |

---

## Rollback Plan

If anything goes wrong after switching to the new project:

1. Revert `.env.local` to old values (bt-mvp-dev / bt-mvp-d057f)
2. Revert Vercel environment variables to old values
3. Trigger redeployment
4. Old projects remain fully functional until decommissioned

The old projects stay active and writable for the full 14-day observation period.

---

## Cleanup: Delete Migration Buckets

After everything is verified and stable, delete the temporary buckets:

```bash
gcloud storage rm -r gs://bt-mvp-migration-temp-us/
gcloud storage rm -r gs://bt-mvp-migration-temp/
gcloud storage buckets delete gs://bt-mvp-migration-temp-us
gcloud storage buckets delete gs://bt-mvp-migration-temp
```
