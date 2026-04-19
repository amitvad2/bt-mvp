'use client';

/**
 * AuthContext — dual-layer authentication state.
 *
 * `user`   — the raw Firebase Auth user (always up-to-date, set by onAuthStateChanged).
 * `btUser` — the app-level profile from Firestore `users/{uid}` (contains role, name, etc.).
 *
 * Both must be non-null for the app to treat someone as fully signed in.
 * `btUser` is null briefly after sign-in while the Firestore fetch completes,
 * which is why auth-gated layouts check `loading` before rendering children.
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import {
    User,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
    sendPasswordResetEmail,
    onAuthStateChanged,
    GoogleAuthProvider,
    signInWithPopup,
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { BTUser, UserRole } from '@/types';

interface AuthContextType {
    user: User | null;
    btUser: BTUser | null;
    loading: boolean;
    signUp: (email: string, pass: string, firstName: string, lastName: string, role: UserRole) => Promise<void>;
    signIn: (email: string, pass: string) => Promise<void>;
    signInWithGoogle: (role: UserRole) => Promise<void>;
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
                // bt_session is a plain boolean cookie read by Edge middleware as a
                // lightweight UX gate. It is NOT a verified security token — Firestore
                // security rules are the actual access control layer.
                document.cookie = `bt_session=true; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax; Secure`;
                try {
                    const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
                    if (userDoc.exists()) {
                        setBtUser({ uid: firebaseUser.uid, ...userDoc.data() } as BTUser);
                    } else {
                        // Can occur if the users/{uid} write failed during sign-up
                        // (e.g. network error after Firebase Auth succeeded).
                        // The user is authenticated but has no app profile — treated
                        // as incomplete until they sign up again or the doc is created.
                        console.warn('User document not found for authenticated user:', firebaseUser.uid);
                        setBtUser(null);
                    }
                } catch (e) {
                    console.error('Error fetching user doc:', e);
                    setBtUser(null);
                }
            } else {
                setBtUser(null);
                document.cookie = 'bt_session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax; Secure';
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

            // Set the cookie eagerly here rather than waiting for onAuthStateChanged to
            // fire asynchronously — a redirect immediately after signUp must see a valid
            // session cookie so middleware does not bounce the request back to /auth/login.
            document.cookie = `bt_session=true; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax; Secure`;
            setBtUser(newUser);
        } catch (error: any) {
            throw error;
        }
    };

    const signInWithGoogle = async (role: UserRole) => {
        try {
            const provider = new GoogleAuthProvider();
            const { user: firebaseUser } = await signInWithPopup(auth, provider);

            // Same eager-cookie rationale as signUp above.
            document.cookie = `bt_session=true; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax; Secure`;

            const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));

            if (!userDoc.exists()) {
                // First-time Google sign-in — create the Firestore profile.
                // Role is passed in from the sign-up page so the user can choose
                // parent vs young-adult before authenticating with Google.
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
                // Returning Google user — role is already stored; ignore the passed-in value.
                setBtUser({ uid: firebaseUser.uid, ...userDoc.data() } as BTUser);
            }
        } catch (error: any) {
            throw error;
        }
    };

    const signIn = async (email: string, password: string) => {
        try {
            await signInWithEmailAndPassword(auth, email, password);
            // Eager cookie — same rationale as signUp.
            document.cookie = `bt_session=true; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax; Secure`;
        } catch (error: any) {
            throw error;
        }
    };

    const logOut = async () => {
        await signOut(auth);
        setBtUser(null);
        document.cookie = 'bt_session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax; Secure';
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

/**
 * Returns the current auth context.
 * Must be called inside a component wrapped by AuthProvider.
 */
export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within AuthProvider');
    return ctx;
}
