import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth, adminInitError } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { generateSlug, validateLabel, DEFAULT_CATEGORIES } from '@/lib/gallery-categories-service';

/**
 * Seeds the `gallery_categories` collection with the two default categories
 * if the collection is empty. This is idempotent — if categories already exist,
 * no writes are performed.
 */
async function seedDefaultCategories(): Promise<void> {
    const snap = await adminDb.collection('gallery_categories').get();

    if (!snap.empty) {
        return; // Already has categories, nothing to seed
    }

    const batch = adminDb.batch();
    for (const cat of DEFAULT_CATEGORIES) {
        const ref = adminDb.collection('gallery_categories').doc();
        batch.set(ref, {
            slug: cat.slug,
            label: cat.label,
            order: cat.order,
            isVisible: cat.isVisible,
            createdAt: FieldValue.serverTimestamp(),
        });
    }
    await batch.commit();
}

/**
 * GET /api/gallery-categories
 *
 * Returns all gallery categories ordered by `order` ASC.
 * If the collection is empty, seeds it with the two default categories first.
 * No auth required — categories are public data.
 */
export async function GET() {
    // Check Admin SDK health
    if (adminInitError) {
        return NextResponse.json(
            { error: 'Firebase Admin SDK not initialised', detail: adminInitError },
            { status: 500 }
        );
    }

    try {
        // Seed defaults if collection is empty
        await seedDefaultCategories();

        // Read all categories ordered by order ASC
        const snapshot = await adminDb
            .collection('gallery_categories')
            .orderBy('order', 'asc')
            .get();

        const categories = snapshot.docs.map((doc) => ({
            id: doc.id,
            slug: doc.data().slug,
            label: doc.data().label,
            order: doc.data().order,
            isVisible: doc.data().isVisible,
            createdAt: doc.data().createdAt,
        }));

        return NextResponse.json({ categories, seeded: snapshot.size <= DEFAULT_CATEGORIES.length });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json(
            { error: 'Failed to fetch categories', detail: message },
            { status: 500 }
        );
    }
}

export async function PUT(req: NextRequest) {
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
    const userDoc = await adminDb.collection('users').doc(uid).get();
    if (!userDoc.exists || userDoc.data()?.role !== 'admin') {
        return NextResponse.json({ error: 'Forbidden — admin role required' }, { status: 403 });
    }

    // Parse request body
    let body: { action?: string; id?: string; label?: string; isVisible?: boolean; direction?: string };
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { action } = body;

    if (action === 'update') {
        return handleUpdate(body);
    } else if (action === 'reorder') {
        return handleReorder(body);
    } else {
        return NextResponse.json(
            { error: 'Invalid action. Expected "update" or "reorder".' },
            { status: 400 }
        );
    }
}

