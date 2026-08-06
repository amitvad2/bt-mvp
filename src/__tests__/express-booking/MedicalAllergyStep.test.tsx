import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockGoToStep = vi.fn();
const mockSetMedicalInfo = vi.fn();
const mockSetAllergyDietaryInfo = vi.fn();

const holder: { medicalInfo: any; allergyDietaryInfo: any } = {
  medicalInfo: undefined,
  allergyDietaryInfo: undefined,
};

vi.mock('@/app/express-booking/[sessionId]/GuestBookingContext', () => ({
  useGuestBooking: () => ({
    state: {
      sessionId: 'session-123',
      currentStep: 2,
      medicalInfo: holder.medicalInfo,
      allergyDietaryInfo: holder.allergyDietaryInfo,
    },
    loading: false,
    goToStep: mockGoToStep,
    setMedicalInfo: mockSetMedicalInfo,
    setAllergyDietaryInfo: mockSetAllergyDietaryInfo,
  }),
}));

import MedicalAllergyStep from '@/app/express-booking/[sessionId]/steps/MedicalAllergyStep';

describe('MedicalAllergyStep', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    holder.medicalInfo = undefined;
    holder.allergyDietaryInfo = undefined;
  });

  it('renders the medical and allergy section title', () => {
    render(<MedicalAllergyStep />);
    expect(screen.getByText('Medical & Allergy Information')).toBeInTheDocument();
  });

  it('displays the accommodation disclaimer', () => {
    render(<MedicalAllergyStep />);
    expect(
      screen.getByText(/does not guarantee accommodation/i)
    ).toBeInTheDocument();
  });

  it('does NOT show food allergy detail fields by default', () => {
    render(<MedicalAllergyStep />);
    // The conditional field placeholder should not be visible
    expect(screen.queryByPlaceholderText(/Peanuts, Tree nuts/i)).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/Describe specific allergens/i)).not.toBeInTheDocument();
  });

  it('shows food allergy detail fields when food allergies is checked', async () => {
    render(<MedicalAllergyStep />);
    const user = userEvent.setup();

    // Find and click the food allergies toggle
    const foodAllergyToggle = screen.getByLabelText(/does your child have food allergies/i);
    await user.click(foodAllergyToggle);

    // Conditional fields should now appear
    expect(screen.getByPlaceholderText(/Peanuts, Tree nuts/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Describe specific allergens/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Describe reactions to known allergens/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Describe symptoms that may indicate a reaction/i)).toBeInTheDocument();
  });

  it('hides food allergy detail fields when food allergies is unchecked again', async () => {
    render(<MedicalAllergyStep />);
    const user = userEvent.setup();

    const foodAllergyToggle = screen.getByLabelText(/does your child have food allergies/i);
    // Check then uncheck
    await user.click(foodAllergyToggle);
    await user.click(foodAllergyToggle);

    expect(screen.queryByPlaceholderText(/Peanuts, Tree nuts/i)).not.toBeInTheDocument();
  });

  it('does NOT show EpiPen details by default', () => {
    render(<MedicalAllergyStep />);
    expect(
      screen.queryByPlaceholderText(/Describe the EpiPen prescription/i)
    ).not.toBeInTheDocument();
  });

  it('shows EpiPen details when EpiPen required is checked', async () => {
    render(<MedicalAllergyStep />);
    const user = userEvent.setup();

    const epipenToggle = screen.getByLabelText(/does your child carry an EpiPen/i);
    await user.click(epipenToggle);

    expect(
      screen.getByPlaceholderText(/Describe the EpiPen prescription/i)
    ).toBeInTheDocument();
  });

  it('shows airborne allergy fields when airborne allergies is checked', async () => {
    render(<MedicalAllergyStep />);
    const user = userEvent.setup();

    const airborneToggle = screen.getByLabelText(/does your child have airborne allergies/i);
    await user.click(airborneToggle);

    expect(screen.getByPlaceholderText(/Dust, Pollen, Pet dander/i)).toBeInTheDocument();
  });

  it('navigates back to step 1 when Back is clicked', async () => {
    render(<MedicalAllergyStep />);
    const user = userEvent.setup();

    const backBtn = screen.getByRole('button', { name: /back/i });
    await user.click(backBtn);
    expect(mockGoToStep).toHaveBeenCalledWith(1);
  });

  it('navigates to step 3 on valid submission', async () => {
    render(<MedicalAllergyStep />);
    const user = userEvent.setup();

    const continueBtn = screen.getByRole('button', { name: /continue/i });
    await user.click(continueBtn);

    // Should save medical info and advance
    expect(mockSetMedicalInfo).toHaveBeenCalled();
    expect(mockSetAllergyDietaryInfo).toHaveBeenCalled();
    expect(mockGoToStep).toHaveBeenCalledWith(3);
  });

  it('preserves previously entered medical data from context', () => {
    holder.medicalInfo = {
      foodAllergies: true,
      dietaryRequirements: '',
      airborneAllergies: false,
      allergenDetails: 'Severe peanut allergy',
      knownReactions: '',
      symptoms: '',
      epipenRequired: true,
      epipenDetails: 'EpiPen Jr 0.15mg',
      medicationDetails: '',
      respiratoryProblems: false,
      medicalConditions: '',
      recentOperations: '',
      visionImpairment: false,
      hearingImpairment: false,
      additionalSupportNeeds: '',
      otherSafetyInfo: '',
    };
    holder.allergyDietaryInfo = {
      foodAllergies: ['Peanuts'],
      dietaryRequirements: [],
      airborneAllergies: [],
      allergenDetails: '',
      reactionDetails: '',
      symptoms: '',
    };

    render(<MedicalAllergyStep />);

    // Since foodAllergies is true from context, conditional fields should show
    expect(screen.getByPlaceholderText(/Peanuts, Tree nuts/i)).toBeInTheDocument();
    // EpiPen details should also be visible since epipenRequired is true
    expect(screen.getByPlaceholderText(/Describe the EpiPen prescription/i)).toBeInTheDocument();
  });
});
