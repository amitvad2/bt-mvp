import { z } from 'zod';
import { validateTermDates } from '@/lib/term-schedule-utils';

/**
 * Zod schema for the admin term session creation form.
 * Uses .superRefine() for cross-field validation:
 *  - endDate must be after startDate
 *  - dayOfWeek must occur at least once in the date range
 */

const DAYS_OF_WEEK = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

export const termSessionSchema = z
  .object({
    sessionType: z.literal('term'),
    termStartDate: z.string().min(1, 'Term start date is required'),
    termEndDate: z.string().min(1, 'Term end date is required'),
    dayOfWeek: z.enum(DAYS_OF_WEEK, {
      message: 'Please select a day of week',
    }),
    spotsTotal: z.number().int().min(1, 'Spots must be at least 1'),
    price: z.number().int().min(1, 'Price must be at least 1 pence'),
    classId: z.string().min(1, 'Please select a class'),
    venueId: z.string().min(1, 'Please select a venue'),
    instructorId: z.string().min(1, 'Please select an instructor'),
    startTime: z.string().min(1, 'Start time is required'),
    endTime: z.string().min(1, 'End time is required'),
    ageMin: z.number().int().min(0, 'Min age must be 0 or greater'),
    ageMax: z.number().int().min(1, 'Max age must be at least 1'),
  })
  .superRefine((data, ctx) => {
    // ageMax must be greater than ageMin
    if (data.ageMax <= data.ageMin) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Max age must be greater than min age',
        path: ['ageMax'],
      });
    }

    // Cross-field date and dayOfWeek validation using validateTermDates
    if (data.termStartDate && data.termEndDate && data.dayOfWeek) {
      const result = validateTermDates(
        data.termStartDate,
        data.termEndDate,
        data.dayOfWeek
      );

      if (!result.valid) {
        // Determine which field to attach the error to
        if (result.error?.includes('End date must be after')) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: result.error,
            path: ['termEndDate'],
          });
        } else if (result.error?.includes('No occurrences')) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: result.error,
            path: ['dayOfWeek'],
          });
        } else {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: result.error || 'Invalid term dates',
            path: ['termEndDate'],
          });
        }
      }
    }
  });

export type TermSessionFormData = z.infer<typeof termSessionSchema>;
