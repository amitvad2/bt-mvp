# Implementation Plan: Dynamic Gallery Categories

## Overview

This plan converts the hardcoded gallery category system into a Firestore-backed dynamic category management feature. Implementation progresses from foundational types and services, through the API route, then the admin Category Manager UI, and finally rewiring the public gallery and admin gallery to read categories dynamically.

## Tasks

- [x] 1. Set up types, service module, and Firestore rules
  - [x] 1.1 Add `GalleryCategoryDoc` interface and update `GalleryCategory` type
    - Add `GalleryCategoryDoc` interface to `src/types/index.ts` with fields: `id`, `slug`, `label`, `order`, `isVisible`, `createdAt`
    - Change the `GalleryCategory` type from a union literal to `string` to support dynamic slugs
    - _Requirements: 1.1, 1.3_

  - [x] 1.2 Create `src/lib/gallery-categories-service.ts` with pure utility functions
    - Implement `generateSlug(label: string): string` — trim, lowercase, spaces→hyphens, remove non-`[a-z0-9-]`, collapse consecutive hyphens, truncate to 60 chars
    - Implement `validateLabel(label: string): { valid: boolean; error?: string }` — reject empty/whitespace-only or >50 chars after trimming
    - Implement `validateSlug(slug: string): boolean` — checks `[a-z0-9-]+` pattern, max 60 chars
    - Export `DEFAULT_CATEGORIES: GalleryCategoryDoc[]` with `cooking-classes` (order 1) and `personal-gallery` (order 2)
    - _Requirements: 2.1, 2.2, 8.3_

  - [x] 1.3 Update `src/lib/gallery-categories.ts` — add `fetchCategories()` and update `normalizeCategory()`
    - Add `fetchCategories(options?: { visibleOnly?: boolean }): Promise<GalleryCategoryDoc[]>` that reads from `gallery_categories` collection ordered by `order` ASC, with optional `isVisible` filter
    - Implement fallback logic: if collection is empty or read fails, return `DEFAULT_CATEGORIES`
    - Update `normalizeCategory` signature to accept optional `validSlugs?: Set<string>` parameter
    - Retain all existing legacy mapping logic (`cakes`, `cookies`, `breads` → `personal-gallery`)
    - _Requirements: 1.2, 1.4, 8.1, 8.2, 8.4_

  - [x] 1.4 Add Firestore security rules for `gallery_categories` collection
    - Add `match /gallery_categories/{docId}` to `firestore.rules` with `allow read: if true` and `allow write: if isAdmin()`
    - _Requirements: 1.1_

  - [x] 1.5 Write property tests for slug generation (Property 1)
    - **Property 1: Slug generation produces valid slugs**
    - Test that for any non-empty string label (1–50 chars after trimming), `generateSlug` produces a string matching `[a-z0-9-]+`, no consecutive hyphens, no leading/trailing hyphens, ≤60 chars, non-empty
    - Test file: `src/__tests__/gallery/slug-generation.property.test.ts`
    - Use `fc.string()` filtered to 1–50 non-whitespace-only chars
    - **Validates: Requirements 2.1**

  - [x] 1.6 Write property tests for label validation (Property 2)
    - **Property 2: Label validation correctness**
    - Test that `validateLabel` accepts if and only if trimmed string is non-empty and ≤50 chars; rejects whitespace-only or >50 chars
    - Test file: `src/__tests__/gallery/label-validation.property.test.ts`
    - Use `fc.string()` with full unicode range
    - **Validates: Requirements 2.2, 3.2**

  - [x] 1.7 Write property tests for legacy normalization (Property 8)
    - **Property 8: Legacy normalization maps unknown strings to default**
    - Test that any string not a valid slug and not a legacy value maps to `'cooking-classes'`
    - Test file: `src/__tests__/gallery/legacy-normalization.property.test.ts`
    - Use `fc.string()` excluding known slugs and legacy values
    - **Validates: Requirements 8.2**

