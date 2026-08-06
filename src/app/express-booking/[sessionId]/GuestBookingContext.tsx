'use client';

/**
 * GuestBookingContext — multi-step guest booking wizard state.
 *
 * State is persisted to sessionStorage under the key `guest_booking_${sessionId}`
 * so that a hard refresh mid-wizard does not lose the user's progress.
 * State is cleared from both React and sessionStorage when the user completes
 * payment and reaches the confirmation page (via `clearState`).
 *
 * `GuestBookingProvider` is mounted at the GuestBookingClient level, so a
 * separate context instance exists per session being booked.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import {
  GuestSessionInfo,
  GuestParentDetails,
  GuestChildDetails,
  GuestMedicalInfo,
  GuestAllergyDietaryInfo,
  GuestEmergencyContact,
  GuestAuthorisedCollector,
  GuestConsentRecord,
  BookingSource,
} from '@/types';

export interface GuestBookingWizardState {
  sessionId: string;
  session?: GuestSessionInfo;
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

export interface GuestBookingContextType {
  state: GuestBookingWizardState;
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

const GuestBookingContext = createContext<GuestBookingContextType | undefined>(undefined);

interface GuestBookingProviderProps {
  sessionId: string;
  session: GuestSessionInfo;
  source?: string;
  children: React.ReactNode;
}

export function GuestBookingProvider({ sessionId, session, source, children }: GuestBookingProviderProps) {
  const [state, setState] = useState<GuestBookingWizardState>({
    sessionId,
    session,
    currentStep: 0,
    source: (source as BookingSource) || 'unknown',
  });
  const [loading, setLoading] = useState(true);

  // Restore previously saved wizard state from sessionStorage on mount.
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(`guest_booking_${sessionId}`);
      if (saved) {
        const parsed = JSON.parse(saved) as GuestBookingWizardState;
        // Always use the fresh session data from server, but restore user input
        setState({
          ...parsed,
          session,
          sessionId,
          source: (source as BookingSource) || parsed.source || 'unknown',
        });
      }
    } catch (e) {
      console.error('Error restoring guest booking state:', e);
    } finally {
      setLoading(false);
    }
  }, [sessionId, session, source]);

  // Persist to sessionStorage on every state change.
  useEffect(() => {
    if (!loading) {
      try {
        sessionStorage.setItem(`guest_booking_${sessionId}`, JSON.stringify(state));
      } catch (e) {
        console.error('Error saving guest booking state:', e);
      }
    }
  }, [state, sessionId, loading]);

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
    setState({ sessionId, session, currentStep: 0, source: (source as BookingSource) || 'unknown' });
    try {
      sessionStorage.removeItem(`guest_booking_${sessionId}`);
    } catch (e) {
      console.error('Error clearing guest booking state:', e);
    }
  }, [sessionId, session, source]);

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
    <GuestBookingContext.Provider value={contextValue}>
      {children}
    </GuestBookingContext.Provider>
  );
}

/**
 * Returns the guest booking wizard context for the current session.
 * Must be called inside a component wrapped by GuestBookingProvider.
 */
export function useGuestBooking() {
  const ctx = useContext(GuestBookingContext);
  if (!ctx) throw new Error('useGuestBooking must be used within GuestBookingProvider');
  return ctx;
}
