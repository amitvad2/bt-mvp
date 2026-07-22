'use client';

/**
 * BookingContext — multi-step booking wizard state.
 *
 * State is persisted to sessionStorage under the key `booking_<sessionId>` so
 * that a hard refresh mid-wizard (or a Stripe redirect back) does not lose the
 * user's progress. State is cleared from both React and sessionStorage when the
 * user reaches the confirmation page (via `clearState`).
 *
 * `BookingProvider` is mounted at the `/book/[sessionId]` layout level, so a
 * separate context instance exists per session being booked.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Session, Student, BookingWizardState, MedicalInfo, EmergencyContact, Questionnaire, BTClassType } from '@/types';

interface BookingContextType {
    state: BookingWizardState;
    loading: boolean;
    classTypeRecord: BTClassType | null;
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
    const [classTypeRecord, setClassTypeRecord] = useState<BTClassType | null>(null);

    // Restore previously saved wizard state from sessionStorage on mount.
    useEffect(() => {
        const savedState = sessionStorage.getItem(`booking_${sessionId}`);
        if (savedState) {
            try {
                setState(JSON.parse(savedState));
            } catch (e) {
                console.error('Error parsing saved booking state:', e);
            }
        }
    }, [sessionId]);

    // Persist to sessionStorage on every state change, but only once the wizard
    // has progressed past the initial empty state (more than just sessionId).
    useEffect(() => {
        if (Object.keys(state).length > 1) {
            sessionStorage.setItem(`booking_${sessionId}`, JSON.stringify(state));
        }
    }, [state, sessionId]);

    // Fetch the session document to populate price, dates, and other display data.
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

    // Fetch the class type record matching the session's classType slug.
    useEffect(() => {
        if (!state.session?.classType) return;
        const fetchClassType = async () => {
            try {
                const snap = await getDocs(collection(db, 'class_types'));
                const types = snap.docs.map(d => ({ id: d.id, ...d.data() } as BTClassType));
                const match = types.find(ct => ct.slug === state.session!.classType);
                setClassTypeRecord(match || null);
            } catch (e) {
                console.error('Error fetching class type record:', e);
            }
        };
        fetchClassType();
    }, [state.session?.classType]);

    const setSession = useCallback((session: Session) => setState(prev => ({ ...prev, session })), []);

    // `student` is either a Student document or the sentinel value 'self'.
    // 'self' means the booking is for the young adult making the booking —
    // no separate student profile is linked, and studentId is left undefined.
    const setStudent = useCallback((student: Student | 'self') => setState(prev => ({
        ...prev,
        student,
        studentId: student === 'self' ? undefined : student.id,
    })), []);

    const setMedicalInfo = useCallback((medicalInfo: MedicalInfo) => setState(prev => ({ ...prev, medicalInfo })), []);
    const setEmergencyContact = useCallback((emergencyContact: EmergencyContact) => setState(prev => ({ ...prev, emergencyContact })), []);
    const setQuestionnaire = useCallback((questionnaire: Questionnaire) => setState(prev => ({ ...prev, questionnaire })), []);
    const setTermsAccepted = useCallback((termsAccepted: boolean) => setState(prev => ({ ...prev, termsAccepted })), []);

    const clearState = useCallback(() => {
        setState({ sessionId });
        sessionStorage.removeItem(`booking_${sessionId}`);
    }, [sessionId]);

    const contextValue = useMemo(() => ({
        state, loading, classTypeRecord, setSession, setStudent, setMedicalInfo,
        setEmergencyContact, setQuestionnaire, setTermsAccepted, clearState
    }), [state, loading, classTypeRecord, setSession, setStudent, setMedicalInfo, setEmergencyContact, setQuestionnaire, setTermsAccepted, clearState]);

    return (
        <BookingContext.Provider value={contextValue}>
            {children}
        </BookingContext.Provider>
    );
}

/**
 * Returns the booking wizard context for the current session.
 * Must be called inside a component wrapped by BookingProvider.
 */
export function useBooking() {
    const ctx = useContext(BookingContext);
    if (!ctx) throw new Error('useBooking must be used within BookingProvider');
    return ctx;
}
