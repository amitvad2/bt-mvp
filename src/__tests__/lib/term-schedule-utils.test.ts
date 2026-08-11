import { describe, it, expect } from 'vitest';
import {
  generateSchedule,
  validateTermDates,
  getActiveSessionCount,
  insertDate,
  getNextUpcoming,
  getDisplaySchedule,
} from '@/lib/term-schedule-utils';
import type { ScheduleEntry } from '@/types';

describe('generateSchedule', () => {
  it('generates correct entries for a Monday term', () => {
    const schedule = generateSchedule('2025-09-01', '2025-09-29', 'Monday');
    expect(schedule).toHaveLength(5); // Sep 1, 8, 15, 22, 29
    expect(schedule[0].date).toBe('2025-09-01');
    expect(schedule[4].date).toBe('2025-09-29');
    schedule.forEach((entry) => {
      expect(entry.recipeId).toBe('');
      expect(entry.recipeName).toBe('');
      expect(entry.recipePhotoUrl).toBe('');
      expect(entry.status).toBe('active');
    });
  });

  it('generates entries starting from the first occurrence when startDate is not the target day', () => {
    // 2025-09-03 is a Wednesday; first Friday is 2025-09-05
    const schedule = generateSchedule('2025-09-03', '2025-09-19', 'Friday');
    expect(schedule).toHaveLength(3); // Sep 5, 12, 19
    expect(schedule[0].date).toBe('2025-09-05');
    expect(schedule[2].date).toBe('2025-09-19');
  });

  it('returns empty array when day does not occur in range', () => {
    // Only 1 day range: 2025-09-01 (Monday). Sunday doesn't fit.
    const schedule = generateSchedule('2025-09-01', '2025-09-01', 'Sunday');
    expect(schedule).toHaveLength(0);
  });

  it('returns empty array for invalid day of week', () => {
    const schedule = generateSchedule('2025-09-01', '2025-09-30', 'Funday');
    expect(schedule).toHaveLength(0);
  });

  it('includes endDate if it falls on the target day', () => {
    // 2025-09-07 is a Sunday
    const schedule = generateSchedule('2025-09-01', '2025-09-07', 'Sunday');
    expect(schedule).toHaveLength(1);
    expect(schedule[0].date).toBe('2025-09-07');
  });

  it('all generated dates fall on the specified day of week', () => {
    const schedule = generateSchedule('2025-01-01', '2025-03-31', 'Wednesday');
    schedule.forEach((entry) => {
      const date = new Date(entry.date + 'T00:00:00');
      expect(date.getDay()).toBe(3); // Wednesday = 3
    });
  });
});

