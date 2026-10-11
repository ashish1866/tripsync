import { describe, it, expect } from 'vitest';
import { PAGE_SIZE, billFilter, pageWindow } from './paging.js';

describe('paging, 20 to a page', () => {
  it('uses 20 a page', () => {
    expect(PAGE_SIZE).toBe(20);
  });

  it('47 rows are 3 pages: 20, 20 and 7', () => {
    expect(pageWindow(47, 1)).toEqual({ page: 1, pages: 3, skip: 0, limit: 20 });
    expect(pageWindow(47, 2)).toEqual({ page: 2, pages: 3, skip: 20, limit: 20 });
    expect(pageWindow(47, 3)).toEqual({ page: 3, pages: 3, skip: 40, limit: 20 });
  });

  it('exactly 20 rows is one page, 21 rows is two', () => {
    expect(pageWindow(20, 1).pages).toBe(1);
    expect(pageWindow(21, 1).pages).toBe(2);
  });

  it('no rows is still one (empty) page', () => {
    expect(pageWindow(0, 1)).toEqual({ page: 1, pages: 1, skip: 0, limit: 20 });
  });

  it('a page past the end keeps its number so the caller can say which pages exist', () => {
    expect(pageWindow(47, 9)).toEqual({ page: 9, pages: 3, skip: 160, limit: 20 });
  });
});

describe('bill filter', () => {
  const trip = { id: 'trip-1' };

  it('with no filters, asks for the whole trip only', () => {
    expect(billFilter(trip)).toEqual({ tripId: trip });
    expect(billFilter(trip, {})).toEqual({ tripId: trip });
  });

  it('narrows by category', () => {
    expect(billFilter(trip, { category: 'food' })).toEqual({ tripId: trip, category: 'food' });
  });

  it('narrows by person: bills they paid or have a share in', () => {
    expect(billFilter(trip, { person: 'dhruv' })).toEqual({ tripId: trip, $or: [{ paidBy: 'dhruv' }, { 'splits.uid': 'dhruv' }] });
  });

  it('combines both', () => {
    const f = billFilter(trip, { category: 'travel', person: 'rahul' });
    expect(f.category).toBe('travel');
    expect(f.$or).toHaveLength(2);
    expect(f.tripId).toBe(trip);
  });

  it('keeps the person as plain text in the filter', () => {
    const f = billFilter(trip, { person: 'rahul' });
    expect(f.$or.every((clause) => Object.values(clause).every((v) => typeof v === 'string'))).toBe(true);
  });
});
