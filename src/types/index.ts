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
    order: number;
    createdAt: any; // Firestore Timestamp
}

export interface BTClass {
    id: string;
    type: string;
    name: string;
    description?: string; // Short description shown on public listings (e.g. "5 days of no-cook recipes for young chefs")
    dayOfWeek: string;
    startTime: string;
    endTime: string;
    ageMin: number;
    ageMax: number;
    maxSize: number;
    instructor: string;
    venueId: string;
    venueName?: string;
    commitment: 'perSession' | 'term';
    price: number; // Per-session price in pence (used when commitment === 'perSession')
    // --- Term-specific fields (present only when commitment === 'term') ---
    termStartDate?: string;            // YYYY-MM-DD
    termEndDate?: string;              // YYYY-MM-DD
    termPrice?: number;                // Total term price in pence
    recurrenceDays?: string[];         // e.g. ['Monday', 'Wednesday', 'Friday']
    spotsAvailable?: number;           // Decremented on term booking; initialised to maxSize
    createdAt: any;
}

export interface Session {
    id: string;
    classId: string;
    className: string;
    classType: string;
    title?: string; // Optional session title (e.g. "Day 1: Introduction"). Falls back to recipeName if absent.
    date: string;
    recipeId: string;
    recipeName?: string;
    recipePhotoUrl?: string; // Recipe photo URL stored on session for term class schedule display
    recipeIds?: string[]; // Array of recipe IDs when session has multiple recipes
    // Skills/learning outcomes for this session (e.g. ['chopping', 'mixing', 'creative plating'])
    skills?: string[];
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
    skills?: string[]; // Skills/learning outcomes (e.g. ['chopping', 'mixing', 'creative plating'])
    createdAt: any;
}

export type BookingStatus = 'confirmed' | 'cancelled';
export type PaymentStatus = 'pending' | 'paid' | 'refunded';

// ============================================================
// Guest Express Checkout Types
// ============================================================

export type BookingMode = 'account' | 'guest';

export type BookingSource =
    | 'website'
    | 'website_express'
    | 'whatsapp_express'
    | 'facebook_express'
    | 'instagram_express'
    | 'qr_express'
    | 'google_express'
    | 'unknown';

export type SafetyReviewStatus =
    | 'not_required'
    | 'pending'
    | 'reviewed'
    | 'contact_parent'
    | 'cannot_accommodate';

export interface GuestParentDetails {
    firstName: string;
    lastName: string;
    email: string;
    telephone: string;
}

export interface GuestChildDetails {
    firstName: string;
    lastName: string;
    dateOfBirth: string; // YYYY-MM-DD
}

export interface GuestMedicalInfo {
    foodAllergies: boolean;
    dietaryRequirements: string;
    airborneAllergies: boolean;
    allergenDetails: string;
    knownReactions: string;
    symptoms: string;
    epipenRequired: boolean;
    epipenDetails: string;
    medicationDetails: string;
    respiratoryProblems: boolean;
    medicalConditions: string;
    recentOperations: string;
    visionImpairment: boolean;
    hearingImpairment: boolean;
    additionalSupportNeeds: string;
    otherSafetyInfo: string;
}

export interface GuestAllergyDietaryInfo {
    foodAllergies: string[];
    dietaryRequirements: string[];
    airborneAllergies: string[];
    allergenDetails: string;
    reactionDetails: string;
    symptoms: string;
}

export interface GuestEmergencyContact {
    name: string;
    relationship: string;
    mobile: string;
    alternativePhone: string;
    email: string;
}

export interface GuestAuthorisedCollector {
    name: string;
    relationship: string;
    phone: string;
    sameAsParent: boolean;
}

export interface GuestConsentRecord {
    // Mandatory consents
    parentGuardianAuthority: boolean;
    accuracyOfInformation: boolean;
    healthSafetyDataProcessing: boolean;
    emergencyAssistanceAuthorisation: boolean;
    termsAndCancellationPolicy: boolean;
    privacyNoticeAcknowledgement: boolean;
    // Optional consents
    photographyPromotionalUse: boolean;
    emailMarketing: boolean;
    whatsappMarketing: boolean;
}

export interface ConsentAudit {
    consents: GuestConsentRecord;
    acceptedAt: any; // Firestore Timestamp
    acceptedBy: string; // Full name of accepting person
    termsVersion: string;
    privacyNoticeVersion: string;
    sourceChannel: BookingSource;
    submissionTimestamp: any; // Firestore Timestamp
}

export interface GuestSessionInfo {
    id: string;
    className: string;
    classType: string;
    date: string;
    startTime: string;
    endTime: string;
    venueName: string;
    ageMin: number;
    ageMax: number;
    price: number; // pence
    spotsAvailable: number;
    status: string;
}

export interface GuestBooking {
    id: string; // = PaymentIntent ID
    bookingMode: 'guest';
    bookingSource: BookingSource;
    sessionId: string;
    status: BookingStatus;

    // Embedded snapshots (no linked documents)
    guestContact: GuestParentDetails;
    childSnapshot: GuestChildDetails;
    medicalSnapshot: GuestMedicalInfo;
    allergyDietarySnapshot: GuestAllergyDietaryInfo;
    emergencyContactSnapshot: GuestEmergencyContact;
    authorisedCollectorSnapshot: GuestAuthorisedCollector;
    consentAudit: ConsentAudit;
    sessionSnapshot: GuestSessionInfo;

    // Safety review
    safetyReviewStatus: SafetyReviewStatus;
    safetyReviewNotes?: string;
    safetyReviewedAt?: any;
    safetyReviewedBy?: string;

