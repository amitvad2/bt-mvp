# Implementation Plan: Gallery Management (Test Coverage Gaps)

## Overview

The production code for this feature is already implemented. This task list focuses exclusively
on **closing the test coverage gaps** identified in the design document. The work is organised
into five task groups:

1. Property-based tests for `normalizeCategory`
2. Property-based tests for `GalleryClient` filter logic
3. Lightbox interaction tests for `GalleryClient`
4. Admin Gallery CRUD example tests
5. Admin Gallery property-based tests

All new test files live in `src/__tests__/gallery/`. The property-based testing library is
**`fast-check`** — install it as a dev dependency before running tests.

---

## Task Dependency Graph

```json
{
  "waves": [
    {
      "wave": 1,
      "tasks": ["1"],
      "description": "Install fast-check dev dependency"
    },
    {
      "wave": 2,
      "tasks": ["2", "3"],
      "description": "Property tests for normalizeCategory and GalleryClient filter — independent, both depend only on wave 1"
    },
    {
      "wave": 3,
      "tasks": ["4"],
      "description": "Lightbox tests — depend on GalleryClient mock patterns established in wave 2"
    },
    {
      "wave": 4,
      "tasks": ["5", "6"],
      "description": "Admin Gallery tests — independent of waves 2-3, depend only on wave 1"
    },
    {
      "wave": 5,
      "tasks": ["7"],
      "description": "Final checkpoint"
    }
  ]
}
```

---

## Tasks

- [ ] 1. Install fast-check and verify test setup
  - Add `fast-check` as a devDependency: `npm install --save-dev fast-check`
  - Confirm `npm run test:run` still passes all existing tests after the install
  - No source files are modified in this task
  - _Requirements: 1.5, 2.1, 3.5_

- [ ] 2. Property-based tests for `normalizeCategory`
  - Create `src/__tests__/gallery/gallery-categories.property.test.ts`
  - Import `fc` from `fast-check` and `normalizeCategory` from `@/lib/gallery-categories`

  - [ ]* 2.1 Write property test: output is always a valid GalleryCategory
    - **Property 1: normalizeCategory output is always a valid GalleryCategory**
    - **Validates: Requirements 1.5**
    - Use `fc.string()` (and `fc.constant(undefined)` via `fc.oneof`) to generate arbitrary inputs
    - Assert `['cooking-classes', 'personal-gallery'].includes(result)` for every generated input
    - Run minimum 100 iterations
    - Tag: `// Feature: gallery-management, Property 1: normalizeCategory output is always a valid GalleryCategory`

  - [ ]* 2.2 Write property test: legacy values always map to 'personal-gallery'
    - **Property 2: Legacy Personal Set always maps to 'personal-gallery'**
    - **Validates: Requirements 2.1**
    - Use `fc.constantFrom('cakes', 'cookies', 'breads')` as the arbitrary
    - Assert output === `'personal-gallery'` for every generated value
    - Tag: `// Feature: gallery-management, Property 2: Legacy Personal Set always maps to 'personal-gallery'`

  - [ ]* 2.3 Write property test: unknown and falsy inputs default to 'cooking-classes'
    - **Property 3: Unknown and falsy inputs always default to 'cooking-classes'**
    - **Validates: Requirements 1.3, 1.4**
    - Generate strings with `fc.string()` filtered to exclude `'personal-gallery'`, `'cakes'`, `'cookies'`, `'breads'`; also include `fc.constant(undefined)` and `fc.constant('')`
    - Assert output === `'cooking-classes'` for every generated input
    - Tag: `// Feature: gallery-management, Property 3: Unknown and falsy inputs default to cooking-classes`

  - [ ]* 2.4 Write property test: idempotence on canonical values
    - **Property 4: normalizeCategory is idempotent on canonical values**
    - **Validates: Requirements 1.1, 1.2**
    - Use `fc.constantFrom('cooking-classes', 'personal-gallery')` as the arbitrary
    - Assert `normalizeCategory(normalizeCategory(v)) === normalizeCategory(v)`
    - Tag: `// Feature: gallery-management, Property 4: normalizeCategory is idempotent on canonical values`

