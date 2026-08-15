/**
 * One-off admin API endpoint to backfill `safetyReviewStatus` on existing bookings
 * that were created before the field was added.
 *
 * - Requires admin auth (Authorization: Bearer <idToken>, role === 'admin')
 * - Fetches all bookings missing `safetyReviewStatus`
 * - Computes the appropriate status using `determineSafetyReviewStatus`
 * - Updates each booking document
 * - Returns a count of updated bookings
 *
 * Usage:
 *   curl -X POST http://localhost:3000/api/admin/backfill-safety-status \
 *     -H "Authorization: Bearer <ADMIN_ID_TOKEN>"
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth, adminInitError } from '@/lib/firebase-admin';
import { determineSafetyReviewStatus } from '@/lib/guest-validation';

export async function POST(req: NextRequest) {
    // Check Admin SDK health
    if (adminInitError) {
        return NextResponse.json(
            { error: 'Firebase Admin SDK not initialised', detail: adminInitError },
            { status: 500 }
        );
    }

    // Verify Authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
        return NextResponse.json(
            { error: 'Missing or invalid Authorization header' },
            { status: 401 }
        );
    }

    const idToken = authHeader.slice(7);

    let uid: string;
    try {
        const decoded = await adminAuth.verifyIdToken(idToken);
        uid = decoded.uid;
    } catch {
        return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
    }

    // Verify user has admin role
    const userDoc = await adminDb.doc(`users/${uid}`).get();
    if (!userDoc.exists || userDoc.data()?.role !== 'admin') {
        return NextResponse.json({ error: 'Forbidden — admin role required' }, { status: 403 });
    }

    // Fetch all bookings that don't have safetyReviewStatus set.
    // Firestore doesn't support "field does not exist" queries directly,
    // so we query all bookings and filter in-memory.
    const bookingsSnap = await adminDb.collection('bookings').get();

    let updatedCount = 0;
    let currentBatch = adminDb.batch();
    let batchCount = 0;
    const BATCH_LIMIT = 500;

    for (const doc of bookingsSnap.docs) {
        const data = doc.data();

        // Skip bookings that already have a safetyReviewStatus
        if (data.safetyReviewStatus) {
            continue;
        }

        // Compute the safety review status from medicalInfo
        const safetyReviewStatus = determineSafetyReviewStatus({ medicalInfo: data.medicalInfo });

        currentBatch.update(doc.ref, { safetyReviewStatus });
        updatedCount++;
        batchCount++;

        // Firestore batches are limited to 500 operations — commit and start new batch
        if (batchCount === BATCH_LIMIT) {
            await currentBatch.commit();
            currentBatch = adminDb.batch();
            batchCount = 0;
        }
    }

    // Commit any remaining updates
    if (batchCount > 0) {
        await currentBatch.commit();
    }

    console.log(`[backfill-safety-status] Updated ${updatedCount} bookings`);

    return NextResponse.json({
        success: true,
        updatedCount,
        message: `Backfilled safetyReviewStatus on ${updatedCount} booking(s)`,
    });
}
