// @vitest-environment node

/**
 * Unit tests for admin sessions page — className derivation and badge rendering.
 *
 * Tests the pure logic that mirrors the implementation in:
 * - src/app/admin/sessions/page.tsx (handleSubmit className derivation)
 * - src/app/admin/sessions/page.tsx (badge rendering in table row)
 *
 * Requirements: 6.1, 6.2, 10.2
 */

import { describe, it, expect } from 'vitest';

// ─── Extracted Logic (mirrors implementation in src/app/admin/sessions/page.tsx) ───

interface ClassTypeRecord {
  slug: string;
  displayName: string;
  shortLabel: string;
  badgeColor: string;
}

interface BTClassRecord {
  id: string;
  type: string;
  venueId?: string;
  venueName?: string;
  price?: number;
  startTime?: string;
  endTime?: string;
  maxSize?: number;
  ageMin?: number;
  ageMax?: number;
}

/**
 * Derives the className for a session based on the class type lookup.
 * Mirrors the logic in handleSubmit:
 *   const parentClass = classes.find(c => c.id === formData.classId);
 *   const classType = classTypes.find(ct => ct.slug === parentClass?.type);
 *   className: classType?.displayName || parentClass?.type || 'Unknown'
 */
function deriveClassName(
  classTypes: ClassTypeRecord[],
  classes: BTClassRecord[],
  selectedClassId: string
): string {
  const parentClass = classes.find(c => c.id === selectedClassId);
  const classType = classTypes.find(ct => ct.slug === parentClass?.type);
  return classType?.displayName || parentClass?.type || 'Unknown';
}

/**
 * Derives the classType slug for a session.
 * Mirrors: classType: parentClass?.type || ''
 */
function deriveClassType(
  classes: BTClassRecord[],
  selectedClassId: string
): string {
  const parentClass = classes.find(c => c.id === selectedClassId);
  return parentClass?.type || '';
}

/**
 * Resolves badge rendering data for a session in the admin sessions table.
 * Mirrors the table rendering logic:
 *   const ct = classTypes.find(t => t.slug === s.classType);
 *   badge text: ct?.shortLabel || s.classType || 'Unknown'
 *   badge class: `badge badge-${ct?.badgeColor || 'gray'}`
 */
function resolveSessionBadge(
  classTypes: ClassTypeRecord[],
  sessionClassType: string
): { label: string; badgeColorClass: string } {
  const ct = classTypes.find(t => t.slug === sessionClassType);
  return {
    label: ct?.shortLabel || sessionClassType || 'Unknown',
    badgeColorClass: `badge-${ct?.badgeColor || 'gray'}`,
  };
}

// ─── Test Data ───

const SEED_CLASS_TYPES: ClassTypeRecord[] = [
  {
    slug: 'kidsAfterSchool',
    displayName: 'Kids After School Club',
    shortLabel: 'Kids',
    badgeColor: 'amber',
  },
  {
    slug: 'youngAdultWeekend',
    displayName: 'Weekend Workshop',
    shortLabel: 'Young Adult',
    badgeColor: 'green',
  },
];

const MOCK_CLASSES: BTClassRecord[] = [
  {
    id: 'class-1',
    type: 'kidsAfterSchool',
    venueId: 'venue-1',
    venueName: 'Community Hall',
    price: 1500,
    startTime: '15:30',
    endTime: '16:30',
    maxSize: 15,
    ageMin: 5,
    ageMax: 12,
  },
  {
    id: 'class-2',
    type: 'youngAdultWeekend',
    venueId: 'venue-2',
    venueName: 'Kitchen Studio',
    price: 2500,
    startTime: '10:30',
    endTime: '12:30',
    maxSize: 15,
    ageMin: 18,
    ageMax: 25,
  },
  {
    id: 'class-3',
    type: 'summerCamp',
    venueId: 'venue-1',
    venueName: 'Community Hall',
    price: 2000,
    startTime: '10:00',
    endTime: '12:00',
    maxSize: 20,
    ageMin: 8,
    ageMax: 14,
  },
];

