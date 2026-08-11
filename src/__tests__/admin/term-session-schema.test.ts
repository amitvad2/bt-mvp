import { describe, it, expect } from 'vitest';
import { termSessionSchema } from '@/app/admin/sessions/term-session-schema';

describe('termSessionSchema', () => {
  const validData = {
    sessionType: 'term' as const,
    termStartDate: '2025-09-01',
    termEndDate: '2025-12-15',
    dayOfWeek: 'Monday' as const,
    spotsTotal: 15,
    price: 18000,
    classId: 'cls_001',
    venueId: 'ven_001',
    instructorId: 'inst_001',
    startTime: '15:30',
    endTime: '16:30',
    ageMin: 5,
    ageMax: 12,
  };

  it('accepts valid term session data', () => {
    const result = termSessionSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it('rejects when endDate is before startDate', () => {
    const result = termSessionSchema.safeParse({
      ...validData,
      termStartDate: '2025-12-15',
      termEndDate: '2025-09-01',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const endDateError = result.error.issues.find(
        (i) => i.path.includes('termEndDate')
      );
      expect(endDateError).toBeDefined();
    }
  });

  it('rejects when dayOfWeek does not occur in range', () => {
    // 2025-09-01 is a Monday, 2025-09-02 is a Tuesday — no Sunday in a 2-day range
    const result = termSessionSchema.safeParse({
      ...validData,
      termStartDate: '2025-09-01',
      termEndDate: '2025-09-02',
      dayOfWeek: 'Sunday',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const dayError = result.error.issues.find(
        (i) => i.path.includes('dayOfWeek')
      );
      expect(dayError).toBeDefined();
    }
  });

  it('rejects when ageMax is not greater than ageMin', () => {
    const result = termSessionSchema.safeParse({
      ...validData,
      ageMin: 10,
      ageMax: 10,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const ageError = result.error.issues.find(
        (i) => i.path.includes('ageMax')
      );
      expect(ageError).toBeDefined();
    }
  });

  it('rejects empty required string fields', () => {
    const result = termSessionSchema.safeParse({
      ...validData,
      classId: '',
      venueId: '',
      instructorId: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects zero or negative spotsTotal', () => {
    const result = termSessionSchema.safeParse({
      ...validData,
      spotsTotal: 0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects zero or negative price', () => {
    const result = termSessionSchema.safeParse({
      ...validData,
      price: 0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid sessionType', () => {
    const result = termSessionSchema.safeParse({
      ...validData,
      sessionType: 'single',
    });
    expect(result.success).toBe(false);
  });
});
