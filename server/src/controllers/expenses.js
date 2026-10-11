import { ObjectId } from 'mongodb';
import { getDb } from '../config/db.js';
import { HttpError } from '../utils/httpError.js';
import { equalSplit, formatRs, orderedBalances, settleUp } from '../utils/money.js';
import { PAGE_SIZE, billFilter, pageWindow } from '../utils/paging.js';
import { namesFor } from './trips.js';

// EXPENSES (bills), BUDGET and SETTLE UP for one trip.
//
// Each bill is its own document in the expenses collection:
//   { tripId, title, amount, category, paidBy, date, createdBy, type: 'expense' | 'settlement',
//     splitType: 'equal' | 'exact', splits: [{ uid, share }], createdAt, updatedAt }
// Shares always add up to the amount exactly (checked by zod for exact splits;
// equal splits are worked out here with the leftover-paise rule).
// "Mark as paid" is stored as type 'settlement': the payer pays the full amount
// for the receiver, so the same balance maths reaches zero with no extra rule.

const expenses = async () => (await getDb()).collection('expenses');

function shape(e) {
  return {
    id: e._id.toString(),
    title: e.title,
    amount: e.amount,
    category: e.category,
    paidBy: e.paidBy,
    date: e.date,
    type: e.type,
    splitType: e.splitType,
    splits: e.splits,
    createdBy: e.createdBy,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  };
}

// The checked body as a document: everyone named must be in the trip now.
function billFrom(req) {
  const members = new Set(req.trip.members.map((m) => m.uid));
  const { title, amount, category, paidBy, date, split } = req.body;
  if (!members.has(paidBy)) throw new HttpError(400, 'Pick who paid from the people in this trip.');
  const splits = split.type === 'equal' ? equalSplit(amount, split.among) : split.shares;
  if (splits.some((s) => !members.has(s.uid))) throw new HttpError(400, 'Everyone in the split must be in this trip.');
  return { title, amount, category, paidBy, date, splitType: split.type, splits };
}

// GET /api/trips/:id/expenses?category=&person=&page= (members)
// Newest first, 20 to a page, with the names of everyone on that page.
// total: bills that match the filters; allTotal: every bill and payment of the trip.
export async function listExpenses(req, res) {
  const bills = await expenses();
  const { category, person, page } = req.valid.query;
  const filter = billFilter(req.trip._id, { category, person });
  const [total, allTotal] = await Promise.all([bills.countDocuments(filter), bills.countDocuments({ tripId: req.trip._id })]);
  const window = pageWindow(total, page);
  const rows = await bills
    .find(filter)
    .sort({ date: -1, createdAt: -1, _id: -1 })
    .skip(window.skip)
    .limit(window.limit)
    .toArray();
  const uids = rows.flatMap((e) => [e.paidBy, e.createdBy, ...e.splits.map((s) => s.uid)]);
  const names = await namesFor(await getDb(), uids);
  res.json({ expenses: rows.map(shape), names: Object.fromEntries(names), page: window.page, pages: window.pages, pageSize: PAGE_SIZE, total, allTotal });
}

// POST /api/trips/:id/expenses (owner, editor)
export async function addExpense(req, res) {
  const now = new Date();
  const doc = { tripId: req.trip._id, ...billFrom(req), type: 'expense', createdBy: req.user.uid, createdAt: now, updatedAt: now };
  const result = await (await expenses()).insertOne(doc);
  res.status(201).json({ expense: shape({ ...doc, _id: result.insertedId }) });
}

// Loads the bill named in the URL (it must belong to THIS trip), then the
// ownership rule: the owner may change any bill, an editor only their own.
// This is the role step of the guard chain for these routes, so it runs before the body check.
export async function ownBillOrOwner(req, res, next) {
  const id = req.params.expenseId;
  if (!/^[a-f0-9]{24}$/i.test(id)) throw new HttpError(404, 'This bill does not exist.');
  const bill = await (await expenses()).findOne({ _id: new ObjectId(id), tripId: req.trip._id });
  if (!bill) throw new HttpError(404, 'This bill does not exist any more. Someone may have deleted it; reload the page.');
  if (req.role !== 'owner' && bill.createdBy !== req.user.uid) {
    throw new HttpError(403, 'Editors can change only the bills they added. Ask the person who added it, or the trip owner.');
  }
  req.bill = bill;
  next();
}