- [ ] 3. Property-based tests for `GalleryClient` filter logic
  - Create `src/__tests__/gallery/GalleryClient.property.test.tsx`
  - Use the same `vi.mock` pattern as the existing `GalleryClient.test.tsx` to mock `@/lib/firebase` and `firebase/firestore`
  - Define a `fc.record` arbitrary for `GalleryImage` using `fc.string()` for `imageUrl`, `altText`, `description`, and `fc.constantFrom('cooking-classes', 'personal-gallery', 'cakes', 'cookies', 'breads', 'unknown-value')` for `category`

  - [ ]* 3.1 Write property test: 'all' filter shows every image
    - **Property 5: Public Gallery 'all' filter shows every image**
    - **Validates: Requirements 3.4**
    - Generate `fc.array(galleryImageArbitrary, { minLength: 1 })` as the image list
    - Mock `mockGetDocs` to resolve with those images
    - Render `<GalleryClient />`, wait for load, verify 'All Photos' is active by default
    - Assert every `altText` is present in the DOM
    - Tag: `// Feature: gallery-management, Property 5: Public Gallery 'all' filter shows every image`

  - [ ]* 3.2 Write property test: category filter is exhaustive and exclusive
    - **Property 6: Public Gallery category filter is exhaustive and exclusive**
    - **Validates: Requirements 3.5, 4.5**
    - Generate `fc.array(galleryImageArbitrary, { minLength: 1 })` and `fc.constantFrom('cooking-classes', 'personal-gallery')` as inputs
    - Mock `mockGetDocs`, render, click the generated category tab
    - Assert exactly the images whose `normalizeCategory(category) === filterValue` are in the DOM, and no others
    - Tag: `// Feature: gallery-management, Property 6: Public Gallery category filter is exhaustive and exclusive`

  - [ ]* 3.3 Write property test: every image renders with correct src and alt
    - **Property 7: Every image renders with correct src and alt attributes**
    - **Validates: Requirements 3.2**
    - Generate `fc.array(galleryImageArbitrary, { minLength: 1 })`
    - Render with 'all' filter active
    - Assert each rendered `<img>` element has `src === img.imageUrl` and `alt === img.altText`
    - Tag: `// Feature: gallery-management, Property 7: Every image renders with correct src and alt attributes`

- [ ] 4. Lightbox interaction tests for `GalleryClient`
  - Create `src/__tests__/gallery/GalleryClient.lightbox.test.tsx`
  - Use the same `vi.mock` and `DOCS` fixture pattern as `GalleryClient.test.tsx`
  - Use `@testing-library/user-event` (`userEvent.setup()`) for click interactions

  - [ ]* 4.1 Write test: clicking an image card opens the lightbox
    - Mock `mockGetDocs` with a fixture image that has a known `altText` and `description`
    - Render `<GalleryClient />`, wait for images to load
    - Click the image wrapper element
    - Assert a modal element or `role="dialog"` containing the full-size image becomes visible
    - _Requirements: 5.1_

  - [ ]* 4.2 Write test: lightbox displays description when non-empty
    - Use an image with a non-empty `description` in the fixture
    - Open the lightbox by clicking the image
    - Assert the description text is rendered inside the modal
    - _Requirements: 5.2_

  - [ ]* 4.3 Write test: lightbox close button dismisses the modal
    - Open the lightbox, then click the close button (or overlay)
    - Assert the modal is no longer present in the DOM
    - Assert the active category filter tab is unchanged
    - _Requirements: 5.3, 5.4_

