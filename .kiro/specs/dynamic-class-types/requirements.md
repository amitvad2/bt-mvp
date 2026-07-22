# Requirements Document

## Introduction

This feature replaces the hardcoded `ClassType` union (`'kidsAfterSchool' | 'youngAdultWeekend'`) with a dynamic, admin-configurable `class_types` Firestore collection. Admins will manage class types via a dedicated CRUD page, and all downstream consumers (booking wizard, admin forms, session displays, public UI) will read from this collection instead of relying on string literal comparisons. The two existing class types will be preserved as seed documents in the new collection.

## Glossary

- **Admin**: An authenticated user with the `admin` role who has full access to the admin panel
- **Class_Type_Record**: A document in the `class_types` Firestore collection representing a configurable class type with display metadata and behavioural flags
- **Class_Types_Collection**: The Firestore collection at path `class_types/{id}` storing all class type definitions
- **Admin_Class_Types_Page**: The admin page at `/admin/class-types` for managing class type records
- **Admin_Classes_Page**: The existing admin page at `/admin/classes` for managing BTClass documents
- **Admin_Sessions_Page**: The existing admin page at `/admin/sessions` for managing session documents
- **Booking_Wizard**: The multi-step booking flow at `/book/[sessionId]/` that guides users through student selection, medical info, questionnaire, terms, payment, and confirmation
- **Slug**: A URL-safe identifier for a class type consisting of lowercase alphanumeric characters and hyphens
- **BTClass_Document**: A document in the `classes` Firestore collection referencing a class type via its slug
- **Badge_Colour**: A constrained set of colour tokens (`amber`, `green`, `indigo`, `red`, `gray`) used for visual indicators in the UI
- **Seed_Data**: The two initial class type records (`kidsAfterSchool` and `youngAdultWeekend`) that correspond to the previously hardcoded types

## Requirements

### Requirement 1: Class Type Data Model

**User Story:** As an admin, I want class types stored as structured Firestore documents, so that I can configure their behaviour and display properties without code changes.

#### Acceptance Criteria

1. THE Class_Types_Collection SHALL store documents with the following fields: `id` (string), `slug` (string), `displayName` (string), `shortLabel` (string), `badgeColor` (Badge_Colour), `skipQuestionnaire` (boolean), `requireEmergencyContact` (boolean), `defaultAgeMin` (number), `defaultAgeMax` (number), `defaultMaxSize` (number), `defaultPrice` (number in pence), `order` (number), and `createdAt` (Timestamp)
2. THE Class_Types_Collection SHALL enforce that each `slug` value is unique across all documents
3. THE Class_Types_Collection SHALL constrain `badgeColor` to one of: `amber`, `green`, `indigo`, `red`, `gray`
4. THE Class_Types_Collection SHALL store `defaultPrice` as an integer representing pence

### Requirement 2: Create Class Type

**User Story:** As an admin, I want to create new class types, so that I can offer additional programme categories without developer involvement.

#### Acceptance Criteria

1. WHEN an admin submits a valid class type form on the Admin_Class_Types_Page, THE Admin_Class_Types_Page SHALL create a new document in the Class_Types_Collection with all required fields populated
2. WHEN an admin enters a slug value, THE Admin_Class_Types_Page SHALL validate that the slug contains only lowercase alphanumeric characters and hyphens
3. WHEN an admin submits a slug that already exists in the Class_Types_Collection, THE Admin_Class_Types_Page SHALL display a validation error indicating the slug must be unique
4. WHEN a class type is created successfully, THE Admin_Class_Types_Page SHALL display the new class type in the list without requiring a page refresh

### Requirement 3: Edit Class Type

**User Story:** As an admin, I want to edit existing class types, so that I can adjust display names, flags, and default values as programmes evolve.

#### Acceptance Criteria

