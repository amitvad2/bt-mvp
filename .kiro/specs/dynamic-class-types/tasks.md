# Implementation Plan: Dynamic Class Types

## Overview

Replace the hardcoded `ClassType` union with a dynamic `class_types` Firestore collection. Implementation proceeds in layers: type definitions first, then infrastructure (rules + seed data), then the new admin CRUD page, then refactoring existing consumers, and finally tests. Each task builds incrementally on the previous so the codebase remains functional at every step.

## Tasks

- [x] 1. Type definitions and data model
  - [x] 1.1 Add `BTClassType` interface and update `ClassType` to `string`
    - In `src/types/index.ts`: export `BadgeColor` type (`'amber' | 'green' | 'indigo' | 'red' | 'gray'`), export `BTClassType` interface with all fields (`id`, `slug`, `displayName`, `shortLabel`, `badgeColor`, `skipQuestionnaire`, `requireEmergencyContact`, `defaultAgeMin`, `defaultAgeMax`, `defaultMaxSize`, `defaultPrice`, `order`, `createdAt`)
    - Change `export type ClassType = 'kidsAfterSchool' | 'youngAdultWeekend'` to `export type ClassType = string`
    - Update `BTClass.type` to use `string` (removing union constraint)
    - Update `Session.classType` to use `string`
    - _Requirements: 13.1, 13.2, 13.3, 13.4_

- [x] 2. Firestore security rules and seed data
  - [x] 2.1 Add `class_types` collection security rule
    - In `firestore.rules`, add a new match block: `match /class_types/{docId}` with `allow read: if isSignedIn();` and `allow write: if isAdmin();`
    - Place it alongside the existing public content rules (after `instructors`)
    - _Requirements: 12.1, 12.2, 12.3_

  - [x] 2.2 Create seed data script for initial class type documents
    - Create `scripts/seed-class-types.ts` using Firebase Admin SDK
    - Seed two documents: `kidsAfterSchool` (displayName: "Kids After School Club", shortLabel: "Kids", badgeColor: "amber", skipQuestionnaire: false, requireEmergencyContact: true, defaultAgeMin: 5, defaultAgeMax: 12, defaultMaxSize: 15, defaultPrice: 1500, order: 1) and `youngAdultWeekend` (displayName: "Weekend Workshop", shortLabel: "Young Adult", badgeColor: "green", skipQuestionnaire: true, requireEmergencyContact: false, defaultAgeMin: 18, defaultAgeMax: 25, defaultMaxSize: 15, defaultPrice: 2500, order: 2)
    - Use `FieldValue.serverTimestamp()` for `createdAt`
    - Include a check to skip if documents already exist (idempotent)
    - _Requirements: 11.1, 11.2, 11.3_

- [x] 3. Checkpoint — Type foundation complete
  - Ensure TypeScript compiles cleanly with the updated types. Ensure seed script is ready to run. Ask the user if questions arise.

- [x] 4. Admin Class Types CRUD page
  - [x] 4.1 Create the Zod schema and page module CSS
    - Create `src/app/admin/class-types/page.module.css` following the pattern from `src/app/admin/classes/page.module.css`
    - Define the `classTypeSchema` Zod schema inline in the page file (or in a separate util if preferred) matching the design: slug regex `/^[a-z0-9-]+$/`, displayName required, shortLabel max 20, badgeColor enum, boolean flags, number fields with min constraints
    - _Requirements: 1.1, 1.3, 2.2_

  - [x] 4.2 Implement the Admin Class Types page with full CRUD
    - Create `src/app/admin/class-types/page.tsx` as a `'use client'` component
    - Follow the same pattern as `src/app/admin/classes/page.tsx`: state for `classTypes`, `loading`, `showModal`, `editingClassType`
    - On mount: `getDocs(query(collection(db, 'class_types'), orderBy('order')))`
    - List view: render each class type as a card with badge preview (shortLabel + badgeColor), displayName, flags, defaults
    - Modal form: React Hook Form + Zod with `zodResolver`, all fields from the schema
    - Create: `addDoc` with `serverTimestamp()` for `createdAt`; optimistic local state update
    - Edit: `updateDoc` with `serverTimestamp()` for `updatedAt`; pre-populate form; optimistic update
    - Slug uniqueness check: before write, verify no other document has the same slug (from local state)
    - _Requirements: 1.1, 1.2, 2.1, 2.3, 2.4, 3.1, 3.2, 3.3, 3.4_

  - [x] 4.3 Implement delete with safety guards
    - Before deletion: query `classes` collection for documents where `type === slug`; if any exist, show alert listing referencing classes and abort
    - Before deletion: check if this is the last class type in local state; if so, show "Cannot delete the last class type" message and abort
    - On confirm: `deleteDoc`; remove from local state
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [x] 5. Admin navigation update
  - [x] 5.1 Add "Class Types" nav item to admin sidebar
    - In `src/app/admin/layout.tsx`, add a new entry to the `navItems` array: `{ href: '/admin/class-types', icon: Tag, label: 'Class Types' }` (import `Tag` from `lucide-react`)
    - Position it after "Classes" in the nav order for logical grouping
    - _Requirements: 2.1 (discoverability)_

