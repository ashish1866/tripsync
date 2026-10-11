import { describe, it, expect } from 'vitest';
import { buildDemo, DEMO_BUDGET, DEMO_DAYS, FRIENDS } from './demoTrip.js';
import { expenseBody } from '../schemas/expense.js';
import { createTripBody } from '../schemas/trip.js';
import { newItemBody } from '../schemas/checklist.js';
import { newActivityBody } from '../schemas/activity.js';
import { isStoredLocation } from '../utils/coords.js';
import { dateRangeProblem } from '../utils/dates.js';
import { orderedBalances, settleUp } from '../utils/money.js';

const OWNER = { uid: 'owner-uid-123', name: 'Ashish Bisht' };
const demo = buildDemo({ owner: OWNER, startDate: '2026-10-20', tripId: 'trip-1', now: new Date('2026-10-12T10:00:00Z') });
const memberUids = demo.trip.members.map((m) => m.uid);
const roleOf = Object.fromEntries(demo.trip.members.map((m) => [m.uid, m.role]));

describe('the Manali demo trip', () => {
  it('is a valid trip: name, destination, 4 dates, budget in paise', () => {
    const { name, destination, startDate, endDate, budget } = demo.trip;
    expect(createTripBody.safeParse({ name, destination, startDate, endDate, budget }).success).toBe(true);
    expect(dateRangeProblem(startDate, endDate)).toBeNull();
    expect(demo.trip.days).toHaveLength(DEMO_DAYS);
    expect(demo.trip.days.map((d) => d.date)).toEqual(['2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23']);
    expect(budget).toBe(DEMO_BUDGET);
    expect(Number.isInteger(budget)).toBe(true);
  });

  it('has the owner and the three friends, with their roles', () => {
    expect(roleOf[OWNER.uid]).toBe('owner');
    expect(FRIENDS.map((f) => roleOf[f.uid])).toEqual(['editor', 'editor', 'viewer']);
    expect(demo.trip.owner).toBe(OWNER.uid);
    expect(demo.users.map((u) => u.name)).toEqual(['Rahul', 'Ankit', 'Rohan']);
    expect(demo.users.every((u) => u.demo === true && /^demo\./.test(u.email) && /^[A-Za-z0-9_-]{1,128}$/.test(u.firebaseUid))).toBe(true);
  });

  it('every stop is valid, in time order, with real map points where it has a place', () => {
    for (const day of demo.trip.days) {
      expect(day.activities.length).toBeGreaterThan(0);
      for (const stop of day.activities) {
        const { title, time, notes, place } = stop;
        expect(newActivityBody.safeParse({ title, time, notes, place }).success, `${day.dayNumber}: ${title}`).toBe(true);
        if (place) expect(isStoredLocation(place.location)).toBe(true);
      }
      const times = day.activities.map((s) => s.time).filter(Boolean);
      expect(times).toEqual([...times].sort());
    }
    const placed = demo.trip.days.flatMap((d) => d.activities).filter((s) => s.place);
    expect(placed.length).toBeGreaterThanOrEqual(10);
    // Every place is around Manali (within about 25 km of the centre): [lng, lat] the right way round.
    for (const s of placed) {
      expect(Math.abs(s.place.location[0] - 77.17)).toBeLessThan(0.3);
      expect(Math.abs(s.place.location[1] - 32.26)).toBeLessThan(0.3);
    }
  });

  it('the packing list has 8 items, 5 packed, each by a member', () => {
    for (const item of demo.trip.checklist) expect(newItemBody.safeParse({ text: item.text }).success).toBe(true);
    expect(demo.trip.checklist).toHaveLength(8);
    expect(demo.trip.checklist.filter((i) => i.done)).toHaveLength(5);
    expect(demo.trip.checklist.filter((i) => i.done).every((i) => memberUids.includes(i.doneBy) && i.doneAt)).toBe(true);
  });
});

describe('the demo bills', () => {
  const bills = demo.expenses.filter((e) => e.type === 'expense');
  const payments = demo.expenses.filter((e) => e.type === 'settlement');

  it('every bill passes the same rules the API enforces', () => {
    for (const b of bills) {
      const split = b.splitType === 'equal' ? { type: 'equal', among: b.splits.map((s) => s.uid) } : { type: 'exact', shares: b.splits };
      const result = expenseBody.safeParse({ title: b.title, amount: b.amount, category: b.category, paidBy: b.paidBy, date: b.date, split });
      expect(result.success, b.title).toBe(true);
    }
  });

  it('shares add up to the amount exactly, in whole paise', () => {
    for (const e of demo.expenses) {
      expect(e.splits.reduce((n, s) => n + s.share, 0), e.title).toBe(e.amount);
      expect(Number.isInteger(e.amount) && e.splits.every((s) => Number.isInteger(s.share) && s.share > 0)).toBe(true);
    }
  });

  it('everyone named is in the trip, and only the owner and editors added bills', () => {
    for (const e of demo.expenses) {
      expect(memberUids).toContain(e.paidBy);
      expect(e.splits.every((s) => memberUids.includes(s.uid))).toBe(true);
      expect(['owner', 'editor']).toContain(roleOf[e.createdBy]);
    }
  });

  it('shows the leftover-paise rule once: Rs 1,250 over three people', () => {
    const dinner = bills.find((b) => b.amount === 125000);
    expect(dinner.splits.map((s) => s.share)).toEqual([41667, 41667, 41666]);
  });

  it('spends less than the budget, across at least five categories, with no "settlement" in the spending', () => {
    const spent = bills.reduce((n, b) => n + b.amount, 0);
    expect(spent).toBeGreaterThan(DEMO_BUDGET * 0.8);
    expect(spent).toBeLessThan(DEMO_BUDGET);
    expect(new Set(bills.map((b) => b.category)).size).toBeGreaterThanOrEqual(5);
    expect(bills.some((b) => b.category === 'settlement')).toBe(false);
  });

  it('has one payment marked as paid, from Rohan to Ashish', () => {
    expect(payments).toHaveLength(1);
    expect(payments[0].paidBy).toBe('demo-rohan');
    expect(payments[0].splits).toEqual([{ uid: OWNER.uid, share: 100000 }]);
  });

  it('settle up works out: balances add up to zero and the suggested payments clear them all', () => {
    const balances = orderedBalances(demo.expenses, memberUids);
    expect([...balances.values()].reduce((n, b) => n + b, 0)).toBe(0);
    const transfers = settleUp(balances);
    expect(transfers.length).toBeGreaterThan(0);
    expect(transfers.every((t) => t.amount > 0)).toBe(true);
    const after = new Map(balances);
    for (const t of transfers) {
      after.set(t.from, after.get(t.from) + t.amount);
      after.set(t.to, after.get(t.to) - t.amount);
    }
    expect([...after.values()].every((b) => b === 0)).toBe(true);
  });
});
