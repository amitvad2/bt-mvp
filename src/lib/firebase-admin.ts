import * as admin from 'firebase-admin';

// Populated when the Admin SDK cannot be properly initialized.
// API routes (create-intent, webhooks) check this before attempting Firestore writes
// so they can return a clear error rather than silently failing mid-request.
export let adminInitError: string | null = null;

if (!admin.apps.length) {
    const serviceAccountStr = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT;

    if (!serviceAccountStr) {
        adminInitError =
            'FIREBASE_ADMIN_SERVICE_ACCOUNT is not set. ' +
            'Download the full service account JSON from Firebase Console → ' +
            'Project Settings → Service Accounts → Generate new private key, ' +
            'then paste the entire JSON object as a single-line string in .env.local.';
        console.error('[firebase-admin]', adminInitError);
        // Best-effort ADC fallback (works in GCP/Cloud Run with a service-account-attached VM)
        try {
            admin.initializeApp({ projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID });
        } catch {
            // ADC not available either — adminInitError already set
        }
    } else {
        try {
            let serviceAccount: Record<string, unknown>;
            try {
                serviceAccount = JSON.parse(serviceAccountStr);
            } catch {
                throw new Error(
                    'FIREBASE_ADMIN_SERVICE_ACCOUNT is not valid JSON. ' +
                    'The value must be the raw JSON object on a single line — ' +
                    'no surrounding quotes, no escaped newlines added by hand.'
                );
            }

            // A service account downloaded from Firebase Console always has these fields.
            // If any are missing, the JSON is a stub / placeholder.
            const required = ['project_id', 'private_key', 'client_email'];
            const missing = required.filter((f) => !serviceAccount[f]);
            if (missing.length > 0) {
                throw new Error(
                    `FIREBASE_ADMIN_SERVICE_ACCOUNT is missing required fields: ${missing.join(', ')}. ` +
                    'The value in .env.local appears to be a placeholder. ' +
                    'Download the full JSON from Firebase Console → Project Settings → ' +
                    'Service Accounts → Generate new private key.'
                );
            }

            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
            });
            console.log(
                '[firebase-admin] Initialized with service account for project:',
                serviceAccount.project_id
            );
        } catch (e: any) {
            adminInitError = e.message;
            console.error('[firebase-admin] Initialization failed:', adminInitError);
            // Best-effort ADC fallback
            if (!admin.apps.length) {
                try {
                    admin.initializeApp({ projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID });
                } catch {
                    // ADC unavailable — adminInitError remains set
                }
            }
        }
    }
}

export const adminDb = admin.firestore();
export const adminAuth = admin.auth();
export const adminStorage = admin.storage();
export default admin;