1. WHEN an admin opens the edit form for an existing class type, THE Admin_Class_Types_Page SHALL pre-populate all form fields with the current values from the Class_Type_Record
2. WHEN an admin submits a valid edit form, THE Admin_Class_Types_Page SHALL update the corresponding document in the Class_Types_Collection
3. WHEN an admin changes the slug to a value that already exists on a different document, THE Admin_Class_Types_Page SHALL display a validation error indicating the slug must be unique
4. WHEN a class type is updated successfully, THE Admin_Class_Types_Page SHALL reflect the updated values in the list without requiring a page refresh

### Requirement 4: Delete Class Type

**User Story:** As an admin, I want to delete class types that are no longer needed, so that they do not appear in dropdowns and the public UI.

#### Acceptance Criteria

1. WHEN an admin attempts to delete a class type that is referenced by one or more BTClass_Document records, THE Admin_Class_Types_Page SHALL block the deletion and display a message indicating which classes still reference the class type
2. WHEN an admin attempts to delete the last remaining class type in the Class_Types_Collection, THE Admin_Class_Types_Page SHALL block the deletion and display a message indicating at least one class type must exist
3. WHEN an admin confirms deletion of a class type that has no BTClass_Document references and is not the last remaining type, THE Admin_Class_Types_Page SHALL remove the document from the Class_Types_Collection
4. WHEN a class type is deleted successfully, THE Admin_Class_Types_Page SHALL remove the class type from the displayed list without requiring a page refresh

### Requirement 5: Admin Classes Dropdown Integration

**User Story:** As an admin, I want the class type dropdown on the admin classes page to be populated dynamically from Firestore, so that newly created class types are immediately available when defining classes.

#### Acceptance Criteria

1. WHEN the Admin_Classes_Page loads, THE Admin_Classes_Page SHALL fetch all documents from the Class_Types_Collection ordered by the `order` field
2. THE Admin_Classes_Page SHALL render the class type dropdown options using the `displayName` from each Class_Type_Record
3. WHEN a class type is selected in the dropdown, THE Admin_Classes_Page SHALL store the corresponding `slug` value as the BTClass_Document `type` field
4. WHEN the Admin_Classes_Page loads and the Class_Types_Collection is unavailable, THE Admin_Classes_Page SHALL display an error message indicating class types could not be loaded

### Requirement 6: Session Name Derivation

**User Story:** As an admin, I want session names to be derived from the class type's display name, so that renaming a class type is reflected in new sessions without code changes.

#### Acceptance Criteria

1. WHEN a session is created or updated on the Admin_Sessions_Page, THE Admin_Sessions_Page SHALL set the session `className` field to the `displayName` value of the associated Class_Type_Record
2. THE Admin_Sessions_Page SHALL derive the class type by reading the `type` field (slug) from the selected BTClass_Document and looking up the corresponding Class_Type_Record

### Requirement 7: Booking Wizard Questionnaire Step

**User Story:** As a user booking a session, I want the dietary questionnaire step to be shown or skipped based on the class type configuration, so that the booking flow is appropriate for each programme type.

#### Acceptance Criteria

1. WHEN a session's class type has `skipQuestionnaire` set to `true`, THE Booking_Wizard SHALL skip the dietary questionnaire step and navigate directly from the medical step to the terms step
2. WHEN a session's class type has `skipQuestionnaire` set to `false`, THE Booking_Wizard SHALL display the dietary questionnaire step between the medical step and the terms step
3. THE Booking_Wizard SHALL determine the `skipQuestionnaire` value by looking up the Class_Type_Record matching the session's `classType` slug

### Requirement 8: Booking Wizard Emergency Contact Step

**User Story:** As a user booking a session, I want the emergency contact form to be conditionally required based on the class type configuration, so that appropriate safeguarding information is collected for each programme.

#### Acceptance Criteria