- [ ] 5. Admin Gallery CRUD example tests
  - Create `src/__tests__/gallery/AdminGallery.test.tsx`
  - Mock `@/lib/firebase` (exports `db` and `storage`), `firebase/firestore` (`getDocs`, `addDoc`, `updateDoc`, `deleteDoc`, `doc`, `collection`, `query`, `orderBy`, `serverTimestamp`), and `firebase/storage` (`ref`, `uploadBytesResumable`, `getDownloadURL`, `deleteObject`)
  - Mock `@/context/AuthContext` if needed by the admin layout
  - Define a fixture `GalleryImage` array with at least one `cooking-classes` and one legacy-category image

  - [ ]* 5.1 Write test: page loads and displays images ordered by order field
    - Mock `getDocs` to resolve with the fixture images
    - Render `<AdminGallery />`
    - Assert fixture images are rendered in the grid
    - _Requirements: 6.1_

  - [ ]* 5.2 Write test: legacy-category image displays 'Personal Gallery' label
    - Include an image with category `'cakes'` in the fixture
    - Assert the rendered category badge shows `'Personal Gallery'` (via `CATEGORY_LABELS[normalizeCategory(...)]`)
    - _Requirements: 2.4_

  - [ ]* 5.3 Write test: 'Add Photo' button opens upload modal
    - Render `<AdminGallery />`, wait for load
    - Click the 'Add Photo' button
    - Assert the modal heading 'Add New Photo' is visible
    - Assert the category `<select>` contains exactly the options from `ADMIN_CATEGORIES`
    - _Requirements: 6.2, 6.6_

  - [ ]* 5.4 Write test: edit button opens pre-populated modal
    - Click the edit icon on a fixture image
    - Assert modal heading 'Edit Photo Details' is visible
    - Assert `altText`, `description`, and `order` form inputs contain the fixture image's values
    - Assert the category `<select>` shows the normalised category of the fixture image
    - _Requirements: 6.3_

  - [ ]* 5.5 Write test: delete with confirmation removes image from grid
    - Mock `window.confirm` to return `true`
    - Mock `deleteObject` to resolve successfully
    - Mock `deleteDoc` to resolve successfully
    - Click the delete icon on a fixture image
    - Assert that image is no longer rendered in the grid
    - _Requirements: 6.4_

  - [ ]* 5.6 Write test: delete failure shows error alert
    - Mock `window.confirm` to return `true`
    - Mock `deleteDoc` to reject with an error
    - Mock `window.alert` to capture the call
    - Assert `window.alert` was called with a message containing 'Error deleting image'
    - Assert the image remains in the grid
    - _Requirements: 6.5_

  - [ ]* 5.7 Write test: upload progress indicator shown during upload
    - Mock `uploadBytesResumable` to emit `state_changed` events with partial progress
    - Open the add modal, select a valid file, submit the form
    - Assert the progress percentage element appears in the DOM during the upload phase
    - Assert the submit button is disabled while uploading
    - _Requirements: 7.4_

  - [ ]* 5.8 Write test: upload failure shows error and keeps modal open
    - Mock `uploadBytesResumable` to emit an error event
    - Open the add modal, select a valid file, submit
    - Assert a non-empty error message is displayed in the modal
    - Assert the modal is still open (modal heading still in DOM)
    - _Requirements: 7.5_

  - [ ]* 5.9 Write test: edit with replacement file updates imageUrl in Firestore
    - Open the edit modal for a fixture image
    - Select a replacement file (mock a valid `File` object, size < 10 MB)
    - Mock `uploadBytesResumable` to resolve successfully with a new download URL
    - Submit the form
    - Assert `updateDoc` was called with a payload containing the new `imageUrl`
    - _Requirements: 7.6_

- [ ] 6. Admin Gallery property-based tests
  - Create `src/__tests__/gallery/AdminGallery.property.test.tsx`
  - Reuse the same Firebase mock setup as `AdminGallery.test.tsx`

  - [ ]* 6.1 Write property test: admin edit modal pre-populates all fields
    - **Property 8: Admin edit modal pre-populates all fields from the GalleryImage**
    - **Validates: Requirements 6.3**
    - Define `fc.record({ description: fc.string(), altText: fc.string(), order: fc.integer(), category: fc.constantFrom('cooking-classes', 'personal-gallery', 'cakes', 'cookies', 'breads') })` as the arbitrary
    - For each generated image, open its edit modal and assert each form field matches the expected value (with `category` normalised)
    - Run minimum 100 iterations
    - Tag: `// Feature: gallery-management, Property 8: Admin edit modal pre-populates all fields from the GalleryImage`

  - [ ]* 6.2 Write property test: files exceeding 10 MB are always rejected
    - **Property 9: Files exceeding 10 MB are always rejected**
    - **Validates: Requirements 7.1**
    - Use `fc.integer({ min: 10 * 1024 * 1024 + 1, max: 50 * 1024 * 1024 })` to generate oversized file sizes
    - Construct a mock `File` with `Object.defineProperty(file, 'size', { value: generatedSize })`
    - Trigger `handleFileChange` with that file
    - Assert `uploadError` state is a non-empty string and `selectedFiles` does not contain the oversized file
    - Run minimum 100 iterations
    - Tag: `// Feature: gallery-management, Property 9: Files exceeding 10 MB are always rejected`

- [ ] 7. Final checkpoint — ensure all tests pass
  - Run `npm run test:run` and confirm all tests (existing + new) pass with zero failures
  - Confirm the `fast-check` property tests each report ≥ 100 runs in the output
  - Ask the user if any questions arise before closing out the spec

---

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP — core production code
  is already shipping.
- Each task references specific requirements for traceability.
- The wave-based dependency graph means waves 2 and 4 can run in parallel after wave 1 completes.
- Property tests annotated with the `Feature: gallery-management, Property N` tag make it easy to
  trace a failing property back to its design document entry.
- Do **not** run `npm run test` (watch mode) in CI — always use `npm run test:run`.
