'use client';

import { UseFormRegister, FieldErrors, UseFormSetValue, UseFormWatch } from 'react-hook-form';
import { ClassFormData, DAYS_OF_WEEK } from './schema';
import styles from './page.module.css';

interface TermFieldsProps {
    register: UseFormRegister<ClassFormData>;
    errors: FieldErrors<ClassFormData>;
    setValue: UseFormSetValue<ClassFormData>;
    watch: UseFormWatch<ClassFormData>;
}

export default function TermFields({ register, errors, setValue, watch }: TermFieldsProps) {
    const recurrenceDays = watch('recurrenceDays') || [];

    const handleDayToggle = (day: string) => {
        const current = recurrenceDays;
        if (current.includes(day)) {
            setValue('recurrenceDays', current.filter(d => d !== day), { shouldValidate: true });
        } else {
            setValue('recurrenceDays', [...current, day], { shouldValidate: true });
        }
    };

    return (
        <div className={styles.termFields}>
            <div className="form-row">
                <div className="form-group">
                    <label className="form-label">Term Start Date</label>
                    <input
                        type="date"
                        className="form-input"
                        {...register('termStartDate')}
                    />
                    {errors.termStartDate && (
                        <p className="form-error">{errors.termStartDate.message}</p>
                    )}
                </div>
                <div className="form-group">
                    <label className="form-label">Term End Date</label>
                    <input
                        type="date"
                        className="form-input"
                        {...register('termEndDate')}
                    />
                    {errors.termEndDate && (
                        <p className="form-error">{errors.termEndDate.message}</p>
                    )}
                </div>
            </div>

            <div className="form-row">
                <div className="form-group">
                    <label className="form-label">Package Price — Full Programme (Pence)</label>
                    <input
                        type="number"
                        className="form-input"
                        {...register('termPrice', { valueAsNumber: true })}
                        placeholder="e.g. 12000 for £120.00"
                    />
                    {errors.termPrice && (
                        <p className="form-error">{errors.termPrice.message}</p>
                    )}
                </div>
            </div>

            <div className="form-group">
                <label className="form-label">Recurrence Days (Optional)</label>
                <div className={styles.daysGrid}>
                    {DAYS_OF_WEEK.map(day => (
                        <label key={day} className={styles.dayCheckbox}>
                            <input
                                type="checkbox"
                                checked={recurrenceDays.includes(day)}
                                onChange={() => handleDayToggle(day)}
                            />
                            <span>{day}</span>
                        </label>
                    ))}
                </div>
                <p className={styles.helperText}>
                    Optional — leave blank for consecutive-day or explicit-date programmes
                </p>
                {errors.recurrenceDays && (
                    <p className="form-error">{errors.recurrenceDays.message}</p>
                )}
            </div>
        </div>
    );
}
