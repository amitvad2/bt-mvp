// ============================================================
// Blooming Tastebuds — Shared TypeScript Types
// ============================================================

export type UserRole = 'parent' | 'youngAdult' | 'admin';

export interface BTUser {
    uid: string;
    role: UserRole;
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    createdAt: any;
}

export interface MedicalInfo {
    allergies: boolean;
    conditions: boolean;
    recentOperations: boolean;
    visionImpairment: boolean;
    hearingImpairment: boolean;
    glassesRequired: boolean;
    respiratoryProblems: boolean;
    otherMedicalNotes: string;
    additionalSupportNeeds: string;
}

export interface EmergencyContact {
    name: string;
    relationship: string;
    email: string;
    phone: string;
}

export interface Questionnaire {
    dietaryRequirements: string;
    airborneAllergy: string;
    reactionDetails: string;
    symptoms: string;
    epipenInfo: string;
    sameTableOk: string;
    mayContainOk: string;
}

export interface Student {
    id: string;
    parentUid: string;
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    medicalInfo?: MedicalInfo;
    emergencyContact?: EmergencyContact;
    questionnaire?: Questionnaire;
    createdAt: any;
}

export interface Venue {
    id: string;
    name: string;
    address: string;
    postcode?: string;
    lat?: number;
    lng?: number;
    createdAt: any;
}

export type ClassType = string;

export type BadgeColor = 'amber' | 'green' | 'indigo' | 'red' | 'gray';

export interface BTClassType {
    id: string;
    slug: string;
    displayName: string;
    shortLabel: string;
    badgeColor: BadgeColor;
    skipQuestionnaire: boolean;
    requireEmergencyContact: boolean;
    defaultAgeMin: number;
    defaultAgeMax: number;
    defaultMaxSize: number;
    defaultPrice: number; // integer, pence
    order: number;
    createdAt: any; // Firestore Timestamp
}

export interface BTClass {
    id: string;
    type: string;
    name: string;
    dayOfWeek: string;
    startTime: string;
    endTime: string;
    ageMin: number;
    ageMax: number;
    maxSize: number;
    instructor: string;
    venueId: string;
    venueName?: string;
    commitment: 'perSession';
    price: number; // Price in pence
    createdAt: any;
}

export interface Session {
    id: string;
    classId: string;
    className: string;
    classType: string;
    date: string;
    recipeId: string;
    recipeName?: string;
    spotsAvailable: number;
    spotsTotal: number;
    status: 'open' | 'full' | 'cancelled' | 'closed'; // Added closed
    venueId: string;
    venueName: string;
    instructorId?: string;
    instructorName?: string;
    startTime: string;
    endTime: string;
    ageMin: number;
    ageMax: number;
    price: number; // Price in pence
    createdAt: any;
}

export interface Recipe {
    id: string;
    name: string;
    description: string;
    photoUrl?: string;
    createdAt: any;
}

export type BookingStatus = 'confirmed' | 'cancelled';
export type PaymentStatus = 'pending' | 'paid' | 'refunded';

export interface Booking {
    id: string;
    sessionId: string;
    sessionDate: string;
    className: string;
    venueName: string;
    bookedByUid: string;
    bookedByName: string;
    studentId: string;
    studentName: string;
    status: BookingStatus;
    medicalInfo: MedicalInfo;
    emergencyContact?: EmergencyContact;
    questionnaire?: Questionnaire;
    termsAccepted: boolean;
    termsAcceptedAt: any;
    payment: {
        stripePaymentIntentId: string;
        amount: number;
        currency: string;
        status: PaymentStatus;
        receiptUrl?: string;
    };
    bundleId?: string;
    bundleName?: string;
    overbooking?: boolean;
    createdAt: any;
}

export type GalleryCategory = 'cooking-classes' | 'personal-gallery';

export interface GalleryImage {
    id: string;
    imageUrl: string;
    description: string;
    altText: string;
    order: number;
    category?: GalleryCategory;
    createdAt: any;
}

export type InstructorGender = 'male' | 'female' | 'non-binary' | 'prefer-not-to-say';

export interface Instructor {
    id: string;
    name: string;
    gender: InstructorGender;
    expertise: string[];   // e.g. ['Baking', 'Pasta', 'Nutrition']
    bio: string;
    photoUrl?: string;
    order: number;
    createdAt: any;
}

// ============================================================
// Contact / Feedback
// ============================================================

export type ContactCategory =
    | 'general'
    | 'class-info'
    | 'booking-help'
    | 'dietary-allergy'
    | 'private-event'
    | 'technical'
    | 'feedback';

export type ContactStatus = 'new' | 'read' | 'replied' | 'closed';

export interface ContactMessage {
    id: string;
    name: string;
    email: string;
    phone?: string;
    category: ContactCategory;
    message: string;
    consentToReply: boolean;
    source: 'contact-page';
    status: ContactStatus;
    userId?: string;
    createdAt: any;
}

// ============================================================
// Booking wizard state
export interface BookingWizardState {
    sessionId: string;
    session?: Session;
    studentId?: string;
    student?: Student | 'self'; // 'self' for young adults
    medicalInfo?: MedicalInfo;
    emergencyContact?: EmergencyContact;
    questionnaire?: Questionnaire;
    termsAccepted?: boolean;
}

// ============================================================
// Bundles
// ============================================================

export type BundleStatus = 'active' | 'closed' | 'cancelled';

export interface Bundle {
    id: string;
    name: string;                    // 3–100 characters
    classId: string;
    className: string;
    classType: string;
    sessionIds: string[];            // 2–20 session IDs, all from same classId
    bundlePrice: number;             // integer, pence (> 0, <= totalIndividualPrice)
    totalIndividualPrice: number;    // sum of session prices in pence
    status: BundleStatus;
    venueId: string;
    venueName: string;
    createdAt: any;                  // Firestore Timestamp
}

export interface BundleBookingWizardState {
    bundleId: string;
    bundle?: Bundle;
    sessions?: Session[];
    studentId?: string;
    student?: Student | 'self';
    medicalInfo?: MedicalInfo;
    emergencyContact?: EmergencyContact;
    questionnaire?: Questionnaire;
    termsAccepted?: boolean;
}
