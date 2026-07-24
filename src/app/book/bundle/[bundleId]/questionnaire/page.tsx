'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useBundleBooking } from '@/context/BundleBookingContext';
import { Questionnaire } from '@/types';
import { ClipboardList } from 'lucide-react';
import styles from './page.module.css';

export default function BundleQuestionnairePage() {
    const router = useRouter();
    const { state, classTypeRecord, setQuestionnaire } = useBundleBooking();

    // Skip questionnaire automatically for youngAdultWeekend classType bundles
    useEffect(() => {
        if (classTypeRecord?.skipQuestionnaire === true) {
            router.replace(`/book/bundle/${state.bundleId}/terms`);
        }
    }, [classTypeRecord, router, state.bundleId]);

    const initialQuestionnaire = state.questionnaire || (state.student !== 'self' ? state.student?.questionnaire : undefined);

    const { register, handleSubmit } = useForm<Questionnaire>({
        defaultValues: initialQuestionnaire || {
            dietaryRequirements: '',
            airborneAllergy: '',
            reactionDetails: '',
            symptoms: '',
            epipenInfo: '',
            sameTableOk: '',
            mayContainOk: '',
        }
    });

    const onSubmit = (data: Questionnaire) => {
        setQuestionnaire(data);
        router.push(`/book/bundle/${state.bundleId}/terms`);
    };

    const questions = [
        { name: 'dietaryRequirements', label: '1. Dietary requirements (e.g. Vegetarian, Gluten Free, No Pork, etc.)' },
        { name: 'airborneAllergy', label: '2. Do they have an airborne allergy? If yes, please specify.' },
        { name: 'reactionDetails', label: '3. Do they have a reaction on skin contact or ingestion? Please describe.' },
        { name: 'symptoms', label: '4. What symptoms should we look out for?' },
        { name: 'epipenInfo', label: '5. Is an Epipen carried? If yes, where is it kept?' },
        { name: 'sameTableOk', label: '6. Is it OK for the student to work at the same table as others using allergenic ingredients?' },
        { name: 'mayContainOk', label: '7. Can the student use ingredients marked "May contain traces of..."?' },
    ];

    // Don't render the form if we're about to redirect
    if (classTypeRecord?.skipQuestionnaire === true) {
        return null;
    }

    return (
        <div className={styles.container}>
            <div className={styles.sectionHeader}>
                <ClipboardList className={styles.icon} size={24} strokeWidth={1.5} />
                <div>
                    <h2>Student Questionnaire</h2>
                    <p>Details to help us ensure a safe and inclusive experience.</p>
                </div>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className={styles.form}>
                {questions.map(q => (
                    <div key={q.name} className="form-group">
                        <label className="form-label">{q.label}</label>
                        <textarea
                            className="form-input"
                            rows={2}
                            maxLength={250}
                            {...register(q.name as keyof Questionnaire)}
                            required
                            placeholder="Type your answer..."
                        />
                    </div>
                ))}

                <div className={styles.actions}>
                    <button type="button" className="btn btn-ghost" onClick={() => router.back()}>Back</button>
                    <button type="submit" className="btn btn-primary">Continue</button>
                </div>
            </form>
        </div>
    );
}