// PATCH /api/trips/:id/expenses/:expenseId (owner: any bill; editor: their own)
// The whole bill is sent again (amount and split belong together) and only
// this one document is updated.
export async function editExpense(req, res) {
  if (req.bill.type === 'settlement') {
    throw new HttpError(400, 'A payment marked as paid cannot be edited. Delete it, then mark the right amount as paid.');
  }
  const changes = { ...billFrom(req), updatedAt: new Date(), updatedBy: req.user.uid };
  const updated = await (await expenses()).findOneAndUpdate({ _id: req.bill._id, tripId: req.trip._id }, { $set: changes }, { returnDocument: 'after' });
  if (!updated) throw new HttpError(404, 'This bill does not exist any more. Someone may have deleted it; reload the page.');
  res.json({ expense: shape(updated) });
}

// DELETE /api/trips/:id/expenses/:expenseId (owner: any; editor: their own)
export async function deleteExpense(req, res) {
  await (await expenses()).deleteOne({ _id: req.bill._id, tripId: req.trip._id });
  res.json({ deleted: true });
}

// GET /api/trips/:id/budget (members)
// BUDGET AGGREGATION: one MongoDB query groups this trip's bills by category.
// Settlements are left out: paying a friend back is not spending.
export async function budget(req, res) {
  const rows = await (await expenses())
    .aggregate([
      { $match: { tripId: req.trip._id, type: 'expense' } },
      { $group: { _id: '$category', spent: { $sum: '$amount' }, bills: { $sum: 1 } } },
      { $sort: { spent: -1, _id: 1 } },
    ])
    .toArray();
  const byCategory = rows.map((r) => ({ category: r._id, spent: r.spent, bills: r.bills }));
  res.json({ budget: req.trip.budget, spent: byCategory.reduce((n, r) => n + r.spent, 0), byCategory });
}

// Everyone's balance in trip order, plus who pays whom.
async function moneyState(trip) {
  const rows = await (await expenses()).find({ tripId: trip._id }, { projection: { paidBy: 1, amount: 1, splits: 1, type: 1 } }).toArray();
  const memberUids = trip.members.map((m) => m.uid);
  const balanceMap = orderedBalances(rows, memberUids);
  // What each person paid for bills and their share of bills (settlements left out).
  const bills = rows.filter((r) => r.type === 'expense');
  const paid = new Map();
  const share = new Map();
  for (const b of bills) {
    paid.set(b.paidBy, (paid.get(b.paidBy) || 0) + b.amount);
    for (const s of b.splits) share.set(s.uid, (share.get(s.uid) || 0) + s.share);
  }
  return { balanceMap, paid, share, memberUids };
}

// GET /api/trips/:id/settlements (members)
export async function settlements(req, res) {
  const { balanceMap, paid, share, memberUids } = await moneyState(req.trip);
  const names = await namesFor(await getDb(), [...balanceMap.keys()]);
  res.json({
    people: [...balanceMap].map(([uid, balance]) => ({
      uid,
      name: names.get(uid) || 'Former member',
      member: memberUids.includes(uid),
      paid: paid.get(uid) || 0,
      share: share.get(uid) || 0,
      balance,
    })),
    transfers: settleUp(balanceMap),
  });
}

// Today's date in India ("2026-10-11"), the day a payment is marked.
const todayInIndia = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

// POST /api/trips/:id/settlements (owner, editor): "Mark as paid", { from, to, amount }.
// Refused if it would pay more than is owed, so a slip of the finger cannot
// turn a debt into a new one the other way.
export async function markPaid(req, res) {
  const { from, to, amount } = req.body;
  const { balanceMap } = await moneyState(req.trip);
  const names = await namesFor(await getDb(), [from, to]);
  const who = (uid) => names.get(uid) || 'This person';
  if (!balanceMap.has(from) || !balanceMap.has(to)) throw new HttpError(400, 'Pick two people from this trip.');
  const owes = -Math.min(balanceMap.get(from), 0);
  const isOwed = Math.max(balanceMap.get(to), 0);
  if (owes === 0) throw new HttpError(400, `${who(from)} does not owe anything right now.`);
  if (isOwed === 0) throw new HttpError(400, `${who(to)} is not owed anything right now.`);
  if (amount > Math.min(owes, isOwed)) {
    throw new HttpError(400, `${who(from)} owes ${formatRs(owes)} and ${who(to)} is owed ${formatRs(isOwed)}, so mark at most ${formatRs(Math.min(owes, isOwed))} as paid.`);
  }
  const now = new Date();
  const doc = {
    tripId: req.trip._id,
    title: `${who(from)} paid ${who(to)}`,
    amount,
    category: 'settlement',
    paidBy: from,
    date: todayInIndia(),
    type: 'settlement',
    splitType: 'exact',
    splits: [{ uid: to, share: amount }],
    createdBy: req.user.uid,
    createdAt: now,
    updatedAt: now,
  };
  const result = await (await expenses()).insertOne(doc);
  res.status(201).json({ settlement: shape({ ...doc, _id: result.insertedId }) });
}
