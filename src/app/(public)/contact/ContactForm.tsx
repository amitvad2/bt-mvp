'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import styles from './page.module.css';

const schema = z.object({
    name: z.string().min(2, 'Name is required'),
    email: z.string().email('Enter a valid email address'),
    phone: z.string().optional(),
    category: z.enum(['general', 'class-info', 'booking-help', 'dietary-allergy', 'private-event', 'technical', 'feedback'] as const, {
        message: 'Please select an enquiry type',
    }),
    message: z.string().min(10, 'Please enter at least 10 characters'),
    consentToReply: z.boolean().refine(v => v === true, { message: 'Please consent to being contacted back' }),
});

type FormData = z.infer<typeof schema>;

const CATEGORIES: { value: FormData['category']; label: string }[] = [
    { value: 'general', label: 'General enquiry' },
    { value: 'class-info', label: 'Class information' },
    { value: 'booking-help', label: 'Booking help' },
    { value: 'dietary-allergy', label: 'Dietary / allergy question' },
    { value: 'private-event', label: 'Private event / school enquiry' },
    { value: 'technical', label: 'Technical issue' },
    { value: 'feedback', label: 'Feedback' },
];

export default function ContactForm() {
    const [serverError, setServerError] = useState('');
    const [submitted, setSubmitted] = useState(false);
    const [loading, setLoading] = useState(false);

    const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
        resolver: zodResolver(schema),
    });

    const onSubmit = async (data: FormData) => {
        setServerError('');
        setLoading(true);
        try {
            const res = await fetch('/api/contact', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
            const json = await res.json();
            if (!res.ok) {
                setServerError(json.error || 'Something went wrong. Please try again.');
                return;
            }
            setSubmitted(true);
        } catch {
            setServerError('Could not send your message. Please check your connection and try again.');
        } finally {
            setLoading(false);
        }
    };

    if (submitted) {
        return (
            <div className={styles.success}>
                <div className={styles.successIcon}>✅</div>
                <h2 className={styles.formTitle}>Message sent!</h2>
                <p>Thanks for getting in touch. Your message has been sent and we'll reply within 2 business days.</p>
            </div>
        );
    }

    return (
        <>
            <h2 className={styles.formTitle}>Send a Message</h2>
            <p className={styles.formSub}>Fill in the form below and we'll reply within 2 business days.</p>
            <form onSubmit={handleSubmit(onSubmit)} className={styles.form} noValidate>
            {serverError && <div className="alert alert-error">{serverError}</div>}

            <div className="form-row">
                <div className="form-group">
                    <label className="form-label" htmlFor="name">Full Name <span className="required">*</span></label>
                    <input
                        id="name"
                        className={`form-input ${errors.name ? 'error' : ''}`}
                        {...register('name')}
                        placeholder="Jane Smith"
                    />
                    {errors.name && <span className="form-error">{errors.name.message}</span>}
                </div>
                <div className="form-group">
                    <label className="form-label" htmlFor="phone">Phone <span className={styles.optional}>(optional)</span></label>
                    <input
                        id="phone"
                        className="form-input"
                        {...register('phone')}
                        placeholder="+44 7700 000000"
                        type="tel"
                    />
                </div>
            </div>

            <div className="form-group">
                <label className="form-label" htmlFor="email">Email Address <span className="required">*</span></label>
                <input
                    id="email"
                    type="email"
                    className={`form-input ${errors.email ? 'error' : ''}`}
                    {...register('email')}
                    placeholder="jane@example.com"
                />
                {errors.email && <span className="form-error">{errors.email.message}</span>}
            </div>

            <div className="form-group">
                <label className="form-label" htmlFor="category">Enquiry Type <span className="required">*</span></label>
                <select
                    id="category"
                    className={`form-select ${errors.category ? 'error' : ''}`}
                    {...register('category')}
                    defaultValue=""
                >
                    <option value="" disabled>Select a category…</option>
                    {CATEGORIES.map(c => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                </select>
                {errors.category && <span className="form-error">{errors.category.message}</span>}
            </div>

            <div className="form-group">
                <label className="form-label" htmlFor="message">Message <span className="required">*</span></label>
                <textarea
                    id="message"
                    rows={6}
                    className={`form-input ${errors.message ? 'error' : ''}`}
                    {...register('message')}
                    placeholder="Tell us how we can help…"
                />
                {errors.message && <span className="form-error">{errors.message.message}</span>}
            </div>

            <div className={`form-group ${styles.consentGroup}`}>
                <label className={styles.consentLabel}>
                    <input
                        type="checkbox"
                        className={styles.consentCheckbox}
                        {...register('consentToReply')}
                    />
                    <span>
                        I consent to Blooming Tastebuds storing my details and contacting me about my enquiry. <span className="required">*</span>
                    </span>
                </label>
                {errors.consentToReply && <span className="form-error">{errors.consentToReply.message}</span>}
            </div>

            <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
                {loading ? 'Sending…' : 'Send Message'}
            </button>
        </form>
        </>
    );
}
