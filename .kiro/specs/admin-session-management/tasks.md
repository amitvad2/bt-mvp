# Implementation Plan: Admin Session Management — Test Coverage

## Overview

There are currently zero tests for `src/app/admin/sessions/page.tsx`. All tasks in this plan add test coverage from scratch. The implementation approach is:

1. Install `fast-check` for property-based testing.
2. Extract the denormalisation logic into a pure utility function so it can be tested independently of React and Firestore.
3. Write property-based tests for the core invariants (className derivation, denormalisation completeness, fallback defaults, spotsAvailable constraint, delete warning).
4. Write example-based unit and integration tests for UI behaviour, status rules, badge colours, error handling, and edit/delete flows.

No new feature code is written. The only production-code change is extracting the `buildSessionData` utility in Task 2.

---

## Task Dependency Graph

```json
{
  "waves": [
    {
      "wave": 1,
      "tasks": ["1"],
      "description": "Install fast-check so subsequent test tasks can import it"
    },
    {
      "wave": 2,
      "tasks": ["2"],
      "description": "Extract buildSessionData pure function — required by all property tests"
    },
    {
      "wave": 3,
      "tasks": ["3", "4"],
      "description": "Property-based tests for denormalisation invariants (parallel, both depend on Task 2)"
    },
    {
      "wave": 4,
      "tasks": ["5"],
      "description": "Property-based tests for spots/delete invariants (depends on Task 2)"
    },
    {
      "wave": 5,
      "tasks": ["6", "7"],
      "description": "Unit tests for UI behaviour and error handling (parallel, depend on Task 2)"
    },
    {
      "wave": 6,
      "tasks": ["8"],
      "description": "Final checkpoint"
    }
  ]
}
```

---

## Tasks

- [ ] 1. Install `fast-check` as a dev dependency
  - Run `npm install --save-dev fast-check` to add the property-based testing library.
  - Verify the package appears in `devDependencies` in `package.json`.
  - No source files are changed in this task.
  - _Requirements: none — prerequisite for all property test tasks_

- [ ] 2. Extract `buildSessionData` pure utility function
  - Create `src/app/admin/sessions/utils.ts`.
  - Move the denormalisation assembly logic out of `handleSubmit` in `page.tsx` into an exported pure function:
    ```ts
    export function buildSessionData(
      formData: { classId: string; date: string; recipeId: string; instructorId: string; status: Session['status']; spotsAvailable: number },
      parentClass: BTClass | undefined,
      recipe: Recipe | undefined,
      instructor: Instructor | undefined,
    ): Omit<Session, 'id' | 'createdAt'>
    ```
  - The function must implement the full derivation rules documented in `design.md`:
    - `className`: `'kidsAfterSchool'` → `'Kids After School Club'`, `'youngAdultWeekend'` → `'Weekend Workshop'`
    - `classType`, `venueId`, `venueName`, `price` (default 1500), `startTime`, `endTime`, `spotsTotal` (default 15), `ageMin` (default 5), `ageMax` (default 12) — all copied from `parentClass`
    - `recipeName` from `recipe?.name ?? ''`
    - `instructorName` from `instructor?.name ?? ''`
  - Update `handleSubmit` in `page.tsx` to call `buildSessionData` and spread its result.
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9_

