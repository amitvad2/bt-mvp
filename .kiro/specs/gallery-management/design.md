# Design Document — Gallery Management

## Overview

The Gallery Management feature has two surfaces:

- **Public Gallery** (`/gallery`) — a filterable photo grid with a lightbox, visible to all visitors.
- **Admin Gallery** (`/admin/gallery`) — a CRUD interface that allows admins to upload, edit, and
  delete gallery images.

Images are stored in Firebase Storage (binary files) and Firestore (metadata). A category
normalisation layer (`normalizeCategory`) bridges a historical taxonomy change, mapping three
legacy Firestore values (`'cakes'`, `'cookies'`, `'breads'`) to the current canonical category
`'personal-gallery'` **on read only** — stored values are never mutated.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Public Route  /gallery                                       │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  GalleryClient.tsx  (use client)                       │  │
│  │  · Firestore read: getDocs(query(gallery, orderBy))    │  │
│  │  · normalizeCategory() applied per image before filter │  │
│  │  · Category tab bar (PUBLIC_CATEGORIES)                │  │
│  │  · Image grid  →  Lightbox modal on click              │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│  Admin Route  /admin/gallery                                  │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  AdminGallery  page.tsx  (use client)                  │  │
│  │  · Firestore read: getDocs(query(gallery, orderBy))    │  │
│  │  · normalizeCategory() on load for display labels      │  │
│  │  · Add / Edit modal form (ADMIN_CATEGORIES)            │  │
│  │    → uploadBytesResumable → getDownloadURL             │  │
│  │    → addDoc / updateDoc on gallery collection          │  │
│  │  · Delete: deleteObject (Storage) + deleteDoc          │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────┐
│  src/lib/gallery-categories.ts         │
│  · normalizeCategory(raw)              │
│  · PUBLIC_CATEGORIES                   │
│  · ADMIN_CATEGORIES                    │
│  · CATEGORY_LABELS                     │
└────────────────────────────────────────┘

