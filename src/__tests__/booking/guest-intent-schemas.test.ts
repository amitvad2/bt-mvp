import { describe, it, expect } from 'vitest';
import {
  bookingSourceSchema,
  parentDetailsSchema,
  childDetailsSchema,
  medicalInfoSchema,
  emergencyContactSchema,
  authorisedCollectorSchema,
  consentsSchema,
  allergyDietaryInfoSchema,
  createGuestIntentSchema,
} from '@/app/api/payments/create-guest-intent/schemas';

const validParentDetails = {
  firstName: 'Jane',
  lastName: 'Smith',
  email: 'jane@example.com',
  telephone: '07700900000',
};

const validChildDetails = {
  firstName: 'Oliver',
  lastName: 'Smith',
  dateOfBirth: '2016-03-15',
};

const validMedicalInfo = {
  foodAllergies: false,
  dietaryRequirements: '',
  airborneAllergies: false,
  allergenDetails: '',
  knownReactions: '',
  symptoms: '',
  epipenRequired: false,
  epipenDetails: '',
  medicationDetails: '',
  respiratoryProblems: false,
  medicalConditions: '',
  recentOperations: '',
  visionImpairment: false,
  hearingImpairment: false,
  additionalSupportNeeds: '',
  otherSafetyInfo: '',
};

const validEmergencyContact = {
  name: 'John Smith',
  relationship: 'Father',
  mobile: '07700900001',
  alternativePhone: '',
  email: 'john@example.com',
};

const validAuthorisedCollector = {
  name: 'Jane Smith',
  relationship: 'Mother',
  phone: '07700900000',
  sameAsParent: true,
};

const validConsents = {
  parentGuardianAuthority: true as const,
  accuracyOfInformation: true as const,
  healthSafetyDataProcessing: true as const,
  emergencyAssistanceAuthorisation: true as const,
  termsAndCancellationPolicy: true as const,
  privacyNoticeAcknowledgement: true as const,
  photographyPromotionalUse: false,
  emailMarketing: false,
  whatsappMarketing: false,
};

const validAllergyDietaryInfo = {
  foodAllergies: [],
  dietaryRequirements: [],
  airborneAllergies: [],
  allergenDetails: '',
  reactionDetails: '',
  symptoms: '',
};

const validFullPayload = {
  sessionId: 'session-abc-123',
  source: 'whatsapp_express' as const,
  submissionRef: '550e8400-e29b-41d4-a716-446655440000',
  turnstileToken: 'turnstile-token-xyz',
  parentDetails: validParentDetails,
  childDetails: validChildDetails,
  medicalInfo: validMedicalInfo,
  allergyDietaryInfo: validAllergyDietaryInfo,
  emergencyContact: validEmergencyContact,
  authorisedCollector: validAuthorisedCollector,
  consents: validConsents,
  termsVersion: 'v1.0',
  privacyNoticeVersion: 'v1.0',
};

describe('bookingSourceSchema', () => {
  it('accepts all valid source values', () => {
    const sources = [
      'website', 'website_express', 'whatsapp_express',
      'facebook_express', 'instagram_express', 'qr_express',
      'google_express', 'unknown',
    ];
    sources.forEach(source => {
      expect(bookingSourceSchema.safeParse(source).success).toBe(true);
    });
  });

  it('rejects invalid source values', () => {
    expect(bookingSourceSchema.safeParse('twitter').success).toBe(false);
    expect(bookingSourceSchema.safeParse('').success).toBe(false);
  });
});

