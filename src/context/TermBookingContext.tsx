'use client';

/**
 * TermBookingContext — multi-step term booking wizard state.
 *
 * State is persisted to sessionStorage under the key `booking_term_<classId>`
 * so that a hard refresh mid-wizard (or a Stripe redirect back) does not lose
 * the user's progress. State is cleared from both React and sessionStorage when
 * the user reaches the confirmation page (via `clearState`).
 *
 * `TermBookingProvider` is mounted at the `/book-term/[classId]` layout level,
 * so a separate context instance exists per term class being booked.
 *
 * On mount the provider fetches the BTClass document and validates:
 *  - commitment === 'term'
 *  - spotsAvailable > 0
 *  - termEndDate >= today
 * If any check fails the user is redirected to /classes with an error.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
    BTClass,
    Student,
    MedicalInfo,
    EmergencyContact,
    Questionnaire,
    TermBookingWizardState,
    BTClassType,
} from '@/types';
import { isTermClassExpired } from '@/lib/term-utils';

interface TermBookingContextType {
    state: TermBookingWizardState;
    loading: boolean;
    termClass: BTClass | null;
    classTypeRecord: BTClassType | null;
    setStudent: (student: Student | 'self') => void;
    setMedicalInfo: (info: MedicalInfo) => void;
    setEmergencyContact: (contact: EmergencyContact) => void;
    setQuestionnaire: (q: Questionnaire) => void;
    setTermsAccepted: (accepted: boolean) => void;
    clearState: () => void;
}

const TermBookingContext = createContext<TermBookingContextType | undefined>(undefined);

export function TermBookingProvider({ classId, children }: { classId: string; children: React.ReactNode }) {
    const router = useRouter();
    const [state, setState] = useState<TermBookingWizardState>({ classId });
    const [loading, setLoading] = useState(true);
    const [termClass, setTermClass] = useState<BTClass | null>(null);
    const [classTypeRecord, setClassTypeRecord] = useState<BTClassType | null>(null);

    // Restore previously saved wizard state from sessionStorage on mount.
    useEffect(() => {
        const savedState = sessionStorage.getItem(`booking_term_${classId}`);
        if (savedState) {
            try {
                setState(JSON.parse(savedState));
            } catch (e) {
                console.error('Error parsing saved term booking state:', e);
            }
        }
    }, [classId]);

    // Persist to sessionStorage on every state change, but only once the wizard
    // has progressed past the initial empty state (more than just classId).
    useEffect(() => {
        if (Object.keys(state).length > 1) {
            sessionStorage.setItem(`booking_term_${classId}`, JSON.stringify(state));
        }
    }, [state, classId]);

    // Fetch the BTClass document and validate term eligibility.
    useEffect(() => {
        const fetchAndValidateClass = async () => {
            try {
                const classRef = doc(db, 'classes', classId);
                const classSnap = await getDoc(classRef);

                if (!classSnap.exists()) {
                    console.error('Class not found:', classId);
                    router.replace('/classes?error=class_not_found');
                    return;
                }

                const classData = { id: classId, ...classSnap.data() } as BTClass;

                // Validate: must be a term class
                if (classData.commitment !== 'term') {
                    console.error('Class is not a term class:', classId);
                    router.replace('/classes?error=not_term_class');
                    return;
                }

                // Validate: spots must be available
                if (!classData.spotsAvailable || classData.spotsAvailable <= 0) {
                    console.error('Term class is full:', classId);
                    router.replace('/classes?error=class_full');
                    return;
                }

                // Validate: term must not have ended
                if (!classData.termEndDate || isTermClassExpired(classData.termEndDate)) {
                    console.error('Term class has expired:', classId);
                    router.replace('/classes?error=term_expired');
                    return;
                }

                setTermClass(classData);
                setState(prev => ({ ...prev, termClass: classData }));
            } catch (e) {
                console.error('Error fetching term class:', e);
                router.replace('/classes?error=fetch_failed');
            } finally {
                setLoading(false);
            }
        };

        fetchAndValidateClass();
    }, [classId, router]);

    // Fetch the class type record matching the term class's type slug.
    useEffect(() => {
        if (!termClass?.type) return;

        const fetchClassType = async () => {
            try {
                const snap = await getDocs(collection(db, 'class_types'));
                const types = snap.docs.map(d => ({ id: d.id, ...d.data() } as BTClassType));
                const match = types.find(ct => ct.slug === termClass.type);
                setClassTypeRecord(match || null);
            } catch (e) {
                console.error('Error fetching class type record:', e);
            }
        };

        fetchClassType();
    }, [termClass?.type]);

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
        setState({ classId });
        sessionStorage.removeItem(`booking_term_${classId}`);
    }, [classId]);

    const contextValue = useMemo(() => ({
        state, loading, termClass, classTypeRecord, setStudent, setMedicalInfo,
        setEmergencyContact, setQuestionnaire, setTermsAccepted, clearState,
    }), [state, loading, termClass, classTypeRecord, setStudent, setMedicalInfo, setEmergencyContact, setQuestionnaire, setTermsAccepted, clearState]);

    return (
        <TermBookingContext.Provider value={contextValue}>
            {children}
        </TermBookingContext.Provider>
    );
}

/**
 * Returns the term booking wizard context for the current term class.
 * Must be called inside a component wrapped by TermBookingProvider.
 */
export function useTermBooking() {
    const ctx = useContext(TermBookingContext);
    if (!ctx) throw new Error('useTermBooking must be used within TermBookingProvider');
    return ctx;
}