1. WHEN a session's class type has `requireEmergencyContact` set to `true`, THE Booking_Wizard SHALL display the emergency contact form within the medical step and require all emergency contact fields to be completed before proceeding
2. WHEN a session's class type has `requireEmergencyContact` set to `false`, THE Booking_Wizard SHALL hide the emergency contact form within the medical step
3. THE Booking_Wizard SHALL determine the `requireEmergencyContact` value by looking up the Class_Type_Record matching the session's `classType` slug

### Requirement 9: Public UI Display

**User Story:** As a public visitor, I want to see dynamically configured class type names and badge colours, so that the UI accurately reflects the current programme offerings.

#### Acceptance Criteria

1. THE public classes listing page SHALL display the `displayName` from the Class_Type_Record for each session's class type
2. THE public classes listing page SHALL render badge elements using the `badgeColor` from the Class_Type_Record
3. THE public classes listing page SHALL display the `shortLabel` from the Class_Type_Record on badge elements
4. WHEN a Class_Type_Record cannot be found for a session's `classType` slug, THE public classes listing page SHALL display the raw slug value as a fallback

### Requirement 10: Admin UI Badge Display

**User Story:** As an admin, I want badge colours and labels on admin pages to reflect the dynamic class type configuration, so that the admin panel stays consistent with the public site.

#### Acceptance Criteria

1. THE Admin_Classes_Page SHALL render badge elements using the `shortLabel` and `badgeColor` from the corresponding Class_Type_Record
2. THE Admin_Sessions_Page SHALL render badge elements using the `shortLabel` and `badgeColor` from the corresponding Class_Type_Record
3. WHEN a Class_Type_Record cannot be found for a given slug, THE admin pages SHALL fall back to displaying the slug text with `gray` badge colour

### Requirement 11: Seed Data Migration

**User Story:** As an admin, I want the two existing hardcoded class types preserved as documents in the new collection, so that existing classes and sessions continue to function without manual re-configuration.

#### Acceptance Criteria

1. THE Seed_Data SHALL include a class type with slug `kidsAfterSchool`, displayName `Kids After School Club`, shortLabel `Kids`, badgeColor `amber`, skipQuestionnaire `false`, requireEmergencyContact `true`, defaultAgeMin `5`, defaultAgeMax `12`, defaultMaxSize `15`, defaultPrice `1500`, and order `1`
2. THE Seed_Data SHALL include a class type with slug `youngAdultWeekend`, displayName `Weekend Workshop`, shortLabel `Young Adult`, badgeColor `green`, skipQuestionnaire `true`, requireEmergencyContact `false`, defaultAgeMin `18`, defaultAgeMax `25`, defaultMaxSize `15`, defaultPrice `2500`, and order `2`
3. WHEN the application is deployed with the new collection, THE existing BTClass_Document records with `type` values of `kidsAfterSchool` or `youngAdultWeekend` SHALL continue to resolve to valid Class_Type_Record documents without modification

### Requirement 12: Firestore Security Rules

**User Story:** As a developer, I want appropriate security rules on the class_types collection, so that any authenticated user can read class types but only admins can write to them.

#### Acceptance Criteria

1. THE Class_Types_Collection security rules SHALL allow read access to any authenticated user
2. THE Class_Types_Collection security rules SHALL allow write access (create, update, delete) only to users whose Firestore `users/{uid}` document has `role` equal to `admin`
3. THE Class_Types_Collection security rules SHALL deny all access to unauthenticated requests

### Requirement 13: Type System Update

**User Story:** As a developer, I want the TypeScript type definitions updated to reflect the dynamic class type model, so that the codebase is type-safe and the old hardcoded union is removed.

#### Acceptance Criteria

1. THE type definitions in `src/types/index.ts` SHALL replace the `ClassType` union with `string` type for backward compatibility in existing interfaces
2. THE type definitions in `src/types/index.ts` SHALL export a new `BTClassType` interface matching the Class_Type_Record document schema
3. THE `BTClass` interface SHALL reference `type: string` instead of the former `ClassType` union
4. THE `Session` interface SHALL reference `classType: string` instead of the former `ClassType` union
