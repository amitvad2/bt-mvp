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
    createdAt: any;
}

export type ClassType = 'kidsAfterSchool' | 'youngAdultWeekend';

export interface BTClass {
    id: string;
    type: ClassType;
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
    classType: ClassType;
    date: string;
    recipeId: string;
    recipeName?: string;
    spotsAvailable: number;
    spotsTotal: number;
    status: 'open' | 'full' | 'cancelled' | 'closed'; // Added closed
    venueId: string;
    venueName: string;
    instructor: string;
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
    createdAt: any;
}

export interface GalleryImage {
    id: string;
    imageUrl: string;
    description: string;
    altText: string;
    order: number;
    createdAt: any;
}

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
