'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '@/context/AuthContext';
import { UserRole } from '@/types';
import styles from './page.module.css';

const schema = z.object({
    firstName: z.string().min(2, 'First name is required'),
    lastName: z.string().min(2, 'Last name is required'),
    email: z.string().email('Enter a valid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string(),
    role: z.enum(['parent', 'youngAdult'] as const),
}).refine(d => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
});

type FormData = z.infer<typeof schema>;

export default function SignUpPage() {
    const { signUp, signInWithGoogle } = useAuth();
    const router = useRouter();
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const { register, handleSubmit, watch, formState: { errors } } = useForm<FormData>({
        resolver: zodResolver(schema),
        defaultValues: { role: 'parent' },
    });

    const selectedRole = watch('role');

    const onSubmit = async (data: FormData) => {
        setError('');
        setLoading(true);
        try {
            await signUp(data.email, data.password, data.firstName, data.lastName, data.role as UserRole);
            router.push('/portal/dashboard');
        } catch (e: any) {
            if (e.code === 'auth/email-already-in-use') {
                setError('An account with this email already exists. Please log in.');
            } else if (e.code) {
                setError(`Technical error (${e.code}): ${e.message}`);
            } else {
                setError('Something went wrong. Please check your internet connection and try again.');
            }
        } finally {
            setLoading(false);
        }
    };

    const handleGoogleSignUp = async () => {
        setError('');
        setLoading(true);
        try {
            await signInWithGoogle(selectedRole as UserRole);
            router.push('/portal/dashboard');
        } catch (e: any) {
            console.error('Google Sign-up Error:', e);
            setError('Failed to sign up with Google. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={styles.page}>
            <h1 className={styles.title}>Create your account</h1>
            <p className={styles.sub}>Join Blooming Tastebuds and start booking sessions today.</p>

            {error && <div className="alert alert-error">{error}</div>}

            <form onSubmit={handleSubmit(onSubmit)} className={styles.form} noValidate>
                {/* Role Selector */}
                <div className="form-group">
                    <label className="form-label">I am a <span className="required">*</span></label>
                    <div className={styles.roleGrid}>
                        <label className={`${styles.roleOption} ${selectedRole === 'parent' ? styles.roleSelected : ''}`}>
                            <input type="radio" value="parent" {...register('role')} />
                            <span className={styles.roleEmoji}>👨‍👩‍👧</span>
                            <strong>Parent / Guardian</strong>
                            <span>Booking for my child (ages 5–12)</span>
                        </label>
                        <label className={`${styles.roleOption} ${selectedRole === 'youngAdult' ? styles.roleSelected : ''}`}>
                            <input type="radio" value="youngAdult" {...register('role')} />
                            <span className={styles.roleEmoji}>🎓</span>
                            <strong>Young Adult</strong>
                            <span>Booking for myself (university age)</span>
                        </label>
                    </div>
                </div>

                <div className="form-row">
                    <div className="form-group">
                        <label className="form-label" htmlFor="firstName">First Name <span className="required">*</span></label>
                        <input id="firstName" className={`form-input ${errors.firstName ? 'error' : ''}`} {...register('firstName')} placeholder="Jane" />
                        {errors.firstName && <span className="form-error">{errors.firstName.message}</span>}
                    </div>
                    <div className="form-group">
                        <label className="form-label" htmlFor="lastName">Last Name <span className="required">*</span></label>
                        <input id="lastName" className={`form-input ${errors.lastName ? 'error' : ''}`} {...register('lastName')} placeholder="Smith" />
                        {errors.lastName && <span className="form-error">{errors.lastName.message}</span>}
                    </div>
                </div>

                <div className="form-group">
                    <label className="form-label" htmlFor="email">Email Address <span className="required">*</span></label>
                    <input id="email" type="email" className={`form-input ${errors.email ? 'error' : ''}`} {...register('email')} placeholder="jane@example.com" />
                    {errors.email && <span className="form-error">{errors.email.message}</span>}
                </div>

                <div className="form-group">
                    <label className="form-label" htmlFor="password">Password <span className="required">*</span></label>
                    <input id="password" type="password" className={`form-input ${errors.password ? 'error' : ''}`} {...register('password')} placeholder="At least 8 characters" />
                    {errors.password && <span className="form-error">{errors.password.message}</span>}
                </div>

                <div className="form-group">
                    <label className="form-label" htmlFor="confirmPassword">Confirm Password <span className="required">*</span></label>
                    <input id="confirmPassword" type="password" className={`form-input ${errors.confirmPassword ? 'error' : ''}`} {...register('confirmPassword')} placeholder="Repeat your password" />
                    {errors.confirmPassword && <span className="form-error">{errors.confirmPassword.message}</span>}
                </div>

                <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
                    {loading ? 'Creating account...' : 'Create Account'}
                </button>

                <div className={styles.divider}>or</div>

                <button
                    type="button"
                    className={styles.socialBtn}
                    onClick={handleGoogleSignUp}
                    disabled={loading}
                >
                    <svg viewBox="0 0 24 24" className={styles.googleIcon}>
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                    </svg>
                    Continue with Google
                </button>
            </form>

            <p className={styles.footer}>
                Already have an account? <Link href="/auth/login">Log in</Link>
            </p>
            <p className={styles.terms}>
                By registering, you agree to our <Link href="/terms">Terms & Conditions</Link>.
            </p>
        </div>
    );
}
