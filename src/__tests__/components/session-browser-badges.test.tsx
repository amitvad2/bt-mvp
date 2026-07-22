// @vitest-environment node
import { describe, it, expect } from 'vitest';

/**
 * Extracted pure logic from SessionBrowser.getClassTypeBadge for unit testing.
 * This mirrors the implementation in src/components/sessions/SessionBrowser.tsx.
 */
function getClassTypeBadge(
  classTypes: { slug: string; shortLabel: string; displayName: string; badgeColor: string }[],
  slug: string
): { label: string; displayName: string; color: string } {
  const ct = classTypes.find(t => t.slug === slug);
  if (ct) {
    return { label: ct.shortLabel, displayName: ct.displayName, color: ct.badgeColor };
  }
  return { label: slug, displayName: slug, color: 'gray' };
}

const SEED_CLASS_TYPES = [
  {
    slug: 'kidsAfterSchool',
    shortLabel: 'Kids',
    displayName: 'Kids After School Club',
    badgeColor: 'amber',
  },
  {
    slug: 'youngAdultWeekend',
    shortLabel: 'Young Adult',
    displayName: 'Weekend Workshop',
    badgeColor: 'green',
  },
];

describe('getClassTypeBadge — session browser badge rendering', () => {
  it('returns shortLabel, displayName, and badgeColor for known slug "kidsAfterSchool"', () => {
    const result = getClassTypeBadge(SEED_CLASS_TYPES, 'kidsAfterSchool');
    expect(result).toEqual({
      label: 'Kids',
      displayName: 'Kids After School Club',
      color: 'amber',
    });
  });

  it('returns shortLabel, displayName, and badgeColor for known slug "youngAdultWeekend"', () => {
    const result = getClassTypeBadge(SEED_CLASS_TYPES, 'youngAdultWeekend');
    expect(result).toEqual({
      label: 'Young Adult',
      displayName: 'Weekend Workshop',
      color: 'green',
    });
  });

  it('returns fallback with slug as label/displayName and gray color for unknown slug', () => {
    const result = getClassTypeBadge(SEED_CLASS_TYPES, 'somethingNew');
    expect(result).toEqual({
      label: 'somethingNew',
      displayName: 'somethingNew',
      color: 'gray',
    });
  });

  it('returns gray fallback when class types array is empty', () => {
    const result = getClassTypeBadge([], 'kidsAfterSchool');
    expect(result).toEqual({
      label: 'kidsAfterSchool',
      displayName: 'kidsAfterSchool',
      color: 'gray',
    });
  });

  it('badge label is never empty — fallback slug is used when type not found', () => {
    const slugs = ['kidsAfterSchool', 'youngAdultWeekend', 'somethingNew', 'another-type'];
    for (const slug of slugs) {
      const result = getClassTypeBadge(SEED_CLASS_TYPES, slug);
      expect(result.label).toBeTruthy();
      expect(result.label.length).toBeGreaterThan(0);
    }
  });
});