- [x] 2. Implement the API route for category CRUD
  - [x] 2.1 Create `src/app/api/gallery-categories/route.ts` with POST handler (create)
    - Validate label with `validateLabel`, generate slug with `generateSlug`
    - Check slug uniqueness against existing docs in `gallery_categories`
    - Set `order` to max existing order + 1 (or 1 if empty), `isVisible` defaults to `true`
    - Use Admin SDK (`adminDb`) for all Firestore writes
    - Verify admin auth via `Authorization: Bearer <idToken>` header using `adminAuth.verifyIdToken`
    - Return 401 for missing/invalid auth, 400 for validation errors, 409 for slug collision
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 2.2 Add PUT handler to the API route (update label, toggle visibility, reorder)
    - `action: 'update'` — update `label` and/or `isVisible` without changing `slug`
    - `action: 'reorder'` — move category up/down using batch write to maintain contiguous order
    - Validate label on update with `validateLabel`; reject no-op reorder (first up / last down)
    - _Requirements: 3.1, 3.2, 3.3, 3.6, 4.1, 4.2_

  - [x] 2.3 Add DELETE handler to the API route
    - Query `gallery` collection to count images assigned to the category
    - If images exist and `confirmed` is not `true`, return 409 with image count warning
    - If confirmed, reassign all images to the category with the lowest `order` among remaining categories
    - Prevent deletion of the last remaining category (return 400)
    - After deletion, batch-update remaining category `order` fields to maintain contiguity
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [x] 2.4 Write property tests for slug immutability (Property 3)
    - **Property 3: Slug immutability on update**
    - Test that updating a category's label does not change its slug field
    - Test file: `src/__tests__/gallery/slug-immutability.property.test.ts`
    - Use `fc.record()` for category + `fc.string()` for new label
    - **Validates: Requirements 3.1**

  - [x] 2.5 Write property tests for order contiguity (Property 4)
    - **Property 4: Order contiguity invariant**
    - Test that after any reorder or deletion, order values form a contiguous 1..N sequence
    - Test file: `src/__tests__/gallery/order-contiguity.property.test.ts`
    - Use `fc.array(fc.record())` for category lists + `fc.nat()` for move index
    - **Validates: Requirements 4.1, 5.5**

  - [x] 2.6 Write property tests for deletion reassignment (Property 7)
    - **Property 7: Deletion reassigns images to lowest-order category**
    - Test that deleting a category with images reassigns all to the remaining category with lowest order; no orphaned images
    - Test file: `src/__tests__/gallery/deletion-reassignment.property.test.ts`
    - Use `fc.array()` of categories (N≥2) + random image assignments
    - **Validates: Requirements 5.3**

- [x] 3. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement the Category Manager admin page
  - [x] 4.1 Create `src/app/admin/gallery/categories/page.tsx` — Category Manager UI
    - Fetch all categories from Firestore via `fetchCategories()` on mount
    - Display categories in an ordered list with label, visibility toggle, and order controls
    - Implement inline create form: label input with validation feedback
    - Implement inline edit: click label to edit, save on blur/enter
    - Implement reorder: up/down buttons calling PUT `action: 'reorder'`
    - Implement delete: confirm dialog showing image count when images exist; prevent last deletion
    - Use optimistic UI for reorder with rollback on failure
    - Preserve form state on error (no data loss)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 3.6, 4.1, 4.2, 5.1, 5.2, 5.3, 5.4, 5.5_

  - [x] 4.2 Create `src/app/admin/gallery/categories/page.module.css` — Category Manager styles
    - Style the category list, form elements, reorder buttons, visibility toggles, and delete confirmation dialog
    - Use CSS custom properties from `globals.css` for tokens
    - _Requirements: 2.1, 3.1, 4.1, 5.1_

