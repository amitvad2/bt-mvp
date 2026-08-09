import { z } from 'zod';

/**
 * Zod schema for the admin class creation/edit form.
 * Uses .superRefine() for cross-field validation when commitment === 'term'.
 */

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

export type DayOfWeek = (typeof DAYS_OF_WEEK)[number];

export const classFormSchema = z.object({
    name: z.string().min(1, 'Class name is required'),
    description: z.string().optional(),
    type: z.string().min(1, 'Please select a class type'),
    dayOfWeek: z.string().min(1, 'Please select a day'),
    startTime: z.string().min(1, 'Start time is required'),
    endTime: z.string().min(1, 'End time is required'),
    ageMin: z.number().int().min(0, 'Min age must be 0 or greater'),
    ageMax: z.number().int().min(1, 'Max age must be at least 1'),
    maxSize: z.number().int().min(1, 'Max size must be at least 1'),
    instructor: z.string(),
    venueId: z.string().min(1, 'Please select a venue'),
    price: z.number().int().min(0, 'Price must be 0 or greater'),
    commitment: z.enum(['perSession', 'term']),
    // Term-specific fields (optional — validated via superRefine when commitment === 'term')
    termStartDate: z.string().optional(),
    termEndDate: z.string().optional(),
    termPrice: z.number().int().optional(),
    recurrenceDays: z.array(z.string()).optional(),
}).superRefine((data, ctx) => {
    if (data.commitment === 'term') {
        // termStartDate is required
        if (!data.termStartDate) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'Term start date is required',
                path: ['termStartDate'],
            });
        }

        // termEndDate is required
        if (!data.termEndDate) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'Term end date is required',
                path: ['termEndDate'],
            });
        }

        // termEndDate must be after termStartDate
        if (data.termStartDate && data.termEndDate && data.termEndDate <= data.termStartDate) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'Term end date must be after start date',
                path: ['termEndDate'],
            });
        }

        // termPrice must be > 0
        if (data.termPrice === undefined || data.termPrice === null || data.termPrice <= 0) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'Term price must be greater than 0',
                path: ['termPrice'],
            });
        }

        // recurrenceDays is optional — leave blank for consecutive-day or explicit-date programmes
    }
});

export type ClassFormData = z.infer<typeof classFormSchema>;

export { DAYS_OF_WEEK };