- [ ] 3. Write property-based tests for `className` derivation and `classType` copy
  - Create `src/__tests__/admin/sessions/buildSessionData-classname.test.ts`.
  - Import `fc` from `fast-check` and `buildSessionData` from `@/app/admin/sessions/utils`.
  - [ ]* 3.1 Write property test: `className` always derived from `classType`
    - // Feature: admin-session-management, Property 1: className is always derived from classType, never free-text
    - Use `fc.record({ type: fc.constantFrom('kidsAfterSchool', 'youngAdultWeekend'), ... })` to generate arbitrary `BTClass` objects.
    - Assert: when `btClass.type === 'kidsAfterSchool'`, `result.className === 'Kids After School Club'`.
    - Assert: when `btClass.type === 'youngAdultWeekend'`, `result.className === 'Weekend Workshop'`.
    - Run minimum 100 iterations.
    - **Property 1: className is always derived from classType, never free-text**
    - **Validates: Requirements 2.1**
  - [ ]* 3.2 Write property test: `classType` on session equals `BTClass.type`
    - // Feature: admin-session-management, Property 1 (classType copy)
    - Assert: `result.classType === btClass.type` for any generated `BTClass`.
    - **Validates: Requirements 2.2**
  - _Requirements: 2.1, 2.2_

- [ ] 4. Write property-based tests for denormalisation completeness and fallback defaults
  - Create `src/__tests__/admin/sessions/buildSessionData-denorm.test.ts`.
  - [ ]* 4.1 Write property test: all inherited fields come from `BTClass`
    - // Feature: admin-session-management, Property 2: All inherited fields come from BTClass, not from form input
    - Generate arbitrary `BTClass` objects with `fc.record({ venueId: fc.string(), venueName: fc.string(), price: fc.integer({ min: 100, max: 100000 }), startTime: fc.string(), endTime: fc.string(), maxSize: fc.integer({ min: 1, max: 50 }), ageMin: fc.integer({ min: 1, max: 17 }), ageMax: fc.integer({ min: 1, max: 17 }), ... })`.
    - Assert all eight inherited fields on the result exactly equal the corresponding `BTClass` fields.
    - Run minimum 100 iterations.
    - **Property 2: All inherited fields come from BTClass, not from form input**
    - **Validates: Requirements 2.3, 2.4, 2.5, 2.6, 2.7**
  - [ ]* 4.2 Write property test: fallback defaults when `BTClass` fields are absent
    - // Feature: admin-session-management, Property 3: Default fallbacks applied when BTClass fields are absent
    - Generate `BTClass` objects where `price`, `maxSize`, `ageMin`, `ageMax` are `undefined` using `fc.record` with `fc.constant(undefined)` for those fields.
    - Assert: `result.price === 1500`, `result.spotsTotal === 15`, `result.ageMin === 5`, `result.ageMax === 12`.
    - Run minimum 100 iterations.
    - **Property 3: Default fallbacks are applied when BTClass fields are absent**
    - **Validates: Requirements 2.4, 2.6, 2.7**
  - [ ]* 4.3 Write property test: recipe and instructor names faithfully denormalised
    - // Feature: admin-session-management, Property 4: Recipe and instructor names are faithfully denormalised
    - Generate arbitrary `Recipe` objects (`fc.record({ id: fc.uuid(), name: fc.string({ minLength: 1 }) })`) and `Instructor` objects similarly.
    - Assert: `result.recipeName === recipe.name` and `result.instructorName === instructor.name`.
    - Run minimum 100 iterations.
    - **Property 4: Recipe and instructor names are faithfully denormalised**
    - **Validates: Requirements 2.8, 2.9**
  - _Requirements: 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9_

