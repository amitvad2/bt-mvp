import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  formatRecurrenceDays,
  formatTermPrice,
  isTermClassActive,
  isTermClassExpired,
  formatProgrammeDescription,
} from '@/lib/term-utils';

describe('formatRecurrenceDays', () => {
  it('returns empty string for empty array', () => {
    expect(formatRecurrenceDays([])).toBe('');
  });

  it('returns full day name for single day', () => {
    expect(formatRecurrenceDays(['Monday'])).toBe('Every Monday');
    expect(formatRecurrenceDays(['Saturday'])).toBe('Every Saturday');
  });

  it('uses ampersand for two days', () => {
    expect(formatRecurrenceDays(['Saturday', 'Sunday'])).toBe('Every Saturday & Sunday');
    expect(formatRecurrenceDays(['Monday', 'Wednesday'])).toBe('Every Monday & Wednesday');
  });

  it('abbreviates and comma-separates for three or more days', () => {
    expect(formatRecurrenceDays(['Monday', 'Wednesday', 'Friday'])).toBe('Every Mon, Wed, Fri');
  });

  it('handles all seven days abbreviated', () => {
    const allDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    expect(formatRecurrenceDays(allDays)).toBe('Every Mon, Tue, Wed, Thu, Fri, Sat, Sun');
  });
});

describe('formatTermPrice', () => {
  it('formats price in pence to pounds with two decimals', () => {
    expect(formatTermPrice(12000)).toBe('£120.00 for the programme');
  });

  it('handles prices with non-zero pence portion', () => {
    expect(formatTermPrice(1599)).toBe('£15.99 for the programme');
  });

  it('handles zero price', () => {
    expect(formatTermPrice(0)).toBe('£0.00 for the programme');
  });

  it('handles large prices', () => {
    expect(formatTermPrice(50000)).toBe('£500.00 for the programme');
  });

  it('handles single pence', () => {
    expect(formatTermPrice(1)).toBe('£0.01 for the programme');
  });
});

describe('isTermClassActive', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns true when end date is in the future and spots available', () => {
    vi.setSystemTime(new Date('2025-01-15T10:00:00'));
    expect(isTermClassActive('2025-03-28', 5)).toBe(true);
  });

  it('returns true when end date is today and spots available', () => {
    vi.setSystemTime(new Date('2025-03-28T14:00:00'));
    expect(isTermClassActive('2025-03-28', 3)).toBe(true);
  });

  it('returns false when end date is in the past', () => {
    vi.setSystemTime(new Date('2025-04-01T10:00:00'));
    expect(isTermClassActive('2025-03-28', 5)).toBe(false);
  });

  it('returns false when spots available is zero', () => {
    vi.setSystemTime(new Date('2025-01-15T10:00:00'));
    expect(isTermClassActive('2025-03-28', 0)).toBe(false);
  });

  it('returns false when end date is past and spots are zero', () => {
    vi.setSystemTime(new Date('2025-04-01T10:00:00'));
    expect(isTermClassActive('2025-03-28', 0)).toBe(false);
  });
});

describe('isTermClassExpired', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns true when current date is past termEndDate', () => {
    vi.setSystemTime(new Date('2025-04-01T10:00:00'));
    expect(isTermClassExpired('2025-03-28')).toBe(true);
  });

  it('returns false when current date equals termEndDate', () => {
    vi.setSystemTime(new Date('2025-03-28T14:00:00'));
    expect(isTermClassExpired('2025-03-28')).toBe(false);
  });

  it('returns false when current date is before termEndDate', () => {
    vi.setSystemTime(new Date('2025-01-15T10:00:00'));
    expect(isTermClassExpired('2025-03-28')).toBe(false);
  });
});

describe('formatProgrammeDescription', () => {
  it('returns "{N}-Day Programme, {startDate} – {endDate}" when sessionCount is provided', () => {
    expect(formatProgrammeDescription('2025-08-24', '2025-08-28', 5)).toBe(
      '5-Day Programme, 24 Aug – 28 Aug 2025'
    );
  });

  it('returns "{startDate} – {endDate}" when sessionCount is not provided', () => {
    expect(formatProgrammeDescription('2025-08-24', '2025-08-28')).toBe(
      '24 Aug – 28 Aug 2025'
    );
  });

  it('returns "{startDate} – {endDate}" when sessionCount is undefined', () => {
    expect(formatProgrammeDescription('2025-01-06', '2025-03-28', undefined)).toBe(
      '6 Jan – 28 Mar 2025'
    );
  });

  it('includes year on start date when years differ', () => {
    expect(formatProgrammeDescription('2024-12-28', '2025-01-03', 7)).toBe(
      '7-Day Programme, 28 Dec 2024 – 3 Jan 2025'
    );
  });

  it('does not include year on start date when years are the same', () => {
    expect(formatProgrammeDescription('2025-06-01', '2025-06-05', 5)).toBe(
      '5-Day Programme, 1 Jun – 5 Jun 2025'
    );
  });

  it('handles sessionCount of 1', () => {
    expect(formatProgrammeDescription('2025-08-24', '2025-08-24', 1)).toBe(
      '1-Day Programme, 24 Aug – 24 Aug 2025'
    );
  });

  it('returns date range only when sessionCount is 0', () => {
    expect(formatProgrammeDescription('2025-08-24', '2025-08-28', 0)).toBe(
      '24 Aug – 28 Aug 2025'
    );
  });
});
