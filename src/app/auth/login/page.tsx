'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '@/context/AuthContext';
import styles from '../signup/page.module.css';

const schema = z.object({
    email: z.string().email('Enter a valid email address'),
    password: z.string().min(1, 'Password is required'),
});

type FormData = z.infer<typeof schema>;

export default function LoginPage() {
    return (
        <Suspense fallback={<div className="spinner" />}>
            <LoginContent />
        </Suspense>
    );
}

function LoginContent() {
    const { signIn } = useAuth();
    const router = useRouter();
    const searchParams = useSearchParams();
    const redirect = searchParams.get('redirect') || '/portal/dashboard';
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
        resolver: zodResolver(schema),
    });

    const onSubmit = async (data: FormData) => {
        setError('');
        setLoading(true);
        try {
            await signIn(data.email, data.password);
            router.push(redirect);
        } catch (e: any) {
            if (e.code === 'auth/invalid-credential' || e.code === 'auth/wrong-password' || e.code === 'auth/user-not-found') {
                setError('Incorrect email or password. Please try again.');
            } else if (e.code) {
                setError(`Technical error (${e.code}): ${e.message}`);
            } else {
                setError('Something went wrong. Please check your internet connection and try again.');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={styles.page}>
            <h1 className={styles.title}>Welcome back</h1>
            <p className={styles.sub}>Log in to manage your bookings and classes.</p>

            {error && <div className="alert alert-error">{error}</div>}

            <form onSubmit={handleSubmit(onSubmit)} className={styles.form} noValidate>
                <div className="form-group">
                    <label className="form-label" htmlFor="email">Email Address</label>
                    <input id="email" type="email" className={`form-input ${errors.email ? 'error' : ''}`} {...register('email')} placeholder="jane@example.com" autoComplete="email" />
                    {errors.email && <span className="form-error">{errors.email.message}</span>}
                </div>

                <div className="form-group">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <label className="form-label" htmlFor="password">Password</label>
                        <Link href="/auth/forgot-password" className={styles.forgotLink}>Forgot password?</Link>
                    </div>
                    <input id="password" type="password" className={`form-input ${errors.password ? 'error' : ''}`} {...register('password')} placeholder="Your password" autoComplete="current-password" />
                    {errors.password && <span className="form-error">{errors.password.message}</span>}
                </div>

                <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
                    {loading ? 'Logging in...' : 'Log In'}
                </button>
            </form>

            <p className={styles.footer}>
                Don't have an account? <Link href="/auth/signup">Register free</Link>
            </p>
        </div>
    );
}
