# Requirements Document

## Introduction

The Gallery Management feature provides a photo gallery for the Blooming Tastebuds public website
and a corresponding admin CRUD interface. Visitors can browse and filter images by category.
Admins can upload images to Firebase Storage, persist metadata to Firestore, edit existing entries,
and delete images. A legacy taxonomy migration layer silently maps historical Firestore category
values (`'cakes'`, `'cookies'`, `'breads'`) to the current canonical category `'personal-gallery'`
on read, without altering stored data.

## Glossary

- **Gallery_System**: The combined public gallery display and admin gallery management capability.
- **Category_Normaliser**: The `normalizeCategory` function in `src/lib/gallery-categories.ts` that maps raw Firestore category strings to a canonical `GalleryCategory`.
- **GalleryCategory**: The canonical TypeScript union type `'cooking-classes' | 'personal-gallery'` defined in `src/types/index.ts`.
- **Legacy_Personal_Set**: The immutable set of historical category strings `{ 'cakes', 'cookies', 'breads' }` written to Firestore before the taxonomy update.
- **GalleryImage**: The Firestore document shape `{ id, imageUrl, description, altText, order, category?, createdAt }` stored in the `gallery` collection.
- **Public_Gallery**: The client component `GalleryClient.tsx` rendered at `/gallery` for unauthenticated visitors.
- **Admin_Gallery**: The admin page `src/app/admin/gallery/page.tsx` at `/admin/gallery` for admins.
- **Lightbox**: The modal overlay that displays a full-size image and its description when a gallery card is clicked on the Public_Gallery.
- **Firebase_Storage**: The file storage service where image files are persisted before their download URLs are saved to Firestore.
- **Firestore**: The primary database where `GalleryImage` documents are stored in the `gallery` collection.

---

## Requirements

### Requirement 1: Category Normalisation

**User Story:** As a developer, I want all raw Firestore category strings to be normalised to a
canonical GalleryCategory before any display or filter logic runs, so that legacy and current data
are treated consistently without altering stored values.

#### Acceptance Criteria

1. WHEN `normalizeCategory` receives the string `'personal-gallery'`, THE Category_Normaliser SHALL return `'personal-gallery'`.
2. WHEN `normalizeCategory` receives the string `'cooking-classes'`, THE Category_Normaliser SHALL return `'cooking-classes'`.
3. WHEN `normalizeCategory` receives `undefined` or an empty string, THE Category_Normaliser SHALL return `'cooking-classes'`.
4. WHEN `normalizeCategory` receives any string that is not in the Legacy_Personal_Set and is not a recognised GalleryCategory, THE Category_Normaliser SHALL return `'cooking-classes'`.
5. THE Category_Normaliser SHALL produce an output value that is always a member of the GalleryCategory type (`'cooking-classes'` or `'personal-gallery'`).

---

### Requirement 2: Legacy Category Migration

**User Story:** As a site visitor, I want photos originally tagged with legacy categories (`'cakes'`,
`'cookies'`, `'breads'`) to appear under the Personal Gallery tab, so that historic founder content
is surfaced correctly without any data migration.

#### Acceptance Criteria

1. WHEN `normalizeCategory` receives any member of the Legacy_Personal_Set (`'cakes'`, `'cookies'`, `'breads'`), THE Category_Normaliser SHALL return `'personal-gallery'`.
2. THE Admin_Gallery upload form SHALL NOT expose Legacy_Personal_Set values as selectable category options.
3. THE Public_Gallery filter tabs SHALL NOT display a tab labelled `'Cakes'`, `'Cookies'`, or `'Breads'`.
4. WHEN a GalleryImage stored with a Legacy_Personal_Set category is displayed in Admin_Gallery, THE Admin_Gallery SHALL render the `CATEGORY_LABELS['personal-gallery']` label for that image.

---

### Requirement 3: Public Gallery Display

**User Story:** As a site visitor, I want to see all gallery images ordered by their `order` field,
so that I can browse the full photo collection in the sequence the admin has defined.

#### Acceptance Criteria

1. WHEN the Public_Gallery page loads, THE Gallery_System SHALL fetch all documents from the Firestore `gallery` collection ordered by the `order` field ascending.
2. WHEN images are loaded, THE Public_Gallery SHALL render each image in a grid using the `imageUrl` as the `src` attribute and the `altText` as the `alt` attribute.
3. WHEN the Firestore query is in progress, THE Public_Gallery SHALL display a loading spinner.
4. WHEN the active filter tab is `'all'`, THE Public_Gallery SHALL display every loaded GalleryImage regardless of category.
5. WHEN a category filter tab other than `'all'` is active, THE Public_Gallery SHALL display only images whose normalised category matches the active tab value.
6. WHEN no images match the active category filter, THE Public_Gallery SHALL display an empty-state message.
7. WHEN a GalleryImage has a non-empty `description` field, THE Public_Gallery SHALL render the description as a caption beneath the image.