async function handleUpdate(body: { id?: string; label?: string; isVisible?: boolean }) {
    const { id, label, isVisible } = body;

    if (!id || typeof id !== 'string') {
        return NextResponse.json({ error: 'Category ID is required' }, { status: 400 });
    }

    // Check that at least one field is being updated
    if (label === undefined && isVisible === undefined) {
        return NextResponse.json(
            { error: 'At least one of "label" or "isVisible" must be provided' },
            { status: 400 }
        );
    }

    // Fetch the existing category
    const categoryRef = adminDb.collection('gallery_categories').doc(id);
    const categoryDoc = await categoryRef.get();

    if (!categoryDoc.exists) {
        return NextResponse.json({ error: 'Category not found' }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};

    // Validate and set label if provided
    if (label !== undefined) {
        if (typeof label !== 'string') {
            return NextResponse.json({ error: 'Label must be a string' }, { status: 400 });
        }
        const validation = validateLabel(label);
        if (!validation.valid) {
            return NextResponse.json({ error: validation.error }, { status: 400 });
        }
        updateData.label = label.trim();
    }

    // Set isVisible if provided
    if (isVisible !== undefined) {
        if (typeof isVisible !== 'boolean') {
            return NextResponse.json({ error: 'isVisible must be a boolean' }, { status: 400 });
        }
        updateData.isVisible = isVisible;
    }

    await categoryRef.update(updateData);

    const updatedDoc = await categoryRef.get();
    const data = updatedDoc.data();

    return NextResponse.json({
        id: updatedDoc.id,
        slug: data?.slug,
        label: data?.label,
        isVisible: data?.isVisible,
    });
}

async function handleReorder(body: { id?: string; direction?: string }) {
    const { id, direction } = body;

    if (!id || typeof id !== 'string') {
        return NextResponse.json({ error: 'Category ID is required' }, { status: 400 });
    }

    if (direction !== 'up' && direction !== 'down') {
        return NextResponse.json(
            { error: 'Direction must be "up" or "down"' },
            { status: 400 }
        );
    }

    // Fetch all categories ordered by order ASC
    const allCategoriesSnap = await adminDb
        .collection('gallery_categories')
        .orderBy('order', 'asc')
        .get();

    const categories = allCategoriesSnap.docs.map((doc) => ({
        id: doc.id,
        slug: doc.data().slug as string,
        order: doc.data().order as number,
    }));

    // Find the target category index
    const targetIndex = categories.findIndex((cat) => cat.id === id);

    if (targetIndex === -1) {
        return NextResponse.json({ error: 'Category not found' }, { status: 404 });
    }

    // Reject no-op moves
    if (direction === 'up' && targetIndex === 0) {
        return NextResponse.json(
            { error: 'Category is already at the top' },
            { status: 400 }
        );
    }

    if (direction === 'down' && targetIndex === categories.length - 1) {
        return NextResponse.json(
            { error: 'Category is already at the bottom' },
            { status: 400 }
        );
    }

    // Determine the neighbor to swap with
    const neighborIndex = direction === 'up' ? targetIndex - 1 : targetIndex + 1;

    const target = categories[targetIndex];
    const neighbor = categories[neighborIndex];

    // Swap order values using a batch write
    const batch = adminDb.batch();
    const targetRef = adminDb.collection('gallery_categories').doc(target.id);
    const neighborRef = adminDb.collection('gallery_categories').doc(neighbor.id);

    batch.update(targetRef, { order: neighbor.order });
    batch.update(neighborRef, { order: target.order });

    await batch.commit();

    // Build the updated categories list
    const updatedCategories = [...categories];
    updatedCategories[targetIndex] = { ...target, order: neighbor.order };
    updatedCategories[neighborIndex] = { ...neighbor, order: target.order };

    // Sort by new order for the response
    updatedCategories.sort((a, b) => a.order - b.order);

    return NextResponse.json({
        reordered: true,
        categories: updatedCategories.map((cat) => ({
            id: cat.id,
            slug: cat.slug,
            order: cat.order,
        })),
    });
}

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
    const userDoc = await adminDb.collection('users').doc(uid).get();
    if (!userDoc.exists || userDoc.data()?.role !== 'admin') {
        return NextResponse.json({ error: 'Forbidden — admin role required' }, { status: 403 });
    }

    // Seed defaults if collection is empty (first deployment support)
    await seedDefaultCategories();

    // Parse request body
    let body: { action?: string; label?: string };
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { action, label } = body;

    if (action !== 'create') {
        return NextResponse.json({ error: 'Invalid action. Expected "create".' }, { status: 400 });
    }

    if (typeof label !== 'string') {
        return NextResponse.json({ error: 'Label is required and must be a string' }, { status: 400 });
    }

    // Validate label
    const validation = validateLabel(label);
    if (!validation.valid) {
        return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    // Generate slug from label
    const slug = generateSlug(label);
    if (!slug) {
        return NextResponse.json(
            { error: 'Unable to generate a valid slug from the provided label' },
            { status: 400 }
        );
    }

    // Check slug uniqueness
    const existingSlugQuery = await adminDb
        .collection('gallery_categories')
        .where('slug', '==', slug)
        .get();

    if (!existingSlugQuery.empty) {
        return NextResponse.json(
            { error: 'A category with this name already exists' },
            { status: 409 }
        );
    }

    // Calculate order: max existing order + 1 (or 1 if empty)
    const allCategoriesSnap = await adminDb.collection('gallery_categories').get();
    let maxOrder = 0;
    for (const doc of allCategoriesSnap.docs) {
        const order = doc.data().order;
        if (typeof order === 'number' && order > maxOrder) {
            maxOrder = order;
        }
    }
    const newOrder = maxOrder + 1;

    // Create the category document
    const docRef = await adminDb.collection('gallery_categories').add({
        slug,
        label: label.trim(),
        order: newOrder,
        isVisible: true,
        createdAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json(
        {
            id: docRef.id,
            slug,
            label: label.trim(),
            order: newOrder,
            isVisible: true,
        },
        { status: 201 }
    );
}

export async function DELETE(req: NextRequest) {
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
    const userDoc = await adminDb.collection('users').doc(uid).get();
    if (!userDoc.exists || userDoc.data()?.role !== 'admin') {
        return NextResponse.json({ error: 'Forbidden — admin role required' }, { status: 403 });
    }

    // Parse request body
    let body: { action?: string; id?: string; confirmed?: boolean };
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { action, id, confirmed } = body;

    if (action !== 'delete') {
        return NextResponse.json({ error: 'Invalid action. Expected "delete".' }, { status: 400 });
    }

    if (!id || typeof id !== 'string') {
        return NextResponse.json({ error: 'Category id is required' }, { status: 400 });
    }

    // Fetch the category to be deleted
    const categoryRef = adminDb.collection('gallery_categories').doc(id);
    const categoryDoc = await categoryRef.get();

    if (!categoryDoc.exists) {
        return NextResponse.json({ error: 'Category not found' }, { status: 404 });
    }

    const categoryData = categoryDoc.data()!;
    const categorySlug = categoryData.slug as string;

    // Check total category count — prevent deletion of last category
    const allCategoriesSnap = await adminDb
        .collection('gallery_categories')
        .get();

    if (allCategoriesSnap.size <= 1) {
        return NextResponse.json(
            { error: 'At least one category must exist' },
            { status: 400 }
        );
    }

    // Count images assigned to this category
    const imagesSnap = await adminDb
        .collection('gallery')
        .where('category', '==', categorySlug)
        .get();

    const imageCount = imagesSnap.size;

    // If images exist and deletion not confirmed, return 409 with warning
    if (imageCount > 0 && confirmed !== true) {
        return NextResponse.json(
            { error: `Category has ${imageCount} images assigned`, imageCount },
            { status: 409 }
        );
    }

    // Determine the remaining category with the lowest order for image reassignment
    const remainingCategories = allCategoriesSnap.docs.filter(
        (doc) => doc.id !== id
    );

    // Sort remaining by order ascending to find lowest-order category
    remainingCategories.sort((a, b) => {
        const orderA = a.data().order as number;
        const orderB = b.data().order as number;
        return orderA - orderB;
    });

    const lowestOrderCategory = remainingCategories[0];
    const reassignSlug = lowestOrderCategory.data().slug as string;

    // Perform deletion in a batch write
    const batch = adminDb.batch();

    // Reassign images to the lowest-order remaining category
    if (imageCount > 0) {
        for (const imageDoc of imagesSnap.docs) {
            batch.update(imageDoc.ref, { category: reassignSlug });
        }
    }

    // Delete the category document
    batch.delete(categoryRef);

    // Recalculate order fields for remaining categories to maintain contiguity
    // Sort remaining by current order ascending, assign 1, 2, 3...
    let newOrder = 1;
    for (const catDoc of remainingCategories) {
        batch.update(catDoc.ref, { order: newOrder });
        newOrder++;
    }

    await batch.commit();

    // Build response with updated categories
    const updatedCategories = remainingCategories.map((doc, index) => ({
        id: doc.id,
        slug: doc.data().slug as string,
        order: index + 1,
    }));

    return NextResponse.json(
        {
            deleted: true,
            reassignedImages: imageCount,
            categories: updatedCategories,
        },
        { status: 200 }
    );
}
