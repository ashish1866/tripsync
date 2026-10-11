import { getDb } from '../config/db.js';
import { HttpError } from '../utils/httpError.js';
import { newItemId } from '../utils/ids.js';
import { MAX_ITEMS } from '../schemas/checklist.js';

// THE PACKING LIST, stored inside the trip: trips.checklist[].
//
// SAFE EDITS: every route changes ONE item with a single MongoDB update
// ($push, $pull, or $set on that item's own fields through an array filter).
// The list is never loaded, changed in memory and saved back, so an item or a
// tick another member saves at the same moment is never overwritten.

const GONE = 'This item is not on the list any more. Someone may have removed it; reload the page.';

const trips = async () => (await getDb()).collection('trips');

// The list as it is now, for the answer.
async function currentList(tripId) {
  const trip = await (await trips()).findOne({ _id: tripId }, { projection: { checklist: 1 } });
  return trip?.checklist || [];
}

// POST /api/trips/:id/checklist (owner, editor): { text }
export async function addItem(req, res) {
  const now = new Date();
  const item = { id: newItemId(), text: req.body.text, done: false, addedBy: req.user.uid, createdAt: now, doneBy: null, doneAt: null };
  // The filter also refuses a full list, inside the same update.
  const result = await (await trips()).updateOne(
    { _id: req.trip._id, [`checklist.${MAX_ITEMS - 1}`]: { $exists: false } },
    { $push: { checklist: item }, $set: { updatedAt: now } },
  );
  if (result.matchedCount === 0) {
    throw new HttpError(409, `The packing list already has ${MAX_ITEMS} items. Remove one before adding more.`);
  }
  res.status(201).json({ item, checklist: await currentList(req.trip._id) });
}

// PATCH /api/trips/:id/checklist/:itemId (owner, editor): { done: true | false }
// Records who packed it and when; unticking clears both.
export async function tickItem(req, res) {
  const { itemId } = req.valid.params;
  const { done } = req.body;
  const now = new Date();
  const set = done
    ? { 'checklist.$[i].done': true, 'checklist.$[i].doneBy': req.user.uid, 'checklist.$[i].doneAt': now }
    : { 'checklist.$[i].done': false, 'checklist.$[i].doneBy': null, 'checklist.$[i].doneAt': null };
  const result = await (await trips()).updateOne(
    { _id: req.trip._id, 'checklist.id': itemId },
    { $set: { ...set, updatedAt: now } },
    { arrayFilters: [{ 'i.id': itemId }] },
  );
  if (result.matchedCount === 0) throw new HttpError(404, GONE);
  res.json({ checklist: await currentList(req.trip._id) });
}

// DELETE /api/trips/:id/checklist/:itemId (owner, editor)
export async function deleteItem(req, res) {
  const { itemId } = req.valid.params;
  const result = await (await trips()).updateOne(
    { _id: req.trip._id, 'checklist.id': itemId },
    { $pull: { checklist: { id: itemId } }, $set: { updatedAt: new Date() } },
  );
  if (result.matchedCount === 0) throw new HttpError(404, GONE);
  res.json({ checklist: await currentList(req.trip._id) });
}
