'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import {
    User,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
    sendPasswordResetEmail,
    onAuthStateChanged,
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { BTUser, UserRole } from '@/types';

interface AuthContextType {
    user: User | null;
    btUser: BTUser | null;
    loading: boolean;
    signUp: (email: string, password: string, firstName: string, lastName: string, role: UserRole) => Promise<void>;
    signIn: (email: string, password: string) => Promise<void>;
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
                document.cookie = `session=true; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`;
                try {
                    const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
                    if (userDoc.exists()) {
                        setBtUser({ uid: firebaseUser.uid, ...userDoc.data() } as BTUser);
                    }
                } catch (e) {
                    console.error('Error fetching user doc:', e);
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

    const signUp = async (
        email: string,
        password: string,
        firstName: string,
        lastName: string,
        role: UserRole
    ) => {
        try {
            const cred = await createUserWithEmailAndPassword(auth, email, password);

            const userData: Omit<BTUser, 'uid'> = {
                role,
                firstName,
                lastName,
                email,
                createdAt: new Date(),
            };

            // We set a small timeout hint in logs, though Firestore handles its own retries
            await setDoc(doc(db, 'users', cred.user.uid), {
                ...userData,
                createdAt: serverTimestamp(),
            });

            // Explicitly set cookie here too to be safe before redirect
            document.cookie = `session=true; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`;
            setBtUser({ uid: cred.user.uid, ...userData });
        } catch (error: any) {
            throw error;
        }
    };

    const signIn = async (email: string, password: string) => {
        try {
            await signInWithEmailAndPassword(auth, email, password);
            // Set session cookie for middleware
            document.cookie = `session=true; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`;
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
        <AuthContext.Provider value={{ user, btUser, loading, signUp, signIn, logOut, resetPassword }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within AuthProvider');
    return ctx;
}
