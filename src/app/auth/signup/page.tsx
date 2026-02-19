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
    const { signUp } = useAuth();
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
