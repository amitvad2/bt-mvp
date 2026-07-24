'use client';

import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { useBundleBooking } from '@/context/BundleBookingContext';
import { MedicalInfo, EmergencyContact } from '@/types';
import { ShieldAlert, Phone } from 'lucide-react';
import styles from './page.module.css';

type FormData = MedicalInfo & { emergencyContact?: EmergencyContact };

export default function BundleMedicalPage() {
    const router = useRouter();
    const { state, classTypeRecord, setMedicalInfo, setEmergencyContact } = useBundleBooking();
    const showEmergencyContact = classTypeRecord?.requireEmergencyContact ?? false;

    // Pre-fill from selected student's stored data if available
    const initialMedicalInfo = state.medicalInfo || (state.student !== 'self' && state.student ? state.student.medicalInfo : undefined);
    const initialEmergencyContact = state.emergencyContact || (state.student !== 'self' && state.student ? state.student.emergencyContact : undefined);

    const { register, handleSubmit } = useForm<FormData>({
        defaultValues: {
            ...initialMedicalInfo,
            emergencyContact: initialEmergencyContact || { name: '', relationship: '', email: '', phone: '' }
        }
    });

    const skipQuestionnaire = classTypeRecord?.skipQuestionnaire ?? false;

    const onSubmit = (data: FormData) => {
        const { emergencyContact, ...medicalInfo } = data;
        setMedicalInfo(medicalInfo);
        if (showEmergencyContact && emergencyContact) {
            setEmergencyContact(emergencyContact);
        }

        // Navigate based on skipQuestionnaire flag
        if (!skipQuestionnaire) {
            router.push(`/book/bundle/${state.bundleId}/questionnaire`);
        } else {
            router.push(`/book/bundle/${state.bundleId}/terms`);
        }
    };

    const medicalFields = [
        { name: 'allergies', label: 'Allergies?' },
        { name: 'conditions', label: 'Medical Conditions?' },
        { name: 'recentOperations', label: 'Recent Operations?' },
        { name: 'visionImpairment', label: 'Vision Impairment?' },
        { name: 'hearingImpairment', label: 'Hearing Impairment?' },
        { name: 'glassesRequired', label: 'Glasses Required?' },
        { name: 'respiratoryProblems', label: 'Respiratory Problems?' },
    ];

    return (
        <div className={styles.container}>
            <div className={styles.sectionHeader}>
                <ShieldAlert className={styles.icon} size={24} strokeWidth={1.5} />
                <div>
                    <h2>Medical Information</h2>
                    <p>Please provide accurate details for the student&apos;s safety.</p>
                </div>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className={styles.form}>
                <div className={styles.medicalGrid}>
                    {medicalFields.map(f => (
                        <label key={f.name} className={styles.checkboxLabel}>
                            <span>{f.label}</span>
                            <input type="checkbox" {...register(f.name as keyof MedicalInfo)} />
                        </label>
                    ))}
                </div>

                <div className="form-group">
                    <label className="form-label">Other Medical Notes</label>
                    <textarea
                        className="form-input"
                        rows={3}
                        {...register('otherMedicalNotes')}
                        placeholder="List any other details or enter 'None'."
                        required
                    />
                </div>

                <div className="form-group">
                    <label className="form-label">Additional Support Requirements</label>
                    <textarea
                        className="form-input"
                        rows={3}
                        {...register('additionalSupportNeeds')}
                        placeholder="Details on extra support or enter 'None'."
                        required
                    />
                </div>

                {showEmergencyContact && (
                    <div className={styles.emergencySection}>
                        <div className={styles.sectionHeader}>
                            <Phone className={styles.icon} size={24} strokeWidth={1.5} />
                            <div>
                                <h3>Emergency Contact</h3>
                                <p>Who should we contact if needed?</p>
                            </div>
                        </div>

                        <div className="form-row">
                            <div className="form-group">
                                <label className="form-label">Contact Name</label>
                                <input className="form-input" required {...register('emergencyContact.name')} placeholder="Full name" />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Relationship</label>
                                <input className="form-input" required {...register('emergencyContact.relationship')} placeholder="e.g. Parent" />
                            </div>
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label className="form-label">Email Address</label>
                                <input type="email" className="form-input" required {...register('emergencyContact.email')} placeholder="email@example.com" />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Phone Number</label>
                                <input type="tel" className="form-input" required {...register('emergencyContact.phone')} placeholder="Phone number" />
                            </div>
                        </div>
                    </div>
                )}

                <div className={styles.actions}>
                    <button type="button" className="btn btn-ghost" onClick={() => router.back()}>Back</button>
                    <button type="submit" className="btn btn-primary">Continue</button>
                </div>
            </form>
        </div>
    );
}
