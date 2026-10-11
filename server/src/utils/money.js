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
