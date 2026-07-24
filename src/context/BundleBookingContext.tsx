'use client';

/**
 * BundleBookingContext — multi-step bundle booking wizard state.
 *
 * State is persisted to sessionStorage under the key `bundle_booking_<bundleId>`
 * so that a hard refresh mid-wizard (or a Stripe redirect back) does not lose
 * the user's progress. State is cleared from both React and sessionStorage when
 * the user reaches the confirmation page (via `clearState`).
 *
 * `BundleBookingProvider` is mounted at the `/book/bundle/[bundleId]` layout
 * level, so a separate context instance exists per bundle being booked.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
    Bundle,
    Session,
    Student,
    MedicalInfo,
    EmergencyContact,
    Questionnaire,
    BundleBookingWizardState,
    BTClassType,
} from '@/types';

interface BundleBookingContextType {
    state: BundleBookingWizardState;
    loading: boolean;
    classTypeRecord: BTClassType | null;
    setStudent: (student: Student | 'self') => void;
    setMedicalInfo: (info: MedicalInfo) => void;
    setEmergencyContact: (contact: EmergencyContact) => void;
    setQuestionnaire: (q: Questionnaire) => void;
    setTermsAccepted: (accepted: boolean) => void;
    clearState: () => void;
}

const BundleBookingContext = createContext<BundleBookingContextType | undefined>(undefined);

export function BundleBookingProvider({ bundleId, children }: { bundleId: string; children: React.ReactNode }) {
    const [state, setState] = useState<BundleBookingWizardState>({ bundleId });
    const [loading, setLoading] = useState(true);
    const [classTypeRecord, setClassTypeRecord] = useState<BTClassType | null>(null);

    // Restore previously saved wizard state from sessionStorage on mount.
    useEffect(() => {
        const savedState = sessionStorage.getItem(`bundle_booking_${bundleId}`);
        if (savedState) {
            try {
                setState(JSON.parse(savedState));
            } catch (e) {
                console.error('Error parsing saved bundle booking state:', e);
            }
        }
    }, [bundleId]);

    // Persist to sessionStorage on every state change, but only once the wizard
    // has progressed past the initial empty state (more than just bundleId).
    useEffect(() => {
        if (Object.keys(state).length > 1) {
            sessionStorage.setItem(`bundle_booking_${bundleId}`, JSON.stringify(state));
        }
    }, [state, bundleId]);

    // Fetch the bundle document and its associated sessions on mount.
    useEffect(() => {
        const fetchBundleAndSessions = async () => {
            try {
                // Fetch the bundle document
                const bundleRef = doc(db, 'bundles', bundleId);
                const bundleSnap = await getDoc(bundleRef);

                if (!bundleSnap.exists()) {
                    console.error('Bundle not found:', bundleId);
                    setLoading(false);
                    return;
                }

                const bundle = { id: bundleId, ...bundleSnap.data() } as Bundle;
                setState(prev => ({ ...prev, bundle }));

                // Fetch all sessions by ID from the sessionIds array
                if (bundle.sessionIds && bundle.sessionIds.length > 0) {
                    const sessionPromises = bundle.sessionIds.map(async (sessionId) => {
                        const sessionSnap = await getDoc(doc(db, 'sessions', sessionId));
                        if (sessionSnap.exists()) {
                            return { id: sessionId, ...sessionSnap.data() } as Session;
                        }
                        return null;
                    });

                    const sessions = (await Promise.all(sessionPromises)).filter(
                        (s): s is Session => s !== null
                    );
                    setState(prev => ({ ...prev, sessions }));
                }
            } catch (e) {
                console.error('Error fetching bundle and sessions:', e);
            } finally {
                setLoading(false);
            }
        };

        fetchBundleAndSessions();
    }, [bundleId]);

    // Fetch the class type record matching the bundle's classType slug.
    useEffect(() => {
        if (!state.bundle?.classType) return;

        const fetchClassType = async () => {
            try {
                const snap = await getDocs(collection(db, 'class_types'));
                const types = snap.docs.map(d => ({ id: d.id, ...d.data() } as BTClassType));
                const match = types.find(ct => ct.slug === state.bundle!.classType);
                setClassTypeRecord(match || null);
            } catch (e) {
                console.error('Error fetching class type record:', e);
            }
        };

        fetchClassType();
    }, [state.bundle?.classType]);

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
        setState({ bundleId });
        sessionStorage.removeItem(`bundle_booking_${bundleId}`);
    }, [bundleId]);

    const contextValue = useMemo(() => ({
        state, loading, classTypeRecord, setStudent, setMedicalInfo,
        setEmergencyContact, setQuestionnaire, setTermsAccepted, clearState,
    }), [state, loading, classTypeRecord, setStudent, setMedicalInfo, setEmergencyContact, setQuestionnaire, setTermsAccepted, clearState]);

    return (
        <BundleBookingContext.Provider value={contextValue}>
            {children}
        </BundleBookingContext.Provider>
    );
}

/**
 * Returns the bundle booking wizard context for the current bundle.
 * Must be called inside a component wrapped by BundleBookingProvider.
 */
export function useBundleBooking() {
    const ctx = useContext(BundleBookingContext);
    if (!ctx) throw new Error('useBundleBooking must be used within BundleBookingProvider');
    return ctx;
}