- [ ] 5. Write property-based tests for `spotsAvailable` invariant and delete warning
  - Create `src/__tests__/admin/sessions/buildSessionData-spots.test.ts` for the spots invariant.
  - Create `src/__tests__/admin/sessions/delete-warning.test.ts` for the delete warning count.
  - [ ]* 5.1 Write property test: `spotsAvailable` never exceeds `spotsTotal`
    - // Feature: admin-session-management, Property 5: spotsAvailable never exceeds spotsTotal at creation
    - Generate `fc.integer({ min: 1, max: 100 })` for `maxSize` and `fc.integer({ min: 0, max: 100 })` for `spotsAvailable`.
    - Call `buildSessionData` with the generated values.
    - Assert: `result.spotsAvailable <= result.spotsTotal`.
    - Note: if the current implementation does not enforce this cap, the test will fail — that is the intended outcome and should be fixed as part of this task.
    - Run minimum 100 iterations.
    - **Property 5: spotsAvailable never exceeds spotsTotal at creation**
    - **Validates: Requirements 6.2**
  - [ ]* 5.2 Write property test: delete warning message includes confirmed booking count
    - // Feature: admin-session-management, Property 6: Delete warning message includes the confirmed booking count
    - Extract the warning message construction into a testable pure function: `buildDeleteWarning(bookingCount: number): string`.
    - Generate `fc.integer({ min: 1, max: 500 })` for `bookingCount`.
    - Assert: the returned string contains the booking count as a number AND contains the phrase about not auto-cancelling/refunding.
    - Run minimum 100 iterations.
    - **Property 6: Delete warning message includes the confirmed booking count**
    - **Validates: Requirements 4.2**
  - _Requirements: 4.2, 6.2_

- [ ] 6. Checkpoint — run all tests
  - Ensure all tests pass, ask the user if questions arise.
  - Run `npm run test:run` and confirm zero failures before proceeding to Task 7.

- [ ] 7. Write example-based unit tests for UI behaviour, status rules, and badge colours
  - Create `src/__tests__/admin/sessions/AdminSessions-ui.test.tsx`.
  - Mock Firebase: `vi.mock('@/lib/firebase', () => ({ db: {} }))`.
  - Mock `firebase/firestore` methods (`getDocs`, `addDoc`, `updateDoc`, `deleteDoc`, `query`, `collection`, `orderBy`, `where`, `doc`, `serverTimestamp`) using `vi.mock`.
  - Mock `@/context/AuthContext` to provide an admin user.
  - [ ]* 7.1 Write unit test: loading spinner shown while data is fetching
    - Mock `getDocs` to never resolve (return a pending `Promise`).
    - Assert spinner is in the DOM and the session table is not.
    - _Requirements: 1.6_
  - [ ]* 7.2 Write unit test: table renders session rows with all required fields
    - Mock `getDocs` to return one session with known `date`, `className`, `venueName`, `spotsAvailable`, `status`.
    - Assert all five values appear in the table.
    - **Property 7: Session table rows display all required fields**
    - **Validates: Requirements 1.2**
  - [ ]* 7.3 Write unit test: badge colours for spots availability (green / amber / red)
    - Three sub-cases: `spotsAvailable = 10` (green), `spotsAvailable = 3` (amber), `spotsAvailable = 0` (red).
    - Assert the badge element carries the expected CSS class in each case.
    - _Requirements: 1.3, 1.4, 1.5_
  - [ ]* 7.4 Write unit test: status badge — indigo for 'open', grey for 'closed'
    - Assert `badge-indigo` class when `status === 'open'`; `badge-gray` when `status === 'closed'`.
    - _Requirements: 5.3, 5.4_
  - [ ]* 7.5 Write unit test: Add Session modal has exactly 3 status options, no 'full'
    - Open the modal, query the status `<select>`, assert three `<option>` elements with values `open`, `closed`, `cancelled`, and no `<option value="full">`.
    - _Requirements: 5.1, 5.5_
  - [ ]* 7.6 Write unit test: default form values — status 'open', spotsAvailable 15
    - Open the Add Session modal and assert the initial form control values.
    - _Requirements: 5.2, 6.1_
  - [ ]* 7.7 Write unit test: inherited fields absent from Add Session form
    - Open the Add Session modal and assert no inputs or selects are rendered for `className`, `classType`, `venueId`, `venueName`, `price`, `startTime`, `endTime`, `spotsTotal`, `ageMin`, `ageMax`.
    - _Requirements: 2.10_
  - [ ]* 7.8 Write unit test: edit modal pre-populates from the session being edited
    - Mock `getDocs` to return a known session. Click the edit button. Assert form fields match the session values.
    - **Property 8: Edit form pre-populates from the session being edited**
    - **Validates: Requirements 3.1**
  - [ ]* 7.9 Write unit test: save success closes modal and updates session row
    - Mock `addDoc` to resolve with a new doc ref. Submit the form. Assert the modal is gone and the table contains the new session.
    - _Requirements: 3.4, 8.3_
  - [ ]* 7.10 Write unit test: save failure shows alert 'Error saving session.'
    - Mock `addDoc` to reject. Submit the form. Assert `window.alert` was called with `'Error saving session.'`.
    - _Requirements: 3.5, 8.2_
  - [ ]* 7.11 Write unit test: `updateDoc` called with `updatedAt` on edit submit
    - Mock `updateDoc` to resolve. Submit the edit form. Assert `updateDoc` was called with an object containing `updatedAt`.
    - _Requirements: 3.3_
  - _Requirements: 1.2, 1.3, 1.4, 1.5, 1.6, 2.10, 3.1, 3.3, 3.4, 3.5, 5.1, 5.2, 5.3, 5.4, 5.5, 6.1, 8.2, 8.3_

