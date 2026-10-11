import { describe, it, expect } from 'vitest';
import { balances, equalSplit, formatRs, orderedBalances, settleUp } from './money.js';

const sum = (list) => list.reduce((n, x) => n + x.share, 0);
const bill = (paidBy, amount, uids) => ({ paidBy, amount, splits: equalSplit(amount, uids) });
const four = ['ashish', 'rahul', 'ankit', 'rohan'];

describe('balances', () => {
  it('is what each person paid minus their share', () => {
    const b = balances([bill('ashish', 800000, four)]);
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

describe('equal split', () => {
  it('splits evenly when it divides', () => {
    expect(equalSplit(800000, four).map((s) => s.share)).toEqual([200000, 200000, 200000, 200000]);
  });

  it('Rs 1,000 over 3: the leftover paisa goes to the first person, and the shares add up exactly', () => {
    const shares = equalSplit(100000, ['a', 'b', 'c']);
    expect(shares).toEqual([
      { uid: 'a', share: 33334 },
      { uid: 'b', share: 33333 },
      { uid: 'c', share: 33333 },
    ]);
    expect(sum(shares)).toBe(100000);
  });

  it('several leftover paise go one each to the first people', () => {
    const shares = equalSplit(1003, ['a', 'b', 'c', 'd', 'e', 'f']);
    expect(shares.map((s) => s.share)).toEqual([168, 167, 167, 167, 167, 167]);
    expect(sum(shares)).toBe(1003);
  });

  it('never loses or makes up a paisa, for any amount and group size', () => {
    for (let amount = 1; amount < 2000; amount += 37) {
      for (let n = 1; n <= 8; n++) expect(sum(equalSplit(amount, Array.from({ length: n }, (_, i) => `p${i}`)))).toBe(amount);
    }
  });
});

describe('settle up', () => {
  it("the brief's example: Ankit, Rohan and Rahul pay Ashish 2,500, 2,500 and 500", () => {
    // Ashish paid Rs 8,000 and Rahul Rs 2,000, all four share both: Rs 2,500 each.
    const b = orderedBalances([bill('ashish', 800000, four), bill('rahul', 200000, four)], four);
    expect(Object.fromEntries(b)).toEqual({ ashish: 550000, rahul: -50000, ankit: -250000, rohan: -250000 });
    expect(settleUp(b)).toEqual([
      { from: 'ankit', to: 'ashish', amount: 250000 },
      { from: 'rohan', to: 'ashish', amount: 250000 },
      { from: 'rahul', to: 'ashish', amount: 50000 },
    ]);
  });

  it('an uneven (exact amounts) split', () => {
    const b = orderedBalances(
      [
        { paidBy: 'ashish', amount: 300000, splits: [{ uid: 'ashish', share: 100000 }, { uid: 'rahul', share: 150000 }, { uid: 'ankit', share: 50000 }] },
        { paidBy: 'ankit', amount: 120000, splits: [{ uid: 'rahul', share: 120000 }] },
      ],
      ['ashish', 'rahul', 'ankit'],
    );
    // ashish +200000, rahul -270000, ankit +70000
    expect(settleUp(b)).toEqual([
      { from: 'rahul', to: 'ashish', amount: 200000 },
      { from: 'rahul', to: 'ankit', amount: 70000 },
    ]);
  });

  it('rounding: Rs 1,000 split 3 ways settles to the paisa', () => {
    const b = orderedBalances([bill('a', 100000, ['a', 'b', 'c'])], ['a', 'b', 'c']);
    const t = settleUp(b);
    expect(t).toEqual([
      { from: 'b', to: 'a', amount: 33333 },
      { from: 'c', to: 'a', amount: 33333 },
    ]);
    expect(t.reduce((n, x) => n + x.amount, 0)).toBe(100000 - 33334);
  });

  it('already settled: nobody pays anybody', () => {
    const expenses = [bill('ashish', 800000, four), ...['rahul', 'ankit', 'rohan'].map((uid) => ({ paidBy: uid, amount: 200000, splits: [{ uid: 'ashish', share: 200000 }], type: 'settlement' }))];
    expect(settleUp(orderedBalances(expenses, four))).toEqual([]);
    expect(settleUp(new Map())).toEqual([]);
  });

  it('one person paid everything: everyone else pays them their share', () => {
    const b = orderedBalances([bill('rohan', 450000, four), bill('rohan', 90000, four), bill('rohan', 12000, four)], four);
    const t = settleUp(b);
    expect(t.every((x) => x.to === 'rohan')).toBe(true);
    expect(t.map((x) => x.from)).toEqual(['ashish', 'rahul', 'ankit']);
    expect(t.map((x) => x.amount)).toEqual([138000, 138000, 138000]);
  });

  it('after the suggested payments are marked as paid, settle up is empty', () => {
    const expenses = [bill('ashish', 800000, four), bill('rahul', 200000, four)];
    const t = settleUp(orderedBalances(expenses, four));
    const marked = t.map((x) => ({ paidBy: x.from, amount: x.amount, splits: [{ uid: x.to, share: x.amount }] }));
    expect(settleUp(orderedBalances([...expenses, ...marked], four))).toEqual([]);
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
