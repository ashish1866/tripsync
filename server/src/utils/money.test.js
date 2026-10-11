import { describe, it, expect } from 'vitest';
import { balances, formatRs } from './money.js';

describe('balances', () => {
  it('is what each person paid minus their share', () => {
    const b = balances([
      { paidBy: 'ashish', amount: 800000, splits: ['ashish', 'rahul', 'ankit', 'rohan'].map((uid) => ({ uid, share: 200000 })) },
    ]);
    expect(Object.fromEntries(b)).toEqual({ ashish: 600000, rahul: -200000, ankit: -200000, rohan: -200000 });
  });

  it('a settlement (payer pays the full amount for the receiver) brings both to zero', () => {
    const b = balances([
      { paidBy: 'ashish', amount: 100000, splits: [{ uid: 'rahul', share: 100000 }] },
      { paidBy: 'rahul', amount: 100000, splits: [{ uid: 'ashish', share: 100000 }] },
    ]);
    expect(b.get('ashish')).toBe(0);
    expect(b.get('rahul')).toBe(0);
  });
});

describe('formatRs', () => {
  it('writes rupees with Indian grouping', () => {
    expect(formatRs(800000)).toBe('Rs 8,000');
    expect(formatRs(1_000_000_000)).toBe('Rs 1,00,00,000');
    expect(formatRs(3333350)).toBe('Rs 33,333.50');
    expect(formatRs(-250000)).toBe('Rs -2,500');
  });
});