describe('parentDetailsSchema', () => {
  it('accepts valid parent details', () => {
    expect(parentDetailsSchema.safeParse(validParentDetails).success).toBe(true);
  });

  it('rejects empty first name', () => {
    const result = parentDetailsSchema.safeParse({ ...validParentDetails, firstName: '' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid email', () => {
    const result = parentDetailsSchema.safeParse({ ...validParentDetails, email: 'not-email' });
    expect(result.success).toBe(false);
  });

  it('rejects telephone shorter than 10 chars', () => {
    const result = parentDetailsSchema.safeParse({ ...validParentDetails, telephone: '12345' });
    expect(result.success).toBe(false);
  });

  it('rejects telephone longer than 20 chars', () => {
    const result = parentDetailsSchema.safeParse({ ...validParentDetails, telephone: '1'.repeat(21) });
    expect(result.success).toBe(false);
  });
});

describe('childDetailsSchema', () => {
  it('accepts valid child details', () => {
    expect(childDetailsSchema.safeParse(validChildDetails).success).toBe(true);
  });

  it('rejects invalid date format', () => {
    expect(childDetailsSchema.safeParse({ ...validChildDetails, dateOfBirth: '15-03-2016' }).success).toBe(false);
    expect(childDetailsSchema.safeParse({ ...validChildDetails, dateOfBirth: '2016/03/15' }).success).toBe(false);
    expect(childDetailsSchema.safeParse({ ...validChildDetails, dateOfBirth: 'not-a-date' }).success).toBe(false);
  });

  it('accepts correctly formatted date', () => {
    expect(childDetailsSchema.safeParse({ ...validChildDetails, dateOfBirth: '2018-12-01' }).success).toBe(true);
  });
});

describe('medicalInfoSchema', () => {
  it('accepts valid medical info', () => {
    expect(medicalInfoSchema.safeParse(validMedicalInfo).success).toBe(true);
  });

  it('rejects string fields exceeding max length', () => {
    const result = medicalInfoSchema.safeParse({
      ...validMedicalInfo,
      dietaryRequirements: 'a'.repeat(1001),
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-boolean for boolean fields', () => {
    const result = medicalInfoSchema.safeParse({
      ...validMedicalInfo,
      foodAllergies: 'yes',
    });
    expect(result.success).toBe(false);
  });
});

describe('emergencyContactSchema', () => {
  it('accepts valid emergency contact', () => {
    expect(emergencyContactSchema.safeParse(validEmergencyContact).success).toBe(true);
  });

  it('rejects empty name', () => {
    const result = emergencyContactSchema.safeParse({ ...validEmergencyContact, name: '' });
    expect(result.success).toBe(false);
  });

  it('rejects mobile shorter than 10 chars', () => {
    const result = emergencyContactSchema.safeParse({ ...validEmergencyContact, mobile: '12345' });
    expect(result.success).toBe(false);
  });
});

describe('authorisedCollectorSchema', () => {
  it('accepts valid authorised collector', () => {
    expect(authorisedCollectorSchema.safeParse(validAuthorisedCollector).success).toBe(true);
  });

  it('rejects empty name', () => {
    const result = authorisedCollectorSchema.safeParse({ ...validAuthorisedCollector, name: '' });
    expect(result.success).toBe(false);
  });
});

describe('consentsSchema', () => {
  it('accepts all mandatory consents as true', () => {
    expect(consentsSchema.safeParse(validConsents).success).toBe(true);
  });

  it('rejects mandatory consent set to false', () => {
    const result = consentsSchema.safeParse({
      ...validConsents,
      parentGuardianAuthority: false,
    });
    expect(result.success).toBe(false);
  });

  it('rejects each mandatory consent individually when false', () => {
    const mandatoryFields = [
      'parentGuardianAuthority',
      'accuracyOfInformation',
      'healthSafetyDataProcessing',
      'emergencyAssistanceAuthorisation',
      'termsAndCancellationPolicy',
      'privacyNoticeAcknowledgement',
    ] as const;

    mandatoryFields.forEach(field => {
      const result = consentsSchema.safeParse({ ...validConsents, [field]: false });
      expect(result.success).toBe(false);
    });
  });

  it('accepts optional consents as either true or false', () => {
    const withOptionalTrue = consentsSchema.safeParse({
      ...validConsents,
      photographyPromotionalUse: true,
      emailMarketing: true,
      whatsappMarketing: true,
    });
    expect(withOptionalTrue.success).toBe(true);

    const withOptionalFalse = consentsSchema.safeParse({
      ...validConsents,
      photographyPromotionalUse: false,
      emailMarketing: false,
      whatsappMarketing: false,
    });
    expect(withOptionalFalse.success).toBe(true);
  });
});

describe('allergyDietaryInfoSchema', () => {
  it('accepts valid allergy dietary info', () => {
    expect(allergyDietaryInfoSchema.safeParse(validAllergyDietaryInfo).success).toBe(true);
  });

  it('accepts arrays with items', () => {
    const result = allergyDietaryInfoSchema.safeParse({
      ...validAllergyDietaryInfo,
      foodAllergies: ['nuts', 'dairy'],
      dietaryRequirements: ['vegetarian'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects arrays exceeding max of 20 items', () => {
    const result = allergyDietaryInfoSchema.safeParse({
      ...validAllergyDietaryInfo,
      foodAllergies: Array.from({ length: 21 }, (_, i) => `allergy-${i}`),
    });
    expect(result.success).toBe(false);
  });
});

describe('createGuestIntentSchema', () => {
  it('accepts a valid full payload', () => {
    expect(createGuestIntentSchema.safeParse(validFullPayload).success).toBe(true);
  });

  it('rejects invalid submission ref (non-UUID)', () => {
    const result = createGuestIntentSchema.safeParse({
      ...validFullPayload,
      submissionRef: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty sessionId', () => {
    const result = createGuestIntentSchema.safeParse({
      ...validFullPayload,
      sessionId: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty turnstile token', () => {
    const result = createGuestIntentSchema.safeParse({
      ...validFullPayload,
      turnstileToken: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing nested objects', () => {
    const { parentDetails, ...withoutParent } = validFullPayload;
    const result = createGuestIntentSchema.safeParse(withoutParent);
    expect(result.success).toBe(false);
  });

  it('rejects when a mandatory consent is false in nested consents', () => {
    const result = createGuestIntentSchema.safeParse({
      ...validFullPayload,
      consents: { ...validConsents, termsAndCancellationPolicy: false },
    });
    expect(result.success).toBe(false);
  });
});
