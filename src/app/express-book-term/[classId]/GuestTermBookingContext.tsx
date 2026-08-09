'use client';

/**
 * GuestTermBookingContext — multi-step guest term booking wizard state.
 *
 * State is persisted to sessionStorage under the key `guest_term_booking_${classId}`
 * so that a hard refresh mid-wizard does not lose the user's progress.
 * State is cleared from both React and sessionStorage when the user completes
 * payment and reaches the confirmation page (via `clearState`).
 *
 * Mirrors GuestBookingContext from /express-booking/ but references a
 * term class (classId) rather than a single session (sessionId).
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import {
  GuestParentDetails,
  GuestChildDetails,
  GuestMedicalInfo,
  GuestAllergyDietaryInfo,
  GuestEmergencyContact,
  GuestAuthorisedCollector,
  GuestConsentRecord,
  BookingSource,
} from '@/types';
import { GuestTermClassInfo } from './types';

export interface GuestTermBookingWizardState {
  classId: string;
  termClass?: GuestTermClassInfo;
  currentStep: number;
  parentDetails?: GuestParentDetails;
  childDetails?: GuestChildDetails;
  medicalInfo?: GuestMedicalInfo;
  allergyDietaryInfo?: GuestAllergyDietaryInfo;
  emergencyContact?: GuestEmergencyContact;
  authorisedCollector?: GuestAuthorisedCollector;
  consents?: GuestConsentRecord;
  source?: BookingSource;
}

export interface GuestTermBookingContextType {
  state: GuestTermBookingWizardState;
  loading: boolean;
  setParentDetails: (details: GuestParentDetails) => void;
  setChildDetails: (details: GuestChildDetails) => void;
  setMedicalInfo: (info: GuestMedicalInfo) => void;
  setAllergyDietaryInfo: (info: GuestAllergyDietaryInfo) => void;
  setEmergencyContact: (contact: GuestEmergencyContact) => void;
  setAuthorisedCollector: (collector: GuestAuthorisedCollector) => void;
  setConsents: (consents: GuestConsentRecord) => void;
  goToStep: (step: number) => void;
  clearState: () => void;
}

const GuestTermBookingContext = createContext<GuestTermBookingContextType | undefined>(undefined);

interface GuestTermBookingProviderProps {
  classId: string;
  termClass: GuestTermClassInfo;
  source?: string;
  children: React.ReactNode;
}

export function GuestTermBookingProvider({ classId, termClass, source, children }: GuestTermBookingProviderProps) {
  const [state, setState] = useState<GuestTermBookingWizardState>({
    classId,
    termClass,
    currentStep: 0,
    source: (source as BookingSource) || 'unknown',
  });
  const [loading, setLoading] = useState(true);

  // Restore previously saved wizard state from sessionStorage on mount.
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(`guest_term_booking_${classId}`);
      if (saved) {
        const parsed = JSON.parse(saved) as GuestTermBookingWizardState;
        // Always use the fresh termClass data from server, but restore user input
        setState({
          ...parsed,
          termClass,
          classId,
          source: (source as BookingSource) || parsed.source || 'unknown',
        });
      }
    } catch (e) {
      console.error('Error restoring guest term booking state:', e);
    } finally {
      setLoading(false);
    }
  }, [classId, termClass, source]);

  // Persist to sessionStorage on every state change.
  useEffect(() => {
    if (!loading) {
      try {
        sessionStorage.setItem(`guest_term_booking_${classId}`, JSON.stringify(state));
      } catch (e) {
        console.error('Error saving guest term booking state:', e);
      }
    }
  }, [state, classId, loading]);

  const setParentDetails = useCallback((parentDetails: GuestParentDetails) => {
    setState(prev => ({ ...prev, parentDetails }));
  }, []);

  const setChildDetails = useCallback((childDetails: GuestChildDetails) => {
    setState(prev => ({ ...prev, childDetails }));
  }, []);

  const setMedicalInfo = useCallback((medicalInfo: GuestMedicalInfo) => {
    setState(prev => ({ ...prev, medicalInfo }));
  }, []);

  const setAllergyDietaryInfo = useCallback((allergyDietaryInfo: GuestAllergyDietaryInfo) => {
    setState(prev => ({ ...prev, allergyDietaryInfo }));
  }, []);

  const setEmergencyContact = useCallback((emergencyContact: GuestEmergencyContact) => {
    setState(prev => ({ ...prev, emergencyContact }));
  }, []);

  const setAuthorisedCollector = useCallback((authorisedCollector: GuestAuthorisedCollector) => {
    setState(prev => ({ ...prev, authorisedCollector }));
  }, []);

  const setConsents = useCallback((consents: GuestConsentRecord) => {
    setState(prev => ({ ...prev, consents }));
  }, []);

  const goToStep = useCallback((step: number) => {
    const clampedStep = Math.max(0, Math.min(5, step));
    setState(prev => ({ ...prev, currentStep: clampedStep }));
  }, []);

  const clearState = useCallback(() => {
    setState({ classId, termClass, currentStep: 0, source: (source as BookingSource) || 'unknown' });
    try {
      sessionStorage.removeItem(`guest_term_booking_${classId}`);
    } catch (e) {
      console.error('Error clearing guest term booking state:', e);
    }
  }, [classId, termClass, source]);

  const contextValue = useMemo(() => ({
    state,
    loading,
    setParentDetails,
    setChildDetails,
    setMedicalInfo,
    setAllergyDietaryInfo,
    setEmergencyContact,
    setAuthorisedCollector,
    setConsents,
    goToStep,
    clearState,
  }), [
    state, loading, setParentDetails, setChildDetails, setMedicalInfo,
    setAllergyDietaryInfo, setEmergencyContact, setAuthorisedCollector,
    setConsents, goToStep, clearState,
  ]);

  return (
    <GuestTermBookingContext.Provider value={contextValue}>
      {children}
    </GuestTermBookingContext.Provider>
  );
}

/**
 * Returns the guest term booking wizard context for the current class.
 * Must be called inside a component wrapped by GuestTermBookingProvider.
 */
export function useGuestTermBooking() {
  const ctx = useContext(GuestTermBookingContext);
  if (!ctx) throw new Error('useGuestTermBooking must be used within GuestTermBookingProvider');
  return ctx;
}
