// MONEY: pure helpers. All amounts are whole paise (Rs 8,000 = 800000).

const whole = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const withPaise = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// 800000 -> "Rs 8,000", 3333350 -> "Rs 33,333.50" (Indian grouping: 1,00,000)
export function formatRs(paise) {
  return `Rs ${(paise % 100 === 0 ? whole : withPaise).format(paise / 100)}`;
}

// BALANCES: for each person, what they paid minus their share of everything.
//   positive: the group owes them; negative: they owe the group.
// A settlement ("Mark as paid") is stored like an expense where the payer
// pays the full amount for the receiver, so it moves both balances toward zero
// with no extra rule.
// expenses: [{ paidBy, amount, splits: [{ uid, share }] }]
export function balances(expenses) {
  const out = new Map();
  const add = (uid, paise) => out.set(uid, (out.get(uid) || 0) + paise);
  for (const e of expenses) {
    add(e.paidBy, e.amount);
    for (const s of e.splits || []) add(s.uid, -s.share);
  }
  return out;
}

// EQUAL SPLIT in whole paise. When the amount does not divide evenly, the
// leftover paise go one each to the first people in the list, so the shares
// always add up to the amount exactly.
//   equalSplit(100000, [a, b, c]) -> a 33334, b 33333, c 33333   (Rs 1,000 / 3)
export function equalSplit(amount, uids) {
  const base = Math.floor(amount / uids.length);
  let leftover = amount - base * uids.length;
  return uids.map((uid) => {
    const extra = leftover > 0 ? 1 : 0;
    leftover -= extra;
    return { uid, share: base + extra };
  });
}

// SETTLE UP: the list of "A pays B" that brings everyone to zero.
// Repeatedly, the person who owes the most pays the person owed the most as
// much as they can, until nobody owes anything. Ties go to whoever comes first
// in the map (the server puts members in trip order).
//   balanceMap: Map(uid -> paise), positive = owed money, negative = owes money
//   returns:    [{ from, to, amount }]
export function settleUp(balanceMap) {
  const owe = [];
  const owed = [];
  for (const [uid, b] of balanceMap) {
    if (b < 0) owe.push({ uid, left: -b });
    else if (b > 0) owed.push({ uid, left: b });
  }
  // Index of the biggest amount still left (the first one on a tie), or -1.
  const biggest = (list) => list.reduce((best, x, i) => (x.left > 0 && (best === -1 || x.left > list[best].left) ? i : best), -1);

  const transfers = [];
  for (;;) {
    const d = biggest(owe);
    const c = biggest(owed);
    if (d === -1 || c === -1) break;
    const amount = Math.min(owe[d].left, owed[c].left);
    transfers.push({ from: owe[d].uid, to: owed[c].uid, amount });
    owe[d].left -= amount;
    owed[c].left -= amount;
  }
  return transfers;
}

// Balances in a fixed order: trip members first (owner, then by joining),
// then anyone who has left but still appears in a bill.
export function orderedBalances(expenses, memberUids) {
  const raw = balances(expenses);
  const out = new Map();
  for (const uid of memberUids) out.set(uid, raw.get(uid) || 0);
  for (const [uid, b] of raw) if (!out.has(uid)) out.set(uid, b);
  return out;
}