- [x] 5. Rewire public gallery to use dynamic categories
  - [x] 5.1 Update `src/app/(public)/gallery/GalleryClient.tsx` to fetch categories from Firestore
    - Replace `PUBLIC_CATEGORIES` import with `fetchCategories({ visibleOnly: true })` call
    - Render "All Photos" tab first, then dynamic category tabs ordered by `order` ASC
    - On category tab click, filter images by matching `category` field (after normalization with `validSlugs`)
    - "All Photos" shows all images belonging to any visible category
    - If no visible categories or fetch fails, show all images without tabs and display subtle error banner
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [x] 5.2 Write property tests for visibility filtering (Property 5)
    - **Property 5: Visibility filtering for public view**
    - Test that only categories with `isVisible: true` appear as tabs; hidden category images still show under "All Photos"
    - Test file: `src/__tests__/gallery/visibility-filtering.property.test.ts`
    - Use `fc.array()` of categories with random `isVisible` booleans
    - **Validates: Requirements 3.4, 3.5, 6.4**

  - [x] 5.3 Write property tests for category filter correctness (Property 6)
    - **Property 6: Category filter correctness**
    - Test that filtering returns exactly images matching the selected slug after normalization, and no others
    - Test file: `src/__tests__/gallery/category-filter.property.test.ts`
    - Use `fc.array()` of images with random slugs + `fc.constantFrom()` for selection
    - **Validates: Requirements 6.3**

- [x] 6. Rewire admin gallery to use dynamic categories
  - [x] 6.1 Update `src/app/admin/gallery/page.tsx` to fetch categories from Firestore
    - Replace `ADMIN_CATEGORIES` and `CATEGORY_LABELS` imports with `fetchCategories()` call (all categories regardless of visibility)
    - Populate the category dropdown with all fetched categories ordered by `order` ASC
    - Require category selection before form submission
    - Show error and disable form if category fetch fails
    - Update `normalizeCategory` calls to pass `validSlugs` set built from fetched categories
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [x] 6.2 Write property tests for admin visibility (Property 9)
    - **Property 9: Admin view shows all categories regardless of visibility**
    - Test that admin dropdown includes every category regardless of `isVisible`, ordered by `order` ASC
    - Test file: `src/__tests__/gallery/admin-visibility.property.test.ts`
    - Use `fc.array()` of categories with random `isVisible` flags
    - **Validates: Requirements 7.1, 7.2**

- [x] 7. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Seed data and composite index
  - [x] 8.1 Add seed logic to `fetchCategories()` for first deployment
    - When `gallery_categories` collection is empty and the caller is on a server API route, seed the two default categories using Admin SDK
    - For client-side reads of an empty collection, return `DEFAULT_CATEGORIES` without writing (seeding happens via API)
    - _Requirements: 8.3, 1.4_

  - [x] 8.2 Add composite index to `firestore.indexes.json`
    - Add index for `gallery_categories` collection: `isVisible ASC, order ASC`
    - _Requirements: 6.1_

- [x] 9. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document (9 properties total)
- Unit tests validate specific examples and edge cases
- All API route writes use Firebase Admin SDK; all client reads use Firebase client SDK
- CSS Modules are used for all styling (no component library)
- Test files go in `src/__tests__/gallery/` mirroring source structure
- `fast-check` is already installed (`^4.9.0`) — use for all property-based tests
- Each property test should run with `{ numRuns: 100 }` minimum

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.4"] },
    { "id": 1, "tasks": ["1.2", "1.3"] },
    { "id": 2, "tasks": ["1.5", "1.6", "1.7", "2.1"] },
    { "id": 3, "tasks": ["2.2", "2.3", "2.4"] },
    { "id": 4, "tasks": ["2.5", "2.6", "4.1"] },
    { "id": 5, "tasks": ["4.2", "5.1", "6.1"] },
    { "id": 6, "tasks": ["5.2", "5.3", "6.2"] },
    { "id": 7, "tasks": ["8.1", "8.2"] }
  ]
}
```