- [x] 6. Checkpoint — Admin Class Types page complete
  - Ensure the new page renders, CRUD operations work with Firestore, delete guards function. Ensure all tests pass, ask the user if questions arise.

- [x] 7. Admin Classes page refactor
  - [x] 7.1 Replace hardcoded class type dropdown with dynamic fetch
    - In `src/app/admin/classes/page.tsx`: add `classTypes` state, fetch `class_types` collection on mount (alongside venues)
    - Replace the hardcoded `<select>` (`kidsAfterSchool` / `youngAdultWeekend` options) with dynamic options mapped from `classTypes` using `displayName` as label and `slug` as value
    - On form submit, `formData.type` already stores the slug — no change needed to write logic
    - Replace hardcoded badge logic (`c.type === 'kidsAfterSchool' ? 'Kids' : 'Young Adult'`) with a lookup into `classTypes` array for `shortLabel` and `badgeColor`
    - Add fallback: if class type not found, display slug with `gray` badge
    - Handle error state if `class_types` fetch fails (disable dropdown, show inline error)
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 10.1, 10.3_

- [x] 8. Admin Sessions page refactor
  - [x] 8.1 Update className derivation and badge rendering
    - In `src/app/admin/sessions/page.tsx`: add `classTypes` state (type `BTClassType[]`), fetch `class_types` on mount alongside existing fetches
    - In `handleSubmit`, replace the hardcoded `className` derivation (`parentClass?.type === 'kidsAfterSchool' ? 'Kids After School Club' : 'Weekend Workshop'`) with: look up `classTypes.find(ct => ct.slug === parentClass?.type)?.displayName`
    - Replace hardcoded badge rendering in the table with dynamic lookup using `shortLabel` and `badgeColor`
    - Add fallback for missing class type records
    - _Requirements: 6.1, 6.2, 10.2, 10.3_

- [x] 9. Booking wizard refactor
  - [x] 9.1 Extend BookingContext with class type record resolution
    - In `src/context/BookingContext.tsx`: import `BTClassType`, add `classTypeRecord: BTClassType | null` to `BookingContextType` and state
    - Add a `useEffect` that fetches `class_types` collection when `state.session?.classType` is set, finds the matching record by slug, and stores it in state
    - Expose `classTypeRecord` via the context value
    - _Requirements: 7.3, 8.3_

  - [x] 9.2 Update wizard step visibility based on `skipQuestionnaire` flag
    - In `src/app/book/[sessionId]/layout.tsx` (or wherever step filtering logic lives): replace `state.session?.classType === 'kidsAfterSchool'` condition with `classTypeRecord?.skipQuestionnaire === false`
    - If `skipQuestionnaire` is `true`, skip the questionnaire step (navigate from medical → terms)
    - If `classTypeRecord` is null (still loading or not found), default to showing the step
    - _Requirements: 7.1, 7.2_

  - [x] 9.3 Update medical step emergency contact visibility based on `requireEmergencyContact` flag
    - In `src/app/book/[sessionId]/medical/page.tsx`: replace any `isKid` or `classType === 'kidsAfterSchool'` check with `classTypeRecord?.requireEmergencyContact === true`
    - Show and require emergency contact form when flag is `true`; hide when `false`
    - _Requirements: 8.1, 8.2_

- [x] 10. Public UI updates
  - [x] 10.1 Update SessionBrowser and public classes page with dynamic badges
    - In `src/components/sessions/SessionBrowser.tsx`: fetch `class_types` on mount, replace any hardcoded type filter options and badge rendering with dynamic lookups from the fetched class types
    - In `src/app/(public)/classes/` (ClassesClient.tsx or equivalent): same pattern — fetch class types, render `displayName`, `shortLabel`, `badgeColor` dynamically
    - Fallback: if no matching class type found, show raw slug with `gray` badge
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

- [x] 11. Checkpoint — All refactors complete
  - Ensure all tests pass, the app builds without TypeScript errors. Verify the booking wizard correctly shows/hides steps. Ask the user if questions arise.

