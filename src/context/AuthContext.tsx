'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import {
    User,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
    sendPasswordResetEmail,
    onAuthStateChanged,
    GoogleAuthProvider, // Added
    signInWithPopup,    // Added
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { BTUser, UserRole } from '@/types';

interface AuthContextType {
    user: User | null;
    btUser: BTUser | null; // Kept from original
    loading: boolean; // Kept from original
    signUp: (email: string, pass: string, firstName: string, lastName: string, role: UserRole) => Promise<void>; // Changed password to pass
    signIn: (email: string, pass: string) => Promise<void>; // Changed password to pass
    signInWithGoogle: (role: UserRole) => Promise<void>; // Added
    logOut: () => Promise<void>;
    resetPassword: (email: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [btUser, setBtUser] = useState<BTUser | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            setUser(firebaseUser);
            if (firebaseUser) {
                // Set session cookie for middleware
                document.cookie = `session=true; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax; Secure`;
                try {
                    const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
                    if (userDoc.exists()) {
                        setBtUser({ uid: firebaseUser.uid, ...userDoc.data() } as BTUser);
                    } else {
                        // This case might happen if a user signs up via Google but the doc creation failed or was delayed.
                        // For now, we'll just log it. A more robust solution might re-create or prompt.
                        console.warn("User document not found for authenticated user:", firebaseUser.uid);
                        setBtUser(null); // Or handle as an incomplete profile
                    }
                } catch (e) {
                    console.error('Error fetching user doc:', e);
                    setBtUser(null);
                }
            } else {
                setBtUser(null);
                // Clear session cookie
                document.cookie = 'session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
            }
            setLoading(false);
        });
        return unsubscribe;
    }, []);

    const signUp = async (email: string, pass: string, firstName: string, lastName: string, role: UserRole) => {
        try {
            const { user: firebaseUser } = await createUserWithEmailAndPassword(auth, email, pass);

            const newUser: BTUser = {
                uid: firebaseUser.uid,
                email,
                firstName,
                lastName,
                role,
                createdAt: serverTimestamp(),
            };

            await setDoc(doc(db, 'users', firebaseUser.uid), newUser);

            // Explicitly set cookie here too to be safe before redirect
            document.cookie = `session=true; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax; Secure`;
            setBtUser(newUser);
        } catch (error: any) {
            throw error;
        }
    };

    const signInWithGoogle = async (role: UserRole) => {
        try {
            const provider = new GoogleAuthProvider();
            const { user: firebaseUser } = await signInWithPopup(auth, provider);

            // Set session cookie
            document.cookie = `session=true; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax; Secure`;

            // Check if user document exists
            const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));

            if (!userDoc.exists()) {
                const firstName = firebaseUser.displayName?.split(' ')[0] || '';
                const lastName = firebaseUser.displayName?.split(' ').slice(1).join(' ') || '';

                const newUser: BTUser = {
                    uid: firebaseUser.uid,
                    email: firebaseUser.email || '',
                    firstName,
                    lastName,
                    role,
                    createdAt: serverTimestamp(),
                };
                await setDoc(doc(db, 'users', firebaseUser.uid), newUser);
                setBtUser(newUser);
            } else {
                setBtUser({ uid: firebaseUser.uid, ...userDoc.data() } as BTUser);
            }
        } catch (error: any) {
            throw error;
        }
    };

    const signIn = async (email: string, password: string) => {
        try {
            await signInWithEmailAndPassword(auth, email, password);
            // Set session cookie for middleware
            document.cookie = `session=true; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax; Secure`;
        } catch (error: any) {
            throw error;
        }
    };

    const logOut = async () => {
        await signOut(auth);
        setBtUser(null);
        // Clear session cookie
        document.cookie = 'session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    };

    const resetPassword = async (email: string) => {
        await sendPasswordResetEmail(auth, email);
    };

    return (
        <AuthContext.Provider value={{ user, btUser, loading, signUp, signIn, signInWithGoogle, logOut, resetPassword }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within AuthProvider');
    return ctx;
}
