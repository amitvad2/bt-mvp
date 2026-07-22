import { z } from 'zod';

export const BADGE_COLORS = ['amber', 'green', 'indigo', 'red', 'gray'] as const;

export const classTypeSchema = z.object({
  slug: z.string()
    .min(1, 'Slug is required')
    .regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens'),
  displayName: z.string().min(1, 'Display name is required'),
  shortLabel: z.string().min(1, 'Short label is required').max(20, 'Short label max 20 chars'),
  badgeColor: z.enum(BADGE_COLORS),
  skipQuestionnaire: z.boolean(),
  requireEmergencyContact: z.boolean(),
  defaultAgeMin: z.number().int().min(0),
  defaultAgeMax: z.number().int().min(1),
  defaultMaxSize: z.number().int().min(1),
  defaultPrice: z.number().int().min(0, 'Price must be a non-negative integer (pence)'),
  order: z.number().int().min(0),
});

export type ClassTypeFormData = z.infer<typeof classTypeSchema>;
