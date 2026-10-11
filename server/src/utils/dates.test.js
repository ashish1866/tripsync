import { describe, it, expect } from 'vitest';
import { buildDays, datesBetween, dateRangeProblem, isRealDate, addDays } from './dates.js';

describe('dates to days', () => {
  it('makes one day per date, numbered from 1, both ends included', () => {
    expect(buildDays('2026-10-13', '2026-10-16')).toEqual([
      { dayNumber: 1, date: '2026-10-13', activities: [] },
      { dayNumber: 2, date: '2026-10-14', activities: [] },
      { dayNumber: 3, date: '2026-10-15', activities: [] },
      { dayNumber: 4, date: '2026-10-16', activities: [] },
    ]);
  });

  it('makes a single day for a one-day trip', () => {
    expect(buildDays('2026-10-13', '2026-10-13')).toHaveLength(1);
  });

  it('crosses month and year ends, and leap days', () => {
    expect(datesBetween('2026-12-30', '2027-01-02')).toEqual(['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02']);
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('refuses impossible and badly shaped dates', () => {
    expect(isRealDate('2026-02-30')).toBe(false);
    expect(isRealDate('13-10-2026')).toBe(false);
    expect(isRealDate('2026-10-13')).toBe(true);
  });

  it('explains what is wrong with a date range', () => {
    expect(dateRangeProblem('2026-10-16', '2026-10-13')).toMatch(/cannot end before it starts/);
    expect(dateRangeProblem('2026-10-01', '2026-11-15')).toMatch(/at most 30 days/);
    expect(dateRangeProblem('2026-10-13', '2026-10-16')).toBeNull();
  });
});
