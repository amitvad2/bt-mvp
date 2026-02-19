'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
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

    const setSession = (session: Session) => setState(prev => ({ ...prev, session }));
    const setStudent = (student: Student | 'self') => setState(prev => ({ ...prev, student, studentId: student === 'self' ? undefined : student.id }));
    const setMedicalInfo = (medicalInfo: MedicalInfo) => setState(prev => ({ ...prev, medicalInfo }));
    const setEmergencyContact = (emergencyContact: EmergencyContact) => setState(prev => ({ ...prev, emergencyContact }));
    const setQuestionnaire = (questionnaire: Questionnaire) => setState(prev => ({ ...prev, questionnaire }));
    const setTermsAccepted = (termsAccepted: boolean) => setState(prev => ({ ...prev, termsAccepted }));
    const clearState = () => setState({ sessionId });

    return (
        <BookingContext.Provider value={{
            state, loading, setSession, setStudent, setMedicalInfo,
            setEmergencyContact, setQuestionnaire, setTermsAccepted, clearState
        }}>
            {children}
        </BookingContext.Provider>
    );
}

export function useBooking() {
    const ctx = useContext(BookingContext);
    if (!ctx) throw new Error('useBooking must be used within BookingProvider');
    return ctx;
}