// ─── Tests ───

describe('AdminSessions — className derivation (Requirement 6.1, 6.2)', () => {
  it('sets className to displayName from class type lookup when slug matches', () => {
    // Requirement 6.1: className SHALL be set to the displayName of the associated ClassTypeRecord
    const className = deriveClassName(SEED_CLASS_TYPES, MOCK_CLASSES, 'class-1');
    expect(className).toBe('Kids After School Club');
  });

  it('derives className correctly for youngAdultWeekend type', () => {
    const className = deriveClassName(SEED_CLASS_TYPES, MOCK_CLASSES, 'class-2');
    expect(className).toBe('Weekend Workshop');
  });

  it('falls back to the slug when class type is not found in class_types', () => {
    // Requirement 6.2: derives by reading the type field (slug) — fallback to slug itself
    // 'summerCamp' slug does not exist in SEED_CLASS_TYPES
    const className = deriveClassName(SEED_CLASS_TYPES, MOCK_CLASSES, 'class-3');
    expect(className).toBe('summerCamp');
  });

  it('returns "Unknown" when selected class does not exist', () => {
    const className = deriveClassName(SEED_CLASS_TYPES, MOCK_CLASSES, 'nonexistent-class');
    expect(className).toBe('Unknown');
  });

  it('returns "Unknown" when class types array is empty and class has no type', () => {
    const classesWithNoType: BTClassRecord[] = [{ id: 'class-x', type: '' }];
    const className = deriveClassName([], classesWithNoType, 'class-x');
    // parentClass.type is '' (falsy), so falls through to 'Unknown'
    expect(className).toBe('Unknown');
  });

  it('derives classType slug from the parent class type field', () => {
    const classType = deriveClassType(MOCK_CLASSES, 'class-1');
    expect(classType).toBe('kidsAfterSchool');
  });

  it('returns empty string for classType when class is not found', () => {
    const classType = deriveClassType(MOCK_CLASSES, 'nonexistent');
    expect(classType).toBe('');
  });
});

describe('AdminSessions — badge rendering (Requirement 10.2)', () => {
  it('renders badge with shortLabel "Kids" and badge-amber class for kidsAfterSchool', () => {
    // Requirement 10.2: badge elements use shortLabel and badgeColor from ClassTypeRecord
    const badge = resolveSessionBadge(SEED_CLASS_TYPES, 'kidsAfterSchool');
    expect(badge.label).toBe('Kids');
    expect(badge.badgeColorClass).toBe('badge-amber');
  });

  it('renders badge with shortLabel "Young Adult" and badge-green for youngAdultWeekend', () => {
    const badge = resolveSessionBadge(SEED_CLASS_TYPES, 'youngAdultWeekend');
    expect(badge.label).toBe('Young Adult');
    expect(badge.badgeColorClass).toBe('badge-green');
  });

  it('falls back to slug text with badge-gray when class type not found', () => {
    // Requirement 10.3: fallback to slug text with gray badge colour
    const badge = resolveSessionBadge(SEED_CLASS_TYPES, 'summerCamp');
    expect(badge.label).toBe('summerCamp');
    expect(badge.badgeColorClass).toBe('badge-gray');
  });

  it('falls back to "Unknown" label when session classType is empty string', () => {
    const badge = resolveSessionBadge(SEED_CLASS_TYPES, '');
    expect(badge.label).toBe('Unknown');
    expect(badge.badgeColorClass).toBe('badge-gray');
  });

  it('badge color is always a valid badge-* class', () => {
    const validColors = ['badge-amber', 'badge-green', 'badge-indigo', 'badge-red', 'badge-gray'];
    const slugsToTest = ['kidsAfterSchool', 'youngAdultWeekend', 'summerCamp', 'unknown', ''];
    for (const slug of slugsToTest) {
      const badge = resolveSessionBadge(SEED_CLASS_TYPES, slug);
      expect(validColors).toContain(badge.badgeColorClass);
    }
  });
});