    // Payment (same shape as existing Booking.payment)
    payment: {
        stripePaymentIntentId: string;
        amount: number; // pence
        currency: string;
        status: PaymentStatus;
        receiptUrl?: string;
    };

    // Flags
    overbooking?: boolean;

    // Timestamps
    createdAt: any; // Firestore Timestamp
}

export interface GuestBookingDraft {
    stripePaymentIntentId: string;
    paymentStatus: 'pending' | 'failed';
    bookingMode: 'guest';
    sessionId: string;
    source: BookingSource;

    guestContact: GuestParentDetails;
    childDetails: GuestChildDetails;
    medicalInfo: GuestMedicalInfo;
    allergyDietaryInfo: GuestAllergyDietaryInfo;
    emergencyContact: GuestEmergencyContact;
    authorisedCollector: GuestAuthorisedCollector;
    consentAudit: ConsentAudit;

    // Idempotency
    submissionRef: string;

    createdAt: any; // Firestore serverTimestamp()
}

// ============================================================
// Bookings
// ============================================================

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
    // --- Term booking fields (present when bookingType === 'term') ---
    bookingType?: 'term';              // Absent or undefined = per-session (backward compat)
    classId?: string;                  // Reference to the term class
    recurrenceDays?: string[];         // Denormalized from class for portal display
    termStartDate?: string;            // YYYY-MM-DD
    termEndDate?: string;              // YYYY-MM-DD
    // Guest express checkout fields (optional — only present for guest bookings)
    bookingMode?: BookingMode;
    bookingSource?: BookingSource;
    safetyReviewStatus?: SafetyReviewStatus;
    safetyReviewNotes?: string;
    guestContact?: GuestParentDetails;
    childSnapshot?: GuestChildDetails;
    medicalSnapshot?: GuestMedicalInfo;
    allergyDietarySnapshot?: GuestAllergyDietaryInfo;
    emergencyContactSnapshot?: GuestEmergencyContact;
    authorisedCollectorSnapshot?: GuestAuthorisedCollector;
    consentAudit?: ConsentAudit;
    sessionSnapshot?: GuestSessionInfo;
    // Social booking attribution (optional — present for social channel bookings)
    acquisition?: AcquisitionMetadata;
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

// ============================================================
// Term Booking Wizard State
// ============================================================

export interface TermBookingWizardState {
    classId: string;
    termClass?: BTClass;
    studentId?: string;
    student?: Student | 'self';
    medicalInfo?: MedicalInfo;
    emergencyContact?: EmergencyContact;
    questionnaire?: Questionnaire;
    termsAccepted?: boolean;
}

// ============================================================
// Social Commerce Guest Booking Types
// ============================================================

export type SocialChannel = 'whatsapp' | 'instagram' | 'messenger';

export type SocialBookingState =
    | 'started'
    | 'selecting-session'
    | 'checkout-created'
    | 'payment-pending'
    | 'confirmed'
    | 'expired';

export interface SocialBookingSession {
    id: string;
    channel: SocialChannel;
    externalConversationId: string;
    externalUserId: string;
    state: SocialBookingState;
    sessionId: string | null;
    classId?: string | null;           // For term/programme bookings
    bookingType?: 'term';              // Present when booking a programme class
    checkoutTokenHash: string | null;
    tokenConsumed: boolean;
    tokenExpiresAt: any | null;       // Firestore Timestamp
    source: BookingSource;
    campaign: CampaignAttribution | null;
    socialBookingSessionId: string;    // Self-reference for attribution
    createdAt: any;                    // Firestore Timestamp
    expiresAt: any;                    // Firestore Timestamp (createdAt + 30min)
    updatedAt: any;                    // Firestore Timestamp
}

export interface CampaignAttribution {
    source: string | null;    // utm_source
    medium: string | null;    // utm_medium
    campaign: string | null;  // utm_campaign
}

export interface AcquisitionMetadata {
    bookingSource: BookingSource;
    campaign: CampaignAttribution | null;
    socialBookingSessionId: string | null;
}

export interface SessionSummary {
    sessionId: string;
    className: string;
    date: string;          // "Sat 19 Jul"
    startTime: string;     // "10:30"
    venueName: string;
    ageRange: string;      // "5–12"
    spotsAvailable: number;
    price: string;         // "£15.00"
}

export interface ProgrammeSummary {
    classId: string;
    className: string;
    termStartDate: string;  // "Mon 6 Jan"
    termEndDate: string;    // "Fri 28 Mar"
    startTime: string;      // "15:30"
    venueName: string;
    ageRange: string;       // "5–12"
    spotsAvailable: number;
    price: string;          // "£120.00 for the programme"
    recurrenceDays?: string[];  // e.g. ['Monday', 'Wednesday']
}

export interface BookingConfirmation {
    className: string;
    date: string;
    startTime: string;
    venueName: string;
    bookingRef: string;    // Last 8 chars of PaymentIntent ID
}

export type TokenValidationResult =
    | { valid: true; sessionId: string; channel: SocialChannel; campaign: CampaignAttribution | null; socialBookingSessionId: string; classId?: string; bookingType?: 'term' }
    | { valid: false; reason: 'expired' | 'consumed' | 'invalid' | 'session_unavailable' };

export type ParsedSocialEvent =
    | { type: 'trigger'; channel: SocialChannel; senderId: string; conversationId: string; text: string }
    | { type: 'session_selection'; channel: SocialChannel; senderId: string; conversationId: string; selectedSessionId: string }
    | { type: 'programme_selection'; channel: SocialChannel; senderId: string; conversationId: string; selectedClassId: string }
    | { type: 'unknown'; channel: SocialChannel; senderId: string; conversationId: string; text: string };