- [ ] 8. Write example-based unit tests for delete flow and error handling
  - Add to or create `src/__tests__/admin/sessions/AdminSessions-delete.test.tsx`.
  - [ ]* 8.1 Write unit test: delete with 0 confirmed bookings shows standard confirm message
    - Mock `getDocs` for `bookings` to return empty. Spy on `window.confirm`. Assert it is called with the standard "cannot be undone" message.
    - _Requirements: 4.1, 4.3_
  - [ ]* 8.2 Write unit test: delete with N confirmed bookings shows warning with count
    - Mock `getDocs` for `bookings` to return 3 documents. Assert `window.confirm` is called with a message containing `3` and `'NOT automatically cancel or refund'`.
    - _Requirements: 4.1, 4.2_
  - [ ]* 8.3 Write unit test: confirmed delete calls `deleteDoc` and removes row from table
    - Mock `window.confirm` to return `true`. Mock `deleteDoc` to resolve. Assert `deleteDoc` was called and the session row is gone from the table.
    - _Requirements: 4.4, 4.5_
  - [ ]* 8.4 Write unit test: cancelled delete does not call `deleteDoc`
    - Mock `window.confirm` to return `false`. Assert `deleteDoc` was never called.
    - _Requirements: 4.4_
  - [ ]* 8.5 Write unit test: delete permission-denied error shows specific alert
    - Mock `deleteDoc` to reject with `{ code: 'permission-denied' }`. Assert `window.alert` contains `'Permission denied'`.
    - _Requirements: 4.6_
  - [ ]* 8.6 Write unit test: delete generic error shows alert with error message
    - Mock `deleteDoc` to reject with `{ message: 'network error' }`. Assert `window.alert` contains `'network error'`.
    - _Requirements: 4.7_
  - [ ]* 8.7 Write unit test: initial data fetch failure sets loading to false
    - Mock `getDocs` to reject. Assert no spinner remains in the DOM after the rejection.
    - _Requirements: 8.1_
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 8.1_

- [ ] 9. Final checkpoint — ensure all tests pass
  - Run `npm run test:run` and confirm zero failures across all new test files.
  - Ensure all tests pass, ask the user if questions arise.

---

## Notes

- Tasks marked with `*` are optional sub-tasks and can be skipped for a faster MVP.
- All test files mirror the source structure under `src/__tests__/admin/sessions/`.
- The CSS module proxy in `vitest.config.ts` stubs `.module.css` so style imports do not break tests — no extra setup needed.
- Firebase modules must be mocked at the top of each test file using `vi.mock` before any component imports, as per the project's established mocking pattern.
- `fast-check` runs each property a minimum of 100 times by default; no extra configuration is needed unless shrinking behaviour needs tuning.
- The `buildDeleteWarning` helper function (for Property 6) should be added to `src/app/admin/sessions/utils.ts` alongside `buildSessionData`.
