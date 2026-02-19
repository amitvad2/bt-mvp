'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '@/context/AuthContext';
import styles from '../signup/page.module.css';

const schema = z.object({
    email: z.string().email('Enter a valid email address'),
});

type FormData = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
    const { resetPassword } = useAuth();
    const [sent, setSent] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
        resolver: zodResolver(schema),
    });

    const onSubmit = async (data: FormData) => {
        setError('');
        setLoading(true);
        try {
            await resetPassword(data.email);
            setSent(true);
        } catch (e) {
            setError('Something went wrong. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    if (sent) {
        return (
            <div className={styles.successBox}>
                <span className={styles.successIcon}>📧</span>
                <h2>Check your inbox</h2>
                <p>We've sent a password reset link to your email address. It may take a few minutes to arrive.</p>
                <Link href="/auth/login" className="btn btn-primary">Back to Login</Link>
            </div>
        );
    }

    return (
        <div className={styles.page}>
            <h1 className={styles.title}>Reset your password</h1>
            <p className={styles.sub}>Enter your email and we'll send you a reset link.</p>

            {error && <div className="alert alert-error">{error}</div>}

            <form onSubmit={handleSubmit(onSubmit)} className={styles.form} noValidate>
                <div className="form-group">
                    <label className="form-label" htmlFor="email">Email Address</label>
                    <input id="email" type="email" className={`form-input ${errors.email ? 'error' : ''}`} {...register('email')} placeholder="jane@example.com" autoComplete="email" />
                    {errors.email && <span className="form-error">{errors.email.message}</span>}
                </div>

                <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
                    {loading ? 'Sending...' : 'Send Reset Link'}
                </button>
            </form>

            <p className={styles.footer}>
                Remember your password? <Link href="/auth/login">Log in</Link>
            </p>
        </div>
    );
}
