import { z } from 'zod';

export const bookingSourceSchema = z.enum([
  'website',
  'website_express',
  'whatsapp_express',
  'facebook_express',
  'instagram_express',
  'qr_express',
  'google_express',
  'unknown',
]);

export const parentDetailsSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email().max(254),
  telephone: z.string().min(10).max(20),
});

export const childDetailsSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const medicalInfoSchema = z.object({
  foodAllergies: z.boolean(),
  dietaryRequirements: z.string().max(1000),
  airborneAllergies: z.boolean(),
  allergenDetails: z.string().max(1000),
  knownReactions: z.string().max(1000),
  symptoms: z.string().max(1000),
  epipenRequired: z.boolean(),
  epipenDetails: z.string().max(500),
  medicationDetails: z.string().max(500),
  respiratoryProblems: z.boolean(),
  medicalConditions: z.string().max(1000),
  recentOperations: z.string().max(500),
  visionImpairment: z.boolean(),
  hearingImpairment: z.boolean(),
  additionalSupportNeeds: z.string().max(1000),
  otherSafetyInfo: z.string().max(1000),
});

export const emergencyContactSchema = z.object({
  name: z.string().min(1).max(100),
  relationship: z.string().min(1).max(50),
  mobile: z.string().min(10).max(20),
  alternativePhone: z.string().max(20),
  email: z.string().email().max(254),
});

export const authorisedCollectorSchema = z.object({
  name: z.string().min(1).max(100),
  relationship: z.string().min(1).max(50),
  phone: z.string().min(10).max(20),
  sameAsParent: z.boolean(),
});

export const consentsSchema = z.object({
  parentGuardianAuthority: z.literal(true),
  accuracyOfInformation: z.literal(true),
  healthSafetyDataProcessing: z.literal(true),
  emergencyAssistanceAuthorisation: z.literal(true),
  termsAndCancellationPolicy: z.literal(true),
  privacyNoticeAcknowledgement: z.literal(true),
  photographyPromotionalUse: z.boolean(),
  emailMarketing: z.boolean(),
  whatsappMarketing: z.boolean(),
});

export const allergyDietaryInfoSchema = z.object({
  foodAllergies: z.array(z.string()).max(20),
  dietaryRequirements: z.array(z.string()).max(20),
  airborneAllergies: z.array(z.string()).max(20),
  allergenDetails: z.string().max(1000),
  reactionDetails: z.string().max(1000),
  symptoms: z.string().max(1000),
});

export const createGuestIntentSchema = z.object({
  sessionId: z.string().min(1).max(128),
  source: bookingSourceSchema,
  submissionRef: z.string().uuid(),
  turnstileToken: z.string().min(1),
  parentDetails: parentDetailsSchema,
  childDetails: childDetailsSchema,
  medicalInfo: medicalInfoSchema,
  allergyDietaryInfo: allergyDietaryInfoSchema,
  emergencyContact: emergencyContactSchema,
  authorisedCollector: authorisedCollectorSchema,
  consents: consentsSchema,
  termsVersion: z.string().min(1).max(50),
  privacyNoticeVersion: z.string().min(1).max(50),
});

export const createGuestTermIntentSchema = z.object({
  classId: z.string().min(1).max(128),
  bookingType: z.literal('term'),
  source: bookingSourceSchema,
  submissionRef: z.string().uuid(),
  turnstileToken: z.string().min(1),
  parentDetails: parentDetailsSchema,
  childDetails: childDetailsSchema,
  medicalInfo: medicalInfoSchema,
  allergyDietaryInfo: allergyDietaryInfoSchema,
  emergencyContact: emergencyContactSchema,
  authorisedCollector: authorisedCollectorSchema,
  consents: consentsSchema,
  termsVersion: z.string().min(1).max(50),
  privacyNoticeVersion: z.string().min(1).max(50),
});