describe('validateTermDates', () => {
  it('returns valid for a good date range with occurrences', () => {
    const result = validateTermDates('2025-09-01', '2025-12-15', 'Monday');
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('returns error when endDate equals startDate', () => {
    const result = validateTermDates('2025-09-01', '2025-09-01', 'Monday');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('End date must be after start date');
  });

  it('returns error when endDate is before startDate', () => {
    const result = validateTermDates('2025-12-01', '2025-09-01', 'Monday');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('End date must be after start date');
  });

  it('returns error for invalid day of week', () => {
    const result = validateTermDates('2025-09-01', '2025-09-30', 'Notaday');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Invalid day of week: Notaday');
  });

  it('returns error when day does not occur in range', () => {
    // 2025-09-01 is Monday, 2025-09-02 is Tuesday — Sunday doesn't fit
    const result = validateTermDates('2025-09-01', '2025-09-02', 'Sunday');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('No occurrences of Sunday');
  });
});

describe('getActiveSessionCount', () => {
  it('counts only active entries', () => {
    const schedule: ScheduleEntry[] = [
      { date: '2025-09-01', recipeId: '', recipeName: '', recipePhotoUrl: '', status: 'active' },
      { date: '2025-09-08', recipeId: '', recipeName: '', recipePhotoUrl: '', status: 'skipped' },
      { date: '2025-09-15', recipeId: '', recipeName: '', recipePhotoUrl: '', status: 'active' },
    ];
    expect(getActiveSessionCount(schedule)).toBe(2);
  });

  it('returns 0 for empty schedule', () => {
    expect(getActiveSessionCount([])).toBe(0);
  });

  it('returns 0 when all entries are skipped', () => {
    const schedule: ScheduleEntry[] = [
      { date: '2025-09-01', recipeId: '', recipeName: '', recipePhotoUrl: '', status: 'skipped' },
      { date: '2025-09-08', recipeId: '', recipeName: '', recipePhotoUrl: '', status: 'skipped' },
    ];
    expect(getActiveSessionCount(schedule)).toBe(0);
  });
});

describe('insertDate', () => {
  it('inserts at the correct position maintaining order', () => {
    const schedule: ScheduleEntry[] = [
      { date: '2025-09-01', recipeId: '', recipeName: '', recipePhotoUrl: '', status: 'active' },
      { date: '2025-09-15', recipeId: '', recipeName: '', recipePhotoUrl: '', status: 'active' },
    ];
    const result = insertDate(schedule, '2025-09-08');
    expect(result).toHaveLength(3);
    expect(result[0].date).toBe('2025-09-01');
    expect(result[1].date).toBe('2025-09-08');
    expect(result[2].date).toBe('2025-09-15');
  });

  it('appends when new date is after all existing entries', () => {
    const schedule: ScheduleEntry[] = [
      { date: '2025-09-01', recipeId: '', recipeName: '', recipePhotoUrl: '', status: 'active' },
    ];
    const result = insertDate(schedule, '2025-09-30');
    expect(result).toHaveLength(2);
    expect(result[1].date).toBe('2025-09-30');
  });

  it('prepends when new date is before all existing entries', () => {
    const schedule: ScheduleEntry[] = [
      { date: '2025-09-15', recipeId: '', recipeName: '', recipePhotoUrl: '', status: 'active' },
    ];
    const result = insertDate(schedule, '2025-09-01');
    expect(result).toHaveLength(2);
    expect(result[0].date).toBe('2025-09-01');
  });

  it('inserts into empty schedule', () => {
    const result = insertDate([], '2025-09-01');
    expect(result).toHaveLength(1);
    expect(result[0].date).toBe('2025-09-01');
    expect(result[0].status).toBe('active');
    expect(result[0].recipeId).toBe('');
  });

  it('does not mutate the original array', () => {
    const schedule: ScheduleEntry[] = [
      { date: '2025-09-01', recipeId: '', recipeName: '', recipePhotoUrl: '', status: 'active' },
    ];
    const result = insertDate(schedule, '2025-09-08');
    expect(schedule).toHaveLength(1);
    expect(result).toHaveLength(2);
  });
});

describe('getNextUpcoming', () => {
  const schedule: ScheduleEntry[] = [
    { date: '2025-09-01', recipeId: 'r1', recipeName: 'Pasta', recipePhotoUrl: '', status: 'active' },
    { date: '2025-09-08', recipeId: '', recipeName: '', recipePhotoUrl: '', status: 'skipped' },
    { date: '2025-09-15', recipeId: 'r2', recipeName: 'Pizza', recipePhotoUrl: '', status: 'active' },
    { date: '2025-09-22', recipeId: '', recipeName: '', recipePhotoUrl: '', status: 'active' },
  ];

  it('returns the first active entry on or after reference date', () => {
    const result = getNextUpcoming(schedule, '2025-09-10');
    expect(result).not.toBeNull();
    expect(result!.date).toBe('2025-09-15');
  });

  it('returns the entry if reference date matches exactly', () => {
    const result = getNextUpcoming(schedule, '2025-09-01');
    expect(result).not.toBeNull();
    expect(result!.date).toBe('2025-09-01');
  });

  it('skips entries with status "skipped"', () => {
    const result = getNextUpcoming(schedule, '2025-09-08');
    expect(result).not.toBeNull();
    expect(result!.date).toBe('2025-09-15');
  });

  it('returns null when no active entries are on or after reference date', () => {
    const result = getNextUpcoming(schedule, '2025-10-01');
    expect(result).toBeNull();
  });

  it('returns null for empty schedule', () => {
    const result = getNextUpcoming([], '2025-09-01');
    expect(result).toBeNull();
  });
});

describe('getDisplaySchedule', () => {
  it('filters out skipped entries and substitutes unassigned recipe text', () => {
    const schedule: ScheduleEntry[] = [
      { date: '2025-09-01', recipeId: 'r1', recipeName: 'Pasta', recipePhotoUrl: 'photo1.jpg', status: 'active' },
      { date: '2025-09-08', recipeId: '', recipeName: '', recipePhotoUrl: '', status: 'skipped' },
      { date: '2025-09-15', recipeId: '', recipeName: '', recipePhotoUrl: '', status: 'active' },
      { date: '2025-09-22', recipeId: 'r3', recipeName: 'Pizza', recipePhotoUrl: 'photo3.jpg', status: 'active' },
    ];

    const result = getDisplaySchedule(schedule);
    expect(result).toHaveLength(3); // skipped entry excluded
    expect(result[0]).toEqual({ date: '2025-09-01', recipeName: 'Pasta', recipePhotoUrl: 'photo1.jpg' });
    expect(result[1]).toEqual({ date: '2025-09-15', recipeName: 'Recipe to be announced', recipePhotoUrl: '' });
    expect(result[2]).toEqual({ date: '2025-09-22', recipeName: 'Pizza', recipePhotoUrl: 'photo3.jpg' });
  });

  it('returns empty array for empty schedule', () => {
    expect(getDisplaySchedule([])).toEqual([]);
  });

  it('returns empty array when all entries are skipped', () => {
    const schedule: ScheduleEntry[] = [
      { date: '2025-09-01', recipeId: 'r1', recipeName: 'Pasta', recipePhotoUrl: '', status: 'skipped' },
    ];
    expect(getDisplaySchedule(schedule)).toEqual([]);
  });
});