┌──────────────────────────────────┐     ┌────────────────────┐
│  Firestore  gallery/{docId}      │     │  Firebase Storage   │
│  GalleryImage documents          │     │  gallery/*          │
└──────────────────────────────────┘     └────────────────────┘
```

---

## Components and Interfaces

### `normalizeCategory(raw: string | undefined): GalleryCategory`

Location: `src/lib/gallery-categories.ts`

The single decision point for category resolution. Called in both GalleryClient and AdminGallery.
Never modifies Firestore data.

```
Input                      Output
─────────────────────────  ──────────────────
undefined | ''             'cooking-classes'
'cakes'                    'personal-gallery'
'cookies'                  'personal-gallery'
'breads'                   'personal-gallery'
'personal-gallery'         'personal-gallery'
'cooking-classes'          'cooking-classes'
<any other string>         'cooking-classes'
```

### `PUBLIC_CATEGORIES`

```ts
Array<{ value: GalleryCategory | 'all'; label: string }>
// [
//   { value: 'all',              label: 'All Photos' },
//   { value: 'cooking-classes',  label: 'Cooking Classes' },
//   { value: 'personal-gallery', label: 'Personal Gallery' },
// ]
```

Used exclusively by `GalleryClient` to render the three tab buttons.

### `ADMIN_CATEGORIES`

```ts
Array<{ value: GalleryCategory; label: string }>
// [
//   { value: 'cooking-classes',  label: 'Cooking Classes' },
//   { value: 'personal-gallery', label: 'Personal Gallery' },
// ]
```

Used exclusively in the Admin modal `<select>`. Does **not** contain legacy values.

### `CATEGORY_LABELS`

```ts
Record<GalleryCategory, string>
// { 'cooking-classes': 'Cooking Classes', 'personal-gallery': 'Personal Gallery' }
```

Used in AdminGallery to render the category badge on each grid item, after calling
`normalizeCategory` to ensure legacy-tagged images display as `'Personal Gallery'`.

### `GalleryClient` (Public Gallery)

State:
- `images: GalleryImage[]` — full list fetched from Firestore
- `loading: boolean`
- `activeCategory: GalleryCategory | 'all'`
- `lightboxImage: GalleryImage | null` — currently open lightbox item (null = closed)

Key derived value:
```ts
const filteredImages = activeCategory === 'all'
  ? images
  : images.filter(img => normalizeCategory(img.category) === activeCategory);
```

### `AdminGallery` (Admin CRUD)

State:
- `images: GalleryImage[]`
- `loading: boolean`
- `showModal: boolean`
- `editingImage: GalleryImage | null`
- `formData: { imageUrl, description, altText, order, category: GalleryCategory }`
- `selectedFiles: File[]`
- `uploading: boolean`
- `uploadProgress: number` (0–100)
- `uploadError: string | null`

Upload pipeline (create path):
1. For each `File` in `selectedFiles`: validate size ≤ 10 MB
2. Generate Storage path: `gallery/{timestamp}_{random}.{ext}`
3. `uploadBytesResumable` → track progress → `getDownloadURL`
4. `addDoc(collection(db, 'gallery'), payload)` where payload includes `imageUrl`, `description`, `altText`, `order`, `category`, `createdAt`, `updatedAt`

Edit path:
1. If `selectedFiles.length > 0`: upload replacement → obtain new `downloadURL`
2. `updateDoc(doc(db, 'gallery', editingImage.id), { ...formData, imageUrl: finalUrl, updatedAt })`

Delete path:
1. `deleteObject(ref(storage, img.imageUrl))` — only if URL contains `firebasestorage.googleapis.com`
2. `deleteDoc(doc(db, 'gallery', img.id))`

---

## Data Models

### `GalleryImage` (Firestore `gallery/{docId}`)

```ts
interface GalleryImage {
  id: string;               // Firestore document ID
  imageUrl: string;         // Firebase Storage download URL
  description: string;      // Optional caption (may be empty string)
  altText: string;          // Required for accessibility / SEO
  order: number;            // Integer; ascending sort key
  category?: GalleryCategory; // 'cooking-classes' | 'personal-gallery'
                            // May be undefined or a Legacy_Personal_Set value
                            // in documents written before the taxonomy update
  createdAt: any;           // Firestore serverTimestamp()
}
```

> **Note on `category`**: The type annotation uses `GalleryCategory` but Firestore contains no
> schema enforcement. Documents written by the original founder may contain `'cakes'`,
> `'cookies'`, or `'breads'`. `normalizeCategory` is the read-time adapter.

### Category Taxonomy

```
Canonical values (GalleryCategory):
  'cooking-classes'   — images from cooking class sessions
  'personal-gallery'  — founder's own bakes and personal content

Legacy values (Legacy_Personal_Set — read-only migration):
  'cakes'    → 'personal-gallery'
  'cookies'  → 'personal-gallery'
  'breads'   → 'personal-gallery'

Falsy / unknown → 'cooking-classes'
```

---

## Correctness Properties

*A property is a characteristic or behaviour that should hold true across all valid executions of a
system — essentially, a formal statement about what the system should do. Properties serve as the
bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: normalizeCategory output is always a valid GalleryCategory

*For any* input value (any string, empty string, or `undefined`), `normalizeCategory` SHALL return
a value that is a member of the `GalleryCategory` type (`'cooking-classes'` or `'personal-gallery'`).

**Validates: Requirements 1.5**

---

### Property 2: Legacy Personal Set always maps to 'personal-gallery'

*For any* value that is a member of the Legacy_Personal_Set (`'cakes'`, `'cookies'`, `'breads'`),
`normalizeCategory` SHALL return `'personal-gallery'`.

**Validates: Requirements 2.1**

---

### Property 3: Unknown and falsy inputs always default to 'cooking-classes'

*For any* string that is not `'personal-gallery'` and is not a member of the Legacy_Personal_Set
(including empty string, `undefined`, and arbitrary unknown strings), `normalizeCategory` SHALL
return `'cooking-classes'`.

**Validates: Requirements 1.3, 1.4**

---

### Property 4: normalizeCategory is idempotent on canonical values

*For any* canonical `GalleryCategory` value `v` (`'cooking-classes'` or `'personal-gallery'`),
`normalizeCategory(normalizeCategory(v))` SHALL equal `normalizeCategory(v)`.

**Validates: Requirements 1.1, 1.2**

---

### Property 5: Public Gallery 'all' filter shows every image

*For any* non-empty array of `GalleryImage` objects with arbitrary categories (including legacy
values), when the Public_Gallery active filter is `'all'`, every image in the array SHALL appear
in the rendered grid.

**Validates: Requirements 3.4**

---

### Property 6: Public Gallery category filter is exhaustive and exclusive

*For any* non-empty array of `GalleryImage` objects and *for any* non-`'all'` filter value `f`,
the set of images rendered SHALL equal exactly those images whose `normalizeCategory(img.category)`
equals `f` — no more, no fewer.

**Validates: Requirements 3.5, 4.5**

---

### Property 7: Every image renders with correct src and alt attributes

*For any* array of `GalleryImage` objects loaded into the Public_Gallery in `'all'` mode, each
image element SHALL have `src === img.imageUrl` and `alt === img.altText`.

**Validates: Requirements 3.2**

---

### Property 8: Admin edit modal pre-populates all fields from the GalleryImage

*For any* `GalleryImage` opened in the admin edit modal, the form fields `description`, `altText`,
`order`, and `category` SHALL be pre-populated with the values derived from that image
(with `category` normalised via `normalizeCategory`).

**Validates: Requirements 6.3**

---

### Property 9: Files exceeding 10 MB are always rejected

*For any* file whose size in bytes exceeds `10 * 1024 * 1024`, the Admin_Gallery upload handler
SHALL exclude that file from the upload batch and set a non-empty `uploadError` string.

**Validates: Requirements 7.1**

---

## Property Reflection

After reviewing all nine properties for redundancy:

- **Properties 2 and 3 together** fully partition the input space of `normalizeCategory` (legacy
  set → personal-gallery; everything else → cooking-classes). They are complementary, not redundant.
- **Property 1** (output always a GalleryCategory) is implied by Properties 2 + 3 combined, but
  is retained as an explicit exhaustiveness guard for generator-based testing — it catches any
  future third output value that Properties 2/3 would miss.
- **Properties 5 and 6** are complementary: Property 5 covers the `'all'` case; Property 6 covers
  filtered cases. Not redundant.
- **Property 7** is independent of Properties 5/6 — it validates attribute correctness, not
  visibility/filtering. Retained.
- **Properties 8 and 9** test different components with unrelated concerns. Retained.
- **Property 4** (idempotence) provides a qualitatively different guarantee to Properties 2/3
  (which test direction of mapping). Retained.

No properties were eliminated; all nine are non-redundant.

---

## Error Handling

| Scenario | Handling |
|----------|----------|
| Firestore `getDocs` fails in Public_Gallery | Error logged to console; loading stops; grid renders empty |
| Firestore `getDocs` fails in Admin_Gallery | Error logged to console; loading stops; grid renders empty |
| Upload file size > 10 MB | File excluded from batch; `uploadError` set with descriptive message |
| Firebase Storage `uploadBytesResumable` rejects | `uploadError` set with `e.message`; modal stays open |
| `addDoc` / `updateDoc` fails | `uploadError` set; modal stays open; no state mutation |
| `deleteObject` fails for Storage | Warning logged; Firestore `deleteDoc` still attempted |
| `deleteDoc` fails | `alert('Error deleting image.')` shown; image remains in local state |

---

## Testing Strategy

### Stack

- **Test runner**: Vitest `^4.1.4`
- **Component rendering**: `@testing-library/react` + `jsdom`
- **User interaction**: `@testing-library/user-event`
- **Property-based testing**: `fast-check` — chosen for its first-class TypeScript support,
  `fc.string()` / `fc.constantFrom()` / `fc.record()` arbitraries, and compatibility with Vitest.

### Dual Testing Approach

Unit/integration tests (example-based) cover:
- Specific rendering assertions (tab labels, loading states)
- UI interaction sequences (click tab → images filter, click image → lightbox opens)
- Admin CRUD flows with mocked Firebase (add, edit, delete)
- Static assertions on exported constants

Property-based tests cover:
- Universal properties of `normalizeCategory` (Properties 1–4)
- Filter correctness across arbitrarily generated image arrays (Properties 5–7)
- Admin edit modal pre-population (Property 8)
- File size rejection (Property 9)

Each property test MUST run a minimum of **100 iterations**.

Tag format for each property test:
```
// Feature: gallery-management, Property N: <property text>
```

### Test File Layout

```
src/__tests__/gallery/
  gallery-categories.test.ts          ← existing (example tests)
  gallery-categories.property.test.ts ← NEW (property tests for Properties 1–4)
  GalleryClient.test.tsx              ← existing (tabs, filter, rendering examples)
  GalleryClient.property.test.tsx     ← NEW (property tests for Properties 5–7)
  GalleryClient.lightbox.test.tsx     ← NEW (lightbox interaction examples)
  AdminGallery.test.tsx               ← NEW (admin CRUD example tests)
  AdminGallery.property.test.tsx      ← NEW (property tests for Properties 8–9)
```

### Coverage Gaps in Existing Tests

The existing test suite covers:
- `normalizeCategory` for each individually named input value (example-based)
- `PUBLIC_CATEGORIES`, `ADMIN_CATEGORIES`, `CATEGORY_LABELS` static assertions
- `GalleryClient` tab rendering and basic category filter behaviour (example-based with 4 fixture images)

Not yet covered:
1. **Property: `normalizeCategory` output exhaustiveness** — no property test verifies that
   arbitrary strings (beyond the five named examples) always produce a valid `GalleryCategory`.
2. **Property: idempotence of `normalizeCategory`** on canonical values.
3. **Property: filter correctness with generated image arrays** — current tests use a hardcoded
   4-image fixture; generated arrays expose edge cases (all same category, mixed legacy values, etc.).
4. **Lightbox interaction** — no test covers open/close of the lightbox modal.
5. **Admin CRUD** — no tests exist for `AdminGallery` (add, edit, delete, modal state, upload
   progress, file size validation, error states).
6. **Property: admin edit modal pre-population** across arbitrary `GalleryImage` objects.
7. **Property: file size rejection** for any file > 10 MB.
