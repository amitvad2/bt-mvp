'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Session, Student, BookingWizardState, MedicalInfo, EmergencyContact, Questionnaire } from '@/types';

interface BookingContextType {
    state: BookingWizardState;
    loading: boolean;
    setSession: (session: Session) => void;
    setStudent: (student: Student | 'self') => void;
    setMedicalInfo: (info: MedicalInfo) => void;
    setEmergencyContact: (contact: EmergencyContact) => void;
    setQuestionnaire: (q: Questionnaire) => void;
    setTermsAccepted: (accepted: boolean) => void;
    clearState: () => void;
}

const BookingContext = createContext<BookingContextType | undefined>(undefined);

export function BookingProvider({ sessionId, children }: { sessionId: string; children: React.ReactNode }) {
    const [state, setState] = useState<BookingWizardState>({ sessionId });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchSession = async () => {
            try {
                const docRef = await getDoc(doc(db, 'sessions', sessionId));
                if (docRef.exists()) {
                    setState(prev => ({ ...prev, session: { id: sessionId, ...docRef.data() } as Session }));
                }
            } catch (e) {
                console.error('Error fetching session:', e);
            } finally {
                setLoading(false);
            }
        };
        fetchSession();
    }, [sessionId]);

    const setSession = useCallback((session: Session) => setState(prev => ({ ...prev, session })), []);
    const setStudent = useCallback((student: Student | 'self') => setState(prev => ({ ...prev, student, studentId: student === 'self' ? undefined : student.id })), []);
    const setMedicalInfo = useCallback((medicalInfo: MedicalInfo) => setState(prev => ({ ...prev, medicalInfo })), []);
    const setEmergencyContact = useCallback((emergencyContact: EmergencyContact) => setState(prev => ({ ...prev, emergencyContact })), []);
    const setQuestionnaire = useCallback((questionnaire: Questionnaire) => setState(prev => ({ ...prev, questionnaire })), []);
    const setTermsAccepted = useCallback((termsAccepted: boolean) => setState(prev => ({ ...prev, termsAccepted })), []);
    const clearState = useCallback(() => setState({ sessionId }), [sessionId]);

    const contextValue = useMemo(() => ({
        state, loading, setSession, setStudent, setMedicalInfo,
        setEmergencyContact, setQuestionnaire, setTermsAccepted, clearState
    }), [state, loading, setSession, setStudent, setMedicalInfo, setEmergencyContact, setQuestionnaire, setTermsAccepted, clearState]);

    return (
        <BookingContext.Provider value={contextValue}>
            {children}
        </BookingContext.Provider>
    );
}

export function useBooking() {
    const ctx = useContext(BookingContext);
    if (!ctx) throw new Error('useBooking must be used within BookingProvider');
    return ctx;
}
