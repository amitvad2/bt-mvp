import * as admin from 'firebase-admin';

const serviceAccountStr = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT;

if (!admin.apps.length) {
    try {
        const serviceAccount = serviceAccountStr
            ? JSON.parse(serviceAccountStr)
            : undefined;

        admin.initializeApp({
            credential: serviceAccount
                ? admin.credential.cert(serviceAccount)
                : admin.credential.applicationDefault(),
        });
    } catch (e) {
        console.warn('Firebase Admin init warning:', e);
        // Allow app to run without admin SDK during development
        if (!admin.apps.length) {
            admin.initializeApp({ projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID });
        }
    }
}

export const adminDb = admin.firestore();
export const adminAuth = admin.auth();
export const adminStorage = admin.storage();
export default admin;