- [x] 12. Property-based tests
  - [x] 12.1 Write property test for slug uniqueness validation
    - **Property 1: Slug Uniqueness Invariant**
    - **Validates: Requirements 1.2, 2.3, 3.3**
    - Use `fast-check` to generate arrays of class type records + a candidate slug; verify the validation function rejects duplicates and accepts unique slugs

  - [x] 12.2 Write property test for slug format validation
    - **Property 2: Slug Format Validation**
    - **Validates: Requirements 2.2**
    - Use `fast-check` to generate arbitrary strings; verify the Zod slug regex accepts iff the string matches `/^[a-z0-9-]+$/`

  - [x] 12.3 Write property test for questionnaire step visibility
    - **Property 3: Flag-Driven Questionnaire Step Visibility**
    - **Validates: Requirements 7.1, 7.2**
    - Generate random `skipQuestionnaire` boolean values; verify step filter function includes/excludes questionnaire step correctly

  - [x] 12.4 Write property test for emergency contact form visibility
    - **Property 4: Flag-Driven Emergency Contact Form Visibility**
    - **Validates: Requirements 8.1, 8.2**
    - Generate random `requireEmergencyContact` boolean values; verify form visibility logic returns correct result

  - [x] 12.5 Write property test for delete safety (referenced type)
    - **Property 5: Delete Safety — Referenced Type Cannot Be Deleted**
    - **Validates: Requirements 4.1**
    - Generate random class type collections + BTClass reference sets; verify delete guard blocks when references exist

  - [x] 12.6 Write property test for minimum-one invariant
    - **Property 6: Minimum-One Invariant**
    - **Validates: Requirements 4.2**
    - Generate collections of size 1; verify delete guard always blocks

  - [x] 12.7 Write property test for display name derivation
    - **Property 7: Display Name Derivation**
    - **Validates: Requirements 6.1, 9.1**
    - Generate random class types + BTClass records; verify derivation function returns matching displayName

  - [x] 12.8 Write property test for badge rendering
    - **Property 8: Badge Rendering From Class Type Record**
    - **Validates: Requirements 9.2, 9.3, 10.1, 10.2, 10.3**
    - Generate random class types + session records; verify badge resolver returns correct shortLabel + badgeColor with gray fallback for missing types

- [x] 13. Unit tests for key components
  - [x] 13.1 Write unit tests for Admin Class Types CRUD page
    - File: `src/__tests__/admin/class-types.test.tsx`
    - Test: form validation (slug format, required fields, uniqueness check), create/edit/delete flows, delete guards (referenced type, last type), modal open/close state
    - Mock `firebase/firestore` methods, mock `useAuth` for admin context
    - _Requirements: 1.1, 2.1, 2.2, 2.3, 3.1, 4.1, 4.2_

  - [x] 13.2 Write unit tests for dynamic classes dropdown
    - File: `src/__tests__/admin/classes-dropdown.test.tsx`
    - Test: dropdown renders options from fetched class types, stores slug on selection, shows error on fetch failure, badge rendering uses dynamic data
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 10.1_

  - [x] 13.3 Write unit tests for session className derivation
    - File: `src/__tests__/admin/sessions-classname.test.tsx`
    - Test: handleSubmit sets className from class type displayName lookup, fallback when type not found
    - _Requirements: 6.1, 6.2, 10.2_

  - [x] 13.4 Write unit tests for booking wizard step visibility
    - File: `src/__tests__/booking/wizard-step-visibility.test.tsx`
    - Test: questionnaire step shown when `skipQuestionnaire === false`, hidden when `true`; emergency contact form shown when `requireEmergencyContact === true`, hidden when `false`
    - _Requirements: 7.1, 7.2, 8.1, 8.2_

  - [x] 13.5 Write unit tests for session browser badge rendering
    - File: `src/__tests__/components/session-browser-badges.test.tsx`
    - Test: badges use dynamic shortLabel and badgeColor, fallback to slug + gray when class type not found
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

- [x] 14. Final checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The seed script (2.2) is idempotent — safe to re-run without duplicating data
- All admin pages follow the established `'use client'` + Firestore client SDK read pattern
- Forms use React Hook Form + Zod with `zodResolver` as per project convention
- CSS Modules are colocated with components; global utility classes (`.btn`, `.badge`, `.card`, `.modal`) from `globals.css` are reused

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1", "2.2"] },
    { "id": 2, "tasks": ["4.1", "5.1"] },
    { "id": 3, "tasks": ["4.2"] },
    { "id": 4, "tasks": ["4.3"] },
    { "id": 5, "tasks": ["7.1", "8.1"] },
    { "id": 6, "tasks": ["9.1"] },
    { "id": 7, "tasks": ["9.2", "9.3", "10.1"] },
    { "id": 8, "tasks": ["12.1", "12.2", "12.5", "12.6"] },
    { "id": 9, "tasks": ["12.3", "12.4", "12.7", "12.8"] },
    { "id": 10, "tasks": ["13.1", "13.2", "13.3", "13.4", "13.5"] }
  ]
}
```
