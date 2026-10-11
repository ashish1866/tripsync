import { getDb } from '../config/db.js';
import { HttpError } from '../utils/httpError.js';
import { balances, formatRs } from '../utils/money.js';
import { loadTripForMember } from './trips.js';

// MEMBERS: the owner changes roles and removes people; anyone but the owner
// can leave. Every change touches one member with one update.

// PATCH /api/trips/:id/members/:uid (owner): { role: 'editor' | 'viewer' }
export async function changeRole(req, res) {
  const db = await getDb();
  const { uid } = req.valid.params;
  if (uid === req.trip.owner) throw new HttpError(400, "The owner's role cannot change. Each trip has one owner.");
  const result = await db
    .collection('trips')
    .updateOne({ _id: req.trip._id, members: { $elemMatch: { uid, role: { $ne: 'owner' } } } }, { $set: { 'members.$.role': req.body.role, updatedAt: new Date() } });
  if (result.matchedCount === 0) throw new HttpError(404, 'This person is not in the trip any more.');
  res.json({ trip: await loadTripForMember(db, req.trip._id, req.user.uid) });
}

// What this person still owes in this trip (positive paise), from every bill
// and settlement. 0 if they owe nothing (or are owed money).
async function owedBy(db, tripId, uid) {
  const rows = await db
    .collection('expenses')
    .find({ tripId, $or: [{ paidBy: uid }, { 'splits.uid': uid }] }, { projection: { paidBy: 1, amount: 1, splits: 1 } })
    .toArray();
  const mine = balances(rows).get(uid) || 0;
  return mine < 0 ? -mine : 0;
}

// Who may call DELETE /members/:uid: the owner (for anyone), or a member for themselves (leaving).
// This is the role step of the guard chain for this one route.
export function ownerOrSelf(req, res, next) {
  const target = req.params.uid;
  if (target === req.user.uid) {
    if (req.role === 'owner') throw new HttpError(403, 'The owner cannot leave the trip. Delete the trip in Trip settings instead.');
    return next();
  }
  if (req.role !== 'owner') throw new HttpError(403, `Only the trip owner can remove people. You are a ${req.role} on this trip.`);
  next();
}

// DELETE /api/trips/:id/members/:uid
export async function removeMember(req, res) {
  const db = await getDb();
  const { uid } = req.valid.params;
  const leaving = uid === req.user.uid;
  const member = req.trip.members.find((m) => m.uid === uid);
  if (!member) throw new HttpError(404, 'This person is not in the trip any more.');

  const owes = await owedBy(db, req.trip._id, uid);
  if (owes > 0) {
    if (leaving) throw new HttpError(409, `You still owe ${formatRs(owes)} in this trip. Settle up first, then leave.`);
    const person = await db.collection('users').findOne({ firebaseUid: uid }, { projection: { name: 1 } });
    throw new HttpError(409, `${person?.name || 'This person'} still owes ${formatRs(owes)} in this trip. Settle up first, then remove them.`);
  }

  // The filter keeps the owner safe even if something above changes.
  const result = await db
    .collection('trips')
    .updateOne({ _id: req.trip._id, owner: { $ne: uid } }, { $pull: { members: { uid, role: { $ne: 'owner' } } }, $set: { updatedAt: new Date() } });
  if (result.modifiedCount === 0) throw new HttpError(404, 'This person is not in the trip any more.');
  if (leaving) return res.json({ left: true });
  res.json({ trip: await loadTripForMember(db, req.trip._id, req.user.uid) });
}