---

### Requirement 4: Public Gallery Category Filter Tabs

**User Story:** As a site visitor, I want to filter the gallery by cooking classes or personal
content using labelled tabs, so that I can quickly find the type of photos I am interested in.

#### Acceptance Criteria

1. THE Public_Gallery SHALL render exactly three filter tabs with values `'all'`, `'cooking-classes'`, and `'personal-gallery'`.
2. THE Public_Gallery SHALL label the tabs `'All Photos'`, `'Cooking Classes'`, and `'Personal Gallery'` respectively.
3. WHEN the Public_Gallery first renders, THE Gallery_System SHALL set the active filter to `'all'`.
4. WHEN a visitor clicks a filter tab, THE Public_Gallery SHALL update the displayed images to match that category without reloading the page.
5. THE Public_Gallery SHALL apply `normalizeCategory` to each image's stored category string before comparing it to the active tab value.

---

### Requirement 5: Lightbox

**User Story:** As a site visitor, I want to click a gallery image to view it at full size with its
description, so that I can examine photos in detail.

#### Acceptance Criteria

1. WHEN a visitor clicks any image card in the Public_Gallery grid, THE Gallery_System SHALL open a modal lightbox displaying the full-size image.
2. WHEN the lightbox is open and the displayed image has a non-empty `description`, THE Gallery_System SHALL render the description text inside the lightbox modal.
3. WHEN the lightbox is open, THE Gallery_System SHALL provide a mechanism (close button or overlay click) for the visitor to dismiss the modal.
4. WHEN the lightbox is dismissed, THE Public_Gallery SHALL return focus to the gallery grid without altering the active category filter.

---

### Requirement 6: Admin Gallery CRUD

**User Story:** As an admin, I want to create, read, update, and delete gallery images via the
admin panel, so that I can manage the content displayed on the public gallery page.

#### Acceptance Criteria

1. WHEN the Admin_Gallery page loads, THE Gallery_System SHALL fetch all documents from the `gallery` Firestore collection ordered by `order` ascending and display them in a grid.
2. WHEN an admin clicks the "Add Photo" button, THE Admin_Gallery SHALL open a modal form for uploading one or more new images.
3. WHEN an admin clicks the edit icon on an existing gallery item, THE Admin_Gallery SHALL open a modal form pre-populated with that image's `imageUrl`, `description`, `altText`, `order`, and normalised `category`.
4. WHEN an admin clicks the delete icon on a gallery item and confirms the prompt, THE Admin_Gallery SHALL delete the corresponding Firestore document and, if the `imageUrl` references Firebase Storage, delete the Storage object.
5. WHEN a delete operation fails, THE Admin_Gallery SHALL display an error alert and leave the image in the displayed grid.
6. THE Admin_Gallery category selector in the modal form SHALL offer exactly the values in `ADMIN_CATEGORIES` (`'cooking-classes'` and `'personal-gallery'`).

---

### Requirement 7: Image Upload to Firebase Storage

**User Story:** As an admin, I want to upload image files through the admin panel so that they are
stored in Firebase Storage and their download URLs are persisted to Firestore.

#### Acceptance Criteria

1. WHEN an admin selects one or more image files for a new upload, THE Gallery_System SHALL reject any file whose size exceeds 10 MB and display an error message identifying the rejected file(s).
2. WHEN an admin submits the upload form with valid files, THE Gallery_System SHALL upload each file to Firebase Storage under the `gallery/` path prefix and obtain a download URL.
3. WHEN all files have been uploaded successfully, THE Gallery_System SHALL write a `GalleryImage` document to Firestore for each uploaded file containing `imageUrl`, `description`, `altText`, `order`, `category`, and `createdAt` fields.
4. WHEN an upload is in progress, THE Admin_Gallery SHALL display a numeric upload progress indicator (percentage) and disable the submit button.
5. IF an upload fails, THEN THE Admin_Gallery SHALL display a descriptive error message and leave the form open so the admin can retry.
6. WHEN editing an existing gallery image and a replacement file is selected, THE Admin_Gallery SHALL upload the replacement file to Firebase Storage, obtain the new download URL, and update the existing Firestore document with the new `imageUrl`.
